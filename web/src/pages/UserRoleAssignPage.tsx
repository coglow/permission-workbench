import { RequestError } from '../components/RequestError';
import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import { useRevalidator } from 'react-router';
import { assignUserRoles, fetchUserCatalog } from '../api';
import {
  BUILTIN_ADMIN_ROLE_ID,
  BUILTIN_ADMIN_USER_ID,
  SCOPE_NAMES,
} from '../../../shared/catalog.ts';
import type { ManagedUser, UserRoleOption } from '../../../shared/contracts.ts';
import { useResource } from '../useResource';
import { useMutation } from '../useMutation';
import { ForbiddenPage } from './StatusPages';

function roleOptionLabel(role: UserRoleOption) {
  const markers = [role.status === 'disabled' ? '停用' : null, role.builtin ? '内置' : null].filter(
    Boolean,
  );
  return `${role.name}${markers.length > 0 ? ` · ${markers.join(' · ')}` : ''}`;
}

export function UserRoleAssignPage() {
  const { revalidate } = useRevalidator();

  const [editor, setEditor] = useState<ManagedUser | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const mutation = useMutation('分配角色失败');

  const { state, reload } = useResource(fetchUserCatalog, { failureMessage: '用户列表加载失败' });

  function openAssign(user: ManagedUser) {
    setEditor(user);
    // 回显全部现有分配（含停用角色），整组替换时不会误删。
    setSelectedRoleIds(user.roles.map((role) => role.id));
    mutation.clearError();
  }

  function closeEditor() {
    setEditor(null);
    mutation.clearError();
  }

  async function handleSave() {
    if (!editor) return;
    if (await mutation.run(() => assignUserRoles(editor.id, selectedRoleIds))) {
      closeEditor();
      await reload();
      await revalidate();
    }
  }

  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;

  const catalog = state.kind === 'ready' ? state.data : null;
  const builtinRoleIds = new Set(
    (catalog?.roles ?? []).filter((role) => role.builtin).map((role) => role.id),
  );
  const adminRoleLocked = editor?.id === BUILTIN_ADMIN_USER_ID;

  const columns: TableProps<ManagedUser>['columns'] = [
    { title: '姓名', key: 'name', width: 90, render: (_value, user) => user.name },
    { title: '登录名', key: 'account', width: 110, render: (_value, user) => user.account },
    { title: '所属团队', key: 'team', width: 110, render: (_value, user) => user.team.name },
    {
      title: '当前角色',
      key: 'roles',
      width: 120,
      render: (_value, user) =>
        user.roles.length === 0 ? (
          '—'
        ) : (
          <Space size={4} wrap>
            {user.roles.map((role) => (
              <Tag key={role.id} color={role.status === 'disabled' ? 'default' : 'blue'}>
                {role.name}
                {role.status === 'disabled' ? ' · 停用' : ''}
                {builtinRoleIds.has(role.id) ? ' · 内置' : ''}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: '可用权限',
      key: 'permissions',
      width: 220,
      render: (_value, user) =>
        user.permissions.length === 0 ? (
          '—'
        ) : (
          <Space orientation="vertical" size={2}>
            {user.permissions.map((permission) => (
              <Typography.Text key={permission.code} type="secondary">
                {permission.name}
                {permission.dataScope ? `（${SCOPE_NAMES[permission.dataScope]}）` : ''}
              </Typography.Text>
            ))}
          </Space>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_value, user) => (
        <Button type="link" size="small" onClick={() => openAssign(user)}>
          分配角色
        </Button>
      ),
    },
  ];

  return (
    <Space className="full-width" orientation="vertical" size="middle">
      <Card
        title="用户角色分配"
        extra={
          <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>
            刷新
          </Button>
        }
      >
        {state.kind === 'failed' ? (
          <RequestError message={state.message} onRetry={reload} />
        ) : (
          <Table<ManagedUser>
            rowKey="id"
            columns={columns}
            dataSource={catalog?.users ?? []}
            loading={state.kind === 'loading'}
            pagination={false}
            locale={{ emptyText: '没有用户' }}
          />
        )}
      </Card>

      <Modal
        title={editor ? `分配角色：${editor.name}（${editor.account}）` : '分配角色'}
        open={editor !== null}
        confirmLoading={mutation.pending}
        okText="保存"
        cancelText="取消"
        width={560}
        onOk={() => void handleSave()}
        onCancel={closeEditor}
        cancelButtonProps={{ disabled: mutation.pending }}
        closable={!mutation.pending}
        mask={{ closable: !mutation.pending }}
        keyboard={!mutation.pending}
      >
        {mutation.error && (
          <Alert className="form-error" type="error" showIcon title={mutation.error} />
        )}

        {editor && (
          <Space className="full-width" orientation="vertical" size="middle">
            <Typography.Text type="secondary">
              {editor.name}（{editor.account}）· {editor.team.name}
            </Typography.Text>

            <Checkbox.Group
              className="full-width"
              value={selectedRoleIds}
              options={(catalog?.roles ?? []).map((role) => ({
                value: role.id,
                label: roleOptionLabel(role),
                disabled: adminRoleLocked && role.id === BUILTIN_ADMIN_ROLE_ID,
              }))}
              onChange={(values) => setSelectedRoleIds(values as string[])}
            />

            {adminRoleLocked && (
              <Typography.Text type="secondary">
                内置管理员账号的管理员角色不可移除（可另行添加其他角色）。
              </Typography.Text>
            )}
          </Space>
        )}
      </Modal>
    </Space>
  );
}
