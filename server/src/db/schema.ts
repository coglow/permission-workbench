import type Database from 'better-sqlite3';
export function initializeSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      account TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled'))
    );

    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
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
      data_scope TEXT CHECK (data_scope IS NULL OR data_scope IN ('self', 'team', 'all')),
      PRIMARY KEY (role_id, permission_code)
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
      status TEXT NOT NULL CHECK (status IN ('规划中', '进行中', '已完成')),
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );

    CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
  `);
}
