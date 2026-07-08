import type {
  Account,
  AuditLogEntry,
  EnabledStatus,
  Identity,
  ManagedUser,
  MenuCatalog,
  MenuInput,
  MenuNode,
  MenuUpdateInput,
  NavigationPayload,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectReportSummary,
  ProjectStatus,
  RoleCatalog,
  RolePermissionInput,
  RoleRecord,
  UserCatalog,
} from '../../shared/contracts.ts';

/**
 * 前端访问 Node API 的统一入口。
 *
 * 会话 Cookie 为 HttpOnly，脚本读不到，因此所有请求都依赖浏览器自动携带同源凭证。
 * 服务端返回 401（未登录或会话失效）与 403（无权限）时统一抛出 ApiError，
 * 由调用方按业务语义分别处理，避免状态码判断散落在页面代码里。
 */

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  规划中: 'default',
  进行中: 'blue',
  已完成: 'green',
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * 业务请求收到 403 时的回调：由路由层注册（见 router.tsx）。
 *
 * 权限可能在页面停留期间被收回，403 时同步刷新身份与导航，
 * 让入口按最新权限更新，而不是等用户下次刷新页面。
 */
let forbiddenHandler: (() => void) | null = null;

export function setForbiddenHandler(handler: () => void) {
  forbiddenHandler = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // 声明 Content-Type 而不是直接透传 headers，避免调用方漏写导致服务端解析不到 JSON。
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...init, credentials: 'same-origin', headers });

  if (!response.ok) {
    // 403 说明当前授权已不足以完成操作：通知注册方刷新身份与导航。
    if (response.status === 403) forbiddenHandler?.();

    // 服务端的错误分支都返回 { error }，尽量把原文透出给页面。
    let message = `请求失败，请稍后重试……`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {}
    throw new ApiError(response.status, message);
  }

  // 退出登录返回 204，没有响应体。
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const fetchAccounts = (signal?: AbortSignal) =>
  request<Account[]>('/api/auth/accounts', { signal });

/** 查询当前身份；未登录时服务端返回 401，这里转成 null 交给路由按“未登录”处理。 */
export async function fetchIdentity(signal?: AbortSignal): Promise<Identity | null> {
  try {
    return await request<Identity>('/api/auth/me', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** 登录并返回新账号的身份；服务端会同时撤销当前浏览器上的旧会话。 */
export const login = (account: string) =>
  request<Identity>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account }),
  });

export const logout = () => request<void>('/api/auth/logout', { method: 'POST' });

/** 导航查询需要登录；根 loader 只在确认已登录后调用，避免未登录时的 401 进入错误边界。 */
export const fetchNavigation = (signal?: AbortSignal) =>
  request<NavigationPayload>('/api/navigation', { signal });

export const fetchRoleCatalog = (signal?: AbortSignal) =>
  request<RoleCatalog>('/api/roles', { signal });

/** 角色标识由服务端生成：创建与编辑请求都不提交标识。 */
export const createRole = (input: {
  name: string;
  description?: string;
  permissions: RolePermissionInput[];
}) => request<RoleRecord>('/api/roles', { method: 'POST', body: JSON.stringify(input) });

export const updateRole = (
  id: string,
  input: {
    name?: string;
    description?: string;
    status?: EnabledStatus;
    permissions?: RolePermissionInput[];
  },
) =>
  request<RoleRecord>(`/api/roles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const fetchUserCatalog = (signal?: AbortSignal) =>
  request<UserCatalog>('/api/users', { signal });

/** 整组替换用户的角色分配；请求未列出的角色会被移除（内置管理员账号除外）。 */
export const assignUserRoles = (id: string, roleIds: string[]) =>
  request<ManagedUser>(`/api/users/${encodeURIComponent(id)}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roleIds }),
  });

export const fetchMenuCatalog = (signal?: AbortSignal) =>
  request<MenuCatalog>('/api/menus', { signal });

export const createMenu = (input: MenuInput) =>
  request<MenuNode>('/api/menus', { method: 'POST', body: JSON.stringify(input) });

export const updateMenu = (id: string, input: MenuUpdateInput) =>
  request<MenuNode>(`/api/menus/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const fetchProjectReport = (signal?: AbortSignal) =>
  request<ProjectReportSummary>('/api/reports/projects', { signal });

export const fetchAuditLogs = (signal?: AbortSignal) =>
  request<{ items: AuditLogEntry[] }>('/api/audit', { signal });

/** 项目列表由服务端按当前会话的操作权限与数据范围过滤。 */
export const fetchProjects = (signal?: AbortSignal) =>
  request<{ items: Project[] }>('/api/projects', { signal });

/**
 * 项目详情。
 *
 * 服务端按 project.record.view 与数据范围判定：缺权限返回 403，记录不存在返回 404，
 * 存在但越出数据范围同样返回 403。调用方按状态码分别展示，不做前端兜底过滤。
 */
export const fetchProject = (id: string, signal?: AbortSignal) =>
  request<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}`, { signal });

/**
 * 新建项目。
 *
 * 负责人与所属团队由服务端按当前会话写入，前端不传也不可指定；
 * 服务端校验失败时把原文放进 ApiError 交给表单展示。
 */
export const createProject = (input: ProjectInput) =>
  request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(input) });

/** 编辑项目：只提交名称、状态与描述，服务端按 project.record.edit 与数据范围判定。 */
export const updateProject = (id: string, input: ProjectInput) =>
  request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
