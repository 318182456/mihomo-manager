/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** 静态前端资源（Cloudflare Assets） */
  ASSETS: Fetcher;
  /** KV 命名空间，存储订阅/模板/链接数据 */
  KV: KVNamespace;
}

// ---------- 通用响应工具 ----------

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

// ---------- Worker 主入口 ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // API 路由交给 Worker 处理
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env, url.pathname);
    }

    // 其余请求转发至 Cloudflare Assets（Vite 构建产物）
    return env.ASSETS.fetch(request);
  },
};

// ---------- API 路由分发 ----------

async function handleAPI(request: Request, env: Env, pathname: string): Promise<Response> {
  // 解析路径：/api/{resource}/{id?}
  const parts = pathname.replace(/^\/api\//, '').split('/');
  const resource = parts[0];
  const id = parts[1] ?? null;
  const method = request.method;

  try {
    switch (resource) {
      // 订阅组：以单一 JSON blob 存储整个列表
      case 'subscriptions':
        return handleBlobStore(request, env.KV, 'subscriptions', method);

      // 模板：以 "tpl:{id}" 为 key 单独存储每个模板
      case 'templates':
        if (id) {
          return handleItem(request, env.KV, `tpl:${id}`, method);
        }
        return handlePrefixList(env.KV, 'tpl:');

      // 已生成链接：以单一 JSON blob 存储
      case 'links':
        return handleBlobStore(request, env.KV, 'links', method);

      // 全局配置
      case 'config':
        return handleBlobStore(request, env.KV, 'config', method);

      default:
        return notFound(`Unknown resource: ${resource}`);
    }
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}

// ---------- KV 操作封装 ----------

/**
 * 单 Key blob 存取（适合整体替换的列表数据）
 */
async function handleBlobStore(
  request: Request,
  kv: KVNamespace,
  key: string,
  method: string,
): Promise<Response> {
  if (method === 'GET') {
    const val = await kv.get(key);
    return jsonResponse(val ? JSON.parse(val) : []);
  }
  if (method === 'PUT' || method === 'POST') {
    const body = await request.text();
    await kv.put(key, body);
    return jsonResponse({ ok: true });
  }
  if (method === 'DELETE') {
    await kv.delete(key);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}

/**
 * 单条记录读写（按 key 存取，适合模板等独立记录）
 */
async function handleItem(
  request: Request,
  kv: KVNamespace,
  key: string,
  method: string,
): Promise<Response> {
  if (method === 'GET') {
    const val = await kv.get(key);
    if (!val) return notFound();
    return jsonResponse(JSON.parse(val));
  }
  if (method === 'PUT' || method === 'POST') {
    const body = await request.text();
    await kv.put(key, body);
    return jsonResponse({ ok: true });
  }
  if (method === 'DELETE') {
    await kv.delete(key);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}

/**
 * 按前缀列出所有记录（适合模板列表）
 */
async function handlePrefixList(kv: KVNamespace, prefix: string): Promise<Response> {
  const listed = await kv.list({ prefix });
  const items = await Promise.all(
    listed.keys.map(async (k) => {
      const val = await kv.get(k.name);
      return val ? JSON.parse(val) : null;
    }),
  );
  return jsonResponse(items.filter(Boolean));
}
