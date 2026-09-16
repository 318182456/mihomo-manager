import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, DownloadCloud, ListTree, Plus, Search, Ban, CircleCheck } from 'lucide-react';
import * as api from '../../api';
import { Drawer } from '../../ui/Drawer';
import { Button } from '../../ui/Button';
import { Section, Badge, StatusDot, EmptyState } from '../../ui/Layout';
import { TextInput, TextArea, Select, Checkbox, Switch, SegmentedControl, Field } from '../../ui/Form';
import { useToast } from '../../ui/Toast';
import { useDialog } from '../../ui/Dialog';
import { useGfwStatus } from '../../hooks/useGfwStatus';
import { ICON_GROUPS } from '../../lib/icons';
import { SourceIcon } from './SourceIcon';

type TabId = 'basic' | 'refresh' | 'optimize' | 'relay' | 'nodes';

const TABS: { id: TabId; label: string }[] = [
  { id: 'basic',    label: '基础' },
  { id: 'refresh',  label: '刷新与缓存' },
  { id: 'optimize', label: '优选 IP' },
  { id: 'relay',    label: '中转' },
  { id: 'nodes',    label: '节点' },
];

/**
 * 订阅源配置抽屉。
 * 原实现把全部 8 个配置区块在列表行内一次性铺开（数百像素高），
 * 这里改为抽屉 + 分区标签页，一次只呈现一类配置。
 */
export function SourceDrawer({
  source,
  open,
  onClose,
  onPatch,
}: {
  source: api.UrlEntry | null;
  open: boolean;
  onClose: () => void;
  /** 立即持久化字段改动 */
  onPatch: (id: string, patch: Partial<api.UrlEntry>) => Promise<void>;
}) {
  const [tab, setTab] = useState<TabId>('basic');
  const [draft, setDraft] = useState<api.UrlEntry | null>(source);
  const [busy, setBusy] = useState<string | null>(null);
  const [nodes, setNodes] = useState<api.ProxyNode[] | null>(null);

  const toast = useToast();
  const dialog = useDialog();

  useEffect(() => {
    setDraft(source);
    setNodes(null);
    if (source) setTab('basic');
  }, [source?.id]);

  // 订阅源域名的被墙状态
  const domain = useMemo(() => {
    if (!draft?.url) return '';
    try {
      return new URL(draft.url.split(/[\s,;|]+/)[0]).hostname;
    } catch {
      return '';
    }
  }, [draft?.url]);

  if (!draft) return null;
  const id = draft.id;

  /** 本地立即回显 + 持久化 */
  const commit = async (patch: Partial<api.UrlEntry>) => {
    setDraft(d => (d ? { ...d, ...patch } : d));
    try {
      await onPatch(id, patch);
    } catch (e) {
      toast.error('保存失败', e instanceof Error ? e.message : undefined);
    }
  };

  /** 仅本地回显，失焦时才提交 */
  const stage = (patch: Partial<api.UrlEntry>) => setDraft(d => (d ? { ...d, ...patch } : d));

  const runTask = async (key: string, task: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await task());
    } catch (e) {
      toast.error('操作失败', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const loadNodes = async () => {
    setBusy('nodes');
    try {
      setNodes(await api.getUrlProxies(id));
    } catch (e) {
      toast.error('获取节点失败', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const addRelayRule = async (node: api.ProxyNode) => {
    const result = await dialog.prompt({
      title: `为「${node.name}」添加中转`,
      description: `原始地址 ${node.server}:${node.port}`,
      fields: [
        {
          name: 'target',
          label: '中转地址',
          placeholder: '103.181.164.41:25142',
          required: true,
          mono: true,
          hint: '格式为 主机:端口',
        },
        {
          name: 'rename',
          label: '名称修饰（选填）',
          placeholder: '+[香港中转]',
          hint: <>以 <code className="text-fg-muted">+</code> 开头为添加前缀；含 <code className="text-fg-muted">{'{name}'}</code> 可保留原名；否则直接替换。</>,
        },
      ],
      confirmLabel: '添加规则',
    });
    if (!result) return;

    const target = result.target.trim();
    if (!/^.+:\d+$/.test(target)) {
      toast.error('中转地址格式不正确', '需要形如 host:port');
      return;
    }

    let line = `${node.server}:${node.port} -> ${target}`;
    if (result.rename?.trim()) line += ` | ${result.rename.trim()}`;
    const next = draft.relayRules ? `${draft.relayRules.trim()}\n${line}` : line;

    await commit({ relayRules: next });
    toast.success('中转规则已添加', line);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={draft.name || '未命名订阅源'}
      subtitle={draft.url}
      width="lg"
      footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}
    >
      <div className="sticky top-0 z-10 bg-surface border-b border-line px-4 sm:px-5">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => t.id === 'nodes' && !nodes ? (setTab(t.id), loadNodes()) : setTab(t.id)}
              className={`relative px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors
                          ${tab === t.id ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {tab === 'basic' && (
          <div className="space-y-6">
            <Section>
              <TextInput
                label="名称"
                value={draft.name ?? ''}
                onChange={(e) => stage({ name: e.target.value })}
                onBlur={(e) => commit({ name: e.target.value })}
                placeholder="订阅源别名"
              />
              <TextArea
                label="订阅地址"
                hint="支持填写多个地址，以空格、逗号或换行分隔。"
                rows={2}
                mono
                value={draft.url}
                onChange={(e) => stage({ url: e.target.value })}
                onBlur={(e) => commit({ url: e.target.value.trim() })}
                placeholder="https://..."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  label="所属分组"
                  hint="对应模板中的 {{URL_GROUPS}} 占位符。"
                  value={draft.proxyGroup ?? ''}
                  onChange={(e) => stage({ proxyGroup: e.target.value })}
                  onBlur={(e) => commit({ proxyGroup: e.target.value.trim() || undefined })}
                  placeholder="例如 香港"
                />
                <Field label="分组图标" className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-[var(--radius-control)] border border-line
                                    bg-canvas flex items-center justify-center overflow-hidden">
                      <SourceIcon icon={draft.icon} size={18} />
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <select
                        value={draft.icon ?? ''}
                        onChange={(e) => commit({ icon: e.target.value || undefined })}
                        className="control appearance-none pr-9"
                        aria-label="分组图标"
                      >
                        <option value="">不使用图标</option>
                        {ICON_GROUPS.map(g => (
                          <optgroup key={g.label} label={g.label}>
                            {g.options.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                </Field>
              </div>
            </Section>

            <Section title="节点名称处理" className="pt-6 border-t border-line">
              <TextInput
                label="统一名称前缀"
                hint="为该源的所有节点名添加统一前缀。"
                value={draft.namePrefix ?? ''}
                onChange={(e) => stage({ namePrefix: e.target.value })}
                onBlur={(e) => commit({ namePrefix: e.target.value || undefined })}
                placeholder="例如 台湾"
              />
              <Checkbox
                checked={draft.isCloudflare ?? false}
                onChange={(v) => commit({ isCloudflare: v || undefined })}
                label="该源的节点走 Cloudflare"
                description="勾选后会被模板的 {{PROVIDERS_NOCF}} 与 {{URL_GROUP_PROVIDERS_NOCF:xxx}} 排除，避免用 CF 节点代理 Cloudflare 自家流量。"
              />
              <Checkbox
                checked={draft.simplifyNames ?? false}
                onChange={(v) => commit({ simplifyNames: v })}
                label="简化节点名称"
                description="移除名称中的 +WS / +TLS / +Reality 等传输层标记。"
              />
              <Checkbox
                checked={draft.onlyCdnAtNight ?? false}
                onChange={(v) => commit({ onlyCdnAtNight: v })}
                label="夜间仅显示 CDN 节点"
              />
            </Section>

            {domain && <DomainStatus domain={domain} />}
          </div>
        )}

        {tab === 'refresh' && (
          <div className="space-y-6">
            <Section
              title="自动刷新"
              description="每天 UTC 00:00 调用下方接口，获取最新的订阅地址并更新。"
            >
              <TextInput
                label="接口地址"
                mono
                value={draft.refreshUrl ?? ''}
                onChange={(e) => stage({ refreshUrl: e.target.value })}
                onBlur={(e) => commit({ refreshUrl: e.target.value.trim() || undefined })}
                placeholder="https://example.com/api/getSubscribe"
              />
              <Select
                label="解析方式"
                value={draft.refreshType ?? ''}
                onChange={(e) => commit({ refreshType: e.target.value || undefined })}
              >
                <option value="">默认：直接提取接口返回的 JSON</option>
                <option value="hoshi_v2board">Hoshi 动态跳转（Portal 地址 + 账号密码）</option>
                <option value="v2board">普通 V2Board（API 根地址 + 账号密码）</option>
              </Select>
              <TextInput
                label="响应字段路径"
                hint="留空则自动探测。支持点号路径，如 data.subscribe_url。"
                mono
                value={draft.refreshJsonPath ?? ''}
                onChange={(e) => stage({ refreshJsonPath: e.target.value })}
                onBlur={(e) => commit({ refreshJsonPath: e.target.value || undefined })}
                placeholder="subscribe_url"
              />
              <JsonHeadersInput
                value={draft.refreshHeaders}
                onCommit={(v) => commit({ refreshHeaders: v })}
              />

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!draft.refreshUrl}
                  loading={busy === 'refresh'}
                  icon={<RefreshCw size={13} />}
                  onClick={() => runTask('refresh', async () => {
                    const r = await api.refreshUrl(id);
                    setDraft(d => (d ? { ...d, url: r.url, lastRefreshedAt: new Date().toISOString() } : d));
                    return `已刷新：${r.url}`;
                  })}
                >
                  立即刷新地址
                </Button>
                <Button
                  size="sm"
                  loading={busy === 'sync'}
                  icon={<DownloadCloud size={13} />}
                  onClick={() => runTask('sync', async () => {
                    const r = await api.syncUrlCache(id);
                    return r.msg || '缓存已同步';
                  })}
                >
                  拉取上游并更新缓存
                </Button>
                {draft.lastRefreshedAt && (
                  <span className="text-xs text-fg-subtle ml-auto">
                    最近刷新 {new Date(draft.lastRefreshedAt).toLocaleString('zh-CN')}
                  </span>
                )}
              </div>
            </Section>

            <Section title="缓存与网络" className="pt-6 border-t border-line">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  label="缓存时长（分钟）"
                  hint="留空为默认 5 分钟；0 表示永不过期；-1 表示不缓存。"
                  type="number"
                  min={-1}
                  value={draft.cacheTtl !== undefined ? Math.round(draft.cacheTtl / 60) : ''}
                  onChange={(e) => {
                    const m = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                    stage({ cacheTtl: m === undefined || isNaN(m) ? undefined : m * 60 });
                  }}
                  onBlur={(e) => {
                    const m = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                    commit({ cacheTtl: m === undefined || isNaN(m) ? undefined : m * 60 });
                  }}
                  placeholder="5"
                />
                <TextInput
                  label="代理中转地址"
                  hint="选填。支持 {{URL}} 占位符。"
                  mono
                  value={draft.proxyUrl ?? ''}
                  onChange={(e) => stage({ proxyUrl: e.target.value })}
                  onBlur={(e) => {
                    // 显式传 null 才能在服务端清除该字段
                    const v = e.target.value.trim();
                    commit({ proxyUrl: (v || null) as unknown as string | undefined });
                  }}
                  placeholder="http://vps:8080/?url="
                />
              </div>
            </Section>

            <Section title="Hysteria 2 微调" description="仅对该源中的 Hysteria 2 节点生效。"
                     className="pt-6 border-t border-line">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TextInput
                  label="上行限速" mono value={draft.hysteria2Up ?? ''}
                  onChange={(e) => stage({ hysteria2Up: e.target.value })}
                  onBlur={(e) => commit({ hysteria2Up: e.target.value || undefined })}
                  placeholder="30 Mbps"
                />
                <TextInput
                  label="下行限速" mono value={draft.hysteria2Down ?? ''}
                  onChange={(e) => stage({ hysteria2Down: e.target.value })}
                  onBlur={(e) => commit({ hysteria2Down: e.target.value || undefined })}
                  placeholder="150 Mbps"
                />
                <TextInput
                  label="MTU" type="number" mono value={draft.hysteria2Mtu ?? ''}
                  onChange={(e) => stage({ hysteria2Mtu: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                  onBlur={(e) => commit({ hysteria2Mtu: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                  placeholder="1350"
                />
              </div>
            </Section>

            <Section title="Akile 流量监控" description="用于修正与服务商不一致的流量数据。"
                     className="pt-6 border-t border-line">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TextInput
                  label="Server ID" mono value={draft.akileServerId ?? ''}
                  onChange={(e) => stage({ akileServerId: e.target.value })}
                  onBlur={(e) => commit({ akileServerId: e.target.value.trim() || undefined })}
                  placeholder="105569"
                />
                <TextInput
                  label="Api Client" mono value={draft.akileApiClient ?? ''}
                  onChange={(e) => stage({ akileApiClient: e.target.value })}
                  onBlur={(e) => commit({ akileApiClient: e.target.value.trim() || undefined })}
                />
                <TextInput
                  label="Api Secret" type="password" mono value={draft.akileApiSecret ?? ''}
                  onChange={(e) => stage({ akileApiSecret: e.target.value })}
                  onBlur={(e) => commit({ akileApiSecret: e.target.value.trim() || undefined })}
                />
              </div>
            </Section>
          </div>
        )}

        {tab === 'optimize' && (
          <div className="space-y-6">
            <Section title="Cloudflare 优选" description="把 CDN 节点克隆到延迟更低的优选 IP。">
              <Switch
                checked={draft.cfOptimize ?? false}
                onChange={(v) => commit({ cfOptimize: v })}
                label="启用 Cloudflare 优选"
              />
              {draft.cfOptimize && (
                <div className="space-y-4 pl-12 animate-fade-in">
                  <div className="space-y-3">
                    <Checkbox
                      checked={draft.cfOptimizeOnlyCdn ?? false}
                      onChange={(v) => commit({ cfOptimizeOnlyCdn: v })}
                      label="仅优化名称含 cdn 的节点"
                    />
                    <Checkbox
                      checked={draft.cfOptimizeHideOriginal ?? false}
                      onChange={(v) => commit({ cfOptimizeHideOriginal: v })}
                      label="隐藏原始节点"
                    />
                  </div>

                  <SegmentedControl
                    label="优选来源"
                    value={draft.cfOptimizeType ?? 'api'}
                    onChange={(v) => commit({ cfOptimizeType: v })}
                    options={[
                      { value: 'api', label: '系统测速' },
                      { value: 'custom', label: '自定义' },
                    ]}
                  />

                  {(draft.cfOptimizeType ?? 'api') === 'api' ? (
                    <div className="space-y-4 animate-fade-in">
                      <TextInput
                        label="优选节点数量" type="number" min={1} max={50}
                        className="max-w-[12rem]"
                        value={draft.cfOptimizeNum ?? ''}
                        onChange={(e) => stage({ cfOptimizeNum: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                        onBlur={(e) => commit({ cfOptimizeNum: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                        placeholder="5"
                        hint="默认 5，最多 50。"
                      />
                      <IspPicker
                        value={draft.cfOptimizeIsp}
                        onChange={(v) => commit({ cfOptimizeIsp: v })}
                      />
                    </div>
                  ) : (
                    <div className="space-y-4 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <TextInput label="电信" mono value={draft.cfOptimizeDomainCt ?? ''}
                          onChange={(e) => stage({ cfOptimizeDomainCt: e.target.value })}
                          onBlur={(e) => commit({ cfOptimizeDomainCt: e.target.value.trim() || undefined })}
                          placeholder="telecom.example.com" />
                        <TextInput label="联通" mono value={draft.cfOptimizeDomainCu ?? ''}
                          onChange={(e) => stage({ cfOptimizeDomainCu: e.target.value })}
                          onBlur={(e) => commit({ cfOptimizeDomainCu: e.target.value.trim() || undefined })}
                          placeholder="unicom.example.com" />
                        <TextInput label="移动" mono value={draft.cfOptimizeDomainCmcc ?? ''}
                          onChange={(e) => stage({ cfOptimizeDomainCmcc: e.target.value })}
                          onBlur={(e) => commit({ cfOptimizeDomainCmcc: e.target.value.trim() || undefined })}
                          placeholder="mobile.example.com" />
                      </div>
                      <TextInput
                        label="通用优选地址"
                        hint="上方各运营商未填写时使用。多个地址以逗号或空格分隔。"
                        mono
                        value={draft.cfOptimizeDomain ?? ''}
                        onChange={(e) => stage({ cfOptimizeDomain: e.target.value })}
                        onBlur={(e) => commit({ cfOptimizeDomain: e.target.value.trim() || undefined })}
                      />
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Gcore 优选" className="pt-6 border-t border-line">
              <Switch
                checked={draft.gcoreOptimize ?? false}
                onChange={(v) => commit({ gcoreOptimize: v })}
                label="启用 Gcore 优选"
              />
              {draft.gcoreOptimize && (
                <div className="space-y-4 pl-12 animate-fade-in">
                  <Checkbox
                    checked={draft.gcoreOptimizeHideOriginal ?? false}
                    onChange={(v) => commit({ gcoreOptimizeHideOriginal: v })}
                    label="隐藏原始节点"
                  />
                  <SegmentedControl
                    label="优选来源"
                    value={draft.gcoreOptimizeType ?? 'api'}
                    onChange={(v) => commit({ gcoreOptimizeType: v })}
                    options={[
                      { value: 'api', label: '系统测速' },
                      { value: 'custom', label: '自定义' },
                    ]}
                  />
                  {(draft.gcoreOptimizeType ?? 'api') === 'api' ? (
                    <TextInput
                      label="优选节点数量" type="number" min={1} max={20}
                      className="max-w-[12rem]"
                      value={draft.gcoreOptimizeNum ?? ''}
                      onChange={(e) => stage({ gcoreOptimizeNum: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                      onBlur={(e) => commit({ gcoreOptimizeNum: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                      placeholder="3"
                      hint="默认 3，最多 20。"
                    />
                  ) : (
                    <TextInput
                      label="自定义优选地址"
                      hint="多个地址以逗号或空格分隔；留空则直接使用原域名连接。"
                      mono
                      value={draft.gcoreOptimizeDomain ?? ''}
                      onChange={(e) => stage({ gcoreOptimizeDomain: e.target.value })}
                      onBlur={(e) => commit({ gcoreOptimizeDomain: e.target.value.trim() || undefined })}
                      placeholder="seoul-node.gcdn.co, 1.2.3.4"
                    />
                  )}
                </div>
              )}
            </Section>
          </div>
        )}

        {tab === 'relay' && (
          <Section
            title="中转映射"
            description="把节点的原始地址替换为中转地址。每行一条规则。"
          >
            <TextArea
              rows={6}
              mono
              value={draft.relayRules ?? ''}
              onChange={(e) => stage({ relayRules: e.target.value })}
              onBlur={(e) => commit({ relayRules: e.target.value.trim() || undefined })}
              placeholder={'proxy.host:21872 -> 103.181.164.41:25142 | +香港中转\nproxy.host:21873 -> 103.181.164.41:25143 | IEPL - {name}'}
            />
            <div className="text-xs text-fg-subtle space-y-1 leading-relaxed">
              <p>格式：<code className="text-fg-muted">原地址:端口 -&gt; 中转地址:端口 | 名称修饰</code></p>
              <p>名称修饰以 <code className="text-fg-muted">+</code> 开头为前缀；含 <code className="text-fg-muted">{'{name}'}</code> 保留原名；否则整体替换。</p>
            </div>
            <Checkbox
              checked={draft.excludeRelayed ?? false}
              onChange={(v) => commit({ excludeRelayed: v })}
              label="屏蔽命中中转规则的原节点"
              description="启用后，被中转规则匹配到的节点不会以原始形态出现在结果中。"
            />
            <div className="pt-2">
              <Button size="sm" icon={<ListTree size={13} />} onClick={() => { setTab('nodes'); if (!nodes) loadNodes(); }}>
                从节点列表添加规则
              </Button>
            </div>
          </Section>
        )}

        {tab === 'nodes' && (
          <Section
            title="节点列表"
            description="从上游订阅拉取的原始节点，可直接为单个节点生成中转规则。"
          >
            <div className="flex items-center gap-2">
              <Button size="sm" loading={busy === 'nodes'} icon={<RefreshCw size={13} />} onClick={loadNodes}>
                {nodes ? '重新获取' : '获取节点'}
              </Button>
              {nodes && <span className="text-xs text-fg-muted">共 {nodes.length} 个节点</span>}
            </div>

            {nodes === null ? (
              busy !== 'nodes' && (
                <EmptyState title="尚未获取节点" description="点击上方按钮从上游订阅拉取节点列表。" />
              )
            ) : nodes.length === 0 ? (
              <EmptyState title="未解析到节点" description="请检查订阅地址是否有效，或先执行一次上游拉取。" />
            ) : (
              <div className="border border-line rounded-[var(--radius-control)] overflow-hidden">
                <div className="max-h-[26rem] overflow-y-auto">
                  {/* 桌面：表格 */}
                  <table className="hidden sm:table w-full text-[13px]">
                    <thead className="sticky top-0 bg-raised">
                      <tr className="text-left border-b border-line">
                        <th className="px-3 py-2 font-medium text-fg-muted text-xs">名称</th>
                        <th className="px-3 py-2 font-medium text-fg-muted text-xs">类型</th>
                        <th className="px-3 py-2 font-medium text-fg-muted text-xs">地址</th>
                        <th className="px-3 py-2 font-medium text-fg-muted text-xs text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {nodes.map((n, i) => (
                        <tr key={`${n.name}-${i}`} className="hover:bg-raised/40">
                          <td className="px-3 py-2 max-w-[12rem] truncate text-fg" title={n.name}>{n.name}</td>
                          <td className="px-3 py-2">
                            <Badge tone="neutral">{n.type ?? '—'}</Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                            {n.server}:{n.port}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" icon={<Plus size={12} />}
                                    onClick={() => addRelayRule(n)}>
                              中转
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* 手机：每个节点一行卡片 */}
                  <ul className="sm:hidden divide-y divide-line">
                    {nodes.map((n, i) => (
                      <li key={`${n.name}-${i}`} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-fg break-words">{n.name}</p>
                            <p className="text-xs font-mono text-fg-muted mt-1 break-all">
                              {n.server}:{n.port}
                            </p>
                          </div>
                          <Badge tone="neutral">{n.type ?? '—'}</Badge>
                        </div>
                        <Button size="sm" variant="secondary" className="w-full mt-2.5"
                                icon={<Plus size={13} />} onClick={() => addRelayRule(n)}>
                          配置中转
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Section>
        )}
      </div>
    </Drawer>
  );
}

/** 请求头 JSON 输入，带即时校验 */
function JsonHeadersInput({
  value,
  onCommit,
}: {
  value: Record<string, string> | undefined;
  onCommit: (v: Record<string, string> | undefined) => void;
}) {
  const [text, setText] = useState(() => (value ? JSON.stringify(value, null, 2) : ''));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value ? JSON.stringify(value, null, 2) : '');
    setError(null);
  }, [JSON.stringify(value ?? null)]);

  return (
    <TextArea
      label="附加请求头"
      hint="选填，JSON 对象格式。"
      error={error ?? undefined}
      rows={3}
      mono
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (!e.target.value.trim()) { setError(null); return; }
        try { JSON.parse(e.target.value); setError(null); }
        catch { setError('JSON 格式不正确'); }
      }}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (!raw) { onCommit(undefined); setError(null); return; }
        try {
          onCommit(JSON.parse(raw));
          setError(null);
        } catch {
          setError('JSON 格式不正确，未保存');
        }
      }}
      placeholder={'{\n  "authorization": "Bearer xxx"\n}'}
    />
  );
}

const ISPS = [
  { code: 'ct', label: '电信' },
  { code: 'cu', label: '联通' },
  { code: 'cmcc', label: '移动' },
];

function IspPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const active = value ? value.split(',').filter(Boolean) : ['ct', 'cu', 'cmcc'];
  const toggle = (code: string, on: boolean) => {
    const next = on ? [...new Set([...active, code])] : active.filter(c => c !== code);
    onChange(next.join(','));
  };
  return (
    <Field label="优选运营商">
      <div className="flex flex-wrap gap-4">
        {ISPS.map(isp => (
          <Checkbox
            key={isp.code}
            checked={active.includes(isp.code)}
            onChange={(v) => toggle(isp.code, v)}
            label={isp.label}
          />
        ))}
      </div>
    </Field>
  );
}

/** 订阅源域名的被墙状态 */
function DomainStatus({ domain }: { domain: string }) {
  const { statuses, check, mark } = useGfwStatus([domain]);
  const status = statuses.get(domain);
  const toast = useToast();

  const tone = status?.checking ? 'accent'
    : status?.blocked === true ? 'danger'
    : status?.blocked === false ? 'success'
    : 'neutral';

  const label = status?.checking ? '检测中'
    : status?.blocked === true ? '被墙'
    : status?.blocked === false ? '正常'
    : '未检测';

  return (
    <Section title="域名可达性" className="pt-6 border-t border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusDot tone={tone} pulse={status?.checking} />
          <span className="text-sm font-mono text-fg truncate min-w-0">{domain}</span>
          {status?.ip && status.ip !== domain && (
            <span className="text-xs font-mono text-fg-subtle shrink-0">→ {status.ip}</span>
          )}
          <Badge tone={tone}>{label}</Badge>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="ghost" icon={<Search size={13} />}
                  disabled={status?.checking}
                  onClick={async () => {
                    try {
                      const b = await check(domain);
                      toast[b ? 'warning' : 'success'](`${domain} ${b ? '被墙' : '正常'}`);
                    } catch (e) {
                      toast.error('检测失败', e instanceof Error ? e.message : undefined);
                    }
                  }}>
            检测
          </Button>
          <Button size="sm" variant="ghost" icon={<Ban size={13} />}
                  disabled={status?.checking}
                  onClick={() => mark(domain, true).then(() => toast.success('已标记为被墙'))}>
            标记被墙
          </Button>
          <Button size="sm" variant="ghost" icon={<CircleCheck size={13} />}
                  disabled={status?.checking}
                  onClick={() => mark(domain, false).then(() => toast.success('已标记为正常'))}>
            标记正常
          </Button>
        </div>
      </div>
      {status?.updatedAt && (
        <p className="text-xs text-fg-subtle">
          更新于 {new Date(status.updatedAt).toLocaleString('zh-CN')}
        </p>
      )}
    </Section>
  );
}
