import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { createAuthRouter } from './auth.ts';
import { createAuditRouter } from './audit.ts';
import { createProjectsRouter } from './projects.ts';
import { createRolesRouter } from './roles.ts';
import { createUsersRouter } from './users.ts';
import { createMenusRouter, createNavigationRouter } from './menus.ts';
import { createReportsRouter } from './reports.ts';

export function createApp(database: Database.Database) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', createAuthRouter(database));
  app.use('/api/projects', createProjectsRouter(database));
  app.use('/api/roles', createRolesRouter(database));
  app.use('/api/users', createUsersRouter(database));
  app.use('/api/menus', createMenusRouter(database));
  app.use('/api/navigation', createNavigationRouter(database));
  app.use('/api/reports', createReportsRouter(database));
  app.use('/api/audit', createAuditRouter(database));
  app.get('/api/health', (_request, response) => {
    database.prepare('SELECT 1').get();
    response.json({ status: 'ok', database: 'ok' });
  });
  app.use('/api', (_request, response) => response.status(404).json({ error: '接口不存在' }));
  // JSON 解析错误、请求体过大及未预期异常都保持统一的 JSON 错误契约。
  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
    const message = {
      400: '请求体不是合法 JSON',
      413: '请求体过大',
      500: '服务端处理失败，请稍后重试',
    }[status];
    if (status === 500) console.error(error);
    response.status(status).json({ error: message });
  };
  app.use(handleError);
  return app;
}
