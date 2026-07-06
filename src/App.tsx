import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { dracula } from '@uiw/codemirror-theme-dracula';
import jsyaml from 'js-yaml';
import {
  LayoutDashboard,
  Rss,
  Code,
  Link as LinkIcon,
  Lock,
  Wifi,
  Plus,
  Save,
  Trash2,
  Copy,
  Folder,
  File,
  Activity,
  Menu,
  ChevronRight,
  Database,
  Terminal,
  CheckCircle2,
  XCircle,
  GripVertical,
  Filter,
  BadgeCheck,
  LogIn,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  Clock,
  AlertTriangle,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from './api';

type ViewType = 'dashboard' | 'subscriptions' | 'templates' | 'generated' | 'admin';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (api.getToken()) {
      setIsLoggedIn(true);
    }
  }, []);

  if (!isLoggedIn) {
    return <LoginView onLogin={() => setIsLoggedIn(true)} />;
  }

  const handleLogout = () => {
    api.clearToken();
    setIsLoggedIn(false);
  };

  const navigation = [
    { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
    { id: 'subscriptions', label: '订阅', icon: Rss },
    { id: 'templates', label: '模板', icon: Code },
    { id: 'generated', label: '已生成', icon: LinkIcon },
    { id: 'admin', label: 'Passkey 管理', icon: ShieldCheck },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />;
      case 'subscriptions': return <SubscriptionsView />;
      case 'templates': return <TemplatesView />;
      case 'generated': return <GeneratedLinksView />;
      case 'admin': return <PasskeyAdminView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-technical-bg text-gray-200">
      {/* Sidebar - Desktop */}
      <nav className="hidden md:flex flex-col w-64 bg-black border-r border-technical-border z-20">
        <div className="h-16 flex items-center px-6 border-b border-technical-border gap-3">
          <div className="p-1.5 bg-technical-cyan/10 rounded">
            <Terminal className="w-5 h-5 text-technical-cyan" />
          </div>
          <span className="font-display font-black tracking-widest text-lg text-technical-cyan">MIHOMO</span>
        </div>
        
        <div className="p-4 border-b border-technical-border">
          <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-technical-muted mb-4 opacity-50">v1.4.2-STABLE</div>
          <button className="technical-button-primary w-full py-2" onClick={() => setCurrentView('generated')}>
            <Plus size={16} />
            <span>新建链接</span>
          </button>
        </div>

        <div className="flex-1 py-4 flex flex-col gap-1 px-2">
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as ViewType)}
              className={`flex items-center gap-3 px-4 py-3 rounded-sm font-display text-[11px] uppercase tracking-widest transition-all ${
                currentView === item.id 
                  ? 'bg-technical-cyan/10 text-technical-cyan border-r-2 border-technical-cyan' 
                  : 'text-technical-muted hover:bg-zinc-900 hover:text-gray-200'
              }`}
            >
              <item.icon size={18} className={currentView === item.id ? 'opacity-100' : 'opacity-50'} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-16 flex items-center justify-between px-4 md:px-8 bg-black border-b border-technical-border z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-technical-cyan p-1">
              <Menu size={24} />
            </button>
            <h1 className="font-display font-bold tracking-tighter text-lg text-gray-400 hidden md:block">
              MIHOMO_MGR <span className="text-zinc-700 mx-2">/</span> <span className="text-gray-200 uppercase tracking-widest text-xs font-normal">
                {navigation.find(n => n.id === currentView)?.label}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 pr-4 border-r border-technical-border">
              <button className="p-2 text-technical-muted hover:text-technical-cyan transition-colors" title="测试网络">
                <Wifi size={18} />
              </button>
              <button className="p-2 text-technical-muted hover:text-red-500 transition-colors" onClick={handleLogout} title="退出登录">
                <LogIn size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3 pl-2">
              <div className="w-8 h-8 rounded-full border border-technical-border bg-zinc-800 p-0.5 overflow-hidden">
                 <img 
                  src="https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin" 
                  alt="Avatar" 
                  className="w-full h-full rounded-full grayscale hover:grayscale-0 transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </header>

        <main className="h-[calc(100vh-64px)] w-full flex flex-col overflow-hidden bg-technical-bg">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col w-full overflow-y-auto"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Nav Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 md:hidden"
            />
            <motion.nav 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed inset-y-0 left-0 w-64 bg-black border-r border-technical-border z-40 md:hidden flex flex-col"
            >
               <div className="h-16 flex items-center px-6 border-b border-technical-border justify-between">
                <span className="font-display font-black tracking-widest text-lg text-technical-cyan">MIHOMO</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-technical-muted">
                   <ChevronRight className="rotate-180" />
                </button>
              </div>
              <div className="flex-1 py-4 flex flex-col gap-1 px-2">
                {navigation.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id as ViewType);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-sm font-display text-[11px] uppercase tracking-widest transition-all ${
                      currentView === item.id 
                        ? 'bg-technical-cyan/10 text-technical-cyan' 
                        : 'text-technical-muted hover:bg-zinc-900 border-none'
                    }`}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- View Components ---

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [passkeyCount, setPasskeyCount] = useState(0);
  const [showPwd, setShowPwd]       = useState(false);

  useEffect(() => {
    api.getPasskeyStatus().then(setPasskeyCount).catch(() => {});
  }, []);

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.login(password);
      onLogin();
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskey = async () => {
    setError('');
    setLoading(true);
    try {
      await api.loginWithPasskey();
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Passkey 验证失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-technical-bg relative overflow-hidden font-sans">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-technical-cyan/10 rounded-full blur-[120px]" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#202023_1px,transparent_1px)] [background-size:20px_20px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="technical-card p-10 bg-black/40 backdrop-blur-md shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-technical-cyan/50 to-transparent" />

          <div className="flex justify-center mb-8">
            <div className="w-14 h-14 bg-zinc-900 border border-technical-border rounded-sm flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.05)]">
              <Terminal className="text-technical-cyan w-7 h-7" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="font-display font-black text-2xl tracking-tight text-white mb-1">MIHOMO_CORE</h1>
            <p className="font-mono text-[10px] text-technical-muted tracking-widest uppercase opacity-70 flex items-center justify-center gap-2">
              <span className="w-1 h-1 bg-technical-cyan animate-pulse rounded-full" />
              Secure Access Portal
            </p>
          </div>

          {/* Passkey 登录 */}
          {passkeyCount > 0 && (
            <button
              onClick={handlePasskey}
              disabled={loading}
              className="technical-button-primary w-full py-3 mb-4 text-sm gap-3 disabled:opacity-50"
            >
              <KeyRound size={18} />
              <span>使用 Passkey 登录</span>
            </button>
          )}

          {/* 分隔 */}
          {passkeyCount > 0 && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-technical-border" />
              <button
                onClick={() => setShowPwd(!showPwd)}
                className="text-[10px] font-mono text-technical-muted hover:text-technical-cyan transition-colors"
              >
                {showPwd ? '隐藏密码登录' : '使用密码登录'}
              </button>
              <div className="flex-1 h-px bg-technical-border" />
            </div>
          )}

          {/* 密码登录表单（无 Passkey 时默认显示） */}
          <AnimatePresence>
            {(passkeyCount === 0 || showPwd) && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
                onSubmit={handlePassword}
              >
                <div className="space-y-2">
                  <label className="block text-[10px] font-display font-bold uppercase tracking-widest text-technical-muted px-1">访问令牌</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full technical-input bg-black/60 py-2.5 rounded-none tracking-widest"
                    placeholder="••••••••••••"
                    autoFocus={passkeyCount === 0}
                  />
                </div>
                <button type="submit" disabled={loading} className="technical-button-primary w-full py-3 disabled:opacity-50">
                  <LogIn size={16} />
                  <span>{loading ? '验证中...' : '密码登录'}</span>
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-4 text-red-500 text-xs font-mono text-center">{error}</div>
          )}

          <div className="mt-8 pt-6 border-t border-technical-border text-center">
            <p className="font-mono text-[10px] text-technical-muted flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500/50 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" />
              SYSTEM_STATUS: ONLINE
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SourceGfwChecker({ domain }: { domain: string }) {
  const [status, setStatus] = useState<'unchecked' | 'checking' | 'blocked' | 'normal' | 'error'>('unchecked');
  const [lastUpdated, setLastUpdated] = useState<number | undefined>(undefined);
  const [resolvedIp, setResolvedIp] = useState<string>('');

  const checkStatus = async (force: boolean) => {
    setStatus('checking');
    try {
      if (force) {
        const res = await api.runGfwCheck(domain);
        setStatus(res.blocked ? 'blocked' : 'normal');
        setResolvedIp(res.ip || '');
        setLastUpdated(Date.now());
      } else {
        const res = await api.checkGfwStatus(domain);
        setResolvedIp(res.ip || '');
        if (res.blocked === null) {
          setStatus('unchecked');
        } else {
          setStatus(res.blocked ? 'blocked' : 'normal');
          setLastUpdated(res.updatedAt);
        }
      }
    } catch {
      setStatus('error');
    }
  };

  const markStatus = async (blocked: boolean) => {
    setStatus('checking');
    try {
      const res = await api.updateGfwStatus(domain, blocked);
      setStatus(blocked ? 'blocked' : 'normal');
      setResolvedIp(res.ip || '');
      setLastUpdated(Date.now());
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    checkStatus(false);
  }, [domain]);

  return (
    <div className="pt-2.5 border-t border-technical-border/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/20 p-3 rounded-sm">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-display font-bold text-technical-muted uppercase tracking-widest">
          订阅域名状态 ({domain}{resolvedIp && resolvedIp !== domain ? ` → ${resolvedIp}` : ''}) :
        </span>
        {status === 'checking' && <span className="text-[10px] text-technical-cyan animate-pulse">检测中...</span>}
        {status === 'unchecked' && <span className="text-[10px] text-zinc-500">未检测</span>}
        {status === 'blocked' && <span className="px-1.5 py-0.5 bg-red-950/40 border border-red-500/30 text-[9px] font-bold text-red-400 rounded">被墙</span>}
        {status === 'normal' && <span className="px-1.5 py-0.5 bg-green-950/40 border border-green-500/30 text-[9px] font-bold text-green-400 rounded">正常</span>}
        {status === 'error' && <span className="text-[10px] text-red-500">检测出错</span>}
        {status !== 'checking' && lastUpdated && (
          <span className="text-[9px] text-zinc-600 font-mono">({new Date(lastUpdated).toLocaleTimeString()})</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => checkStatus(true)}
          disabled={status === 'checking'}
          className="technical-button-outline py-0.5 px-2 text-[9px] h-6"
        >
          重新检测
        </button>
        <button
          onClick={() => markStatus(true)}
          disabled={status === 'checking'}
          className="px-2 py-0.5 bg-red-900/10 hover:bg-red-900/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded text-[9px] transition-colors h-6"
        >
          标记被墙
        </button>
        <button
          onClick={() => markStatus(false)}
          disabled={status === 'checking'}
          className="px-2 py-0.5 bg-green-900/10 hover:bg-green-900/20 border border-green-500/20 text-green-400 hover:text-green-300 rounded text-[9px] transition-colors h-6"
        >
          标记正常
        </button>
      </div>
    </div>
  );
}

function ProxyNodeBadge({ proxy, filterPattern }: { proxy: { name: string; server: string }; filterPattern: string; key?: any }) {
  const [gfwStatus, setGfwStatus] = useState<'unchecked' | 'checking' | 'blocked' | 'normal' | 'error'>('unchecked');
  const [resolvedIp, setResolvedIp] = useState<string>('');
  const [showActions, setShowActions] = useState(false);

  let isMatch = true;
  try {
    const pattern = filterPattern;
    isMatch = !pattern || new RegExp(pattern).test(proxy.name);
  } catch {
    isMatch = false;
  }

  const checkStatus = async (force: boolean) => {
    if (!proxy.server) return;
    setGfwStatus('checking');
    try {
      if (force) {
        const res = await api.runGfwCheck(proxy.server);
        setGfwStatus(res.blocked ? 'blocked' : 'normal');
        setResolvedIp(res.ip || '');
      } else {
        const res = await api.checkGfwStatus(proxy.server);
        setResolvedIp(res.ip || '');
        if (res.blocked === null) {
          setGfwStatus('unchecked');
        } else {
          setGfwStatus(res.blocked ? 'blocked' : 'normal');
        }
      }
    } catch {
      setGfwStatus('error');
    }
  };

  const markStatus = async (blocked: boolean) => {
    if (!proxy.server) return;
    setGfwStatus('checking');
    try {
      const res = await api.updateGfwStatus(proxy.server, blocked);
      setGfwStatus(blocked ? 'blocked' : 'normal');
      setResolvedIp(res.ip || '');
    } catch {
      setGfwStatus('error');
    }
  };

  useEffect(() => {
    if (proxy.server) {
      checkStatus(false);
    }
  }, [proxy.server]);

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        onClick={() => setShowActions(!showActions)}
        className={`px-1.5 py-0.5 rounded-sm text-[10px] flex items-center gap-1.5 transition-all ${
          isMatch 
            ? 'bg-technical-cyan/10 text-technical-cyan border border-technical-cyan/20 hover:bg-technical-cyan/20' 
            : 'bg-zinc-800/40 text-zinc-500 line-through border border-transparent'
        }`}
      >
        <span>{proxy.name}</span>
        {proxy.server && (
          <span className="text-[9px] opacity-40 font-mono no-underline max-w-[85px] truncate">({proxy.server})</span>
        )}
        
        {proxy.server && (
          <span className={`w-1.5 h-1.5 rounded-full ${
            gfwStatus === 'checking' ? 'bg-technical-cyan animate-pulse' :
            gfwStatus === 'blocked' ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]' :
            gfwStatus === 'normal' ? 'bg-green-500' :
            'bg-zinc-600'
          }`} />
        )}
      </button>

      {showActions && proxy.server && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
          <div className="absolute bottom-full left-0 mb-1 bg-zinc-950 border border-technical-border rounded-sm shadow-xl p-2 z-50 flex flex-col gap-1.5 min-w-[200px] text-xs font-sans">
            <div className="text-[9px] font-mono text-zinc-500 border-b border-technical-border/30 pb-1 mb-1 truncate">
              {proxy.server}{resolvedIp && resolvedIp !== proxy.server ? ` (${resolvedIp})` : ''}
            </div>
            <button
              onClick={() => { checkStatus(true); setShowActions(false); }}
              className="text-left text-[10px] text-technical-cyan hover:bg-technical-cyan/10 px-1.5 py-1 rounded"
            >
              🔍 开始检测被墙状态
            </button>
            <button
              onClick={() => { markStatus(true); setShowActions(false); }}
              className="text-left text-[10px] text-red-400 hover:bg-red-500/10 px-1.5 py-1 rounded"
            >
              🚫 手动标记为【被墙】
            </button>
            <button
              onClick={() => { markStatus(false); setShowActions(false); }}
              className="text-left text-[10px] text-green-400 hover:bg-green-500/10 px-1.5 py-1 rounded"
            >
              ✅ 手动标记为【正常】
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardView() {
  const [stats, setStats] = useState<api.DashboardStats | null>(null);

  useEffect(() => {
    api.getDashboard().then(setStats).catch(console.error);
  }, []);

  const metrics = [
    { label: '活动订阅', value: stats?.activeSubscriptions ?? '-', total: stats?.totalSubscriptions, icon: Rss, color: 'text-technical-cyan' },
    { label: '可用模板', value: stats?.templateCount ?? '-', icon: Code, color: 'text-gray-400' },
    { label: '活动链接', value: stats?.activeLinks ?? '-', total: stats?.totalLinks, icon: LinkIcon, color: 'text-technical-cyan' },
    { label: 'KV 占用 (KB)', value: stats?.kvUsageKB ?? '-', icon: Database, color: 'text-technical-cyan' },
  ];

  return (
    <div className="p-6 md:p-10 space-y-8 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-technical-border pb-6 gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">控制面板</h2>
          <p className="text-sm text-technical-muted mt-1">系统概览和快速操作。</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-technical-cyan uppercase tracking-widest bg-technical-cyan/5 px-3 py-1 border border-technical-cyan/20 rounded-full">
           <Activity size={12} className="animate-pulse" />
           <span>状态: 正常</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m, i) => (
          <div key={i} className="technical-card p-6 group hover:border-technical-cyan/30">
            <div className="flex justify-between items-start mb-6">
              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-technical-muted">{m.label}</span>
              <m.icon size={18} className="text-technical-border group-hover:text-technical-cyan transition-colors" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-display font-bold text-white">{m.value}</span>
              {m.total !== undefined && <span className="text-lg text-technical-muted">/{m.total}</span>}
            </div>
            {m.total !== undefined && m.total > 0 && typeof m.value === 'number' && (
              <div className="mt-4 w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(m.value / m.total) * 100}%` }}
                  className="h-full bg-technical-cyan rounded-full glow-cyan shadow-[0_0_8px_rgba(0,240,255,0.5)]"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SubscriptionsView() {
  const [groups, setGroups] = useState<api.SubscriptionGroup[]>([]);
  const [globalUrls, setGlobalUrls] = useState<api.UrlEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'groups' | 'sources'>('groups');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Expanded configurations
  const [expandedKey, setExpandedKey] = useState<string | null>(null); // 'source-{id}' or 'group-{id}'
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [urlMsg, setUrlMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  const [proxyCache, setProxyCache] = useState<Record<string, { name: string; server: string }[]>>({});
  const [loadingProxies, setLoadingProxies] = useState<Record<string, boolean>>({});

  const [dragInfo, setDragInfo] = useState<{ groupId: string; index: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [gcoreSpeedtesting, setGcoreSpeedtesting] = useState(false);
  const [gcoreIps, setGcoreIps] = useState<any[]>([]);
  const [showGcoreIps, setShowGcoreIps] = useState(false);

  const handleGcoreSpeedtest = async () => {
    setGcoreSpeedtesting(true);
    try {
      const res = await api.runGcoreSpeedtest();
      alert(res.message || '测速任务已在后台启动，系统将在 5 秒后尝试刷新列表');
      setTimeout(async () => {
        const ips = await api.getGcoreOptimizedIps().catch(() => []);
        setGcoreIps(ips);
      }, 5000);
    } catch (e: any) {
      alert(e.message || '测速启动失败');
    } finally {
      setGcoreSpeedtesting(false);
    }
  };

  const handleFetchGcoreIps = async () => {
    try {
      const ips = await api.getGcoreOptimizedIps();
      setGcoreIps(ips);
      setShowGcoreIps(!showGcoreIps);
    } catch {
      alert('获取 Gcore 优选 IP 失败');
    }
  };

  const handleFetchProxies = async (groupId: string) => {
    setLoadingProxies(prev => ({ ...prev, [groupId]: true }));
    try {
      const proxies = await api.getSubscriptionProxies(groupId);
      setProxyCache(prev => ({ ...prev, [groupId]: proxies }));
    } catch (e) {
      alert('获取代理节点失败');
    } finally {
      setLoadingProxies(prev => ({ ...prev, [groupId]: false }));
    }
  };

  const compileFilter = (filterStr: string): string => {
    let compiledFilter = filterStr || '';
    if (compiledFilter.startsWith('{"advanced":true')) {
      try {
        const data = JSON.parse(compiledFilter);
        const rules = data.rules || [];
        const orIncludes = rules.filter((r: any) => r.logic === 'or').map((r: any) => r.value).filter(Boolean);
        const andIncludes = rules.filter((r: any) => r.logic === 'and').map((r: any) => r.value).filter(Boolean);
        const notExcludes = rules.filter((r: any) => r.logic === 'not').map((r: any) => r.value).filter(Boolean);
        
        let regex = '^';
        if (orIncludes.length > 0) regex += `(?=.*(${orIncludes.join('|')}))`;
        for (const andInc of andIncludes) regex += `(?=.*${andInc})`;
        if (notExcludes.length > 0) regex += `(?!.*(${notExcludes.join('|')}))`;
        regex += '.*$';
        
        compiledFilter = regex === '^.*$' ? '' : regex;
      } catch {
        // do nothing
      }
    }
    return compiledFilter;
  };

  const loadData = async () => {
    try {
      const [subs, urls, ips] = await Promise.all([
        api.getSubscriptions(),
        api.getUrls(),
        api.getGcoreOptimizedIps().catch(() => [])
      ]);
      setGroups(subs);
      setGlobalUrls(urls);
      setGcoreIps(ips);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadData(); }, []);
  const handleAddGroup = async () => {
    try {
      await api.createSubscription({ title: '新建订阅组', enabled: true, filter: '', urlIds: [], urls: [] });
      loadData();
    } catch {
      alert('添加失败');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('确定删除此订阅组吗？')) return;
    try {
      await api.deleteSubscription(id);
      loadData();
    } catch {
      alert('删除失败');
    }
  };

  const handleUpdateGroup = async (id: string, updates: Partial<api.SubscriptionGroup>) => {
    setSavingId(id);
    try {
      await api.updateSubscription(id, updates);
      setGroups(groups.map(g => g.id === id ? { ...g, ...updates } : g));
    } catch {
      alert('保存失败');
    } finally {
      setSavingId(null);
    }
  };

  // Global URL source CRUD
  const handleAddSource = async () => {
    try {
      await api.createUrl({ url: 'https://', name: '新订阅源' });
      loadData();
    } catch {
      alert('添加失败');
    }
  };

  const handleImportUrls = async () => {
    const text = prompt('请输入订阅源 URL（支持输入多个，换行或空格/逗号分隔）：');
    if (!text) return;
    const urls = text.split(/[\s,;|]+/).map(u => u.trim()).filter(u => u.startsWith('http://') || u.startsWith('https://'));
    if (urls.length === 0) {
      alert('未检测到有效的 URL 地址（须以 http:// 或 https:// 开头）');
      return;
    }
    
    let successCount = 0;
    for (const url of urls) {
      try {
        let name = '导入源';
        try {
          const u = new URL(url);
          name = u.hostname;
          const pathname = u.pathname.split('/').filter(Boolean).pop();
          if (pathname && pathname.length > 3) {
            name = `${name}/${pathname}`;
          }
        } catch {}
        
        await api.createUrl({ url, name });
        successCount++;
      } catch (e) {
        console.error('导入源失败:', url, e);
      }
    }
    alert(`成功导入 ${successCount} 个订阅源`);
    loadData();
  };

  const handleDeleteSource = async (id: string) => {
    if (!confirm('确定删除此订阅源吗？(删除后，所有包含此源的订阅组将自动移除此引用)')) return;
    try {
      await api.deleteUrl(id);
      loadData();
    } catch {
      alert('删除失败');
    }
  };

  const handleUpdateSource = async (id: string, updates: Partial<api.UrlEntry>) => {
    try {
      await api.updateUrl(id, updates);
      setGlobalUrls(globalUrls.map(u => u.id === id ? { ...u, ...updates } : u));
      // 同步更新本地 groups 中的 resolved urls
      setGroups(groups.map(g => {
        if (g.urlIds.includes(id)) {
          return {
            ...g,
            urls: g.urls.map(u => u.id === id ? { ...u, ...updates } : u)
          };
        }
        return g;
      }));
    } catch {
      alert('保存源失败');
    }
  };

  const handleSourceRefresh = async (id: string) => {
    setRefreshingKey(id);
    setUrlMsg(null);
    try {
      const r = await api.refreshUrl(id);
      setUrlMsg({ key: id, ok: true, text: r.url });
      loadData();
    } catch (e: any) {
      setUrlMsg({ key: id, ok: false, text: e.message || '刷新失败' });
    } finally {
      setRefreshingKey(null);
    }
  };

  const handleSourceSyncCache = async (id: string) => {
    setRefreshingKey(`${id}-sync`);
    setUrlMsg(null);
    try {
      const r = await api.syncUrlCache(id);
      setUrlMsg({ key: id, ok: true, text: r.msg || '同步成功' });
      loadData();
    } catch (e: any) {
      setUrlMsg({ key: id, ok: false, text: e.message || '同步失败' });
    } finally {
      setRefreshingKey(null);
    }
  };

  if (loading) return <div className="p-10 text-technical-muted font-mono">Loading...</div>;

  return (
    <div className="p-6 md:p-10 space-y-8 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-technical-border pb-6 gap-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">订阅源与订阅组</h2>
          <p className="text-sm text-technical-muted mt-1">统一管理订阅源 URL，并按需勾选/排序组成不同的订阅组。</p>
        </div>
        {activeTab === 'groups' ? (
          <button className="technical-button-primary" onClick={handleAddGroup}>
            <Plus size={14} /><span>添加组</span>
          </button>
        ) : (
          <div className="flex gap-2">
            <button className="technical-button-outline border-technical-cyan/30 text-technical-cyan hover:bg-technical-cyan/5 gap-1.5" onClick={handleImportUrls}>
              <LogIn size={14} /><span>导入 URL</span>
            </button>
            <button className="technical-button-primary gap-1.5" onClick={handleAddSource}>
              <Plus size={14} /><span>添加订阅源</span>
            </button>
          </div>
        )}
      </div>

      {/* 选项卡 */}
      <div className="flex border-b border-technical-border gap-6">
        <button
          onClick={() => setActiveTab('groups')}
          className={`pb-3 text-xs uppercase tracking-widest font-display font-bold border-b-2 transition-all ${
            activeTab === 'groups' ? 'border-technical-cyan text-technical-cyan' : 'border-transparent text-technical-muted hover:text-gray-200'
          }`}
        >
          订阅组 ({groups.length})
        </button>
        <button
          onClick={() => setActiveTab('sources')}
          className={`pb-3 text-xs uppercase tracking-widest font-display font-bold border-b-2 transition-all ${
            activeTab === 'sources' ? 'border-technical-cyan text-technical-cyan' : 'border-transparent text-technical-muted hover:text-gray-200'
          }`}
        >
          订阅源管理 ({globalUrls.length})
        </button>
      </div>

      {activeTab === 'groups' ? (
        <div className="space-y-8 animate-fadeIn">
          {groups.map((group) => (
            <section key={group.id} className={`technical-card flex flex-col ${!group.enabled ? 'opacity-60 grayscale' : ''}`}>
              {/* 组头 */}
              <div className="bg-zinc-900 px-4 py-3 flex justify-between items-center border-b border-technical-border">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Folder size={18} className="text-technical-muted shrink-0" />
                  <input
                    className="bg-transparent border-none text-gray-200 font-display font-bold p-0 focus:ring-0 outline-none w-full max-w-xs"
                    type="text" value={group.title}
                    onChange={(e) => setGroups(groups.map(g => g.id === group.id ? { ...g, title: e.target.value } : g))}
                    onBlur={(e) => handleUpdateGroup(group.id, { title: e.target.value })}
                  />
                  {savingId === group.id && <Activity size={14} className="text-technical-cyan animate-spin" />}
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <button className="text-red-500/50 hover:text-red-500" onClick={() => handleDeleteGroup(group.id)}><Trash2 size={16} /></button>
                  <div className="font-mono text-[10px] text-technical-muted bg-black border border-technical-border px-2 py-1 rounded">已选 {group.urlIds.length} 个源</div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={group.enabled} onChange={(e) => handleUpdateGroup(group.id, { enabled: e.target.checked })} className="sr-only peer" />
                    <div className="w-8 h-4.5 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-gray-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-technical-cyan/40 peer-checked:after:bg-technical-cyan" />
                  </label>
                </div>
              </div>

              {/* 筛选正则 */}
              <div className="px-4 py-3 border-b border-technical-border/50 flex flex-col gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 text-technical-muted font-display text-[10px] uppercase tracking-widest whitespace-nowrap shrink-0 mt-2 sm:mt-0">
                    <Filter size={13} /><span>筛选:</span>
                    <button 
                      onClick={() => {
                        const isAdv = group.filter?.startsWith('{"advanced":true');
                        if (isAdv) {
                          handleUpdateGroup(group.id, { filter: '' });
                        } else {
                          handleUpdateGroup(group.id, { filter: JSON.stringify({ advanced: true, rules: [] }) });
                        }
                      }}
                      className={`ml-1 hover:text-technical-cyan transition-colors ${group.filter?.startsWith('{"advanced":true') ? 'text-technical-cyan' : ''}`}
                      title="切换高级模式 (AND/OR/NOT)"
                    >
                      <Settings2 size={13} />
                    </button>
                  </div>
                  {group.filter?.startsWith('{"advanced":true') ? (
                    <div className="flex-1 min-w-0">
                      {(() => {
                        let rules: any[] = [];
                        try { rules = JSON.parse(group.filter).rules || []; } catch {}
                        
                        const updateRules = (newRules: any[]) => {
                          const newFilter = JSON.stringify({ advanced: true, rules: newRules });
                          setGroups(groups.map(g => g.id === group.id ? { ...g, filter: newFilter } : g));
                          handleUpdateGroup(group.id, { filter: newFilter });
                        };

                        return (
                          <div className="flex flex-col gap-2 bg-black/40 border border-technical-border rounded-sm p-2 w-full overflow-hidden">
                            {rules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-col sm:flex-row sm:items-center gap-2 group/rule">
                                <select 
                                  value={rule.logic}
                                  onChange={(e) => {
                                    const n = [...rules];
                                    n[rIdx].logic = e.target.value;
                                    updateRules(n);
                                  }}
                                  className="bg-zinc-900 border border-technical-border text-[11px] text-technical-muted px-1.5 py-1 outline-none rounded-sm shrink-0"
                                >
                                  <option value="or">包含 (OR)</option>
                                  <option value="and">必含 (AND)</option>
                                  <option value="not">排除 (NOT)</option>
                                </select>
                                <input 
                                  type="text"
                                  value={rule.value}
                                  onChange={(e) => {
                                    const n = [...rules];
                                    n[rIdx].value = e.target.value;
                                    setGroups(groups.map(g => g.id === group.id ? { ...g, filter: JSON.stringify({ advanced: true, rules: n }) } : g));
                                  }}
                                  onBlur={() => {
                                    const n = [...rules];
                                    updateRules(n);
                                  }}
                                  placeholder="正则关键词..."
                                  className="flex-1 min-w-0 bg-zinc-900 border border-technical-border/50 text-xs font-mono text-technical-cyan px-2 py-1 outline-none focus:border-technical-cyan/50 rounded-sm"
                                />
                                <button onClick={() => updateRules(rules.filter((_, i) => i !== rIdx))} className="text-red-500/50 hover:text-red-500 shrink-0 sm:opacity-0 group-hover/rule:opacity-100 transition-opacity">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => updateRules([...rules, { logic: 'or', value: '' }])}
                              className="text-[10px] text-technical-cyan/70 hover:text-technical-cyan hover:bg-technical-cyan/10 self-start px-2 py-1 rounded transition-colors flex items-center gap-1"
                            >
                              <Plus size={12} /> 添加规则
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <input type="text" value={group.filter}
                      onChange={(e) => setGroups(groups.map(g => g.id === group.id ? { ...g, filter: e.target.value } : g))}
                      onBlur={(e) => handleUpdateGroup(group.id, { filter: e.target.value })}
                      placeholder="留空则不筛选"
                      className="flex-1 bg-black/40 border border-technical-border rounded-sm px-3 py-1 font-mono text-xs text-technical-cyan focus:outline-none focus:border-technical-cyan/30 transition-all"
                    />
                  )}
                  <button
                    onClick={() => handleFetchProxies(group.id)}
                    disabled={loadingProxies[group.id]}
                    className="technical-button-outline py-1 px-3 text-[10px] shrink-0 disabled:opacity-50"
                  >
                    {loadingProxies[group.id] ? <Activity size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    <span className="ml-1">{loadingProxies[group.id] ? '获取中...' : '测试过滤'}</span>
                  </button>
                </div>
                {proxyCache[group.id] && (
                  <div className="bg-black/60 border border-technical-border/50 rounded p-2 text-xs font-mono max-h-40 overflow-y-auto">
                    <div className="text-[10px] text-technical-muted mb-2 border-b border-technical-border/30 pb-1 flex justify-between">
                      <span>总计 {proxyCache[group.id].length} 个节点</span>
                      <span>
                        已过滤出 {proxyCache[group.id].filter(p => {
                          try { 
                            const pattern = compileFilter(group.filter);
                            return !pattern || new RegExp(pattern).test(p.name); 
                          }
                          catch { return false; }
                        }).length} 个
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {proxyCache[group.id].map((p, idx) => (
                        <ProxyNodeBadge key={idx} proxy={p} filterPattern={compileFilter(group.filter)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 已选订阅源列表（支持拖拽排序） */}
              <div className="flex flex-col bg-black/20">
                <div className="px-4 py-2 border-b border-technical-border/20 text-[10px] font-display font-bold uppercase tracking-widest text-technical-muted">
                  已关联订阅源 (拖拽手 Gird 排序):
                </div>
                {group.urls.map((entry, i) => {
                  const key = `group-url-${group.id}-${entry.id}-${i}`;
                  const isDragging = dragInfo?.groupId === group.id && dragInfo?.index === i;
                  const isDragOver = dragInfo?.groupId === group.id && dragOverIndex === i;
                  
                  return (
                    <div
                      key={key}
                      draggable={isDragging}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragInfo && dragInfo.groupId === group.id && dragInfo.index !== i) {
                          setDragOverIndex(i);
                        }
                      }}
                      onDragEnd={() => {
                        if (dragInfo && dragOverIndex !== null && dragInfo.index !== dragOverIndex) {
                          const newUrlIds = [...group.urlIds];
                          const [removed] = newUrlIds.splice(dragInfo.index, 1);
                          newUrlIds.splice(dragOverIndex, 0, removed);
                          
                          // 同时更新 urls 本地列表，保持前端显示一致
                          const newUrls = [...group.urls];
                          const [removedUrl] = newUrls.splice(dragInfo.index, 1);
                          newUrls.splice(dragOverIndex, 0, removedUrl);

                          setGroups(groups.map(g => g.id === group.id ? { ...g, urlIds: newUrlIds, urls: newUrls } : g));
                          handleUpdateGroup(group.id, { urlIds: newUrlIds });
                        }
                        setDragInfo(null);
                        setDragOverIndex(null);
                      }}
                      className={`border-b border-technical-border/30 last:border-0 transition-all ${
                        isDragging ? 'opacity-40 bg-zinc-900/50' : ''
                      } ${
                        isDragOver ? 'border-t-2 border-t-technical-cyan bg-technical-cyan/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4 px-4 py-2.5 hover:bg-white/5 transition-colors">
                        <GripVertical
                          size={15}
                          className="text-zinc-800 cursor-grab active:cursor-grabbing hover:text-zinc-600 shrink-0"
                          onMouseDown={() => setDragInfo({ groupId: group.id, index: i })}
                          onMouseUp={() => dragInfo && dragOverIndex === null && setDragInfo(null)}
                        />
                        <div className="w-5 h-5 flex items-center justify-center shrink-0">
                          {entry.icon ? (
                            <img
                              src={`https://gh-proxy.com/raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/${entry.icon}.png`}
                              alt={entry.icon}
                              className="w-4 h-4 object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <span className="text-zinc-700 text-[10px]">☆</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-gray-200 truncate">{entry.name || '未命名'}</div>
                          <div className="text-[10px] font-mono text-technical-muted truncate opacity-80 mt-0.5">{entry.url}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {entry.proxyGroup && (
                            <span className="px-2 py-0.5 bg-amber-900/20 border border-amber-700/30 text-[10px] font-mono text-amber-400 rounded-sm">
                              {entry.proxyGroup}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const newUrlIds = group.urlIds.filter(id => id !== entry.id);
                              const newUrls = group.urls.filter(u => u.id !== entry.id);
                              setGroups(groups.map(g => g.id === group.id ? { ...g, urlIds: newUrlIds, urls: newUrls } : g));
                              handleUpdateGroup(group.id, { urlIds: newUrlIds });
                            }}
                            className="p-1 text-technical-muted hover:text-red-500 transition-colors"
                            title="取消关联"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {group.urlIds.length === 0 && (
                  <div className="text-center p-6 text-[10px] text-technical-muted font-mono">暂无关联的订阅源，请在下方选择</div>
                )}
              </div>

              {/* 订阅源勾选选择器 */}
              <div className="p-4 border-t border-technical-border/30 bg-black/40">
                <div className="text-[10px] font-display font-bold uppercase tracking-widest text-technical-muted mb-2">
                  选择并关联订阅源:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {globalUrls.map((source) => {
                    const isChecked = group.urlIds.includes(source.id);
                    return (
                      <label
                        key={source.id}
                        className={`flex items-start gap-2.5 p-2 border rounded-sm cursor-pointer select-none transition-all ${
                          isChecked 
                            ? 'bg-technical-cyan/5 border-technical-cyan/40 text-gray-200' 
                            : 'bg-zinc-900/40 border-technical-border/50 text-technical-muted hover:text-gray-300 hover:border-zinc-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let newUrlIds = [...group.urlIds];
                            if (e.target.checked) {
                              if (!newUrlIds.includes(source.id)) newUrlIds.push(source.id);
                            } else {
                              newUrlIds = newUrlIds.filter(id => id !== source.id);
                            }
                            
                            // 更新 resolved urls
                            const newUrls = newUrlIds.map(id => globalUrls.find(u => u.id === id)).filter(Boolean) as api.UrlEntry[];

                            setGroups(groups.map(g => g.id === group.id ? { ...g, urlIds: newUrlIds, urls: newUrls } : g));
                            handleUpdateGroup(group.id, { urlIds: newUrlIds });
                          }}
                          className="sr-only"
                        />
                        <div className={`w-3.5 h-3.5 border rounded-sm shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                          isChecked ? 'bg-technical-cyan border-technical-cyan text-black' : 'border-zinc-700 bg-black'
                        }`}>
                          {isChecked && <span className="text-[8px] leading-none font-bold">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold truncate">{source.name || '未命名'}</div>
                          <div className="text-[9px] font-mono opacity-60 truncate mt-0.5">{source.url}</div>
                        </div>
                      </label>
                    );
                  })}
                  {globalUrls.length === 0 && (
                    <div className="col-span-full text-xs text-technical-muted py-2">
                      暂无可用订阅源，请先在右上角「订阅源管理」中添加。
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
          {groups.length === 0 && (
            <div className="text-center p-10 text-technical-muted border border-dashed border-technical-border rounded">暂无订阅组，请添加</div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-fadeIn">
          {showGcoreIps && (
            <div className="technical-card p-4 space-y-3 animate-fadeIn border border-technical-cyan/30 bg-black/40">
              <div className="flex justify-between items-center border-b border-technical-border pb-2">
                <span className="text-xs font-display font-bold text-technical-cyan uppercase tracking-widest">
                  Gcore 优选 IP 库 (来自后台定时/手动测速)
                </span>
                <button onClick={() => setShowGcoreIps(false)} className="text-technical-muted hover:text-white text-xs border-none bg-transparent outline-none cursor-pointer">
                  收起
                </button>
              </div>
              {gcoreIps.length === 0 ? (
                <p className="text-xs text-technical-muted py-2">暂无测速记录，请点击上方“Gcore 测速”开始。</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {gcoreIps.map((x: any, idx: number) => (
                    <div key={idx} className="bg-zinc-950 p-2.5 border border-technical-border rounded-sm flex flex-col gap-1 font-mono text-[10px]">
                      <div className="text-gray-300 font-bold">{x.ip}</div>
                      <div className="flex justify-between text-technical-muted">
                        <span>延迟:</span>
                        <span className={x.latency < 100 ? 'text-green-400 font-bold' : x.latency < 200 ? 'text-yellow-500' : 'text-red-500'}>
                          {x.latency}ms
                        </span>
                      </div>
                      <div className="flex justify-between text-technical-muted">
                        <span>丢包:</span>
                        <span className={x.loss === 0 ? 'text-green-400 font-bold' : 'text-red-500'}>
                          {x.loss}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {globalUrls.map((source) => {
            const key = `source-${source.id}`;
            const isExpanded = expandedKey === key;
            const refKey = source.id;

            return (
              <div key={source.id} className="technical-card flex flex-col bg-zinc-950">
                <div className="group/row flex items-center gap-3 px-4 py-3 hover:bg-white/2 transition-colors border-b border-technical-border/30">
                  <div className="w-6 h-6 bg-zinc-900 border border-technical-border flex items-center justify-center text-technical-cyan shrink-0 rounded-sm">
                    {source.icon ? (
                      <img
                        src={`https://gh-proxy.com/raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/${source.icon}.png`}
                        alt={source.icon}
                        className="w-4 h-4 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-zinc-500 text-[10px]">URL</span>
                    )}
                  </div>
                  
                  {/* Alias Name */}
                  <input
                    type="text"
                    value={source.name ?? ''}
                    onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, name: e.target.value } : u))}
                    onBlur={(e) => handleUpdateSource(source.id, { name: e.target.value })}
                    placeholder="订阅源别名"
                    className="w-36 bg-zinc-900 border border-technical-border/50 rounded-sm px-2.5 py-1 font-mono text-xs text-technical-cyan focus:outline-none focus:border-technical-cyan/50 shrink-0"
                  />

                  {/* URL Input */}
                  <input
                    type="text"
                    value={source.url}
                    onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, url: e.target.value } : u))}
                    onBlur={(e) => handleUpdateSource(source.id, { url: e.target.value.trim() })}
                    placeholder="https://..."
                    className="flex-1 min-w-0 bg-transparent border-none p-0 font-mono text-xs text-gray-300 focus:ring-0 outline-none truncate"
                  />

                  {source.lastRefreshedAt && (
                    <Clock size={11} className="text-zinc-600 shrink-0" title={`最近刷新: ${new Date(source.lastRefreshedAt).toLocaleString('zh-CN')}`} />
                  )}

                  {/* proxyGroup */}
                  <input
                    type="text"
                    value={source.proxyGroup ?? ''}
                    onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, proxyGroup: e.target.value } : u))}
                    onBlur={(e) => handleUpdateSource(source.id, { proxyGroup: e.target.value || undefined })}
                    placeholder="分组名"
                    title="所属 proxy-group 名（对应模板 {{URL_GROUPS}}）"
                    className="w-24 bg-zinc-900 border border-amber-700/40 rounded-sm px-2 py-0.5 font-mono text-[11px] text-amber-400 focus:outline-none focus:border-amber-500/60 shrink-0"
                  />

                  {/* Icon select */}
                  <select
                    value={source.icon ?? ''}
                    onChange={(e) => handleUpdateSource(source.id, { icon: e.target.value || undefined })}
                    className="w-24 bg-zinc-900 border border-amber-700/40 rounded-sm px-1 py-0.5 font-mono text-[11px] text-amber-400 focus:outline-none focus:border-amber-500/60 shrink-0"
                  >
                    <option value="">—</option>
                    <optgroup label="通用">
                      <option value="Auto">Auto（自动）</option>
                      <option value="Proxy">Proxy（代理）</option>
                      <option value="Global">Global（全局）</option>
                      <option value="Final">Final（兜底）</option>
                      <option value="Server">Server（服务器）</option>
                      <option value="Speedtest">Speedtest（测速）</option>
                      <option value="Direct">Direct（直连）</option>
                      <option value="Bypass">Bypass（绕过）</option>
                      <option value="Blackhole">Blackhole（屏蔽）</option>
                      <option value="Advertising">Advertising（广告）</option>
                      <option value="Airport">Airport（机场）</option>
                      <option value="Area">Area（地区）</option>
                      <option value="Available">Available（可用）</option>
                      <option value="Bot">Bot（机器人）</option>
                      <option value="Download">Download（下载）</option>
                      <option value="Domestic">Domestic（国内）</option>
                    </optgroup>
                    <optgroup label="AI / 工具">
                      <option value="AI">AI</option>
                      <option value="ChatGPT">ChatGPT</option>
                      <option value="Copilot">Copilot</option>
                      <option value="Azure">Azure</option>
                      <option value="Cloudflare">Cloudflare</option>
                    </optgroup>
                    <optgroup label="流媒体">
                      <option value="YouTube">YouTube</option>
                      <option value="Netflix">Netflix</option>
                      <option value="Spotify">Spotify</option>
                      <option value="Disney+">Disney+</option>
                      <option value="Apple_TV">Apple TV</option>
                      <option value="Apple_TV_Plus">Apple TV+</option>
                      <option value="Apple_Music">Apple Music</option>
                      <option value="AbemaTV">AbemaTV</option>
                      <option value="AfreecaTV">AfreecaTV</option>
                      <option value="BBC_iPlayer">BBC iPlayer</option>
                      <option value="DAZN">DAZN</option>
                      <option value="All4">All4</option>
                      <option value="Bahamut">Bahamut</option>
                      <option value="bilibili">bilibili</option>
                      <option value="DomesticMedia">国内媒体</option>
                    </optgroup>
                    <optgroup label="社交">
                      <option value="Telegram">Telegram</option>
                      <option value="Twitter">Twitter</option>
                      <option value="Discord">Discord</option>
                      <option value="Clubhouse">Clubhouse</option>
                    </optgroup>
                    <optgroup label="购物 / 其他">
                      <option value="Google_Search">Google</option>
                      <option value="Github">Github</option>
                      <option value="Amazon">Amazon</option>
                      <option value="Apple">Apple</option>
                      <option value="Alibaba">Alibaba</option>
                      <option value="App_Store">App Store</option>
                      <option value="Cryptocurrency">Cryptocurrency</option>
                    </optgroup>
                    <optgroup label="地区">
                      <option value="HK">🇭🇰 香港</option>
                      <option value="TW">🇹🇼 台湾</option>
                      <option value="JP">🇯🇵 日本</option>
                      <option value="US">🇺🇸 美国</option>
                      <option value="SG">🇸🇬 新加坡</option>
                      <option value="DE">🇩🇪 德国</option>
                      <option value="CA">🇨🇦 加拿大</option>
                      <option value="AU">🇦🇺 澳大利亚</option>
                      <option value="BR">🇧🇷 巴西</option>
                      <option value="AR">🇦🇷 阿根廷</option>
                      <option value="IN">🇮🇳 印度</option>
                      <option value="KR">🇰🇷 韩国</option>
                      <option value="FR">🇫🇷 法国</option>
                      <option value="GB">🇬🇧 英国</option>
                      <option value="NL">🇳🇱 荷兰</option>
                      <option value="China_Map">🇨🇳 中国大陆</option>
                      <option value="China">中国</option>
                      <option value="Asia_Map">亚洲</option>
                      <option value="America_Map">美洲</option>
                      <option value="Africa_Map">非洲</option>
                      <option value="Australia">大洋洲</option>
                    </optgroup>
                  </select>

                  {/* Expand config */}
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    className={`p-1 shrink-0 transition-colors ${source.refreshUrl ? 'text-technical-cyan/70 hover:text-technical-cyan' : 'text-zinc-700 hover:text-technical-muted'}`}
                    title="配置自动刷新"
                  >
                    <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteSource(source.id)}
                    className="p-1 text-technical-muted hover:text-red-500 transition-colors opacity-0 group-hover/row:opacity-100 shrink-0"
                    title="删除订阅源"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Expanded settings */}
                {isExpanded && (
                  <div className="px-12 pb-4 pt-3 space-y-3 bg-black/40 border-b border-technical-border/20 animate-fadeIn">
                    <p className="text-[9px] font-mono text-zinc-500">每天 UTC 00:00 自动请求以下接口获取最新订阅并更新</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">接口地址 (refreshUrl)</label>
                        <input
                          type="text"
                          value={source.refreshUrl ?? ''}
                          onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, refreshUrl: e.target.value } : u))}
                          onBlur={(e) => handleUpdateSource(source.id, { refreshUrl: e.target.value.trim() || undefined })}
                          placeholder="https://example.com/api/getSubscribe"
                          className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">解析类型 (refreshType)</label>
                        <select
                          value={source.refreshType ?? ''}
                          onChange={(e) => handleUpdateSource(source.id, { refreshType: e.target.value || undefined })}
                          className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                        >
                          <option value="">默认 (直接提取订阅接口返回的 JSON)</option>
                          <option value="hoshi_v2board">Hoshi 动态跳转 (如 Xsus，提供 Portal 地址及账号密码)</option>
                          <option value="v2board">普通 V2Board (直接登录，提供 API 根地址及账号密码)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">请求头 JSON (refreshHeaders - 选填)</label>
                        <textarea
                          rows={2}
                          value={source.refreshHeaders ? JSON.stringify(source.refreshHeaders, null, 2) : ''}
                          onChange={(e) => {
                            try {
                              const parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, refreshHeaders: parsed } : u));
                            } catch {}
                          }}
                          onBlur={(e) => {
                            try {
                              const parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
                              handleUpdateSource(source.id, { refreshHeaders: parsed });
                            } catch {
                              alert('JSON 格式错误');
                            }
                          }}
                          placeholder={'{\n  "authorization": "Bearer xxx"\n}'}
                          className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">响应字段路径 (refreshJsonPath - 选填)</label>
                        <input
                          type="text"
                          value={source.refreshJsonPath ?? ''}
                          onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, refreshJsonPath: e.target.value } : u))}
                          onBlur={(e) => handleUpdateSource(source.id, { refreshJsonPath: e.target.value || undefined })}
                          placeholder="subscribe_url 或 data.subscribe_url"
                          className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                        />
                      </div>
                    </div>

                    {/* Cache parameters */}
                    <div className="pt-2 border-t border-technical-border/20 space-y-2">
                      <label className="block text-[10px] font-display font-bold text-technical-cyan uppercase tracking-widest">缓存与解析配置</label>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">缓存过期时间 (分钟，默认5，0不过期，-1不缓存)</label>
                          <input
                            type="number"
                            min={-1}
                            value={source.cacheTtl !== undefined ? Math.round(source.cacheTtl / 60) : ''}
                            onChange={(e) => {
                              const minutes = e.target.value !== '' ? parseInt(e.target.value, 10) : undefined;
                              const seconds = (minutes !== undefined && !isNaN(minutes)) ? minutes * 60 : undefined;
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cacheTtl: seconds } : u));
                            }}
                            onBlur={(e) => {
                              const minutes = e.target.value !== '' ? parseInt(e.target.value, 10) : undefined;
                              const seconds = (minutes !== undefined && !isNaN(minutes)) ? minutes * 60 : undefined;
                              handleUpdateSource(source.id, { cacheTtl: seconds });
                            }}
                            placeholder="如: 5 (0不过期, -1不缓存)"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">统一节点名称前缀 (如: 台湾)</label>
                          <input
                            type="text"
                            value={source.namePrefix ?? ''}
                            onChange={(e) => {
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, namePrefix: e.target.value } : u));
                            }}
                            onBlur={(e) => {
                              handleUpdateSource(source.id, { namePrefix: e.target.value || undefined });
                            }}
                            placeholder="例如: 台湾"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                        <div className="flex items-end pb-2">
                          <label className="flex items-center gap-2 text-[11px] text-technical-muted cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={source.simplifyNames ?? false}
                              onChange={(e) => {
                                setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, simplifyNames: e.target.checked } : u));
                                handleUpdateSource(source.id, { simplifyNames: e.target.checked });
                              }}
                              className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                            />
                            <span>简化节点名称 (移除 +WS/+TLS/+Reality)</span>
                          </label>
                        </div>
                        <div className="flex items-end pb-2">
                          <label className="flex items-center gap-2 text-[11px] text-technical-muted cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={source.onlyCdnAtNight ?? false}
                              onChange={(e) => {
                                setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, onlyCdnAtNight: e.target.checked } : u));
                                handleUpdateSource(source.id, { onlyCdnAtNight: e.target.checked });
                              }}
                              className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                            />
                            <span className={source.onlyCdnAtNight ? 'text-technical-cyan font-bold' : ''}>晚上只显示 CDN</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Hysteria 2 parameters */}
                    <div className="pt-2 border-t border-technical-border/20 space-y-2">
                      <label className="block text-[10px] font-display font-bold text-amber-400 uppercase tracking-widest">Hysteria 2 客户端微调参数 (仅对该源中的 Hysteria 2 节点生效)</label>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">上传速度限制 (up)</label>
                          <input
                            type="text"
                            value={source.hysteria2Up ?? ''}
                            onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, hysteria2Up: e.target.value } : u))}
                            onBlur={(e) => handleUpdateSource(source.id, { hysteria2Up: e.target.value || undefined })}
                            placeholder="如: 30 Mbps"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">下载速度限制 (down)</label>
                          <input
                            type="text"
                            value={source.hysteria2Down ?? ''}
                            onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, hysteria2Down: e.target.value } : u))}
                            onBlur={(e) => handleUpdateSource(source.id, { hysteria2Down: e.target.value || undefined })}
                            placeholder="如: 150 Mbps"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">MTU 限制 (mtu)</label>
                          <input
                            type="number"
                            value={source.hysteria2Mtu ?? ''}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, hysteria2Mtu: val } : u));
                            }}
                            onBlur={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              handleUpdateSource(source.id, { hysteria2Mtu: val });
                            }}
                            placeholder="如: 1350"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Akile API parameters */}
                    <div className="pt-2 border-t border-technical-border/20 space-y-2">
                      <label className="block text-[10px] font-display font-bold text-technical-cyan uppercase tracking-widest">Akile 流量监控配置 (用于修正与服务商不一致的流量数据)</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">Server ID (id)</label>
                          <input
                            type="text"
                            value={source.akileServerId ?? ''}
                            onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, akileServerId: e.target.value } : u))}
                            onBlur={(e) => handleUpdateSource(source.id, { akileServerId: e.target.value.trim() || undefined })}
                            placeholder="如: 105569"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">Api Client</label>
                          <input
                            type="text"
                            value={source.akileApiClient ?? ''}
                            onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, akileApiClient: e.target.value } : u))}
                            onBlur={(e) => handleUpdateSource(source.id, { akileApiClient: e.target.value.trim() || undefined })}
                            placeholder="Api-Client 访问密钥"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">Api Secret</label>
                          <input
                            type="password"
                            value={source.akileApiSecret ?? ''}
                            onChange={(e) => setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, akileApiSecret: e.target.value } : u))}
                            onBlur={(e) => handleUpdateSource(source.id, { akileApiSecret: e.target.value.trim() || undefined })}
                            placeholder="Api-Secret 安全密钥"
                            className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Cloudflare 优选 IP 配置 */}
                    <div className="pt-2 border-t border-technical-border/20 space-y-3">
                      <label className="block text-[10px] font-display font-bold text-technical-cyan uppercase tracking-widest">
                        Cloudflare 优选 IP 配置 (自动克隆 CDN 节点到优选 IP)
                      </label>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-black/20 p-3 rounded-sm border border-technical-border/30">
                        <label className="flex items-center gap-2 text-[11px] text-technical-muted cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={source.cfOptimize ?? false}
                            onChange={(e) => {
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimize: e.target.checked } : u));
                              handleUpdateSource(source.id, { cfOptimize: e.target.checked });
                            }}
                            className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                          />
                          <span className={source.cfOptimize ? 'text-technical-cyan font-bold' : ''}>启用优选 IP 优化</span>
                        </label>

                        <label className={`flex items-center gap-2 text-[11px] text-technical-muted select-none ${source.cfOptimize ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                          <input
                            type="checkbox"
                            disabled={!source.cfOptimize}
                            checked={source.cfOptimizeOnlyCdn ?? false}
                            onChange={(e) => {
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimizeOnlyCdn: e.target.checked } : u));
                              handleUpdateSource(source.id, { cfOptimizeOnlyCdn: e.target.checked });
                            }}
                            className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                          />
                          <span>仅对名称包含 "cdn" 的节点优化</span>
                        </label>

                        <label className={`flex items-center gap-2 text-[11px] text-technical-muted select-none ${source.cfOptimize ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                          <input
                            type="checkbox"
                            disabled={!source.cfOptimize}
                            checked={source.cfOptimizeHideOriginal ?? false}
                            onChange={(e) => {
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimizeHideOriginal: e.target.checked } : u));
                              handleUpdateSource(source.id, { cfOptimizeHideOriginal: e.target.checked });
                            }}
                            className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                          />
                          <span>隐藏原节点</span>
                        </label>
                      </div>

                      {source.cfOptimize && (
                        <div className="space-y-3 p-3 bg-zinc-950 border border-technical-border/40 rounded-sm animate-fadeIn">
                          {/* Segmented Control */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-display text-technical-muted uppercase tracking-widest shrink-0">优化模式:</span>
                            <div className="flex gap-1 bg-black/40 p-0.5 border border-technical-border rounded-sm shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimizeType: 'api' } : u));
                                  handleUpdateSource(source.id, { cfOptimizeType: 'api' });
                                }}
                                className={`px-3 py-1 text-[11px] rounded-sm transition-all ${
                                  (source.cfOptimizeType ?? 'api') === 'api'
                                    ? 'bg-technical-cyan text-black font-bold'
                                    : 'text-technical-muted hover:text-white'
                                }`}
                              >
                                系统测速 IP
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimizeType: 'custom' } : u));
                                  handleUpdateSource(source.id, { cfOptimizeType: 'custom' });
                                }}
                                className={`px-3 py-1 text-[11px] rounded-sm transition-all ${
                                  source.cfOptimizeType === 'custom'
                                    ? 'bg-technical-cyan text-black font-bold'
                                    : 'text-technical-muted hover:text-white'
                                }`}
                              >
                                自定义域名 / IP
                              </button>
                            </div>
                          </div>

                          {/* Dynamic Inputs */}
                          {(source.cfOptimizeType ?? 'api') === 'api' ? (
                            <div className="animate-fadeIn space-y-3">
                              <div>
                                <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">优选 IP 节点数量</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={source.cfOptimizeNum ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                    setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimizeNum: val } : u));
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                    handleUpdateSource(source.id, { cfOptimizeNum: val });
                                  }}
                                  placeholder="默认 5 (最大 50)"
                                  className="w-48 bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                                />
                              </div>
                              <div className="flex items-center gap-4 pt-1">
                                <span className="text-[10px] font-display text-technical-muted uppercase tracking-widest shrink-0">优选运营商:</span>
                                {(() => {
                                  const isps = source.cfOptimizeIsp ? source.cfOptimizeIsp.split(',') : ['ct', 'cu', 'cmcc'];
                                  const hasCt = isps.includes('ct');
                                  const hasCu = isps.includes('cu');
                                  const hasCmcc = isps.includes('cmcc');
                                  
                                  const toggleIsp = (ispCode: string, checked: boolean) => {
                                    let next = [...isps];
                                    if (checked) {
                                      if (!next.includes(ispCode)) next.push(ispCode);
                                    } else {
                                      next = next.filter(x => x !== ispCode);
                                    }
                                    const nextStr = next.join(',');
                                    setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimizeIsp: nextStr } : u));
                                    handleUpdateSource(source.id, { cfOptimizeIsp: nextStr });
                                  };

                                  return (
                                    <>
                                      <label className="flex items-center gap-1.5 text-[11px] text-technical-muted cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={hasCt}
                                          onChange={(e) => toggleIsp('ct', e.target.checked)}
                                          className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                                        />
                                        <span>电信</span>
                                      </label>
                                      <label className="flex items-center gap-1.5 text-[11px] text-technical-muted cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={hasCu}
                                          onChange={(e) => toggleIsp('cu', e.target.checked)}
                                          className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                                        />
                                        <span>联通</span>
                                      </label>
                                      <label className="flex items-center gap-1.5 text-[11px] text-technical-muted cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={hasCmcc}
                                          onChange={(e) => toggleIsp('cmcc', e.target.checked)}
                                          className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                                        />
                                        <span>移动</span>
                                      </label>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          ) : (
                            <div className="animate-fadeIn">
                              <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">
                                自定义优选域名/IP（以逗号/空格分隔，支持填写如 318182456.cf.090227.xyz 或 www.visa.com）
                              </label>
                              <input
                                type="text"
                                value={source.cfOptimizeDomain ?? ''}
                                onChange={(e) => {
                                  setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, cfOptimizeDomain: e.target.value } : u));
                                }}
                                onBlur={(e) => {
                                  handleUpdateSource(source.id, { cfOptimizeDomain: e.target.value.trim() || undefined });
                                }}
                                placeholder="输入域名或 IP 列表，如: 318182456.cf.090227.xyz"
                                className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Gcore 优选配置 */}
                    <div className="pt-2 border-t border-technical-border/20 space-y-3">
                      <label className="block text-[10px] font-display font-bold text-technical-cyan uppercase tracking-widest">
                        Gcore 优选配置 (可自定义低延迟 IP/域名)
                      </label>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-black/20 p-3 rounded-sm border border-technical-border/30">
                        <label className="flex items-center gap-2 text-[11px] text-technical-muted cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={source.gcoreOptimize ?? false}
                            onChange={(e) => {
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, gcoreOptimize: e.target.checked } : u));
                              handleUpdateSource(source.id, { gcoreOptimize: e.target.checked });
                            }}
                            className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                          />
                          <span className={source.gcoreOptimize ? 'text-technical-cyan font-bold' : ''}>启用 Gcore 优化</span>
                        </label>

                        <label className={`flex items-center gap-2 text-[11px] text-technical-muted select-none ${source.gcoreOptimize ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                          <input
                            type="checkbox"
                            disabled={!source.gcoreOptimize}
                            checked={source.gcoreOptimizeHideOriginal ?? false}
                            onChange={(e) => {
                              setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, gcoreOptimizeHideOriginal: e.target.checked } : u));
                              handleUpdateSource(source.id, { gcoreOptimizeHideOriginal: e.target.checked });
                            }}
                            className="bg-black/40 border border-technical-border rounded-sm text-technical-cyan focus:ring-0 outline-none w-3.5 h-3.5"
                          />
                          <span>隐藏原节点</span>
                        </label>
                      </div>

                      {source.gcoreOptimize && (
                        <div className="space-y-3 p-3 bg-zinc-950 border border-technical-border/40 rounded-sm animate-fadeIn">
                          {/* Segmented Control */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-display text-technical-muted uppercase tracking-widest shrink-0">优化模式:</span>
                            <div className="flex gap-1 bg-black/40 p-0.5 border border-technical-border rounded-sm shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, gcoreOptimizeType: 'api' } : u));
                                  handleUpdateSource(source.id, { gcoreOptimizeType: 'api' });
                                }}
                                className={`px-3 py-1 text-[11px] rounded-sm transition-all ${
                                  (source.gcoreOptimizeType ?? 'api') === 'api'
                                    ? 'bg-technical-cyan text-black font-bold'
                                    : 'text-technical-muted hover:text-white'
                                }`}
                              >
                                系统测速 IP
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, gcoreOptimizeType: 'custom' } : u));
                                  handleUpdateSource(source.id, { gcoreOptimizeType: 'custom' });
                                }}
                                className={`px-3 py-1 text-[11px] rounded-sm transition-all ${
                                  source.gcoreOptimizeType === 'custom'
                                    ? 'bg-technical-cyan text-black font-bold'
                                    : 'text-technical-muted hover:text-white'
                                }`}
                              >
                                自定义域名 / IP
                              </button>
                            </div>
                          </div>

                          {/* Dynamic Inputs */}
                          {(source.gcoreOptimizeType ?? 'api') === 'api' ? (
                            <div className="animate-fadeIn space-y-3">
                              <div>
                                <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">优选 IP 节点数量</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={source.gcoreOptimizeNum ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                    setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, gcoreOptimizeNum: val } : u));
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                    handleUpdateSource(source.id, { gcoreOptimizeNum: val });
                                  }}
                                  placeholder="默认 3 (最大 20)"
                                  className="w-48 bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="animate-fadeIn">
                              <label className="block text-[9px] font-display text-technical-muted uppercase tracking-widest mb-1">
                                自定义优选域名/IP（以逗号/空格分隔，不填则默认直接使用域名连接）
                              </label>
                              <input
                                type="text"
                                value={source.gcoreOptimizeDomain ?? ''}
                                onChange={(e) => {
                                  setGlobalUrls(globalUrls.map(u => u.id === source.id ? { ...u, gcoreOptimizeDomain: e.target.value } : u));
                                }}
                                onBlur={(e) => {
                                  handleUpdateSource(source.id, { gcoreOptimizeDomain: e.target.value.trim() || undefined });
                                }}
                                placeholder="输入域名或 IP 列表，如: Seoul-node.gcdn.co, 1.2.3.4"
                                className="w-full bg-black/40 border border-technical-border rounded-sm px-2.5 py-1.5 font-mono text-xs text-gray-300 focus:outline-none focus:border-technical-cyan/50"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {(() => {
                      let domain = '';
                      try {
                        domain = new URL(source.url.split(/[\s,;|]+/)[0]).hostname;
                      } catch {}
                      if (!domain) return null;
                      return <SourceGfwChecker domain={domain} />;
                    })()}

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => handleSourceRefresh(source.id)}
                        disabled={!source.refreshUrl || refreshingKey === refKey}
                        className="technical-button-primary py-1 px-3 text-xs gap-1.5 disabled:opacity-40"
                      >
                        <RefreshCw size={12} className={refreshingKey === refKey ? 'animate-spin' : ''} />
                        <span>{refreshingKey === refKey ? '刷新中...' : '立即刷新'}</span>
                      </button>
                      <button
                        onClick={() => handleSourceSyncCache(source.id)}
                        disabled={refreshingKey === `${refKey}-sync`}
                        className="technical-button-outline py-1 px-3 text-xs gap-1.5 disabled:opacity-40"
                        title="立即从订阅源 URL 同步节点与流量数据，并更新本地 KV 缓存"
                      >
                        <RefreshCw size={12} className={refreshingKey === `${refKey}-sync` ? 'animate-spin' : ''} />
                        <span>{refreshingKey === `${refKey}-sync` ? '同步中...' : '手动拉取上游'}</span>
                      </button>
                      {urlMsg?.key === refKey && (
                        <span className={`text-xs font-mono flex items-center gap-1 ${urlMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                          {urlMsg.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                          <span className="truncate max-w-xs">{urlMsg.text}</span>
                        </span>
                      )}
                      {source.lastRefreshedAt && (
                        <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1 ml-auto">
                          <Clock size={9} />最近更新: {new Date(source.lastRefreshedAt).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {globalUrls.length === 0 && (
            <div className="text-center p-10 text-technical-muted border border-dashed border-technical-border rounded">暂无订阅源，请添加</div>
          )}
        </div>
      )}
    </div>
  );
}

function TemplatesView() {
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [yamlError, setYamlError] = useState<string | null>(null);

  const activeTemplate = templates.find(t => t.id === activeId);

  useEffect(() => {
    if (activeTemplate) {
      try {
        jsyaml.load(activeTemplate.content);
        setYamlError(null);
      } catch (e: any) {
        setYamlError(e.message);
      }
    }
  }, [activeTemplate?.id]);

  const loadData = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data);
      if (data.length > 0 && !activeId) {
        setActiveId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAddTemplate = async () => {
    const name = prompt('请输入模板名称：', 'new_template');
    if (!name) return;
    try {
      const tpl = await api.createTemplate({ name, content: '# 请输入模板内容' });
      setTemplates([...templates, tpl]);
      setActiveId(tpl.id);
    } catch (e) {
      alert('创建失败');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('确定删除此模板吗？')) return;
    try {
      await api.deleteTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (e) {
      alert('删除失败');
    }
  };

  const handleSave = async () => {
    if (!activeTemplate) return;
    setSaving(true);
    try {
      await api.updateTemplate(activeTemplate.id, { 
        name: activeTemplate.name,
        content: activeTemplate.content 
      });
    } catch (e) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleContentChange = (val: string) => {
    if (!activeTemplate) return;
    setTemplates(templates.map(t => t.id === activeTemplate.id ? { ...t, content: val } : t));
    try {
      jsyaml.load(val);
      setYamlError(null);
    } catch (e: any) {
      setYamlError(e.message);
    }
  };

  if (loading) return <div className="p-10 text-technical-muted font-mono">Loading...</div>;

  return (
    <div className="flex-1 flex h-full w-full bg-technical-bg font-sans">
      <aside className="w-64 shrink-0 border-r border-technical-border flex flex-col hidden lg:flex bg-black">
        <div className="p-4 border-b border-technical-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-widest text-white">
            <Folder size={14} className="text-technical-cyan" />
            <span>模板文件</span>
          </div>
          <button className="text-technical-muted hover:text-technical-cyan" onClick={handleAddTemplate}><Plus size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {templates.map(tpl => (
             <div key={tpl.id} className="flex items-center group">
               <button 
                  onClick={() => setActiveId(tpl.id)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 text-xs rounded-sm truncate ${activeId === tpl.id ? 'text-technical-cyan bg-technical-cyan/10' : 'text-technical-muted hover:text-white hover:bg-zinc-900 transition-colors'}`}
                >
                  <File size={14} className="shrink-0" />
                  <span className="truncate">{tpl.name}</span>
                </button>
                <button 
                  className="p-2 text-technical-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDeleteTemplate(tpl.id)}
                >
                  <Trash2 size={12} />
                </button>
             </div>
          ))}
          {templates.length === 0 && <div className="text-xs text-technical-muted p-2">暂无模板</div>}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 bg-technical-surface">
        {activeTemplate ? (
          <>
            <div className="h-11 flex items-center justify-between border-b border-technical-border bg-black px-4">
              <div className="flex h-full items-center gap-2 md:gap-3 flex-1 min-w-0">
                {/* 移动端模版切换选择器 */}
                <div className="flex lg:hidden items-center gap-1.5 shrink-0">
                  <select
                    value={activeId || ''}
                    onChange={(e) => setActiveId(e.target.value || null)}
                    className="bg-zinc-900 border border-technical-border rounded px-2 py-0.5 text-xs text-technical-cyan focus:outline-none focus:ring-1 focus:ring-technical-cyan/50 max-w-[100px] sm:max-w-[150px] font-medium"
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddTemplate}
                    className="p-1 text-technical-muted hover:text-technical-cyan transition-colors"
                    title="新建模板"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => activeId && handleDeleteTemplate(activeId)}
                    className="p-1 text-technical-muted hover:text-red-500 transition-colors"
                    title="删除当前模板"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* 桌面端：只显示文本输入框来重命名 */}
                <input 
                  type="text" 
                  value={activeTemplate.name}
                  onChange={(e) => setTemplates(templates.map(t => t.id === activeTemplate.id ? { ...t, name: e.target.value } : t))}
                  className="bg-transparent border-none text-technical-cyan text-sm font-medium focus:outline-none focus:ring-0 hidden lg:block"
                />

                {/* 移动端：显示一个精简的输入框来重命名 */}
                <input 
                  type="text" 
                  value={activeTemplate.name}
                  onChange={(e) => setTemplates(templates.map(t => t.id === activeTemplate.id ? { ...t, name: e.target.value } : t))}
                  className="bg-zinc-900 border border-technical-border rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-technical-cyan/50 max-w-[80px] sm:max-w-[120px] lg:hidden"
                  placeholder="重命名"
                />
              </div>
              <div className="flex items-center gap-2">
                <button className="technical-button-primary py-1 px-3 h-8 gap-1" onClick={handleSave} disabled={saving}>
                  <Save size={12} />
                  <span>{saving ? '保存中...' : '保存'}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative">
               <CodeMirror
                  value={activeTemplate.content}
                  height="100%"
                  extensions={[yaml()]}
                  onChange={handleContentChange}
                  theme={dracula}
                  className="flex-1 overflow-auto text-sm"
               />
            </div>
            
            <div className="min-h-7 bg-white border-t border-technical-border flex items-center justify-between px-4 py-1 text-[10px] font-mono text-technical-muted">
              <div className="flex items-center gap-6">
                {yamlError ? (
                  <div className="flex items-center gap-1.5 text-red-500">
                    <XCircle size={12} />
                    <span className="truncate max-w-md">{yamlError}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle2 size={12} />
                    <span>YAML 语法正确</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span>UTF-8</span>
                <span className="text-technical-cyan">YAML</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-technical-muted">
            请在左侧选择或新建一个模板
          </div>
        )}
      </section>
    </div>
  )
}

function GeneratedLinksView() {
  const [links, setLinks] = useState<api.GeneratedLink[]>([]);
  const [groups, setGroups] = useState<api.SubscriptionGroup[]>([]);
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [loading, setLoading] = useState(true);


  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formGroup, setFormGroup] = useState('');
  const [formSubGroupId, setFormSubGroupId] = useState('');
  const [formTplId, setFormTplId] = useState('');
  const [formProxyUpdateInterval, setFormProxyUpdateInterval] = useState<number>(24);

  const loadData = async () => {
    try {
      const [lData, gData, tData] = await Promise.all([
        api.getLinks(),
        api.getSubscriptions(),
        api.getTemplates()
      ]);
      setLinks(lData);
      setGroups(gData);
      setTemplates(tData);
      if (gData.length > 0) setFormSubGroupId(gData[0].id);
      if (tData.length > 0) setFormTplId(tData[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formName || !formSubGroupId || !formTplId) return alert('请完整填写');
    try {
      if (editingLinkId) {
        await api.updateLink(editingLinkId, {
          name: formName,
          group: formGroup || 'Default',
          subscriptionGroupId: formSubGroupId,
          templateId: formTplId,
          proxyUpdateInterval: formProxyUpdateInterval
        });
      } else {
        await api.createLink({
          name: formName,
          group: formGroup || 'Default',
          subscriptionGroupId: formSubGroupId,
          templateId: formTplId,
          expiresAt: null, // 暂不支持设置过期
          proxyUpdateInterval: formProxyUpdateInterval
        });
      }
      setShowForm(false);
      setEditingLinkId(null);
      setFormName('');
      setFormGroup('');
      setFormProxyUpdateInterval(24);
      loadData();
    } catch (e) {
      alert(editingLinkId ? '修改失败' : '生成失败');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingLinkId(null);
    setFormName('');
    setFormGroup('');
    setFormProxyUpdateInterval(24);
  };

  const handleEdit = (link: api.GeneratedLink) => {
    setEditingLinkId(link.id);
    setFormName(link.name);
    setFormGroup(link.group);
    setFormSubGroupId(link.subscriptionGroupId);
    setFormTplId(link.templateId);
    setFormProxyUpdateInterval(link.proxyUpdateInterval ?? 24);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此链接吗？')) return;
    try {
      await api.deleteLink(id);
      loadData();
    } catch (e) {
      alert('删除失败');
    }
  };

  const handleCopy = (token: string) => {
    const url = api.buildSubUrl(token);
    navigator.clipboard.writeText(url).then(() => alert('已复制：' + url));
  };

  if (loading) return <div className="p-10 text-technical-muted font-mono">Loading...</div>;

  const formatInterval = (hours?: number) => {
    if (!hours) return '24 小时 (默认)';
    if (hours === 24) return '24 小时';
    if (hours % 24 === 0) return `${hours / 24} 天`;
    return `${hours} 小时`;
  };

  return (
    <div className="p-6 md:p-10 space-y-8 w-full max-w-[1600px] mx-auto">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-technical-border pb-6 gap-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">已生成链接</h2>
          <p className="text-sm text-technical-muted mt-1">管理并分发订阅连接 URL。</p>
        </div>
        <button className="technical-button-outline border-technical-cyan/30 text-technical-cyan hover:bg-technical-cyan/5" onClick={() => {
          if (showForm) {
            handleCancel();
          } else {
            setShowForm(true);
          }
        }}>
          <LinkIcon size={14} />
          <span>{showForm ? '取消' : '生成新链接'}</span>
        </button>
      </div>

      {showForm && (
        <div className="technical-card p-6 bg-black/40 border-technical-cyan/50">
          <div className="text-sm font-display font-bold text-white mb-4">
            {editingLinkId ? `修改链接: ${formName}` : '生成新订阅链接'}
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-xs text-technical-muted mb-1">链接名称</label>
               <input type="text" className="technical-input w-full" value={formName} onChange={e => setFormName(e.target.value)} required />
             </div>
             <div>
               <label className="block text-xs text-technical-muted mb-1">目标分组 (可选)</label>
               <input type="text" className="technical-input w-full" value={formGroup} onChange={e => setFormGroup(e.target.value)} />
             </div>
             <div>
               <label className="block text-xs text-technical-muted mb-1">选择订阅组</label>
               <select className="technical-input w-full" value={formSubGroupId} onChange={e => setFormSubGroupId(e.target.value)}>
                 {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
               </select>
             </div>
             <div>
               <label className="block text-xs text-technical-muted mb-1">选择模板</label>
               <select className="technical-input w-full" value={formTplId} onChange={e => setFormTplId(e.target.value)}>
                 {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
               </select>
             </div>
             <div>
                <label className="block text-xs text-technical-muted mb-1">订阅更新间隔</label>
                <select 
                  className="technical-input w-full"
                  value={formProxyUpdateInterval}
                  onChange={e => setFormProxyUpdateInterval(parseInt(e.target.value, 10) || 24)}
                >
                  <option value="1">1 小时 (60分钟)</option>
                  <option value="3">3 小时 (180分钟)</option>
                  <option value="6">6 小时 (360分钟)</option>
                  <option value="12">12 小时 (720分钟)</option>
                  <option value="24">24 小时 (1440分钟 - 默认)</option>
                  <option value="48">48 小时 (2天)</option>
                  <option value="72">72 小时 (3天)</option>
                  <option value="168">168 小时 (7天)</option>
                </select>
              </div>
             <div>
               {/* 占位，使按钮排在左侧 */}
             </div>
             <div className="md:col-span-2 pt-2 flex gap-3">
               <button type="submit" className="technical-button-primary w-full md:w-auto">
                 {editingLinkId ? '保存修改' : '生成链接'}
               </button>
               <button type="button" className="technical-button-outline w-full md:w-auto border-zinc-700 text-zinc-400 hover:bg-zinc-800/40" onClick={handleCancel}>
                 取消
               </button>
             </div>
          </form>
        </div>
      )}

      <div className="technical-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-zinc-900 border-b border-technical-border font-display text-[10px] uppercase tracking-widest text-technical-muted">
                <th className="px-6 py-4 text-left font-bold">名称</th>
                <th className="px-6 py-4 text-left font-bold">目标分组</th>
                <th className="px-6 py-4 text-left font-bold">订阅源 / 模板</th>
                <th className="px-6 py-4 text-left font-bold">过期时间</th>
                <th className="px-6 py-4 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-technical-border/50">
              {links.map((link) => {
                const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
                const groupName = groups.find(g => g.id === link.subscriptionGroupId)?.title || '未知组';
                const tplName = templates.find(t => t.id === link.templateId)?.name || '未知模板';

                return (
                  <tr key={link.id} className={`hover:bg-white/2 transition-colors ${isExpired ? 'opacity-50 grayscale' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {!isExpired 
                          ? <BadgeCheck size={16} className="text-technical-cyan" /> 
                          : <XCircle size={16} className="text-red-500" />}
                        <span className="text-sm font-medium text-gray-200">{link.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-technical-muted">{link.group}</td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-400">
                      <div>{groupName}</div>
                      <div className="text-[10px] text-technical-muted">+{tplName}</div>
                      <div className="text-[10px] text-technical-cyan/70 mt-1 flex items-center gap-1">
                        <Clock size={10} />
                        <span>更新间隔: {formatInterval(link.proxyUpdateInterval)}</span>
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-xs font-mono ${isExpired ? 'text-red-500' : 'text-technical-muted'}`}>
                      {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : '永不'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="technical-button-outline py-1 px-3 h-8 gap-2 inline-flex" onClick={() => handleCopy(link.token)} disabled={!!isExpired}>
                          <Copy size={12} />
                          <span className="hidden sm:inline">复制</span>
                        </button>
                        <button 
                          className="technical-button-outline border-technical-muted/30 text-technical-muted hover:text-white py-1 px-2 h-8 gap-1 inline-flex" 
                          onClick={() => handleEdit(link)}
                          title="修改/修正链接"
                        >
                          <Settings2 size={12} />
                          <span className="hidden sm:inline">修正</span>
                        </button>
                        <button className="text-red-500/50 hover:text-red-500 p-2" onClick={() => handleDelete(link.id)} title="删除链接">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {links.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-technical-muted text-sm border-none">暂无生成链接</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-6 bg-black/40 text-center">
           <p className="text-[10px] font-mono text-technical-muted opacity-30 uppercase tracking-[0.3em]">-- End of Data --</p>
        </div>
      </div>
    </div>
  );
}

function PasskeyAdminView() {
  const [keys, setKeys] = useState<api.PasskeyItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [registering, setRegistering] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try { setKeys(await api.getPasskeyList()); }
    catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async () => {
    setRegistering(true);
    setMsg('');
    try {
      const name = await api.registerPasskey();
      setMsg(`✅ 注册成功：${name}`);
      load();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定移除此 Passkey？')) return;
    try {
      await api.deletePasskey(id);
      load();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-technical-border pb-6 gap-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Passkey 管理</h2>
          <p className="text-sm text-technical-muted mt-1">管理 WebAuthn 无密码登录设备。</p>
        </div>
        <button
          onClick={handleRegister}
          disabled={registering}
          className="technical-button-primary gap-3 disabled:opacity-50"
        >
          <KeyRound size={16} />
          <span>{registering ? '注册中...' : '注册新 Passkey'}</span>
        </button>
      </div>

      {msg && (
        <div className={`text-sm font-mono px-4 py-3 border rounded-sm ${msg.startsWith('✅') ? 'text-green-400 border-green-900 bg-green-900/10' : 'text-red-400 border-red-900 bg-red-900/10'}`}>
          {msg}
        </div>
      )}

      <div className="technical-card">
        {loading ? (
          <div className="p-10 text-center text-technical-muted font-mono text-sm">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center text-technical-muted text-sm">
            <KeyRound size={32} className="mx-auto mb-4 opacity-20" />
            <p>尚未注册任何 Passkey</p>
            <p className="text-xs mt-1 opacity-60">点击右上角按钮，使用当前设备（指纹/面容/安全密钥）注册</p>
          </div>
        ) : (
          <ul className="divide-y divide-technical-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/2 group">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-zinc-900 border border-technical-border rounded flex items-center justify-center text-technical-cyan group-hover:border-technical-cyan/50 transition-all">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-200">{k.name}</div>
                    <div className="text-[10px] font-mono text-technical-muted mt-0.5">
                      注册于 {new Date(k.createdAt).toLocaleString('zh-CN')}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-700 mt-0.5 truncate max-w-xs">{k.id}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(k.id)}
                  className="p-2 text-technical-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="移除此 Passkey"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="technical-card p-6 space-y-3 text-xs font-mono text-technical-muted">
        <div className="text-[10px] uppercase tracking-widest text-white font-display font-bold mb-3">使用说明</div>
        <div className="flex gap-3"><span className="text-technical-cyan">01.</span><span>首次使用密码登录后，在此页面点击「注册新 Passkey」</span></div>
        <div className="flex gap-3"><span className="text-technical-cyan">02.</span><span>浏览器将弹出系统对话框，选择指纹、面容 ID 或安全密钥</span></div>
        <div className="flex gap-3"><span className="text-technical-cyan">03.</span><span>注册完成后，下次登录时会优先显示 Passkey 按钮，无需输入密码</span></div>
      </div>
    </div>
  );
}
