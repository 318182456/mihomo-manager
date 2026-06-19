/// <reference types="@cloudflare/workers-types" />
/// <reference types="@cloudflare/workers-types/2023-07-01" />
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import jsyaml from 'js-yaml';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';

export interface Env {
  ASSETS: Fetcher;
  KV: KVNamespace;
  ATTACHMENTS: R2Bucket;
  /** 管理员密码，在 Cloudflare Secret / .dev.vars 中配置 */
  ADMIN_PASSWORD?: string;
}

// ---------- 默认模板配置 ----------
const DEFAULT_TEMPLATES = [
  {
    name: 'main',
    content: `# ====== 公共引用配置 ======
p: &p
  type: http
  interval: 86400
  health-check: 
    enable: true
    url: https://www.gstatic.com/generate_204
    interval: 300

pr: &pr
  type: url-test
  proxies: [自动选择,香港,台湾,日本,美国,新加坡,德国,直连]

pr-china: &pr-china
  type: select
  proxies: [直连,自动选择]

exclude: &exclude
  exclude-filter: "(?i)剩余|到期|重置|官网|群|流量|Expire|Traffic|Website|Game|Chat"
  exclude-type: direct

# ====== 订阅与节点提供 ======
proxy-providers:
  # {{PROVIDERS}}

# ====== 基础节点 ======
proxies: 
  - name: "直连"
    type: direct
    udp: true

# ====== 基础设置 ======
mixed-port: 7890
ipv6: true
allow-lan: true
unified-delay: true
tcp-concurrent: true
authentication:
 - "user:password"
skip-auth-prefixes:
 - "172.17.0.0/16"
 - "172.18.0.0/16"
 - "172.30.0.0/16"
 - "192.168.1.0/24"
 - "192.168.3.0/24"
route-exclude-address:
 - "183.227.10.167"
mode: Rule
log-level: warning
external-controller: :9090

# ====== DNS 配置 ======
{{INCLUDE: dns}}

# ====== 分组配置 ======
{{INCLUDE: proxy-groups}}

# ====== 规则配置 ======
{{INCLUDE: rules}}`
  },
  {
    name: 'dns',
    content: `dns:
  enable: true
  ipv6: true
  enhanced-mode: redir-host
  listen: 0.0.0.0:1053
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  proxy-server-nameserver:
    - https://doh.pub/dns-query
  nameserver-policy:
    "geosite:cn":
      - 127.0.0.1:53
    "geosite:geolocation-!cn":
      - https://8.8.8.8/dns-query
  nameserver:
    - 127.0.0.1:53`
  },
  {
    name: 'proxy-groups',
    content: `proxy-groups:
  - name: 自动选择
    type: fallback
    proxies:
      - XS-优选
      - vps
    url: https://www.gstatic.com/generate_204
    interval: 300

  - name: 默认
    type: select
    proxies: [自动选择,直连,香港,台湾,日本,新加坡,美国,德国]

  - name: 其他
    type: select
    proxies: [自动选择,直连]`
  },
  {
    name: 'rules',
    content: `rules:
  - GEOSITE,openai,其他
  - GEOSITE,github,其他
  - GEOSITE,twitter,其他
  - GEOSITE,youtube,其他
  - GEOSITE,google,其他
  - GEOSITE,telegram,其他
  - GEOSITE,netflix,其他
  - GEOSITE,bilibili,直连
  - GEOSITE,CN,直连
  - GEOSITE,geolocation-!cn,其他
  - GEOIP,CN,直连
  - MATCH,其他`
  }
];

// ---------- 数据类型 ----------

interface StoredPasskey {
  id: string;         // credential ID（base64url）
  publicKey: string;  // Uint8Array → base64url
  counter: number;
  transports?: string[];
  name: string;
  createdAt: string;
}

/** 单条订阅 URL 条目 */
export interface UrlEntry {
  id: string;
  url: string;
  /** provider 名称，用于模板 {{PROVIDERS}} 注入，默认 p1/p2/... */
  name?: string;
  /** 归属的 proxy-group 名，用于模板 {{URL_GROUPS}} 动态生成分组 */
  proxyGroup?: string;
  /** 分组图标文件名（不含扩展名），如 Auto、Speedtest，前缀固定为 Qure/IconSet/Color/ */
  icon?: string;
  /** 自动获取最新URL的接口地址 */
  refreshUrl?: string;
  /** 传给 refreshUrl 的请求头 */
  refreshHeaders?: Record<string, string>;
  /** 从响应 JSON 中提取URL的路径（点分隔），默认 subscribe_url */
  refreshJsonPath?: string;
  /** 最近一次自动刷新时间 */
  lastRefreshedAt?: string;
  /** 解析类型，用于特殊登录流程 */
  refreshType?: string;
  hysteria2Up?: string;
  hysteria2Down?: string;
  hysteria2Mtu?: number;
  /** 缓存时间阈值，单位：秒 */
  cacheTtl?: number;
  akileServerId?: string;
  akileApiClient?: string;
  akileApiSecret?: string;
  cfOptimize?: boolean;
  cfOptimizeNum?: number;
}

export interface SubscriptionGroup {
  id: string; title: string; enabled: boolean; filter: string;
  urlIds: string[];
  urls: UrlEntry[];
  updatedAt: string;
}
export interface Template {
  id: string; name: string; content: string; updatedAt: string;
}
export interface GeneratedLink {
  id: string; name: string; group: string; templateId: string;
  subscriptionGroupId: string; token: string; expiresAt: string | null; createdAt: string;
}

// ---------- 通用工具 ----------

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ok   = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
const err  = (msg: string, s = 400) => ok({ error: msg }, s);
const err401 = () => err('Unauthorized', 401);
const err404 = () => err('Not Found', 404);

function uuid() { return crypto.randomUUID(); }
function genToken() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2,'0')).join('');
}
function u8ToB64url(u: Uint8Array): string {
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlToU8(s: string): Uint8Array {
  const b = s.replace(/-/g,'+').replace(/_/g,'/').padEnd(s.length + (4 - s.length%4)%4, '=');
  return new Uint8Array(atob(b).split('').map(c => c.charCodeAt(0)));
}

function getOrigins(request: Request): string | string[] {
  const origin = new URL(request.url).origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1'))
    return [origin, 'http://localhost:3000', 'http://localhost:8787'];
  return origin;
}

function isAuthed(request: Request, env: Env): boolean {
  const pwd = env.ADMIN_PASSWORD || 'admin888';
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') && h.slice(7) === pwd;
}

async function getPasskeys(kv: KVNamespace): Promise<StoredPasskey[]> {
  const raw = await kv.get('passkeys');
  return raw ? JSON.parse(raw) : [];
}

async function getOrSeedTemplates(r2: R2Bucket): Promise<Template[]> {
  let listed = await r2.list();
  if (listed.objects.length === 0) {
    for (const t of DEFAULT_TEMPLATES) {
      const newId = uuid();
      const tpl: Template = { id: newId, name: t.name, content: t.content, updatedAt: new Date().toISOString() };
      await r2.put(newId, JSON.stringify(tpl));
    }
    listed = await r2.list();
  }
  const items = await Promise.all(listed.objects.map(async o => {
    const obj = await r2.get(o.key);
    return obj ? JSON.parse(await obj.text()) as Template : null;
  }));
  return items.filter((x): x is Template => Boolean(x));
}

// ---------- Worker 主入口 ----------

// ---------- URL 条目迁移与刷新 ----------

/** 兼容旧的 string[] 格式，自动迁移为 UrlEntry[] */
function normalizeUrls(raw: any[]): UrlEntry[] {
  return (raw ?? []).map(item => {
    if (typeof item === 'string') {
      const nameMatch = item.match(/\|\s*name:\s*(\S+)/);
      const url = item.replace(/\s*\|.*$/, '').trim();
      return nameMatch ? { id: uuid(), url, name: nameMatch[1] } : { id: uuid(), url };
    }
    const entry = { ...item } as any;
    if (!entry.id) {
      entry.id = uuid();
    }
    return entry as UrlEntry;
  });
}

/** 带超时限制的 fetch 封装 */
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 5000, ...rest } = options;
  const signal = (AbortSignal as any).timeout ? AbortSignal.timeout(timeout) : undefined;
  if (!signal) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...rest, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }
  return fetch(url, { ...rest, signal });
}

/** 从单个 UrlEntry 的 refreshUrl 接口拉取最新订阅链接 */
async function fetchAndExtractUrl(entry: UrlEntry): Promise<{ ok: boolean; url?: string; msg: string }> {
  if (!entry.refreshUrl) return { ok: false, msg: '未配置 refreshUrl' };
  const urlToFetch = entry.refreshUrl.trim();

  if (entry.refreshType === 'hoshi_v2board' || entry.refreshType === 'v2board') {
    let domains: any[] = [];
    let dataFetchFailed = false;
    if (entry.refreshType === 'hoshi_v2board') {
      try {
        const dataUrl = new URL('/data.json', urlToFetch).toString();
        const dataRes = await fetchWithTimeout(dataUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          },
          timeout: 5000
        });
        domains = await dataRes.json() as any[];
      } catch (e) {
        console.error('[v2board] 获取动态域名列表失败, 尝试使用初始 URL:', e);
        domains = [{ jumpUrl: urlToFetch }];
        dataFetchFailed = true;
      }
    } else {
      domains = [{ jumpUrl: urlToFetch }];
    }

    const isHoshi = entry.refreshType === 'hoshi_v2board';
    const apiPrefix = isHoshi ? '/data' : '/api/v1';

    const email = entry.refreshHeaders?.email || entry.refreshHeaders?.Email;
    const password = entry.refreshHeaders?.password || entry.refreshHeaders?.Password;
    if (!email || !password) {
      return { ok: false, msg: '需要在 refreshHeaders 中配置 email 和 password' };
    }

    let lastError = '';
    for (const d of domains) {
      const host = d.jumpUrl || d.checkUrl || urlToFetch;
      if (!host) continue;
      if (dataFetchFailed && host === urlToFetch) {
        lastError = '初始 URL 获取数据列表超时/失败，跳过登录尝试';
        continue;
      }
      try {
        // 2. 登录请求
        const loginUrl = new URL(`${apiPrefix}/passport/auth/login`, host).toString();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        };
        if (isHoshi) {
          headers['X-Client-Type'] = 'Hoshi';
        }
        const loginRes = await fetchWithTimeout(loginUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email, password }),
          timeout: 5000
        });

        if (!loginRes.ok) {
          lastError = `Login HTTP ${loginRes.status}`;
          continue;
        }

        const loginJson = await loginRes.json() as any;
        if (loginJson.success === false) {
          lastError = `Login failed: success is false`;
          continue;
        }

        const token = typeof loginJson.data === 'string' ? loginJson.data : (loginJson.data?.auth_data || loginJson.auth_data);
        if (!token) {
          lastError = `Login failed: missing token in response`;
          continue;
        }

        // 3. 获取最新订阅 URL
        const subUrl = new URL(`${apiPrefix}/user/getSubscribe`, host).toString();
        const subHeaders: Record<string, string> = {
          'Authorization': token,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        };
        if (isHoshi) {
          subHeaders['X-Client-Type'] = 'Hoshi';
        }
        const subRes = await fetchWithTimeout(subUrl, {
          headers: subHeaders,
          timeout: 5000
        });

        if (!subRes.ok) {
          lastError = `GetSubscribe HTTP ${subRes.status}`;
          continue;
        }

        const subJson = await subRes.json() as any;
        if (subJson.success === false) {
          lastError = `GetSubscribe response success is false`;
          continue;
        }

        const subscribeUrl = subJson.data?.subscribe_url || subJson.subscribe_url || (typeof subJson.data === 'string' ? subJson.data : '');
        if (!subscribeUrl) {
          lastError = `GetSubscribe response missing subscribe_url`;
          continue;
        }

        return { ok: true, url: subscribeUrl.trim(), msg: '获取成功' };
      } catch (err) {
        lastError = String(err);
        console.error(`[v2board] 尝试节点 ${host} 出错:`, err);
      }
    }
    return { ok: false, msg: `v2board 刷新失败: ${lastError}` };
  }

  let resp: Response;
  try {
    resp = await fetchWithTimeout(urlToFetch, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        ...(entry.refreshHeaders ?? {})
      },
      timeout: 5000
    });
  } catch (e) {
    console.error(`[fetchAndExtractUrl] 请求失败:`, e);
    return { ok: false, msg: `请求失败: ${String(e)}` };
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error(`[fetchAndExtractUrl] HTTP 错误 ${resp.status}, 响应内容:`, errText);
    return { ok: false, msg: `HTTP ${resp.status}` };
  }
  let json: any;
  try { json = await resp.json(); } catch { return { ok: false, msg: '响应非 JSON' }; }

  const path = entry.refreshJsonPath || 'subscribe_url';
  const pathParts = path.split('.');
  let val: any = json;
  for (const p of pathParts) {
    if (val == null || typeof val !== 'object') { val = undefined; break; }
    val = val[p];
  }
  if (!val) {
    val = json.subscribe_url ?? json.sub_url ?? json.url ?? json.link
      ?? json.data?.subscribe_url ?? json.data?.sub_url ?? json.data?.url;
  }
  if (!val || typeof val !== 'string') return { ok: false, msg: `无法提取URL（路径: ${path}）` };
  return { ok: true, url: val.trim(), msg: val };
}

/** 批量刷新一个订阅组内所有配置了 refreshUrl 的 URL 条目 */
async function refreshGroupUrls(groupId: string, kv: KVNamespace): Promise<{ refreshed: number; errors: string[] }> {
  console.log(`[Cron] 开始刷新订阅组 ID: ${groupId}`);
  const globalUrls = await getGlobalUrlsAndMigrate(kv);
  const subRaw = await kv.get('subscriptions');
  const list: any[] = subRaw ? JSON.parse(subRaw) : [];
  const group = list.find((g: any) => g.id === groupId);
  if (!group) {
    console.log(`[Cron] 订阅组不存在: ${groupId}`);
    return { refreshed: 0, errors: ['订阅组不存在'] };
  }

  const groupName = group.title || groupId;
  const urlIds = group.urlIds ?? [];
  const targets = globalUrls.filter(u => urlIds.includes(u.id) && u.refreshUrl);

  type FetchResult = { id: string; ok: boolean; url?: string; msg: string | null };
  const jobs = targets.map((entry): Promise<FetchResult> => {
    console.log(`[Cron] 正在刷新 [${groupName}] 订阅源: ${entry.refreshUrl}`);
    return fetchAndExtractUrl(entry).then(r => ({ id: entry.id, ...r, msg: r.msg }));
  });
  const results = await Promise.allSettled(jobs);

  let refreshed = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { id, ok, url, msg } = r.value;
      if (ok && url) {
        const idx = globalUrls.findIndex(u => u.id === id);
        if (idx !== -1) {
          globalUrls[idx] = { ...globalUrls[idx], url, lastRefreshedAt: new Date().toISOString() };
          refreshed++;
        }
      } else if (msg) {
        errors.push(msg);
      }
    } else {
      errors.push(String(r.reason));
    }
  }

  await kv.put('subscription_urls', JSON.stringify(globalUrls));
  
  const gIdx = list.findIndex(g => g.id === groupId);
  if (gIdx !== -1) {
    list[gIdx] = { ...list[gIdx], updatedAt: new Date().toISOString() };
    await kv.put('subscriptions', JSON.stringify(list));
  }

  console.log(`[Cron] 完成刷新订阅组 [${groupName}], 成功: ${refreshed}, 失败: ${errors.length}`);
  return { refreshed, errors };
}

export default {
  // ---------- Cron 定时任务（每天 UTC 00:00）----------
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron] 定时任务触发: ${event.cron}`);
    const globalUrls = await getGlobalUrlsAndMigrate(env.KV);
    const subRaw = await env.KV.get('subscriptions');
    const list: any[] = subRaw ? JSON.parse(subRaw) : [];
    
    const enabledUrlIds = new Set<string>();
    for (const g of list) {
      if (g.enabled) {
        for (const id of (g.urlIds ?? [])) {
          enabledUrlIds.add(id);
        }
      }
    }

    const targets = globalUrls.filter(u => u.refreshUrl && enabledUrlIds.has(u.id));
    console.log(`[Cron] 找到 ${targets.length} 个符合条件的订阅源准备刷新`);

    type FetchResult = { id: string; ok: boolean; url?: string; msg: string | null };
    const jobs = targets.map((entry): Promise<FetchResult> => {
      return fetchAndExtractUrl(entry).then(r => ({ id: entry.id, ...r, msg: r.msg }));
    });
    const results = await Promise.allSettled(jobs);

    let successCount = 0;
    let failCount = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { id, ok, url } = r.value;
        if (ok && url) {
          const idx = globalUrls.findIndex(u => u.id === id);
          if (idx !== -1) {
            globalUrls[idx] = { ...globalUrls[idx], url, lastRefreshedAt: new Date().toISOString() };
            successCount++;
            continue;
          }
        }
      }
      failCount++;
    }

    await env.KV.put('subscription_urls', JSON.stringify(globalUrls));
    console.log(`[Cron] 定时任务执行完毕: 成功 ${successCount}, 失败 ${failCount}`);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });

    if (pathname.startsWith('/sub/'))
      return handleSubFetch(pathname, env, request, ctx);

    if (pathname.startsWith('/api/')) {
      // 公开路由
      if (pathname === '/api/auth/login')           return handleLogin(request, env);
      if (pathname === '/api/auth/passkey/status')  return handlePasskeyStatus(env);
      if (pathname === '/api/auth/passkey/login/begin')  return handlePasskeyLoginBegin(request, env);
      if (pathname === '/api/auth/passkey/login/finish') return handlePasskeyLoginFinish(request, env);

      // 鉴权路由
      if (!isAuthed(request, env)) return err401();
      if (pathname === '/api/auth/passkey/register/begin')  return handlePasskeyRegisterBegin(request, env);
      if (pathname === '/api/auth/passkey/register/finish') return handlePasskeyRegisterFinish(request, env);
      if (pathname === '/api/auth/passkey/list')   return handlePasskeyList(env);
      if (pathname.startsWith('/api/auth/passkey/delete/')) {
        const kid = pathname.split('/').pop()!;
        return handlePasskeyDelete(kid, env);
      }
      return handleAPI(request, env, pathname);
    }

    return env.ASSETS.fetch(request);
  },
};

// ---------- 密码登录 ----------

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method Not Allowed', 405);
  const { password } = await request.json<{ password: string }>();
  const pwd = env.ADMIN_PASSWORD || 'admin888';
  if (password === pwd) return ok({ token: pwd });
  return err('密码错误', 401);
}

// ---------- Passkey 状态 ----------

async function handlePasskeyStatus(env: Env): Promise<Response> {
  const list = await getPasskeys(env.KV);
  return ok({ count: list.length });
}

async function handlePasskeyList(env: Env): Promise<Response> {
  const list = await getPasskeys(env.KV);
  return ok(list.map(p => ({ id: p.id, name: p.name, createdAt: p.createdAt })));
}

async function handlePasskeyDelete(credId: string, env: Env): Promise<Response> {
  const list = await getPasskeys(env.KV);
  await env.KV.put('passkeys', JSON.stringify(list.filter(p => p.id !== credId)));
  return ok({ ok: true });
}

// ---------- Passkey 注册 ----------

async function handlePasskeyRegisterBegin(request: Request, env: Env): Promise<Response> {
  const stored = await getPasskeys(env.KV);
  const rpID = new URL(request.url).hostname;

  const options = await generateRegistrationOptions({
    rpName: 'Mihomo Manager',
    rpID,
    userID: new TextEncoder().encode('admin'),
    userName: 'admin',
    userDisplayName: 'Mihomo Admin',
    excludeCredentials: stored.map(p => ({
      id: p.id,
      transports: (p.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await env.KV.put('passkey:reg_challenge', options.challenge, { expirationTtl: 300 });
  return ok(options);
}

async function handlePasskeyRegisterFinish(request: Request, env: Env): Promise<Response> {
  const expectedChallenge = await env.KV.get('passkey:reg_challenge');
  if (!expectedChallenge) return err('Challenge 已过期，请重新开始');

  const body = await request.json<RegistrationResponseJSON>();
  const rpID = new URL(request.url).hostname;

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: getOrigins(request),
      expectedRPID: rpID,
    });
  } catch (e) {
    return err(String(e));
  }

  if (!verification.verified || !verification.registrationInfo)
    return err('注册验证失败');

  const { registrationInfo } = verification;
  // simplewebauthn v10 uses credentialID / credentialPublicKey (not credential)
  const credentialID        = (registrationInfo as any).credentialID        ?? (registrationInfo as any).credential?.id;
  const credentialPublicKey = (registrationInfo as any).credentialPublicKey ?? (registrationInfo as any).credential?.publicKey;
  const counter             = (registrationInfo as any).counter              ?? (registrationInfo as any).credential?.counter ?? 0;
  const credential = { id: credentialID as string, publicKey: credentialPublicKey as Uint8Array, counter: counter as number };
  const stored = await getPasskeys(env.KV);
  const newKey: StoredPasskey = {
    id: credential.id,
    publicKey: u8ToB64url(credential.publicKey),
    counter: credential.counter,
    transports: body.response.transports ?? [],
    name: `Passkey ${stored.length + 1}`,
    createdAt: new Date().toISOString(),
  };
  stored.push(newKey);
  await env.KV.put('passkeys', JSON.stringify(stored));
  await env.KV.delete('passkey:reg_challenge');
  return ok({ ok: true, name: newKey.name });
}

// ---------- Passkey 登录 ----------

async function handlePasskeyLoginBegin(request: Request, env: Env): Promise<Response> {
  const stored = await getPasskeys(env.KV);
  const rpID = new URL(request.url).hostname;

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: stored.map(p => ({
      id: p.id,
      transports: (p.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    userVerification: 'preferred',
  });

  await env.KV.put('passkey:auth_challenge', options.challenge, { expirationTtl: 300 });
  return ok(options);
}

async function handlePasskeyLoginFinish(request: Request, env: Env): Promise<Response> {
  const expectedChallenge = await env.KV.get('passkey:auth_challenge');
  if (!expectedChallenge) return err('Challenge 已过期');

  const body = await request.json<AuthenticationResponseJSON>();
  const stored = await getPasskeys(env.KV);
  const passkey = stored.find(p => p.id === body.id);
  if (!passkey) return err('未找到对应的 Passkey', 404);

  const rpID = new URL(request.url).hostname;
  // simplewebauthn v10: authenticator object has different shape
  const authenticator = {
    credentialID:        passkey.id,
    credentialPublicKey: b64urlToU8(passkey.publicKey),
    counter:             passkey.counter,
    transports:          (passkey.transports ?? []) as AuthenticatorTransportFuture[],
  };

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: getOrigins(request),
      expectedRPID: rpID,
      authenticator,
    } as any);
  } catch (e) {
    return err(String(e));
  }

  if (!verification.verified) return err('Passkey 验证失败', 401);

  // 更新计数器防重放
  passkey.counter = verification.authenticationInfo.newCounter;
  await env.KV.put('passkeys', JSON.stringify(stored));
  await env.KV.delete('passkey:auth_challenge');

  const pwd = env.ADMIN_PASSWORD || 'admin888';
  return ok({ token: pwd });
}

// ---------- API 路由 ----------

async function handleAPI(request: Request, env: Env, pathname: string): Promise<Response> {
  const parts = pathname.replace(/^\/api\//, '').split('/');
  const [resource, id = null] = parts;
  const method = request.method;
  try {
    const action = parts[2] ?? null;
    switch (resource) {
      case 'subscriptions':
        // POST /api/subscriptions/:id/refresh
        if (method === 'POST' && id && action === 'refresh') {
          return handleSubscriptionRefresh(id, env.KV);
        }
        if (method === 'GET' && id && action === 'proxies') {
          return handleSubscriptionProxies(id, env.KV);
        }
        // POST /api/subscriptions/:id/urls/:index/refresh  刷新单个 URL 条目
        if (method === 'POST' && id && action === 'urls' && parts[4] === 'refresh') {
          const urlIndex = parseInt(parts[3] ?? '-1', 10);
          if (isNaN(urlIndex)) return err('无效的 URL 索引', 400);
          return handleUrlEntryRefresh(id, urlIndex, env.KV);
        }
        return handleSubscriptions(request, env.KV, method, id);

      case 'urls':
        if (method === 'POST' && id && action === 'refresh') {
          return handleUrlRefresh(id, env.KV);
        }
        if (method === 'POST' && id && action === 'sync_cache') {
          return handleUrlCacheSync(id, env);
        }
        return handleUrls(request, env.KV, method, id);

      case 'templates':     return handleTemplates(request, env.ATTACHMENTS, method, id);
      case 'links':         return handleLinks(request, env.KV, method, id);
      case 'dashboard':     return handleDashboard(env);
      default:              return err404();
    }
  } catch (e) {
    return err(String(e), 500);
  }
}

// ---------- 订阅源 / 订阅组辅助函数 ----------

/** 获取所有全局订阅源，并自动处理旧数据的迁移 */
async function getGlobalUrlsAndMigrate(kv: KVNamespace): Promise<UrlEntry[]> {
  const urlsRaw = await kv.get('subscription_urls');
  if (urlsRaw) {
    return JSON.parse(urlsRaw) as UrlEntry[];
  }

  const subRaw = await kv.get('subscriptions');
  if (!subRaw) return [];

  const groups: any[] = JSON.parse(subRaw);
  const globalUrls: UrlEntry[] = [];
  const urlMap = new Map<string, string>();

  for (const g of groups) {
    const urls = normalizeUrls(g.urls ?? []);
    for (const entry of urls) {
      const key = `${entry.url}__${entry.name ?? ''}`;
      if (!urlMap.has(key)) {
        urlMap.set(key, entry.id);
        globalUrls.push(entry);
      }
    }
  }

  const migratedGroups = groups.map(g => {
    const urls = normalizeUrls(g.urls ?? []);
    const urlIds = urls.map(entry => {
      const key = `${entry.url}__${entry.name ?? ''}`;
      return urlMap.get(key) || entry.id;
    });
    const { urls: _, ...rest } = g;
    return { ...rest, urlIds };
  });

  await kv.put('subscription_urls', JSON.stringify(globalUrls));
  await kv.put('subscriptions', JSON.stringify(migratedGroups));

  return globalUrls;
}

/** 将订阅组内的 urlIds 解析为完整的 UrlEntry 列表 */
function resolveSubscriptionGroup(group: any, globalUrls: UrlEntry[]): SubscriptionGroup {
  const urlIds = group.urlIds ?? [];
  const urls = urlIds.map((id: string) => globalUrls.find(u => u.id === id)).filter(Boolean) as UrlEntry[];
  return {
    ...group,
    urlIds,
    urls,
  };
}

// ---------- 订阅源 CRUD ----------

async function handleUrls(req: Request, kv: KVNamespace, method: string, id: string|null): Promise<Response> {
  const list = await getGlobalUrlsAndMigrate(kv);

  if (method === 'GET' && !id) return ok(list);
  if (method === 'GET' && id) {
    const item = list.find(u => u.id === id);
    return item ? ok(item) : err404();
  }

  if (method === 'POST' && !id) {
    const body = await req.json<Omit<UrlEntry, 'id' | 'lastRefreshedAt'>>();
    const item: UrlEntry = {
      ...body,
      id: uuid(),
      lastRefreshedAt: undefined,
    };
    await kv.put('subscription_urls', JSON.stringify([...list, item]));
    return ok(item, 201);
  }

  if (method === 'PUT' && id) {
    const idx = list.findIndex(u => u.id === id);
    if (idx === -1) return err404();
    const body = await req.json<Partial<UrlEntry>>();
    delete (body as any).id;
    list[idx] = { ...list[idx], ...body };
    await kv.put('subscription_urls', JSON.stringify(list));
    return ok(list[idx]);
  }

  if (method === 'DELETE' && id) {
    const updatedList = list.filter(u => u.id !== id);
    await kv.put('subscription_urls', JSON.stringify(updatedList));

    const subRaw = await kv.get('subscriptions');
    if (subRaw) {
      const groups: any[] = JSON.parse(subRaw);
      const updatedGroups = groups.map(g => {
        if (g.urlIds && g.urlIds.includes(id)) {
          return { ...g, urlIds: g.urlIds.filter((uid: string) => uid !== id) };
        }
        return g;
      });
      await kv.put('subscriptions', JSON.stringify(updatedGroups));
    }

    return ok({ ok: true });
  }

  return err('Method Not Allowed', 405);
}

// ---------- 单个订阅源刷新 ----------

async function handleUrlRefresh(id: string, kv: KVNamespace): Promise<Response> {
  const globalUrls = await getGlobalUrlsAndMigrate(kv);
  const idx = globalUrls.findIndex(u => u.id === id);
  if (idx === -1) return err404();
  const entry = globalUrls[idx];
  if (!entry.refreshUrl) return err('该订阅源未配置 refreshUrl', 400);
  const result = await fetchAndExtractUrl(entry);
  if (!result.ok || !result.url) return err(result.msg, 502);
  globalUrls[idx] = { ...entry, url: result.url, lastRefreshedAt: new Date().toISOString() };
  await kv.put('subscription_urls', JSON.stringify(globalUrls));
  return ok({ ok: true, url: result.url });
}

async function handleUrlCacheSync(id: string, env: Env): Promise<Response> {
  const globalUrls = await getGlobalUrlsAndMigrate(env.KV);
  const entry = globalUrls.find(u => u.id === id);
  if (!entry) return err404();
  
  try {
    // 强制拉取最新数据（节点和流量信息）并写入 KV
    await updateSubscriptionCache(env, entry, 'clash.meta');
    
    // 更新此条目的最近一次自动/手动刷新时间
    const idx = globalUrls.findIndex(u => u.id === id);
    globalUrls[idx] = { ...entry, lastRefreshedAt: new Date().toISOString() };
    await env.KV.put('subscription_urls', JSON.stringify(globalUrls));
    
    return ok({ ok: true, msg: '同步缓存成功' });
  } catch (e) {
    return err(`同步上游订阅失败: ${String(e)}`, 502);
  }
}

// ---------- 订阅组 CRUD ----------

async function handleSubscriptions(req: Request, kv: KVNamespace, method: string, id: string|null): Promise<Response> {
  const globalUrls = await getGlobalUrlsAndMigrate(kv);
  const subRaw = await kv.get('subscriptions');
  const rawList: any[] = subRaw ? JSON.parse(subRaw) : [];
  let list: SubscriptionGroup[] = rawList.map(g => resolveSubscriptionGroup(g, globalUrls));

  if (method === 'GET' && !id) return ok(list);
  if (method === 'GET' && id) {
    const item = list.find(s => s.id === id);
    return item ? ok(item) : err404();
  }

  if (method === 'POST' && !id) {
    const body = await req.json<Omit<SubscriptionGroup,'id'|'updatedAt'>>();
    const urlIds = body.urlIds ?? (body.urls ?? []).map(u => u.id);
    const itemToSave = {
      title: body.title,
      enabled: body.enabled,
      filter: body.filter,
      urlIds,
      id: uuid(),
      updatedAt: new Date().toISOString()
    };
    await kv.put('subscriptions', JSON.stringify([...rawList, itemToSave]));
    return ok(resolveSubscriptionGroup(itemToSave, globalUrls), 201);
  }

  if (method === 'PUT' && id) {
    const idx = rawList.findIndex(s => s.id === id);
    if (idx === -1) return err404();
    const body = await req.json<Partial<SubscriptionGroup>>();
    const urlIds = body.urlIds !== undefined ? body.urlIds : (body.urls !== undefined ? body.urls.map(u => u.id) : rawList[idx].urlIds);
    
    rawList[idx] = {
      ...rawList[idx],
      title: body.title !== undefined ? body.title : rawList[idx].title,
      enabled: body.enabled !== undefined ? body.enabled : rawList[idx].enabled,
      filter: body.filter !== undefined ? body.filter : rawList[idx].filter,
      urlIds,
      updatedAt: new Date().toISOString()
    };
    await kv.put('subscriptions', JSON.stringify(rawList));
    return ok(resolveSubscriptionGroup(rawList[idx], globalUrls));
  }

  if (method === 'DELETE' && id) {
    await kv.put('subscriptions', JSON.stringify(rawList.filter(s => s.id !== id)));
    return ok({ ok: true });
  }

  return err('Method Not Allowed', 405);
}

// ---------- 手动刷新单个订阅组 ----------

async function handleSubscriptionRefresh(id: string, kv: KVNamespace): Promise<Response> {
  const globalUrls = await getGlobalUrlsAndMigrate(kv);
  const subRaw = await kv.get('subscriptions');
  const list: any[] = subRaw ? JSON.parse(subRaw) : [];
  const group = list.find((s: any) => s.id === id);
  if (!group) return err404();
  const urlIds = group.urlIds ?? [];
  const entries = globalUrls.filter(u => urlIds.includes(u.id));
  if (!entries.some(e => e.refreshUrl)) return err('该订阅组内无配置 refreshUrl 的条目', 400);
  const result = await refreshGroupUrls(id, kv);
  return ok(result);
}

// ---------- 获取订阅组内所有代理节点 ----------

async function handleSubscriptionProxies(id: string, kv: KVNamespace): Promise<Response> {
  const globalUrls = await getGlobalUrlsAndMigrate(kv);
  const subRaw = await kv.get('subscriptions');
  const list: any[] = subRaw ? JSON.parse(subRaw) : [];
  const rawGroup = list.find((s: any) => s.id === id);
  if (!rawGroup) return err404();
  const group = resolveSubscriptionGroup(rawGroup, globalUrls);
  const entries = group.urls;
  
  const results = await Promise.allSettled(entries.map(entry =>
    fetch(entry.url.trim(), { method: 'GET', headers: { 'User-Agent': 'clash.meta' } }).then(r => r.text())
  ));

  const proxies: Set<string> = new Set();
  
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'fulfilled' && res.value) {
      let parsed: any[] = [];
      if (isNodeList(res.value)) {
        parsed = parseNodeURIs(res.value);
      }
      if (parsed.length === 0) {
        try {
          const yml = jsyaml.load(res.value) as any;
          if (yml && Array.isArray(yml.proxies)) parsed = yml.proxies;
        } catch (e) { /* 忽略解析错误 */ }
      }
      for (const p of parsed) {
        if (p && p.name) proxies.add(p.name);
      }
    }
  }

  return ok(Array.from(proxies));
}

// ---------- 兼容：刷新订阅组内的单个 URL ----------

async function handleUrlEntryRefresh(groupId: string, urlIndex: number, kv: KVNamespace): Promise<Response> {
  const globalUrls = await getGlobalUrlsAndMigrate(kv);
  const subRaw = await kv.get('subscriptions');
  const list: any[] = subRaw ? JSON.parse(subRaw) : [];
  const group = list.find((g: any) => g.id === groupId);
  if (!group) return err404();
  const urlId = group.urlIds?.[urlIndex];
  if (!urlId) return err('URL 条目不存在', 404);
  return handleUrlRefresh(urlId, kv);
}

// ---------- 模板 CRUD (R2 对象存储) ----------

async function handleTemplates(req: Request, r2: R2Bucket, method: string, id: string|null): Promise<Response> {
  if (method === 'GET' && !id) {
    return ok(await getOrSeedTemplates(r2));
  }
  if (method === 'GET' && id) {
    const obj = await r2.get(id); 
    return obj ? ok(JSON.parse(await obj.text())) : err404();
  }
  if (method === 'POST' && !id) {
    const body = await req.json<{ name: string; content: string }>();
    const tpl: Template = { id: uuid(), name: body.name, content: body.content, updatedAt: new Date().toISOString() };
    await r2.put(tpl.id, JSON.stringify(tpl));
    return ok(tpl, 201);
  }
  if (method === 'PUT' && id) {
    const obj = await r2.get(id); 
    if (!obj) return err404();
    const existing: Template = JSON.parse(await obj.text());
    const body = await req.json<Partial<Template>>();
    const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
    await r2.put(id, JSON.stringify(updated));
    return ok(updated);
  }
  if (method === 'DELETE' && id) {
    await r2.delete(id); return ok({ ok: true });
  }
  return err('Method Not Allowed', 405);
}

// ---------- 链接管理 ----------

async function handleLinks(req: Request, kv: KVNamespace, method: string, id: string|null): Promise<Response> {
  const raw = await kv.get('links');
  let list: GeneratedLink[] = raw ? JSON.parse(raw) : [];

  if (method === 'GET' && !id) return ok(list);
  if (method === 'POST' && !id) {
    const body = await req.json<Omit<GeneratedLink,'id'|'token'|'createdAt'>>();
    const link: GeneratedLink = { ...body, id: uuid(), token: genToken(), createdAt: new Date().toISOString() };
    await kv.put('links', JSON.stringify([...list, link]));
    return ok(link, 201);
  }
  if (method === 'DELETE' && id) {
    await kv.put('links', JSON.stringify(list.filter(l=>l.id!==id)));
    return ok({ ok: true });
  }
  return err('Method Not Allowed', 405);
}

// ---------- 仪表盘统计 ----------

async function handleDashboard(env: Env): Promise<Response> {
  const [subRaw, linksRaw, tplList] = await Promise.all([
    env.KV.get('subscriptions'), env.KV.get('links'), env.ATTACHMENTS.list()
  ]);
  const subs:  SubscriptionGroup[] = subRaw   ? JSON.parse(subRaw)   : [];
  const links: GeneratedLink[]     = linksRaw ? JSON.parse(linksRaw) : [];
  return ok({
    activeSubscriptions: subs.filter(s=>s.enabled).length,
    totalSubscriptions:  subs.length,
    activeLinks:  links.filter(l=>!l.expiresAt||new Date(l.expiresAt)>new Date()).length,
    totalLinks:   links.length,
    templateCount: tplList.objects.length,
    kvUsageKB: Math.round(((subRaw?.length??0)+(linksRaw?.length??0))/102.4)/10,
  });
}

interface OptimizedIP {
  ip: string;
  isp: string;
}

interface OptimizedIPsCache {
  updatedAt: number;
  ips: OptimizedIP[];
}

async function fetchCloudflareOptimizedIPs(env: Env): Promise<OptimizedIP[]> {
  const cacheKey = 'cloudflare_optimized_ips';
  try {
    const cached = await env.KV.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as OptimizedIPsCache;
      if (Date.now() - parsed.updatedAt < 600 * 1000) {
        return parsed.ips;
      }
    }
  } catch (e) {
    console.error('[CF IP] 读取缓存失败:', e);
  }

  try {
    console.log('[CF IP] 开始获取优选 IP...');
    const res = await fetch('https://api.uouin.com/cloudflare.html', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();

    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    const ipRegex = /href="http:\/\/\[?([a-fA-F0-9:.]+)(?:\])?\/cdn-cgi\/trace"/;
    const operatorRegex = /<td>\s*(电信|联通|移动|IPV6)\s*<\/td>/i;

    let match;
    const teleIPs: string[] = [];
    const unicIPs: string[] = [];
    const mobiIPs: string[] = [];
    const ipv6IPs: string[] = [];
    const otherIPs: string[] = [];

    while ((match = trRegex.exec(html)) !== null) {
      const trContent = match[1];
      const ipMatch = ipRegex.exec(trContent);
      if (ipMatch) {
        const ip = ipMatch[1];
        const opMatch = operatorRegex.exec(trContent);
        const op = opMatch ? opMatch[1].trim() : '';
        if (op === '电信') teleIPs.push(ip);
        else if (op === '联通') unicIPs.push(ip);
        else if (op === '移动') mobiIPs.push(ip);
        else if (op === 'IPV6') ipv6IPs.push(ip);
        else otherIPs.push(ip);
      }
    }

    const interleavedIps: OptimizedIP[] = [];
    const maxLength = Math.max(teleIPs.length, unicIPs.length, mobiIPs.length);
    for (let i = 0; i < maxLength; i++) {
      if (i < teleIPs.length) interleavedIps.push({ ip: teleIPs[i], isp: '电信' });
      if (i < unicIPs.length) interleavedIps.push({ ip: unicIPs[i], isp: '联通' });
      if (i < mobiIPs.length) interleavedIps.push({ ip: mobiIPs[i], isp: '移动' });
    }

    ipv6IPs.forEach(ip => interleavedIps.push({ ip, isp: 'IPv6' }));
    otherIPs.forEach(ip => interleavedIps.push({ ip, isp: '其他' }));

    if (interleavedIps.length > 0) {
      await env.KV.put(cacheKey, JSON.stringify({
        updatedAt: Date.now(),
        ips: interleavedIps
      }));
      console.log(`[CF IP] 成功获取并缓存了 ${interleavedIps.length} 个 IP (电信:${teleIPs.length}, 联通:${unicIPs.length}, 移动:${mobiIPs.length})`);
      return interleavedIps;
    }
  } catch (e) {
    console.error('[CF IP] 获取优选 IP 异常:', e);
  }

  try {
    const cached = await env.KV.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as OptimizedIPsCache;
      return parsed.ips;
    }
  } catch {}

  return [];
}

interface SubscriptionCache {
  lastCacheUpdate: number;
  data: string;
  userInfo?: string;
}

/**
 * 带有 KV 缓存与 SWR (Stale-While-Revalidate) 异步后台刷新功能的订阅抓取
 */
async function fetchSubscriptionWithCache(
  env: Env,
  entry: UrlEntry,
  ctx?: ExecutionContext,
  userAgent: string = 'clash.meta'
): Promise<SubscriptionCache> {
  const cacheKey = `sub_cache:${entry.id}`;
  const cacheTtl = entry.cacheTtl !== undefined ? entry.cacheTtl : 300; // 默认 300 秒 (5分钟)

  if (cacheTtl < 0) {
    console.log(`[Cache Bypass] 订阅源 ${entry.name || entry.id} 配置为不缓存，开始同步拉取`);
    return await updateSubscriptionCache(env, entry, userAgent);
  }

  // 1. 尝试从 KV 读取缓存
  let cached: SubscriptionCache | null = null;
  try {
    const raw = await env.KV.get(cacheKey);
    if (raw) {
      cached = JSON.parse(raw) as SubscriptionCache;
    }
  } catch (e) {
    console.error(`[Cache] 读取 KV 失败: ${entry.id}`, e);
  }

  const now = Math.floor(Date.now() / 1000);

  if (cached) {
    // 2. 检查缓存是否过期 (cacheTtl <= 0 表示永不过期)
    const isExpired = cacheTtl > 0 && (now - cached.lastCacheUpdate > cacheTtl);
    if (isExpired && ctx) {
      console.log(`[Cache SWR] 订阅源 ${entry.name || entry.id} 缓存已过期，触发后台异步刷新`);
      // 触发后台异步刷新，不阻塞客户端响应
      ctx.waitUntil(
        updateSubscriptionCache(env, entry, userAgent)
          .catch(err => console.error(`[Cache SWR] 后台刷新失败: ${entry.id}`, err))
      );
    }
    return cached;
  }

  // 3. 缓存不存在（冷启动），必须同步获取
  console.log(`[Cache Cold] 订阅源 ${entry.name || entry.id} 缓存缺失，开始同步获取`);
  return await updateSubscriptionCache(env, entry, userAgent);
}

/**
 * 实际向上游请求并写入 KV 缓存的逻辑
 */
async function updateSubscriptionCache(
  env: Env,
  entry: UrlEntry,
  userAgent: string = 'clash.meta'
): Promise<SubscriptionCache> {
  const cacheKey = `sub_cache:${entry.id}`;
  
  // 支持空格、逗号、分号或竖线分隔的多个 URL
  const urls = entry.url.split(/[\s,;|]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
  if (urls.length === 0) {
    throw new Error('订阅源 URL 为空');
  }

  // 辅助函数：拉取单个 URL
  const fetchOne = async (url: string) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000); // 15秒超时保护
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          ...(entry.refreshHeaders ?? {})
        }
      });
      clearTimeout(id);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const info = response.headers.get('subscription-userinfo') || response.headers.get('Subscription-Userinfo') || '';
      return { text, info };
    } catch (err: any) {
      clearTimeout(id);
      throw err;
    }
  };

  let mergedData = '';
  let mergedUserInfo = '';

  if (urls.length === 1) {
    // 单 URL 逻辑（保持原有逻辑，并处理 Akile / 自动流量获取）
    const { text, info } = await fetchOne(urls[0]);
    mergedData = text;
    mergedUserInfo = info;
    
    // 如果配置了 Akile API，优先用 Akile API 的流量数据覆盖/作为 userInfo
    if (entry.akileServerId && entry.akileApiClient && entry.akileApiSecret) {
      try {
        const cleanVal = (val?: string) => {
          if (!val) return '';
          let s = val.trim();
          if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            s = s.slice(1, -1).trim();
          }
          return s;
        };

        const serverId = cleanVal(entry.akileServerId);
        const apiClient = cleanVal(entry.akileApiClient);
        const apiSecret = cleanVal(entry.akileApiSecret);

        const akileRes = await fetch('https://api.akile.ai/api/v1/api/server/GetServerList', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'Api-Client': apiClient,
            'Api-Secret': apiSecret,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            page_num: 1,
            page_size: 100
          })
        });
        if (akileRes.ok) {
          const akileJson = await akileRes.json() as any;
          if (akileJson.status_code === 0 && Array.isArray(akileJson.list)) {
            const item = akileJson.list.find((s: any) => 
              s.id?.toString() === serverId || 
              s.server_id === serverId || 
              s.server_name === serverId
            );
            if (item) {
              const used = item.used_flow ?? 0;
              const total = (item.flow ?? 0) * 1024 * 1024 * 1024;
              const expire = item.due_time ?? 0;
              mergedUserInfo = `upload=0; download=${used}; total=${total}; expire=${expire}`;
              console.log(`[Akile API] 成功获取流量信息: ${mergedUserInfo}`);
            }
          }
        }
      } catch (e) {
        console.error(`[Akile API] 请求异常:`, e);
      }
    }

    // 如果没有 userInfo 且未配置 Akile API，尝试用 Clash UA 悄悄拉取一次流量信息 (非强制，失败则吞掉)
    if (!mergedUserInfo && !(entry.akileServerId && entry.akileApiClient && entry.akileApiSecret)) {
      const infoController = new AbortController();
      const infoTimeout = setTimeout(() => infoController.abort(), 8000);
      try {
        const infoResponse = await fetch(urls[0], {
          signal: infoController.signal,
          headers: {
            'User-Agent': 'Clash/1.8.0',
            ...(entry.refreshHeaders ?? {})
          }
        });
        clearTimeout(infoTimeout);
        if (infoResponse.ok) {
          mergedUserInfo = infoResponse.headers.get('subscription-userinfo') || infoResponse.headers.get('Subscription-Userinfo') || '';
        }
      } catch (e) {
        clearTimeout(infoTimeout);
      }
    }
  } else {
    // 多 URL 并行获取与合并逻辑
    const results = await Promise.allSettled(urls.map(url => fetchOne(url)));
    const allProxies: any[] = [];
    let totalUpload = 0, totalDownload = 0, totalTotal = 0, minExpire = 0;
    let hasUserInfo = false;
    let successCount = 0;

    for (const res of results) {
      if (res.status === 'fulfilled') {
        successCount++;
        const { text, info } = res.value;
        
        // 解析流量信息
        if (info) {
          hasUserInfo = true;
          const matchUp = info.match(/upload\s*=\s*(\d+)/i);
          const matchDown = info.match(/download\s*=\s*(\d+)/i);
          const matchTotal = info.match(/total\s*=\s*(\d+)/i);
          const matchExpire = info.match(/expire\s*=\s*(\d+)/i);
          if (matchUp) totalUpload += parseInt(matchUp[1], 10);
          if (matchDown) totalDownload += parseInt(matchDown[1], 10);
          if (matchTotal) totalTotal += parseInt(matchTotal[1], 10);
          if (matchExpire) {
            const exp = parseInt(matchExpire[1], 10);
            if (exp > 0 && (minExpire === 0 || exp < minExpire)) minExpire = exp;
          }
        }

        // 解析节点列表
        let parsed: any[] = [];
        if (isNodeList(text)) {
          parsed = parseNodeURIs(text);
        } else {
          try {
            const yml = jsyaml.load(text) as any;
            if (yml && Array.isArray(yml.proxies)) {
              parsed = yml.proxies;
            }
          } catch {}
        }
        allProxies.push(...parsed);
      }
    }

    if (successCount === 0) {
      throw new Error('所有配置的子订阅源均拉取失败');
    }

    // 将多源合并后的代理节点输出为 YAML 格式
    mergedData = jsyaml.dump({ proxies: allProxies }, { lineWidth: -1 });
    if (hasUserInfo) {
      mergedUserInfo = `upload=${totalUpload}; download=${totalDownload}; total=${totalTotal}; expire=${minExpire}`;
    }
  }

  const newCache: SubscriptionCache = {
    lastCacheUpdate: Math.floor(Date.now() / 1000),
    data: mergedData,
    userInfo: mergedUserInfo
  };

  // 写入 KV 缓存
  await env.KV.put(cacheKey, JSON.stringify(newCache));
  console.log(`[Cache] 订阅源 ${entry.name || entry.id} 缓存更新成功`);
  return newCache;
}

// ---------- 订阅内容下发 ----------

async function fetchSubscriptionUserInfo(entries: UrlEntry[], env: Env, ctx?: ExecutionContext): Promise<string> {
  if (entries.length === 0) return 'upload=0; download=0; total=107374182400; expire=0';

  let upload = 0, download = 0, total = 0, expire = 0;
  let foundInfo = false;

  const results = await Promise.allSettled(entries.map(entry =>
    fetchSubscriptionWithCache(env, entry, ctx, 'Clash/1.8.0')
  ));

  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) {
      const info = res.value.userInfo;
      if (info) {
        foundInfo = true;
        const matchUp    = info.match(/upload\s*=\s*(\d+)/i);
        const matchDown  = info.match(/download\s*=\s*(\d+)/i);
        const matchTotal = info.match(/total\s*=\s*(\d+)/i);
        const matchExpire = info.match(/expire\s*=\s*(\d+)/i);
        if (matchUp)    upload   += parseInt(matchUp[1],   10);
        if (matchDown)  download += parseInt(matchDown[1], 10);
        if (matchTotal) total    += parseInt(matchTotal[1],10);
        if (matchExpire) {
          const exp = parseInt(matchExpire[1], 10);
          if (exp > 0 && (expire === 0 || exp < expire)) expire = exp;
        }
      }
    }
  }
  if (!foundInfo) return 'upload=0; download=0; total=107374182400; expire=0';
  return `upload=${upload}; download=${download}; total=${total}; expire=${expire}`;
}

/**
 * JS 引擎版（带 lookahead）——用于前端预览和 worker 内部 JS 过滤。
 * 普通正则：直接返回；高级 JSON：编译为含 lookahead 的正则。
 */
function compileGroupFilter(filter: string): string {
  if (!filter) return '';
  if (!filter.startsWith('{"advanced":true')) return filter;
  try {
    const data = JSON.parse(filter);
    const rules = data.rules || [];
    const orIncludes  = rules.filter((r: any) => r.logic === 'or' ).map((r: any) => r.value).filter(Boolean);
    const andIncludes = rules.filter((r: any) => r.logic === 'and').map((r: any) => r.value).filter(Boolean);
    const notExcludes = rules.filter((r: any) => r.logic === 'not').map((r: any) => r.value).filter(Boolean);
    let regex = '^';
    if (orIncludes.length  > 0) regex += `(?=.*(${orIncludes.join('|')}))`;
    for (const andInc of andIncludes) regex += `(?=.*${andInc})`;
    if (notExcludes.length > 0) regex += `(?!.*(${notExcludes.join('|')}))`;
    regex += '.*$';
    return regex === '^.*$' ? '' : regex;
  } catch { return ''; }
}

/**
 * Go/RE2 层——正向包含匹配（用于 Mihomo filter-regex 字段）
 * OR/AND 规则用 | 连接；NOT 规则即 GROUP_EXCLUDE，此处不处理。
 * 无包含规则时返回空字符串（Mihomo 空字符串 = 匹配全部）。
 */
function compileGroupFilterGo(filter: string): string {
  if (!filter) return '';
  if (!filter.startsWith('{"advanced":true')) return filter; // 普通正则直接使用
  try {
    const data = JSON.parse(filter);
    const rules = data.rules || [];
    const positives = rules
      .filter((r: any) => r.logic === 'or' || r.logic === 'and')
      .map((r: any) => r.value).filter(Boolean);
    return positives.length > 0 ? positives.join('|') : '';
  } catch { return ''; }
}

/**
 * Go/RE2 层——排除匹配（用于 Mihomo exclude-filter 字段）
 * 将所有 NOT 规则用 | 连接输出。
 */
function compileGroupExclude(filter: string): string {
  if (!filter) return '';
  if (!filter.startsWith('{"advanced":true')) return ''; // 普通正则没有单独的排除部分
  try {
    const data = JSON.parse(filter);
    const rules = data.rules || [];
    const nots = rules.filter((r: any) => r.logic === 'not').map((r: any) => r.value).filter(Boolean);
    return nots.length > 0 ? nots.join('|') : '';
  } catch { return ''; }
}

function decodeBase64(str: string): string {
  try {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch { return ''; }
}

/** 解析通用的节点 URI 列表 (V2Ray, Nekobox 等) */
function parseNodeURIs(text: string): any[] {
  let content = text.trim();
  // 检查全量 Base64
  if (!content.includes('://') && content.length > 16) {
    const decoded = decodeBase64(content);
    if (decoded && decoded.includes('://')) content = decoded;
  }

  const lines = content.split(/[\n\r]+/).map(l => l.trim()).filter(l => l && l.includes('://'));
  const proxies: any[] = [];

  for (const line of lines) {
    try {
      const url = new URL(line);
      const protocol = url.protocol.replace(':', '');
      const remarks = decodeURIComponent(url.hash.replace(/^#/, '')) || 'Unnamed Node';
      let proxy: any = { name: remarks, type: protocol, udp: true };

      if (protocol === 'ss') {
        const ssRegex = /^ss:\/\/([^@]+)@([^:]+):(\d+)/;
        const match = line.match(ssRegex);
        if (match) {
          const [_, auth, host, port] = match;
          const [method, password] = (auth.includes(':') ? auth : decodeBase64(auth)).split(':');
          proxy.server = host; proxy.port = parseInt(port, 10);
          proxy.cipher = method; proxy.password = password;
        } else continue;
      } else if (protocol === 'vmess') {
        const config = JSON.parse(decodeBase64(url.host || url.pathname.replace(/^\/\//, '')));
        proxy.name = config.ps || proxy.name;
        proxy.server = config.add; proxy.port = parseInt(config.port, 10);
        proxy.uuid = config.id; proxy.alterId = parseInt(config.aid || '0', 10);
        proxy.cipher = config.scy || 'auto';
        if (config.net === 'ws') {
          proxy.network = 'ws';
          proxy['ws-opts'] = { path: config.path || '/', headers: { Host: config.host || '' } };
        }
        if (config.tls === 'tls') proxy.tls = true;
      } else if (protocol === 'vless' || protocol === 'trojan') {
        proxy.server = url.hostname; proxy.port = parseInt(url.port, 10);
        if (protocol === 'vless') proxy.uuid = url.username;
        else proxy.password = url.username;
        const params = url.searchParams;
        if (params.get('security') === 'tls' || params.get('security') === 'reality') proxy.tls = true;
        if (params.get('sni')) {
          proxy.servername = params.get('sni');
          proxy.sni = params.get('sni');
        }
        if (params.get('flow')) proxy.flow = params.get('flow');
        if (params.get('fp')) proxy.client_fingerprint = params.get('fp');
        if (params.get('pbk')) {
          proxy['reality-opts'] = { 'public-key': params.get('pbk') };
        }
        if (params.get('sid')) {
          proxy['reality-opts'] = { ...proxy['reality-opts'], 'short-id': params.get('sid') };
        }
        proxy.network = params.get('type') || 'tcp';
        if (proxy.network === 'ws') {
          proxy['ws-opts'] = { path: params.get('path') || '/', headers: { Host: params.get('host') || '' } };
        } else if (proxy.network === 'grpc') {
          proxy['grpc-opts'] = { 'grpc-service-name': params.get('serviceName') || '' };
          delete proxy.flow;
        }
      } else if (protocol === 'hysteria2' || protocol === 'hy2') {
        proxy.type = 'hysteria2';
        proxy.server = url.hostname; proxy.port = parseInt(url.port, 10);
        proxy.password = url.username;
        const params = url.searchParams;
        if (params.get('sni')) proxy.sni = params.get('sni');
        if (params.get('obfs') === 'onion') {
           proxy.obfs = 'onion'; proxy['obfs-password'] = params.get('obfs-password');
        }
        if (params.get('up')) proxy.up = params.get('up');
        if (params.get('down')) proxy.down = params.get('down');
        if (params.get('mtu')) proxy.mtu = parseInt(params.get('mtu')!, 10);
      } else if (protocol === 'tuic') {
        proxy.server = url.hostname; proxy.port = parseInt(url.port, 10);
        proxy.uuid = url.username; proxy.password = url.password;
        proxy.alpn = url.searchParams.get('alpn')?.split(',') || ['h3'];
        proxy['congestion-controller'] = url.searchParams.get('congestion_control') || 'cubic';
      } else {
        continue;
      }
      if (proxy.server && proxy.port) proxies.push(proxy);
    } catch (e) { console.error('Parse node failed:', e); }
  }
  return proxies;
}

function safeBtoa(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch { return ''; }
}

/** 判定是否为节点列表格式 */
function isNodeList(text: string): boolean {
  const content = text.trim();
  if (content.includes('://')) return true;
  if (content.length > 16) {
    const decoded = decodeBase64(content);
    return decoded.includes('://');
  }
  return false;
}

/** 将代理对象转换回 URI */
function proxyToURI(p: any): string {
  const name = encodeURIComponent(p.name || '');
  if (p.type === 'ss') {
    const auth = safeBtoa(`${p.cipher}:${p.password}`).replace(/=/g, '');
    return `ss://${auth}@${p.server}:${p.port}#${name}`;
  }
  if (p.type === 'vmess') {
    const config: any = {
      v: "2", ps: p.name, add: p.server, port: p.port, id: p.uuid, aid: p.alterId || 0,
      scy: p.cipher || "auto", net: p.network || "tcp", type: "none", host: p.host || "",
      path: p.path || "", tls: p.tls ? "tls" : ""
    };
    if (p['ws-opts']) {
      config.net = 'ws'; config.path = p['ws-opts'].path;
      config.host = p['ws-opts'].headers?.Host || '';
    }
    return `vmess://${safeBtoa(JSON.stringify(config))}`;
  }
  if (p.type === 'vless' || p.type === 'trojan') {
    let uri = `${p.type}://${p.type === 'vless' ? p.uuid : p.password}@${p.server}:${p.port}?type=${p.network || 'tcp'}`;
    if (p.tls) uri += `&security=tls`;
    if (p.servername) uri += `&sni=${encodeURIComponent(p.servername)}`;
    else if (p.sni) uri += `&sni=${encodeURIComponent(p.sni)}`;
    
    const ro = p['reality-opts'] || p.reality_opts;
    if (ro) {
      const pbk = ro['public-key'] || ro.publicKey || p['public-key'] || '';
      const sid = ro['short-id'] || ro.shortId || p['short-id'] || '';
      uri += `&pbk=${encodeURIComponent(pbk)}&sid=${encodeURIComponent(sid)}`;
    } else if (p['public-key']) {
      uri += `&pbk=${encodeURIComponent(p['public-key'])}&sid=${encodeURIComponent(p['short-id'] || '')}`;
    }
    if (p['ws-opts']) uri += `&path=${encodeURIComponent(p['ws-opts'].path)}&host=${p['ws-opts'].headers?.Host || ''}`;
    return `${uri}#${name}`;
  }
  if (p.type === 'hysteria2') {
    return `hysteria2://${p.password}@${p.server}:${p.port}?sni=${p.sni || ''}#${name}`;
  }
  if (p.type === 'tuic') {
    return `tuic://${p.uuid}:${p.password}@${p.server}:${p.port}?alpn=${(p.alpn || []).join(',')}&congestion_control=${p['congestion-controller'] || ''}#${name}`;
  }
  return '';
}

async function fetchProxiesFromGroup(
  group: SubscriptionGroup,
  env: Env,
  ctx?: ExecutionContext
): Promise<{ proxies: any[]; rawYamls: string[] }> {
  const filter = compileGroupFilter(group.filter);
  const filterRe = filter ? new RegExp(filter) : null;

  const needCfOptimize = group.urls.some(u => u.cfOptimize);
  let cfIps: OptimizedIP[] = [];
  if (needCfOptimize) {
    cfIps = await fetchCloudflareOptimizedIPs(env);
  }

  const results = await Promise.allSettled(
    group.urls.map(entry =>
      fetchSubscriptionWithCache(env, entry, ctx, 'clash.meta').then(c => c.data)
    )
  );

  const rawYamls: string[] = [];
  const proxies: any[] = [];

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status !== 'fulfilled' || !res.value) continue;
    rawYamls.push(res.value);

    let parsed = [];
    if (isNodeList(res.value)) {
      parsed = parseNodeURIs(res.value);
    }
    
    if (parsed.length === 0) {
      try {
        const yml = jsyaml.load(res.value) as any;
        if (yml && Array.isArray(yml.proxies)) {
          parsed = yml.proxies;
        }
      } catch { /* 忽略解析错误 */ }
    }

    const entry = group.urls[i];
    for (const p of parsed) {
      if (!p || !p.name) continue;
      if (filterRe && !filterRe.test(p.name)) continue;
      
      // 兼容并规范化 Reality 结构（必须为 reality-opts 嵌套，且使用连字符 -）
      if (p.type === 'vless' || p.type === 'trojan') {
        const hasRo = p['reality-opts'] || p.reality_opts;
        const pbk = p['public-key'] || (hasRo ? (hasRo['public-key'] || hasRo.publicKey) : undefined);
        const sid = p['short-id'] || (hasRo ? (hasRo['short-id'] || hasRo.shortId) : undefined);
        
        if (pbk) {
          p['reality-opts'] = {
            'public-key': pbk,
            ...(sid ? { 'short-id': sid } : {})
          };
          // 额外保留外层的 flat 字段以兼容旧版本内核/第三方 Meta 分支客户端
          p['public-key'] = pbk;
          if (sid) p['short-id'] = sid;
          
          delete p.reality_opts;
        }
        
        if (p.network === 'grpc') {
          delete p.flow;
        }
      }

      if (p.type === 'hysteria2') {
        if (entry.hysteria2Up) p.up = entry.hysteria2Up;
        if (entry.hysteria2Down) p.down = entry.hysteria2Down;
        if (entry.hysteria2Mtu) p.mtu = entry.hysteria2Mtu;
      }

      const isCdn = p.name.toLowerCase().includes('cdn') || (
        (p.type === 'vmess' || p.type === 'vless' || p.type === 'trojan') && 
        p.network === 'ws' && 
        (p.tls || p.security === 'tls')
      );

      // 启用优选 IP 优化时，自动过滤丢弃非 CDN 节点
      if (entry.cfOptimize && !isCdn) {
        continue;
      }

      if (entry.cfOptimize && isCdn && cfIps.length > 0) {
        const limit = entry.cfOptimizeNum || 5;
        const originalServer = p.server;
        const hostDomain = p.servername || p.sni || originalServer;

        // 保留原节点
        proxies.push(p);

        // 克隆出优选 IP 节点
        const optimizedIps = cfIps.slice(0, limit);
        const ispCounts: Record<string, number> = {};

        optimizedIps.forEach((opt) => {
          if (!ispCounts[opt.isp]) ispCounts[opt.isp] = 0;
          ispCounts[opt.isp]++;

          const cloned = JSON.parse(JSON.stringify(p));
          cloned.name = `${p.name} - ${opt.isp} ${ispCounts[opt.isp]}`;
          cloned.server = opt.ip;
          cloned.port = 443;

          // 保持 SNI
          if (!cloned.sni) cloned.sni = hostDomain;
          if (!cloned.servername) cloned.servername = hostDomain;

          // 对于 ws 传输，保持 Host
          if (cloned.network === 'ws' || cloned.type === 'vmess') {
            if (!cloned['ws-opts']) cloned['ws-opts'] = { path: '/' };
            if (!cloned['ws-opts'].headers) cloned['ws-opts'].headers = {};
            if (!cloned['ws-opts'].headers.Host && !cloned['ws-opts'].headers.host) {
              cloned['ws-opts'].headers.Host = hostDomain;
            }
          }

          proxies.push(cloned);
        });
        continue;
      }

      proxies.push(p);
    }
  }

  return { proxies, rawYamls };
}

async function handleSubFetch(pathname: string, env: Env, request: Request, ctx: ExecutionContext): Promise<Response> {
  const token = pathname.replace(/^\/sub\//, '').split('/')[0];
  if (!token) return err404();

  const linksRaw = await env.KV.get('links');
  const links: GeneratedLink[] = linksRaw ? JSON.parse(linksRaw) : [];
  const link = links.find(l=>l.token===token);
  if (!link) return err('无效的订阅令牌', 404);
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return err('订阅链接已过期', 410);

  const subRaw = await env.KV.get('subscriptions');
  const groups: any[] = subRaw ? JSON.parse(subRaw) : [];
  const rawGroup = groups.find(g=>g.id===link.subscriptionGroupId);
  if (!rawGroup || !rawGroup.enabled) return err('订阅组不存在或已禁用', 404);

  const globalUrls = await getGlobalUrlsAndMigrate(env.KV);
  const group: SubscriptionGroup = resolveSubscriptionGroup(rawGroup, globalUrls);

  const ua = request.headers.get('User-Agent')?.toLowerCase() || '';
  const urlParams = new URL(request.url).searchParams;
  const flag = urlParams.get('flag') || urlParams.get('client');
  const wantNodes = ua.includes('v2ray') || ua.includes('nekobox') || ua.includes('shadowrocket') || ua.includes('postman') || ua.includes('curl') || flag === 'nodes';

  const providerParam = urlParams.get('provider');
  const urlIdParam = urlParams.get('url_id');
  const urlIndexParam = urlParams.get('url_index');

  // 若请求指定了特定的上级订阅源，则作为 proxy-provider 接口直接返回节点列表
  if (providerParam || urlIdParam || urlIndexParam !== null) {
    let targetUrls = group.urls;
    if (providerParam) {
      targetUrls = group.urls.filter(u => u.name === providerParam);
    } else if (urlIdParam) {
      targetUrls = group.urls.filter(u => u.id === urlIdParam);
    } else if (urlIndexParam !== null) {
      const idx = parseInt(urlIndexParam, 10);
      if (!isNaN(idx) && group.urls[idx]) {
        targetUrls = [group.urls[idx]];
      }
    }

    const resolvedGroup = { ...group, urls: targetUrls };
    const { proxies } = await fetchProxiesFromGroup(resolvedGroup, env, ctx);
    const userInfo = await fetchSubscriptionUserInfo(targetUrls, env, ctx);

    if (wantNodes) {
      const nodeText = proxies.map(p => proxyToURI(p)).filter(Boolean).join('\n');
      return subResponse(safeBtoa(nodeText), providerParam || 'provider', userInfo, true);
    }

    const providerYaml = jsyaml.dump({ proxies }, { lineWidth: -1 });
    return subResponse(providerYaml, providerParam || 'provider', userInfo);
  }

  const tplObj = await env.ATTACHMENTS.get(link.templateId);
  const tpl: Template|null = tplObj ? JSON.parse(await tplObj.text()) : null;

  const userInfo = await fetchSubscriptionUserInfo(group.urls, env, ctx);

  // 拉取并过滤代理节点
  const { proxies, rawYamls } = await fetchProxiesFromGroup(group, env, ctx);

  if (!tpl) {
    if (proxies.length > 0) {
      try {
        const base = jsyaml.load(rawYamls[0]) as any;
        if (base && Array.isArray(base.proxies)) {
          base.proxies = proxies;
          return subResponse(jsyaml.dump(base, { lineWidth: -1 }), link.name, userInfo);
        }
      } catch { /* 失败回退 */ }
    }
    return subResponse(rawYamls.join('\n'), link.name, userInfo);
  }

  const output = await renderTemplate(tpl.content, group, proxies, env, request.url);
  return subResponse(output, link.name, userInfo);
}

/**
 * 模板渲染引擎
 *
 * 支持两种注入方式：
 *
 * 1. 自动注入 proxy-providers：
 *    在模板的 proxy-providers 块下写：
 *      # {{PROVIDERS}}
 *    Worker 会将其替换为订阅组中每条 URL 生成的 provider 条目。
 *    每条 URL 的 provider name 为 "p1", "p2", ... 或可在 URL 行内加注释命名：
 *      # url: https://... | name: XS
 *
 * 2. 单条 URL 变量替换（适合只有一个 provider 的简单场景）：
 *    {{URL_0}}、{{URL_1}} ... 替换为对应下标的 URL
 *    {{URL_ALL}} 替换为所有 URL 以换行分隔
 *
 * 3. 通用变量（可在模板里直接写）：
 *    {{GROUP_NAME}} → 订阅组名称
 *    {{GROUP_FILTER}} → 订阅组过滤正则
 *    {{GENERATED_AT}} → 生成时间 ISO 8601
 * 
 * 4. 包含其他模板：
 *    {{INCLUDE: 模板名称}} → 会被替换为对应的子模板内容
 */
async function renderTemplate(template: string, group: SubscriptionGroup, filteredProxies: any[], env: Env, requestUrl?: string): Promise<string> {
  let output = template;
  const subUrlBase = requestUrl ? requestUrl.split('?')[0] : '';

  // 1. 获取所有模板用于 INCLUDE 替换 (利用自动 seed 获取完整列表)
  const allTpls = await getOrSeedTemplates(env.ATTACHMENTS);
  const templatesMap = new Map<string, string>();
  for (const t of allTpls) {
    templatesMap.set(t.name, t.content);
  }

  // 2. 递归替换 {{INCLUDE: xxx}} (最大深度 5 层防止死循环)
  let prevOutput;
  let maxDepth = 5;
  do {
    prevOutput = output;
    output = output.replace(/\{\{INCLUDE:\s*([^}]+)\}\}/g, (match, name) => {
      const tplName = name.trim();
      return templatesMap.get(tplName) ?? `# [ERROR: 找不到模板 '${tplName}']`;
    });
    maxDepth--;
  } while (output !== prevOutput && maxDepth > 0);

  // 3. {{PROVIDERS}} → 完整 proxy-providers YAML 块 (代理 URL 以应用 Hysteria 2 参数和过滤规则)
  if (output.includes('# {{PROVIDERS}}') || output.includes('{{PROVIDERS}}')) {
    const providerLines = group.urls.map((entry, i) => {
      const name = entry.name ?? `p${i + 1}`;
      const providerUrl = subUrlBase ? `${subUrlBase}?provider=${encodeURIComponent(name)}` : entry.url;
      return [
        `  ${name}:`,
        `    url: "${providerUrl}"`,
        `    path: "./providers/${name}.yaml"`,
        `    <<: *p`,
      ].join('\n');
    }).join('\n');

    output = output
      .replace(/^\s*#\s*\{\{PROVIDERS\}\}\s*$/m, providerLines)
      .replace(/\{\{PROVIDERS\}\}/g, providerLines);
  }

  // 4. {{PROXIES}} → 过滤后的代理节点内联 YAML 块
  if (output.includes('{{PROXIES}}') || output.includes('# {{PROXIES}}')) {
    const proxyYaml = filteredProxies.length > 0
      ? filteredProxies.map(p => jsyaml.dump(p, { lineWidth: -1 }).split('\n').map((l, i) => i === 0 ? `  - ${l}` : `    ${l}`).filter(l => l.trim()).join('\n')).join('\n')
      : '  []';
    output = output
      .replace(/^\s*#\s*\{\{PROXIES\}\}\s*$/m, proxyYaml)
      .replace(/\{\{PROXIES\}\}/g, proxyYaml);
  }

  // {{PROXY_NAMES}} → 过滤后的代理名称列表（YAML 序列格式）
  if (output.includes('{{PROXY_NAMES}}')) {
    const namesYaml = filteredProxies.map(p => `  - "${p.name}"`).join('\n');
    output = output.replace(/\{\{PROXY_NAMES\}\}/g, namesYaml);
  }

  // {{URL_GROUPS}} → 按 UrlEntry.proxyGroup 聚合，动态生成 url-test proxy-group 块
  // 无 proxyGroup 的条目默认归入 "other" 分组
  if (output.includes('# {{URL_GROUPS}}') || output.includes('{{URL_GROUPS}}')) {
    const ICON_BASE = 'https://gh-proxy.com/raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/';
    // 按 proxyGroup 收集：providers 列表 + 分组图标（取该组第一个有 icon 的条目）
    const groupMap = new Map<string, { providers: string[]; icon?: string }>();
    for (const entry of group.urls) {
      const providerName = entry.name;
      if (!providerName) continue;                          // 无 name 则跳过
      const pgName = entry.proxyGroup || 'other';           // 默认 other
      if (!groupMap.has(pgName)) groupMap.set(pgName, { providers: [], icon: undefined });
      const info = groupMap.get(pgName)!;
      info.providers.push(providerName);
      if (!info.icon && entry.icon) info.icon = entry.icon; // 取第一个有图标的
    }
    const groupBlocks = Array.from(groupMap.entries()).map(([groupName, info]) => {
      const useLines = info.providers.map(p => `      - ${p}`).join('\n');
      const iconLine = `\n    icon: ${ICON_BASE}${info.icon ?? 'Server'}.png`;
      return [
        `  - name: ${groupName}`,
        `    type: url-test`,
        `    use:`,
        useLines,
        `    tolerance: 50`,
        `    url: https://www.gstatic.com/generate_204`,
        `    interval: 300`,
      ].join('\n') + iconLine;
    }).join('\n\n');
    // 替换时显式补 \n，避免 CRLF 文件的 \r 被 \s*$ 消耗导致空行丢失
    const replacement = groupBlocks ? '\n' + groupBlocks + '\n' : '  # (无已配置的分组)';
    output = output
      .replace(/^\s*#\s*\{\{URL_GROUPS\}\}\s*$/m, replacement)
      .replace(/\{\{URL_GROUPS\}\}/g, replacement);
  }

  // {{URL_GROUP_PROVIDERS:分组名}} → 某分组下的所有 provider 名称，以 YAML 列表形式输出
  // 例如：
  //     use:
  //       {{URL_GROUP_PROVIDERS:AI}}
  // 会被替换为：
  //     use:
  //       - XS
  //       - 三毛
  output = output.replace(/^(\s*)\{\{URL_GROUP_PROVIDERS:([^}]+)\}\}/gm, (match, indent, pgName) => {
    const trimmedPgName = pgName.trim();
    const providers = group.urls
      .filter(e => e.name && (e.proxyGroup || 'other') === trimmedPgName)
      .map(e => e.name!);
    if (providers.length === 0) return `${indent}[]`;
    return providers.map(p => `${indent}- ${p}`).join('\n');
  });

  // 兜底替换：行内 {{URL_GROUP_PROVIDERS:分组名}}
  output = output.replace(/\{\{URL_GROUP_PROVIDERS:([^}]+)\}\}/g, (match, pgName) => {
    const trimmedPgName = pgName.trim();
    const providers = group.urls
      .filter(e => e.name && (e.proxyGroup || 'other') === trimmedPgName)
      .map(e => e.name!);
    return providers.join(', ');
  });

  // {{URL_GROUP_NAMES}} → 所有 proxyGroup 名称（去重，保持顺序，包含 other）
  if (output.includes('{{URL_GROUP_NAMES}}')) {
    const names = [...new Set(group.urls
      .filter(e => e.name)                                  // 只含有 name 的条目
      .map(e => e.proxyGroup || 'other')                    // 无 proxyGroup 默认 other
    )];
    output = output.replace(/\{\{URL_GROUP_NAMES\}\}/g, names.join(','));
  }

  // {{URL_0}}, {{URL_1}}, ... → 对应下标 URL (使用代理 URL 以应用 Hysteria 2 参数和过滤规则)
  group.urls.forEach((entry, i) => {
    const proxiedUrl = subUrlBase ? `${subUrlBase}?url_index=${i}` : entry.url;
    output = output.replace(new RegExp(`\\{\\{URL_${i}\\}\\}`, 'g'), proxiedUrl);
  });

  // {{URL_ALL}} → 所有 URL 以换行分隔 (使用代理 URL)
  const allProxiedUrls = group.urls.map((entry, i) => subUrlBase ? `${subUrlBase}?url_index=${i}` : entry.url).join('\n');
  output = output.replace(/\{\{URL_ALL\}\}/g, allProxiedUrls);

  // 通用变量
  // {{GROUP_FILTER}}  → Go RE2 兼容的正向匹配正则（用于 filter-regex 字段）
  // {{GROUP_EXCLUDE}} → Go RE2 列举式排除正则（用于 exclude-filter 字段）
  const goFilter  = compileGroupFilterGo(group.filter);
  const goExclude = compileGroupExclude(group.filter);
  output = output
    .replace(/\{\{GROUP_NAME\}\}/g,    group.title)
    .replace(/\{\{GROUP_FILTER\}\}/g,  goFilter)
    .replace(/\{\{GROUP_EXCLUDE\}\}/g, goExclude)
    .replace(/\{\{GENERATED_AT\}\}/g,  new Date().toISOString());

  // 清理 flow sequence [...] 中的空项和多余逗号
  output = output.replace(/\[([^\]]*)\]/g, (match, content) => {
    const cleaned = content
      .split(',')
      .map((x: string) => x.trim())
      .filter(Boolean)
      .join(', ');
    return `[${cleaned}]`;
  });

  return output;
}

function subResponse(content: string, name: string, userInfo: string, isNodes = false): Response {
  const encodedName = encodeURIComponent(name);
  const ext = isNodes ? 'txt' : 'yaml';
  const contentType = isNodes ? 'text/plain' : 'text/yaml';
  return new Response(content, {
    headers: {
      'Content-Type': `${contentType}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${encodedName}.${ext}"; filename*=utf-8''${encodedName}.${ext}`,
      'Subscription-Userinfo': userInfo,
      ...CORS,
    },
  });
}
