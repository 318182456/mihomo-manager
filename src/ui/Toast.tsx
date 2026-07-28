import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
}

interface ToastApi {
  success(message: string, detail?: string): void;
  error(message: string, detail?: string): void;
  warning(message: string, detail?: string): void;
  info(message: string, detail?: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** 在任意组件中弹出通知，取代 window.alert */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内使用');
  return ctx;
}

const VISUALS: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-success' },
  error: { icon: XCircle, className: 'text-danger' },
  warning: { icon: AlertTriangle, className: 'text-warning' },
  info: { icon: Info, className: 'text-accent' },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string, detail?: string) => {
    const id = nextId++;
    setItems(prev => [...prev, { id, kind, message, detail }]);
    // 错误停留更久，便于阅读原因
    const ttl = kind === 'error' ? 6000 : 3500;
    setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (m, d) => push('success', m, d),
    error: (m, d) => push('error', m, d),
    warning: (m, d) => push('warning', m, d),
    info: (m, d) => push('info', m, d),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed z-[100] flex flex-col gap-2
                   left-4 right-4 sm:left-auto sm:right-4 sm:w-[24rem]
                   bottom-[max(1rem,env(safe-area-inset-bottom))]"
        role="region"
        aria-label="通知"
      >
        <AnimatePresence initial={false}>
          {items.map(item => {
            const { icon: Icon, className } = VISUALS[item.kind];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                role={item.kind === 'error' ? 'alert' : 'status'}
                className="bg-overlay border border-line-strong rounded-[var(--radius-card)]
                           shadow-lg shadow-black/40 px-4 py-3 flex items-start gap-3"
              >
                <Icon size={16} className={`${className} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg break-words">{item.message}</p>
                  {item.detail && (
                    <p className="text-xs text-fg-muted mt-1 break-words font-mono">{item.detail}</p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(item.id)}
                  className="text-fg-subtle hover:text-fg transition-colors shrink-0 -mt-0.5"
                  aria-label="关闭通知"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
