import { useState, type Key } from 'react';
import { Alert, Button, Card, Space, Table, Tag, Tooltip, type TableProps } from 'antd';
import { useRevalidator } from 'react-router';
import { fetchMenuCatalog, updateMenu } from '../api';
import { PERMISSION_CATALOG } from '../../../shared/catalog.ts';
import type { MenuNode } from '../../../shared/contracts.ts';
import { MenuEditor } from '../components/MenuEditor';
import { RequestError } from '../components/RequestError';
import { flattenMenus } from '../navigation';
import { useMutation } from '../useMutation';
import { useResource } from '../useResource';
import { ForbiddenPage } from './StatusPages';

export function MenuConfigPage() {
  const { revalidate } = useRevalidator();
  const { state, reload } = useResource(fetchMenuCatalog, { failureMessage: '菜单列表加载失败' });
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; menu: MenuNode } | null
  >(null);
  const [pendingMenuId, setPendingMenuId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Key[] | null>(null);
  const mutation = useMutation('菜单状态更新失败');
  const catalog = state.kind === 'ready' ? state.data : null;
  const flatMenus = flattenMenus(catalog?.menus ?? []);
  const directories = flatMenus.filter((node) => node.component === null);
  const pageNames = new Map(catalog?.pages.map((page) => [page.component, page.name]));
  const permissionNames = new Map(
    PERMISSION_CATALOG.map((permission) => [permission.code, permission.name]),
  );

  async function refreshAfterWrite() {
    await reload();
    await revalidate();
  }
  async function handleSaved() {
    setEditor(null);
    await refreshAfterWrite();
  }
  async function handleToggleStatus(menu: MenuNode) {
    setPendingMenuId(menu.id);
    try {
      if (
        await mutation.run(() =>
          updateMenu(menu.id, { status: menu.status === 'enabled' ? 'disabled' : 'enabled' }),
        )
      )
        await refreshAfterWrite();
    } finally {
      setPendingMenuId(null);
    }
  }

  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;
  const columns: TableProps<MenuNode>['columns'] = [
    { title: '菜单名称', dataIndex: 'title', width: 220 },
    {
      title: '页面',
      key: 'page',
      width: 120,
      render: (_value, menu) => (menu.component === null ? '分组' : pageNames.get(menu.component)),
    },
    {
      title: '进入所需权限',
      key: 'permission',
      width: 180,
      render: (_value, menu) =>
        menu.permissionCode === null ? '—' : permissionNames.get(menu.permissionCode),
    },
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
    {
      title: '状态',
      key: 'status',
      width: 90,
      render: (_value, menu) => (
        <Tag color={menu.status === 'enabled' ? 'green' : 'default'}>
          {menu.status === 'enabled' ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_value, menu) => (
        <Tooltip title={menu.system ? '系统管理菜单只读，不可修改' : null}>
          <Space size={0}>
            <Button
              type="link"
              size="small"
              disabled={menu.system || pendingMenuId !== null}
              onClick={() => setEditor({ mode: 'edit', menu })}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              disabled={menu.system || pendingMenuId !== null}
              loading={pendingMenuId === menu.id}
              onClick={() => void handleToggleStatus(menu)}
            >
              {menu.status === 'enabled' ? '停用' : '启用'}
            </Button>
          </Space>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Card
        title="菜单路由配置"
        extra={
          <Space>
            <Button
              type="primary"
              disabled={!catalog || pendingMenuId !== null}
              onClick={() => setEditor({ mode: 'create' })}
            >
              新增菜单
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
          <Table<MenuNode>
            rowKey="id"
            columns={columns}
            dataSource={catalog?.menus ?? []}
            loading={state.kind === 'loading'}
            pagination={false}
            expandable={{
              expandedRowKeys: expandedKeys ?? directories.map((node) => node.id),
              onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
            }}
            locale={{ emptyText: '没有菜单' }}
          />
        )}
      </Card>
      {editor && catalog && (
        <MenuEditor
          menu={editor.mode === 'edit' ? editor.menu : undefined}
          pages={catalog.pages}
          flatMenus={flatMenus}
          onCancel={() => setEditor(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
