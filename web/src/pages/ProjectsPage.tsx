import { RequestError } from '../components/RequestError';
import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import { useNavigate } from 'react-router';
import { createProject, fetchProjects, PROJECT_STATUS_COLORS } from '../api';
import { SCOPE_NAMES } from '../../../shared/catalog.ts';
import type { Project, ProjectInput } from '../../../shared/contracts.ts';
import { PROJECT_FORM_DEFAULTS, ProjectFormFields } from '../components/ProjectFormFields';
import { useIdentity, usePermission } from '../identity';
import { useResource } from '../useResource';
import { useMutation } from '../useMutation';
import { ForbiddenPage } from './StatusPages';

function createColumns(onView: (id: string) => void): TableProps<Project>['columns'] {
  return [
    { title: '项目编号', key: 'id', width: 120, render: (_value, project) => project.id },
    { title: '项目名称', key: 'name', render: (_value, project) => project.name },
    { title: '负责人', key: 'owner', width: 140, render: (_value, project) => project.owner.name },
    { title: '所属团队', key: 'team', width: 160, render: (_value, project) => project.team.name },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_value, project) => (
        <Tag color={PROJECT_STATUS_COLORS[project.status]}>{project.status}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_value, project) => (
        <Button type="link" size="small" onClick={() => onView(project.id)}>
          查看
        </Button>
      ),
    },
  ];
}

/**
 * 项目列表页。
 *
 * 数据范围由服务端在 SQL 中过滤，页面只负责展示服务端返回的集合；
 * 请求出错时按状态码分流：401 回登录页，403 展示拒绝状态，其它情况展示失败提示。
 */
export function ProjectsPage() {
  const identity = useIdentity();
  const createPermission = usePermission('project.record.create');
  const navigate = useNavigate();
  const columns = createColumns((id) => navigate(`/projects/records/${id}`));

  const { state, reload } = useResource(fetchProjects, { failureMessage: '项目列表加载失败' });

  const [createOpen, setCreateOpen] = useState(false);
  const creation = useMutation('创建失败');
  const [createForm] = Form.useForm<ProjectInput>();

  function closeCreateModal() {
    setCreateOpen(false);
    creation.clearError();
    createForm.resetFields();
  }

  async function handleCreate(values: ProjectInput) {
    if (await creation.run(() => createProject(values))) {
      closeCreateModal();
      await reload();
    }
  }

  function renderList() {
    if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;

    if (state.kind === 'failed') {
      return <RequestError message={state.message} onRetry={reload} />;
    }

    return (
      <Table<Project>
        rowKey="id"
        columns={columns}
        dataSource={state.kind === 'ready' ? state.data.items : []}
        loading={state.kind === 'loading'}
        pagination={false}
        locale={{ emptyText: '当前可见范围内没有项目' }}
      />
    );
  }

  return (
    <Space className="full-width" orientation="vertical" size="middle">
      <Card title="我的权限">
        <Space orientation="vertical" size={4}>
          <Typography.Text>
            {identity?.user.name}（{identity?.user.account}）· {identity?.user.team.name}
          </Typography.Text>
          <Typography.Text>
            角色：
            {identity && identity.roles.length > 0
              ? identity.roles.map((role) => role.name).join('、')
              : '—'}
          </Typography.Text>
          <Space className="permission-list" orientation="vertical" size={4}>
            {identity?.permissions.map((permission) => (
              <Typography.Text key={permission.code}>
                {permission.name}
                {permission.dataScope ? `（${SCOPE_NAMES[permission.dataScope]}）` : ''}
              </Typography.Text>
            ))}
          </Space>
        </Space>
      </Card>

      <Card
        title={state.kind === 'ready' ? `项目列表（共 ${state.data.items.length} 条）` : '项目列表'}
        extra={
          <Space>
            {/* 新建入口按 project.record.create 显示；服务端仍会独立校验一次。 */}
            {createPermission && (
              <Button type="primary" onClick={() => setCreateOpen(true)}>
                新建
              </Button>
            )}
            <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>
              刷新
            </Button>
          </Space>
        }
      >
        {renderList()}
      </Card>

      <Modal
        title="新建项目"
        open={createOpen}
        confirmLoading={creation.pending}
        okText="创建"
        cancelText="取消"
        onOk={() => createForm.submit()}
        onCancel={closeCreateModal}
        cancelButtonProps={{ disabled: creation.pending }}
        closable={!creation.pending}
        mask={{ closable: !creation.pending }}
        keyboard={!creation.pending}
      >
        {creation.error && (
          <Alert className="form-error" type="error" showIcon title={creation.error} />
        )}
        <Form
          form={createForm}
          layout="vertical"
          initialValues={PROJECT_FORM_DEFAULTS}
          onFinish={(values) => void handleCreate(values)}
        >
          <ProjectFormFields />
        </Form>
      </Modal>
    </Space>
  );
}
