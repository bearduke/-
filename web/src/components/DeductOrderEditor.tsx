import { useMemo, useState } from 'react';

interface DeductOrderEditorProps {
  open: boolean;
  initialOrder: string[];
  claimsCount: number; // number of claims, to build default order
  onSave: (order: string[]) => void;
  onClose: () => void;
}

function buildDefaultOrder(claimsCount: number): string[] {
  const order: string[] = ['诉讼费用'];
  for (let i = 1; i <= claimsCount; i++) {
    order.push(`一般债务利息(债权${i})`);
  }
  for (let i = 1; i <= claimsCount; i++) {
    order.push(`债权本金(债权${i})`);
  }
  order.push('其他费用');
  order.push('加倍部分延迟履行利息');
  return order;
}

function InnerEditor({
  initialOrder,
  claimsCount,
  onSave,
  onClose,
}: Omit<DeductOrderEditorProps, 'open'>) {
  const defaultOrder = useMemo(() => buildDefaultOrder(claimsCount), [claimsCount]);
  const [order, setOrder] = useState<string[]>(() =>
    initialOrder && initialOrder.length > 0 ? [...initialOrder] : [...defaultOrder],
  );

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  }

  function resetDefault() {
    setOrder([...defaultOrder]);
  }

  function handleSave() {
    onSave(order);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-xl p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl font-bold text-navy mb-4">编辑抵扣顺序</h2>

        <ol className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {order.map((item, idx) => (
            <li
              key={`${item}-${idx}`}
              className="flex items-center justify-between px-3 py-2 bg-cream rounded-lg"
            >
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-navy text-white text-xs font-bold">
                  {idx + 1}
                </span>
                {item}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:border-navy hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === order.length - 1}
                  className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:border-navy hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="下移"
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex justify-between items-center mt-5">
          <button
            type="button"
            onClick={resetDefault}
            className="text-sm text-gold-dim hover:text-gold transition-colors"
          >
            恢复默认顺序
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline">
              取消
            </button>
            <button type="button" onClick={handleSave} className="btn-gold">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeductOrderEditor({
  open,
  initialOrder,
  claimsCount,
  onSave,
  onClose,
}: DeductOrderEditorProps) {
  if (!open) return null;
  return (
    <InnerEditor
      initialOrder={initialOrder}
      claimsCount={claimsCount}
      onSave={onSave}
      onClose={onClose}
    />
  );
}
