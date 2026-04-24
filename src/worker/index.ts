/// <reference types="@cloudflare/workers-types" />
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
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

export interface SubscriptionGroup {
  id: string; title: string; enabled: boolean; filter: string; urls: string[]; updatedAt: string;
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

export default {
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
    switch (resource) {
      case 'subscriptions': return handleSubscriptions(request, env.KV, method, id);
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
  let list: SubscriptionGroup[] = raw ? JSON.parse(raw) : [];

  if (method === 'GET' && !id) return ok(list);
  if (method === 'GET' && id)  return list.find(s=>s.id===id) ? ok(list.find(s=>s.id===id)) : err404();

  if (method === 'POST' && !id) {
    const body = await req.json<Omit<SubscriptionGroup,'id'|'updatedAt'>>();
    const item: SubscriptionGroup = { ...body, id: uuid(), updatedAt: new Date().toISOString() };
    await kv.put('subscriptions', JSON.stringify([...list, item]));
    return ok(item, 201);
  }
  if (method === 'PUT' && id) {
    const idx = list.findIndex(s=>s.id===id);
    if (idx===-1) return err404();
    const body = await req.json<Partial<SubscriptionGroup>>();
    list[idx] = { ...list[idx], ...body, id, updatedAt: new Date().toISOString() };
    await kv.put('subscriptions', JSON.stringify(list));
    return ok(list[idx]);
  }
  if (method === 'DELETE' && id) {
    await kv.put('subscriptions', JSON.stringify(list.filter(s=>s.id!==id)));
    return ok({ ok: true });
  }
  return err('Method Not Allowed', 405);
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

async function handleSubFetch(pathname: string, env: Env, request: Request): Promise<Response> {
  const token = pathname.replace(/^\/sub\//, '').split('/')[0];
  if (!token) return err404();

  const linksRaw = await env.KV.get('links');
  const links: GeneratedLink[] = linksRaw ? JSON.parse(linksRaw) : [];
  const link = links.find(l=>l.token===token);
  if (!link) return err('无效的订阅令牌', 404);
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return err('订阅链接已过期', 410);

  const subRaw = await env.KV.get('subscriptions');
  const groups: SubscriptionGroup[] = subRaw ? JSON.parse(subRaw) : [];
  const group = groups.find(g=>g.id===link.subscriptionGroupId);
  if (!group || !group.enabled) return err('订阅组不存在或已禁用', 404);

  const tplObj = await env.ATTACHMENTS.get(link.templateId);
  const tpl: Template|null = tplObj ? JSON.parse(await tplObj.text()) : null;

  // 若无模板：降级为合并上游内容（兼容旧行为）
  if (!tpl) {
    const results = await Promise.allSettled(
      group.urls.map(url=>fetch(url,{headers:{'User-Agent':'clash-verge/1.0'}}).then(r=>r.text()))
    );
    const content = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status==='fulfilled')
      .map(r=>r.value).join('\n');
    return subResponse(content, link.name);
  }

  // 模板渲染：将订阅组 URL 注入模板
  const output = await renderTemplate(tpl.content, group, env);
  return subResponse(output, link.name);
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
async function renderTemplate(template: string, group: SubscriptionGroup, env: Env): Promise<string> {
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
    const providerLines = group.urls.map((url, i) => {
      // 支持行内命名注释：url: https://... | name: MyProvider
      const nameMatch = url.match(/\|\s*name:\s*(\S+)/);
      const cleanUrl  = url.replace(/\s*\|.*$/, '').trim();
      const name      = nameMatch ? nameMatch[1] : `p${i + 1}`;
      return [
        `  ${name}:`,
        `    url: "${cleanUrl}"`,
        `    <<: *p`,
      ].join('\n');
    }).join('\n');

    output = output
      .replace(/^\s*#\s*\{\{PROVIDERS\}\}\s*$/m, providerLines)
      .replace(/\{\{PROVIDERS\}\}/g, providerLines);
  }

  // {{URL_0}}, {{URL_1}}, ... → 对应下标 URL
  group.urls.forEach((url, i) => {
    output = output.replace(new RegExp(`\\{\\{URL_${i}\\}\\}`, 'g'), url.replace(/\s*\|.*$/, '').trim());
  });

  // {{URL_ALL}} → 所有 URL 以换行分隔
  output = output.replace(/\{\{URL_ALL\}\}/g, group.urls.map(u => u.replace(/\s*\|.*$/, '').trim()).join('\n'));

  // 通用变量
  output = output
    .replace(/\{\{GROUP_NAME\}\}/g,    group.title)
    .replace(/\{\{GROUP_FILTER\}\}/g,  group.filter || '')
    .replace(/\{\{GENERATED_AT\}\}/g,  new Date().toISOString());

  return output;
}

function subResponse(content: string, name: string): Response {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}.yaml"`,
      'Subscription-Userinfo': 'upload=0; download=0; total=107374182400; expire=0',
      ...CORS,
    },
  });
}
