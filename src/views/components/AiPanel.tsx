import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, X, Loader2, AlertTriangle, Check, RotateCcw } from 'lucide-react';
import * as api from '../../api';
import { Button, IconButton } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

/** 一轮对话。edit 类回复带 content，可应用到模板。 */
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** assistant 回复里附带的模板新内容（kind=edit 时） */
  proposed?: string;
  applied?: boolean;
}

export interface AiPanelProps {
  /** 模板模式：传入当前模板，AI 可针对它改写 */
  template?: { name: string; content: string };
  /** 采纳改写时回调，由调用方决定是否落库 */
  onApply?: (content: string) => void;
  onClose?: () => void;
  /** 全局模式下的标题 */
  title?: string;
}

/**
 * AI 助手面板。模板模式下能改写当前模板，全局模式下基于平台数据问答。
 * 一律只给建议：改写结果要用户点「应用」才写回编辑器，再由用户保存。
 */
export function AiPanel({ template, onApply, onClose, title }: AiPanelProps) {
  const [status, setStatus] = useState<api.AiStatus | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getAiStatus()
      .then(s => { setStatus(s); if (s.model) setModel(s.model); })
      .catch(() => setStatus({ configured: false, model: null }));
  }, []);

  // 模型列表按需加载：没配置就不用请求上游
  useEffect(() => {
    if (!status?.configured) return;
    api.getAiModels()
      .then(r => setModels(r.models))
      .catch(() => {/* 上游不支持 /models 时静默降级为手填 */});
  }, [status?.configured]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setTurns(t => [...t, { role: 'user', content: q }]);
    setBusy(true);
    try {
      // 只带最近 6 轮，避免上下文无限膨胀
      const history: api.AiChatTurn[] = turns.slice(-6).map(t => ({ role: t.role, content: t.content }));
      if (template) {
        const r = await api.aiEdit(template.name, template.content, q, model || undefined, history);
        setTurns(t => [...t, {
          role: 'assistant',
          content: r.answer || (r.kind === 'edit' ? '已生成修改建议。' : ''),
          proposed: r.kind === 'edit' && r.content ? r.content : undefined,
        }]);
      } else {
        const r = await api.aiAsk(q, model || undefined, history);
        setTurns(t => [...t, { role: 'assistant', content: r.text }]);
      }
    } catch (e) {
      toast.error('AI 请求失败', e instanceof Error ? e.message : undefined);
      setTurns(t => [...t, { role: 'assistant', content: `请求失败：${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  const apply = (idx: number) => {
    const t = turns[idx];
    if (!t?.proposed || !onApply) return;
    onApply(t.proposed);
    setTurns(list => list.map((x, i) => (i === idx ? { ...x, applied: true } : x)));
    toast.success('已写入编辑器', '确认无误后记得保存');
  };

  if (status && !status.configured) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Header title={title ?? 'AI 助手'} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-xs">
            <AlertTriangle size={28} className="mx-auto mb-3 text-fg-subtle" />
            <p className="text-sm text-fg mb-2">尚未配置 AI</p>
            <p className="text-xs text-fg-muted leading-relaxed">
              需要设置接口地址与密钥：
            </p>
            <pre className="mt-2 text-[11px] text-left bg-canvas border border-line rounded
                            p-2 overflow-x-auto text-fg-muted">
{`wrangler secret put AI_BASE_URL
wrangler secret put AI_API_KEY`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header title={title ?? 'AI 助手'} onClose={onClose} />

      {/* 模型选择 */}
      <div className="shrink-0 px-3 py-2 border-b border-line flex items-center gap-2">
        <span className="text-[11px] text-fg-subtle shrink-0">模型</span>
        {models.length > 0 ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="control h-7 py-0 text-[11px] flex-1 min-w-0"
            aria-label="选择模型"
          >
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-2.5-flash-lite"
            className="control h-7 py-0 text-[11px] flex-1 min-w-0"
            aria-label="模型名"
          />
        )}
      </div>

      {/* 对话区 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {turns.length === 0 && (
          <div className="text-xs text-fg-subtle leading-relaxed">
            {template ? (
              <>
                <p className="mb-2">可以让我改这个模板，例如：</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>把写死的 provider 换成占位符</li>
                  <li>加一个 Netflix 分流组</li>
                  <li>这段配置有什么问题</li>
                </ul>
              </>
            ) : (
              <>
                <p className="mb-2">可以问平台数据相关的问题，例如：</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>哪些模板没被引用</li>
                  <li>每个订阅组下有哪些源</li>
                  <li>哪些源标记了 Cloudflare</li>
                </ul>
              </>
            )}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`rounded-[var(--radius-control)] px-3 py-2 text-[13px] leading-relaxed
                             whitespace-pre-wrap break-words ${
              t.role === 'user'
                ? 'bg-accent-soft text-accent max-w-[85%]'
                : 'bg-raised text-fg w-full'
            }`}>
              {t.content}
              {t.proposed && (
                <div className="mt-2 pt-2 border-t border-line flex items-center gap-2">
                  {t.applied ? (
                    <span className="text-xs text-success flex items-center gap-1">
                      <Check size={12} /> 已写入编辑器
                    </span>
                  ) : (
                    <Button size="sm" variant="primary" icon={<Check size={13} />}
                            onClick={() => apply(i)}>
                      应用到编辑器
                    </Button>
                  )}
                  <span className="text-[11px] text-fg-subtle">
                    {t.proposed.length} 字符
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <Loader2 size={13} className="animate-spin" /> 思考中…
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t border-line p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter 发送，Shift+Enter 换行
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={2}
            placeholder={template ? '让我改这个模板…' : '问点什么…'}
            className="control flex-1 min-w-0 resize-none text-[13px] py-1.5"
            aria-label="输入"
          />
          <div className="flex flex-col gap-1">
            <IconButton label="发送" icon={<Send size={15} />} onClick={send} disabled={busy || !input.trim()} />
            {turns.length > 0 && (
              <IconButton label="清空对话" icon={<RotateCcw size={14} />}
                          onClick={() => setTurns([])} disabled={busy} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-line bg-surface">
      <span className="text-sm font-medium text-fg flex items-center gap-1.5">
        <Sparkles size={15} className="text-accent" />
        {title}
      </span>
      {onClose && <IconButton label="关闭" icon={<X size={15} />} onClick={onClose} />}
    </div>
  );
}
