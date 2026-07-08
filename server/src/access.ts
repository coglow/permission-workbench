import type { RequestHandler, Response } from 'express';
import type Database from 'better-sqlite3';
import { getAuthenticatedUserId, readIdentity, type Identity } from './auth.ts';
import { collectTeamSubtreeIds, type TeamHierarchyRow } from './util.ts';
import type { DataScope, PermissionCode } from '../../shared/contracts.ts';

/**
 * 由 requirePermission 校验通过后写入 response.locals，供后续守卫与处理函数读取，
 * 避免每个接口各自再查一遍身份与授权。
 */
export interface AccessContext {
  userId: string;
  identity: Identity;
  permission: {
    code: PermissionCode;
    name: string;
    /** 不带数据范围的权限点（如 project.record.create）这里为 null。 */
    dataScope: DataScope | null;
  };
  teamScopeIds: string[];
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
 * 读取当前请求计算好的团队数据范围。
 *
 * teamScopeIds 只在声明 requireDataScope 的路由上计算（见 requirePermission），为空说明
 * 路由声明漏了 requireDataScope；这里直接报错，避免生成 `IN ()` 或静默把全部记录判成越权。
 */
function readTeamScopeIds(access: AccessContext) {
  if (access.teamScopeIds.length === 0) {
    throw new Error('缺少团队数据范围：该路由必须在 requirePermission 声明 requireDataScope');
  }
  return access.teamScopeIds;
}

/**
 * 数据范围判定，口径与列表过滤完全一致：
 * 本人＝记录负责人为当前用户、团队＝记录所属团队在“所在团队及下级团队内”、全部＝不过滤。
 */
export function isWithinDataScope(
  scope: DataScope,
  record: { ownerId: string; teamId: string },
  access: AccessContext,
): boolean {
  if (scope === 'self') return record.ownerId === access.userId;
  if (scope === 'team') return readTeamScopeIds(access).includes(record.teamId);
  return true;
}

/**
 * 把数据范围编译成 SQL 条件与参数。
 *
 * “团队”档位覆盖的是一组团队（所在团队及其下级），所以生成 IN 列表而不是单值比较。
 */
export function buildDataScopeFilter(
  scope: DataScope,
  access: AccessContext,
  columns: { ownerColumn: string; teamColumn: string },
): { sql: string | null; params: string[] } {
  if (scope === 'self') {
    return { sql: `${columns.ownerColumn} = ?`, params: [access.userId] };
  }
  if (scope === 'team') {
    const teamScopeIds = readTeamScopeIds(access);
    return {
      sql: `${columns.teamColumn} IN (${teamScopeIds.map(() => '?').join(', ')})`,
      params: [...teamScopeIds],
    };
  }
  return { sql: null, params: [] };
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
  code: PermissionCode,
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

    response.locals.access = {
      userId,
      identity,
      permission,
      // 团队范围只被带数据范围的权限点使用，其余接口不必为此读一次团队表。
      teamScopeIds: requireDataScope ? readTeamSubtreeIds(database, identity.user.team.id) : [],
    } satisfies AccessContext;
    next();
  };
}

function readTeamSubtreeIds(database: Database.Database, teamId: string) {
  const teams = database.prepare('SELECT id, parent_id FROM teams').all() as TeamHierarchyRow[];
  return collectTeamSubtreeIds(teams, teamId);
}
