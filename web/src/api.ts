/**
 * 前端访问 Node API 的统一入口。
 *
 * 会话 Cookie 为 HttpOnly，脚本读不到，因此所有请求都依赖浏览器自动携带同源凭证。
 * 服务端返回 401（未登录或会话失效）与 403（无权限）时统一抛出 ApiError，
 * 由调用方按业务语义分别处理，避免状态码判断散落在页面代码里。
 */

export type DataScope = 'self' | 'team' | 'all';

export interface Team {
  id: string;
  name: string;
}

export interface Role {
  id: string;
  name: string;
}

export interface Permission {
  code: string;
  name: string;
  dataScope: DataScope | null;
}

export interface Identity {
  user: {
    id: string;
    account: string;
    name: string;
    team: Team;
  };
  roles: Role[];
  permissions: Permission[];
}

export interface Account {
  account: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  owner: { id: string; name: string };
  team: Team;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // 声明 Content-Type 而不是直接透传 headers，避免调用方漏写导致服务端解析不到 JSON。
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...init, credentials: 'same-origin', headers });

  if (!response.ok) {
    // 服务端的错误分支都返回 { error }，尽量把原文透出给页面。
    let message = `请求失败，请稍后重试……`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
    }
    throw new ApiError(response.status, message);
  }

  // 退出登录返回 204，没有响应体。
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const fetchAccounts = (signal?: AbortSignal) =>
  request<Account[]>('/api/auth/accounts', { signal });

/** 查询当前身份；未登录时服务端返回 401，这里转成 null 交给路由按“未登录”处理。 */
export async function fetchIdentity(): Promise<Identity | null> {
  try {
    return await request<Identity>('/api/auth/me');
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

/** 项目列表由服务端按当前会话的操作权限与数据范围过滤。 */
export const fetchProjects = (signal?: AbortSignal) =>
  request<{ items: Project[] }>('/api/projects', { signal });
