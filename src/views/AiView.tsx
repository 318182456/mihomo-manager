import { useRef, useState } from 'react';
import { Upload, Loader2, AlertTriangle, FileCode2 } from 'lucide-react';
import * as api from '../api';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';
import { AiPanel } from './components/AiPanel';

/**
 * 全局 AI 助手页。左侧是配置拆分工具，右侧是基于平台数据的问答。
 * 拆分与问答都只产出建议，写入模板一律走既有 API 并需用户确认。
 */
export function AiView() {
  const [split, setSplit] = useState<api.AiSplitResult | null>(null);
  const [rawConfig, setRawConfig] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const dialog = useDialog();

  const pickFile = async (file: File) => {
    const content = await file.text();
    setRawConfig(content);
    setBusy(true);
    setSplit(null);
    try {
      const r = await api.aiSplit(content);
      setSplit(r);
      toast.success('分析完成', `${r.sections.length} 个区块，${r.groups.length} 个分组`);
    } catch (e) {
      toast.error('分析失败', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  /** 把切出的区块存成模板。名称由用户确认，避免覆盖同名模板。 */
  const saveSection = async (key: string) => {
    if (!rawConfig) return;
    const lines = rawConfig.split(/\r?\n/);
    const secs = splitLocal(rawConfig);
    const sec = secs.find(x => x.key === key);
    if (!sec) return;

    const result = await dialog.prompt({
      title: `保存「${key}」为模板`,
      fields: [{ name: 'name', label: '模板名称', placeholder: key, required: true }],
      confirmLabel: '保存',
    });
    if (!result) return;

    try {
      const existing = await api.getTemplates();
      const hit = existing.find(t => t.name === result.name);
      if (hit) {
        const ok = await dialog.confirm({
          title: `覆盖模板「${result.name}」？`,
          description: '该名称已存在，保存将替换其全部内容。',
          confirmLabel: '覆盖',
          danger: true,
        });
        if (!ok) return;
        await api.updateTemplate(hit.id, { name: result.name, content: sec.content });
      } else {
        await api.createTemplate({ name: result.name, content: sec.content });
      }
      toast.success('已保存', `${result.name} (${lines.length ? sec.content.length : 0} 字符)`);
    } catch (e) {
      toast.error('保存失败', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 左：拆分工具 */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
        <div className="h-12 shrink-0 px-4 flex items-center border-b border-line bg-surface">
          <span className="text-sm font-medium text-fg">配置拆分</span>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-fg-muted leading-relaxed mb-3">
              上传一份完整的 Clash / Mihomo 配置，按顶层键切成区块，
              并由 AI 判断哪些分组该改用占位符。切块是纯代码完成的；
              送给 AI 的只有 proxy-groups 段，且凭据已打码。
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) pickFile(f);
              }}
            />
            <Button variant="primary" icon={<Upload size={15} />} loading={busy}
                    onClick={() => fileRef.current?.click()}>
              选择配置文件
            </Button>
          </div>

          {busy && (
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 size={14} className="animate-spin" /> 分析中…
            </div>
          )}

          {split && (
            <>
              <div>
                <h3 className="text-xs font-medium text-fg-muted uppercase tracking-wide mb-2">
                  区块（{split.sections.length}）
                </h3>
                <div className="border border-line rounded-[var(--radius-control)] overflow-hidden">
                  {split.sections.map(s => (
                    <div key={s.key}
                         className="flex items-center gap-3 px-3 py-2 border-b border-line last:border-b-0
                                    text-[13px] hover:bg-raised">
                      <FileCode2 size={13} className="shrink-0 text-fg-subtle" />
                      <span className="font-mono flex-1 min-w-0 truncate">{s.key}</span>
                      <span className="text-xs text-fg-subtle shrink-0">{s.lines} 行</span>
                      <Button size="sm" variant="ghost" onClick={() => saveSection(s.key)}>
                        存为模板
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {split.groups.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-fg-muted uppercase tracking-wide mb-2">
                    分组建议（{split.groups.filter(g => g.action === 'replace').length} 个建议改写 /
                    共 {split.groups.length}）
                  </h3>
                  <div className="border border-line rounded-[var(--radius-control)] overflow-hidden">
                    {split.groups.map(g => (
                      <div key={g.name}
                           className="px-3 py-2 border-b border-line last:border-b-0 text-[13px]">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 truncate">{g.name}</span>
                          {g.mismatch && (
                            <span title="AI 结论与代码检测不一致，请复核"
                                  className="shrink-0 text-warning flex items-center gap-1 text-xs">
                              <AlertTriangle size={12} /> 待复核
                            </span>
                          )}
                          <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                            g.action === 'replace'
                              ? 'bg-accent-soft text-accent'
                              : 'text-fg-subtle'
                          }`}>
                            {g.action === 'replace' ? '建议改写' : '保留'}
                          </span>
                        </div>
                        {g.action === 'replace' && g.suggestedUse && (
                          <p className="mt-1 font-mono text-[11px] text-fg-muted break-all">
                            {g.suggestedUse}
                          </p>
                        )}
                        {g.reason && (
                          <p className="mt-0.5 text-[11px] text-fg-subtle">{g.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-fg-subtle leading-relaxed">
                    建议仅供参考。「待复核」表示 AI 的结论和代码扫描结果不一致，
                    采纳前请自行确认。
                  </p>
                </div>
              )}

              {split.usage && (
                <p className="text-[11px] text-fg-subtle">
                  本次消耗 {split.usage.total_tokens ?? '?'} tokens
                  （输入 {split.usage.prompt_tokens ?? '?'} / 输出 {split.usage.completion_tokens ?? '?'}）
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* 右：问答 */}
      <aside className="hidden md:flex w-80 lg:w-96 shrink-0 flex-col border-l border-line bg-surface">
        <AiPanel title="平台问答" />
      </aside>
    </div>
  );
}

/** 与后端一致的切块逻辑，用于把选中的区块取出来存模板 */
function splitLocal(raw: string) {
  const lines = raw.split(/\r?\n/);
  const heads: { key: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*):/);
    if (m) heads.push({ key: m[1], line: i });
  }
  return heads.map((h, i) => ({
    key: h.key,
    content: lines.slice(h.line, i + 1 < heads.length ? heads[i + 1].line : lines.length).join('\n'),
  }));
}
