import { useState } from 'react';
import { Alert, Button, Space, Tag, Typography } from 'antd';
import { Outlet, useNavigate, useRevalidator } from 'react-router';
import { logout } from './api';
import { useIdentity } from './identity';

/**
 * 退出流程是“先让服务端会话失效 → 再刷新路由数据 → 最后跳登录页”，
 * 顺序保证页面上的旧身份被清掉，不会出现已经退登却仍显示上一账号的情况。
 */
export function ProtectedLayout() {
  const identity = useIdentity();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Typography.Text strong>权限管理 Demo</Typography.Text>

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
              {/* 切换账号只是回到登录页；点击其他账号时服务端会撤销当前会话。 */}
              <Button onClick={() => navigate('/login')}>切换账号</Button>
              <Button loading={loggingOut} onClick={() => void handleLogout()}>
                退出
              </Button>
            </Space>
          </Space>
        )}
      </header>

      <main className="app-main">
        {error && <Alert className="full-width" type="error" showIcon title={error} />}
        <Outlet />
      </main>
    </div>
  );
}
