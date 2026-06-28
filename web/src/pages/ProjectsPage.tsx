import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Table, Typography, type TableProps } from 'antd';
import { useNavigate, useRevalidator } from 'react-router';
import { ApiError, fetchProjects, type Project } from '../api';
import { scopeNames, useIdentity, usePermission } from '../identity';
import { ForbiddenPage } from './StatusPages';

/** 列表页的加载状态：分别对应正常、无权（403）和取数失败的展示。 */
type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; projects: Project[] }
  | { kind: 'denied'; message: string }
  | { kind: 'failed'; message: string };

const columns: TableProps<Project>['columns'] = [
  { title: '项目编号', key: 'id', width: 120, render: (_value, project) => project.id },
  { title: '项目名称', key: 'name', render: (_value, project) => project.name },
  { title: '负责人', key: 'owner', width: 140, render: (_value, project) => project.owner.name },
  { title: '所属团队', key: 'team', width: 160, render: (_value, project) => project.team.name },
  { title: '状态', key: 'status', width: 120, render: (_value, project) => project.status },
];

/**
 * 项目列表页。
 *
 * 数据范围由服务端在 SQL 中过滤，页面只负责展示服务端返回的集合；
 * 请求出错时按状态码分流：401 回登录页，403 展示拒绝状态，其它情况展示失败提示。
 */
export function ProjectsPage() {
  const identity = useIdentity();
  const viewPermission = usePermission('project.record.view');
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();

  const [state, setState] = useState<ListState>({ kind: 'loading' });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ kind: 'loading' });

      try {
        const data = await fetchProjects(signal);
        if (signal?.aborted) return;
        setState({ kind: 'ready', projects: data.items });
      } catch (error) {
        if (signal?.aborted) return;

        if (error instanceof ApiError && error.status === 401) {
          // 会话在页面停留期间失效：重新确认身份后回到登录页，避免继续显示旧账号的数据。
          await revalidate();
          navigate('/login', { replace: true });
          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          // 服务端判定无权限时以服务端结果为准，前端立即切换为拒绝状态。
          setState({ kind: 'denied', message: error.message });
          return;
        }

        setState({
          kind: 'failed',
          message: error instanceof Error ? error.message : '项目列表加载失败',
        });
      }
    },
    [navigate, revalidate],
  );

  useEffect(() => {
    const controller = new AbortController();
    // 依赖当前用户 ID：账号切换后会重新取数，不会保留上一个账号的列表。
    void load(controller.signal);
    return () => controller.abort();
  }, [load, identity?.user.id]);

  function renderList() {
    if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;

    if (state.kind === 'failed') {
      return (
        <Alert
          type="error"
          showIcon
          title={state.message}
          action={
            <Button size="small" onClick={() => void load()}>
              重试
            </Button>
          }
        />
      );
    }

    return (
      <Table<Project>
        rowKey="id"
        columns={columns}
        dataSource={state.kind === 'ready' ? state.projects : []}
        loading={state.kind === 'loading'}
        pagination={false}
        locale={{ emptyText: '当前数据范围内没有项目' }}
      />
    );
  }

  return (
    <Space className="full-width" orientation="vertical" size="middle">
      <Card title="当前身份与有效权限">
        <Space orientation="vertical" size={4}>
          <Typography.Text>
            账号：{identity?.user.name}（{identity?.user.account}）· {identity?.user.team.name}
          </Typography.Text>
          <Typography.Text>
            角色：{identity?.roles.map((role) => role.name).join('、') ?? '—'}
          </Typography.Text>
          <Typography.Text>
            列表可见范围：
            {viewPermission?.dataScope ? scopeNames[viewPermission.dataScope] : '无查看权限'}
          </Typography.Text>
          <Typography.Text strong>有效权限</Typography.Text>
          <Space className="permission-list" orientation="vertical" size={4}>
            {identity?.permissions.map((permission) => (
              <Typography.Text key={permission.code}>
                {permission.name} · {permission.code}
                {permission.dataScope ? ` · ${scopeNames[permission.dataScope]}` : ''}
              </Typography.Text>
            ))}
          </Space>
        </Space>
      </Card>

      <Card
        title={state.kind === 'ready' ? `项目列表（共 ${state.projects.length} 条）` : '项目列表'}
        extra={
          <Button disabled={state.kind === 'loading'} onClick={() => void load()}>
            刷新
          </Button>
        }
      >
        {renderList()}
      </Card>
    </Space>
  );
}
