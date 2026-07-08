import { Button, Result, Space } from 'antd';
import { Navigate, useNavigate, useRevalidator, useRouteError } from 'react-router';
import { useDefaultPagePath } from '../identity';

function AvailablePageActions() {
  const path = useDefaultPagePath();
  const navigate = useNavigate();
  return (
    <Space>
      {path && (
        <Button type="primary" onClick={() => navigate(path)}>
          返回可访问页面
        </Button>
      )}
      <Button onClick={() => navigate('/login')}>切换账号</Button>
    </Space>
  );
}

export function HomePage() {
  const path = useDefaultPagePath();
  if (path) return <Navigate to={path} replace />;
  return (
    <Result
      status="info"
      title="暂无可访问页面"
      subTitle="当前账号没有可访问的菜单，请切换账号。"
      extra={<AvailablePageActions />}
    />
  );
}

export function ForbiddenPage({ message }: { message?: string }) {
  return (
    <Result
      status="403"
      title="403"
      subTitle={message ?? '当前账号没有访问该页面的权限。'}
      extra={<AvailablePageActions />}
    />
  );
}

export function NotFoundPage({ message }: { message?: string }) {
  return (
    <Result
      status="404"
      title="404"
      subTitle={message ?? '页面不存在。'}
      extra={<AvailablePageActions />}
    />
  );
}

export function RootErrorPage() {
  const error = useRouteError();
  const { revalidate } = useRevalidator();
  return (
    <main className="page">
      <Result
        status="error"
        title="页面加载失败"
        subTitle={error instanceof Error ? error.message : '无法连接服务，请稍后重试'}
        extra={
          <Button type="primary" onClick={() => void revalidate()}>
            重试
          </Button>
        }
      />
    </main>
  );
}
