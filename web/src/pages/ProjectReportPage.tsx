import { RequestError } from '../components/RequestError';
import { Button, Card, Space, Statistic, Typography } from 'antd';
import { fetchProjectReport } from '../api';
import { PROJECT_STATUSES, SCOPE_NAMES } from '../../../shared/catalog.ts';
import { usePermission } from '../identity';
import { useResource } from '../useResource';
import { ForbiddenPage } from './StatusPages';

export function ProjectReportPage() {
  const reportPermission = usePermission('project.report.view');

  const { state, reload } = useResource(fetchProjectReport, { failureMessage: '报表加载失败' });

  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;

  const summary = state.kind === 'ready' ? state.data : null;

  return (
    <Card
      title="项目报表"
      extra={
        <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>
          刷新
        </Button>
      }
    >
      <Space className="full-width" orientation="vertical" size="middle">
        <Typography.Text type="secondary">
          统计按你的项目报表查看范围生成，与项目列表相互独立。
        </Typography.Text>
        <Typography.Text>
          可见范围：
          {reportPermission?.dataScope ? SCOPE_NAMES[reportPermission.dataScope] : '无报表权限'}
        </Typography.Text>

        {state.kind === 'failed' ? (
          <RequestError message={state.message} onRetry={reload} />
        ) : (
          <Space size="large" wrap>
            <Statistic
              title="项目总数"
              value={summary?.total ?? 0}
              loading={state.kind === 'loading'}
            />
            {PROJECT_STATUSES.map((status) => (
              <Statistic
                key={status}
                title={status}
                value={summary?.byStatus[status] ?? 0}
                loading={state.kind === 'loading'}
              />
            ))}
          </Space>
        )}
      </Space>
    </Card>
  );
}
