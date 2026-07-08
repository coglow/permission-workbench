import { RequestError } from '../components/RequestError';
import { Button, Card, Space, Table, Tag, type TableProps } from 'antd';
import { fetchAuditLogs } from '../api';
import type { AuditLogEntry } from '../../../shared/contracts.ts';
import { useResource } from '../useResource';
import { ForbiddenPage } from './StatusPages';

const ACTION_LABELS: Record<string, string> = {
  'role.create': '创建角色',
  'role.update': '编辑角色',
  'user.assign': '分配角色',
  'menu.create': '新增菜单',
  'menu.update': '编辑菜单',
};

const TARGET_LABELS: Record<string, string> = {
  role: '角色',
  user: '用户',
  menu: '菜单',
};

/**
 * 审计日志页（菜单配置的种子路径 /system/audit，所需权限 system.audit.view）。
 */
export function AuditLogPage() {
  const { state, reload } = useResource(fetchAuditLogs, { failureMessage: '审计日志加载失败' });

  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;

  const logs = state.kind === 'ready' ? state.data.items : [];

  const columns: TableProps<AuditLogEntry>['columns'] = [
    { title: '时间', key: 'createdAt', width: 180, render: (_v, log) => log.createdAt },
    { title: '操作人', key: 'actor', width: 120, render: (_v, log) => log.actorName },
    {
      title: '动作',
      key: 'action',
      width: 120,
      render: (_v, log) => <Tag color="blue">{ACTION_LABELS[log.action] ?? log.action}</Tag>,
    },
    {
      title: '目标',
      key: 'target',
      width: 140,
      render: (_v, log) => `${TARGET_LABELS[log.targetType] ?? log.targetType} · ${log.targetName}`,
    },
    { title: '摘要', key: 'summary', render: (_v, log) => log.summary },
  ];

  return (
    <Space className="full-width" orientation="vertical" size="middle">
      <Card
        title="审计日志"
        extra={
          <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>
            刷新
          </Button>
        }
      >
        {state.kind === 'failed' ? (
          <RequestError message={state.message} onRetry={reload} />
        ) : (
          <Table<AuditLogEntry>
            rowKey="id"
            columns={columns}
            dataSource={logs}
            loading={state.kind === 'loading'}
            pagination={false}
            locale={{ emptyText: '暂无审计记录' }}
          />
        )}
      </Card>
    </Space>
  );
}
