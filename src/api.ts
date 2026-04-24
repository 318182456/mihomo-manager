// api.ts — 前端与 Worker API 的通信层

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
  expiresAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  activeSubscriptions: number;
  totalSubscriptions: number;
  activeLinks: number;
  totalLinks: number;
  templateCount: number;
  kvUsageKB: number;
}

// ---------- token 本地持久化 ----------

const TOKEN_KEY = 'mihomo_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------- 基础请求 ----------

const BASE = import.meta.env.DEV ? '' : '';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    throw new Error('认证失败，请重新登录');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ---------- Auth ----------

export async function login(password: string): Promise<string> {
  const data = await apiFetch<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  setToken(data.token);
  return data.token;
}

// ---------- Dashboard ----------

export async function getDashboard(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/api/dashboard');
}

// ---------- Subscriptions ----------

export async function getSubscriptions(): Promise<SubscriptionGroup[]> {
  return apiFetch<SubscriptionGroup[]>('/api/subscriptions');
}

export async function createSubscription(
  data: Omit<SubscriptionGroup, 'id' | 'updatedAt'>,
): Promise<SubscriptionGroup> {
  return apiFetch<SubscriptionGroup>('/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSubscription(
  id: string,
  data: Partial<SubscriptionGroup>,
): Promise<SubscriptionGroup> {
  return apiFetch<SubscriptionGroup>(`/api/subscriptions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSubscription(id: string): Promise<void> {
  await apiFetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
}

// ---------- Templates ----------

export async function getTemplates(): Promise<Template[]> {
  return apiFetch<Template[]>('/api/templates');
}

export async function createTemplate(data: { name: string; content: string }): Promise<Template> {
  return apiFetch<Template>('/api/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTemplate(id: string, data: Partial<Template>): Promise<Template> {
  return apiFetch<Template>(`/api/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`/api/templates/${id}`, { method: 'DELETE' });
}

// ---------- Links ----------

export async function getLinks(): Promise<GeneratedLink[]> {
  return apiFetch<GeneratedLink[]>('/api/links');
}

export async function createLink(data: {
  name: string;
  group: string;
  templateId: string;
  subscriptionGroupId: string;
  expiresAt: string | null;
}): Promise<GeneratedLink> {
  return apiFetch<GeneratedLink>('/api/links', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteLink(id: string): Promise<void> {
  await apiFetch(`/api/links/${id}`, { method: 'DELETE' });
}

/** 构造订阅下发 URL */
export function buildSubUrl(token: string): string {
  return `${window.location.origin}/sub/${token}`;
}
