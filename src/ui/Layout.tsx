import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/** 页面标题栏。所有视图共用同一套间距与层级 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-5 md:mb-6">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-fg">{title}</h1>
        {description && <p className="text-sm text-fg-muted mt-1">{description}</p>}
      </div>
      {/* 窄屏按钮平分整行宽度，避免挤成两个小块 */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
    </div>
  );
}

/** 常规页面容器，统一最大宽度与内边距 */
export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 sm:px-5 md:px-8 py-5 md:py-6 max-w-[1400px] mx-auto w-full
                    pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

/** 抽屉/表单内的分区标题 */
export function Section({
  title,
  description,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-4 ${className}`}>
      {title && (
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {description && <p className="text-xs text-fg-muted mt-1 leading-relaxed">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-line -mx-1 px-1">
      {items.map(item => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors
                        ${active ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded text-xs tabular-nums ${
                  active ? 'bg-accent-soft text-accent' : 'bg-raised text-fg-subtle'
                }`}
              >
                {item.count}
              </span>
            )}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="text-fg-subtle mb-4 opacity-60">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && (
        <p className="text-sm text-fg-muted mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = '加载中' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-fg-muted">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-fg-muted border-line-strong',
  accent: 'bg-accent-soft text-accent border-accent/30',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
};

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border
                  text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** 状态圆点，用于节点被墙状态等紧凑指示 */
export function StatusDot({ tone, pulse }: { tone: BadgeTone; pulse?: boolean }) {
  const color = {
    neutral: 'bg-fg-subtle',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[tone];
  return (
    <span
      aria-hidden
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${color} ${pulse ? 'animate-pulse' : ''}`}
    />
  );
}
