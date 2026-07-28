import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover disabled:hover:bg-accent',
  secondary:
    'bg-raised text-fg border border-line-strong hover:bg-overlay hover:border-[#3f4651] disabled:hover:bg-raised',
  ghost:
    'text-fg-muted hover:text-fg hover:bg-raised disabled:hover:bg-transparent',
  danger:
    'bg-danger text-white hover:bg-[#dc2626] disabled:hover:bg-danger',
};

// 手机上放大一档，保证足够的点击面积
const SIZES: Record<Size, string> = {
  sm: 'h-9 sm:h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 sm:h-9 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium
                  rounded-[var(--radius-control)] transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/**
 * 仅图标的方形按钮，用于行内操作。
 *
 * 注意：不要用 className 传 `hidden sm:inline-flex` 来做响应式显隐 —— Tailwind
 * 的 .hidden 与 .inline-flex 特异性相同，胜负取决于样式表顺序（inline-flex 在后），
 * 传进来的 hidden 不会生效。需要显隐请用 hideBelowSm。
 */
export function IconButton({
  variant = 'ghost',
  label,
  icon,
  className = '',
  hideBelowSm = false,
  ...rest
}: Omit<ButtonProps, 'children' | 'size'> & { label: string; hideBelowSm?: boolean }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={`${hideBelowSm ? 'hidden sm:inline-flex' : 'inline-flex'}
                  items-center justify-center w-9 h-9 sm:w-8 sm:h-8 shrink-0
                  rounded-[var(--radius-control)] transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${VARIANTS[variant]} ${className}`}
    >
      {icon}
    </button>
  );
}
