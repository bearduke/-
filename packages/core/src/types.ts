/**
 * 执行小助手 — 全局类型定义
 * 对应 Python 版所有数据结构
 */

// ==================== LPR 相关 ====================

/** LPR 历史数据条目 */
export interface LprRecord {
  date: string;       // "YYYY-MM-DD"
  one_year: number;   // 一年期 LPR 百分比值，如 3.85
  five_year: number;  // 五年期 LPR 百分比值
}

/** LPR 分段计算结果 */
export interface LprSegment {
  start: string;
  end: string;
  rate: number;
  days: number;
}

// ==================== 利息计算相关 ====================

/** 利率类型 */
export type RateType = '一年期LPR分段' | '五年期LPR分段' | '固定利率';

/** 债权输入（用户填写） */
export interface ClaimInput {
  principal: number;
  rate_type: string;
  lpr_multiple: number;    // LPR 倍数，100 表示 1 倍
  fixed_rate: number;      // 固定利率百分比值
  days_per_year: number;   // 365 或 360
  start_date: string;
  end_date: string;
}

/** 债权内部状态（计算过程中使用） */
export interface ClaimState {
  principal: number;
  remaining_principal: number;
  rate_type: string;
  lpr_multiple: number;
  fixed_rate: number;
  days_per_year: number;
  start_date: string;
  end_date: string;
  general_interest: number;
  deducted_interest: number;
  interest_segments: InterestSegment[];
}

/** 利息分段明细 */
export interface InterestSegment {
  stage_idx: number;
  stage_start: string;
  stage_end: string;
  period_start: string;
  period_end: string;
  days: number;
  principal_at_start: number;
  interest: number;
  details: SegmentDetail[];
}

/** 分段计算明细 */
export interface SegmentDetail {
  period: string;
  days: number;
  lpr?: number;
  actual_rate?: number;
  rate?: number;
  interest: number;
  formula: string;
}

// ==================== 清偿相关 ====================

/** 清偿输入（用户填写） */
export interface PaymentInput {
  amount: number;
  date: string;
  deduct_order: string[];
}

/** 清偿结果 */
export interface PaymentResult {
  amount: number;
  date: string;
  deductions: { type: string; amount: number }[];
  unused: number;
  deduct_order: string[];
}

// ==================== 加倍部分延迟履行利息 ====================

export interface DelaySegment {
  stage_idx: number;
  stage_start: string;
  stage_end: string;
  period_start: string;
  period_end: string;
  days: number;
  principal_total: number;
  other_fees: number;
  delay_base: number;
  delay_interest: number;
  formula: string;
}

// ==================== 阶段记录 ====================

export interface PaymentAtEnd {
  idx: number;
  amount: number;
  data: PaymentInput;
}

export interface StageStartState {
  stage_idx: number;
  period: string;
  days: number;
  begin_principals: number[];
  begin_other: number;
  begin_litigation: number;
  begin_delay: number;
  interests_added: { idx: number; interest: number; details: SegmentDetail[] }[];
  delay_added: number;
}

export interface StageEndState {
  end_principals: number[];
  end_remaining_interest: number[];
  end_other: number;
  end_litigation: number;
  end_delay: number;
  payment_detail: PaymentResult | null;
}

export interface StageRecord {
  stage_info: { start: string; end: string; payment_at_end: PaymentAtEnd | null };
  start_state: StageStartState;
  end_state: StageEndState;
}

// ==================== 利息计算参数与结果 ====================

export interface InterestCalcParams {
  case_no: string;
  creditor: string;
  debtor: string;
  case_reason: string;
  id_card: string;
  exec_basis: string;
  other_fees: number;
  litigation_fee: number;
  interest_claim: number;
  due_date: string;
  claims: ClaimInput[];
  payments: PaymentInput[];
}

export interface InterestCalcResult {
  case_no: string;
  creditor: string;
  debtor: string;
  case_reason: string;
  id_card: string;
  exec_basis: string;
  other_fees: number;
  litigation_fee: number;
  interest_claim: number;
  due_date: string;
  claims: ClaimState[];
  payments: PaymentResult[];
  delay_segments: DelaySegment[];
  stage_records: StageRecord[];
  total_principal: number;
  total_general: number;
  total_remaining_principal: number;
  total_remaining_interest: number;
  remaining_other: number;
  remaining_litigation: number;
  remaining_delay: number;
  total_delay: number;
  deducted_delay: number;
  total_paid_principal: number;
  total_deducted_interest: number;
  total_payments_sum: number;
  debt_total: number;
  debt_interest_total: number;
  remaining_interest_total: number;
  remaining_debt_total: number;
  exec_base: number;
  exec_fee: number;
  claimed_total: number;
}

// ==================== 分配方案 ====================

/** 债权顺位 */
export type ClaimType = '第一顺位' | '第二顺位' | '第三顺位' | '第四顺位';

/** 分配方案案件 */
export interface DistributionCase {
  id: number;
  case_no: string;
  creditor: string;
  debtor: string;
  id_card: string;
  exec_basis: string;
  case_reason: string;
  principal: number;
  interest: number;
  litigation_fee: number;
  claim_priority: string;  // 债权顺位：第一顺位/第二顺位/第三顺位/第四顺位
  claim_type: string;       // 债权类型：执行费用（共益）/船舶航空器优先权/.../普通债权/...
  boost_ratio: number;      // 提高比例（百分比），默认0
}

/** 分配方案结果 */
export interface DistributionResult {
  case: DistributionCase;
  distributed: number;
  exec_fee: number;
  actual: number;
}

/** 分配方案计算返回 */
export interface DistributionCalcOutput {
  results: DistributionResult[];
  remaining: number;
}

// ==================== 案件数据库 ====================

export interface CaseRecord {
  case_no: string;
  creditor: string;
  debtor: string;
  case_reason: string;
  id_card: string;
  exec_basis: string;
  other_fees?: number;
  litigation_fee?: number;
  interest_claim?: number;
  due_date?: string;
  principal?: number;
  interest?: number;
  claim_type?: string;
  calc_result?: InterestCalcResult;
  last_modified?: string;
}
