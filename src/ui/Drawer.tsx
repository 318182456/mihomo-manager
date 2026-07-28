import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

/**
 * 右侧抽屉。用于承载长表单，避免在列表里就地展开成几百像素的巨块。
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // 抽屉打开时锁住背景滚动
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // 手机上占满整屏；从 sm 起才收窄为侧边抽屉
  const widthClass = {
    md: 'sm:max-w-md',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  }[width];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            className={`relative w-full ${widthClass} h-full bg-surface border-l border-line
                        flex flex-col overflow-hidden shadow-2xl shadow-black/50`}
          >
            <header className="h-14 shrink-0 px-4 sm:px-5 flex items-center justify-between
                               border-b border-line bg-canvas/40">
              <div className="min-w-0 pr-3">
                <h2 className="text-sm font-semibold text-fg truncate">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-fg-subtle truncate mt-0.5 font-mono">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="关闭"
                className="w-10 h-10 -mr-1.5 sm:w-8 sm:h-8 sm:mr-0 shrink-0
                           rounded-[var(--radius-control)] flex items-center justify-center
                           text-fg-muted hover:text-fg hover:bg-raised transition-colors"
              >
                <X size={18} />
              </button>
            </header>

            {/* min-w-0 防止内部 grid/flex 子项把内容撑出面板宽度 */}
            <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain">{children}</div>

            {footer && (
              <footer className="shrink-0 px-4 sm:px-5 py-3 sm:py-3.5 border-t border-line bg-canvas/40
                                 flex items-center justify-end gap-2
                                 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
