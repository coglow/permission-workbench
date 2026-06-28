import { Button, Result } from 'antd';
import { isRouteErrorResponse, useNavigate, useRevalidator, useRouteError } from 'react-router';

/**
 * 403：已登录，但当前授权不足以访问该页面。
 */
export function ForbiddenPage({ message }: { message?: string }) {
  const navigate = useNavigate();

  return (
    <Result
      status="403"
      title="403"
      subTitle={message ?? '当前账号没有访问该页面的权限。'}
      extra={<Button onClick={() => navigate('/login')}>切换账号</Button>}
    />
  );
}

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="404"
      subTitle="页面不存在。"
      extra={<Button onClick={() => navigate('/projects')}>返回项目列表</Button>}
    />
  );
}

/**
 * 根路由的兜底错误页。
 * 身份确认或页面渲染失败时给出可重试的提示，避免只看到空白页。
 */
export function RootErrorPage() {
  const error = useRouteError();
  const { revalidate } = useRevalidator();

  const message = isRouteErrorResponse(error)
    ? `请求失败`
    : '无法连接服务，请稍后重试……';

  return (
    <main className="page">
      <Result
        status="error"
        title="页面加载失败"
        subTitle={message}
        extra={
          <Button type="primary" onClick={() => void revalidate()}>
            重试
          </Button>
        }
      />
    </main>
  );
}
