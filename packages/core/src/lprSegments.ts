/**
 * LPR 分段算法（优化版）
 * 移植自 model.py L248-321 get_lpr_segments_optimized
 *
 * 核心思想：对 LPR 历史数据去重，只在利率实际变动时切分时间段
 */
import type { LprRecord, LprSegment } from './types';
import { LPR_DATA } from './lprData';
import { parseDate, daysBetween, addDays } from './utils';

/**
 * 获取 LPR 分段（优化版）
 * @param startDate 起算日期 "YYYY-MM-DD"
 * @param endDate   结算日期 "YYYY-MM-DD"
 * @param rateType  "一年期LPR分段" | "五年期LPR分段"
 * @param lprData   可选，自定义 LPR 数据（默认用内置数据）
 * @returns 分段数组
 */
export function getLprSegmentsOptimized(
  startDate: string,
  endDate: string,
  rateType: string,
  lprData: LprRecord[] = LPR_DATA
): LprSegment[] {
  const segments: LprSegment[] = [];

  // 判断使用一年期还是五年期
  const useOneYear = rateType.includes('一年期');
  const getValue = (r: LprRecord) => useOneYear ? r.one_year : r.five_year;

  // 排序（按日期升序）
  const sorted = [...lprData].sort((a, b) => {
    return parseDate(a.date).getTime() - parseDate(b.date).getTime();
  });

  // 去重：相邻记录利率相同则只保留第一条
  const deduped: LprRecord[] = [];
  let lastValue: number | null = null;
  for (const rec of sorted) {
    const val = getValue(rec);
    if (lastValue === null || val !== lastValue) {
      deduped.push(rec);
      lastValue = val;
    }
  }

  const startDt = parseDate(startDate);
  const endDt = parseDate(endDate);

  // 找到起算日之前最近的 LPR 记录作为初始利率
  let lastRate = 0;
  for (const rec of deduped) {
    if (parseDate(rec.date) <= startDt) {
      lastRate = getValue(rec);
    } else {
      break;
    }
  }

  // 如果没有找到起算日之前的记录，用第一条
  if (lastRate === 0 && deduped.length > 0) {
    lastRate = getValue(deduped[0]);
  }

  let segmentStart = startDate;

  // 遍历去重后的 LPR 记录，找出起算日和结算日之间的利率变动点
  for (const rec of deduped) {
    const lprDate = parseDate(rec.date);
    // 只处理起算日 < lprDate <= 结算日 的记录
    if (lprDate > startDt && lprDate <= endDt) {
      // 前一段结束于LPR变更日前一天，避免变更日被重复计算
      const prevDay = addDays(rec.date, -1);
      if (parseDate(segmentStart) <= parseDate(prevDay)) {
        const days = daysBetween(segmentStart, prevDay) + 1;
        if (days > 0) {
          segments.push({
            start: segmentStart,
            end: prevDay,
            rate: lastRate,
            days: days,
          });
        }
      }
      // 新利率从变更日开始
      segmentStart = rec.date;
      lastRate = getValue(rec);
    }
  }

  // 最后一段：segmentStart 到 end_date（注意边界 <= ）
  if (parseDate(segmentStart) <= endDt) {
    const days = daysBetween(segmentStart, endDate) + 1;
    if (days > 0) {
      segments.push({
        start: segmentStart,
        end: endDate,
        rate: lastRate,
        days: days,
      });
    }
  }

  return segments;
}
