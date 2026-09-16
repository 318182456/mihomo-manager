import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { dracula } from '@uiw/codemirror-theme-dracula';
import jsyaml from 'js-yaml';
import { Plus, Trash2, Save, FileCode2, CheckCircle2, XCircle, Circle, Upload, Sparkles } from 'lucide-react';
import * as api from '../api';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, LoadingState } from '../ui/Layout';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';
import { AiPanel } from './components/AiPanel';

export function TemplatesView() {
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 已保存内容的快照，用于判定「有未保存修改」 */
  const savedRef = useRef<Map<string, { name: string; content: string }>>(new Map());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const toast = useToast();
  const dialog = useDialog();

  const active = templates.find(t => t.id === activeId) ?? null;
  const isDirty = activeId !== null && dirtyIds.has(activeId);

  const yamlError = useMemo(() => {
    if (!active) return null;
    try {
      jsyaml.load(active.content);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [active?.content]);

  useEffect(() => {
    api.getTemplates()
      .then(data => {
        setTemplates(data);
        savedRef.current = new Map(data.map(t => [t.id, { name: t.name, content: t.content }]));
        if (data.length > 0) setActiveId(data[0].id);
      })
      .catch(e => toast.error('加载模板失败', e instanceof Error ? e.message : undefined))
      .finally(() => setLoading(false));
  }, []);

  const markDirty = (id: string, next: { name: string; content: string }) => {
    const saved = savedRef.current.get(id);
    const dirty = !saved || saved.name !== next.name || saved.content !== next.content;
    setDirtyIds(prev => {
      const s = new Set(prev);
      if (dirty) s.add(id); else s.delete(id);
      return s;
    });
  };

  const patchActive = (patch: Partial<api.Template>) => {
    if (!active) return;
    const next = { ...active, ...patch };
    setTemplates(ts => ts.map(t => (t.id === active.id ? next : t)));
    markDirty(active.id, { name: next.name, content: next.content });
  };

  const handleSave = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await api.updateTemplate(active.id, { name: active.name, content: active.content });
      savedRef.current.set(active.id, { name: active.name, content: active.content });
      setDirtyIds(prev => {
        const s = new Set(prev);
        s.delete(active.id);
        return s;
      });
      toast.success('已保存');
    } catch (e) {
      toast.error('保存失败', e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S 保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (active && isDirty && !saving) handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, isDirty, saving]);

  /** 切换模板前，若当前有未保存修改则先确认 */
  const switchTo = async (id: string) => {
    if (id === activeId) return;
    if (isDirty) {
      const ok = await dialog.confirm({
        title: '放弃未保存的修改？',
        description: `模板「${active?.name}」有未保存的改动，切换后将丢失。`,
        confirmLabel: '放弃修改',
        danger: true,
      });
      if (!ok) return;
      // 回滚到已保存内容
      const saved = savedRef.current.get(activeId!);
      if (saved) {
        setTemplates(ts => ts.map(t => (t.id === activeId ? { ...t, ...saved } : t)));
      }
      setDirtyIds(prev => {
        const s = new Set(prev);
        s.delete(activeId!);
        return s;
      });
    }
    setActiveId(id);
  };

  /** 上传 .yaml 文件为新模板。同名模板走覆盖确认，避免误删已有内容。 */
  const uploadFiles = async (files: File[]) => {
    const yamlFiles = files.filter(f => /\.(ya?ml)$/i.test(f.name));
    if (yamlFiles.length === 0) {
      toast.error('请选择 .yaml 或 .yml 文件');
      return;
    }

    setUploading(true);
    let created = 0, updated = 0, lastId: string | null = null;
    try {
      for (const file of yamlFiles) {
        const content = await file.text();
        // 模板名去掉扩展名，与 INCLUDE 的引用方式保持一致
        const name = file.name.replace(/\.(ya?ml)$/i, '');

        try {
          jsyaml.load(content);
        } catch (e) {
          const go = await dialog.confirm({
            title: `「${file.name}」YAML 语法有误`,
            description: `${e instanceof Error ? e.message : String(e)}

片段模板（含 {{...}} 占位符）出现此提示通常是正常的，仍可继续上传。`,
            confirmLabel: '仍然上传',
          });
          if (!go) continue;
        }

        const exist = templates.find(t => t.name === name);
        if (exist) {
          const ok = await dialog.confirm({
            title: `覆盖模板「${name}」？`,
            description: '该名称的模板已存在，上传将替换其全部内容。此操作不可撤销。',
            confirmLabel: '覆盖',
            danger: true,
          });
          if (!ok) continue;
          await api.updateTemplate(exist.id, { name, content });
          setTemplates(ts => ts.map(t => (t.id === exist.id ? { ...t, name, content } : t)));
          savedRef.current.set(exist.id, { name, content });
          setDirtyIds(prev => {
            const s = new Set(prev);
            s.delete(exist.id);
            return s;
          });
          lastId = exist.id;
          updated++;
        } else {
          const tpl = await api.createTemplate({ name, content });
          setTemplates(ts => [...ts, tpl]);
          savedRef.current.set(tpl.id, { name: tpl.name, content: tpl.content });
          lastId = tpl.id;
          created++;
        }
      }

      if (lastId) setActiveId(lastId);
      if (created || updated) {
        toast.success(`已上传 ${created + updated} 个模板`,
          [created && `新建 ${created}`, updated && `覆盖 ${updated}`].filter(Boolean).join(' · '));
      }
    } catch (e) {
      toast.error('上传失败', e instanceof Error ? e.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';                                   // 复位，允许重复上传同一文件
    if (files.length) uploadFiles(files);
  };

  const handleCreate = async () => {
    const result = await dialog.prompt({
      title: '新建模板',
      fields: [{ name: 'name', label: '模板名称', placeholder: '例如 default.yaml', required: true }],
      confirmLabel: '创建',
    });
    if (!result) return;

    try {
      const tpl = await api.createTemplate({ name: result.name, content: '# 在此编写 Mihomo 配置模板\n' });
      setTemplates(ts => [...ts, tpl]);
      savedRef.current.set(tpl.id, { name: tpl.name, content: tpl.content });
      setActiveId(tpl.id);
      toast.success('模板已创建');
    } catch (e) {
      toast.error('创建失败', e instanceof Error ? e.message : undefined);
    }
  };

  const handleDelete = async (tpl: api.Template) => {
    const ok = await dialog.confirm({
      title: `删除模板「${tpl.name}」？`,
      description: '引用该模板的订阅链接将无法正常生成配置。此操作不可撤销。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.deleteTemplate(tpl.id);
      setTemplates(ts => ts.filter(t => t.id !== tpl.id));
      savedRef.current.delete(tpl.id);
      if (activeId === tpl.id) {
        const rest = templates.filter(t => t.id !== tpl.id);
        setActiveId(rest[0]?.id ?? null);
      }
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', e instanceof Error ? e.message : undefined);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div
      className="relative flex h-full min-h-0"
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        // 仅在离开容器本身时关闭，避免子元素间移动触发闪烁
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) uploadFiles(files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml"
        multiple
        onChange={handleFilePick}
        className="hidden"
      />

      {dragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center
                        bg-accent-soft/80 border-2 border-dashed border-accent
                        rounded-[var(--radius-control)] pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload size={28} />
            <span className="text-sm font-medium">松开以上传模板</span>
            <span className="text-xs opacity-70">支持 .yaml / .yml，可多选</span>
          </div>
        </div>
      )}

      {/* 模板列表 */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-line">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wide">模板</span>
          <div className="flex items-center gap-0.5">
            <IconButton label="上传 YAML" icon={<Upload size={15} />}
                        onClick={() => fileInputRef.current?.click()} disabled={uploading} />
            <IconButton label="新建模板" icon={<Plus size={15} />} onClick={handleCreate} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {templates.map(tpl => {
            const dirty = dirtyIds.has(tpl.id);
            return (
              <div key={tpl.id} className="group flex items-center">
                <button
                  onClick={() => switchTo(tpl.id)}
                  className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-control)]
                              text-sm min-w-0 transition-colors ${
                    activeId === tpl.id
                      ? 'bg-accent-soft text-accent'
                      : 'text-fg-muted hover:text-fg hover:bg-raised'
                  }`}
                >
                  <FileCode2 size={14} className="shrink-0" />
                  <span className="truncate flex-1 text-left">{tpl.name}</span>
                  {dirty && <Circle size={7} className="shrink-0 fill-current" />}
                </button>
                <IconButton
                  label="删除"
                  icon={<Trash2 size={13} />}
                  onClick={() => handleDelete(tpl)}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
                />
              </div>
            );
          })}
          {templates.length === 0 && (
            <p className="text-sm text-fg-subtle px-2.5 py-2">暂无模板</p>
          )}
        </div>
      </aside>

      {/* 编辑区 */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0">
        {active ? (
          <>
            <div className="h-14 lg:h-12 shrink-0 px-3 md:px-4 flex items-center gap-2 sm:gap-3
                            border-b border-line bg-surface">
              {/* 窄屏用下拉切换模板；占满剩余宽度以便显示长文件名 */}
              <select
                value={activeId ?? ''}
                onChange={(e) => switchTo(e.target.value)}
                className="lg:hidden control h-9 py-0 flex-1 min-w-0 text-[13px]"
                aria-label="选择模板"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {dirtyIds.has(t.id) ? `• ${t.name}` : t.name}
                  </option>
                ))}
              </select>

              <input
                value={active.name}
                onChange={(e) => patchActive({ name: e.target.value })}
                className="hidden lg:block bg-transparent border-none text-sm font-medium text-fg
                           px-0 focus:outline-none min-w-0 flex-1"
                aria-label="模板名称"
              />

              <div className="hidden lg:block lg:flex-none" />

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <IconButton label="上传 YAML" icon={<Upload size={16} />}
                            onClick={() => fileInputRef.current?.click()} disabled={uploading}
                            className="lg:hidden" />
                <IconButton label="新建模板" icon={<Plus size={16} />} onClick={handleCreate}
                            className="lg:hidden" />
                <IconButton label="删除模板" icon={<Trash2 size={16} />} onClick={() => handleDelete(active)}
                            className="lg:hidden hover:text-danger" />
                <IconButton
                  label="AI 助手"
                  icon={<Sparkles size={16} />}
                  onClick={() => setAiOpen(v => !v)}
                  className={aiOpen ? 'text-accent' : ''}
                />
                <Button
                  size="sm"
                  variant={isDirty ? 'primary' : 'secondary'}
                  onClick={handleSave}
                  loading={saving}
                  disabled={!isDirty}
                  icon={<Save size={14} />}
                >
                  <span className="hidden sm:inline">{isDirty ? '保存' : '已保存'}</span>
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <CodeMirror
                value={active.content}
                height="100%"
                extensions={[yaml()]}
                onChange={(val) => patchActive({ content: val })}
                theme={dracula}
                className="h-full"
              />
            </div>

            <div className="h-8 shrink-0 px-4 flex items-center justify-between border-t border-line
                            bg-surface text-xs">
              {yamlError ? (
                <span className="flex items-center gap-1.5 text-danger min-w-0">
                  <XCircle size={12} className="shrink-0" />
                  <span className="truncate font-mono">{yamlError}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 size={12} />
                  YAML 语法正确
                </span>
              )}
              <span className="text-fg-subtle shrink-0 ml-4 hidden sm:inline">
                {isDirty ? '未保存 · Ctrl+S 保存' : 'YAML · UTF-8'}
              </span>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<FileCode2 size={32} />}
            title="还没有模板"
            description="模板定义生成配置的骨架，订阅节点会按占位符注入其中。"
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={handleCreate} icon={<Plus size={15} />}>新建模板</Button>
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()}
                        loading={uploading} icon={<Upload size={15} />}>上传 YAML</Button>
              </div>
            }
          />
        )}
      </section>

      {/* AI 助手侧边栏。改写结果先写回编辑器，仍需用户保存才落库。 */}
      {aiOpen && active && (
        <aside className="hidden md:flex w-80 lg:w-96 shrink-0 flex-col border-l border-line bg-surface">
          <AiPanel
            template={{ name: active.name, content: active.content }}
            onApply={(content) => patchActive({ content })}
            onClose={() => setAiOpen(false)}
          />
        </aside>
      )}
    </div>
  );
}
