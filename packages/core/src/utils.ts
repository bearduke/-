/**
 * 工具函数
 * 移植自 utils.py L407-549
 */

/**
 * 解析日期字符串为 Date 对象（本地时间，避免 UTC 偏移）
 * 对应 Python: datetime.strptime(date_str, "%Y-%m-%d")
 */
export function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

/**
 * 格式化日期为 "YYYY-MM-DD"
 * 对应 Python: dt.strftime("%Y-%m-%d")
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 日期加一天，返回格式化字符串
 * 对应 Python: (datetime.strptime(d, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
 */
export function addDays(dateStr: string, days: number): string {
  const dt = parseDate(dateStr);
  dt.setDate(dt.getDate() + days);
  return formatDate(dt);
}

/**
 * 计算两个日期之间的天数（不含 +1）
 * 对应 Python: utils.py L463-469 days_between
 * 接受 string 或 Date
 */
export function daysBetween(d1: string | Date, d2: string | Date): number {
  const date1 = typeof d1 === 'string' ? parseDate(d1) : d1;
  const date2 = typeof d2 === 'string' ? parseDate(d2) : d2;
  return Math.round((date2.getTime() - date1.getTime()) / 86400000);
}

/**
 * 格式化金额：千分位逗号 + 两位小数
 * 对应 Python: utils.py L423-427 format_money
 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 解析金额文本：去除逗号后转数字，失败返回 0
 * 对应 Python: utils.py L430-438 parse_money
 */
export function parseMoney(text: unknown): number {
  if (!text) return 0;
  const str = String(text).replace(/,/g, '').replace(/，/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * 中文数字映射
 */
const CN_NUMS: Record<string, string> = {
  '0': '〇', '1': '一', '2': '二', '3': '三', '4': '四',
  '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
};

/**
 * 将日期转换为中文日期格式
 * 对应 Python: utils.py L515-549 to_chinese_date
 * 如: 2026-05-10 -> 二〇二六年五月十日
 */
export function toChineseDate(dt: Date): string {
  const yearStr = String(dt.getFullYear());
  let yearCn = '';
  for (const ch of yearStr) {
    yearCn += CN_NUMS[ch] || ch;
  }

  const month = dt.getMonth() + 1;
  let monthCn: string;
  if (month <= 10) {
    monthCn = month < 10 ? CN_NUMS[String(month)] : '十';
  } else {
    monthCn = '十' + CN_NUMS[String(month - 10)];
  }

  const day = dt.getDate();
  let dayCn: string;
  if (day < 10) {
    dayCn = CN_NUMS[String(day)];
  } else if (day === 10) {
    dayCn = '十';
  } else if (day < 20) {
    dayCn = '十' + CN_NUMS[String(day - 10)];
  } else if (day === 20) {
    dayCn = '二十';
  } else if (day < 30) {
    dayCn = '二十' + CN_NUMS[String(day - 20)];
  } else if (day === 30) {
    dayCn = '三十';
  } else {
    dayCn = '三十一';
  }

  return `${yearCn}年${monthCn}月${dayCn}日`;
}
