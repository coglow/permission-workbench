import { useEffect, useState } from 'react';
import { Alert, Button, Menu, Space, Tag, Typography, type MenuProps } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, useRevalidator } from 'react-router';
import { logout } from './api';
import type { NavigationNode } from '../../shared/contracts.ts';
import { useIdentity, useNavigation } from './identity';

type MenuItem = NonNullable<MenuProps['items']>[number];

function toMenuItems(nodes: NavigationNode[]): MenuItem[] {
  return nodes.map((node) =>
    node.children.length > 0
      ? { key: node.id, label: node.title, children: toMenuItems(node.children) }
      : // 页面节点用登记表路径作 key（可直接导航）；分组节点没有路径，用菜单标识。
        { key: node.path ?? node.id, label: node.title },
  );
}

/**
 * 在当前导航里定位地址对应的页面节点，返回高亮用路径与其上级目录链路（用于默认展开）。
 * 地址属于固定路由（详情、编辑等）或未配置路径时没有命中，导航里不高亮任何项。
 */
function findNavigationTrail(
  nodes: NavigationNode[],
  pathname: string,
  trail: string[] = [],
): { selected: string | null; openKeys: string[] } {
  for (const node of nodes) {
    if (node.children.length > 0) {
      const found = findNavigationTrail(node.children, pathname, [...trail, node.id]);
      if (found.selected) return found;
    } else if (node.path === pathname) {
      return { selected: node.path, openKeys: trail };
    }
  }

  return { selected: null, openKeys: [] };
}

/**
 * 退出流程是“先让服务端会话失效 → 再刷新路由数据 → 最后跳登录页”，
 * 顺序保证页面上的旧身份被清掉，不会出现已经退登却仍显示上一账号的情况。
 *
 * 侧边导航完全按根 loader 返回的导航数据渲染：目录与子项、排序都由服务端配置决定，
 * 当前地址对应的页面节点高亮；因此菜单配置变化后，下一次导航即按最新配置展示。
 */
export function ProtectedLayout() {
  const identity = useIdentity();
  const navigation = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 侧边导航折叠状态：只存在内存里，刷新后回到展开态。
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const trail = findNavigationTrail(navigation, location.pathname);
  const branchKey = JSON.stringify([identity?.user.id, trail.openKeys]);

  // 首页内部跳转或菜单层级变化后也展开当前目录，defaultOpenKeys 只在首次挂载生效。
  useEffect(() => {
    if (!collapsed) setOpenKeys(trail.openKeys);
  }, [branchKey, collapsed]);

  // 变更生效：页面重新可见（标签页重新激活）时重新执行根 loader，
  // 按最新配置刷新身份、导航与路由元数据；切换账号与退出沿用既有行为。
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void revalidate();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [revalidate]);

  async function handleLogout() {
    setLoggingOut(true);
    setError(null);

    try {
      await logout();
      // 重新执行根路由 loader，用服务端结果覆盖页面上的身份状态。
      await revalidate();
      navigate('/login', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '退出失败');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Space size="middle">
          {navigation.length > 0 && (
            <Button
              size="small"
              type="text"
              aria-label={collapsed ? '展开菜单' : '收起菜单'}
              title={collapsed ? '展开菜单' : '收起菜单'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((current) => !current)}
            />
          )}
          <Typography.Text strong>权限管理 Demo</Typography.Text>
        </Space>

        {identity && (
          <Space className="header-identity" size="middle" wrap>
            <Typography.Text>
              {identity.user.name}（{identity.user.account}）· {identity.user.team.name}
            </Typography.Text>
            <Space size={4} wrap>
              {identity.roles.map((role) => (
                <Tag key={role.id}>{role.name}</Tag>
              ))}
            </Space>
            <Space>
              <Button onClick={() => navigate('/login')}>切换账号</Button>
              <Button loading={loggingOut} onClick={() => void handleLogout()}>
                退出
              </Button>
            </Space>
          </Space>
        )}
      </header>

      <div className="app-body">
        {navigation.length > 0 && (
          <aside className={collapsed ? 'app-sider app-sider-collapsed' : 'app-sider'}>
            <Menu
              className="app-navigation"
              mode="inline"
              inlineCollapsed={collapsed}
              items={toMenuItems(navigation)}
              selectedKeys={trail.selected ? [trail.selected] : []}
              openKeys={openKeys}
              onOpenChange={setOpenKeys}
              onClick={({ key }) => navigate(key)}
            />
          </aside>
        )}

        <main className="app-main">
          {error && <Alert className="full-width" type="error" showIcon title={error} />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
