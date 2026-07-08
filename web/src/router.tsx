import { Spin } from 'antd';
import { createBrowserRouter } from 'react-router';
import { fetchIdentity, fetchNavigation, setForbiddenHandler } from './api';
import { RequireAuth } from './identity';
import { ProtectedLayout } from './layout';
import { ConfiguredPage } from './pages/ConfiguredPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectEditPage } from './pages/ProjectEditPage';
import { ForbiddenPage, HomePage, NotFoundPage, RootErrorPage } from './pages/StatusPages';

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

export const router = createBrowserRouter([
  {
    id: 'root',
    path: '/',
    // 变更生效：React Router 默认只在路由匹配变化或参数变化时执行 loader，
    // 这里让根 loader 在每次导航都重新执行，身份、导航与路由元数据按最新配置更新。
    shouldRevalidate: () => true,
    loader: async ({ request }) => {
      const identity = await fetchIdentity(request.signal);
      if (!identity) {
        // 未登录时不请求导航接口，避免其 401 进入错误边界；这里交给守卫跳转登录页。
        return { identity: null, navigation: [], routes: [] };
      }

      const { navigation, routes } = await fetchNavigation(request.signal);
      return { identity, navigation, routes };
    },
    // 只在首次加载的等待期间渲染，后续导航与重新校验不会替换当前页面。
    HydrateFallback: InitialLoading,
    errorElement: <RootErrorPage />,
    children: [
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
          { index: true, element: <HomePage /> },
          // 固定路由：项目详情与编辑不进入菜单配置，菜单停用不影响它们。
          { path: 'projects/records/:id', element: <ProjectDetailPage /> },
          { path: 'projects/records/:id/edit', element: <ProjectEditPage /> },

          // 固定公共页：路径本身不参与菜单配置。
          { path: '403', element: <ForbiddenPage /> },
          { path: '404', element: <NotFoundPage /> },

          // 通配分支承载全部配置页面：按当前路由元数据判定 404 / 403 / 渲染对应页面。
          { path: '*', element: <ConfiguredPage /> },
        ],
      },
    ],
  },
]);

// 变更生效：业务请求收到 403 时同步刷新身份与导航（重新执行根 loader），
// 入口按最新权限更新，不需要等待用户刷新页面或重新登录。
setForbiddenHandler(() => void router.revalidate());
