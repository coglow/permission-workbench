import type Database from 'better-sqlite3';

const teams = [
  ['team.growth', '增长团队'],
  ['team.delivery', '交付团队'],
] as const;

const users = [
  ['user.001', 'zhangsan', '张三', 'team.growth'],
  ['user.002', 'lisi', '李四', 'team.growth'],
  ['user.003', 'wangwu', '王五', 'team.delivery'],
  ['user.004', 'zhaoliu', '赵六', 'team.growth'],
  ['user.005', 'sunqi', '孙七', 'team.delivery'],
] as const;

// 最后一列，1：内置角色，0：非内置角色
const roles = [
  ['role.admin', '系统管理员', 1],
  ['role.pm', '项目经理', 0],
  ['role.member', '项目成员', 0],
] as const;

const permissions = [
  // 最后一列表示授权时是否必须指定数据范围，1：需要，0：不需要
  ['project.record.view', '业务记录查看', '项目记录', '查看', 1],
  ['project.record.create', '业务记录创建', '项目记录', '创建', 0],
  ['project.record.edit', '业务记录编辑', '项目记录', '编辑', 1],
  ['project.report.view', '项目报表查看', '项目报表', '查看', 1],
  ['system.user.assign', '用户角色分配', '用户', '分配角色', 0],
  ['system.role.manage', '角色管理', '角色', '管理', 0],
  ['system.menu.manage', '菜单路由管理', '菜单路由', '管理', 0],
] as const;

const userRoles = [
  ['user.001', 'role.admin'],
  ['user.002', 'role.pm'],
  ['user.003', 'role.pm'],
  // 有项目经理和项目成员两个角色；重叠权限应取较宽的团队范围。
  ['user.004', 'role.pm'],
  ['user.004', 'role.member'],
  ['user.005', 'role.member'],
] as const;

const rolePermissions = [
  // 范围为 null 表示该权限不使用数据范围。
  ['role.admin', 'project.record.view', 'all'],
  ['role.admin', 'project.record.create', null],
  ['role.admin', 'project.record.edit', 'all'],
  ['role.admin', 'system.user.assign', null],
  ['role.admin', 'system.role.manage', null],
  ['role.admin', 'system.menu.manage', null],
  ['role.pm', 'project.record.view', 'team'],
  ['role.pm', 'project.record.create', null],
  ['role.pm', 'project.record.edit', 'team'],
  ['role.member', 'project.record.view', 'self'],
  ['role.member', 'project.record.create', null],
  ['role.member', 'project.record.edit', 'self'],
] as const;

// 负责人、团队和状态逐条对应权限规则样例中的九条项目记录。
const projects = [
  ['P1', '春季拉新活动', 'user.002', 'team.growth', '进行中'],
  ['P2', '私域社群运营', 'user.002', 'team.growth', '进行中'],
  ['P3', '内容合作计划', 'user.004', 'team.growth', '规划中'],
  ['P4', '增长实验平台', 'user.004', 'team.growth', '进行中'],
  ['P5', '品牌联名企划', 'user.001', 'team.growth', '规划中'],
  ['P6', '客户交付自动化', 'user.003', 'team.delivery', '进行中'],
  ['P7', '海外站点改版', 'user.003', 'team.delivery', '进行中'],
  ['P8', '数据迁移专项', 'user.005', 'team.delivery', '进行中'],
  ['P9', '渠道投放复盘', 'user.005', 'team.delivery', '已完成'],
] as const;

export function seedIdentityData(database: Database.Database) {
  database.transaction(() => {
    const insertTeam = database.prepare('INSERT INTO teams (id, name) VALUES (?, ?)');
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
      'INSERT INTO roles (id, name, is_builtin) VALUES (?, ?, ?)',
    );
    roles.forEach((role) => insertRole.run(...role));

    const insertPermission = database.prepare(
      `INSERT INTO permissions
        (code, name, resource, operation, requires_data_scope)
       VALUES (?, ?, ?, ?, ?)`,
    );
    permissions.forEach((permission) => insertPermission.run(...permission));

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
  })();
}
