import { Spin } from 'antd';
import { createBrowserRouter, Navigate } from 'react-router';
import { fetchIdentity } from './api';
import { RequireAuth } from './identity';
import { ProtectedLayout } from './layout';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ForbiddenPage, NotFoundPage, RootErrorPage } from './pages/StatusPages';

/**
 * 首屏加载态。
 *
 * 首次渲染 还没拿时根路由的 loader到身份，React Router 要求此时有 HydrateFallback：
 * 缺少它会在控制台提示，并在身份返回前渲染一段空白。这里用居中转圈填充这段等待。
 */
function InitialLoading() {
  return (
    <main className="page">
      <Spin size="large" />
    </main>
  );
}

/**
 * 路由表采用 React Router 的数据路由（route objects）。
 *
 * 根路由 loader 承担认证职责：它向服务端确认当前会话并返回身份，
 * 每次导航和刷新都会重新执行，因此前端不需要自己缓存登录状态。
 *
 * 已实现页面在代码里显式声明；
 */
export const router = createBrowserRouter([
  {
    id: 'root',
    path: '/',
    loader: async () => ({ identity: await fetchIdentity() }),
    // 只在首次加载的等待期间渲染，后续导航与重新校验不会替换当前页面。
    HydrateFallback: InitialLoading,
    errorElement: <RootErrorPage />,
    children: [
      // 根路径没有独立页面，按当前会话落到项目列表（未登录时会被守卫转到登录页）。
      { index: true, element: <Navigate to="/projects" replace /> },

      // 公共路由：登录页在登录前后都可访问。
      { path: 'login', element: <LoginPage /> },

      {
        // 受保护路由统一先过认证守卫。
        element: (
          <RequireAuth>
            <ProtectedLayout />
          </RequireAuth>
        ),
        children: [
          { path: 'projects', element: <ProjectsPage /> },
          { path: '403', element: <ForbiddenPage /> },
          // 未匹配路径放在受保护分组内：未登录访问未知地址先去登录页，登录后再区分 403 与 404。
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
