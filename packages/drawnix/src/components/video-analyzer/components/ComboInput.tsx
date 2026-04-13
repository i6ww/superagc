/**
 * 可输入的下拉选择器
 * 支持从预设选项中选择，也支持自由输入
 * 完全匹配时仍展示全部选项
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface ComboOption {
  label: string;
  value: string;
}

interface ComboInputProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | ComboOption)[];
  className?: string;
  placeholder?: string;
}

/** 统一转为 { label, value } */
function normalizeOption(opt: string | ComboOption): ComboOption {
  return typeof opt === 'string' ? { label: opt, value: opt } : opt;
}

export const ComboInput: React.FC<ComboInputProps> = ({
  value,
  onChange,
  options,
  className = '',
  placeholder,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = options.map(normalizeOption);

  // 当前值对应的 label（用于显示）
  const displayValue = normalized.find(o => o.value === value)?.label || value;

  // 过滤逻辑：完全匹配时展示全部，否则按输入过滤
  const filtered = !value || normalized.some(o => o.value === value)
    ? normalized
    : normalized.filter(o =>
        o.label.toLowerCase().includes(value.toLowerCase()) ||
        o.value.toLowerCase().includes(value.toLowerCase())
      );

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((opt: ComboOption) => {
    onChange(opt.value);
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  return (
    <div className={`va-combo ${className}`} ref={containerRef}>
      <div className="va-combo-trigger" onClick={() => setOpen(o => !o)}>
        <input
          ref={inputRef}
          className="va-combo-input"
          value={displayValue}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
        {value && (
          <span className="va-combo-clear" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onChange(''); inputRef.current?.focus(); }}>×</span>
        )}
        <span className="va-combo-arrow">▾</span>
      </div>
      {open && filtered.length > 0 && (
        <div className="va-combo-menu">
          {filtered.map(opt => (
            <div
              key={opt.value}
              className={`va-combo-option ${opt.value === value ? 'selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); handleSelect(opt); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
