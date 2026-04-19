/**
 * 可输入的下拉选择器
 * 支持从预设选项中选择，也支持自由输入
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface ComboOption {
  label: string;
  value: string;
}

export interface ComboOptionGroup {
  label: string;
  options: Array<string | ComboOption>;
}

type ComboInputOption = string | ComboOption | ComboOptionGroup;

export interface ComboInputProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboInputOption[];
  className?: string;
  placeholder?: string;
}

function normalizeOption(option: string | ComboOption): ComboOption {
  return typeof option === 'string' ? { label: option, value: option } : option;
}

function isOptionGroup(option: ComboInputOption): option is ComboOptionGroup {
  return typeof option !== 'string' && 'options' in option;
}

interface NormalizedOptionGroup {
  key: string;
  label?: string;
  options: ComboOption[];
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

  const normalizedGroups: NormalizedOptionGroup[] = [];
  const ungroupedOptions: ComboOption[] = [];

  options.forEach((option, index) => {
    if (isOptionGroup(option)) {
      normalizedGroups.push({
        key: `group-${index}-${option.label}`,
        label: option.label,
        options: option.options.map(normalizeOption),
      });
      return;
    }
    ungroupedOptions.push(normalizeOption(option));
  });

  if (ungroupedOptions.length > 0) {
    normalizedGroups.unshift({
      key: 'ungrouped',
      options: ungroupedOptions,
    });
  }

  const normalized = normalizedGroups.flatMap((group) => group.options);
  const displayValue = normalized.find((option) => option.value === value)?.label || value;
  const query = value.trim().toLowerCase();
  const showAllOptions = !query || normalized.some((option) => option.value === value);
  const filteredGroups = showAllOptions
    ? normalizedGroups
    : normalizedGroups
        .map((group) => ({
          ...group,
          options: group.options.filter(
            (option) =>
              option.label.toLowerCase().includes(query) ||
              option.value.toLowerCase().includes(query)
          ),
        }))
        .filter((group) => group.options.length > 0);

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
      {open && filteredGroups.length > 0 && (
        <div className="va-combo-menu">
          {filteredGroups.map((group) => (
            <div key={group.key} className="va-combo-group">
              {group.label && <div className="va-combo-group-label">{group.label}</div>}
              {group.options.map((option) => (
                <div
                  key={`${group.key}-${option.value}`}
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
          ))}
        </div>
      )}
    </div>
  );
};
