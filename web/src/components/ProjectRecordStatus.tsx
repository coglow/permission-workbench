import { Alert, Button, Spin, Typography } from 'antd';
import type { ProjectRecordState } from '../useProjectRecord';

/**
 * 只在 state 为 loading 或 failed 时使用；ready 由页面自己渲染，
 * denied 与 missing 由页面渲染统一的 403／404 页面。
 */
export function ProjectRecordStatus({
  state,
  onRetry,
}: {
  state: ProjectRecordState;
  onRetry: () => void;
}) {
  if (state.kind === 'failed') {
    return (
      <Alert
        type="error"
        showIcon
        title={state.message}
        action={
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div className="detail-loading">
      <Spin />
      <Typography.Text type="secondary">正在加载项目详情……</Typography.Text>
    </div>
  );
}
