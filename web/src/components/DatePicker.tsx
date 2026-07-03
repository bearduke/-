import { useEffect, useMemo, useRef, useState } from 'react';

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" or empty
  onChange: (date: string) => void;
  placeholder?: string;
}

const YEAR_START = 2010;
const YEAR_END = 2030;

interface Ymd {
  year: number;
  month: number;
  day: number;
}

function todayYmd(): Ymd {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function parseValue(value: string): Ymd | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export default function DatePicker({ value, onChange, placeholder = '请选择日期' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<number>(() => (parseValue(value) ?? todayYmd()).year);
  const [month, setMonth] = useState<number>(() => (parseValue(value) ?? todayYmd()).month);
  const [day, setDay] = useState<number>(() => (parseValue(value) ?? todayYmd()).day);
  const containerRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = YEAR_START; y <= YEAR_END; y++) arr.push(y);
    return arr;
  }, []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const maxDay = daysInMonth(year, month);
  const effectiveDay = Math.min(day, maxDay);
  const days = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay]);

  // Close panel when clicking outside.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function openPanel() {
    const parsed = parseValue(value) ?? todayYmd();
    setYear(parsed.year);
    setMonth(parsed.month);
    setDay(parsed.day);
    setOpen(true);
  }

  function handleYearChange(next: number) {
    setYear(next);
    const max = daysInMonth(next, month);
    if (day > max) setDay(max);
  }

  function handleMonthChange(next: number) {
    setMonth(next);
    const max = daysInMonth(year, next);
    if (day > max) setDay(max);
  }

  function handleToday() {
    const t = todayYmd();
    setYear(t.year);
    setMonth(t.month);
    setDay(t.day);
  }

  function handleConfirm() {
    onChange(`${year}-${pad(month)}-${pad(effectiveDay)}`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="input-field flex items-center justify-between text-left cursor-pointer"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value || placeholder}</span>
        <svg
          className="w-4 h-4 text-gray-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0V11.25A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 left-0 w-72 bg-white rounded-lg shadow-lg border border-gray-100 p-4">
          <div className="grid grid-cols-3 gap-2">
            <select
              className="input-field"
              value={year}
              onChange={e => handleYearChange(Number(e.target.value))}
            >
              {years.map(y => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={month}
              onChange={e => handleMonthChange(Number(e.target.value))}
            >
              {months.map(m => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={effectiveDay}
              onChange={e => setDay(Number(e.target.value))}
            >
              {days.map(d => (
                <option key={d} value={d}>
                  {d}日
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-between items-center mt-4">
            <button type="button" onClick={handleToday} className="btn-outline">
              今天
            </button>
            <button type="button" onClick={handleConfirm} className="btn-primary">
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
