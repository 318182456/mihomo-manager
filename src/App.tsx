import { useEffect, useState } from 'react';
import { Menu, X, LogOut, Network } from 'lucide-react';
import * as api from './api';
import { NAV_ITEMS, findNav, parseHash } from './navigation';
import type { ViewId } from './navigation';
import { ToastProvider } from './ui/Toast';
import { DialogProvider, useDialog } from './ui/Dialog';
import { IconButton } from './ui/Button';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { SourcesView } from './views/SourcesView';
import { SubscriptionsView } from './views/SubscriptionsView';
import { TemplatesView } from './views/TemplatesView';
import { LinksView } from './views/LinksView';
import { PasskeysView } from './views/PasskeysView';
import { AiView } from './views/AiView';

export default function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <Root />
      </DialogProvider>
    </ToastProvider>
  );
}

function Root() {
  const [authed, setAuthed] = useState(() => !!api.getToken());

  if (!authed) return <LoginView onLogin={() => setAuthed(true)} />;
  return <Shell onLogout={() => setAuthed(false)} />;
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<ViewId>(() => parseHash(window.location.hash));
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useDialog();

  // 用 hash 做路由，刷新后停留在原页面，浏览器前进/后退也可用
  useEffect(() => {
    const onHashChange = () => setView(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.location.hash = '#/dashboard';
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 移动端导航抽屉：Esc 关闭，并锁住背景滚动
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // 视口变宽到桌面断点时，关掉可能残留的移动端抽屉
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => mq.matches && setMenuOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const navigate = (id: ViewId) => {
    window.location.hash = `#/${id}`;
    setView(id);
    setMenuOpen(false);
  };

  const handleLogout = async () => {
    const ok = await dialog.confirm({
      title: '退出登录？',
      description: '下次访问需要重新使用密码或 Passkey 登录。',
      confirmLabel: '退出',
    });
    if (!ok) return;
    api.clearToken();
    onLogout();
  };

  const renderView = () => {
    switch (view) {
      case 'dashboard':     return <DashboardView onNavigate={navigate} />;
      case 'sources':       return <SourcesView />;
      case 'subscriptions': return <SubscriptionsView />;
      case 'templates':     return <TemplatesView />;
      case 'links':         return <LinksView />;
      case 'ai':            return <AiView />;
      case 'passkeys':      return <PasskeysView />;
    }
  };

  // 模板页自己管理内部滚动，其余页面由外层容器滚动
  const fullBleed = view === 'templates';

  return (
    <div className="flex h-full bg-canvas">
      <SideNav current={view} onNavigate={navigate} onLogout={handleLogout} />

      {/* 移动端抽屉导航 */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] md:hidden animate-slide-in-left">
            <SideNav current={view} onNavigate={navigate} onLogout={handleLogout} mobile
                     onClose={() => setMenuOpen(false)} />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="shrink-0 flex items-center gap-2 px-3 border-b border-line
                           bg-surface md:hidden pt-[env(safe-area-inset-top)]
                           h-[calc(3.5rem+env(safe-area-inset-top))]">
          <IconButton label="打开菜单" icon={<Menu size={19} />} onClick={() => setMenuOpen(true)} />
          <span className="text-sm font-medium text-fg truncate">{findNav(view)?.label}</span>
        </header>

        <main className={`flex-1 min-h-0 ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {renderView()}
        </main>
      </div>
    </div>
  );
}

function SideNav({
  current,
  onNavigate,
  onLogout,
  mobile,
  onClose,
}: {
  current: ViewId;
  onNavigate: (id: ViewId) => void;
  onLogout: () => void;
  mobile?: boolean;
  onClose?: () => void;
}) {
  // 按 section 分组，同组只在首项前显示标题
  const sections: { title: string; items: typeof NAV_ITEMS }[] = [];
  for (const item of NAV_ITEMS) {
    const last = sections[sections.length - 1];
    if (last && last.title === item.section) last.items.push(item);
    else sections.push({ title: item.section, items: [item] });
  }

  return (
    <nav className={`w-60 shrink-0 flex flex-col bg-surface border-r border-line h-full
                     ${mobile ? '' : 'hidden md:flex'}`}>
      <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 shrink-0 rounded-md bg-accent-soft border border-accent/25
                          flex items-center justify-center">
            <Network size={15} className="text-accent" />
          </div>
          <span className="text-sm font-semibold text-fg truncate">Mihomo</span>
        </div>
        {mobile && <IconButton label="关闭菜单" icon={<X size={17} />} onClick={onClose} />}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {sections.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-fg-subtle uppercase tracking-wide">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = current === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-control)]
                                text-sm transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent font-medium'
                        : 'text-fg-muted hover:text-fg hover:bg-raised'
                    }`}
                  >
                    <item.icon size={16} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 p-2 border-t border-line">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-control)]
                     text-sm text-fg-muted hover:text-danger hover:bg-raised transition-colors"
        >
          <LogOut size={16} className="shrink-0" />
          退出登录
        </button>
      </div>
    </nav>
  );
}
