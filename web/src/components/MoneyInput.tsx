import { useState } from 'react';

interface MoneyInputProps {
  value: string; // raw string value from store
  onChange: (value: string) => void; // passes raw string (digits only, no formatting)
  placeholder?: string;
}

function formatMoney(raw: string): string {
  if (!raw) return '';
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  return num.toLocaleString('en-US');
}

export default function MoneyInput({ value, onChange, placeholder = '请输入金额' }: MoneyInputProps) {
  const [focused, setFocused] = useState(false);

  const handleFocus = () => {
    setFocused(true);
    // 聚焦时如果值为0或空，清空方便输入
    if (value === '0' || value === '0.0' || value === '0.00') {
      onChange('');
    }
  };

  const handleBlur = () => {
    setFocused(false);
    // 失焦时如果为空，恢复为0
    if (!value) {
      onChange('0');
    }
  };

  const display = focused ? value : formatMoney(value);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
        ¥
      </span>
      <input
        type="text"
        inputMode="decimal"
        className="input-field text-right pl-7"
        value={display}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={e => {
          const raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
          onChange(raw);
        }}
      />
    </div>
  );
}
