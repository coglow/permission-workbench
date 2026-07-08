import { useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { useSessionExpiryRedirect } from './useResource';

/** 只管理写请求状态与错误；成功后的导航、刷新和表单关闭由业务页面决定。 */
export function useMutation(failureMessage = '操作失败') {
  const redirectOnExpiry = useSessionExpiryRedirect();
  const active = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (active.current) return false;
    active.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      // 已离开页面或切换账号后，不执行旧请求的导航、弹窗关闭等后续操作。
      return mounted.current;
    } catch (reason) {
      if (!mounted.current) return false;
      if (reason instanceof ApiError && reason.status === 401) {
        await redirectOnExpiry();
      } else {
        setError(reason instanceof Error ? reason.message : failureMessage);
      }
      return false;
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return { run, pending, error, clearError: () => setError(null) };
}
