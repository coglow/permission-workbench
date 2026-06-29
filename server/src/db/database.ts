import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

export function resolveDatabasePath() {
  return process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data', 'permission-workbench.sqlite');
}

export function openDatabase() {
  const databasePath = resolveDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  // SQLite 默认不会在每个连接上启用外键；关系约束依赖这项设置。
  database.pragma('foreign_keys = ON');
  return database;
}
