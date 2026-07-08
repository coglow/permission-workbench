import { Router, type RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { requirePermission, readAccess } from './access.ts';
import { insertAuditLog } from './audit.ts';
import { readIdentity } from './auth.ts';
import { readBody, USER_COLUMNS, USER_SOURCE } from './util.ts';
import type { EnabledStatus, ManagedUser, UserRoleOption } from '../../shared/contracts.ts';
import { BUILTIN_ADMIN_ROLE_ID, BUILTIN_ADMIN_USER_ID } from '../../shared/catalog.ts';

// 只保护预置管理员账号；其他用户即使分配了管理员角色，也允许移除该分配。

// 分配请求的字段白名单：只接受整组角色 ID。
const ASSIGN_FIELDS = ['roleIds'];

interface UserRow {
  id: string;
  account: string;
  name: string;
  team_id: string;
  team_name: string;
}

interface AssignedRoleRow {
  id: string;
  name: string;
  status: EnabledStatus;
}

/** 预置用户列表；本版不提供新增或停用用户的接口，查询结果即全部用户。 */
function readUsers(database: Database.Database) {
  return database.prepare(`SELECT ${USER_COLUMNS} ${USER_SOURCE} ORDER BY u.id`).all() as UserRow[];
}

function findUser(database: Database.Database, id: string) {
  return database.prepare(`SELECT ${USER_COLUMNS} ${USER_SOURCE} WHERE u.id = ?`).get(id) as
    UserRow | undefined;
}

/** 已分配角色（含停用）：整组替换时表单要看到全部现有分配，避免误删。 */
function readAssignedRoles(database: Database.Database, userId: string) {
  return database
    .prepare(
      `SELECT r.id, r.name, r.status
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.id`,
    )
    .all(userId) as AssignedRoleRow[];
}

/** 角色候选项（含停用标记与内置标记），供分配表单使用。 */
function readRoleOptions(database: Database.Database): UserRoleOption[] {
  const rows = database
    .prepare('SELECT id, name, status, is_builtin FROM roles ORDER BY id')
    .all() as Array<{ id: string; name: string; status: EnabledStatus; is_builtin: number }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    builtin: row.is_builtin === 1,
  }));
}

/** 用户的对外结构：当前分配（含停用）＋ 按并集规则算出的有效权限。 */
function toUserResponse(database: Database.Database, user: UserRow): ManagedUser {
  // 有效权限复用身份读取的口径：停用角色不计入，多角色按并集取最宽数据范围。
  const identity = readIdentity(database, user.id);

  return {
    id: user.id,
    account: user.account,
    name: user.name,
    team: { id: user.team_id, name: user.team_name },
    roles: readAssignedRoles(database, user.id),
    permissions: identity?.permissions ?? [],
  };
}

export function createUsersRouter(database: Database.Database) {
  const router = Router();

  // 管理接口统一先做「认证 → system.user.assign」，不能只靠界面隐藏入口。
  const manageGuard = requirePermission(database, 'system.user.assign', {
    deniedMessage: '缺少用户角色分配权限',
  });

  router.get('/', manageGuard, (_request, response) => {
    const users = readUsers(database);

    response.json({
      // 角色候选项与用户一起返回，配置页用同一份数据渲染多选。
      roles: readRoleOptions(database),
      users: users.map((user) => toUserResponse(database, user)),
    });
  });

  // 分配：认证 → 权限 → 用户存在性 → 请求体校验 → 护栏 → 写库（整组替换）。
  const assignRoles: RequestHandler<{ id: string }> = (request, response) => {
    // 用户存在性先于请求体校验：不存在的用户不会因请求体差异得到不同结果。
    const user = findUser(database, request.params.id);
    if (!user) {
      response.status(404).json({ error: '用户不存在' });
      return;
    }

    const parsed = readBody(request.body, ASSIGN_FIELDS);
    if (!parsed.ok) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const body = parsed.value;

    const roleIds = body.roleIds;
    if (!Array.isArray(roleIds)) {
      response.status(400).json({ error: '角色列表必须是数组' });
      return;
    }
    if (!roleIds.every((roleId) => typeof roleId === 'string' && roleId.length > 0)) {
      response.status(400).json({ error: '角色列表只能包含角色 ID 字符串' });
      return;
    }

    const unique = new Set<string>();
    for (const roleId of roleIds as string[]) {
      if (unique.has(roleId)) {
        response.status(400).json({ error: `角色重复：${roleId}` });
        return;
      }
      unique.add(roleId);
    }

    // 角色必须存在；停用角色允许被分配或保留，但不产生授权。
    for (const roleId of unique) {
      if (!database.prepare('SELECT id FROM roles WHERE id = ?').get(roleId)) {
        response.status(400).json({ error: `角色不存在：${roleId}` });
        return;
      }
    }

    // 护栏：内置管理员账号的管理员角色分配不可移除，可另行添加其他角色。
    // 需要先读出 roleIds 才能判断"是否包含"，因此护栏排在请求体校验之后。
    if (user.id === BUILTIN_ADMIN_USER_ID && !unique.has(BUILTIN_ADMIN_ROLE_ID)) {
      response.status(403).json({ error: '内置管理员账号的管理员角色不可移除' });
      return;
    }

    // 摘要在事务外构造，便于审计文案统一。
    // 角色名按当前 roles 表查询；停用角色名照常出现，便于审计回溯。
    const roleNames = Array.from(unique).map((roleId) => {
      const row = database.prepare('SELECT name FROM roles WHERE id = ?').get(roleId) as
        { name: string } | undefined;
      return row?.name ?? roleId;
    });

    database.transaction(() => {
      database.prepare('DELETE FROM user_roles WHERE user_id = ?').run(user.id);
      const insertRole = database.prepare(
        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      );
      for (const roleId of unique) {
        insertRole.run(user.id, roleId);
      }

      // 审计：与分配写入同一事务，进退一致。
      insertAuditLog(database, readAccess(response), {
        action: 'user.assign',
        targetType: 'user',
        targetId: user.id,
        targetName: user.name,
        summary: `角色：${roleNames.join(' + ') || '（无）'}`,
      });
    })();

    // 重新读取，返回更新后的分配与有效权限。
    response.json(toUserResponse(database, user));
  };

  router.put('/:id/roles', manageGuard, assignRoles);

  return router;
}
