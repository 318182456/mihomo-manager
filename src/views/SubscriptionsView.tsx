import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronDown, Rss, Filter, Play, Wand2, Type,
  Link2Off,
} from 'lucide-react';
import * as api from '../api';
import { Page, PageHeader, EmptyState, LoadingState, Badge } from '../ui/Layout';
import { Button, IconButton } from '../ui/Button';
import { Switch, Checkbox } from '../ui/Form';
import { ReorderableList } from '../ui/ReorderableList';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';
import { buildMatcher, isAdvanced, parseRules, serializeRules } from '../lib/filter';
import type { FilterRule } from '../lib/filter';
import { ProxyNodeList } from './components/ProxyNodeList';
import { SourceIcon } from './components/SourceIcon';

export function SubscriptionsView() {
  const [groups, setGroups] = useState<api.SubscriptionGroup[]>([]);
  const [sources, setSources] = useState<api.UrlEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toast = useToast();
  const dialog = useDialog();

  const load = async () => {
    try {
      const [g, s] = await Promise.all([api.getSubscriptions(), api.getUrls()]);
      setGroups(g);
      setSources(s);
    } catch (e) {
      toast.error('加载失败', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /** 本地立即回显 + 持久化 */
  const patchGroup = async (id: string, patch: Partial<api.SubscriptionGroup>) => {
    setGroups(gs => gs.map(g => (g.id === id ? { ...g, ...patch } : g)));
    try {
      await api.updateSubscription(id, patch);
    } catch (e) {
      toast.error('保存失败', e instanceof Error ? e.message : undefined);
      load(); // 回滚到服务端状态
    }
  };

  const handleCreate = async () => {
    const result = await dialog.prompt({
      title: '新建订阅组',
      fields: [{ name: 'title', label: '订阅组名称', placeholder: '例如 主力节点', required: true }],
      confirmLabel: '创建',
    });
    if (!result) return;

    try {
      const created = await api.createSubscription({
        title: result.title,
        enabled: true,
        filter: '',
        urlIds: [],
        urls: [],
      });
      setGroups(gs => [...gs, created]);
      setExpanded(prev => new Set(prev).add(created.id));
      toast.success('订阅组已创建');
    } catch (e) {
      toast.error('创建失败', e instanceof Error ? e.message : undefined);
    }
  };

  const handleDelete = async (group: api.SubscriptionGroup) => {
    const ok = await dialog.confirm({
      title: `删除订阅组「${group.title}」？`,
      description: '引用该组的订阅链接将无法生成配置。此操作不可撤销。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.deleteSubscription(group.id);
      setGroups(gs => gs.filter(g => g.id !== group.id));
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', e instanceof Error ? e.message : undefined);
    }
  };

  const handleRename = async (group: api.SubscriptionGroup) => {
    const result = await dialog.prompt({
      title: '重命名订阅组',
      fields: [{ name: 'title', label: '名称', defaultValue: group.title, required: true }],
      confirmLabel: '保存',
    });
    if (!result || result.title === group.title) return;
    patchGroup(group.id, { title: result.title });
  };

  if (loading) {
    return <Page><PageHeader title="订阅组" /><LoadingState /></Page>;
  }

  return (
    <Page>
      <PageHeader
        title="订阅组"
        description="从订阅源中挑选与排序，并用筛选规则决定纳入哪些节点。"
        actions={
          <Button variant="primary" onClick={handleCreate} icon={<Plus size={15} />}>
            新建订阅组
          </Button>
        }
      />

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Rss size={32} />}
            title="还没有订阅组"
            description="订阅组把一个或多个订阅源组合起来，并通过筛选规则挑出需要的节点。"
            action={
              <Button variant="primary" onClick={handleCreate} icon={<Plus size={15} />}>
                新建订阅组
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              sources={sources}
              expanded={expanded.has(group.id)}
              onToggle={() => toggleExpand(group.id)}
              onPatch={(patch) => patchGroup(group.id, patch)}
              onDelete={() => handleDelete(group)}
              onRename={() => handleRename(group)}
            />
          ))}
        </div>
      )}
    </Page>
  );
}

function GroupCard({
  group,
  sources,
  expanded,
  onToggle,
  onPatch,
  onDelete,
  onRename,
}: {
  group: api.SubscriptionGroup;
  sources: api.UrlEntry[];
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<api.SubscriptionGroup>) => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const [nodes, setNodes] = useState<api.ProxyNode[] | null>(null);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  const advanced = isAdvanced(group.filter);
  const matcher = useMemo(() => buildMatcher(group.filter), [group.filter]);

  /** 已关联的源，按 urlIds 顺序解析 */
  const linked = useMemo(
    () => group.urlIds
      .map(id => sources.find(s => s.id === id))
      .filter((s): s is api.UrlEntry => !!s),
    [group.urlIds, sources]
  );

  const runTest = async () => {
    setTesting(true);
    try {
      setNodes(await api.getSubscriptionProxies(group.id));
    } catch (e) {
      toast.error('获取节点失败', e instanceof Error ? e.message : undefined);
    } finally {
      setTesting(false);
    }
  };

  const reorder = (from: number, to: number) => {
    const ids = [...group.urlIds];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onPatch({ urlIds: ids, urls: ids.map(id => sources.find(s => s.id === id)).filter(Boolean) as api.UrlEntry[] });
  };

  const toggleSource = (id: string, on: boolean) => {
    const ids = on
      ? [...group.urlIds, id]
      : group.urlIds.filter(x => x !== id);
    onPatch({ urlIds: ids, urls: ids.map(i => sources.find(s => s.id === i)).filter(Boolean) as api.UrlEntry[] });
  };

  return (
    <section className={`card overflow-hidden transition-opacity ${group.enabled ? '' : 'opacity-60'}`}>
      {/* 组头 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? '收起' : '展开'}
          className="w-9 h-9 sm:w-6 sm:h-6 shrink-0 flex items-center justify-center rounded
                     text-fg-subtle hover:text-fg hover:bg-raised transition-colors"
        >
          <ChevronDown size={16} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </button>

        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg truncate">{group.title}</span>
            {!group.enabled && <Badge tone="neutral">已停用</Badge>}
          </div>
          <p className="text-xs text-fg-muted mt-0.5 truncate">
            {group.urlIds.length} 个订阅源
            {group.filter ? ` · ${advanced ? '高级筛选' : '正则筛选'}` : ' · 不筛选'}
          </p>
        </button>

        {/* 窄屏隐藏重命名/删除（展开后在组内也可操作），避免挤压标题 */}
        <div className="flex items-center gap-1 shrink-0">
          <IconButton label="重命名" icon={<Type size={15} />} onClick={onRename} hideBelowSm />
          <IconButton label="删除" icon={<Trash2 size={15} />} onClick={onDelete} hideBelowSm
                      className="hover:text-danger" />
          <div className="sm:pl-2 sm:ml-1 sm:border-l sm:border-line">
            <Switch
              checked={group.enabled}
              onChange={(v) => onPatch({ enabled: v })}
              label={<span className="sr-only">启用订阅组</span>}
            />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line divide-y divide-line animate-fade-in">
          {/* 筛选 */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-fg">
                <Filter size={14} className="text-fg-muted" />
                节点筛选
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Wand2 size={13} />}
                  onClick={() => onPatch({ filter: advanced ? '' : serializeRules([]) })}
                >
                  {advanced ? '切回正则' : '高级模式'}
                </Button>
                <Button size="sm" loading={testing} icon={<Play size={13} />} onClick={runTest}>
                  测试筛选
                </Button>
              </div>
            </div>

            {advanced ? (
              <AdvancedFilter
                rules={parseRules(group.filter)}
                onChange={(rules) => onPatch({ filter: serializeRules(rules) })}
              />
            ) : (
              <div>
                <input
                  value={group.filter}
                  onChange={(e) => onPatch({ filter: e.target.value })}
                  placeholder="正则表达式，留空则不筛选"
                  className={`control control-mono ${matcher.error ? 'border-danger' : ''}`}
                  aria-label="筛选正则"
                />
                {matcher.error && (
                  <p className="text-xs text-danger mt-1.5">正则无效：{matcher.error}</p>
                )}
              </div>
            )}

            {nodes && <ProxyNodeList nodes={nodes} match={matcher.match} />}
          </div>

          {/* 已关联的源 */}
          <div className="p-4 space-y-3">
            <h4 className="text-sm text-fg">已关联订阅源</h4>
            {linked.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-fg-muted
                              bg-canvas border border-line rounded-[var(--radius-control)] px-3 py-2.5">
                <Link2Off size={14} className="shrink-0" />
                尚未关联任何订阅源，请在下方勾选。
              </div>
            ) : (
              <div className="border border-line rounded-[var(--radius-control)] overflow-hidden bg-canvas">
                <ReorderableList
                  items={linked}
                  getKey={(s) => s.id}
                  onReorder={reorder}
                  renderItem={(s) => (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                        <SourceIcon icon={s.icon} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13px] text-fg truncate max-w-full">
                            {s.name || '未命名'}
                          </span>
                          {s.proxyGroup && <Badge tone="warning">{s.proxyGroup}</Badge>}
                        </div>
                        <p className="text-xs font-mono text-fg-subtle truncate">{s.url}</p>
                      </div>
                      <button
                        onClick={() => toggleSource(s.id, false)}
                        aria-label="取消关联"
                        title="取消关联"
                        className="w-9 h-9 sm:w-7 sm:h-7 shrink-0 flex items-center justify-center rounded
                                   text-fg-subtle hover:text-danger hover:bg-raised transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                />
              </div>
            )}
            {linked.length > 1 && (
              <p className="text-xs text-fg-subtle">
                {/* 窄屏没有拖拽手柄，措辞随之调整 */}
                <span className="hidden sm:inline">拖拽手柄或使用箭头按钮可调整顺序，</span>
                <span className="sm:hidden">用箭头按钮调整顺序，</span>
                顺序决定节点在配置中的排列。
              </p>
            )}
          </div>

          {/* 选择源 */}
          <div className="p-4 space-y-3">
            <h4 className="text-sm text-fg">选择订阅源</h4>
            {sources.length === 0 ? (
              <p className="text-sm text-fg-muted">暂无可用订阅源，请先在「订阅源」页面添加。</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sources.map(s => {
                  const checked = group.urlIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`px-3 py-2.5 rounded-[var(--radius-control)] border transition-colors ${
                        checked
                          ? 'bg-accent-soft border-accent/30'
                          : 'bg-canvas border-line hover:border-line-strong'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={(v) => toggleSource(s.id, v)}
                        label={<span className="truncate block">{s.name || '未命名'}</span>}
                        description={<span className="font-mono truncate block">{s.url}</span>}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 窄屏的组操作入口：组头上已隐藏这两个按钮 */}
          <div className="p-4 flex items-center gap-2 sm:hidden">
            <Button size="sm" className="flex-1" icon={<Type size={14} />} onClick={onRename}>
              重命名
            </Button>
            <Button size="sm" className="flex-1" icon={<Trash2 size={14} />} onClick={onDelete}>
              删除订阅组
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

const LOGIC_LABELS: Record<FilterRule['logic'], string> = {
  or: '包含任一',
  and: '必须包含',
  not: '排除',
};

function AdvancedFilter({
  rules,
  onChange,
}: {
  rules: FilterRule[];
  onChange: (rules: FilterRule[]) => void;
}) {
  const update = (i: number, patch: Partial<FilterRule>) => {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-2 bg-canvas border border-line rounded-[var(--radius-control)] p-3">
      {rules.length === 0 && (
        <p className="text-sm text-fg-muted">还没有规则，添加后按「包含任一 / 必须包含 / 排除」组合筛选。</p>
      )}

      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="relative shrink-0">
            <select
              value={rule.logic}
              onChange={(e) => update(i, { logic: e.target.value as FilterRule['logic'] })}
              className="control appearance-none pr-8 py-1.5 text-[13px] w-28"
              aria-label="匹配逻辑"
            >
              {Object.entries(LOGIC_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2
                                              text-fg-subtle pointer-events-none" />
          </div>
          <input
            value={rule.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="关键词或正则片段"
            className="control control-mono py-1.5 flex-1 min-w-0"
            aria-label="匹配内容"
          />
          <IconButton
            label="删除规则"
            icon={<Trash2 size={13} />}
            onClick={() => onChange(rules.filter((_, idx) => idx !== i))}
            className="hover:text-danger"
          />
        </div>
      ))}

      <Button
        size="sm"
        variant="ghost"
        icon={<Plus size={13} />}
        onClick={() => onChange([...rules, { logic: 'or', value: '' }])}
      >
        添加规则
      </Button>
    </div>
  );
}
