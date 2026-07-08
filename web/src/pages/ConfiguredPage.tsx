import { lazy, Suspense, type ComponentType } from 'react';
import { Spin } from 'antd';
import { useLocation } from 'react-router';
import type { PageKey } from '../../../shared/contracts.ts';
import { useIdentity, useRouteMetadata } from '../identity';
import { ForbiddenPage, NotFoundPage } from './StatusPages';

// 新增登记页面时必须补齐组件映射；按页面加载，避免首屏下载所有管理页面。
const REGISTERED_PAGES = {
  ProjectList: lazy(() =>
    import('./ProjectsPage').then((module) => ({ default: module.ProjectsPage })),
  ),
  ProjectReport: lazy(() =>
    import('./ProjectReportPage').then((module) => ({ default: module.ProjectReportPage })),
  ),
  RoleConfig: lazy(() =>
    import('./RoleConfigPage').then((module) => ({ default: module.RoleConfigPage })),
  ),
  UserRoleAssign: lazy(() =>
    import('./UserRoleAssignPage').then((module) => ({ default: module.UserRoleAssignPage })),
  ),
  MenuConfig: lazy(() =>
    import('./MenuConfigPage').then((module) => ({ default: module.MenuConfigPage })),
  ),
  AuditLog: lazy(() =>
    import('./AuditLogPage').then((module) => ({ default: module.AuditLogPage })),
  ),
} satisfies Record<PageKey, ComponentType>;

/** 外层先认证，这里依次判断已启用路由和固定页面权限。 */
export function ConfiguredPage() {
  const location = useLocation();
  const routes = useRouteMetadata();
  const identity = useIdentity();
  const route = routes.find((item) => item.path === location.pathname);
  if (!route) return <NotFoundPage />;
  if (!identity?.permissions.some((permission) => permission.code === route.permissionCode))
    return <ForbiddenPage />;
  const Page = REGISTERED_PAGES[route.component];
  return (
    <Suspense fallback={<Spin />}>
      <Page />
    </Suspense>
  );
}
