import { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { useLocation, useNavigate, useRevalidator } from 'react-router';
import { fetchAccounts, login } from '../api';
import type { Account } from '../../../shared/contracts.ts';
import { useIdentity } from '../identity';

const demoNotes: Record<string, { perspective: '管理视角' | '业务视角'; purpose: string }> = {
  zhangsan: { perspective: '管理视角', purpose: '管理端配置演示' },
  lisi: { perspective: '业务视角', purpose: '团队可见范围演示' },
  wangwu: { perspective: '业务视角', purpose: '跨团队拒绝演示' },
  zhaoliu: { perspective: '业务视角', purpose: '多角色并集演示' },
  sunqi: { perspective: '业务视角', purpose: '本人可见范围演示' },
  zhouba: { perspective: '业务视角', purpose: '上级部门可见下级团队演示' },
  qianjiu: { perspective: '业务视角', purpose: '平行分支不可见演示' },
};

const demoOrder = Object.keys(demoNotes);
const perspectives = ['管理视角', '业务视角'] as const;

function readDemoNote(account: string) {
  return demoNotes[account] ?? { perspective: '业务视角' as const, purpose: '' };
}

function demoRank(account: string) {
  const index = demoOrder.indexOf(account);
  return index === -1 ? demoOrder.length : index;
}

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

  const from = (location.state as { from?: string } | null)?.from ?? '/';

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

  // 按固定顺序分组，组内按演示顺序排列；空组不渲染。
  const groups = perspectives
    .map((perspective) => ({
      perspective,
      accounts: accounts
        .filter((account) => readDemoNote(account.account).perspective === perspective)
        .sort((a, b) => demoRank(a.account) - demoRank(b.account)),
    }))
    .filter((group) => group.accounts.length > 0);

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

          <div className="account-groups">
            {groups.map((group) => (
              <section key={group.perspective}>
                <Typography.Text type="secondary" className="account-group-title">
                  {group.perspective}
                </Typography.Text>

                <div className="account-options">
                  {group.accounts.map((account) => {
                    const note = readDemoNote(account.account);
                    // 停用角色已由服务端过滤，这里为空即代表当前没有生效角色。
                    const meta = [
                      account.team.name,
                      account.roles.length > 0
                        ? account.roles.map((role) => role.name).join(' + ')
                        : '无生效角色',
                    ].join(' · ');

                    return (
                      <Button
                        key={account.account}
                        block
                        className="account-option"
                        type={identity?.user.account === account.account ? 'primary' : 'default'}
                        loading={pendingAccount === account.account}
                        disabled={pendingAccount !== null}
                        onClick={() => void handleLogin(account.account)}
                      >
                        <span className="account-option-body">
                          <span className="account-option-head">
                            <span className="account-option-name">{account.name}</span>
                            <span className="account-option-meta">{meta}</span>
                          </span>
                          {note.purpose && (
                            <span className="account-option-purpose">{note.purpose}</span>
                          )}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </Space>
      </Card>
    </main>
  );
}
