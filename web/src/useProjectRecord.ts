import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useRevalidator } from 'react-router';
import { ApiError, fetchProject, type Project } from './api';
import { useIdentity } from './identity';

export type ProjectRecordState =
  | { kind: 'loading' }
  | { kind: 'ready'; project: Project }
  | { kind: 'denied'; message: string }
  | { kind: 'missing'; message: string }
  | { kind: 'failed'; message: string };

/**
 * 加载单条项目记录。
 *
 * 401 表示会话在页面停留期间失效：先重新向服务端确认身份，再带着当前地址回登录页；
 * 403（无权限或越出数据范围）、404（记录不存在）与其它失败只产出状态，由页面决定怎么展示。
 * enabled 为 false 时不发请求，编辑页在缺少编辑权限时用它跳过取数。
 */
export function useProjectRecord(projectId: string, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const identity = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const { revalidate } = useRevalidator();

  const [state, setState] = useState<ProjectRecordState>({ kind: 'loading' });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ kind: 'loading' });

      try {
        const project = await fetchProject(projectId, signal);
        if (signal?.aborted) return;
        setState({ kind: 'ready', project });
      } catch (error) {
        if (signal?.aborted) return;

        if (error instanceof ApiError && error.status === 401) {
          await revalidate();
          navigate('/login', { replace: true, state: { from: location.pathname } });
          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          setState({ kind: 'denied', message: error.message });
          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'missing', message: error.message });
          return;
        }

        setState({
          kind: 'failed',
          message: error instanceof Error ? error.message : '项目详情加载失败',
        });
      }
    },
    [projectId, location.pathname, navigate, revalidate],
  );

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    // 依赖当前用户 ID：账号切换后会重新取数，不会保留上一个账号看到的记录。
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load, identity?.user.id]);

  const reload = useCallback(() => void load(), [load]);

  return { state, reload };
}
