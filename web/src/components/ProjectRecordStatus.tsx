import { RequestError } from './RequestError';
import { Spin, Typography } from 'antd';
import type { ResourceState } from '../useResource';

/**
 * 只在 state 为 loading 或 failed 时使用；ready 由页面自己渲染，
 * denied 与 missing 由页面渲染统一的 403／404 页面。
 */
export function ProjectRecordStatus<T>({
  state,
  onRetry,
}: {
  state: ResourceState<T>;
  onRetry: () => void;
}) {
  if (state.kind === 'failed') {
    return <RequestError message={state.message} onRetry={onRetry} />;
  }

  return (
    <div className="detail-loading">
      <Spin />
      <Typography.Text type="secondary">正在加载项目详情……</Typography.Text>
    </div>
  );
}
