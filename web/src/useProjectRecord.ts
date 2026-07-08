import { useCallback } from 'react';
import { fetchProject } from './api';
import { useResource } from './useResource';

/**
 * 加载单条项目记录。
 *
 * 错误分流与列表页共用同一套口径（见 useResource）：403（无权限或越出数据范围）
 * 与 404（记录不存在）各成一档，由页面分别展示。
 * enabled 为 false 时不发请求，编辑页在缺少编辑权限时用它跳过取数。
 */
export function useProjectRecord(projectId: string, options: { enabled?: boolean } = {}) {
  const load = useCallback((signal?: AbortSignal) => fetchProject(projectId, signal), [projectId]);

  return useResource(load, {
    failureMessage: '项目详情加载失败',
    enabled: options.enabled,
  });
}
