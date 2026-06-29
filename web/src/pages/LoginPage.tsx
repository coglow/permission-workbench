import { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { useLocation, useNavigate, useRevalidator } from 'react-router';
import { fetchAccounts, login, type Account } from '../api';
import { useIdentity } from '../identity';

/**
 * 登录成功后先刷新根路由 loader 的身份数据，再跳转目标页面，
 * 保证目标页面首次渲染拿到的就是新账号的身份与权限。
 */
export function LoginPage() {
  const identity = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const { revalidate } = useRevalidator();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [pendingAccount, setPendingAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccounts() {
      try {
        const list = await fetchAccounts(controller.signal);
        setAccounts(list);
        setAccountsError(null);
      } catch {
        if (!controller.signal.aborted) {
          setAccountsError('体验账号加载失败，请确认 API 已启动。');
        }
      }
    }

    void loadAccounts();
    return () => controller.abort();
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? '/projects/list';

  async function handleLogin(account: string) {
    setPendingAccount(account);
    setError(null);

    try {
      // 服务端在登录时撤销当前浏览器上的旧会话，并写入新会话 Cookie。
      await login(account);
      await revalidate();
      navigate(from, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败');
    } finally {
      setPendingAccount(null);
    }
  }

  return (
    <main className="page">
      <Card className="status-card">
        <Space className="card-content" orientation="vertical" size="middle">
          <div>
            <Typography.Text type="secondary">权限管理 Demo</Typography.Text>
            <Typography.Title level={3}>选择体验账号</Typography.Title>
          </div>

          {identity && (
            <Alert
              type="info"
              showIcon
              title={`当前已登录：${identity.user.name}（${identity.user.account}）`}
              action={
                <Button size="small" onClick={() => navigate(from, { replace: true })}>
                  进入
                </Button>
              }
            />
          )}

          <Typography.Text type="secondary">
            点击账号直接登录；切换到其他账号时先前的会话立即失效。
          </Typography.Text>

          {accountsError && <Alert type="error" showIcon title={accountsError} />}
          {error && <Alert type="error" showIcon title={error} />}

          <Space className="account-list" wrap>
            {accounts.map((account) => (
              <Button
                key={account.account}
                type={identity?.user.account === account.account ? 'primary' : 'default'}
                loading={pendingAccount === account.account}
                disabled={pendingAccount !== null}
                onClick={() => void handleLogin(account.account)}
              >
                {account.name}
              </Button>
            ))}
          </Space>
        </Space>
      </Card>
    </main>
  );
}
