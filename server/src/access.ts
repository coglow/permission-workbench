import type { RequestHandler, Response } from 'express';
import type Database from 'better-sqlite3';
import { getAuthenticatedUserId, readIdentity, type Identity } from './auth.ts';

export type DataScope = 'self' | 'team' | 'all';

/**
 * 由 requirePermission 校验通过后写入 response.locals，供后续守卫与处理函数读取，
 * 避免每个接口各自再查一遍身份与授权。
 */
export interface AccessContext {
  userId: string;
  identity: Identity;
  permission: {
    code: string;
    name: string;
    /** 不带数据范围的权限点（如 project.record.create）这里为 null。 */
    dataScope: DataScope | null;
  };
}

/** 读取访问上下文*/
export function readAccess(response: Response): AccessContext {
  const access = response.locals.access as AccessContext | undefined;
  if (!access) {
    throw new Error('缺少访问上下文：requirePermission 必须先于该守卫与处理函数执行');
  }
  return access;
}

/** 读取当前操作的数据范围；requireDataScope 为 true 的路由保证它有值。 */
export function readDataScope(access: AccessContext): DataScope {
  if (!access.permission.dataScope) {
    throw new Error(`权限 ${access.permission.code} 未携带数据范围，请检查路由声明`);
  }
  return access.permission.dataScope;
}

/**
 * 数据范围判定，口径与列表过滤完全一致：
 * 本人＝记录负责人为当前用户、团队＝记录所属团队为当前用户团队、全部＝不过滤。
 */
export function isWithinDataScope(
  scope: DataScope,
  record: { ownerId: string; teamId: string },
  access: AccessContext,
): boolean {
  if (scope === 'self') return record.ownerId === access.userId;
  if (scope === 'team') return record.teamId === access.identity.user.team.id;
  return true;
}

/**
 * 认证 → 操作权限。
 *
 * 这两步与具体资源无关，因此必须先于资源存在性判断：
 * 无有效会话返回 401（同时清理失效 Cookie），缺少权限码返回 403，
 * 因此无权限的用户无法通过状态码差异探测某个 ID 是否存在。
 */
export function requirePermission(
  database: Database.Database,
  code: string,
  options: { requireDataScope?: boolean; deniedMessage?: string } = {},
): RequestHandler {
  const { requireDataScope = false, deniedMessage = '缺少操作权限' } = options;

  return (request, response, next) => {
    const userId = getAuthenticatedUserId(database, request, response);
    if (!userId) return;

    const identity = readIdentity(database, userId);
    if (!identity) {
      response.status(401).json({ error: '未登录或会话已过期' });
      return;
    }

    const permission = identity.permissions.find((item) => item.code === code);
    // 带数据范围的权限点：授权缺失或未携带范围都按缺少权限处理。
    if (!permission || (requireDataScope && !permission.dataScope)) {
      response.status(403).json({ error: deniedMessage });
      return;
    }

    response.locals.access = { userId, identity, permission } satisfies AccessContext;
    next();
  };
}
