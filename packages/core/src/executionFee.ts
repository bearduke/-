/**
 * 执行费计算
 * 移植自 utils.py L407-420 calc_execution_fee
 *
 * 5 档阶梯费率，直接舍去小数（Python int() -> JS Math.floor）
 */

/**
 * 计算执行费
 * @param amount 执行费计算基数
 * @returns 执行费金额（整数，向下取整）
 */
export function calcExecutionFee(amount: number): number {
  if (amount <= 0) {
    return 0;
  }
  if (amount <= 10000) {
    return 50;
  } else if (amount <= 500000) {
    return Math.floor(50 + (amount - 10000) * 0.015);
  } else if (amount <= 5000000) {
    return Math.floor(50 + 490000 * 0.015 + (amount - 500000) * 0.01);
  } else if (amount <= 10000000) {
    return Math.floor(50 + 490000 * 0.015 + 4500000 * 0.01 + (amount - 5000000) * 0.005);
  } else {
    return Math.floor(50 + 490000 * 0.015 + 4500000 * 0.01 + 5000000 * 0.005 + (amount - 10000000) * 0.001);
  }
}
