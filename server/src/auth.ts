import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';

const SESSION_COOKIE = 'permission_workbench_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type DataScope = 'self' | 'team' | 'all';

interface UserRow {
  id: string;
  account: string;
  name: string;
  team_id: string;
  team_name: string;
}

interface PermissionRow {
  code: string;
  name: string;
  requires_data_scope: number;
  data_scope: DataScope | null;
}

interface EffectivePermission {
  code: string;
  name: string;
  dataScope: DataScope | null;
}

// 多个角色授予同一权限时，范围较宽者优先。
const scopeRank: Record<DataScope, number> = {
  self: 1,
  team: 2,
  all: 3,
};

// 页面脚本不能读取会话 Cookie；生产环境通过 HTTPS 提供服务时启用 Secure。
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function hashToken(token: string) {
  // SQLite 只保存摘要，读取数据库不会直接得到可用的会话 Cookie。
  return createHash('sha256').update(token).digest('hex');
}

export function readIdentity(database: Database.Database, userId: string) {
  const user = database
    .prepare(
      `SELECT u.id, u.account, u.name, t.id AS team_id, t.name AS team_name
       FROM users u
       JOIN teams t ON t.id = u.team_id
       WHERE u.id = ? AND u.status = 'enabled'`,
    )
    .get(userId) as UserRow | undefined;

  if (!user) return null;

  const roles = database
    .prepare(
      `SELECT r.id, r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.status = 'enabled'
       ORDER BY r.id`,
    )
    .all(userId) as Array<{ id: string; name: string }>;

  const permissionRows = database
    .prepare(
      `SELECT p.code, p.name, p.requires_data_scope, rp.data_scope
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.status = 'enabled'
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.code = rp.permission_code
       WHERE ur.user_id = ?
       ORDER BY p.code`,
    )
    .all(userId) as PermissionRow[];

  const effective = new Map<string, EffectivePermission>();
  for (const permission of permissionRows) {
    const needsScope = permission.requires_data_scope === 1;
    // 授权范围必须符合权限定义：需要范围的权限不能缺范围，不需要范围的权限不能带范围。
    if (needsScope !== (permission.data_scope !== null)) continue;

    const existing = effective.get(permission.code);
    if (!existing) {
      effective.set(permission.code, {
        code: permission.code,
        name: permission.name,
        dataScope: permission.data_scope,
      });
      continue;
    }

    // 多角色权限按并集合并；同一权限存在多个范围时保留最宽范围。
    if (
      permission.data_scope &&
      existing.dataScope &&
      scopeRank[permission.data_scope] > scopeRank[existing.dataScope]
    ) {
      existing.dataScope = permission.data_scope;
    }
  }

  return {
    user: {
      id: user.id,
      account: user.account,
      name: user.name,
      team: { id: user.team_id, name: user.team_name },
    },
    roles,
    permissions: [...effective.values()],
  };
}

function getSessionUserId(database: Database.Database, request: Request) {
  const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return null;

  const tokenHash = hashToken(token);
  // 以服务端会话记录为准；过期会话或已停用用户的会话都不能通过认证。
  const session = database
    .prepare(
      `SELECT s.user_id, s.expires_at, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as { user_id: string; expires_at: number; status: string } | undefined;

  if (!session || session.expires_at <= Date.now() || session.status !== 'enabled') {
    database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return session.user_id;
}

function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE, cookieOptions);
}

export function getAuthenticatedUserId(
  database: Database.Database,
  request: Request,
  response: Response,
) {
  const userId = getSessionUserId(database, request);
  if (!userId) {
    clearSessionCookie(response);
    response.status(401).json({ error: '未登录或会话已过期' });
    return null;
  }
  return userId;
}

export function createAuthRouter(database: Database.Database) {
  const router = Router();

  // 登录页未认证时也需要账号标签；这里只返回账号和姓名。
  router.get('/accounts', (_request, response) => {
    const accounts = database
      .prepare("SELECT account, name FROM users WHERE status = 'enabled' ORDER BY account")
      .all();
    response.json(accounts);
  });

  router.post('/login', (request, response) => {
    const account = (request.body as { account?: unknown } | undefined)?.account;
    if (typeof account !== 'string' || account.length === 0) {
      response.status(400).json({ error: '请选择体验账号' });
      return;
    }

    const user = database
      .prepare("SELECT id FROM users WHERE account = ? AND status = 'enabled'")
      .get(account) as { id: string } | undefined;
    if (!user) {
      response.status(401).json({ error: '体验账号不可用' });
      return;
    }

    const previousToken = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (previousToken) {
      // 切换账号时先撤销当前浏览器的旧会话，再签发新会话。
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(previousToken));
    }

    const token = randomBytes(32).toString('base64url');
    // 原始令牌只放入 HttpOnly Cookie；数据库仅保存摘要和统一的过期时间。
    const now = Date.now();
    database
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(hashToken(token), user.id, now, now + SESSION_TTL_MS);

    response.cookie(SESSION_COOKIE, token, {
      ...cookieOptions,
      maxAge: SESSION_TTL_MS,
    });
    response.json(readIdentity(database, user.id));
  });

  router.get('/me', (request, response) => {
    const userId = getAuthenticatedUserId(database, request, response);
    if (!userId) return;

    const identity = readIdentity(database, userId);
    if (!identity) {
      clearSessionCookie(response);
      response.status(401).json({ error: '未登录或会话已过期' });
      return;
    }

    response.json(identity);
  });

  router.post('/logout', (request, response) => {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) {
      // 删除服务端记录会立即使 Cookie 失效
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    }
    clearSessionCookie(response);
    response.status(204).end();
  });

  return router;
}
