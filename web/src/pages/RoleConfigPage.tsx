import { useState } from 'react';
import { Alert, Button, Card, Space, Table, Tag, Tooltip, type TableProps } from 'antd';
import { useRevalidator } from 'react-router';
import { fetchRoleCatalog, updateRole } from '../api';
import { SCOPE_NAMES } from '../../../shared/catalog.ts';
import type { PermissionCatalogEntry, RoleRecord } from '../../../shared/contracts.ts';
import { RoleEditor } from '../components/RoleEditor';
import { RequestError } from '../components/RequestError';
import { useMutation } from '../useMutation';
import { useResource } from '../useResource';
import { ForbiddenPage } from './StatusPages';

function summarizeGrants(role: RoleRecord, catalog: readonly PermissionCatalogEntry[]) {
  const names = new Map(catalog.map((permission) => [permission.code, permission.name]));
  return (
    role.permissions
      .map(
        (grant) =>
          `${names.get(grant.code) ?? grant.code}${grant.dataScope ? `（${SCOPE_NAMES[grant.dataScope]}）` : ''}`,
      )
      .join('、') || '—'
  );
}

export function RoleConfigPage() {
  const { revalidate } = useRevalidator();
  const { state, reload } = useResource(fetchRoleCatalog, { failureMessage: '角色列表加载失败' });
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; role: RoleRecord } | null
  >(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const mutation = useMutation('角色状态更新失败');
  const catalog = state.kind === 'ready' ? state.data : null;

  async function refreshAfterWrite() {
    await reload();
    await revalidate();
  }
  async function handleSaved() {
    setEditor(null);
    await refreshAfterWrite();
  }
  async function handleToggleStatus(role: RoleRecord) {
    setPendingRoleId(role.id);
    try {
      if (
        await mutation.run(() =>
          updateRole(role.id, { status: role.status === 'enabled' ? 'disabled' : 'enabled' }),
        )
      )
        await refreshAfterWrite();
    } finally {
      setPendingRoleId(null);
    }
  }

  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;
  const columns: TableProps<RoleRecord>['columns'] = [
    { title: '角色名称', dataIndex: 'name', width: 120 },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_value, role) => (
        <Tag color={role.status === 'enabled' ? 'green' : 'default'}>
          {role.status === 'enabled' ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '内置',
      key: 'builtin',
      width: 80,
      render: (_value, role) => (role.builtin ? <Tag color="blue">内置</Tag> : '—'),
    },
    {
      title: '授权摘要',
      key: 'grants',
      width: 220,
      render: (_value, role) => summarizeGrants(role, catalog?.permissions ?? []),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_value, role) => (
        <Tooltip title={role.builtin ? '内置角色只读，不可修改' : null}>
          <Space size={0}>
            <Button
              type="link"
              size="small"
              disabled={role.builtin || pendingRoleId !== null}
              onClick={() => setEditor({ mode: 'edit', role })}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              disabled={role.builtin || pendingRoleId !== null}
              loading={pendingRoleId === role.id}
              onClick={() => void handleToggleStatus(role)}
            >
              {role.status === 'enabled' ? '停用' : '启用'}
            </Button>
          </Space>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Card
        title="角色配置"
        extra={
          <Space>
            <Button
              type="primary"
              disabled={!catalog || pendingRoleId !== null}
              onClick={() => setEditor({ mode: 'create' })}
            >
              新建角色
            </Button>
            <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>
              刷新
            </Button>
          </Space>
        }
      >
        {mutation.error && (
          <Alert className="form-error" type="error" showIcon title={mutation.error} />
        )}
        {state.kind === 'failed' ? (
          <RequestError message={state.message} onRetry={reload} />
        ) : (
          <Table<RoleRecord>
            rowKey="id"
            columns={columns}
            dataSource={catalog?.roles ?? []}
            loading={state.kind === 'loading'}
            pagination={false}
            locale={{ emptyText: '没有角色' }}
          />
        )}
      </Card>
      {editor && catalog && (
        <RoleEditor
          role={editor.mode === 'edit' ? editor.role : undefined}
          catalog={catalog.permissions}
          onCancel={() => setEditor(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
