/**
 * 计算结果文本格式化
 * 移植自 controller.py L1523-1636 _display_interest_result
 *
 * 生成完整的计算过程文本，包含案件信息、阶段明细、最终汇总
 */
import type { InterestCalcResult } from './types';
import { formatMoney, parseDate } from './utils';

/**
 * 格式化利息计算结果为文本
 * 对应 Python: controller.py L1523-1636 _display_interest_result
 *
 * @param calc 利息计算结果
 * @returns 格式化的文本
 */
export function formatInterestResult(calc: InterestCalcResult | null): string {
  if (!calc) return '';

  const claims = calc.claims;
  const eq60 = '='.repeat(60);
  const eq50 = '='.repeat(50);

  // 收集时间节点
  const timePoints = new Set<string>();
  timePoints.add(calc.due_date);
  for (const c of claims) {
    timePoints.add(c.start_date);
    timePoints.add(c.end_date);
  }
  for (const p of calc.payments) {
    timePoints.add(p.date);
  }
  const sortedPoints = Array.from(timePoints).sort((a, b) => {
    return parseDate(a).getTime() - parseDate(b).getTime();
  });

  let text = '';
  text += `【利息计算结果】\n\n`;
  text += `案号: ${calc.case_no}\n`;
  text += `申请执行人: ${calc.creditor}\n`;
  text += `被执行人: ${calc.debtor}\n`;
  text += `案由: ${calc.case_reason}\n`;
  text += `证件号: ${calc.id_card}\n`;
  text += `执行依据: ${calc.exec_basis}\n`;
  text += `履行期限届满之日: ${calc.due_date}\n\n`;
  text += `${eq60}\n`;
  text += '计算过程：按时间阶段滚动计算，清偿后立即更新剩余本金及各项费用，\n';
  text += '下一阶段基于更新后的状态继续计算。\n';
  text += 'LPR分段优化：仅在LPR利率实际变动时分段，减少不必要的细分。\n';
  text += `${eq60}\n\n`;
  text += `时间节点: ${sortedPoints.join(' → ')}\n`;
  text += `共 ${calc.stage_records.length} 个有效阶段\n\n`;

  // 逐阶段输出
  for (const sRecord of calc.stage_records) {
    const si = sRecord.start_state;
    const ei = sRecord.end_state;

    text += `${eq50}\n`;
    text += `【阶段 ${si.stage_idx + 1}】${si.period}  (${si.days}天)\n`;
    text += `${eq50}\n`;

    // 阶段开始时债务状态
    text += '阶段开始时债务状态:\n';
    for (let ci = 0; ci < claims.length; ci++) {
      text += `  债权${ci + 1}: 剩余本金 ${formatMoney(si.begin_principals[ci])}元\n`;
    }
    text += `  其他费用: ${formatMoney(si.begin_other)}元\n`;
    text += `  诉讼费用: ${formatMoney(si.begin_litigation)}元\n\n`;

    // 本阶段新增一般债务利息
    const hasInterest = si.interests_added.some(it => it.interest > 0);
    if (hasInterest) {
      text += '本阶段新增一般债务利息:\n';
      for (const it of si.interests_added) {
        if (it.interest > 0) {
          const ci = it.idx;
          text += `  债权${ci + 1}计算公式:\n`;
          for (const d of it.details) {
            text += `    ${d.formula}\n`;
          }
          text += `    本阶段合计: ${formatMoney(it.interest)}元\n`;
        }
      }
    } else {
      text += '本阶段无新增一般债务利息。\n';
    }

    // 加倍部分延迟履行利息
    if (si.delay_added > 0) {
      text += `\n本阶段新增加倍部分延迟履行利息: ${formatMoney(si.delay_added)}元`;
      const dseg = calc.delay_segments.find(ds => ds.stage_idx === si.stage_idx);
      if (dseg) {
        text += `\n  计算公式: ${dseg.formula}`;
      }
      text += '\n';
    } else {
      text += '本阶段无新增加倍部分延迟履行利息。\n';
    }

    // 清偿抵扣
    if (ei.payment_detail) {
      const pd = ei.payment_detail;
      text += `\n▶ 阶段末清偿: ${formatMoney(pd.amount)}元 (${pd.date})\n`;
      for (const ded of pd.deductions) {
        text += `  抵扣 ${ded.type}: ${formatMoney(ded.amount)}元\n`;
      }
      text += '\n清偿后剩余债务:\n';
      for (let ci = 0; ci < claims.length; ci++) {
        text += `  债权${ci + 1}: 剩余本金 ${formatMoney(ei.end_principals[ci])}元, 剩余利息 ${formatMoney(ei.end_remaining_interest[ci])}元\n`;
      }
      text += `  其他费用: ${formatMoney(ei.end_other)}元\n`;
      text += `  诉讼费用: ${formatMoney(ei.end_litigation)}元\n`;
      text += `  加倍部分延迟履行利息: ${formatMoney(ei.end_delay)}元\n`;
    } else {
      text += '\n阶段末无清偿，债务状态保持不变。\n';
    }

    text += '\n';
  }

  // 最终汇总
  text += `${eq60}\n`;
  text += '最终债务汇总\n';
  text += `${eq60}\n`;
  for (let ci = 0; ci < claims.length; ci++) {
    const c = claims[ci];
    text += `债权${ci + 1}: 原始本金 ${formatMoney(c.principal)}元, 剩余本金 ${formatMoney(c.remaining_principal)}元\n`;
    text += `  累计一般债务利息 ${formatMoney(c.general_interest)}元, 已抵扣 ${formatMoney(c.deducted_interest)}元, 剩余 ${formatMoney(c.general_interest - c.deducted_interest)}元\n`;
  }
  text += `其他费用: 原始 ${formatMoney(calc.other_fees)}元 → 剩余 ${formatMoney(calc.remaining_other)}元\n`;
  text += `诉讼费用: 原始 ${formatMoney(calc.litigation_fee)}元 → 剩余 ${formatMoney(calc.remaining_litigation)}元\n`;
  text += `加倍部分延迟履行利息: 累计 ${formatMoney(calc.total_delay)}元, 已抵扣 ${formatMoney(calc.deducted_delay)}元, 剩余 ${formatMoney(calc.remaining_delay)}元\n`;

  text += `\n${eq60}\n`;
  text += '债务金额统计\n';
  text += `${eq60}\n`;
  text += `债务总金额 = ${formatMoney(calc.total_principal)}(本金) + ${formatMoney(calc.total_general)}(一般利息) + ${formatMoney(calc.other_fees)}(其他费用) + ${formatMoney(calc.litigation_fee)}(诉讼费用) + ${formatMoney(calc.total_delay)}(加倍部分延迟利息)\n`;
  text += `         = ${formatMoney(calc.debt_total)}元\n\n`;
  text += `债务利息总金额 = ${formatMoney(calc.debt_interest_total)}元\n\n`;
  text += `尚待清偿利息总金额 = ${formatMoney(calc.remaining_interest_total)}元\n\n`;
  if (calc.total_payments_sum > 0) {
    text += `清偿金额之和 = ${formatMoney(calc.total_payments_sum)}元\n`;
  }
  text += `尚待清偿债务总金额 = ${formatMoney(calc.remaining_debt_total)}元\n`;

  text += `\n${eq60}\n`;
  text += '执行费计算\n';
  text += `${eq60}\n`;
  text += `执行费计算基数 = ${formatMoney(calc.exec_base)}元\n`;
  text += `执行费 = ${formatMoney(calc.exec_fee)}元（直接舍去小数）\n`;

  return text;
}

/**
 * 格式化分配方案结果为文本
 * 用于分配方案预览
 */
export function formatDistributionResult(
  results: { case: { case_no: string; creditor: string; principal: number; interest: number; litigation_fee: number; claim_priority: string; claim_type: string; boost_ratio: number }; distributed: number; exec_fee: number; actual: number }[],
  remaining: number,
  totalAmount: number
): string {
  if (!results || results.length === 0) {
    return '暂无分配结果，请先添加案件并设置分配总金额。';
  }

  const eq50 = '='.repeat(50);
  let text = '';
  text += `【分配方案结果】\n\n`;
  text += `分配总金额: ${formatMoney(totalAmount)}元\n\n`;
  text += `${eq50}\n`;

  for (const r of results) {
    const c = r.case;
    const claimAmount = c.principal + c.interest + c.litigation_fee;
    text += `案号: ${c.case_no}\n`;
    text += `申请执行人: ${c.creditor}\n`;
    text += `债权顺位: ${c.claim_priority}\n`;
    text += `债权类型: ${c.claim_type}\n`;
    if (c.boost_ratio && c.boost_ratio > 0) {
      text += `提高比例: ${c.boost_ratio}%\n`;
    }
    text += `申请执行标的金额: ${formatMoney(claimAmount)}元\n`;
    text += `  其中: 本金 ${formatMoney(c.principal)}元, 利息 ${formatMoney(c.interest)}元, 诉讼费 ${formatMoney(c.litigation_fee)}元\n`;
    text += `本案分配金额: ${formatMoney(r.distributed)}元\n`;
    text += `执行费: ${formatMoney(r.exec_fee)}元\n`;
    text += `实际发放金额: ${formatMoney(r.actual)}元\n`;
    text += `${eq50}\n`;
  }

  text += `\n剩余未分配金额: ${formatMoney(remaining)}元\n`;

  return text;
}
