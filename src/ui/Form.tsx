import { useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** 带标签与提示文字的表单行容器 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className = '',
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-fg-muted mb-1.5">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle mt-1.5 leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  mono?: boolean;
}

export function TextInput({ label, hint, error, mono, className = '', ...rest }: TextInputProps) {
  const autoId = useId();
  const id = rest.id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        {...rest}
        id={id}
        className={`control ${mono ? 'control-mono' : ''} ${error ? 'border-danger' : ''} ${className}`}
      />
    </Field>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  mono?: boolean;
}

export function TextArea({ label, hint, error, mono, className = '', ...rest }: TextAreaProps) {
  const autoId = useId();
  const id = rest.id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea
        {...rest}
        id={id}
        className={`control resize-y ${mono ? 'control-mono' : ''} ${error ? 'border-danger' : ''} ${className}`}
      />
    </Field>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

export function Select({ label, hint, children, className = '', ...rest }: SelectProps) {
  const autoId = useId();
  const id = rest.id ?? autoId;
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <select {...rest} id={id} className={`control appearance-none pr-9 ${className}`}>
          {children}
        </select>
        <ChevronDown
          size={15}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
        />
      </div>
    </Field>
  );
}

/** 开关。label 点击即可切换，命中区域比原先的 8px 小方块大得多 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center sm:items-start gap-2 sm:gap-3 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {/*
        按钮撑到 44x44 满足手机最小触摸目标，轨道是内部视觉元素保持 36x20。
        不用负外边距 —— 它会让按钮的布局盒与绘制位置错开，
        导致父元素盖在上面、点击打不到开关。
      */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="shrink-0 flex items-center justify-center rounded-full
                   w-11 h-11 sm:w-9 sm:h-5 sm:mt-0.5
                   disabled:cursor-not-allowed"
      >
        <span
          className={`relative block w-9 h-5 rounded-full transition-colors
                      ${checked ? 'bg-accent' : 'bg-line-strong'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
                        transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </span>
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-fg leading-5">{label}</span>
        {description && (
          <span className="block text-xs text-fg-subtle mt-0.5 leading-relaxed">{description}</span>
        )}
      </span>
    </label>
  );
}

/** 复选框，用于多选场景（开关用于「启用/停用」语义） */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        aria-hidden
        className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center
                    transition-colors peer-focus-visible:outline peer-focus-visible:outline-2
                    peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2
                    ${checked ? 'bg-accent border-accent' : 'bg-canvas border-line-strong'}`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="w-3 h-3 text-white" fill="none">
            <path d="M2.5 6.2l2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-fg leading-5">{label}</span>
        {description && (
          <span className="block text-xs text-fg-subtle mt-0.5 leading-relaxed">{description}</span>
        )}
      </span>
    </label>
  );
}

/** 分段控件，替代原先两个手写的「模式切换」按钮组 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: ReactNode;
}) {
  return (
    <Field label={label}>
      <div role="tablist" className="inline-flex p-0.5 bg-canvas border border-line rounded-[var(--radius-control)]">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 h-7 text-[13px] font-medium rounded-[4px] transition-colors ${
              value === opt.value
                ? 'bg-accent text-white'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </Field>
  );
}
