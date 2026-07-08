import type {
  DataScope,
  EnabledStatus,
  PageKey,
  PermissionCode,
  ProjectStatus,
} from '../../../shared/contracts.ts';
import {
  BUILTIN_ADMIN_ROLE_ID,
  BUILTIN_ADMIN_USER_ID,
  PERMISSION_CATALOG,
  SYSTEM_MENU_IDS,
} from '../../../shared/catalog.ts';
import type Database from 'better-sqlite3';

// 组织层级：列顺序为标识、名称、上级（null 表示顶层），父级必须先于子级插入（自引用外键）。
const teams = [
  ['team.platform', '平台团队', null],
  ['team.business', '业务中心', 'team.platform'],
  ['team.growth', '增长团队', 'team.business'],
  ['team.delivery', '交付团队', 'team.business'],
  ['team.payment', '支付团队', 'team.platform'],
] as const;

const users = [
  [BUILTIN_ADMIN_USER_ID, 'zhangsan', '张三', 'team.platform'],
  ['user.002', 'lisi', '李四', 'team.growth'],
  ['user.003', 'wangwu', '王五', 'team.delivery'],
  ['user.004', 'zhaoliu', '赵六', 'team.growth'],
  ['user.005', 'sunqi', '孙七', 'team.delivery'],
  ['user.006', 'zhouba', '周八', 'team.business'],
  ['user.007', 'qianjiu', '钱九', 'team.payment'],
] as const;

// 最后一列，1：内置角色，0：非内置角色
const roles = [
  [BUILTIN_ADMIN_ROLE_ID, '系统管理员', '内置管理员角色，只读，不可修改', 1],
  ['role.pm', '项目经理', '业务角色，项目记录可见范围为所在团队及下级团队', 0],
  ['role.member', '项目成员', '业务角色，项目记录可见范围为本人', 0],
] as const;

const userRoles = [
  [BUILTIN_ADMIN_USER_ID, BUILTIN_ADMIN_ROLE_ID],
  ['user.002', 'role.pm'],
  ['user.003', 'role.pm'],
  // 有项目经理和项目成员两个角色；重叠权限应取较宽的团队范围。
  ['user.004', 'role.pm'],
  ['user.004', 'role.member'],
  ['user.005', 'role.member'],
  ['user.006', 'role.pm'],
  ['user.007', 'role.member'],
] as const;

const rolePermissions = [
  // 范围为 null 表示该权限不使用数据范围。
  [BUILTIN_ADMIN_ROLE_ID, 'project.record.view', 'all'],
  [BUILTIN_ADMIN_ROLE_ID, 'project.record.create', null],
  [BUILTIN_ADMIN_ROLE_ID, 'project.record.edit', 'all'],
  [BUILTIN_ADMIN_ROLE_ID, 'system.user.assign', null],
  [BUILTIN_ADMIN_ROLE_ID, 'system.role.manage', null],
  [BUILTIN_ADMIN_ROLE_ID, 'system.menu.manage', null],
  [BUILTIN_ADMIN_ROLE_ID, 'system.audit.view', null],
  ['role.pm', 'project.record.view', 'team'],
  ['role.pm', 'project.record.create', null],
  ['role.pm', 'project.record.edit', 'team'],
  ['role.member', 'project.record.view', 'self'],
  ['role.member', 'project.record.create', null],
  ['role.member', 'project.record.edit', 'self'],
] as const satisfies readonly (readonly [string, PermissionCode, DataScope | null])[];

const menus = [
  ['menu.projects', null, '项目管理', null, 10, 'enabled'],
  ['menu.projects.list', 'menu.projects', '项目列表', 'ProjectList', 10, 'enabled'],
  [SYSTEM_MENU_IDS.directory, null, '系统管理', null, 90, 'enabled'],
  [SYSTEM_MENU_IDS.roles, SYSTEM_MENU_IDS.directory, '角色配置', 'RoleConfig', 10, 'enabled'],
  [
    SYSTEM_MENU_IDS.users,
    SYSTEM_MENU_IDS.directory,
    '用户角色分配',
    'UserRoleAssign',
    20,
    'enabled',
  ],
  [SYSTEM_MENU_IDS.menus, SYSTEM_MENU_IDS.directory, '菜单路由配置', 'MenuConfig', 30, 'enabled'],
  [SYSTEM_MENU_IDS.audit, SYSTEM_MENU_IDS.directory, '审计日志', 'AuditLog', 40, 'enabled'],
] as const satisfies readonly (readonly [
  string,
  string | null,
  string,
  PageKey | null,
  number,
  EnabledStatus,
])[];
const projects = [
  ['P1', '春季拉新活动', 'user.002', 'team.growth', '进行中'],
  ['P2', '私域社群运营', 'user.002', 'team.growth', '进行中'],
  ['P3', '内容合作计划', 'user.004', 'team.growth', '规划中'],
  ['P4', '增长实验平台', 'user.004', 'team.growth', '进行中'],
  ['P5', '品牌联名企划', 'user.002', 'team.growth', '规划中'],
  ['P6', '客户交付自动化', 'user.003', 'team.delivery', '进行中'],
  ['P7', '海外站点改版', 'user.003', 'team.delivery', '进行中'],
  ['P8', '数据迁移专项', 'user.005', 'team.delivery', '进行中'],
  ['P9', '渠道投放复盘', 'user.005', 'team.delivery', '已完成'],
  ['P10', '支付通道接入', 'user.007', 'team.payment', '进行中'],
  ['P11', '对账系统升级', 'user.007', 'team.payment', '规划中'],
] as const satisfies readonly (readonly [string, string, string, string, ProjectStatus])[];

const auditLogs = [
  [
    BUILTIN_ADMIN_USER_ID,
    '张三',
    'role.update',
    'role',
    'role.pm',
    '项目经理',
    '授权 3 项（项目记录查看-团队、项目记录创建、项目记录编辑-团队）',
    '2026-09-29 09:12:30.000',
  ],
  [
    BUILTIN_ADMIN_USER_ID,
    '张三',
    'user.assign',
    'user',
    'user.004',
    '赵六',
    '角色：项目经理 + 项目成员',
    '2026-09-29 10:24:11.000',
  ],
  [
    BUILTIN_ADMIN_USER_ID,
    '张三',
    'menu.create',
    'menu',
    'menu.system.audit',
    '审计日志',
    '仅拥有「审计日志查看」权限的用户可见',
    '2026-09-29 14:05:48.000',
  ],
] as const;

export function seedIdentityData(database: Database.Database) {
  database.transaction(() => {
    const insertTeam = database.prepare('INSERT INTO teams (id, name, parent_id) VALUES (?, ?, ?)');
    teams.forEach((team) => insertTeam.run(...team));

    const insertUser = database.prepare(
      'INSERT INTO users (id, account, name, team_id) VALUES (?, ?, ?, ?)',
    );
    users.forEach((user) => insertUser.run(...user));

    const insertProject = database.prepare(
      `INSERT INTO projects (id, name, owner_id, team_id, status)
       VALUES (?, ?, ?, ?, ?)`,
    );
    projects.forEach((project) => insertProject.run(...project));

    const insertRole = database.prepare(
      'INSERT INTO roles (id, name, description, is_builtin) VALUES (?, ?, ?, ?)',
    );
    roles.forEach((role) => insertRole.run(...role));

    const insertPermission = database.prepare(
      `INSERT INTO permissions
        (code, name, resource, operation, requires_data_scope)
       VALUES (?, ?, ?, ?, ?)`,
    );
    PERMISSION_CATALOG.forEach((permission) =>
      insertPermission.run(
        permission.code,
        permission.name,
        permission.resource,
        permission.operation,
        Number(permission.requiresDataScope),
      ),
    );

    const insertUserRole = database.prepare(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
    );
    userRoles.forEach((userRole) => insertUserRole.run(...userRole));

    const insertRolePermission = database.prepare(
      `INSERT INTO role_permissions
        (role_id, permission_code, data_scope)
       VALUES (?, ?, ?)`,
    );
    rolePermissions.forEach((grant) => insertRolePermission.run(...grant));

    const insertMenu = database.prepare(
      `INSERT INTO menus (id, parent_id, title, component, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    // menus 数组已按父级在前、子级在后的顺序排列，满足 parent_id 外键。
    menus.forEach((menu) => insertMenu.run(...menu));

    const insertAuditLog = database.prepare(
      `INSERT INTO audit_logs
        (actor_user_id, actor_name, action, target_type, target_id, target_name, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    auditLogs.forEach((log) => insertAuditLog.run(...log));
  })();
}
