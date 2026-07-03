/**
 * 利息计算主逻辑
 * 移植自 model.py L323-692 calculate_interest
 *
 * 这是整个应用最核心的函数，约 370 行 Python 逻辑
 * 包含：分段生成 → 一般债务利息 → 加倍部分延迟履行利息 → 清偿抵扣 → 汇总
 */
import type {
  InterestCalcParams,
  InterestCalcResult,
  ClaimState,
  PaymentInput,
  PaymentResult,
  DelaySegment,
  StageRecord,
  StageStartState,
  StageEndState,
  SegmentDetail,
  LprRecord,
} from './types';
import { parseMoney, formatMoney, parseDate, formatDate, daysBetween, addDays } from './utils';
import { getLprSegmentsOptimized } from './lprSegments';
import { calcExecutionFee } from './executionFee';

/**
 * 从抵扣顺序项中提取债权索引
 * 对应 Python: extract_claim_index (model.py L562-568)
 * "一般债务利息(债权1)" -> 0, "债权本金(债权2)" -> 1
 */
function extractClaimIndex(item: string): number | null {
  const match = item.match(/(\d+)/);
  if (match) {
    const idx = parseInt(match[1]) - 1;
    if (idx >= 0) {
      return idx;
    }
  }
  return null;
}

/**
 * 生成默认抵扣顺序
 * 对应 Python: model.py L552-557
 */
function getDefaultDeductOrder(claimsLength: number): string[] {
  const order: string[] = ['诉讼费用'];
  for (let i = 0; i < claimsLength; i++) {
    order.push(`一般债务利息(债权${i + 1})`);
  }
  for (let i = 0; i < claimsLength; i++) {
    order.push(`债权本金(债权${i + 1})`);
  }
  order.push('其他费用', '加倍部分延迟履行利息');
  return order;
}

/**
 * 核心利息计算
 * 对应 Python: model.py L323-692 calculate_interest
 *
 * @param params 计算参数
 * @param lprData 可选，自定义 LPR 数据
 * @returns 计算结果，无债权时返回 null
 */
export function calculateInterest(
  params: InterestCalcParams,
  lprData?: LprRecord[]
): InterestCalcResult | null {
  const caseNo = params.case_no || '';
  const creditor = params.creditor || '';
  const debtor = params.debtor || '';
  const caseReason = params.case_reason || '';
  const idCard = params.id_card || '';
  const execBasis = params.exec_basis || '';
  const otherFees = parseMoney(params.other_fees);
  const litigationFee = parseMoney(params.litigation_fee);
  const interestClaim = parseMoney(params.interest_claim);
  const dueDate = params.due_date || '';

  // 1. 解析债权
  const claims: ClaimState[] = [];
  let totalPrincipal = 0;

  for (const claimData of params.claims || []) {
    const principal = parseMoney(claimData.principal);
    if (principal <= 0) continue;

    const daysPerYear = parseInt(String(claimData.days_per_year)) || 365;

    claims.push({
      principal,
      remaining_principal: principal,
      rate_type: claimData.rate_type || '一年期LPR分段',
      lpr_multiple: parseMoney(claimData.lpr_multiple),
      fixed_rate: parseMoney(claimData.fixed_rate),
      days_per_year: daysPerYear,
      start_date: claimData.start_date || '',
      end_date: claimData.end_date || '',
      general_interest: 0,
      deducted_interest: 0,
      interest_segments: [],
    });
    totalPrincipal += principal;
  }

  if (claims.length === 0) return null;

  // 2. 收集时间节点
  const timePoints = new Set<string>();
  for (const c of claims) {
    timePoints.add(c.start_date);
    timePoints.add(c.end_date);
  }
  timePoints.add(dueDate);
  for (const pData of params.payments || []) {
    const payAmount = parseMoney(pData.amount);
    if (payAmount > 0) {
      timePoints.add(pData.date || '');
    }
  }

  const sortedPoints = Array.from(timePoints).sort((a, b) => {
    return parseDate(a).getTime() - parseDate(b).getTime();
  });

  // 3. 生成 stages
  const stages: { start: string; end: string; payment_at_end: { idx: number; amount: number; data: PaymentInput } | null }[] = [];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    stages.push({
      start: sortedPoints[i],
      end: sortedPoints[i + 1],
      payment_at_end: null,
    });
  }

  // 4. 匹配 payment_at_end
  for (let pIdx = 0; pIdx < (params.payments || []).length; pIdx++) {
    const pData = params.payments![pIdx];
    const payDate = pData.date || '';
    const payAmount = parseMoney(pData.amount);
    if (payAmount > 0) {
      for (const stage of stages) {
        if (stage.end === payDate) {
          stage.payment_at_end = { idx: pIdx, amount: payAmount, data: pData };
        }
      }
    }
  }

  // 5. 统一修正：每个中间节点已在上一段作为结束日计算，下一段应从次日开始
  for (let i = 1; i < stages.length; i++) {
    const prevEnd = stages[i - 1].end;
    stages[i].start = addDays(prevEnd, 1);
  }

  // 6. 初始化累计变量
  let remainingLitigation = litigationFee;
  let remainingOther = otherFees;
  let remainingDelay = 0;
  let totalDelay = 0;
  let deductedDelay = 0;
  const paymentResults: PaymentResult[] = [];
  const delaySegments: DelaySegment[] = [];
  const stageRecords: StageRecord[] = [];

  // 7. 按阶段计算
  for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
    const stage = stages[stageIdx];
    const stageStart = stage.start;
    const stageEnd = stage.end;
    const stageDays = daysBetween(stageStart, stageEnd) + 1;

    if (stageDays <= 0) continue;

    const sStartDt = parseDate(stageStart);
    const sEndDt = parseDate(stageEnd);

    // 7a. 一般债务利息
    const stageClaimInterests: { idx: number; interest: number; details: SegmentDetail[] }[] = [];

    for (let ci = 0; ci < claims.length; ci++) {
      const c = claims[ci];
      const cStart = parseDate(c.start_date);
      const cEnd = parseDate(c.end_date);
      const actualStart = new Date(Math.max(cStart.getTime(), sStartDt.getTime()));
      const actualEnd = new Date(Math.min(cEnd.getTime(), sEndDt.getTime()));

      // 边界条件：actual_start > actual_end 时利息为 0（注意是 > 不是 >=）
      if (actualStart > actualEnd) {
        stageClaimInterests.push({ idx: ci, interest: 0, details: [] });
        continue;
      }

      const actualStartStr = formatDate(actualStart);
      const actualEndStr = formatDate(actualEnd);

      const principalForCalc = c.remaining_principal;
      let stageInterest = 0;
      const stageDetails: SegmentDetail[] = [];
      const daysPerYear = c.days_per_year;

      if (c.rate_type.includes('LPR')) {
        let lprMultiple = c.lpr_multiple / 100;
        if (lprMultiple <= 0) lprMultiple = 1.0;
        const lprTypeKey = c.rate_type.includes('五年期') ? '五年期LPR分段' : '一年期LPR分段';
        const segments = getLprSegmentsOptimized(actualStartStr, actualEndStr, lprTypeKey, lprData);

        for (const seg of segments) {
          const rate = seg.rate * lprMultiple / 100;
          const interest = principalForCalc * rate * seg.days / daysPerYear;
          stageInterest += interest;
          stageDetails.push({
            period: `${seg.start} 至 ${seg.end}`,
            days: seg.days,
            lpr: seg.rate,
            actual_rate: seg.rate * lprMultiple,
            interest,
            formula: `${formatMoney(principalForCalc)} × ${(seg.rate * lprMultiple).toFixed(2)}% ÷ ${daysPerYear} × ${seg.days} = ${formatMoney(interest)}`,
          });
        }
      } else {
        // 固定利率
        const fixedRate = c.fixed_rate / 100;
        const actualDays = daysBetween(actualStart, actualEnd) + 1;
        stageInterest = principalForCalc * fixedRate * actualDays / daysPerYear;
        stageDetails.push({
          period: `${actualStartStr} 至 ${actualEndStr}`,
          days: actualDays,
          rate: c.fixed_rate,
          interest: stageInterest,
          formula: `${formatMoney(principalForCalc)} × ${c.fixed_rate}% ÷ ${daysPerYear} × ${actualDays} = ${formatMoney(stageInterest)}`,
        });
      }

      c.general_interest += stageInterest;
      c.interest_segments.push({
        stage_idx: stageIdx,
        stage_start: stageStart,
        stage_end: stageEnd,
        period_start: actualStartStr,
        period_end: actualEndStr,
        days: daysBetween(actualStart, actualEnd) + 1,
        principal_at_start: principalForCalc,
        interest: stageInterest,
        details: stageDetails,
      });
      stageClaimInterests.push({ idx: ci, interest: stageInterest, details: stageDetails });
    }

    // 7b. 加倍部分延迟履行利息
    const dueDt = parseDate(dueDate);
    let stageDelay = 0;
    if (sEndDt > dueDt) {
      const delayStartDt = new Date(Math.max(sStartDt.getTime(), dueDt.getTime()));
      const delayEndDt = sEndDt;
      let delayDays = daysBetween(delayStartDt, delayEndDt);
      // 仅履行期限届满日不计入延迟利息；后续分段的第一天并非届满日，应纳入计算
      if (delayStartDt.getTime() !== dueDt.getTime()) {
        delayDays += 1;
      }
      if (delayDays > 0) {
        const currentPrincipalTotal = claims.reduce((sum, cc) => sum + cc.remaining_principal, 0);
        const delayBase = currentPrincipalTotal + remainingOther;
        stageDelay = delayBase * 0.000175 * delayDays;
        remainingDelay += stageDelay;
        totalDelay += stageDelay;
        delaySegments.push({
          stage_idx: stageIdx,
          stage_start: stageStart,
          stage_end: stageEnd,
          period_start: formatDate(delayStartDt),
          period_end: formatDate(delayEndDt),
          days: delayDays,
          principal_total: currentPrincipalTotal,
          other_fees: remainingOther,
          delay_base: delayBase,
          delay_interest: stageDelay,
          formula: `(${formatMoney(currentPrincipalTotal)} + ${formatMoney(remainingOther)}) × 0.0175% × ${delayDays} = ${formatMoney(stageDelay)}`,
        });
      }
    }

    // 7c. 记录阶段起始状态
    const stageStartState: StageStartState = {
      stage_idx: stageIdx,
      period: `${stageStart} → ${stageEnd}`,
      days: stageDays,
      begin_principals: claims.map(c => c.remaining_principal),
      begin_other: remainingOther,
      begin_litigation: remainingLitigation,
      begin_delay: remainingDelay,
      interests_added: stageClaimInterests,
      delay_added: stageDelay,
    };

    // 7d. 清偿抵扣
    let paymentDetail: PaymentResult | null = null;
    if (stage.payment_at_end) {
      const pmt = stage.payment_at_end;
      const payAmount = pmt.amount;
      const pData = pmt.data;

      let deductOrder = pData.deduct_order || [];
      if (deductOrder.length === 0) {
        deductOrder = getDefaultDeductOrder(claims.length);
      }

      let remainingPayment = payAmount;
      const paymentDeductions: { type: string; amount: number }[] = [];

      for (const item of deductOrder) {
        if (remainingPayment <= 0) break;

        if (item === '诉讼费用') {
          const deduct = Math.min(remainingLitigation, remainingPayment);
          if (deduct > 0) {
            remainingLitigation -= deduct;
            remainingPayment -= deduct;
            paymentDeductions.push({ type: '诉讼费用', amount: deduct });
          }
        } else if (item === '其他费用') {
          const deduct = Math.min(remainingOther, remainingPayment);
          if (deduct > 0) {
            remainingOther -= deduct;
            remainingPayment -= deduct;
            paymentDeductions.push({ type: '其他费用', amount: deduct });
          }
        } else if (item === '加倍部分延迟履行利息') {
          const deduct = Math.min(remainingDelay, remainingPayment);
          if (deduct > 0) {
            remainingDelay -= deduct;
            deductedDelay += deduct;
            remainingPayment -= deduct;
            paymentDeductions.push({ type: '加倍部分延迟履行利息', amount: deduct });
          }
        } else if (item.startsWith('一般债务利息')) {
          const ci = extractClaimIndex(item);
          if (ci !== null && ci < claims.length) {
            const remainingInterest = claims[ci].general_interest - claims[ci].deducted_interest;
            const deduct = Math.min(remainingInterest, remainingPayment);
            if (deduct > 0) {
              claims[ci].deducted_interest += deduct;
              remainingPayment -= deduct;
              paymentDeductions.push({ type: item, amount: deduct });
            }
          }
        } else if (item.startsWith('债权本金')) {
          const ci = extractClaimIndex(item);
          if (ci !== null && ci < claims.length) {
            const deduct = Math.min(claims[ci].remaining_principal, remainingPayment);
            if (deduct > 0) {
              claims[ci].remaining_principal -= deduct;
              remainingPayment -= deduct;
              paymentDeductions.push({ type: item, amount: deduct });
            }
          }
        }
      }

      paymentDetail = {
        amount: payAmount,
        date: stageEnd,
        deductions: paymentDeductions,
        unused: remainingPayment,
        deduct_order: deductOrder,
      };
      paymentResults.push(paymentDetail);
    }

    // 7e. 记录阶段结束状态
    const stageEndState: StageEndState = {
      end_principals: claims.map(c => c.remaining_principal),
      end_remaining_interest: claims.map((_, i) => claims[i].general_interest - claims[i].deducted_interest),
      end_other: remainingOther,
      end_litigation: remainingLitigation,
      end_delay: remainingDelay,
      payment_detail: paymentDetail,
    };
    stageRecords.push({
      stage_info: stage,
      start_state: stageStartState,
      end_state: stageEndState,
    });
  }

  // 8. 汇总
  const totalGeneral = claims.reduce((sum, c) => sum + c.general_interest, 0);
  const totalRemainingPrincipal = claims.reduce((sum, c) => sum + c.remaining_principal, 0);
  const totalPaidPrincipal = totalPrincipal - totalRemainingPrincipal;
  const totalDeductedInterest = claims.reduce((sum, c) => sum + c.deducted_interest, 0);
  const totalRemainingInterest = totalGeneral - totalDeductedInterest;

  const totalPaymentsSum = paymentResults.length > 0
    ? paymentResults.reduce((sum, p) => sum + p.amount, 0)
    : 0;
  const debtTotal = totalPrincipal + totalGeneral + otherFees + litigationFee + totalDelay;
  const debtInterestTotal = totalGeneral + totalDelay;
  const remainingInterestTotal = totalRemainingInterest + remainingDelay;
  const remainingDebtTotal = debtTotal - totalPaymentsSum;

  const execBase = debtTotal - litigationFee;
  const execFee = Math.floor(calcExecutionFee(execBase));
  const claimedTotal = totalPrincipal + otherFees + litigationFee + interestClaim;

  return {
    case_no: caseNo,
    creditor,
    debtor,
    case_reason: caseReason,
    id_card: idCard,
    exec_basis: execBasis,
    other_fees: otherFees,
    litigation_fee: litigationFee,
    interest_claim: interestClaim,
    due_date: dueDate,
    claims,
    payments: paymentResults,
    delay_segments: delaySegments,
    stage_records: stageRecords,
    total_principal: totalPrincipal,
    total_general: totalGeneral,
    total_remaining_principal: totalRemainingPrincipal,
    total_remaining_interest: totalRemainingInterest,
    remaining_other: remainingOther,
    remaining_litigation: remainingLitigation,
    remaining_delay: remainingDelay,
    total_delay: totalDelay,
    deducted_delay: deductedDelay,
    total_paid_principal: totalPaidPrincipal,
    total_deducted_interest: totalDeductedInterest,
    total_payments_sum: totalPaymentsSum,
    debt_total: debtTotal,
    debt_interest_total: debtInterestTotal,
    remaining_interest_total: remainingInterestTotal,
    remaining_debt_total: remainingDebtTotal,
    exec_base: execBase,
    exec_fee: execFee,
    claimed_total: claimedTotal,
  };
}
