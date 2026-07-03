import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

// ---------- 类型 ----------

export interface UrlEntry {
  id: string;
  url: string;
  name?: string;
  /** 归属 of proxy-group 名，用于模板 {{URL_GROUPS}} 动态生成分组 */
  proxyGroup?: string;
  /** 分组图标文件名（不含扩展名），如 Auto、Speedtest，前缀固定为 Qure/IconSet/Color/ */
  icon?: string;
  refreshUrl?: string;
  refreshHeaders?: Record<string, string>;
  refreshJsonPath?: string;
  lastRefreshedAt?: string;
  refreshType?: string;
  hysteria2Up?: string;
  hysteria2Down?: string;
  hysteria2Mtu?: number;
  cacheTtl?: number;
  akileServerId?: string;
  akileApiClient?: string;
  akileApiSecret?: string;
  cfOptimize?: boolean;
  cfOptimizeNum?: number;
  cfOptimizeOnlyCdn?: boolean;
  cfOptimizeHideOriginal?: boolean;
  cfOptimizeDomain?: string;
  cfOptimizeType?: 'api' | 'custom';
  gcoreOptimize?: boolean;
  gcoreOptimizeNum?: number;
  gcoreOptimizeOnlyCdn?: boolean;
  gcoreOptimizeHideOriginal?: boolean;
  gcoreOptimizeDomain?: string;
  gcoreOptimizeType?: 'api' | 'custom';
  gcoreOptimizeIsp?: string;
  simplifyNames?: boolean;
  onlyCdnAtNight?: boolean;
  cfOptimizeIsp?: string;
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
  proxyUpdateInterval?: number;
}
export interface DashboardStats {
  activeSubscriptions: number; totalSubscriptions: number;
  activeLinks: number; totalLinks: number; templateCount: number; kvUsageKB: number;
}
export interface PasskeyItem {
  id: string; name: string; createdAt: string;
}

// ---------- Token 持久化 ----------

const TOKEN_KEY = 'mihomo_token';
export const getToken   = () => localStorage.getItem(TOKEN_KEY);
export const setToken   = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ---------- 基础请求 ----------

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) { clearToken(); throw new Error('认证失败，请重新登录'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ---------- Auth ----------

export async function login(password: string): Promise<string> {
  const data = await apiFetch<{ token: string }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ password }),
  });
  setToken(data.token);
  return data.token;
}

/** Passkey 是否已注册 */
export async function getPasskeyStatus(): Promise<number> {
  const data = await apiFetch<{ count: number }>('/api/auth/passkey/status');
  return data.count;
}

/** 获取已注册 Passkey 列表（需鉴权） */
export async function getPasskeyList(): Promise<PasskeyItem[]> {
  return apiFetch<PasskeyItem[]>('/api/auth/passkey/list');
}

/** 删除指定 Passkey */
export async function deletePasskey(id: string): Promise<void> {
  await apiFetch(`/api/auth/passkey/delete/${id}`, { method: 'DELETE' });
}

/** 注册新 Passkey（需已登录） */
export async function registerPasskey(): Promise<string> {
  // 1. 获取注册选项
  const options = await apiFetch<Parameters<typeof startRegistration>[0]>(
    '/api/auth/passkey/register/begin', { method: 'POST' }
  );
  // @simplewebauthn/browser v10: startRegistration(options) directly
  const response = await startRegistration(options as any);
  // 3. 服务端验证
  const result = await apiFetch<{ ok: boolean; name: string }>(
    '/api/auth/passkey/register/finish',
    { method: 'POST', body: JSON.stringify(response) }
  );
  return result.name;
}

/** Passkey 登录 */
export async function loginWithPasskey(): Promise<string> {
  // 1. 获取认证选项
  const options = await apiFetch<Parameters<typeof startAuthentication>[0]>(
    '/api/auth/passkey/login/begin', { method: 'POST' }
  );
  // @simplewebauthn/browser v10: startAuthentication(options) directly
  const response = await startAuthentication(options as any);
  // 3. 服务端验证
  const data = await apiFetch<{ token: string }>(
    '/api/auth/passkey/login/finish',
    { method: 'POST', body: JSON.stringify(response) }
  );
  setToken(data.token);
  return data.token;
}

// ---------- Dashboard ----------

export async function getDashboard(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/api/dashboard');
}

// ---------- Subscriptions ----------

export const getSubscriptions = () => apiFetch<SubscriptionGroup[]>('/api/subscriptions');
export const createSubscription = (d: Omit<SubscriptionGroup,'id'|'updatedAt'>) =>
  apiFetch<SubscriptionGroup>('/api/subscriptions', { method:'POST', body: JSON.stringify(d) });
export const updateSubscription = (id: string, d: Partial<SubscriptionGroup>) =>
  apiFetch<SubscriptionGroup>(`/api/subscriptions/${id}`, { method:'PUT', body: JSON.stringify(d) });
export const deleteSubscription = (id: string) =>
  apiFetch(`/api/subscriptions/${id}`, { method:'DELETE' });
export const refreshSubscription = (id: string) =>
  apiFetch<{ refreshed: number; errors: string[] }>(`/api/subscriptions/${id}/refresh`, { method:'POST' });
export const refreshUrlEntry = (groupId: string, urlIndex: number) =>
  apiFetch<{ ok: boolean; url: string }>(`/api/subscriptions/${groupId}/urls/${urlIndex}/refresh`, { method:'POST' });
export const getSubscriptionProxies = (id: string) =>
  apiFetch<{ name: string; server: string }[]>(`/api/subscriptions/${id}/proxies`);

// ---------- Global URLs ----------

export const getUrls = () => apiFetch<UrlEntry[]>('/api/urls');
export const createUrl = (d: Omit<UrlEntry,'id'|'lastRefreshedAt'>) =>
  apiFetch<UrlEntry>('/api/urls', { method:'POST', body: JSON.stringify(d) });
export const updateUrl = (id: string, d: Partial<UrlEntry>) =>
  apiFetch<UrlEntry>(`/api/urls/${id}`, { method:'PUT', body: JSON.stringify(d) });
export const deleteUrl = (id: string) =>
  apiFetch(`/api/urls/${id}`, { method:'DELETE' });
export const refreshUrl = (id: string) =>
  apiFetch<{ ok: boolean; url: string }>(`/api/urls/${id}/refresh`, { method:'POST' });
export const syncUrlCache = (id: string) =>
  apiFetch<{ ok: boolean; msg: string }>(`/api/urls/${id}/sync_cache`, { method:'POST' });

// ---------- Templates ----------

export const getTemplates = () => apiFetch<Template[]>('/api/templates');
export const createTemplate = (d: { name: string; content: string }) =>
  apiFetch<Template>('/api/templates', { method:'POST', body: JSON.stringify(d) });
export const updateTemplate = (id: string, d: Partial<Template>) =>
  apiFetch<Template>(`/api/templates/${id}`, { method:'PUT', body: JSON.stringify(d) });
export const deleteTemplate = (id: string) =>
  apiFetch(`/api/templates/${id}`, { method:'DELETE' });

// ---------- Links ----------

export const getLinks = () => apiFetch<GeneratedLink[]>('/api/links');
export const createLink = (d: Omit<GeneratedLink,'id'|'token'|'createdAt'>) =>
  apiFetch<GeneratedLink>('/api/links', { method:'POST', body: JSON.stringify(d) });
export const updateLink = (id: string, d: Partial<GeneratedLink>) =>
  apiFetch<GeneratedLink>(`/api/links/${id}`, { method:'PUT', body: JSON.stringify(d) });
export const deleteLink = (id: string) =>
  apiFetch(`/api/links/${id}`, { method:'DELETE' });

export const buildSubUrl = (token: string) =>
  `${window.location.origin}/sub/${token}`;

// ---------- GFW / IP status ----------

export const checkGfwStatus = (host: string) =>
  apiFetch<{ success: boolean; host: string; ip?: string; blocked: boolean | null; cached: boolean; updatedAt?: number }>(`/api/gfw/status?host=${encodeURIComponent(host)}`);

export const runGfwCheck = (host: string) =>
  apiFetch<{ success: boolean; host: string; ip?: string; blocked: boolean }>(`/api/gfw/check`, {
    method: 'POST',
    body: JSON.stringify({ host })
  });

export const updateGfwStatus = (host: string, blocked: boolean) =>
  apiFetch<{ success: boolean; host: string; ip?: string; blocked: boolean }>(`/api/gfw/update`, {
    method: 'POST',
    body: JSON.stringify({ host, blocked })
  });
