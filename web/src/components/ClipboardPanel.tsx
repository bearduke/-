import { useEffect, useRef, useState, useCallback } from 'react';

interface HistoryItem {
  display: string;
  full: string;
}

const MAX_HISTORY = 20;
const DISPLAY_LEN = 50;
// 单击/双击区分延迟（毫秒）：须 ≥ 浏览器 dblclick 阈值（通常约 500ms）
const DBL_CLICK_DELAY = 500;

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

export default function ClipboardPanel() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [msg, setMsg] = useState('');
  // 最近一次捕获的剪贴板内容，避免重复
  const lastCapturedRef = useRef<string>('');
  // 单击时记录当前焦点元素（用于双击粘贴）
  const lastFocusedInputRef = useRef<HTMLElement | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 程序写入剪贴板期间标志：避免 handleCopy 捕获自己写入的内容
  const isWritingRef = useRef(false);
  // 单击/双击区分定时器
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMsg = useCallback((text: string) => {
    setMsg(text);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setMsg(''), 1500);
  }, []);

  const addToHistory = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const display = trimmed.length > DISPLAY_LEN ? trimmed.slice(0, DISPLAY_LEN) + '...' : trimmed;
    setHistory(prev => {
      // 去重：若已存在则提到最前
      const filtered = prev.filter(item => item.full !== trimmed);
      return [{ display, full: trimmed }, ...filtered].slice(0, MAX_HISTORY);
    });
  }, []);

  // 监听页面内的 copy/cut 事件，自动捕获用户复制的内容
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      // 忽略程序自身写入触发的 copy 事件
      if (isWritingRef.current) return;
      const text = e.clipboardData?.getData('text') || '';
      const trimmed = text.trim();
      if (trimmed && trimmed !== lastCapturedRef.current) {
        lastCapturedRef.current = trimmed;
        addToHistory(text);
      }
    };
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy);
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCopy);
    };
  }, [addToHistory]);

  // 监听全局 focus 事件，记录最近聚焦的输入框（用于双击粘贴）
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        lastFocusedInputRef.current = target;
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  // 轮询读取系统剪贴板（类似 Python pyperclip.paste() 轮询）
  // 无需用户点击刷新，复制后自动加入历史
  useEffect(() => {
    if (!navigator.clipboard?.readText) return;
    // 上次失败时间，失败后 3 秒内不再尝试，避免频繁报错
    let lastErrorTime = 0;
    // 防止并发读取
    let reading = false;
    // 是否已提示过权限问题（避免重复弹提示）
    let permissionWarned = false;

    const pollClipboard = async () => {
      // 文档不可见时不轮询（无焦点时 readText 会失败）
      if (document.hidden) return;
      // 失败退避期内不尝试
      if (Date.now() - lastErrorTime < 3000) return;
      // 避免并发
      if (reading) return;
      reading = true;
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        if (trimmed && trimmed !== lastCapturedRef.current) {
          lastCapturedRef.current = trimmed;
          addToHistory(text);
        }
      } catch {
        lastErrorTime = Date.now();
        // 仅提示一次权限问题
        if (!permissionWarned) {
          permissionWarned = true;
          showMsg('剪贴板读取需授权，请允许浏览器权限请求');
        }
      } finally {
        reading = false;
      }
    };

    // 每 500ms 轮询一次（窗口有焦点时）
    const pollTimer = setInterval(pollClipboard, 500);

    // 窗口聚焦时立即读取（用户从外部复制后切回窗口）
    const handleWindowFocus = () => setTimeout(pollClipboard, 50);
    // 可见性恢复时立即读取
    const handleVisibilityChange = () => {
      if (!document.hidden) setTimeout(pollClipboard, 50);
    };
    // 窗口点击时立即读取（确保焦点已获取，用户切回窗口后通常会点击）
    const handleWindowClick = () => setTimeout(pollClipboard, 50);
    // 鼠标移动到窗口内时立即读取（节流：最多每 500ms 触发一次）
    let lastMouseMoveTime = 0;
    const handleMouseMove = () => {
      const now = Date.now();
      if (now - lastMouseMoveTime < 500) return;
      lastMouseMoveTime = now;
      setTimeout(pollClipboard, 50);
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', handleWindowClick);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      clearInterval(pollTimer);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleWindowClick);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [addToHistory, showMsg]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    };
  }, []);

  // 列表项 mousedown：记录当前焦点（在 list 抢走焦点前记录）
  const handleItemMouseDown = (e: React.MouseEvent) => {
    // 阻止 mousedown 让输入框失焦，保持输入框焦点
    e.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      lastFocusedInputRef.current = active;
    }
  };

  // 读取系统剪贴板（用户主动点击触发）
  const handleReadSystemClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        showMsg('浏览器不支持读取剪贴板');
        return;
      }
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed) {
        lastCapturedRef.current = trimmed;
        addToHistory(text);
        showMsg('已添加到历史');
      } else {
        showMsg('剪贴板为空');
      }
    } catch {
      showMsg('读取失败，请用Ctrl+C复制后再点');
    }
  };

  // 复制到系统剪贴板（设置 isWritingRef 避免捕获自身触发的 copy 事件）
  const writeToClipboard = async (text: string): Promise<boolean> => {
    isWritingRef.current = true;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // 后备方案：临时 textarea + execCommand
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    } finally {
      // 延迟重置标志，确保 copy 事件处理完成
      setTimeout(() => { isWritingRef.current = false; }, 50);
    }
  };

  // 粘贴到聚焦输入框（光标位置插入，触发 React onChange）
  const pasteToInput = (input: HTMLInputElement | HTMLTextAreaElement, text: string): boolean => {
    try {
      const isNumberInput = input.type === 'number';

      // number input 不支持 selectionStart/End，且拼接结果必须是合法数字
      // 否则浏览器会强制 value 为空，导致原内容丢失
      if (isNumberInput) {
        const candidate = input.value + text;
        // 校验：合法数字（含小数、负号）
        if (!/^-?\d*\.?\d*$/.test(candidate) || candidate === '-' || candidate === '.') {
          return false;
        }
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        if (setter) setter.call(input, candidate);
        else input.value = candidate;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const newValue = input.value.slice(0, start) + text + input.value.slice(end);
      // 使用原生 setter 触发 React onChange
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(input, newValue);
      else input.value = newValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // 移动光标到粘贴内容之后
      const cursorPos = start + text.length;
      input.focus();
      input.setSelectionRange(cursorPos, cursorPos);
      return true;
    } catch {
      return false;
    }
  };

  // 单击：延迟执行以区分双击；双击会取消单击
  const handleItemClick = (item: HistoryItem) => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(async () => {
      clickTimerRef.current = null;
      const ok = await writeToClipboard(item.full);
      showMsg(ok ? '已复制到剪贴板' : '复制失败');
    }, DBL_CLICK_DELAY);
  };

  // 双击：取消单击延迟，直接粘贴到聚焦输入框
  const handleItemDoubleClick = async (item: HistoryItem) => {
    // 取消等待中的单击
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    // 取最近聚焦的输入框，但需校验其仍在 DOM 中（防止跨页面粘贴到已卸载元素）
    const focused = lastFocusedInputRef.current
      || (document.activeElement as HTMLElement | null);
    if (focused && focused.isConnected
        && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
      const input = focused as HTMLInputElement | HTMLTextAreaElement;
      const ok = pasteToInput(input, item.full);
      if (ok) {
        showMsg('已粘贴到输入框');
        return;
      }
      // 粘贴失败（如 number input 校验不通过）：回退到复制到剪贴板
    }
    // 无聚焦输入框或粘贴失败：复制到剪贴板
    const ok = await writeToClipboard(item.full);
    showMsg(ok ? '已复制（无聚焦输入框）' : '复制失败');
  };

  const handleClear = () => {
    setHistory([]);
    showMsg('已清空');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col border-t border-gray-100">
      {/* 标题栏 */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <ClipboardIcon className="w-3.5 h-3.5" />
          <span>剪贴板历史</span>
        </div>
        <button
          onClick={handleReadSystemClipboard}
          title="读取系统剪贴板"
          className="text-gray-400 hover:text-navy transition-colors"
        >
          <RefreshIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 历史列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {history.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-4">
            暂无历史<br />复制内容或点上方按钮读取
          </p>
        ) : (
          <ul className="space-y-1">
            {history.map((item, idx) => (
              <li
                key={idx}
                onMouseDown={handleItemMouseDown}
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemDoubleClick(item)}
                title={`单击：复制到剪贴板\n双击：粘贴到聚焦输入框\n\n${item.full}`}
                className="px-2 py-1.5 text-xs text-gray-600 bg-gray-50 hover:bg-navy/5 hover:text-navy rounded cursor-pointer transition-colors break-all leading-relaxed select-none"
              >
                <span className="text-gray-400 mr-1">{idx + 1}.</span>
                {item.display}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {msg || `${history.length}/${MAX_HISTORY}`}
        </span>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            title="清空历史"
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
