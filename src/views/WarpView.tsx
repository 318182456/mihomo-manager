import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Save, ShieldAlert, Cloud, Trash2, Pencil, RefreshCw } from 'lucide-react';
import * as api from '../api';
import {
  ENDPOINT_MODES, PORT_PRESETS, buildWarpProxies, generateKeys, nodeCount,
  parseExtraEndpoints, resolveEndpoints,
  type EndpointMode, type MasqueKeys,
} from '../lib/warp';
import { Page, PageHeader, Section, Badge, EmptyState, LoadingState } from '../ui/Layout';
import { Button, IconButton } from '../ui/Button';
import { Field, TextInput, Select } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';

/** 注册产物落到哪个模板。与 template/warp-proxies.yaml 同名 */
const TARGET_TEMPLATE = 'warp-proxies';

export function WarpView() {
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [deviceName, setDeviceName] = useState('mihomo-manager');
  const [preset, setPreset] = useState<string>('recommended');
  // 默认只用 IPv4：入口模板普遍 ipv6: false，带上 IPv6 候选只会生成一批必然超时的节点。
  // 设备确有 IPv6 出口时，在界面上改选「推荐组合」或「注册响应+IPv6」即可。
  const [mode, setMode] = useState<EndpointMode>('auto-v4');
  const [extra, setExtra] = useState('');
  const [sni, setSni] = useState('www.microsoft.com');
  const [mtu, setMtu] = useState(1280);

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<MasqueKeys | null>(null);
  const [result, setResult] = useState<api.WarpEnrollResult | null>(null);

  const [devices, setDevices] = useState<api.WarpDevice[]>([]);
  const [devLoading, setDevLoading] = useState(true);
  const [actingId, setActingId] = useState('');

  const toast = useToast();
  const dialog = useDialog();

  const loadDevices = async () => {
    try {
      setDevices(await api.getWarpDevices());
    } catch (e) {
      toast.error('加载设备列表失败', e instanceof Error ? e.message : undefined);
    } finally {
      setDevLoading(false);
    }
  };

  useEffect(() => {
    api.getTemplates().then(setTemplates).catch(() => { /* 模板列表失败不阻塞注册 */ });
    loadDevices();
  }, []);

  /** 上游返回的端口优先，未注册时回落到内置预设 */
  const portOptions = useMemo(() => {
    const opts: { value: string; label: string; ports: number[] }[] = [
      { value: 'recommended', label: '推荐 (500/4500/8095/443)', ports: PORT_PRESETS.recommended },
      { value: 'minimal', label: '精简 (500/4500)', ports: PORT_PRESETS.minimal },
      { value: 'all', label: '全部内置 (7 个端口)', ports: PORT_PRESETS.all },
    ];
    const upstream = result?.peer.ports ?? [];
    if (upstream.length) {
      opts.unshift({
        value: 'source',
        label: `上游返回 (${upstream.length} 个端口)`,
        ports: upstream,
      });
    }
    return opts;
  }, [result]);

  const ports = portOptions.find(o => o.value === preset)?.ports ?? PORT_PRESETS.recommended;

  const hosts = useMemo(
    () => resolveEndpoints(mode, result?.peer ?? null, parseExtraEndpoints(extra)),
    [mode, result, extra],
  );
  const total = nodeCount(hosts, ports);

  const yaml = useMemo(() => {
    if (!keys || !result) return '';
    return buildWarpProxies({ keys, result, endpoints: hosts, ports, sni, mtu });
  }, [keys, result, hosts, ports, sni, mtu]);

  // 注册返回后自动切到上游端口，省去手动选择
  useEffect(() => {
    if (result?.peer.ports.length) setPreset('source');
  }, [result]);

  const handleRegister = async () => {
    setBusy(true);
    try {
      const k = await generateKeys();
      const r = await api.registerWarp(k.publicKey, deviceName, k.privateKey);
      setKeys(k);
      setResult(r);
      toast.success(
        r.saved ? '注册成功' : '注册成功（未能写入设备记录）',
        `入口 ${r.peer.endpointV4 || '—'}，下方可调整节点组合`,
      );
      loadDevices();
    } catch (e) {
      setKeys(null);
      setResult(null);
      toast.error('注册失败', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (d: api.WarpDevice) => {
    const res = await dialog.prompt({
      title: '重命名设备',
      description: '会同步修改 Cloudflare 侧的设备名称。',
      confirmLabel: '保存',
      fields: [{ name: 'name', label: '设备名称', defaultValue: d.name, required: true }],
    });
    const name = res?.name?.trim();
    if (!name || name === d.name) return;

    setActingId(d.id);
    try {
      await api.renameWarpDevice(d.id, name);
      toast.success('已重命名');
      loadDevices();
    } catch (e) {
      toast.error('重命名失败', e instanceof Error ? e.message : undefined);
    } finally {
      setActingId('');
    }
  };

  const handleDelete = async (d: api.WarpDevice) => {
    const confirmed = await dialog.confirm({
      title: `注销 ${d.name}？`,
      description: '会向 Cloudflare 注销该设备，凭据随即失效。若模板仍在使用这套凭据，相关节点将无法连接。',
      confirmLabel: '注销',
      danger: true,
    });
    if (!confirmed) return;

    setActingId(d.id);
    try {
      const r = await api.deleteWarpDevice(d.id);
      if (r.upstream) toast.success('已注销');
      else toast.success('已移除本地记录', `上游注销未成功：${r.detail || '原因未知'}`);
      loadDevices();
    } catch (e) {
      toast.error('注销失败', e instanceof Error ? e.message : undefined);
    } finally {
      setActingId('');
    }
  };

  /** 用留存的凭据重建注册结果，让下方的节点生成沿用同一套代码路径 */
  const handleReuse = async (d: api.WarpDevice) => {
    setActingId(d.id);
    try {
      const c = await api.getWarpCredentials(d.id);
      setKeys({ privateKey: c.privateKey, publicKey: '' });
      setResult({
        deviceId: d.deviceId,
        token: '',
        ipv4: c.ipv4,
        ipv6: c.ipv6,
        peer: {
          publicKey: c.peerPublicKey,
          endpointV4: c.endpointV4,
          endpointV6: c.endpointV6,
          endpointHost: '',
          ports: c.ports,
        },
        license: null,
        accountType: d.accountType,
      });
      setDeviceName(d.name);
      toast.success('已载入凭据', '可重新选择入口与端口后写入模板');
    } catch (e) {
      toast.error('载入失败', e instanceof Error ? e.message : undefined);
    } finally {
      setActingId('');
    }
  };

  const handleSave = async () => {
    const target = templates.find(t => t.name === TARGET_TEMPLATE);
    const confirmed = await dialog.confirm({
      title: target ? `覆盖模板 ${TARGET_TEMPLATE}？` : `创建模板 ${TARGET_TEMPLATE}？`,
      description: target
        ? `将写入 ${total} 个 MASQUE 节点，原有内容会被替换且无法撤销。`
        : `将新建模板并写入 ${total} 个 MASQUE 节点。`,
      confirmLabel: target ? '覆盖' : '创建',
      danger: Boolean(target),
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      if (target) await api.updateTemplate(target.id, { content: yaml });
      else await api.createTemplate({ name: TARGET_TEMPLATE, content: yaml });
      setTemplates(await api.getTemplates());
      toast.success('已写入模板', '引用该模板的订阅链接下次拉取即生效');
    } catch (e) {
      toast.error('写入失败', e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="WARP 注册"
        description="在本地生成密钥并注册 Cloudflare MASQUE 设备，直接产出 warp-proxies 模板。"
        actions={
          <Button variant="primary" onClick={handleRegister} loading={busy}
                  icon={<KeyRound size={15} />}>
            注册设备
          </Button>
        }
      />

      <div className="card p-5 space-y-5">
        <Section title="设备与入口" description="私钥在浏览器本地生成，只有公钥会发送到 Cloudflare。">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="设备名称"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              hint="仅用于在 Cloudflare 侧标识，最长 64 字符。"
            />
            <Select
              label="端口组合"
              value={preset}
              onChange={e => setPreset(e.target.value)}
              hint={
                result
                  ? `${ports.length} 个端口 × ${hosts.length} 个入口 = ${total} 个节点。`
                  : '注册后会自动切换到 Cloudflare 返回的端口列表。'
              }
            >
              {portOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>

          <Select
            label="入口来源"
            value={mode}
            onChange={e => setMode(e.target.value as EndpointMode)}
            hint={ENDPOINT_MODES.find(m => m.value === mode)?.hint}
          >
            {ENDPOINT_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>

          <TextInput
            label="追加入口（可选）"
            value={extra}
            onChange={e => setExtra(e.target.value)}
            mono
            placeholder="1.2.3.4, example.com"
            hint="逗号或空格分隔。自填地址不受上面的来源模式影响，始终追加在末尾。"
          />

          <Field
            label={`当前入口（${hosts.length}）`}
            hint={
              result
                ? '排在最前的是 Cloudflare 本次返回的入口，其余为候选地址。'
                : '注册前只能看到候选地址，注册后会把上游返回的入口补到最前面。'
            }
          >
            {hosts.length === 0 ? (
              <p className="text-xs text-fg-subtle">暂无入口，请换个来源模式或手工填写。</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {hosts.map((h, i) => (
                  <span
                    key={h}
                    className={`font-mono text-xs px-2 py-1 rounded-[var(--radius-control)] border
                                ${i === 0 && result
                                  ? 'border-accent/40 text-accent bg-accent/5'
                                  : 'border-line text-fg-muted bg-raised'}`}
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="SNI" value={sni} onChange={e => setSni(e.target.value)} />
            <TextInput
              label="MTU" type="number" value={mtu}
              onChange={e => setMtu(Number(e.target.value) || 1280)}
            />
          </div>
        </Section>
      </div>

      {result && keys && (
        <div className="card p-5 mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-fg">注册结果</h3>
            <Badge tone="success">{total} 个节点</Badge>
            {result.accountType && <Badge tone="neutral">{result.accountType}</Badge>}
          </div>

          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs text-fg-muted">内网 IPv4</dt>
              <dd className="font-mono text-fg mt-0.5">{result.ipv4 || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">内网 IPv6</dt>
              <dd className="font-mono text-fg mt-0.5 break-all">{result.ipv6 || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">上游入口 IPv4</dt>
              <dd className="font-mono text-fg mt-0.5">{result.peer.endpointV4 || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">上游入口 IPv6</dt>
              <dd className="font-mono text-fg mt-0.5 break-all">{result.peer.endpointV6 || '—'}</dd>
            </div>
            {result.peer.ports.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-fg-muted">上游开放端口</dt>
                <dd className="font-mono text-fg mt-0.5">{result.peer.ports.join(', ')}</dd>
              </div>
            )}
          </dl>

          <Field
            label="生成的 warp-proxies 内容"
            hint="确认无误后写入模板；也可全选复制自行处理。"
          >
            <textarea
              readOnly
              value={yaml}
              rows={12}
              className="control font-mono text-xs leading-relaxed"
              onFocus={e => e.currentTarget.select()}
            />
          </Field>

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSave} loading={saving}
                    icon={<Save size={15} />}>
              写入 {TARGET_TEMPLATE} 模板
            </Button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden mt-4">
        <div className="px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-fg">已注册设备</h3>
          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
            凭据存在 Cloudflare KV 中，可随时重新生成节点，无需再次注册。
          </p>
        </div>

        {devLoading ? (
          <LoadingState />
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<Cloud size={32} />}
            title="还没有注册过设备"
            description="点击右上角「注册设备」创建第一个 MASQUE 设备。"
          />
        ) : (
          <ul className="divide-y divide-line">
            {devices.map(d => (
              <li key={d.id} className="flex items-center gap-4 px-5 py-4 group">
                <div className="w-9 h-9 rounded-[var(--radius-control)] bg-raised border border-line
                                flex items-center justify-center text-fg-muted shrink-0">
                  <Cloud size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-fg truncate">{d.name}</p>
                    {d.accountType && <Badge tone="neutral">{d.accountType}</Badge>}
                    {!d.hasPrivateKey && <Badge tone="warning">无私钥</Badge>}
                  </div>
                  <p className="text-xs text-fg-muted mt-0.5 font-mono truncate">
                    {d.ipv4 || '—'} · 入口 {d.endpointV4 || '—'}
                  </p>
                  <p className="text-xs text-fg-subtle mt-0.5">
                    注册于 {new Date(d.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <IconButton
                    label="重新生成节点"
                    icon={<RefreshCw size={16} />}
                    disabled={!d.hasPrivateKey || actingId === d.id}
                    onClick={() => handleReuse(d)}
                  />
                  <IconButton
                    label="重命名"
                    icon={<Pencil size={16} />}
                    disabled={actingId === d.id}
                    onClick={() => handleRename(d)}
                  />
                  <IconButton
                    label="注销"
                    icon={<Trash2 size={16} />}
                    disabled={actingId === d.id}
                    onClick={() => handleDelete(d)}
                    className="hover:text-danger"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5 mt-4">
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-fg-muted shrink-0 mt-0.5" />
          <div className="text-sm text-fg-muted space-y-1.5 leading-relaxed">
            <p>
              私钥与设备 token 保存在 Cloudflare KV 中，以便随时重新生成节点。
              能读取 KV 或拿到管理密码的人即可取得完整 WARP 凭据。
            </p>
            <p>
              多个节点共用同一套凭据，换的只是入口 IP 和端口，并不等于多个账号，
              出口 IP 也不保证不同。
            </p>
            <p>
              本页每次只注册一个设备。请勿用脚本批量调用，以免触发 Cloudflare 的频率限制。
            </p>
          </div>
        </div>
      </div>
    </Page>
  );
}
