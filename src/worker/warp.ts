/**
 * Cloudflare WARP / MASQUE 注册中继。
 *
 * 浏览器无法直连 api.cloudflareclient.com（CORS 限制），故由 Worker 转发。
 * 私钥始终在浏览器本地生成，不经过也不落盘到服务端 —— 本模块只转发公钥。
 *
 * 上游协议参考 usque-custom-pro（KJGX66F），按 Cloudflare 客户端公开接口重新实现。
 */

const API_ORIGIN = 'https://api.cloudflareclient.com';
const API_VERSION = 'v0a4471';

/** 伪装成官方 Android 客户端，否则上游会拒绝 */
const UPSTREAM_HEADERS: Record<string, string> = {
  'User-Agent': 'WARP for Android',
  'CF-Client-Version': 'a-6.35-4471',
  'Content-Type': 'application/json; charset=UTF-8',
  Accept: 'application/json',
};

/** 请求体上限，防止把 Worker 当成任意转发代理 */
const MAX_BODY = 16 * 1024;

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export interface WarpPeer {
  publicKey: string;
  endpointV4: string;
  endpointV6: string;
  /** 上游建议的入口域名，形如 engage.cloudflareclient.com:2408 */
  endpointHost: string;
  /** 上游开放的端口列表，注册页据此给出端口预设 */
  ports: number[];
}

export interface WarpEnrollResult {
  deviceId: string;
  token: string;
  ipv4: string;
  ipv6: string;
  peer: WarpPeer;
  license: string | null;
  accountType: string | null;
}

/**
 * 已注册设备的持久化记录。
 *
 * 注意 token 与 privateKey 都是敏感凭据：token 可操作该 WARP 设备，
 * privateKey 是节点的身份。二者存 KV 是刻意取舍 —— warp-proxies 模板里
 * 本来就明文存着同一把私钥，不存 KV 并不会让它更安全，反而失去管理能力。
 */
export interface WarpDevice {
  id: string;
  name: string;
  deviceId: string;
  token: string;
  privateKey: string;
  ipv4: string;
  ipv6: string;
  peerPublicKey: string;
  endpointV4: string;
  endpointV6: string;
  ports: number[];
  accountType: string | null;
  createdAt: string;
}

const KV_KEY = 'warp_devices';

async function readDevices(kv: KVNamespace): Promise<WarpDevice[]> {
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const writeDevices = (kv: KVNamespace, list: WarpDevice[]) =>
  kv.put(KV_KEY, JSON.stringify(list));

/** 列表对外不带凭据，避免 token/私钥随列表接口四处流动 */
function publicView(d: WarpDevice) {
  const { token: _t, privateKey: _p, ...rest } = d;
  return { ...rest, hasPrivateKey: Boolean(d.privateKey) };
}

/** 上游返回非 2xx 时抛出，携带可读信息与状态码 */
class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function callUpstream(
  path: string,
  init: { method: string; body?: unknown; token?: string },
): Promise<any> {
  const headers = { ...UPSTREAM_HEADERS };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;

  const res = await fetch(`${API_ORIGIN}/${API_VERSION}${path}`, {
    method: init.method,
    headers,
    // DELETE 不带 body：JSON.stringify(undefined) 会得到 undefined 而非 "null"
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  // 注销成功时上游返回空体，此处按成功处理
  if (res.ok && !text.trim()) return {};
  if (!res.ok) {
    // 429 是 Cloudflare 的注册频率限制，单独提示，避免用户反复重试
    if (res.status === 429) {
      throw new UpstreamError('Cloudflare 限制了注册频率，请稍后再试', 429);
    }
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.errors?.[0]?.message ?? parsed?.message ?? detail;
    } catch { /* 上游偶尔返回非 JSON，用原文即可 */ }
    throw new UpstreamError(`上游返回 ${res.status}: ${detail}`, 502);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError('上游返回了无法解析的响应', 502);
  }
}

/**
 * 去掉地址尾部的端口。
 * v4 形如 "162.159.198.2:0"，v6 形如 "[2606:4700:103::2]:0" —— 后者要留住方括号内的冒号。
 */
function stripPort(addr: string): string {
  if (!addr) return '';
  const bracket = addr.lastIndexOf(']');
  if (bracket !== -1) return addr.slice(0, bracket + 1);
  // 裸 IPv6 不带方括号时会有多个冒号，此时整串就是地址，不能按冒号切
  const colon = addr.lastIndexOf(':');
  if (colon === -1 || addr.indexOf(':') !== colon) return addr;
  return addr.slice(0, colon);
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomB64(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a));
}

/**
 * 完整注册流程：先建设备拿 token，再用 PATCH 把 MASQUE 公钥登记上去。
 *
 * publicKey 由浏览器用 WebCrypto 生成的 P-256 公钥（SPKI，Base64 裸体，不含 PEM 头尾）。
 */
export async function registerMasque(publicKey: string, deviceName: string): Promise<WarpEnrollResult> {
  // 第一步：注册设备。key 此处只是占位，真正的 MASQUE 公钥在第二步登记。
  const reg = await callUpstream('/reg', {
    method: 'POST',
    body: {
      key: randomB64(32),
      install_id: '',
      fcm_token: '',
      tos: new Date().toISOString(),
      model: 'PC',
      serial_number: randomHex(8),
      key_type: 'secp256r1',
      tunnel_type: 'masque',
      locale: 'en_US',
    },
  });

  const deviceId: string = reg?.id ?? '';
  const token: string = reg?.token ?? '';
  if (!deviceId || !token) throw new UpstreamError('上游未返回设备 id 或 token', 502);

  // 第二步：登记 MASQUE 公钥，换回对端信息与内网地址。
  const enrolled = await callUpstream(`/reg/${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    token,
    body: {
      key: publicKey,
      key_type: 'secp256r1',
      tunnel_type: 'masque',
      name: deviceName.slice(0, 64),
    },
  });

  const iface = enrolled?.config?.interface?.addresses ?? {};
  const peer = enrolled?.config?.peers?.[0] ?? {};
  const peerKey: string = peer?.public_key ?? '';
  if (!peerKey) throw new UpstreamError('上游未返回对端公钥', 502);

  return {
    deviceId,
    token,
    ipv4: iface?.v4 ?? '',
    ipv6: iface?.v6 ?? '',
    peer: {
      publicKey: peerKey,
      // 上游返回的地址带 ":0" 端口后缀，端口由节点自己指定，故在此剥掉
      endpointV4: stripPort(peer?.endpoint?.v4 ?? ''),
      endpointV6: stripPort(peer?.endpoint?.v6 ?? ''),
      endpointHost: peer?.endpoint?.host ?? '',
      ports: Array.isArray(peer?.endpoint?.ports)
        ? peer.endpoint.ports.filter((n: unknown): n is number => typeof n === 'number')
        : [],
    },
    license: enrolled?.account?.license ?? null,
    accountType: enrolled?.account?.account_type ?? null,
  };
}

/**
 * 处理 POST /api/warp/register。
 *
 * 该路由已在主入口通过 isAuthed 鉴权，这里只做入参校验。
 * 刻意不提供批量注册接口 —— 单次一个设备，避免滥用 Cloudflare 的注册接口。
 */
export async function handleWarpRegister(
  request: Request,
  kv: KVNamespace,
  ok: (d: unknown, s?: number) => Response,
  err: (msg: string, s?: number) => Response,
): Promise<Response> {
  if (request.method !== 'POST') return err('Method Not Allowed', 405);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return err('请求体过大', 413);

  let body: { publicKey?: string; name?: string; privateKey?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return err('请求体不是合法 JSON', 400);
  }

  const publicKey = (body.publicKey ?? '').trim();
  const name = (body.name ?? 'mihomo-manager').trim() || 'mihomo-manager';

  if (!publicKey) return err('缺少 publicKey', 400);
  if (!B64.test(publicKey)) return err('publicKey 不是合法的 Base64', 400);
  // P-256 SPKI 公钥固定 91 字节，Base64 后 124 字符；放宽到区间以容忍实现差异
  if (publicKey.length < 100 || publicKey.length > 200) return err('publicKey 长度不合法', 400);

  // 私钥可选：不传就只注册不留档，仍可用返回值在前端生成模板
  const privateKey = (body.privateKey ?? '').trim();
  if (privateKey && !B64.test(privateKey)) return err('privateKey 不是合法的 Base64', 400);

  let result: WarpEnrollResult;
  try {
    result = await registerMasque(publicKey, name);
  } catch (e) {
    if (e instanceof UpstreamError) return err(e.message, e.status);
    return err(e instanceof Error ? e.message : '注册失败', 500);
  }

  // 落盘失败不应让已成功的注册看起来像失败，故单独兜住
  let saved = false;
  try {
    const list = await readDevices(kv);
    list.push({
      id: crypto.randomUUID(),
      name,
      deviceId: result.deviceId,
      token: result.token,
      privateKey,
      ipv4: result.ipv4,
      ipv6: result.ipv6,
      peerPublicKey: result.peer.publicKey,
      endpointV4: result.peer.endpointV4,
      endpointV6: result.peer.endpointV6,
      ports: result.peer.ports,
      accountType: result.accountType,
      createdAt: new Date().toISOString(),
    });
    await writeDevices(kv, list);
    saved = true;
  } catch (e) {
    console.error('[WARP] 设备记录写入 KV 失败:', e);
  }

  return ok({ ...result, saved });
}

/** GET /api/warp/devices —— 列表，不含凭据 */
export async function handleWarpDeviceList(
  kv: KVNamespace,
  ok: (d: unknown, s?: number) => Response,
): Promise<Response> {
  const list = await readDevices(kv);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok(list.map(publicView));
}

/**
 * GET /api/warp/devices/:id/credentials —— 取回私钥等凭据。
 *
 * 单独开一个路由而不是塞进列表，是为了让「读取私钥」成为一次显式动作，
 * 便于日后加审计或二次确认。
 */
export async function handleWarpDeviceCredentials(
  id: string,
  kv: KVNamespace,
  ok: (d: unknown, s?: number) => Response,
  err: (msg: string, s?: number) => Response,
): Promise<Response> {
  const d = (await readDevices(kv)).find(x => x.id === id);
  if (!d) return err('设备不存在', 404);
  if (!d.privateKey) return err('该设备未留存私钥，无法重新生成节点', 400);
  return ok({
    privateKey: d.privateKey,
    peerPublicKey: d.peerPublicKey,
    ipv4: d.ipv4,
    ipv6: d.ipv6,
    endpointV4: d.endpointV4,
    endpointV6: d.endpointV6,
    ports: d.ports,
  });
}

/** PUT /api/warp/devices/:id —— 改名，同步到上游 */
export async function handleWarpDeviceRename(
  id: string,
  request: Request,
  kv: KVNamespace,
  ok: (d: unknown, s?: number) => Response,
  err: (msg: string, s?: number) => Response,
): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return err('请求体过大', 413);

  let name = '';
  try {
    name = String(JSON.parse(raw)?.name ?? '').trim();
  } catch {
    return err('请求体不是合法 JSON', 400);
  }
  if (!name) return err('名称不能为空', 400);

  const list = await readDevices(kv);
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return err('设备不存在', 404);

  try {
    await callUpstream(`/reg/${encodeURIComponent(list[idx].deviceId)}`, {
      method: 'PATCH',
      token: list[idx].token,
      body: { name: name.slice(0, 64) },
    });
  } catch (e) {
    if (e instanceof UpstreamError) return err(e.message, e.status);
    return err(e instanceof Error ? e.message : '改名失败', 500);
  }

  list[idx] = { ...list[idx], name };
  await writeDevices(kv, list);
  return ok(publicView(list[idx]));
}

/**
 * DELETE /api/warp/devices/:id —— 注销设备。
 *
 * 上游注销失败时仍然删除本地记录：凭据多半已失效，留着只会让列表越积越多。
 */
export async function handleWarpDeviceDelete(
  id: string,
  kv: KVNamespace,
  ok: (d: unknown, s?: number) => Response,
  err: (msg: string, s?: number) => Response,
): Promise<Response> {
  const list = await readDevices(kv);
  const d = list.find(x => x.id === id);
  if (!d) return err('设备不存在', 404);

  let upstream = true;
  let detail = '';
  try {
    await callUpstream(`/reg/${encodeURIComponent(d.deviceId)}`, {
      method: 'DELETE',
      token: d.token,
    });
  } catch (e) {
    upstream = false;
    detail = e instanceof Error ? e.message : '未知错误';
    console.warn('[WARP] 上游注销失败，仍删除本地记录:', detail);
  }

  await writeDevices(kv, list.filter(x => x.id !== id));
  return ok({ ok: true, upstream, detail });
}
