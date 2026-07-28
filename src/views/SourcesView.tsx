import { useEffect, useMemo, useState } from 'react';
import { Plus, Import, Trash2, Settings2, Globe, Search, Gauge, Zap } from 'lucide-react';
import * as api from '../api';
import { Page, PageHeader, EmptyState, LoadingState, Badge } from '../ui/Layout';
import { Button, IconButton } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';
import { SourceDrawer } from './components/SourceDrawer';
import { SourceIcon } from './components/SourceIcon';

export function SourcesView() {
  const [sources, setSources] = useState<api.UrlEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const [gcoreIps, setGcoreIps] = useState<api.GcoreIp[]>([]);
  const [showGcore, setShowGcore] = useState(false);
  const [speedtesting, setSpeedtesting] = useState(false);

  const toast = useToast();
  const dialog = useDialog();

  const load = async () => {
    try {
      const [urls, ips] = await Promise.all([
        api.getUrls(),
        api.getGcoreOptimizedIps().catch(() => [] as api.GcoreIp[]),
      ]);
      setSources(urls);
      setGcoreIps(ips);
    } catch (e) {
      toast.error('加载订阅源失败', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter(s =>
      (s.name ?? '').toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q) ||
      (s.proxyGroup ?? '').toLowerCase().includes(q)
    );
  }, [sources, query]);

  const active = sources.find(s => s.id === activeId) ?? null;

  /** 抽屉内的字段改动：先落库，再更新本地列表 */
  const handlePatch = async (id: string, patch: Partial<api.UrlEntry>) => {
    await api.updateUrl(id, patch);
    setSources(list => list.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleCreate = async () => {
    const result = await dialog.prompt({
      title: '添加订阅源',
      fields: [
        { name: 'url', label: '订阅地址', placeholder: 'https://...', required: true, mono: true },
        { name: 'name', label: '名称（选填）', placeholder: '留空则自动使用域名' },
      ],
      confirmLabel: '添加',
    });
    if (!result) return;

    const url = result.url.trim();
    let name = result.name?.trim();
    if (!name) {
      try { name = new URL(url).hostname; } catch { name = '新订阅源'; }
    }

    try {
      const created = await api.createUrl({ url, name });
      setSources(list => [...list, created]);
      toast.success('订阅源已添加');
      setActiveId(created.id);
    } catch (e) {
      toast.error('添加失败', e instanceof Error ? e.message : undefined);
    }
  };

  const handleImport = async () => {
    const result = await dialog.prompt({
      title: '批量导入订阅源',
      description: '每行一个地址，也可用空格或逗号分隔。',
      fields: [
        {
          name: 'text',
          label: '订阅地址列表',
          multiline: true,
          mono: true,
          required: true,
          placeholder: 'https://a.example.com/sub\nhttps://b.example.com/sub',
        },
      ],
      confirmLabel: '导入',
    });
    if (!result) return;

    const urls = result.text
      .split(/[\s,;|]+/)
      .map(u => u.trim())
      .filter(u => /^https?:\/\//.test(u));

    if (urls.length === 0) {
      toast.error('未识别到有效地址', '地址需以 http:// 或 https:// 开头');
      return;
    }

    const created: api.UrlEntry[] = [];
    const failed: string[] = [];
    for (const url of urls) {
      let name = '导入源';
      try {
        const u = new URL(url);
        const last = u.pathname.split('/').filter(Boolean).pop();
        name = last && last.length > 3 ? `${u.hostname}/${last}` : u.hostname;
      } catch { /* 用默认名 */ }

      try {
        created.push(await api.createUrl({ url, name }));
      } catch {
        failed.push(url);
      }
    }

    setSources(list => [...list, ...created]);
    if (failed.length === 0) {
      toast.success(`已导入 ${created.length} 个订阅源`);
    } else {
      toast.warning(
        `导入 ${created.length} 个，失败 ${failed.length} 个`,
        failed.slice(0, 3).join('，')
      );
    }
  };

  const handleDelete = async (source: api.UrlEntry) => {
    const ok = await dialog.confirm({
      title: `删除「${source.name || source.url}」？`,
      description: '所有引用该订阅源的订阅组会自动移除此关联。此操作不可撤销。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.deleteUrl(source.id);
      setSources(list => list.filter(s => s.id !== source.id));
      if (activeId === source.id) setActiveId(null);
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', e instanceof Error ? e.message : undefined);
    }
  };

  const handleSpeedtest = async () => {
    setSpeedtesting(true);
    try {
      const res = await api.runGcoreSpeedtest();
      toast.info(res.message || '测速任务已在后台启动', '完成后可点击「优选 IP」查看结果');
    } catch (e) {
      toast.error('启动测速失败', e instanceof Error ? e.message : undefined);
    } finally {
      setSpeedtesting(false);
    }
  };

  const refreshGcore = async () => {
    try {
      setGcoreIps(await api.getGcoreOptimizedIps());
      toast.success('优选 IP 已刷新');
    } catch (e) {
      toast.error('刷新失败', e instanceof Error ? e.message : undefined);
    }
  };

  if (loading) {
    return <Page><PageHeader title="订阅源" /><LoadingState /></Page>;
  }

  return (
    <Page>
      <PageHeader
        title="订阅源"
        description="管理上游订阅地址及其解析、优选与中转配置。"
        actions={
          <>
            <Button onClick={handleImport} icon={<Import size={15} />}>批量导入</Button>
            <Button variant="primary" onClick={handleCreate} icon={<Plus size={15} />}>添加订阅源</Button>
          </>
        }
      />

      {/* 工具行：搜索 + Gcore */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称、地址或分组"
            className="control pl-9"
            aria-label="搜索订阅源"
          />
        </div>
        <div className="flex items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button onClick={() => { setShowGcore(v => !v); if (!showGcore) refreshGcore(); }}
                  icon={<Gauge size={15} />}>
            优选 IP
            {gcoreIps.length > 0 && (
              <span className="ml-1 text-xs text-fg-subtle tabular-nums">({gcoreIps.length})</span>
            )}
          </Button>
          <Button onClick={handleSpeedtest} loading={speedtesting} icon={<Zap size={15} />}>
            测速
          </Button>
        </div>
      </div>

      {showGcore && (
        <div className="card p-4 mb-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-fg">Gcore 优选 IP</h3>
            <Button size="sm" variant="ghost" className="shrink-0"
                    onClick={() => setShowGcore(false)}>收起</Button>
          </div>
          {gcoreIps.length === 0 ? (
            <p className="text-sm text-fg-muted">暂无测速记录，点击「测速」在后台开始一次探测。</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {gcoreIps.map(x => (
                <div key={x.ip} className="bg-canvas border border-line rounded-[var(--radius-control)] p-2.5">
                  <p className="text-[13px] font-mono text-fg truncate">{x.ip}</p>
                  <div className="flex items-center justify-between mt-1.5 text-xs">
                    <span className={
                      x.latency < 100 ? 'text-success' : x.latency < 200 ? 'text-warning' : 'text-danger'
                    }>
                      {x.latency}ms
                    </span>
                    <span className={x.loss === 0 ? 'text-fg-subtle' : 'text-danger'}>
                      丢包 {x.loss}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          sources.length === 0 ? (
            <EmptyState
              icon={<Globe size={32} />}
              title="还没有订阅源"
              description="订阅源是上游节点的来源，添加后可在订阅组中按需组合。"
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={handleCreate} icon={<Plus size={15} />}>添加订阅源</Button>
                  <Button onClick={handleImport} icon={<Import size={15} />}>批量导入</Button>
                </div>
              }
            />
          ) : (
            <EmptyState title="没有匹配的订阅源" description={`没有找到包含「${query}」的订阅源。`} />
          )
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map(source => (
              <li key={source.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-raised/40 transition-colors">
                <div className="w-8 h-8 shrink-0 rounded-[var(--radius-control)] border border-line
                                bg-canvas flex items-center justify-center overflow-hidden">
                  <SourceIcon icon={source.icon} />
                </div>

                <button
                  onClick={() => setActiveId(source.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  {/*
                    窄屏下徽章换行到名称下方：徽章不可收缩，若与名称同行会把
                    名称挤成 0 宽度而完全看不见。
                  */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-fg truncate max-w-full">
                      {source.name || '未命名'}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {source.proxyGroup && <Badge tone="warning">{source.proxyGroup}</Badge>}
                      {source.cfOptimize && <Badge tone="accent">CF 优选</Badge>}
                      {source.gcoreOptimize && <Badge tone="accent">Gcore</Badge>}
                      {source.relayRules && <Badge tone="neutral">中转</Badge>}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-fg-muted truncate mt-0.5">{source.url}</p>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {source.lastRefreshedAt && (
                    <span className="hidden md:inline text-xs text-fg-subtle mr-2">
                      {new Date(source.lastRefreshedAt).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                  <IconButton label="配置" icon={<Settings2 size={16} />}
                              onClick={() => setActiveId(source.id)} />
                  {/* 触屏没有 hover，删除按钮在窄屏必须常显 */}
                  <IconButton label="删除" icon={<Trash2 size={16} />}
                              onClick={() => handleDelete(source)}
                              className="md:opacity-0 md:group-hover:opacity-100
                                         md:focus-visible:opacity-100 hover:text-danger" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SourceDrawer
        source={active}
        open={active !== null}
        onClose={() => setActiveId(null)}
        onPatch={handlePatch}
      />
    </Page>
  );
}
