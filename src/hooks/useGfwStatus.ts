import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';

export interface HostStatus {
  blocked: api.GfwState;
  ip?: string;
  updatedAt?: number;
  /** 正在跑真实探测 */
  checking?: boolean;
}

/**
 * 集中管理一批主机的被墙状态。
 *
 * 原实现给每个节点徽章挂一个 useEffect 各发一次请求，
 * 几十个节点就是几十个并发请求。这里改为：
 *   - 挂载/主机列表变化时，一次批量请求拉取全部缓存状态；
 *   - 真实探测（耗时数秒）仅在用户显式点击时对单个主机触发。
 */
export function useGfwStatus(hosts: string[]) {
  const [statuses, setStatuses] = useState<Map<string, HostStatus>>(new Map());
  const [loading, setLoading] = useState(false);

  // 以内容为准判断是否需要重新拉取，避免每次渲染新建数组导致的重复请求
  const key = hosts.filter(Boolean).sort().join(',');
  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;

  useEffect(() => {
    const list = [...new Set(hostsRef.current.filter(Boolean))];
    if (list.length === 0) {
      setStatuses(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);

    api.batchGfwStatus(list)
      .then(results => {
        if (cancelled) return;
        const next = new Map<string, HostStatus>();
        for (const [host, r] of results) {
          next.set(host, { blocked: r.blocked, ip: r.ip, updatedAt: r.updatedAt });
        }
        setStatuses(next);
      })
      .catch(() => {
        // 批量预取失败不阻塞界面：状态保持「未检测」，用户仍可手动探测
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [key]);

  const patch = useCallback((host: string, value: Partial<HostStatus>) => {
    setStatuses(prev => {
      const next = new Map(prev);
      next.set(host, { ...(next.get(host) ?? { blocked: null }), ...value });
      return next;
    });
  }, []);

  /** 触发真实探测（Globalping，数秒） */
  const check = useCallback(async (host: string) => {
    patch(host, { checking: true });
    try {
      const res = await api.runGfwCheck(host);
      patch(host, { blocked: res.blocked, ip: res.ip, updatedAt: Date.now(), checking: false });
      return res.blocked;
    } catch (e) {
      patch(host, { checking: false });
      throw e;
    }
  }, [patch]);

  /** 人工标记状态 */
  const mark = useCallback(async (host: string, blocked: boolean) => {
    patch(host, { checking: true });
    try {
      const res = await api.updateGfwStatus(host, blocked);
      patch(host, { blocked, ip: res.ip, updatedAt: Date.now(), checking: false });
    } catch (e) {
      patch(host, { checking: false });
      throw e;
    }
  }, [patch]);

  return { statuses, loading, check, mark };
}
