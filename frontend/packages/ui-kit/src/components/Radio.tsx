'use client';

import { createContext, useContext, useId } from 'react';
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react';

interface RadioGroupContextValue {
  name: string;
  /** Có → controlled: checked theo value; không → defaultChecked theo defaultValue */
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps {
  /** Nhãn nhóm — có → aria-labelledby trỏ về đây */
  label?: string;
  /** Tên radio group — fallback tự sinh useId nếu bỏ trống */
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  error?: string;
  hint?: string;
  /** <Radio value="a">…</Radio> — name tự nhận qua Context, không cần prop riêng */
  children: ReactNode;
  className?: string;
}

/** Nhóm radio — role="radiogroup", provide name qua Context cho Radio con. */
export function RadioGroup({
  label,
  name,
  value,
  defaultValue,
  onChange,
  error,
  hint,
  children,
  className
}: RadioGroupProps) {
  const autoId = useId();
  const autoName = useId();
  const groupId = `rg${autoId}`;
  const groupName = name || autoName;
  const describedBy = error
    ? `${groupId}-error`
    : hint
      ? `${groupId}-hint`
      : undefined;

  return (
    <div
      role="radiogroup"
      aria-labelledby={label ? groupId : undefined}
      aria-describedby={describedBy}
      className={['uk-radio-group', className ?? null].filter(Boolean).join(' ')}
    >
      {label ? (
        <span className="uk-label" id={groupId}>
          {label}
        </span>
      ) : null}
      <div className="uk-radio-group__options">
        <RadioGroupContext.Provider value={{ name: groupName, value, defaultValue, onChange }}>
          {children}
        </RadioGroupContext.Provider>
      </div>
      {error ? (
        <p className="uk-error" id={`${groupId}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="uk-hint" id={`${groupId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Giá trị lựa chọn — bắt buộc */
  value: string;
  /** Nhãn bên phải custom box */
  label?: string;
  /** Bỏ trống khi nằm trong RadioGroup (lấy name qua Context) */
  name?: string;
  /** Dùng khi Radio đứng ngoài group */
  error?: string;
  hint?: string;
}

/** Radio box tròn + chấm ::after — pattern Checkbox, nhận name từ RadioGroup Context. */
export function Radio({
  value,
  label,
  name,
  error,
  hint,
  id,
  className,
  checked,
  defaultChecked,
  onChange,
  ...rest
}: RadioProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const group = useContext(RadioGroupContext);
  const groupControlled = group !== null && group.value !== undefined;
  const groupName = name ?? group?.name;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    if (group?.onChange && e.target.checked) {
      group.onChange(value);
    }
  };

  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  return (
    <div className={['uk-radio', className ?? null].filter(Boolean).join(' ')}>
      <input
        type="radio"
        id={inputId}
        name={groupName}
        value={value}
        className="uk-radio__input"
        checked={groupControlled ? group!.value === value : checked}
        defaultChecked={
          groupControlled
            ? undefined
            : (defaultChecked ??
              (group?.defaultValue !== undefined
                ? group.defaultValue === value
                : undefined))
        }
        onChange={handleChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      <span className="uk-radio__box" aria-hidden="true" />
      {label ? (
        <label className="uk-radio__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      {error ? (
        <p className="uk-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="uk-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
