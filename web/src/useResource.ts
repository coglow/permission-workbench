import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useRevalidator } from 'react-router';
import { ApiError } from './api';
import { useIdentity } from './identity';

export type ResourceState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'denied'; message: string }
  | { kind: 'missing'; message: string }
  | { kind: 'failed'; message: string };

/** 读写请求共用会话失效处理，并保留重新登录后的返回地址。 */
export function useSessionExpiryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { revalidate } = useRevalidator();
  return useCallback(async () => {
    await revalidate();
    navigate('/login', { replace: true, state: { from: location.pathname } });
  }, [location.pathname, navigate, revalidate]);
}

/** load 使用模块级函数或 useCallback；自动取数和手动刷新共用一个可取消请求。 */
export function useResource<T>(
  load: (signal?: AbortSignal) => Promise<T>,
  options: { failureMessage: string; enabled?: boolean },
) {
  const enabled = options.enabled ?? true;
  const identity = useIdentity();
  const redirectOnExpiry = useSessionExpiryRedirect();
  // 相同授权的新对象不会触发重取；用户、团队或有效授权变化则立即隔离旧数据。
  const accessKey = JSON.stringify([
    identity?.user.id,
    identity?.user.team.id,
    identity?.permissions.map((permission) => [permission.code, permission.dataScope]),
  ]);
  const controller = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    load: typeof load;
    accessKey: string;
    state: ResourceState<T>;
  }>();

  const reload = useCallback(async () => {
    controller.current?.abort();
    if (!enabled) return;
    const current = new AbortController();
    controller.current = current;
    const update = (state: ResourceState<T>) => setResult({ load, accessKey, state });
    update({ kind: 'loading' });
    try {
      const data = await load(current.signal);
      if (!current.signal.aborted) update({ kind: 'ready', data });
    } catch (error) {
      if (current.signal.aborted) return;
      if (error instanceof ApiError) {
        if (error.status === 401) {
          await redirectOnExpiry();
          return;
        }
        if (error.status === 403) {
          update({ kind: 'denied', message: error.message });
          return;
        }
        if (error.status === 404) {
          update({ kind: 'missing', message: error.message });
          return;
        }
      }
      update({
        kind: 'failed',
        message: error instanceof Error ? error.message : options.failureMessage,
      });
    }
  }, [accessKey, enabled, load, options.failureMessage, redirectOnExpiry]);

  useEffect(() => {
    void reload();
    return () => controller.current?.abort();
  }, [reload]);

  // 权限或记录变化的本次渲染就移除旧内容，无需等 effect 才进入加载态。
  const state: ResourceState<T> =
    enabled && result?.load === load && result.accessKey === accessKey
      ? result.state
      : { kind: 'loading' };
  return { state, reload };
}
