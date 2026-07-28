import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

/** 一个待响应的 confirm 请求 */
interface ConfirmSpec {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** 一个待响应的 prompt 请求 */
interface PromptField {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  hint?: ReactNode;
  required?: boolean;
  multiline?: boolean;
  mono?: boolean;
}

interface PromptSpec {
  title: string;
  description?: ReactNode;
  fields: PromptField[];
  confirmLabel?: string;
}

interface DialogApi {
  /** 替代 window.confirm，返回用户是否确认 */
  confirm(spec: ConfirmSpec): Promise<boolean>;
  /** 替代 window.prompt，返回字段值映射；取消时返回 null */
  prompt(spec: PromptSpec): Promise<Record<string, string> | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog 必须在 <DialogProvider> 内使用');
  return ctx;
}

type Pending =
  | { kind: 'confirm'; spec: ConfirmSpec; resolve: (v: boolean) => void }
  | { kind: 'prompt'; spec: PromptSpec; resolve: (v: Record<string, string> | null) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const api = useMemo<DialogApi>(() => ({
    confirm: (spec) => new Promise<boolean>(resolve => {
      setPending({ kind: 'confirm', spec, resolve });
    }),
    prompt: (spec) => new Promise<Record<string, string> | null>(resolve => {
      setPending({ kind: 'prompt', spec, resolve });
    }),
  }), []);

  const close = useCallback((result: boolean | Record<string, string> | null) => {
    setPending(current => {
      if (!current) return null;
      if (current.kind === 'confirm') {
        current.resolve(result === true);
      } else {
        current.resolve(typeof result === 'object' ? result : null);
      }
      return null;
    });
  }, []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {pending && (
          <DialogShell
            key="dialog"
            pending={pending}
            onCancel={() => close(pending.kind === 'confirm' ? false : null)}
            onConfirm={(v) => close(v)}
          />
        )}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}

function DialogShell({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  onCancel: () => void;
  onConfirm: (v: boolean | Record<string, string>) => void;
}) {
  const isPrompt = pending.kind === 'prompt';
  const fields = isPrompt ? pending.spec.fields : [];

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(f => [f.name, f.defaultValue ?? '']))
  );
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    // 打开后聚焦第一个输入框，让键盘用户可以直接输入
    firstInputRef.current?.focus();
    firstInputRef.current?.select?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const missingRequired = fields.some(f => f.required && !values[f.name]?.trim());

  const submit = () => {
    if (isPrompt) {
      if (missingRequired) return;
      onConfirm(values);
    } else {
      onConfirm(true);
    }
  };

  const danger = pending.kind === 'confirm' && pending.spec.danger;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        aria-label={pending.spec.title}
        className="relative w-full max-w-md bg-surface border border-line-strong
                   rounded-[var(--radius-card)] shadow-2xl shadow-black/50 overflow-hidden"
        onKeyDown={(e) => {
          // 单行表单里回车即提交；多行文本框留给换行
          if (e.key === 'Enter' && !e.shiftKey && !(e.target as HTMLElement).matches('textarea')) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="px-4 sm:px-5 pt-5 pb-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-start gap-3">
            {danger && (
              <div className="w-9 h-9 rounded-full bg-danger-soft flex items-center justify-center shrink-0">
                <AlertTriangle size={17} className="text-danger" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-fg">{pending.spec.title}</h2>
              {pending.spec.description && (
                <div className="text-sm text-fg-muted mt-1.5 break-words">
                  {pending.spec.description}
                </div>
              )}
            </div>
          </div>

          {isPrompt && (
            <div className="mt-4 space-y-3.5">
              {fields.map((f, i) => (
                <div key={f.name}>
                  <label
                    htmlFor={`dlg-${f.name}`}
                    className="block text-xs font-medium text-fg-muted mb-1.5"
                  >
                    {f.label}
                    {f.required && <span className="text-danger ml-1">*</span>}
                  </label>
                  {f.multiline ? (
                    <textarea
                      id={`dlg-${f.name}`}
                      ref={i === 0 ? (firstInputRef as React.Ref<HTMLTextAreaElement>) : undefined}
                      rows={3}
                      value={values[f.name] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                      className={`control resize-y ${f.mono ? 'control-mono' : ''}`}
                    />
                  ) : (
                    <input
                      id={`dlg-${f.name}`}
                      ref={i === 0 ? (firstInputRef as React.Ref<HTMLInputElement>) : undefined}
                      type="text"
                      value={values[f.name] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                      className={`control ${f.mono ? 'control-mono' : ''}`}
                    />
                  )}
                  {f.hint && <p className="text-xs text-fg-subtle mt-1.5 leading-relaxed">{f.hint}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3.5 bg-canvas/60 border-t border-line
                        flex justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button variant="ghost" onClick={onCancel}>
            {(!isPrompt && pending.spec.cancelLabel) || '取消'}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={submit}
            disabled={isPrompt && missingRequired}
          >
            {isPrompt
              ? (pending.spec.confirmLabel ?? '确定')
              : (pending.spec.confirmLabel ?? '确定')}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
