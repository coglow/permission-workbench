/** 前后端共用的固定业务定义；配置只能引用这些已经实现的能力。 */
export const DATA_SCOPES = ['self', 'team', 'all'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];
export const SCOPE_RANK: Record<DataScope, number> = { self: 1, team: 2, all: 3 };
export const SCOPE_NAMES: Record<DataScope, string> = {
  self: '本人',
  team: '团队及下级',
  all: '全部',
};
export const ENABLED_STATUSES = ['enabled', 'disabled'] as const;
export type EnabledStatus = (typeof ENABLED_STATUSES)[number];
export const PROJECT_STATUSES = ['规划中', '进行中', '已完成'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PERMISSION_CATALOG = [
  {
    code: 'project.record.view',
    name: '业务记录查看',
    resource: '项目记录',
    operation: '查看',
    requiresDataScope: true,
  },
  {
    code: 'project.record.create',
    name: '业务记录创建',
    resource: '项目记录',
    operation: '创建',
    requiresDataScope: false,
  },
  {
    code: 'project.record.edit',
    name: '业务记录编辑',
    resource: '项目记录',
    operation: '编辑',
    requiresDataScope: true,
  },
  {
    code: 'project.report.view',
    name: '项目报表查看',
    resource: '项目报表',
    operation: '查看',
    requiresDataScope: true,
  },
  {
    code: 'system.user.assign',
    name: '用户角色分配',
    resource: '用户',
    operation: '分配角色',
    requiresDataScope: false,
  },
  {
    code: 'system.role.manage',
    name: '角色管理',
    resource: '角色',
    operation: '管理',
    requiresDataScope: false,
  },
  {
    code: 'system.menu.manage',
    name: '菜单路由管理',
    resource: '菜单路由',
    operation: '管理',
    requiresDataScope: false,
  },
  {
    code: 'system.audit.view',
    name: '审计日志查看',
    resource: '审计日志',
    operation: '查看',
    requiresDataScope: false,
  },
] as const;
export type PermissionCode = (typeof PERMISSION_CATALOG)[number]['code'];
export interface PermissionCatalogEntry {
  code: PermissionCode;
  name: string;
  resource: string;
  operation: string;
  requiresDataScope: boolean;
}

/** 种子数据、服务端护栏与角色分配界面共用的内置管理员标识。 */
export const BUILTIN_ADMIN_USER_ID = 'user.001';
export const BUILTIN_ADMIN_ROLE_ID = 'role.admin';

/**
 * 内置菜单标识。
 *
 * 种子数据与只读护栏必须引用同一份定义：两处各写一份字面量时，
 * 改种子里的标识会让护栏静默失效，系统菜单变成可修改。
 */
export const SYSTEM_MENU_IDS = {
  directory: 'menu.system',
  roles: 'menu.system.roles',
  users: 'menu.system.users',
  menus: 'menu.system.menus',
  audit: 'menu.system.audit',
} as const;

/** 页面、路径和权限固定绑定；菜单只决定位置、标题、排序和启停。 */
export const PAGE_REGISTRY = [
  {
    component: 'ProjectList',
    name: '项目列表',
    path: '/projects/list',
    permissionCode: 'project.record.view',
  },
  {
    component: 'ProjectReport',
    name: '项目报表',
    path: '/projects/reports',
    permissionCode: 'project.report.view',
  },
  {
    component: 'RoleConfig',
    name: '角色配置',
    path: '/system/roles',
    permissionCode: 'system.role.manage',
  },
  {
    component: 'UserRoleAssign',
    name: '用户角色分配',
    path: '/system/users',
    permissionCode: 'system.user.assign',
  },
  {
    component: 'MenuConfig',
    name: '菜单路由配置',
    path: '/system/menus',
    permissionCode: 'system.menu.manage',
  },
  {
    component: 'AuditLog',
    name: '审计日志',
    path: '/system/audit',
    permissionCode: 'system.audit.view',
  },
] as const satisfies readonly {
  component: string;
  name: string;
  path: string;
  permissionCode: PermissionCode;
}[];
export type PageKey = (typeof PAGE_REGISTRY)[number]['component'];
export interface RegisteredPage {
  component: PageKey;
  name: string;
  path: string;
  permissionCode: PermissionCode;
}

export function findRegisteredPage(component: string) {
  return PAGE_REGISTRY.find((page) => page.component === component);
}

export function isDataScope(value: unknown): value is DataScope {
  return DATA_SCOPES.some((scope) => scope === value);
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return PROJECT_STATUSES.some((status) => status === value);
}

/** 每个角色自身满足编辑 属于 查看，多角色取并集后该约束仍成立。 */
export function getProjectEditGrantError(
  grants: readonly { code: PermissionCode; dataScope: DataScope | null }[],
): string | null {
  const edit = grants.find((grant) => grant.code === 'project.record.edit');
  if (!edit) return null;
  const view = grants.find((grant) => grant.code === 'project.record.view');
  if (!view?.dataScope) return '授予项目编辑权限时，必须同时授予项目查看权限';
  if (!edit.dataScope || SCOPE_RANK[edit.dataScope] > SCOPE_RANK[view.dataScope]) {
    return '项目编辑范围不能超过项目查看范围';
  }
  return null;
}
