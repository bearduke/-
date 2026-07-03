/**
 * 执行小助手 — 跨端共享计算引擎
 * 统一导出所有模块
 */

// 类型定义
export * from './types';

// LPR 数据
export { LPR_DATA } from './lprData';

// 工具函数
export {
  parseDate,
  formatDate,
  addDays,
  daysBetween,
  formatMoney,
  parseMoney,
  toChineseDate,
} from './utils';

// 执行费计算
export { calcExecutionFee } from './executionFee';

// LPR 分段算法
export { getLprSegmentsOptimized } from './lprSegments';

// 利息计算主逻辑
export { calculateInterest } from './interestCalc';

// 分配方案计算
export {
  calculateDistribution,
  getFormDataFromCalc,
  normalizeClaimPriority,
  importExcelRow,
} from './distributionCalc';

// 简易计算器
export { calculateExpression } from './calculator';

// 结果格式化
export {
  formatInterestResult,
  formatDistributionResult,
} from './resultFormatter';
