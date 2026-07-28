import { useEffect, useState } from 'react';
import { Rss, FileCode2, Link2, Database, ArrowRight } from 'lucide-react';
import * as api from '../api';
import { Page, PageHeader, LoadingState } from '../ui/Layout';
import type { ViewId } from '../navigation';

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [stats, setStats] = useState<api.DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDashboard()
      .then(setStats)
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'));
  }, []);

  if (error) {
    return (
      <Page>
        <PageHeader title="概览" />
        <div className="card p-6 text-sm text-danger">加载统计数据失败：{error}</div>
      </Page>
    );
  }

  if (!stats) {
    return (
      <Page>
        <PageHeader title="概览" />
        <LoadingState />
      </Page>
    );
  }

  const metrics = [
    {
      label: '订阅组',
      value: stats.activeSubscriptions,
      total: stats.totalSubscriptions,
      unit: '个启用',
      icon: Rss,
      target: 'subscriptions' as ViewId,
    },
    {
      label: '模板',
      value: stats.templateCount,
      unit: '个',
      icon: FileCode2,
      target: 'templates' as ViewId,
    },
    {
      label: '订阅链接',
      value: stats.activeLinks,
      total: stats.totalLinks,
      unit: '个有效',
      icon: Link2,
      target: 'links' as ViewId,
    },
    {
      label: 'KV 占用',
      value: stats.kvUsageKB,
      unit: 'KB',
      icon: Database,
    },
  ];

  return (
    <Page>
      <PageHeader title="概览" description="订阅、模板与链接的整体状态。" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => {
          const clickable = !!m.target;
          const pct = m.total && m.total > 0 ? (m.value / m.total) * 100 : null;

          const body = (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-fg-muted">{m.label}</span>
                <m.icon size={16} className="text-fg-subtle" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-fg tabular-nums">{m.value}</span>
                {m.total !== undefined && (
                  <span className="text-sm text-fg-subtle tabular-nums">/ {m.total}</span>
                )}
                <span className="text-xs text-fg-subtle ml-0.5">{m.unit}</span>
              </div>
              {/* 无占比的卡片留等高空白，保证一行卡片的「查看」链接对齐 */}
              <div className="mt-3 h-1">
                {pct !== null && (
                  <div className="h-full bg-canvas rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
              {clickable && (
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-fg-subtle
                                 group-hover:text-accent transition-colors">
                  查看 <ArrowRight size={11} />
                </span>
              )}
            </>
          );

          return clickable ? (
            <button
              key={m.label}
              onClick={() => onNavigate(m.target!)}
              className="card p-5 text-left group hover:border-line-strong transition-colors"
            >
              {body}
            </button>
          ) : (
            <div key={m.label} className="card p-5">{body}</div>
          );
        })}
      </div>
    </Page>
  );
}
