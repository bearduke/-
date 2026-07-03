import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { calculateExpression, calcExecutionFee, formatMoney } from '@core';

interface CalculatorWidgetProps {
  open: boolean;
  onClose: () => void;
}

interface ExecFeeItem {
  input: number;
  fee: number;
}

type BtnKind = 'num' | 'op' | 'clear' | 'del' | 'exec' | 'eq';

interface BtnConfig {
  label: string;
  kind: BtnKind;
  insert?: string;
  cursorOffsetWithin?: number;
  onClick?: () => void;
  span?: number;
}

/**
 * 格式化计算结果：整数显示整数，浮点数最多保留 6 位并去除末尾 0
 */
function formatResult(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return parseFloat(n.toFixed(6)).toString();
}

export default function CalculatorWidget({ open, onClose }: CalculatorWidgetProps) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [resultError, setResultError] = useState(false);
  const [execFeeInfo, setExecFeeInfo] = useState<ExecFeeItem[]>([]);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCursorRef = useRef<number | null>(null);

  // 表达式变化后，应用按钮插入时记录的光标位置
  useEffect(() => {
    const pos = pendingCursorRef.current;
    if (pos !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pos, pos);
      inputRef.current.focus();
      pendingCursorRef.current = null;
    }
  }, [expr]);

  function insertText(text: string, cursorOffsetWithin?: number) {
    const input = inputRef.current;
    if (!input) {
      setExpr(prev => prev + text);
      return;
    }
    const start = input.selectionStart ?? expr.length;
    const end = input.selectionEnd ?? expr.length;
    const newText = expr.slice(0, start) + text + expr.slice(end);
    const pos =
      cursorOffsetWithin !== undefined ? start + cursorOffsetWithin : start + text.length;
    setExpr(newText);
    pendingCursorRef.current = pos;
  }

  function handleClear() {
    setExpr('');
    setResult(null);
    setResultError(false);
    setExecFeeInfo([]);
  }

  function handleBackspace() {
    const input = inputRef.current;
    if (!input) {
      setExpr(prev => prev.slice(0, -1));
      return;
    }
    const start = input.selectionStart ?? expr.length;
    const end = input.selectionEnd ?? expr.length;
    if (start !== end) {
      // 删除选中文本
      const newText = expr.slice(0, start) + expr.slice(end);
      setExpr(newText);
      pendingCursorRef.current = start;
    } else if (start > 0) {
      // 删除前一个字符
      const newText = expr.slice(0, start - 1) + expr.slice(end);
      setExpr(newText);
      pendingCursorRef.current = start - 1;
    }
  }

  function handleEvaluate() {
    if (!expr.trim()) {
      setResult(null);
      setResultError(false);
      setExecFeeInfo([]);
      return;
    }
    try {
      const value = calculateExpression(expr);
      setResult(value);
      setResultError(false);

      // 提取执行费明细（仅展示最终金额，不做详细拆分）
      const info: ExecFeeItem[] = [];
      const re = /执行费\s*\(?\s*([\d.]+)\s*\)?/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(expr)) !== null) {
        const num = parseFloat(m[1]);
        if (!isNaN(num)) {
          info.push({ input: num, fee: calcExecutionFee(num) });
        }
      }
      setExecFeeInfo(info);
    } catch {
      setResult(null);
      setResultError(true);
      setExecFeeInfo([]);
    }
  }

  async function handleCopy() {
    if (result === null || resultError) return;
    try {
      await navigator.clipboard.writeText(String(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默忽略
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEvaluate();
    }
  }

  const btnBase =
    'h-12 rounded-lg font-medium text-base transition-colors select-none active:scale-[0.98]';

  const btnClass: Record<BtnKind, string> = {
    num: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
    op: 'bg-white border border-gray-300 text-navy hover:bg-gray-50',
    clear: 'bg-white border border-gray-300 text-red-600 hover:bg-red-50',
    del: 'bg-white border border-gray-300 text-gray-500 hover:bg-gray-50',
    exec: 'bg-white border border-gray-300 text-navy hover:bg-gray-50',
    eq: 'bg-gold text-navy-dark font-bold hover:bg-gold-light',
  };

  const buttons: BtnConfig[] = [
    { label: 'C', kind: 'clear', onClick: handleClear },
    { label: '⌫', kind: 'del', onClick: handleBackspace },
    { label: '执行费', kind: 'exec', insert: '执行费()', cursorOffsetWithin: 4 },
    { label: '÷', kind: 'op', insert: '/' },
    { label: '7', kind: 'num', insert: '7' },
    { label: '8', kind: 'num', insert: '8' },
    { label: '9', kind: 'num', insert: '9' },
    { label: '×', kind: 'op', insert: '*' },
    { label: '4', kind: 'num', insert: '4' },
    { label: '5', kind: 'num', insert: '5' },
    { label: '6', kind: 'num', insert: '6' },
    { label: '−', kind: 'op', insert: '-' },
    { label: '1', kind: 'num', insert: '1' },
    { label: '2', kind: 'num', insert: '2' },
    { label: '3', kind: 'num', insert: '3' },
    { label: '+', kind: 'op', insert: '+' },
    { label: '(', kind: 'op', insert: '(' },
    { label: '0', kind: 'num', insert: '0' },
    { label: ')', kind: 'op', insert: ')' },
    { label: '.', kind: 'num', insert: '.' },
    { label: '=', kind: 'eq', onClick: handleEvaluate, span: 4 },
  ];

  function handleBtnClick(btn: BtnConfig) {
    if (btn.onClick) {
      btn.onClick();
      return;
    }
    if (btn.insert !== undefined) {
      insertText(btn.insert, btn.cursorOffsetWithin);
    }
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-bold text-navy">计算器</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 表达式输入 */}
        <input
          ref={inputRef}
          type="text"
          value={expr}
          onChange={e => setExpr(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0"
          className="w-full text-right font-mono text-lg px-3 py-3 border border-gray-300 rounded-lg bg-cream focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-colors"
        />

        {/* 结果区 */}
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="text-sm text-gray-400">结果</span>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-xl font-bold ${
                resultError ? 'text-red-600' : 'text-navy'
              }`}
            >
              {resultError ? '错误' : result !== null ? formatResult(result) : '—'}
            </span>
            {result !== null && !resultError && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:border-navy hover:text-navy transition-colors"
              >
                {copied ? '已复制' : '复制结果'}
              </button>
            )}
          </div>
        </div>

        {/* 执行费明细 */}
        {execFeeInfo.length > 0 && (
          <div className="mt-2 px-1 text-xs text-gray-500 space-y-0.5">
            {execFeeInfo.map((item, idx) => (
              <div key={idx} className="font-mono">
                执行费({item.input}) = {formatMoney(item.fee)}
              </div>
            ))}
          </div>
        )}

        {/* 按钮区 */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {buttons.map((btn, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleBtnClick(btn)}
              className={`${btnBase} ${btnClass[btn.kind]} ${
                btn.span === 4 ? 'col-span-4' : ''
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
