/**
 * 可输入的下拉选择器
 * 支持从预设选项中选择，也支持自由输入
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface ComboOption {
  label: string;
  value: string;
}

export interface ComboInputProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | ComboOption>;
  className?: string;
  placeholder?: string;
}

function normalizeOption(option: string | ComboOption): ComboOption {
  return typeof option === 'string' ? { label: option, value: option } : option;
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
  const displayValue = normalized.find((option) => option.value === value)?.label || value;
  const filtered =
    !value || normalized.some((option) => option.value === value)
      ? normalized
      : normalized.filter(
          (option) =>
            option.label.toLowerCase().includes(value.toLowerCase()) ||
            option.value.toLowerCase().includes(value.toLowerCase())
        );

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (option: ComboOption) => {
      onChange(option.value);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange]
  );

  return (
    <div className={`va-combo ${className}`} ref={containerRef}>
      <div className="va-combo-trigger" onClick={() => setOpen((prev) => !prev)}>
        <input
          ref={inputRef}
          className="va-combo-input"
          value={displayValue}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
        {value && (
          <span
            className="va-combo-clear"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange('');
              inputRef.current?.focus();
            }}
          >
            ×
          </span>
        )}
        <span className="va-combo-arrow">▾</span>
      </div>
      {open && filtered.length > 0 && (
        <div className="va-combo-menu">
          {filtered.map((option) => (
            <div
              key={option.value}
              className={`va-combo-option ${option.value === value ? 'selected' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(option);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
