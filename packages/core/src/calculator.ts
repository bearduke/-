/**
 * 简易计算器
 * 移植自 model.py L695-721 SimpleCalculator.calculate
 *
 * 安全的表达式求值，仅允许数字和四则运算符
 */
import { calcExecutionFee } from './executionFee';

/**
 * 计算表达式值
 * 支持四则运算和括号，支持 "执行费(金额)" 语法
 * @param expr 表达式字符串
 * @returns 计算结果
 */
export function calculateExpression(expr: string): number {
  if (!expr || !expr.trim()) {
    return 0;
  }

  let expression = expr.trim();

  // 处理 "执行费" 关键字：替换为对应金额的执行费计算
  // Python版用正则匹配 执行费(数字) 格式
  expression = expression.replace(/执行费\s*\(?\s*([\d.]+)\s*\)?/g, (_match, numStr) => {
    const num = parseFloat(numStr);
    return String(calcExecutionFee(num));
  });

  // 安全过滤：仅允许数字、运算符、括号、小数点
  if (!/^[\d+\-*/().\s]+$/.test(expression)) {
    throw new Error('表达式包含非法字符');
  }

  try {
    // 使用 Function 构造器代替 eval
    const fn = new Function('return ' + expression);
    const result = fn();
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('计算结果无效');
    }
    return result;
  } catch (e) {
    throw new Error('表达式格式错误');
  }
}
