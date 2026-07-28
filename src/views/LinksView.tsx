import { useEffect, useState } from 'react';
import { Plus, Copy, Pencil, Trash2, Link2, Check } from 'lucide-react';
import * as api from '../api';
import { Page, PageHeader, EmptyState, LoadingState, Badge } from '../ui/Layout';
import { Button, IconButton } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { TextInput, Select } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';

const INTERVALS = [1, 3, 6, 12, 24, 48, 72, 168];

function formatInterval(hours?: number) {
  const h = hours ?? 24;
  if (h % 24 === 0 && h >= 24) return `${h / 24} 天`;
  return `${h} 小时`;
}

/** 桌面表格与手机卡片共用的派生字段 */
function describe(
  link: api.GeneratedLink,
  groups: api.SubscriptionGroup[],
  templates: api.Template[],
) {
  const groupName = groups.find(g => g.id === link.subscriptionGroupId)?.title;
  const tplName = templates.find(t => t.id === link.templateId)?.name;
  return {
    expired: !!link.expiresAt && new Date(link.expiresAt) < new Date(),
    groupNode: groupName ?? <span className="text-danger">订阅组已删除</span>,
    tplNode: tplName ?? <span className="text-danger">模板已删除</span>,
  };
}

interface FormState {
  name: string;
  group: string;
  subscriptionGroupId: string;
  templateId: string;
  proxyUpdateInterval: number;
}

const EMPTY_FORM: FormState = {
  name: '',
  group: '',
  subscriptionGroupId: '',
  templateId: '',
  proxyUpdateInterval: 24,
};

export function LinksView() {
  const [links, setLinks] = useState<api.GeneratedLink[]>([]);
  const [groups, setGroups] = useState<api.SubscriptionGroup[]>([]);
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toast = useToast();
  const dialog = useDialog();

  const load = async () => {
    try {
      const [l, g, t] = await Promise.all([
        api.getLinks(),
        api.getSubscriptions(),
        api.getTemplates(),
      ]);
      setLinks(l);
      setGroups(g);
      setTemplates(t);
    } catch (e) {
      toast.error('加载失败', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      subscriptionGroupId: groups[0]?.id ?? '',
      templateId: templates[0]?.id ?? '',
    });
    setDrawerOpen(true);
  };

  const openEdit = (link: api.GeneratedLink) => {
    setEditingId(link.id);
    setForm({
      name: link.name,
      group: link.group,
      subscriptionGroupId: link.subscriptionGroupId,
      templateId: link.templateId,
      proxyUpdateInterval: link.proxyUpdateInterval ?? 24,
    });
    setDrawerOpen(true);
  };

  const canSubmit = form.name.trim() && form.subscriptionGroupId && form.templateId;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        group: form.group.trim() || 'Default',
        subscriptionGroupId: form.subscriptionGroupId,
        templateId: form.templateId,
        proxyUpdateInterval: form.proxyUpdateInterval,
      };
      if (editingId) {
        await api.updateLink(editingId, payload);
        toast.success('链接已更新');
      } else {
        await api.createLink({ ...payload, expiresAt: null });
        toast.success('链接已生成');
      }
      setDrawerOpen(false);
      load();
    } catch (e) {
      toast.error(editingId ? '更新失败' : '生成失败', e instanceof Error ? e.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (link: api.GeneratedLink) => {
    const url = api.buildSubUrl(link.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(c => (c === link.id ? null : c)), 1800);
    } catch {
      // 剪贴板不可用（非安全上下文等），退回到展示 URL 供手动复制
      await dialog.prompt({
        title: '手动复制链接',
        description: '当前环境不允许自动写入剪贴板，请手动复制下方地址。',
        fields: [{ name: 'url', label: '订阅地址', defaultValue: url, mono: true }],
        confirmLabel: '完成',
      });
    }
  };

  const handleDelete = async (link: api.GeneratedLink) => {
    const ok = await dialog.confirm({
      title: `删除链接「${link.name}」？`,
      description: '已分发出去的该地址将立即失效，且无法恢复。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteLink(link.id);
      toast.success('已删除');
      load();
    } catch (e) {
      toast.error('删除失败', e instanceof Error ? e.message : undefined);
    }
  };

  if (loading) {
    return <Page><PageHeader title="订阅链接" /><LoadingState /></Page>;
  }

  const blocked = groups.length === 0 || templates.length === 0;

  return (
    <Page>
      <PageHeader
        title="订阅链接"
        description="生成分发给客户端的订阅地址。"
        actions={
          <Button variant="primary" onClick={openCreate} disabled={blocked} icon={<Plus size={15} />}>
            生成链接
          </Button>
        }
      />

      {blocked && (
        <div className="card p-4 mb-4 text-sm text-warning bg-warning-soft border-warning/25">
          生成链接前，需要至少有一个订阅组和一个模板。
        </div>
      )}

      <div className="card overflow-hidden">
        {links.length === 0 ? (
          <EmptyState
            icon={<Link2 size={32} />}
            title="还没有订阅链接"
            description="订阅链接把订阅组与模板组合成一个可分发的地址。"
            action={
              !blocked && (
                <Button variant="primary" onClick={openCreate} icon={<Plus size={15} />}>
                  生成链接
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* 桌面：表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-5 py-3 font-medium text-fg-muted text-xs">名称</th>
                    <th className="px-5 py-3 font-medium text-fg-muted text-xs">目标分组</th>
                    <th className="px-5 py-3 font-medium text-fg-muted text-xs">订阅组 / 模板</th>
                    <th className="px-5 py-3 font-medium text-fg-muted text-xs">更新间隔</th>
                    <th className="px-5 py-3 font-medium text-fg-muted text-xs text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {links.map(link => {
                    const m = describe(link, groups, templates);
                    return (
                      <tr key={link.id} className="group hover:bg-raised/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-fg">{link.name}</span>
                            {m.expired && <Badge tone="danger">已过期</Badge>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-fg-muted font-mono text-[13px]">{link.group}</td>
                        <td className="px-5 py-3.5">
                          <div className="text-fg-muted text-[13px]">{m.groupNode}</div>
                          <div className="text-fg-subtle text-xs mt-0.5">{m.tplNode}</div>
                        </td>
                        <td className="px-5 py-3.5 text-fg-muted text-[13px] tabular-nums">
                          {formatInterval(link.proxyUpdateInterval)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant={copiedId === link.id ? 'primary' : 'secondary'}
                              onClick={() => handleCopy(link)}
                              icon={copiedId === link.id ? <Check size={13} /> : <Copy size={13} />}
                            >
                              {copiedId === link.id ? '已复制' : '复制'}
                            </Button>
                            <IconButton label="编辑" icon={<Pencil size={14} />}
                                        onClick={() => openEdit(link)} />
                            <IconButton label="删除" icon={<Trash2 size={14} />}
                                        onClick={() => handleDelete(link)}
                                        className="hover:text-danger" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 手机：卡片。5 列表格在 375px 宽下无法阅读 */}
            <ul className="md:hidden divide-y divide-line">
              {links.map(link => {
                const m = describe(link, groups, templates);
                return (
                  <li key={link.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-fg truncate max-w-full">{link.name}</span>
                      {m.expired && <Badge tone="danger">已过期</Badge>}
                    </div>

                    <dl className="mt-2.5 space-y-1 text-[13px]">
                      <div className="flex gap-2">
                        <dt className="text-fg-subtle w-16 shrink-0">分组</dt>
                        <dd className="text-fg-muted font-mono truncate">{link.group}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-fg-subtle w-16 shrink-0">订阅组</dt>
                        <dd className="text-fg-muted truncate">{m.groupNode}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-fg-subtle w-16 shrink-0">模板</dt>
                        <dd className="text-fg-muted truncate">{m.tplNode}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-fg-subtle w-16 shrink-0">间隔</dt>
                        <dd className="text-fg-muted tabular-nums">
                          {formatInterval(link.proxyUpdateInterval)}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        className="flex-1"
                        variant={copiedId === link.id ? 'primary' : 'secondary'}
                        onClick={() => handleCopy(link)}
                        icon={copiedId === link.id ? <Check size={13} /> : <Copy size={13} />}
                      >
                        {copiedId === link.id ? '已复制' : '复制链接'}
                      </Button>
                      <Button size="sm" onClick={() => openEdit(link)} icon={<Pencil size={13} />}>
                        编辑
                      </Button>
                      <IconButton label="删除" icon={<Trash2 size={15} />}
                                  onClick={() => handleDelete(link)}
                                  className="w-9 h-9 hover:text-danger" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? '编辑订阅链接' : '生成订阅链接'}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
              {editingId ? '保存' : '生成'}
            </Button>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <TextInput
            label="链接名称"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="例如 我的手机"
            autoFocus
          />
          <TextInput
            label="目标分组"
            hint="留空则使用 Default。用于在客户端中归类。"
            value={form.group}
            onChange={(e) => setForm(f => ({ ...f, group: e.target.value }))}
            placeholder="Default"
          />
          <Select
            label="订阅组"
            value={form.subscriptionGroupId}
            onChange={(e) => setForm(f => ({ ...f, subscriptionGroupId: e.target.value }))}
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.title}{g.enabled ? '' : '（已停用）'}
              </option>
            ))}
          </Select>
          <Select
            label="模板"
            value={form.templateId}
            onChange={(e) => setForm(f => ({ ...f, templateId: e.target.value }))}
          >
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select
            label="订阅更新间隔"
            hint="写入配置的 update-interval，客户端据此自动刷新。"
            value={String(form.proxyUpdateInterval)}
            onChange={(e) => setForm(f => ({ ...f, proxyUpdateInterval: parseInt(e.target.value, 10) }))}
          >
            {INTERVALS.map(h => (
              <option key={h} value={h}>{formatInterval(h)}</option>
            ))}
          </Select>
        </div>
      </Drawer>
    </Page>
  );
}
