/**
 * MASQUE 节点生成：本地密钥、注册结果到 Mihomo YAML 的转换。
 *
 * 私钥由 WebCrypto 在浏览器本地生成，只有公钥会发往服务端登记，
 * 私钥仅用于在本地拼出 warp-proxies 模板内容。
 */

/**
 * 入口候选池。这些地址均有 usque-custom-pro 的实现佐证，
 * 但仍属"候选"性质 —— 真正权威的入口以注册响应里的 endpoint 为准。
 */
export const ENDPOINTS: { label: string; host: string; kind: 'v4' | 'v6' }[] = [
  { label: '162.159.198.1', host: '162.159.198.1', kind: 'v4' },
  { label: '162.159.198.2', host: '162.159.198.2', kind: 'v4' },
  { label: '162.159.199.2', host: '162.159.199.2', kind: 'v4' },
  { label: '2606:4700:103::1', host: '[2606:4700:103::1]', kind: 'v6' },
  { label: '2606:4700:103::2', host: '[2606:4700:103::2]', kind: 'v6' },
  { label: '2606:4700:104::1', host: '[2606:4700:104::1]', kind: 'v6' },
  { label: '2606:4700:104::2', host: '[2606:4700:104::2]', kind: 'v6' },
];

/** 入口选择模式，语义对齐 usque-custom-pro 的 endpointList() */
export type EndpointMode = 'source-auto' | 'auto-v4' | 'auto-v6' | 'auto-curated' | 'custom';

export const ENDPOINT_MODES: { value: EndpointMode; label: string; hint: string }[] = [
  { value: 'source-auto',  label: '仅注册响应',   hint: '只用 Cloudflare 本次返回的入口，最稳妥但节点数最少。' },
  { value: 'auto-curated', label: '推荐组合',     hint: '注册响应 + IPv4/IPv6 候选，兼顾可用性与节点数量。' },
  { value: 'auto-v4',      label: '注册响应+IPv4', hint: '适合无 IPv6 出口的网络。' },
  { value: 'auto-v6',      label: '注册响应+IPv6', hint: '仅在本机有 IPv6 出口时可用。' },
  { value: 'custom',       label: '完全自定义',   hint: '只用下方手工填写的地址。' },
];

const byKind = (k: 'v4' | 'v6') => ENDPOINTS.filter(e => e.kind === k).map(e => e.host);

/**
 * 按三层优先级组装入口列表：注册响应 → 候选池 → 用户自填。
 *
 * 注册响应排在最前，因为那是 Cloudflare 针对本账号给出的入口；
 * 候选池用于凑出多节点矩阵；自填地址永远追加在末尾且不受模式影响。
 */
export function resolveEndpoints(
  mode: EndpointMode,
  source: { endpointV4?: string; endpointV6?: string } | null,
  extra: string[] = [],
): string[] {
  const v4 = source?.endpointV4 ?? '';
  const v6 = source?.endpointV6 ?? '';

  let list: string[];
  switch (mode) {
    case 'source-auto':  list = [v4, v6]; break;
    case 'auto-v4':      list = [v4, ...byKind('v4')]; break;
    case 'auto-v6':      list = [v6, ...byKind('v6')]; break;
    case 'auto-curated': list = [v4, v6, ...byKind('v4'), ...byKind('v6')]; break;
    case 'custom':       list = []; break;
  }

  // 去重时按裸地址比较，避免注册响应的 "[::1]" 与候选池里同一地址重复出现
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of [...list, ...extra]) {
    const host = h.trim();
    if (!host) continue;
    const key = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(host);
  }
  return out;
}

/** 解析用户自填的入口：支持逗号、空格或换行分隔 */
export function parseExtraEndpoints(raw: string): string[] {
  return raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * 端口预设。上游注册响应会返回自己的 ports 列表，
 * 注册成功后应优先用那一份（见 WarpView 的 portOptions）。
 */
export const PORT_PRESETS: Record<string, number[]> = {
  recommended: [500, 4500, 8095, 443],
  all: [443, 500, 1701, 4500, 4443, 8095, 8443],
  minimal: [500, 4500],
};

export interface MasqueKeys {
  /** SEC1 DER 私钥，Base64 */
  privateKey: string;
  /** SPKI 公钥，Base64 */
  publicKey: string;
}

/** 注册结果的类型定义在 api.ts，这里复用，避免两处声明漂移 */
export type { WarpEnrollResult } from '../api';
import type { WarpEnrollResult as EnrollResult } from '../api';

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * WebCrypto 只能导出 PKCS#8，而 mihomo 的 masque 节点要的是 SEC1（RFC 5915）。
 *
 * 两者都含同一份 32 字节私钥标量和 65 字节公钥点，但 SEC1 还要带曲线 OID
 * （prime256v1, 1.2.840.10045.3.1.7）。直接从 PKCS#8 里裁出的那段缺这个 OID，
 * mihomo 会拒绝，所以这里按 DER 重新拼一遍，产出标准的 121 字节结构。
 */
function pkcs8ToSec1(pkcs8: ArrayBuffer): Uint8Array {
  const raw = new Uint8Array(pkcs8);

  // PKCS#8 尾部内嵌的 SEC1 片段：定位 OCTET STRING(0x04) 包裹的 SEQUENCE(0x30)
  let inner: Uint8Array | null = null;
  for (let i = 0; i < raw.length - 3; i++) {
    if (raw[i] === 0x04 && raw[i + 2] === 0x30 && i + 2 + raw[i + 1] === raw.length) {
      inner = raw.slice(i + 2);
      break;
    }
  }
  if (!inner) inner = raw.slice(26);

  // 从内层 SEQUENCE 中取出私钥标量（OCTET STRING，32 字节）与公钥点（BIT STRING）
  let priv: Uint8Array | null = null;
  let pub: Uint8Array | null = null;
  let i = 2; // 跳过 SEQUENCE 头
  while (i < inner.length) {
    const tag = inner[i];
    const len = inner[i + 1];
    const body = inner.slice(i + 2, i + 2 + len);
    if (tag === 0x04 && len === 0x20) priv = body;
    else if (tag === 0xa1) pub = body;  // [1] 显式标签包裹的 BIT STRING
    i += 2 + len;
  }
  if (!priv) throw new Error('无法从 PKCS#8 中提取私钥');

  // 重新拼装：SEQUENCE { INTEGER 1, OCTET STRING priv, [0] OID, [1] pubkey }
  const OID = [0xa0, 0x0a, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
  const parts: number[] = [0x02, 0x01, 0x01, 0x04, 0x20, ...priv, ...OID];
  if (pub) parts.push(0xa1, pub.length, ...pub);

  return new Uint8Array([0x30, parts.length, ...parts]);
}

/** 本地生成 P-256 密钥对 */
export async function generateKeys(): Promise<MasqueKeys> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const [pkcs8, spki] = await Promise.all([
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
    crypto.subtle.exportKey('spki', pair.publicKey),
  ]);
  const sec1 = pkcs8ToSec1(pkcs8);
  return {
    privateKey: b64(sec1.buffer.slice(sec1.byteOffset, sec1.byteOffset + sec1.byteLength) as ArrayBuffer),
    publicKey: b64(spki),
  };
}

/** 去掉 PEM 头尾与换行，只留 Base64 本体 */
export function pemBody(s: string): string {
  return s.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
}

export interface BuildOptions {
  keys: MasqueKeys;
  result: EnrollResult;
  endpoints: string[];
  ports: number[];
  sni: string;
  mtu: number;
}

/**
 * 生成 warp-proxies 模板内容。
 *
 * 输出不带顶层 proxies: 键 —— 该片段由入口模板 {{INCLUDE: warp-proxies}}
 * 挂在 proxies: 之下，与现有约定保持一致。
 */
export function buildWarpProxies(o: BuildOptions): string {
  const lines: string[] = [
    '# Cloudflare WARP MASQUE 中转节点。本片段挂在入口模板的 proxies: 之下，',
    '# 故不带 proxies: 顶层键，只输出列表项。',
    `# 由 WARP 注册页于 ${new Date().toISOString()} 自动生成，手工改动会在下次注册时被覆盖。`,
  ];

  const pub = pemBody(o.result.peer.publicKey);
  const priv = o.keys.privateKey;
  const ip = o.result.ipv4 ? `${o.result.ipv4}/32` : '';
  const ipv6 = o.result.ipv6 ? `${o.result.ipv6}/128` : '';

  for (const host of o.endpoints) {
    for (const port of o.ports) {
      // 名称沿用现有 "CDN | host | port" 约定，便于策略组用正则匹配
      const bare = host.replace(/^\[|\]$/g, '');
      lines.push(
        `  - name: "CDN | ${bare} | ${port}"`,
        '    type: masque',
        `    server: "${bare}"`,
        `    port: ${port}`,
        `    private-key: "${priv}"`,
        `    public-key: "${pub}"`,
      );
      if (ip) lines.push(`    ip: "${ip}"`);
      if (ipv6) lines.push(`    ipv6: "${ipv6}"`);
      lines.push(
        `    mtu: ${o.mtu}`,
        '    udp: true',
        `    sni: "${o.sni}"`,
        '    ip-stack:',
        '      mode: auto',
        '      congestion-controller: cubic',
        '    remote-dns-resolve: true',
        '    dns:',
        '      - "1.1.1.1"',
        '      - "8.8.8.8"',
        '      - "2606:4700:4700::1111"',
        '      - "2001:4860:4860::8888"',
      );
    }
  }

  return lines.join('\n') + '\n';
}

/** 节点总数，用于在 UI 上预览规模 */
export const nodeCount = (endpoints: string[], ports: number[]) => endpoints.length * ports.length;
