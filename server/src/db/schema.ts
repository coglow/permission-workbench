import {
  DATA_SCOPES,
  ENABLED_STATUSES,
  PAGE_REGISTRY,
  PROJECT_STATUSES,
} from '../../../shared/catalog.ts';
import type Database from 'better-sqlite3';
export function initializeSchema(database: Database.Database) {
  database.exec(`
    -- 团队支持层级：parent_id 为空表示顶层；数据范围的「团队」按「所在团队及下级团队」判定。
    -- 自引用外键要求种子数据按父级在前的顺序插入。
    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      parent_id TEXT REFERENCES teams(id)
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      account TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN (${ENABLED_STATUSES.map((status) => `'${status}'`).join(', ')}))
    );

    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN (${ENABLED_STATUSES.map((status) => `'${status}'`).join(', ')})),
      is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1))
    );

    CREATE TABLE permissions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      resource TEXT NOT NULL,
      operation TEXT NOT NULL,
      requires_data_scope INTEGER NOT NULL CHECK (requires_data_scope IN (0, 1))
    );

    CREATE TABLE user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_code TEXT NOT NULL REFERENCES permissions(code),
      data_scope TEXT CHECK (data_scope IS NULL OR data_scope IN (${DATA_SCOPES.map((scope) => `'${scope}'`).join(', ')})),
      PRIMARY KEY (role_id, permission_code)
    );

    CREATE TABLE menus (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES menus(id),
      title TEXT NOT NULL,
      component TEXT UNIQUE CHECK (component IS NULL OR component IN (${PAGE_REGISTRY.map((page) => `'${page.component}'`).join(', ')})),
      sort_order INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN (${ENABLED_STATUSES.map((status) => `'${status}'`).join(', ')}))
    );

    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      status TEXT NOT NULL CHECK (status IN (${PROJECT_STATUSES.map((status) => `'${status}'`).join(', ')})),
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );

    CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);

    CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
  `);
}
