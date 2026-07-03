/**
 * 分配方案计算
 * 移植自 model.py L15-237 DistributionModel
 *
 * 按顺位分配执行款项，优先扣除诉讼费，按比例分配剩余金额
 * 支持提高比例（boost_ratio）：按比例分配时，债权本金+利息加成对应比例
 */
import type {
  DistributionCase,
  DistributionResult,
  DistributionCalcOutput,
  InterestCalcResult,
} from './types';
import { calcExecutionFee } from './executionFee';
import { parseMoney } from './utils';

/** 顺位映射 */
const ORDER_MAP: Record<string, number> = {
  '第一顺位': 1, '第一顺位债权': 1,
  '第二顺位': 2, '第二顺位债权': 2,
  '第三顺位': 3, '第三顺位债权': 3,
  '第四顺位': 4, '第四顺位债权': 4,
};

/**
 * 计算分配方案
 * 对应 Python: model.py L52-126 calculate_distribution
 *
 * @param cases 案件列表
 * @param totalAmount 分配总金额
 * @returns 分配结果和剩余金额
 */
export function calculateDistribution(
  cases: DistributionCase[],
  totalAmount: number
): DistributionCalcOutput {
  if (totalAmount <= 0 || !cases || cases.length === 0) {
    return { results: [], remaining: 0 };
  }

  const results: DistributionResult[] = cases.map(c => ({
    case: c,
    distributed: 0,
    exec_fee: 0,
    actual: 0,
  }));

  let remaining = totalAmount;

  // 1. 先按比例扣除诉讼费
  const totalLitigation = cases.reduce((sum, c) => sum + c.litigation_fee, 0);
  if (totalLitigation > 0) {
    if (remaining >= totalLitigation) {
      for (const r of results) {
        r.actual = r.case.litigation_fee;
      }
      remaining -= totalLitigation;
    } else {
      const ratio = remaining / totalLitigation;
      for (const r of results) {
        r.actual = r.case.litigation_fee * ratio;
      }
      remaining = 0;
      return { results, remaining };
    }
  }

  // 2. 按顺位分配
  const debtOrder = ['第一顺位', '第二顺位', '第三顺位', '第四顺位'];

  // 预先确定哪些顺位有案件（用于判断是否存在下一顺位）
  const activePriorities = debtOrder.filter(
    p => results.some(r => (ORDER_MAP[r.case.claim_priority] || 99) === ORDER_MAP[p])
  );

  for (let pIdx = 0; pIdx < activePriorities.length; pIdx++) {
    const debtType = activePriorities[pIdx];
    const currentResults = results.filter(
      r => (ORDER_MAP[r.case.claim_priority] || 99) === ORDER_MAP[debtType]
    );
    if (currentResults.length === 0) continue;

    // 实际债权金额（本金+利息）
    const totalActualClaim = currentResults.reduce(
      (sum, r) => sum + r.case.principal + r.case.interest, 0
    );
    // 加成后有效债权金额（用于按比例分配时的权重）
    const totalEffectiveClaim = currentResults.reduce(
      (sum, r) => {
        const base = r.case.principal + r.case.interest;
        const boost = 1 + (r.case.boost_ratio || 0) / 100;
        return sum + base * boost;
      }, 0
    );

    if (remaining <= 0 || totalActualClaim === 0) continue;

    // 是否存在下一顺位
    const hasNextPriority = pIdx < activePriorities.length - 1;

    if (remaining >= totalActualClaim) {
      // 资金充足，每件按实际债权全额分配（提高比例不生效）
      // 计算当前顺位的执行费总额
      const totalExecFee = currentResults.reduce(
        (sum, r) => sum + calcExecutionFee(r.case.principal + r.case.interest), 0
      );

      // 当存在下一顺位，且资金足以覆盖"债权+执行费"时
      // 执行费不从分配金额中扣除（债权人拿全额），而是从总池子单独扣除
      const feeSeparateDeduction =
        hasNextPriority && remaining >= totalActualClaim + totalExecFee;

      for (const r of currentResults) {
        const amount = r.case.principal + r.case.interest;
        r.distributed = amount;
        r.exec_fee = calcExecutionFee(amount);
        if (feeSeparateDeduction) {
          // 执行费不从分配金额中扣除，实际发放金额=诉讼费+债权全额
          r.actual = r.case.litigation_fee + amount;
        } else {
          // 原逻辑：执行费从分配金额中扣除
          r.actual = r.case.litigation_fee + (amount - r.exec_fee);
        }
      }

      if (feeSeparateDeduction) {
        // 执行费单独从总池子扣除，留给下一顺位的金额相应减少
        remaining -= totalActualClaim + totalExecFee;
      } else {
        remaining -= totalActualClaim;
      }
    } else {
      // 资金不足，按加成后比例分配
      const ratio = remaining / totalEffectiveClaim;
      for (const r of currentResults) {
        const baseAmount = r.case.principal + r.case.interest;
        const effectiveAmount = baseAmount * (1 + (r.case.boost_ratio || 0) / 100);
        const amount = effectiveAmount * ratio;
        r.distributed = amount;
        r.exec_fee = calcExecutionFee(amount);
        r.actual = r.case.litigation_fee + (amount - r.exec_fee);
      }
      remaining = 0;
      break;
    }
  }

  return { results, remaining };
}

/**
 * 从利息计算结果中提取本金、利息、诉讼费
 * 对应 Python: model.py L128-146 get_form_data_from_calc
 */
export function getFormDataFromCalc(
  calcResult: InterestCalcResult | null
): { principal: number; interest: number; litigation_fee: number } {
  if (calcResult) {
    return {
      principal: Math.round((calcResult.total_remaining_principal + calcResult.remaining_other) * 100) / 100,
      interest: Math.round(calcResult.total_remaining_interest * 100) / 100,
      litigation_fee: Math.round(calcResult.remaining_litigation * 100) / 100,
    };
  }
  return { principal: 0, interest: 0, litigation_fee: 0 };
}

/**
 * 规范化债权顺位
 * 对应 Python: model.py L226-235
 */
export function normalizeClaimPriority(claimPriority: string): string {
  if (claimPriority.includes('第一')) return '第一顺位';
  if (claimPriority.includes('第二')) return '第二顺位';
  if (claimPriority.includes('第三')) return '第三顺位';
  if (claimPriority.includes('第四')) return '第四顺位';
  return '第一顺位';
}

/**
 * 将 Excel 行字典转换为案件数据
 * 对应 Python: model.py L207-237 import_excel_row
 */
export function importExcelRow(rowDict: Record<string, unknown>): DistributionCase {
  const claimPriority = normalizeClaimPriority(String(rowDict['债权顺位'] || rowDict['债权类型'] || '第一顺位'));
  return {
    id: 0,
    case_no: String(rowDict['案号'] || ''),
    creditor: String(rowDict['债权人'] || ''),
    debtor: String(rowDict['债务人'] || ''),
    id_card: String(rowDict['证件号（债权人）'] || rowDict['证件号'] || ''),
    exec_basis: String(rowDict['执行依据'] || ''),
    case_reason: String(rowDict['案由'] || ''),
    principal: parseMoney(rowDict['本金']),
    interest: parseMoney(rowDict['利息']),
    litigation_fee: parseMoney(rowDict['诉讼费']),
    claim_priority: claimPriority,
    claim_type: String(rowDict['债权类型'] || '普通债权'),
    boost_ratio: parseMoney(rowDict['提高比例']),
  };
}
