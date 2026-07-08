import type {
  DataScope,
  EnabledStatus,
  PageKey,
  PermissionCode,
  ProjectStatus,
  RegisteredPage,
} from './catalog.ts';
export type {
  DataScope,
  EnabledStatus,
  PageKey,
  PermissionCode,
  PermissionCatalogEntry,
  ProjectStatus,
  RegisteredPage,
} from './catalog.ts';
import type { PermissionCatalogEntry } from './catalog.ts';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface Team {
  id: string;
  name: string;
}
export interface Role {
  id: string;
  name: string;
}
export interface Permission {
  code: PermissionCode;
  name: string;
  dataScope: DataScope | null;
}
export interface Identity {
  user: { id: string; account: string; name: string; team: Team };
  roles: Role[];
  permissions: Permission[];
}
export interface Account {
  account: string;
  name: string;
  team: Team;
  roles: Role[];
}
export interface Project {
  id: string;
  name: string;
  owner: { id: string; name: string };
  team: Team;
  status: ProjectStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}
/** 详情额外携带当前用户对该记录的编辑能力，前端不重复计算数据范围。 */
export interface ProjectDetail extends Project {
  canEdit: boolean;
}
/** 负责人和团队由服务端写入，创建与编辑均不接受这两个字段。 */
export interface ProjectInput {
  name: string;
  status: ProjectStatus;
  description?: string;
}
export interface NavigationNode {
  id: string;
  path: string | null;
  title: string;
  component: PageKey | null;
  permissionCode: PermissionCode | null;
  children: NavigationNode[];
}
/** 全部启用的页面用于区分 404/403；导航只含当前用户可见的页面。 */
export interface ConfiguredRoute {
  path: string;
  component: PageKey;
  permissionCode: PermissionCode;
}
export interface NavigationPayload {
  routes: ConfiguredRoute[];
  navigation: NavigationNode[];
}
export interface RoleGrant {
  code: PermissionCode;
  dataScope: DataScope | null;
}
export interface RoleRecord {
  id: string;
  name: string;
  description: string;
  status: EnabledStatus;
  builtin: boolean;
  permissions: RoleGrant[];
}
export interface RoleCatalog {
  permissions: readonly PermissionCatalogEntry[];
  roles: RoleRecord[];
}
export type RolePermissionInput = { code: PermissionCode; dataScope?: DataScope | null };
export interface UserRoleOption {
  id: string;
  name: string;
  status: EnabledStatus;
  builtin: boolean;
}
export interface UserAssignedRole {
  id: string;
  name: string;
  status: EnabledStatus;
}
export interface ManagedUser {
  id: string;
  account: string;
  name: string;
  team: Team;
  roles: UserAssignedRole[];
  permissions: Permission[];
}
export interface UserCatalog {
  roles: UserRoleOption[];
  users: ManagedUser[];
}
export interface MenuNode {
  id: string;
  parentId: string | null;
  title: string;
  path: string | null;
  component: PageKey | null;
  permissionCode: PermissionCode | null;
  sortOrder: number;
  status: EnabledStatus;
  system: boolean;
  children?: MenuNode[];
}
export interface MenuCatalog {
  pages: readonly RegisteredPage[];
  menus: MenuNode[];
}
/** 页面标识决定路径和权限，请求不能自行绑定。 */
export interface MenuInput {
  parentId: string | null;
  title: string;
  component: PageKey | null;
  sortOrder: number;
}
export type MenuUpdateInput = Partial<MenuInput> & { status?: EnabledStatus };
export interface ProjectReportSummary {
  total: number;
  byStatus: Record<ProjectStatus, number>;
}
export interface AuditLogEntry {
  id: number;
  actorUserId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  summary: string;
  createdAt: string;
}
