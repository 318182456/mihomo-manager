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
}

export interface SubscriptionGroup {
  id: string; title: string; enabled: boolean; filter: string;
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
      return nameMatch ? { url, name: nameMatch[1] } : { url };
    }
    return item as UrlEntry;
  });
}

/** 从单个 UrlEntry 的 refreshUrl 接口拉取最新订阅链接 */
async function fetchAndExtractUrl(entry: UrlEntry): Promise<{ ok: boolean; url?: string; msg: string }> {
  if (!entry.refreshUrl) return { ok: false, msg: '未配置 refreshUrl' };
  const urlToFetch = entry.refreshUrl.trim();

  if (entry.refreshType === 'hoshi_v2board' || entry.refreshType === 'v2board') {
    // 1. 获取域名列表
    let domains: any[] = [];
    if (entry.refreshType === 'hoshi_v2board') {
      try {
        const dataUrl = new URL('/data.json', urlToFetch).toString();
        const dataRes = await fetch(dataUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        });
        domains = await dataRes.json() as any[];
      } catch (e) {
        console.error('[v2board] 获取动态域名列表失败, 尝试使用初始 URL:', e);
        domains = [{ jumpUrl: urlToFetch }];
      }
    } else {
      domains = [{ jumpUrl: urlToFetch }];
    }

    const email = entry.refreshHeaders?.email || entry.refreshHeaders?.Email;
    const password = entry.refreshHeaders?.password || entry.refreshHeaders?.Password;
    if (!email || !password) {
      return { ok: false, msg: '需要在 refreshHeaders 中配置 email 和 password' };
    }

    let lastError = '';
    for (const d of domains) {
      const host = d.jumpUrl || d.checkUrl || urlToFetch;
      if (!host) continue;
      try {
        // 2. 登录请求
        const loginUrl = new URL('/data/passport/auth/login', host).toString();
        const loginRes = await fetch(loginUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Type': 'Hoshi',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({ email, password })
        });

        if (!loginRes.ok) {
          lastError = `Login HTTP ${loginRes.status}`;
          continue;
        }

        const loginJson = await loginRes.json() as any;
        if (!loginJson.success || !loginJson.data?.auth_data) {
          lastError = `Login failed: ${loginJson.data || 'unknown error'}`;
          continue;
        }

        const token = loginJson.data.auth_data;

        // 3. 获取最新订阅 URL
        const subUrl = new URL('/data/user/getSubscribe', host).toString();
        const subRes = await fetch(subUrl, {
          headers: {
            'Authorization': token,
            'X-Client-Type': 'Hoshi',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          }
        });

        if (!subRes.ok) {
          lastError = `GetSubscribe HTTP ${subRes.status}`;
          continue;
        }

        const subJson = await subRes.json() as any;
        if (!subJson.success || !subJson.data?.subscribe_url) {
          lastError = `GetSubscribe response success is false`;
          continue;
        }

        const subscribeUrl = subJson.data.subscribe_url;
        return { ok: true, url: subscribeUrl, msg: '获取成功' };
      } catch (err) {
        lastError = String(err);
        console.error(`[v2board] 尝试节点 ${host} 出错:`, err);
      }
    }
    return { ok: false, msg: `v2board 刷新失败: ${lastError}` };
  }

  let resp: Response;
  try {
    resp = await fetch(urlToFetch, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        ...(entry.refreshHeaders ?? {})
      },
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
  const raw = await kv.get('subscriptions');
  const list: any[] = raw ? JSON.parse(raw) : [];
  const gIdx = list.findIndex((g: any) => g.id === groupId);
  if (gIdx === -1) {
    console.log(`[Cron] 订阅组不存在: ${groupId}`);
    return { refreshed: 0, errors: ['订阅组不存在'] };
  }

  const groupName = list[gIdx].title || groupId;
  const entries = normalizeUrls(list[gIdx].urls ?? []);
  type FetchResult = { i: number; ok: boolean; url?: string; msg: string | null };
  const jobs = entries.map((entry, i): Promise<FetchResult> => {
    if (entry.refreshUrl) {
      console.log(`[Cron] 正在刷新 [${groupName}] 条目 ${i}: ${entry.refreshUrl}`);
      return fetchAndExtractUrl(entry).then(r => ({ i, ...r, msg: r.msg }));
    }
    return Promise.resolve({ i, ok: false, url: undefined, msg: null });
  });
  const results = await Promise.allSettled(jobs);

  let refreshed = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { i, ok, url, msg } = r.value;
      if (ok && url) {
        console.log(`[Cron] 刷新成功 [${groupName}] 条目 ${i}: 获取到新 URL`);
        entries[i] = { ...entries[i], url, lastRefreshedAt: new Date().toISOString() }; refreshed++;
      }
      else if (msg) {
        console.error(`[Cron] 刷新失败 [${groupName}] 条目 ${i}: ${msg}`);
        errors.push(msg);
      }
    } else {
      console.error(`[Cron] 请求异常 [${groupName}]: ${String(r.reason)}`);
      errors.push(String(r.reason));
    }
  }
  list[gIdx] = { ...list[gIdx], urls: entries, updatedAt: new Date().toISOString() };
  await kv.put('subscriptions', JSON.stringify(list));
  console.log(`[Cron] 完成刷新订阅组 [${groupName}], 成功: ${refreshed}, 失败: ${errors.length}`);
  return { refreshed, errors };
}

export default {
  // ---------- Cron 定时任务（每天 UTC 00:00）----------
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron] 定时任务触发: ${event.cron}`);
    const raw = await env.KV.get('subscriptions');
    const list: any[] = raw ? JSON.parse(raw) : [];
    // 筛选：组已启用且至少有一个 URL 条目配置了 refreshUrl
    const targets = list.filter((s: any) =>
      s.enabled && normalizeUrls(s.urls ?? []).some((e: UrlEntry) => e.refreshUrl)
    );
    console.log(`[Cron] 找到 ${targets.length} 个符合条件的订阅组准备刷新`);

    const results = await Promise.allSettled(targets.map((g: any) => refreshGroupUrls(g.id, env.KV)));
    let successCount = 0;
    let failCount = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') successCount++;
      else failCount++;
    }
    console.log(`[Cron] 定时任务执行完毕: 成功组数 ${successCount}, 失败组数 ${failCount}`);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });

    if (pathname.startsWith('/sub/'))
      return handleSubFetch(pathname, env, request);

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

      case 'templates':     return handleTemplates(request, env.ATTACHMENTS, method, id);
      case 'links':         return handleLinks(request, env.KV, method, id);
      case 'dashboard':     return handleDashboard(env);
      default:              return err404();
    }
  } catch (e) {
    return err(String(e), 500);
  }
}

// ---------- 订阅组 CRUD ----------

async function handleSubscriptions(req: Request, kv: KVNamespace, method: string, id: string|null): Promise<Response> {
  const raw = await kv.get('subscriptions');
  // 读时自动将旧的 string[] 迁移为 UrlEntry[]
  let list: SubscriptionGroup[] = (raw ? JSON.parse(raw) : []).map((g: any) => ({ ...g, urls: normalizeUrls(g.urls ?? []) }));

  if (method === 'GET' && !id) return ok(list);
  if (method === 'GET' && id)  return list.find(s=>s.id===id) ? ok(list.find(s=>s.id===id)) : err404();

  if (method === 'POST' && !id) {
    const body = await req.json<Omit<SubscriptionGroup,'id'|'updatedAt'>>();
    const item: SubscriptionGroup = { ...body, urls: normalizeUrls(body.urls as any ?? []), id: uuid(), updatedAt: new Date().toISOString() };
    await kv.put('subscriptions', JSON.stringify([...list, item]));
    return ok(item, 201);
  }
  if (method === 'PUT' && id) {
    const idx = list.findIndex(s=>s.id===id);
    if (idx===-1) return err404();
    const body = await req.json<Partial<SubscriptionGroup>>();
    const urls = body.urls !== undefined ? normalizeUrls(body.urls as any) : list[idx].urls;
    list[idx] = { ...list[idx], ...body, urls, id, updatedAt: new Date().toISOString() };
    await kv.put('subscriptions', JSON.stringify(list));
    return ok(list[idx]);
  }
  if (method === 'DELETE' && id) {
    await kv.put('subscriptions', JSON.stringify(list.filter(s=>s.id!==id)));
    return ok({ ok: true });
  }
  return err('Method Not Allowed', 405);
}

// ---------- 手动刷新单个订阅 ----------

async function handleSubscriptionRefresh(id: string, kv: KVNamespace): Promise<Response> {
  const raw = await kv.get('subscriptions');
  const list: any[] = raw ? JSON.parse(raw) : [];
  const group = list.find((s: any) => s.id === id);
  if (!group) return err404();
  const entries = normalizeUrls(group.urls ?? []);
  if (!entries.some(e => e.refreshUrl)) return err('该订阅组内无配置 refreshUrl 的条目', 400);
  const result = await refreshGroupUrls(id, kv);
  return ok(result);
}

// ---------- 获取订阅组内所有代理节点 ----------

async function handleSubscriptionProxies(id: string, kv: KVNamespace): Promise<Response> {
  const raw = await kv.get('subscriptions');
  const list: any[] = raw ? JSON.parse(raw) : [];
  const group = list.find((s: any) => s.id === id);
  if (!group) return err404();
  const entries = normalizeUrls(group.urls ?? []);
  
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

// ---------- 单个 URL 条目刷新 ----------

async function handleUrlEntryRefresh(groupId: string, urlIndex: number, kv: KVNamespace): Promise<Response> {
  const raw = await kv.get('subscriptions');
  const list: any[] = raw ? JSON.parse(raw) : [];
  const gIdx = list.findIndex((g: any) => g.id === groupId);
  if (gIdx === -1) return err404();
  const entries = normalizeUrls(list[gIdx].urls ?? []);
  const entry = entries[urlIndex];
  if (!entry) return err('URL 条目不存在', 404);
  if (!entry.refreshUrl) return err('该条目未配置 refreshUrl', 400);
  const result = await fetchAndExtractUrl(entry);
  if (!result.ok || !result.url) return err(result.msg, 502);
  entries[urlIndex] = { ...entry, url: result.url, lastRefreshedAt: new Date().toISOString() };
  list[gIdx] = { ...list[gIdx], urls: entries, updatedAt: new Date().toISOString() };
  await kv.put('subscriptions', JSON.stringify(list));
  return ok({ ok: true, url: result.url });
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

// ---------- 订阅内容下发 ----------

async function fetchSubscriptionUserInfo(entries: UrlEntry[]): Promise<string> {
  if (entries.length === 0) return 'upload=0; download=0; total=107374182400; expire=0';

  let upload = 0, download = 0, total = 0, expire = 0;
  let foundInfo = false;

  const results = await Promise.allSettled(entries.map(entry =>
    fetch(entry.url.trim(), { method: 'GET', headers: { 'User-Agent': 'Clash/1.8.0' } })
  ));

  for (const res of results) {
    if (res.status === 'fulfilled' && res.value.ok) {
      const info = res.value.headers.get('subscription-userinfo') || res.value.headers.get('Subscription-Userinfo');
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
        if (params.get('sni')) proxy.sni = params.get('sni');
        if (params.get('flow')) proxy.flow = params.get('flow');
        if (params.get('fp')) proxy.client_fingerprint = params.get('fp');
        if (params.get('pbk')) proxy.reality_opts = { 'public-key': params.get('pbk') };
        if (params.get('sid')) proxy.reality_opts = { ...proxy.reality_opts, short_id: params.get('sid') };
        proxy.network = params.get('type') || 'tcp';
        if (proxy.network === 'ws') {
          proxy['ws-opts'] = { path: params.get('path') || '/', headers: { Host: params.get('host') || '' } };
        } else if (proxy.network === 'grpc') {
          proxy['grpc-opts'] = { 'grpc-service-name': params.get('serviceName') || '' };
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
    if (p.sni) uri += `&sni=${p.sni}`;
    if (p.reality_opts) {
      uri += `&security=reality&pbk=${encodeURIComponent(p.reality_opts['public-key'] || '')}&sid=${p.reality_opts.short_id || ''}`;
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

/**
 * 拉取订阅 URL 并返回过滤后的 proxies 数组 + 原始内容列表
 * 若存在 filter 则按正则过滤代理名称
 */
async function fetchProxiesFromGroup(
  group: SubscriptionGroup
): Promise<{ proxies: any[]; rawYamls: string[] }> {
  const filter = compileGroupFilter(group.filter);
  const filterRe = filter ? new RegExp(filter) : null;

  const results = await Promise.allSettled(
    group.urls.map(entry =>
      fetch(entry.url.trim(), { headers: { 'User-Agent': 'clash.meta' } }).then(r => r.text())
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

    for (const p of parsed) {
      if (!p || !p.name) continue;
      if (filterRe && !filterRe.test(p.name)) continue;
      proxies.push(p);
    }
  }

  return { proxies, rawYamls };
}

async function handleSubFetch(pathname: string, env: Env, request: Request): Promise<Response> {
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

  const group: SubscriptionGroup = { ...rawGroup, urls: normalizeUrls(rawGroup.urls ?? []) };

  const tplObj = await env.ATTACHMENTS.get(link.templateId);
  const tpl: Template|null = tplObj ? JSON.parse(await tplObj.text()) : null;

  const userInfo = await fetchSubscriptionUserInfo(group.urls);

  // 拉取并过滤代理节点
  const { proxies, rawYamls } = await fetchProxiesFromGroup(group);

  const ua = request.headers.get('User-Agent')?.toLowerCase() || '';
  const urlParams = new URL(request.url).searchParams;
  const flag = urlParams.get('flag') || urlParams.get('client');
  // 判定是否返回通用节点列表
  const wantNodes = ua.includes('v2ray') || ua.includes('nekobox') || ua.includes('shadowrocket') || ua.includes('postman') || ua.includes('curl') || flag === 'nodes';

  if (wantNodes) {
    const nodeText = proxies.map(p => proxyToURI(p)).filter(Boolean).join('\n');
    return subResponse(safeBtoa(nodeText), link.name, userInfo, true);
  }

  if (!tpl) {
    // 无模板时：若能解析到 proxies 则重新序列化过滤结果，否则直接拼接原始内容
    if (proxies.length > 0) {
      // 取第一份 YAML 作为基础结构，替换其中的 proxies
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

  const output = await renderTemplate(tpl.content, group, proxies, env);
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
async function renderTemplate(template: string, group: SubscriptionGroup, filteredProxies: any[], env: Env): Promise<string> {
  let output = template;

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

  // 3. {{PROVIDERS}} → 完整 proxy-providers YAML 块
  if (output.includes('# {{PROVIDERS}}') || output.includes('{{PROVIDERS}}')) {
    const providerLines = group.urls.map((entry, i) => {
      const name = entry.name ?? `p${i + 1}`;
      return [
        `  ${name}:`,
        `    url: "${entry.url}"`,
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

  // {{URL_0}}, {{URL_1}}, ... → 对应下标 URL
  group.urls.forEach((entry, i) => {
    output = output.replace(new RegExp(`\\{\\{URL_${i}\\}\\}`, 'g'), entry.url);
  });

  // {{URL_ALL}} → 所有 URL 以换行分隔
  output = output.replace(/\{\{URL_ALL\}\}/g, group.urls.map(e => e.url).join('\n'));

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
