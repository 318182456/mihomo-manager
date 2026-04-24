/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** 静态前端资源（Cloudflare Assets） */
  ASSETS: Fetcher;
  /** KV 命名空间 */
  KV: KVNamespace;
  /** 管理员密码（在 Cloudflare Dashboard Secret 或 .dev.vars 中配置） */
  ADMIN_PASSWORD?: string;
}

// ---------- 类型定义 ----------

export interface SubscriptionGroup {
  id: string;
  title: string;
  enabled: boolean;
  filter: string;
  urls: string[];
  updatedAt: string;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface GeneratedLink {
  id: string;
  name: string;
  group: string;
  templateId: string;
  subscriptionGroupId: string;
  token: string;
  expiresAt: string | null; // null = 永不过期
  createdAt: string;
}

// ---------- 通用响应工具 ----------

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function notFound(msg = 'Not Found'): Response {
  return jsonResponse({ error: msg }, 404);
}

function unauthorized(msg = 'Unauthorized'): Response {
  return jsonResponse({ error: msg }, 401);
}

function badRequest(msg: string): Response {
  return jsonResponse({ error: msg }, 400);
}

/** 生成 UUID v4（Web Crypto API） */
function uuid(): string {
  return crypto.randomUUID();
}

/** 生成随机订阅 token（32 字节 hex） */
function generateToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- 鉴权中间件 ----------

/**
 * 检查请求是否携带有效的 Bearer token（即管理员密码）。
 * 公开路由（订阅转发 /sub/:token）不需要鉴权。
 */
function isAuthenticated(request: Request, env: Env): boolean {
  const adminPwd = env.ADMIN_PASSWORD || 'admin888';
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) === adminPwd;
  }
  return false;
}

// ---------- Worker 主入口 ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 公开路由：订阅内容下发（Mihomo 客户端直接拉取）
    if (url.pathname.startsWith('/sub/')) {
      return handleSubFetch(url.pathname, env);
    }

    // API 路由
    if (url.pathname.startsWith('/api/')) {
      // 登录接口不需要鉴权
      if (url.pathname === '/api/auth/login') {
        return handleLogin(request, env);
      }
      // 其余 API 需要鉴权
      if (!isAuthenticated(request, env)) {
        return unauthorized();
      }
      return handleAPI(request, env, url.pathname);
    }

    // 其余请求转发至 Cloudflare Assets（Vite 构建产物）
    return env.ASSETS.fetch(request);
  },
};

// ---------- 登录 ----------

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  try {
    const { password } = await request.json<{ password: string }>();
    const adminPwd = env.ADMIN_PASSWORD || 'admin888';
    if (password === adminPwd) {
      // 直接将密码作为 Bearer token 返回（单用户简易模式）
      return jsonResponse({ token: adminPwd });
    }
    return unauthorized('密码错误');
  } catch {
    return badRequest('无效的请求体');
  }
}

// ---------- API 路由分发 ----------

async function handleAPI(request: Request, env: Env, pathname: string): Promise<Response> {
  const parts = pathname.replace(/^\/api\//, '').split('/');
  const resource = parts[0];
  const id = parts[1] ?? null;
  const method = request.method;

  try {
    switch (resource) {
      case 'subscriptions':
        return handleSubscriptions(request, env.KV, method, id);

      case 'templates':
        return handleTemplates(request, env.KV, method, id);

      case 'links':
        return handleLinks(request, env.KV, method, id);

      case 'dashboard':
        return handleDashboard(env.KV);

      default:
        return notFound(`Unknown resource: ${resource}`);
    }
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}

// ---------- 订阅组管理 ----------

async function handleSubscriptions(
  request: Request,
  kv: KVNamespace,
  method: string,
  id: string | null,
): Promise<Response> {
  // GET /api/subscriptions — 列出所有订阅组
  if (method === 'GET' && !id) {
    const raw = await kv.get('subscriptions');
    return jsonResponse(raw ? JSON.parse(raw) : []);
  }

  // GET /api/subscriptions/:id — 获取单个
  if (method === 'GET' && id) {
    const raw = await kv.get('subscriptions');
    const list: SubscriptionGroup[] = raw ? JSON.parse(raw) : [];
    const item = list.find(s => s.id === id);
    return item ? jsonResponse(item) : notFound();
  }

  // POST /api/subscriptions — 创建
  if (method === 'POST' && !id) {
    const raw = await kv.get('subscriptions');
    const list: SubscriptionGroup[] = raw ? JSON.parse(raw) : [];
    const body = await request.json<Omit<SubscriptionGroup, 'id' | 'updatedAt'>>();
    const newItem: SubscriptionGroup = {
      ...body,
      id: uuid(),
      updatedAt: new Date().toISOString(),
    };
    list.push(newItem);
    await kv.put('subscriptions', JSON.stringify(list));
    return jsonResponse(newItem, 201);
  }

  // PUT /api/subscriptions/:id — 更新
  if (method === 'PUT' && id) {
    const raw = await kv.get('subscriptions');
    const list: SubscriptionGroup[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return notFound();
    const body = await request.json<Partial<SubscriptionGroup>>();
    list[idx] = { ...list[idx], ...body, id, updatedAt: new Date().toISOString() };
    await kv.put('subscriptions', JSON.stringify(list));
    return jsonResponse(list[idx]);
  }

  // DELETE /api/subscriptions/:id — 删除
  if (method === 'DELETE' && id) {
    const raw = await kv.get('subscriptions');
    const list: SubscriptionGroup[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(s => s.id !== id);
    await kv.put('subscriptions', JSON.stringify(filtered));
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}

// ---------- 模板管理 ----------

async function handleTemplates(
  request: Request,
  kv: KVNamespace,
  method: string,
  id: string | null,
): Promise<Response> {
  if (method === 'GET' && !id) {
    const listed = await kv.list({ prefix: 'tpl:' });
    const items = await Promise.all(
      listed.keys.map(async k => {
        const val = await kv.get(k.name);
        return val ? JSON.parse(val) : null;
      }),
    );
    return jsonResponse(items.filter(Boolean));
  }

  if (method === 'GET' && id) {
    const val = await kv.get(`tpl:${id}`);
    return val ? jsonResponse(JSON.parse(val)) : notFound();
  }

  if (method === 'POST' && !id) {
    const body = await request.json<{ name: string; content: string }>();
    if (!body.name || !body.content) return badRequest('name 和 content 必填');
    const newTpl: Template = {
      id: uuid(),
      name: body.name,
      content: body.content,
      updatedAt: new Date().toISOString(),
    };
    await kv.put(`tpl:${newTpl.id}`, JSON.stringify(newTpl));
    return jsonResponse(newTpl, 201);
  }

  if (method === 'PUT' && id) {
    const raw = await kv.get(`tpl:${id}`);
    if (!raw) return notFound();
    const existing: Template = JSON.parse(raw);
    const body = await request.json<Partial<Template>>();
    const updated: Template = {
      ...existing,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    await kv.put(`tpl:${id}`, JSON.stringify(updated));
    return jsonResponse(updated);
  }

  if (method === 'DELETE' && id) {
    await kv.delete(`tpl:${id}`);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}

// ---------- 已生成链接管理 ----------

async function handleLinks(
  request: Request,
  kv: KVNamespace,
  method: string,
  id: string | null,
): Promise<Response> {
  if (method === 'GET' && !id) {
    const raw = await kv.get('links');
    return jsonResponse(raw ? JSON.parse(raw) : []);
  }

  if (method === 'POST' && !id) {
    const raw = await kv.get('links');
    const list: GeneratedLink[] = raw ? JSON.parse(raw) : [];
    const body = await request.json<{
      name: string;
      group: string;
      templateId: string;
      subscriptionGroupId: string;
      expiresAt: string | null;
    }>();
    if (!body.name) return badRequest('name 必填');
    const newLink: GeneratedLink = {
      ...body,
      id: uuid(),
      token: generateToken(),
      createdAt: new Date().toISOString(),
    };
    list.push(newLink);
    await kv.put('links', JSON.stringify(list));
    return jsonResponse(newLink, 201);
  }

  if (method === 'DELETE' && id) {
    const raw = await kv.get('links');
    const list: GeneratedLink[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(l => l.id !== id);
    await kv.put('links', JSON.stringify(filtered));
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}

// ---------- 仪表盘统计 ----------

async function handleDashboard(kv: KVNamespace): Promise<Response> {
  const [subRaw, linksRaw, tplList] = await Promise.all([
    kv.get('subscriptions'),
    kv.get('links'),
    kv.list({ prefix: 'tpl:' }),
  ]);

  const subscriptions: SubscriptionGroup[] = subRaw ? JSON.parse(subRaw) : [];
  const links: GeneratedLink[] = linksRaw ? JSON.parse(linksRaw) : [];

  const activeSubscriptions = subscriptions.filter(s => s.enabled).length;
  const activeLinks = links.filter(l => !l.expiresAt || new Date(l.expiresAt) > new Date()).length;
  const templateCount = tplList.keys.length;

  // KV 使用量估算（字节数 / 1024 / 1024 MB，仅演示）
  const kvUsageKeys = (subRaw?.length || 0) + (linksRaw?.length || 0);

  return jsonResponse({
    activeSubscriptions,
    totalSubscriptions: subscriptions.length,
    activeLinks,
    totalLinks: links.length,
    templateCount,
    kvUsageKB: Math.round(kvUsageKeys / 1024 * 10) / 10,
  });
}

// ---------- 订阅内容下发（Mihomo 客户端拉取） ----------

/**
 * GET /sub/:token
 * 根据 token 找到对应 GeneratedLink，
 * 拉取对应订阅组的所有上游 URL，合并后按模板渲染返回 YAML。
 */
async function handleSubFetch(pathname: string, env: Env): Promise<Response> {
  const token = pathname.replace(/^\/sub\//, '').split('/')[0];
  if (!token) return notFound('缺少 token');

  // 查找链接记录
  const linksRaw = await env.KV.get('links');
  const links: GeneratedLink[] = linksRaw ? JSON.parse(linksRaw) : [];
  const link = links.find(l => l.token === token);
  if (!link) return notFound('无效的订阅令牌');

  // 检查是否过期
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return jsonResponse({ error: '订阅链接已过期' }, 410);
  }

  // 查找订阅组
  const subRaw = await env.KV.get('subscriptions');
  const groups: SubscriptionGroup[] = subRaw ? JSON.parse(subRaw) : [];
  const group = groups.find(g => g.id === link.subscriptionGroupId);
  if (!group || !group.enabled) return notFound('订阅组不存在或已禁用');

  // 查找模板
  const tplRaw = await env.KV.get(`tpl:${link.templateId}`);
  const tpl: Template | null = tplRaw ? JSON.parse(tplRaw) : null;

  // 聚合上游订阅内容
  const upstreamResults = await Promise.allSettled(
    group.urls.map(url =>
      fetch(url, { headers: { 'User-Agent': 'clash-verge/1.0' } }).then(r => r.text()),
    ),
  );

  const contents = upstreamResults
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value)
    .join('\n');

  // 若有模板则在末尾附加模板内容（简单合并策略）
  const output = tpl ? `${contents}\n# === 自定义模板 ===\n${tpl.content}` : contents;

  return new Response(output, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${link.name}.yaml"`,
      'Subscription-Userinfo': 'upload=0; download=0; total=107374182400; expire=0',
      ...CORS_HEADERS,
    },
  });
}
