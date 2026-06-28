import type { ReactNode } from 'react';
import { Navigate, useLocation, useRouteLoaderData } from 'react-router';
import type { DataScope, Identity } from './api';

export const scopeNames: Record<DataScope, string> = {
  self: '本人',
  team: '团队',
  all: '全部',
};

/** 根路由 loader 的返回值；未登录时 identity 为 null。 */
export interface RootLoaderData {
  identity: Identity | null;
}

/**
 * 读取当前身份。
 *
 * 身份只来自根路由 loader 的返回值，而该 loader 在每次导航和刷新时都会重新向服务端确认会话，
 * 因此页面不会残留上一个账号的身份或权限状态。
 */
export function useIdentity(): Identity | null {
  const data = useRouteLoaderData('root') as RootLoaderData | undefined;
  return data?.identity ?? null;
}

/** 按权限码取出当前用户的有效授权（含数据范围）；没有该权限时返回 null。 */
export function usePermission(code: string) {
  const identity = useIdentity();
  return identity?.permissions.find((permission) => permission.code === code) ?? null;
}

/**
 * 认证守卫：未登录时不渲染受保护内容，而是跳转登录页。
 *
 * 全站判定顺序为认证 → 路由存在性 → 权限，认证必须最先完成，
 * 所以这里只判断“有没有身份”，权限由服务端接口与页面各自处理。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const location = useLocation();

  if (!identity) {
    // 记下来源路径，登录成功后回到用户原本想访问的页面。
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
