import { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Tag, Typography } from 'antd';

interface Account {
  account: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
}

interface Permission {
  code: string;
  name: string;
  dataScope: 'self' | 'team' | 'all' | null;
}

interface Identity {
  user: {
    id: string;
    account: string;
    name: string;
    team: { id: string; name: string };
  };
  roles: Role[];
  permissions: Permission[];
}

type ApiStatus = 'checking' | 'connected' | 'unavailable';

const scopeNames = {
  self: '本人',
  team: '团队',
  all: '全部',
} as const;

export function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [pendingAccount, setPendingAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // 刷新时从服务端会话恢复身份，避免依赖页面里的旧状态。
    async function loadIdentity() {
      try {
        const accountsResponse = await fetch('/api/auth/accounts', {
          signal: controller.signal,
        });
        if (!accountsResponse.ok) throw new Error('体验账号加载失败');
        setAccounts((await accountsResponse.json()) as Account[]);

        const identityResponse = await fetch('/api/auth/me', {
          signal: controller.signal,
        });
        if (identityResponse.status === 401) {
          setIdentity(null);
        } else if (!identityResponse.ok) {
          throw new Error('当前身份加载失败');
        } else {
          setIdentity((await identityResponse.json()) as Identity);
        }
        setApiStatus('connected');
      } catch {
        if (!controller.signal.aborted) {
          setApiStatus('unavailable');
          setError('无法连接服务，请稍后重试。');
        }
      }
    }

    void loadIdentity();
    return () => controller.abort();
  }, []);

  async function login(account: string) {
    setPendingAccount(account);
    setError(null);

    try {
      // 浏览器会带上当前 Cookie；切换账号时服务端会撤销旧会话。
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account }),
      });
      const payload = (await response.json()) as Identity | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : '登录失败');
      }
      // 用新身份整体替换旧状态，避免残留上一账号的角色和权限。
      setIdentity(payload as Identity);
      setApiStatus('connected');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败');
    } finally {
      setPendingAccount(null);
    }
  }

  async function logout() {
    setError(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('退出失败');
      // 服务端确认会话失效后再清除页面身份。
      setIdentity(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '退出失败');
    }
  }

  const apiMessage = {
    checking: '正在连接 API…',
    connected: 'API 已连接',
    unavailable: 'API 暂不可用',
  }[apiStatus];

  return (
    <main className="page">
      <Card className="status-card">
        <Space className="card-content" direction="vertical" size="middle">
          <div>
            <Typography.Text type="secondary">权限管理 Demo</Typography.Text>
            <Typography.Title level={3}>{identity ? '当前身份' : '选择体验账号'}</Typography.Title>
          </div>

          <Alert
            type={
              apiStatus === 'connected' ? 'success' : apiStatus === 'unavailable' ? 'error' : 'info'
            }
            showIcon
            message={apiMessage}
          />

          {error && <Alert type="error" showIcon message={error} />}

          {identity && (
            <section aria-label="当前身份和有效权限">
              <Space direction="vertical" size="small">
                <Typography.Text>
                  {identity.user.name}（{identity.user.account}）· {identity.user.team.name}
                </Typography.Text>
                <Space wrap>
                  {identity.roles.map((role) => (
                    <Tag key={role.id}>{role.name}</Tag>
                  ))}
                </Space>
                <Typography.Text strong>有效权限</Typography.Text>
                <Space className="permission-list" direction="vertical" size={4}>
                  {identity.permissions.map((permission) => (
                    <Typography.Text key={permission.code}>
                      {permission.name} · {permission.code}
                      {permission.dataScope ? ` · ${scopeNames[permission.dataScope]}` : ''}
                    </Typography.Text>
                  ))}
                </Space>
              </Space>
            </section>
          )}

          <div>
            <Typography.Text strong>
              {identity ? '切换账号' : '点击账号登录（无需密码）'}
            </Typography.Text>
            <Space className="account-list" wrap>
              {accounts.map((account) => (
                <Button
                  key={account.account}
                  type={identity?.user.account === account.account ? 'primary' : 'default'}
                  loading={pendingAccount === account.account}
                  disabled={pendingAccount !== null}
                  onClick={() => void login(account.account)}
                >
                  {account.name}
                </Button>
              ))}
              {identity && (
                <Button disabled={pendingAccount !== null} onClick={() => void logout()}>
                  退出
                </Button>
              )}
            </Space>
          </div>
        </Space>
      </Card>
    </main>
  );
}
