import { useMemo, useState } from 'react';
import { LPR_DATA } from '@core';
import type { LprRecord } from '@core';

const LPR_STORAGE_KEY = 'execution_assistant_lpr';

interface LprManagerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 按日期升序比较
 */
function sortByDateAsc(a: LprRecord, b: LprRecord): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/**
 * 加载 LPR 数据：优先从 localStorage 读取，否则用内置数据
 */
function loadLprData(): LprRecord[] {
  try {
    const raw = localStorage.getItem(LPR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return [...LPR_DATA];
}

/**
 * 保存 LPR 数据到 localStorage
 */
function saveLprData(data: LprRecord[]): void {
  localStorage.setItem(LPR_STORAGE_KEY, JSON.stringify(data));
}

export default function LprManager({ open, onClose }: LprManagerProps) {
  // 本地副本：从 localStorage 或 LPR_DATA 初始化
  const [records, setRecords] = useState<LprRecord[]>(() => loadLprData());
  const [dedup, setDedup] = useState<boolean>(true);

  // 新增表单
  const [formDate, setFormDate] = useState('');
  const [formOneYear, setFormOneYear] = useState('');
  const [formFiveYear, setFormFiveYear] = useState('');
  const [error, setError] = useState('');

  // 排序（升序）后的完整列表，用于去重比较
  const sortedAsc = useMemo(
    () => [...records].sort(sortByDateAsc),
    [records],
  );

  // 去重视图：与紧邻的上一条（更早的）记录比较，利率变化则保留；最早一条始终保留
  const dedupedAsc = useMemo(() => {
    const result: LprRecord[] = [];
    for (let i = 0; i < sortedAsc.length; i++) {
      const cur = sortedAsc[i];
      if (i === 0) {
        result.push(cur);
        continue;
      }
      const prev = sortedAsc[i - 1];
      if (cur.one_year !== prev.one_year || cur.five_year !== prev.five_year) {
        result.push(cur);
      }
    }
    return result;
  }, [sortedAsc]);

  // 展示列表：按日期降序（最新在前）
  const displayList = useMemo(() => {
    const source = dedup ? dedupedAsc : sortedAsc;
    return [...source].sort(sortByDateAsc).reverse();
  }, [dedup, dedupedAsc, sortedAsc]);

  function handleAdd() {
    setError('');

    if (!formDate) {
      setError('请选择日期');
      return;
    }
    const oneYearNum = formOneYear.trim() === '' ? null : parseFloat(formOneYear);
    const fiveYearNum = formFiveYear.trim() === '' ? null : parseFloat(formFiveYear);

    if (
      (oneYearNum === null || isNaN(oneYearNum)) &&
      (fiveYearNum === null || isNaN(fiveYearNum))
    ) {
      setError('请至少填写一项利率');
      return;
    }

    const newRecord: LprRecord = {
      date: formDate,
      one_year: oneYearNum ?? 0,
      five_year: fiveYearNum ?? 0,
    };

    const newRecords = [...records, newRecord];
    setRecords(newRecords);
    saveLprData(newRecords);

    // 重置表单
    setFormDate('');
    setFormOneYear('');
    setFormFiveYear('');
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl p-6 shadow-xl flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-navy">LPR数据管理</h2>
            <p className="text-xs text-gray-400 mt-1">
              共 {records.length} 条记录{dedup ? `（去重后 ${dedupedAsc.length} 条）` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirm('恢复为内置LPR数据？自定义数据将被清除。')) {
                  setRecords([...LPR_DATA]);
                  saveLprData([...LPR_DATA]);
                }
              }}
              className="text-xs text-gold-dim hover:text-gold px-2 py-1"
            >
              恢复内置
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 新增表单 */}
        <div className="mb-4 rounded-lg border border-gray-100 bg-cream p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-1">
              <label className="label-text">日期</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="label-text">一年期 LPR(%)</label>
              <input
                type="number"
                step="0.01"
                value={formOneYear}
                onChange={e => setFormOneYear(e.target.value)}
                placeholder="如 3.10"
                className="input-field"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="label-text">五年期 LPR(%)</label>
              <input
                type="number"
                step="0.01"
                value={formFiveYear}
                onChange={e => setFormFiveYear(e.target.value)}
                placeholder="如 3.60"
                className="input-field"
              />
            </div>
            <div className="sm:col-span-1">
              <button type="button" onClick={handleAdd} className="btn-gold w-full">
                添加
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>

        {/* 去重开关 */}
        <div className="flex items-center justify-between mb-3">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dedup}
              onChange={e => setDedup(e.target.checked)}
              className="w-4 h-4 accent-navy"
            />
            <span className="text-sm text-gray-700">去重视图（仅显示利率变化的记录）</span>
          </label>
        </div>

        {/* 表格 */}
        <div className="overflow-y-auto border border-gray-100 rounded-lg" style={{ maxHeight: '50vh' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-navy text-white">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">日期</th>
                <th className="text-right px-4 py-2.5 font-medium">一年期 LPR(%)</th>
                <th className="text-right px-4 py-2.5 font-medium">五年期 LPR(%)</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((r, idx) => (
                <tr
                  key={`${r.date}-${idx}`}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-cream/60'}
                >
                  <td className="px-4 py-2.5 text-gray-700 font-mono">{r.date}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 font-mono">
                    {r.one_year.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 font-mono">
                    {r.five_year.toFixed(2)}
                  </td>
                </tr>
              ))}
              {displayList.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
