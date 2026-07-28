import { useState } from 'react';
import { Search, Ban, CircleCheck, Loader2 } from 'lucide-react';
import type * as api from '../../api';
import { useGfwStatus } from '../../hooks/useGfwStatus';
import type { HostStatus } from '../../hooks/useGfwStatus';
import { StatusDot } from '../../ui/Layout';
import { useToast } from '../../ui/Toast';

function toneOf(s: HostStatus | undefined) {
  if (!s) return 'neutral' as const;
  if (s.checking) return 'accent' as const;
  if (s.blocked === true) return 'danger' as const;
  if (s.blocked === false) return 'success' as const;
  return 'neutral' as const;
}

/**
 * 节点列表，带被墙状态指示。
 * 状态由父级一次批量拉取（useGfwStatus），单个节点的真实探测按需触发。
 */
export function ProxyNodeList({
  nodes,
  match,
}: {
  nodes: api.ProxyNode[];
  /** 筛选表达式的匹配函数，未命中的节点显示为灰色 */
  match: (name: string) => boolean;
}) {
  const hosts = nodes.map(n => n.server).filter(Boolean);
  const { statuses, loading, check, mark } = useGfwStatus(hosts);
  const [openHost, setOpenHost] = useState<string | null>(null);
  const toast = useToast();

  const matched = nodes.filter(n => match(n.name));

  const runCheck = async (host: string) => {
    setOpenHost(null);
    try {
      const blocked = await check(host);
      toast[blocked ? 'warning' : 'success'](
        `${host} ${blocked ? '被墙' : '正常'}`
      );
    } catch (e) {
      toast.error('检测失败', e instanceof Error ? e.message : undefined);
    }
  };

  const runMark = async (host: string, blocked: boolean) => {
    setOpenHost(null);
    try {
      await mark(host, blocked);
      toast.success(`已标记 ${host} 为${blocked ? '被墙' : '正常'}`);
    } catch (e) {
      toast.error('标记失败', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="border border-line rounded-[var(--radius-control)] bg-canvas overflow-hidden">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between gap-3 text-xs">
        <span className="text-fg-muted">
          共 <span className="text-fg tabular-nums">{nodes.length}</span> 个节点，
          命中 <span className="text-accent tabular-nums">{matched.length}</span> 个
        </span>
        {loading && (
          <span className="flex items-center gap-1.5 text-fg-subtle">
            <Loader2 size={11} className="animate-spin" />
            读取状态
          </span>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto p-2.5">
        <div className="flex flex-wrap gap-1.5">
          {nodes.map((node, i) => {
            const isMatch = match(node.name);
            const status = statuses.get(node.server);
            const open = openHost === node.server && !!node.server;

            return (
              <div key={`${node.name}-${i}`} className="relative">
                <button
                  onClick={() => node.server && setOpenHost(open ? null : node.server)}
                  disabled={!node.server}
                  title={node.server ? `${node.name} · ${node.server}` : node.name}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs
                              border transition-colors max-w-[16rem]
                              ${isMatch
                                ? 'bg-accent-soft border-accent/25 text-accent hover:border-accent/50'
                                : 'bg-raised border-line text-fg-subtle line-through'}
                              ${node.server ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="truncate">{node.name}</span>
                  {node.server && <StatusDot tone={toneOf(status)} pulse={status?.checking} />}
                </button>

                {open && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpenHost(null)} />
                    <div className="absolute z-50 bottom-full left-0 mb-1.5 w-60
                                    bg-overlay border border-line-strong rounded-[var(--radius-card)]
                                    shadow-xl shadow-black/40 p-1.5 animate-fade-in">
                      <div className="px-2 py-1.5 border-b border-line mb-1">
                        <p className="text-xs font-mono text-fg truncate">{node.server}</p>
                        {status?.ip && status.ip !== node.server && (
                          <p className="text-xs font-mono text-fg-subtle truncate mt-0.5">
                            → {status.ip}
                          </p>
                        )}
                        {status?.updatedAt && (
                          <p className="text-xs text-fg-subtle mt-0.5">
                            更新于 {new Date(status.updatedAt).toLocaleString('zh-CN')}
                          </p>
                        )}
                      </div>
                      <PopoverAction icon={<Search size={13} />} onClick={() => runCheck(node.server)}>
                        检测被墙状态
                      </PopoverAction>
                      <PopoverAction icon={<Ban size={13} />} tone="danger"
                                     onClick={() => runMark(node.server, true)}>
                        标记为被墙
                      </PopoverAction>
                      <PopoverAction icon={<CircleCheck size={13} />} tone="success"
                                     onClick={() => runMark(node.server, false)}>
                        标记为正常
                      </PopoverAction>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PopoverAction({
  icon,
  children,
  onClick,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'neutral' | 'danger' | 'success';
}) {
  const color = {
    neutral: 'text-fg-muted hover:text-fg',
    danger: 'text-danger/80 hover:text-danger',
    success: 'text-success/80 hover:text-success',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px]
                  hover:bg-raised transition-colors text-left ${color}`}
    >
      {icon}
      {children}
    </button>
  );
}
