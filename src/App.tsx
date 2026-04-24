import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Rss, 
  Code, 
  Link as LinkIcon, 
  Lock, 
  Search, 
  Wifi, 
  Settings, 
  Plus, 
  Save, 
  Zap, 
  Trash2, 
  Copy, 
  Folder, 
  File, 
  Activity, 
  Menu,
  ChevronRight,
  Database,
  Terminal,
  Play,
  Share2,
  CheckCircle2,
  XCircle,
  GripVertical,
  Filter,
  BadgeCheck,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ViewType = 'dashboard' | 'subscriptions' | 'templates' | 'generated' | 'admin';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auto-login for dev preview if requested, but let's stick to real flow
  // useEffect(() => { setIsLoggedIn(true); }, []);

  if (!isLoggedIn) {
    return <LoginView onLogin={() => setIsLoggedIn(true)} />;
  }

  const navigation = [
    { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
    { id: 'subscriptions', label: '订阅', icon: Rss },
    { id: 'templates', label: '模板', icon: Code },
    { id: 'generated', label: '已生成', icon: LinkIcon },
    { id: 'admin', label: '管理员', icon: Lock },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />;
      case 'subscriptions': return <SubscriptionsView />;
      case 'templates': return <TemplatesView />;
      case 'generated': return <GeneratedLinksView />;
      case 'admin': return <div className="p-8 text-technical-muted font-mono">Admin Panel - Access Restricted</div>;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-technical-bg text-gray-200">
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
          <button className="technical-button-primary w-full py-2">
            <Plus size={16} />
            <span>新建配置</span>
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
            <div className="relative group hidden sm:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-technical-muted" />
              <input 
                type="text" 
                placeholder="搜索资源..." 
                className="bg-zinc-900 border border-technical-border rounded-sm py-1.5 pl-9 pr-4 text-xs font-mono focus:outline-none focus:border-technical-cyan/50 w-48 lg:w-64 transition-all"
              />
            </div>
            
            <div className="flex items-center gap-2 pr-4 border-r border-technical-border">
              <button className="p-2 text-technical-muted hover:text-technical-cyan transition-colors">
                <Wifi size={18} />
              </button>
              <button className="p-2 text-technical-muted hover:text-technical-cyan transition-colors">
                <Settings size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3 pl-2">
              <div className="w-8 h-8 rounded-full border border-technical-border bg-zinc-800 p-0.5 overflow-hidden">
                 <img 
                  src="https://api.dicebear.com/7.x/pixel-art/svg?seed=Felix" 
                  alt="Avatar" 
                  className="w-full h-full rounded-full grayscale hover:grayscale-0 transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-technical-bg">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
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
            <div className="w-14 h-14 bg-zinc-900 border border-technical-border rounded-sm flex items-center justify-center group shadow-[0_0_20px_rgba(0,240,255,0.05)]">
              <Terminal className="text-technical-cyan w-7 h-7 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          
          <div className="text-center mb-10">
            <h1 className="font-display font-black text-2xl tracking-tight text-white mb-1">MIHOMO_CORE</h1>
            <p className="font-mono text-[10px] text-technical-muted tracking-widest uppercase opacity-70 flex items-center justify-center gap-2">
              <span className="w-1 h-1 bg-technical-cyan animate-pulse rounded-full" />
              Secure Access Portal // v1.4.2
            </p>
          </div>

          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
            <div className="space-y-2">
              <label className="block text-[10px] font-display font-bold uppercase tracking-widest text-technical-muted px-1">系统 ID</label>
              <div className="relative">
                <input 
                  type="text" 
                  defaultValue="Admin_777"
                  className="w-full technical-input bg-black/60 py-2.5 rounded-none"
                  placeholder="Enter System ID"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-display font-bold uppercase tracking-widest text-technical-muted px-1">访问令牌</label>
              <div className="relative">
                <input 
                  type="password" 
                  defaultValue="password123"
                  className="w-full technical-input bg-black/60 py-2.5 rounded-none tracking-widest"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px]">
               <label className="flex items-center gap-2 cursor-pointer group text-technical-muted hover:text-gray-300 transition-colors">
                  <div className="w-3.5 h-3.5 border border-technical-border rounded-sm flex items-center justify-center p-0.5 group-hover:border-technical-cyan transition-colors">
                    <div className="w-full h-full bg-technical-cyan rounded-xs opacity-0 group-hover:opacity-20 translate-y-0.5 peer-checked:opacity-100" />
                  </div>
                  <span>保持登录</span>
               </label>
               <a href="#" className="text-technical-cyan/60 hover:text-technical-cyan transition-colors">恢复访问</a>
            </div>

            <button type="submit" className="technical-button-primary w-full py-3 mt-4">
              <span>授权连接</span>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-technical-border text-center">
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

function DashboardView() {
  const metrics = [
    { label: '活动订阅', value: '12', change: '+2', icon: Rss, color: 'text-technical-cyan' },
    { label: '稳定配置', value: '8', change: 'Ver 2.1', icon: Code, color: 'text-gray-400' },
    { label: 'KV 占用', value: '45', total: '100', icon: Database, color: 'text-technical-cyan' },
  ];

  const activities = [
    { type: 'edit', title: "模板 'Proxy_Global' 已更新", id: 'tmp_8f92a1', user: '管理员', time: '10分钟前', icon: Code },
    { type: 'add', title: "新订阅 'US_Nodes' 已添加", id: 'sub_c44b9', user: '系统', time: '1小时前', icon: Plus },
    { type: 'sync', title: "订阅 'EU_Nodes' 已同步", id: 'sub_a11f2', user: '系统', time: '3小时前', icon: Wifi },
  ];

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((m, i) => (
          <div key={i} className="technical-card p-6 group hover:border-technical-cyan/30">
            <div className="flex justify-between items-start mb-6">
              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-technical-muted">{m.label}</span>
              <m.icon size={18} className="text-technical-border group-hover:text-technical-cyan transition-colors" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-display font-bold text-white">{m.value}</span>
              {m.total && <span className="text-lg text-technical-muted">/{m.total}</span>}
              {m.change && <span className={`text-[10px] font-mono ${m.change.includes('+') ? 'text-green-500' : 'text-technical-muted'}`}>{m.change}</span>}
            </div>
            {m.total && (
              <div className="mt-4 w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(Number(m.value) / Number(m.total)) * 100}%` }}
                  className="h-full bg-technical-cyan rounded-full glow-cyan shadow-[0_0_8px_rgba(0,240,255,0.5)]"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 technical-card flex flex-col">
          <div className="p-4 bg-zinc-900 border-b border-technical-border flex justify-between items-center">
            <h3 className="text-[10px] font-display font-bold uppercase tracking-widest text-white">最近活动</h3>
            <button className="text-[10px] font-mono text-technical-cyan hover:underline">查看全部</button>
          </div>
          <div className="divide-y divide-technical-border">
            {activities.map((a, i) => (
              <div key={i} className="p-4 flex items-center justify-between hover:bg-zinc-900/50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-zinc-900 border border-technical-border rounded flex items-center justify-center text-technical-muted group-hover:border-technical-cyan/50 group-hover:text-technical-cyan transition-all">
                    <a.icon size={16} />
                  </div>
                  <div>
                    <div className="text-sm text-gray-200">{a.title}</div>
                    <div className="text-[10px] font-mono text-technical-muted mt-0.5 uppercase">ID: {a.id} • 由 {a.user}</div>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-technical-muted opacity-50">{a.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="technical-card p-6 h-full">
            <h3 className="text-[10px] font-display font-bold uppercase tracking-widest text-white mb-6">快速操作</h3>
            <div className="space-y-4">
              <button className="w-full technical-button-outline justify-between group">
                <div className="flex items-center gap-3">
                  <Rss size={16} className="group-hover:text-technical-cyan" />
                  <span>添加新订阅</span>
                </div>
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>
              <button className="w-full technical-button-outline justify-between group">
                <div className="flex items-center gap-3">
                  <Code size={16} className="group-hover:text-technical-cyan" />
                  <span>新建模板</span>
                </div>
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>
              <div className="pt-2">
                <button className="w-full technical-button-outline border-red-900/30 text-red-500/70 hover:border-red-500 hover:text-red-500 group justify-start">
                  <Trash2 size={16} />
                  <span>清除所有缓存</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubscriptionsView() {
  const groups = [
    {
      title: '高级中继 (US/EU)',
      urlCount: 3,
      enabled: true,
      filter: '(HK|SG)',
      urls: [
        'https://api.example-vpn.com/sub?token=abc123xyz&format=clash',
        'https://sub.backup-node.net/v1/get?user=admin&pass=secret'
      ]
    },
    {
      title: '免费节点备用',
      urlCount: 1,
      enabled: false,
      filter: '^(?!.*(过期|失效)).*$',
      urls: [
        'https://raw.githubusercontent.com/example/free-nodes/main/clash.yaml'
      ]
    }
  ];

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-technical-border pb-6 gap-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">订阅源</h2>
          <p className="text-sm text-technical-muted mt-1">管理外部代理列表和配置上游 URL。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="technical-button-outline">
            <Plus size={14} />
            <span>添加组</span>
          </button>
          <button className="technical-button-outline">
            <Wifi size={14} />
            <span>测试连接</span>
          </button>
          <button className="technical-button-primary">
            <Save size={14} />
            <span>保存更改</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {groups.map((group, idx) => (
          <section key={idx} className={`technical-card flex flex-col ${!group.enabled ? 'opacity-60 grayscale' : ''}`}>
             <div className="bg-zinc-900 px-4 py-3 flex justify-between items-center border-b border-technical-border">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Folder size={18} className="text-technical-muted shrink-0" />
                  <input 
                    className="bg-transparent border-none text-gray-200 font-display font-bold p-0 focus:ring-0 outline-none w-full"
                    type="text" 
                    defaultValue={group.title}
                  />
                </div>
                <div className="flex items-center gap-6 shrink-0 ml-4">
                  <div className="font-mono text-[10px] text-technical-muted bg-black border border-technical-border px-2 py-1 rounded">
                    {group.urlCount} 个 URL
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={group.enabled} readOnly className="sr-only peer" />
                    <div className="w-8 h-4.5 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-gray-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-technical-cyan/40 peer-checked:after:bg-technical-cyan" />
                  </label>
                </div>
             </div>

             <div className="px-4 py-4 border-b border-technical-border/50 flex items-center gap-4">
                <div className="flex items-center gap-2 text-technical-muted font-display text-[10px] uppercase tracking-widest whitespace-nowrap shrink-0">
                  <Filter size={14} />
                  <span>筛选正则:</span>
                </div>
                <input 
                  type="text" 
                  defaultValue={group.filter}
                  className="flex-1 bg-black/40 border border-technical-border rounded-sm px-3 py-1 font-mono text-xs text-technical-cyan focus:outline-none focus:border-technical-cyan/30 transition-all"
                />
             </div>

             <div className="flex flex-col bg-black/20">
                {group.urls.map((url, i) => (
                  <div key={i} className="group flex items-center gap-3 px-4 py-3 border-b border-technical-border/30 last:border-0 hover:bg-white/5 transition-colors">
                    <GripVertical size={16} className="text-zinc-800 cursor-grab group-hover:text-zinc-600" />
                    <input 
                      type="text" 
                      defaultValue={url}
                      className="flex-1 bg-transparent border-none p-0 font-mono text-xs text-gray-400 focus:ring-0 outline-none truncate"
                    />
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 text-technical-muted hover:text-technical-cyan transition-colors"><Zap size={14} /></button>
                      <button className="p-1.5 text-technical-muted hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                
                <div className="p-4">
                  <button className="flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-widest text-technical-cyan/70 hover:text-technical-cyan transition-colors bg-technical-cyan/5 px-3 py-1.5 rounded-sm w-fit">
                    <Plus size={14} />
                    <span>添加源 URL</span>
                  </button>
                </div>
             </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TemplatesView() {
  return (
    <div className="flex h-full w-full bg-technical-bg font-sans">
      <aside className="w-72 border-r border-technical-border flex flex-col hidden lg:flex bg-black">
        <div className="p-4 border-b border-technical-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-widest text-white">
            <Folder size={14} className="text-technical-cyan" />
            <span>模板文件</span>
          </div>
          <button className="text-technical-muted hover:text-technical-cyan"><Plus size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 font-medium">
              <ChevronRight size={14} className="rotate-90" />
              <span>CORE_ROUTING</span>
            </div>
            <div className="ml-4 space-y-1">
              <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-technical-muted hover:text-white rounded-sm hover:bg-zinc-900 transition-colors">
                <File size={14} />
                <span>base.yaml</span>
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-technical-cyan bg-technical-cyan/10 rounded-sm">
                <File size={14} />
                <span>proxies.yaml</span>
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-technical-muted hover:text-white rounded-sm hover:bg-zinc-900 transition-colors">
                <File size={14} />
                <span>rules.yaml</span>
              </button>
            </div>
          </div>
        </div>

        <div className="h-1/2 border-t border-technical-border flex flex-col bg-black/40">
           <div className="p-4 border-b border-technical-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-widest text-white">
              <Database size={14} className="text-technical-cyan" />
              <span>KV 变量库</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {[
               { key: 'PORT_HTTP', val: '7890' },
               { key: 'MODE', val: '"rule"' },
               { key: 'LOG_LEVEL', val: '"info"' }
             ].map((kv, i) => (
                <div key={i} className="p-3 border border-technical-border rounded bg-zinc-900/50 space-y-1">
                  <div className="text-[10px] font-mono text-zinc-600 uppercase">{kv.key}</div>
                  <div className="text-xs font-mono text-technical-cyan">{kv.val}</div>
                </div>
             ))}
          </div>
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 bg-technical-surface">
        <div className="h-11 flex items-center justify-between border-b border-technical-border bg-black px-4">
          <div className="flex h-full">
            <div className="h-full px-4 flex items-center gap-2 border-r border-technical-border border-b-2 border-b-technical-cyan bg-technical-surface text-technical-cyan text-xs font-medium">
              <File size={12} />
              <span>proxies.yaml</span>
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse ml-1" />
            </div>
            <div className="h-full px-4 flex items-center gap-2 border-r border-technical-border text-technical-muted text-xs hover:text-white transition-colors cursor-pointer">
              <File size={12} />
              <span>rules.yaml</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="technical-button-outline py-1 px-3 h-8">
               <Play size={12} />
               <span>预览</span>
            </button>
             <button className="technical-button-primary py-1 px-3 h-8">
               <Share2 size={12} />
               <span>发布</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-10 bg-black/40 border-r border-technical-border flex flex-col items-center py-4 text-[10px] font-mono text-technical-muted select-none opacity-40">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="h-6 leading-6">{i + 1}</div>
            ))}
          </div>
          <div className="flex-1 p-4 overflow-auto font-mono text-sm leading-relaxed text-gray-300 whitespace-pre">
            {`# 从 KV 生成的代理配置
proxies:
  - name: "PROXY_MAIN"
    type: "ss"
    server: "{{.KV.SERVER_IP}}"
    port: {{.KV.SERVER_PORT}}
    cipher: "aes-256-gcm"
    password: "{{.KV.SERVER_PASS}}"

proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
      - "PROXY_MAIN"
      - "DIRECT"`}
          </div>
        </div>

        <div className="h-7 bg-black border-t border-technical-border flex items-center justify-between px-4 text-[10px] font-mono text-technical-muted">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-green-500" />
              <span>有效的 YAML</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle size={12} />
              <span>0 个错误</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span>行 14, 列 22</span>
            <span>UTF-8</span>
            <span className="text-technical-cyan">YAML</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function GeneratedLinksView() {
  const links = [
    { name: 'Premium-US-West', group: 'Tier-1-Gaming', expires: '2024-12-31', status: 'active' },
    { name: 'Standard-EU-All', group: 'General-Users', expires: '永不', status: 'active' },
    { name: 'Trial-Asia-Temp', group: 'Beta-Testers', expires: '2023-10-15 (已过期)', status: 'expired' },
  ];

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-technical-border pb-6 gap-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">已生成链接</h2>
          <p className="text-sm text-technical-muted mt-1">管理并分发订阅连接 URL。</p>
        </div>
        <button className="technical-button-outline border-technical-cyan/30 text-technical-cyan hover:bg-technical-cyan/5">
          <LinkIcon size={14} />
          <span>生成新链接</span>
        </button>
      </div>

      <div className="technical-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-zinc-900 border-b border-technical-border font-display text-[10px] uppercase tracking-widest text-technical-muted">
                <th className="px-6 py-4 text-left font-bold">名称</th>
                <th className="px-6 py-4 text-left font-bold">目标分组</th>
                <th className="px-6 py-4 text-left font-bold">过期时间</th>
                <th className="px-6 py-4 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-technical-border/50">
              {links.map((link, i) => (
                <tr key={i} className={`hover:bg-white/2 transition-colors ${link.status === 'expired' ? 'opacity-50 grayscale' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {link.status === 'active' 
                        ? <BadgeCheck size={16} className="text-technical-cyan" /> 
                        : <XCircle size={16} className="text-red-500" />}
                      <span className="text-sm font-medium text-gray-200">{link.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-technical-muted">{link.group}</td>
                  <td className={`px-6 py-4 text-xs font-mono ${link.status === 'expired' ? 'text-red-500' : 'text-technical-muted'}`}>
                    {link.expires}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="technical-button-outline py-1 px-3 h-8 gap-2 inline-flex" disabled={link.status === 'expired'}>
                      <Copy size={12} />
                      <span className="hidden sm:inline">复制链接</span>
                    </button>
                  </td>
                </tr>
              ))}
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
