import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { dracula } from '@uiw/codemirror-theme-dracula';
import jsyaml from 'js-yaml';
import { Plus, Trash2, Save, FileCode2, CheckCircle2, XCircle, Circle } from 'lucide-react';
import * as api from '../api';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, LoadingState } from '../ui/Layout';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';

export function TemplatesView() {
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    <div className="flex h-full min-h-0">
      {/* 模板列表 */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-line">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wide">模板</span>
          <IconButton label="新建模板" icon={<Plus size={15} />} onClick={handleCreate} />
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
                <IconButton label="新建模板" icon={<Plus size={16} />} onClick={handleCreate}
                            className="lg:hidden" />
                <IconButton label="删除模板" icon={<Trash2 size={16} />} onClick={() => handleDelete(active)}
                            className="lg:hidden hover:text-danger" />
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
            action={<Button variant="primary" onClick={handleCreate} icon={<Plus size={15} />}>新建模板</Button>}
          />
        )}
      </section>
    </div>
  );
}
