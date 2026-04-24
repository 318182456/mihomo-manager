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
} from '@simplewebauthn/server';

export interface Env {
  ASSETS: Fetcher;
  KV: KVNamespace;
  /** 管理员密码，在 Cloudflare Secret / .dev.vars 中配置 */
  ADMIN_PASSWORD?: string;
}

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

  const { credential } = verification.registrationInfo;
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
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: getOrigins(request),
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: b64urlToU8(passkey.publicKey),
        counter: passkey.counter,
        transports: (passkey.transports ?? []) as AuthenticatorTransportFuture[],
      },
    });
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
      case 'templates':     return handleTemplates(request, env.KV, method, id);
      case 'links':         return handleLinks(request, env.KV, method, id);
      case 'dashboard':     return handleDashboard(env.KV);
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

// ---------- 模板 CRUD ----------

async function handleTemplates(req: Request, kv: KVNamespace, method: string, id: string|null): Promise<Response> {
  if (method === 'GET' && !id) {
    const { keys } = await kv.list({ prefix: 'tpl:' });
    const items = await Promise.all(keys.map(k => kv.get(k.name).then(v => v ? JSON.parse(v) : null)));
    return ok(items.filter(Boolean));
  }
  if (method === 'GET' && id) {
    const v = await kv.get(`tpl:${id}`); return v ? ok(JSON.parse(v)) : err404();
  }
  if (method === 'POST' && !id) {
    const body = await req.json<{ name: string; content: string }>();
    const tpl: Template = { id: uuid(), name: body.name, content: body.content, updatedAt: new Date().toISOString() };
    await kv.put(`tpl:${tpl.id}`, JSON.stringify(tpl));
    return ok(tpl, 201);
  }
  if (method === 'PUT' && id) {
    const raw = await kv.get(`tpl:${id}`); if (!raw) return err404();
    const existing: Template = JSON.parse(raw);
    const body = await req.json<Partial<Template>>();
    const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
    await kv.put(`tpl:${id}`, JSON.stringify(updated));
    return ok(updated);
  }
  if (method === 'DELETE' && id) {
    await kv.delete(`tpl:${id}`); return ok({ ok: true });
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

async function handleDashboard(kv: KVNamespace): Promise<Response> {
  const [subRaw, linksRaw, tplList] = await Promise.all([
    kv.get('subscriptions'), kv.get('links'), kv.list({ prefix: 'tpl:' }),
  ]);
  const subs:  SubscriptionGroup[] = subRaw   ? JSON.parse(subRaw)   : [];
  const links: GeneratedLink[]     = linksRaw ? JSON.parse(linksRaw) : [];
  return ok({
    activeSubscriptions: subs.filter(s=>s.enabled).length,
    totalSubscriptions:  subs.length,
    activeLinks:  links.filter(l=>!l.expiresAt||new Date(l.expiresAt)>new Date()).length,
    totalLinks:   links.length,
    templateCount: tplList.keys.length,
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

  const tplRaw = await env.KV.get(`tpl:${link.templateId}`);
  const tpl: Template|null = tplRaw ? JSON.parse(tplRaw) : null;

  const results = await Promise.allSettled(
    group.urls.map(url=>fetch(url,{headers:{'User-Agent':'clash-verge/1.0'}}).then(r=>r.text()))
  );
  const content = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status==='fulfilled')
    .map(r=>r.value).join('\n');

  const output = tpl ? `${content}\n# === Template ===\n${tpl.content}` : content;
  return new Response(output, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${link.name}.yaml"`,
      'Subscription-Userinfo': 'upload=0; download=0; total=107374182400; expire=0',
      ...CORS,
    },
  });
}
