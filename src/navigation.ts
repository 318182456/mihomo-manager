import { LayoutDashboard, Rss, Globe, FileCode2, Link2, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ViewId =
  | 'dashboard'
  | 'sources'
  | 'subscriptions'
  | 'templates'
  | 'links'
  | 'passkeys';

export interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  /** 侧栏分组标题，用于把导航项按职责归类 */
  section: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',     label: '概览',        icon: LayoutDashboard, section: '' },
  { id: 'sources',       label: '订阅源',      icon: Globe,           section: '配置' },
  { id: 'subscriptions', label: '订阅组',      icon: Rss,             section: '配置' },
  { id: 'templates',     label: '模板',        icon: FileCode2,       section: '配置' },
  { id: 'links',         label: '订阅链接',    icon: Link2,           section: '分发' },
  { id: 'passkeys',      label: 'Passkey',    icon: ShieldCheck,     section: '系统' },
];

export const findNav = (id: ViewId) => NAV_ITEMS.find(n => n.id === id);

/** 从 location.hash 解析视图，非法值回落到概览 */
export function parseHash(hash: string): ViewId {
  const id = hash.replace(/^#\/?/, '') as ViewId;
  return NAV_ITEMS.some(n => n.id === id) ? id : 'dashboard';
}
