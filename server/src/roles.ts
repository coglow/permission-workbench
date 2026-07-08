import { Router, type RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { requirePermission, readAccess } from './access.ts';
import { insertAuditLog } from './audit.ts';
import { readBody } from './util.ts';
import {
  getProjectEditGrantError,
  isDataScope,
  PERMISSION_CATALOG,
  SCOPE_NAMES,
} from '../../shared/catalog.ts';
import type { EnabledStatus, ParseResult, RoleGrant, RoleRecord } from '../../shared/contracts.ts';

const CREATE_FIELDS = ['name', 'description', 'permissions'];
const UPDATE_FIELDS = [...CREATE_FIELDS, 'status'];
interface RoleRow {
  id: string;
  name: string;
  description: string;
  status: EnabledStatus;
  is_builtin: number;
}
interface RoleValues {
  name: string;
  description: string;
  status: EnabledStatus;
  permissions: RoleGrant[];
}

function findRole(database: Database.Database, id: string) {
  return database
    .prepare('SELECT id, name, description, status, is_builtin FROM roles WHERE id = ?')
    .get(id) as RoleRow | undefined;
}

/** 单个角色的授权：创建与编辑只需回读一个角色。 */
function readRoleGrants(database: Database.Database, roleId: string): RoleGrant[] {
  return database
    .prepare(
      'SELECT permission_code AS code, data_scope AS dataScope FROM role_permissions WHERE role_id = ? ORDER BY permission_code',
    )
    .all(roleId) as RoleGrant[];
}

/**
 * 一次读取全部角色的授权并按角色分组。
 *
 * 角色数量随配置增长（列表页可以新增角色），列表接口按角色逐条查询会让一次请求的
 * SQL 条数线性增长，因此这里与 GET /api/auth/accounts 采用同一套批量口径。
 */
function readGrantsByRole(database: Database.Database) {
  const rows = database
    .prepare(
      `SELECT role_id, permission_code AS code, data_scope AS dataScope
       FROM role_permissions
       ORDER BY role_id, permission_code`,
    )
    .all() as Array<RoleGrant & { role_id: string }>;

  const grantsByRole = new Map<string, RoleGrant[]>();
  for (const { role_id, code, dataScope } of rows) {
    const grants = grantsByRole.get(role_id) ?? [];
    grants.push({ code, dataScope });
    grantsByRole.set(role_id, grants);
  }
  return grantsByRole;
}

function toRoleResponse(role: RoleRow, permissions: RoleGrant[]): RoleRecord {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    status: role.status,
    builtin: role.is_builtin === 1,
    permissions,
  };
}

/** 整组授权先校验单项，再校验编辑与查看的包含关系；失败时不写任何数据。 */
function parseGrantList(raw: unknown): ParseResult<RoleGrant[]> {
  if (!Array.isArray(raw)) return { ok: false, error: '授权集合必须是数组' };
  const grants: RoleGrant[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = readBody(item, ['code', 'dataScope']);
    if (!parsed.ok) return { ok: false, error: `授权项：${parsed.error}` };
    const { code, dataScope } = parsed.value;
    const permission = PERMISSION_CATALOG.find((entry) => entry.code === code);
    if (!permission) return { ok: false, error: `权限 ${String(code)} 不存在` };
    if (seen.has(permission.code)) return { ok: false, error: `权限「${permission.name}」重复` };
    seen.add(permission.code);
    if (permission.requiresDataScope) {
      if (!isDataScope(dataScope))
        return {
          ok: false,
          error: `权限「${permission.name}」必须指定可见范围（本人／团队／全部）`,
        };
      grants.push({ code: permission.code, dataScope });
    } else {
      if (dataScope !== undefined && dataScope !== null)
        return { ok: false, error: `权限「${permission.name}」不设置可见范围` };
      grants.push({ code: permission.code, dataScope: null });
    }
  }
  const error = getProjectEditGrantError(grants);
  return error ? { ok: false, error } : { ok: true, value: grants };
}

/** PATCH 只覆盖提交的字段，缺省字段取当前值；创建的状态固定为启用。 */
function parseRoleInput(
  database: Database.Database,
  raw: unknown,
  role?: RoleRow,
): ParseResult<RoleValues> {
  const parsed = readBody(raw, role ? UPDATE_FIELDS : CREATE_FIELDS, {
    id: '角色标识由系统生成，不能手动提交',
  });
  if (!parsed.ok) return parsed;
  const body = parsed.value;
  if (role && Object.keys(body).length === 0) return { ok: false, error: '没有可更新的字段' };
  const name = body.name === undefined ? role?.name : body.name;
  if (typeof name !== 'string' || name.trim().length === 0)
    return { ok: false, error: '角色名称不能为空' };
  if (
    database
      .prepare('SELECT id FROM roles WHERE name = ? AND id <> ?')
      .get(name.trim(), role?.id ?? '')
  )
    return { ok: false, error: '角色名称已存在' };
  const description = body.description === undefined ? (role?.description ?? '') : body.description;
  if (typeof description !== 'string') return { ok: false, error: '角色说明格式不正确' };
  const status = body.status === undefined ? (role?.status ?? 'enabled') : body.status;
  if (status !== 'enabled' && status !== 'disabled')
    return { ok: false, error: '角色状态只能是 enabled 或 disabled' };
  const permissions =
    body.permissions === undefined
      ? { ok: true as const, value: role ? readRoleGrants(database, role.id) : [] }
      : parseGrantList(body.permissions);
  if (!permissions.ok) return permissions;
  return {
    ok: true,
    value: {
      name: name.trim(),
      description: description.trim(),
      status,
      permissions: permissions.value,
    },
  };
}

/** 使用权限名称描述增减与范围变化，数量相同也不会漏掉关键变更。 */
function summarizeGrantChanges(before: RoleGrant[], after: RoleGrant[]): string[] {
  const old = new Map(before.map((grant) => [grant.code, grant]));
  const current = new Map(after.map((grant) => [grant.code, grant]));
  const changes: string[] = [];
  for (const permission of PERMISSION_CATALOG) {
    const previous = old.get(permission.code);
    const next = current.get(permission.code);
    if (!previous && next)
      changes.push(
        `新增「${permission.name}」${next.dataScope ? `（${SCOPE_NAMES[next.dataScope]}）` : ''}`,
      );
    if (previous && !next) changes.push(`移除「${permission.name}」`);
    if (previous && next && previous.dataScope !== next.dataScope) {
      changes.push(
        `「${permission.name}」范围：${previous.dataScope ? SCOPE_NAMES[previous.dataScope] : '无范围'} → ${next.dataScope ? SCOPE_NAMES[next.dataScope] : '无范围'}`,
      );
    }
  }
  return changes;
}

function writeRoleGrants(database: Database.Database, id: string, grants: RoleGrant[]) {
  database.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
  const insert = database.prepare(
    'INSERT INTO role_permissions (role_id, permission_code, data_scope) VALUES (?, ?, ?)',
  );
  for (const grant of grants) insert.run(id, grant.code, grant.dataScope);
}

export function createRolesRouter(database: Database.Database) {
  const router = Router();
  const guard = requirePermission(database, 'system.role.manage', {
    deniedMessage: '缺少角色管理权限',
  });
  router.get('/', guard, (_request, response) => {
    const rows = database
      .prepare('SELECT id, name, description, status, is_builtin FROM roles ORDER BY id')
      .all() as RoleRow[];
    const grantsByRole = readGrantsByRole(database);
    response.json({
      permissions: PERMISSION_CATALOG,
      roles: rows.map((role) => toRoleResponse(role, grantsByRole.get(role.id) ?? [])),
    });
  });

  router.post('/', guard, (request, response) => {
    const parsed = parseRoleInput(database, request.body);
    if (!parsed.ok) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const role = parsed.value;
    let index = 1;
    while (findRole(database, `role.${index}`)) index++;
    const id = `role.${index}`;
    // 角色、授权和审计必须在同一事务中写入。
    database.transaction(() => {
      database
        .prepare(
          "INSERT INTO roles (id, name, description, status, is_builtin) VALUES (?, ?, ?, 'enabled', 0)",
        )
        .run(id, role.name, role.description);
      writeRoleGrants(database, id, role.permissions);
      insertAuditLog(database, readAccess(response), {
        action: 'role.create',
        targetType: 'role',
        targetId: id,
        targetName: role.name,
        summary: summarizeGrantChanges([], role.permissions).join('；') || '创建无授权角色',
      });
    })();
    response
      .status(201)
      .json(toRoleResponse(findRole(database, id)!, readRoleGrants(database, id)));
  });

  const update: RequestHandler<{ id: string }> = (request, response) => {
    const role = findRole(database, request.params.id);
    if (!role) {
      response.status(404).json({ error: '角色不存在' });
      return;
    }
    if (role.is_builtin === 1) {
      response.status(403).json({ error: '内置管理员角色不可修改' });
      return;
    }
    const parsed = parseRoleInput(database, request.body, role);
    if (!parsed.ok) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const next = parsed.value;
    const changes: string[] = [];
    if (next.name !== role.name) changes.push(`名称「${role.name}」→「${next.name}」`);
    if (next.description !== role.description) changes.push('修改角色说明');
    if (next.status !== role.status)
      changes.push(`状态：${next.status === 'enabled' ? '启用' : '停用'}`);
    changes.push(...summarizeGrantChanges(readRoleGrants(database, role.id), next.permissions));
    database.transaction(() => {
      database
        .prepare('UPDATE roles SET name = ?, description = ?, status = ? WHERE id = ?')
        .run(next.name, next.description, next.status, role.id);
      writeRoleGrants(database, role.id, next.permissions);
      insertAuditLog(database, readAccess(response), {
        action: 'role.update',
        targetType: 'role',
        targetId: role.id,
        targetName: next.name,
        summary: changes.join('；') || '未检测到字段变化',
      });
    })();
    response.json(toRoleResponse(findRole(database, role.id)!, readRoleGrants(database, role.id)));
  };
  router.patch('/:id', guard, update);
  return router;
}
