import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getAuthenticatedUserId, readIdentity } from './auth.ts';

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner_name: string;
  team_id: string;
  team_name: string;
}

export function createProjectsRouter(database: Database.Database) {
  const router = Router();

  router.get('/', (request, response) => {
    const userId = getAuthenticatedUserId(database, request, response);
    if (!userId) return;

    const identity = readIdentity(database, userId);
    if (!identity) {
      response.status(401).json({ error: '未登录或会话已过期' });
      return;
    }

    const viewPermission = identity.permissions.find(
      (permission) => permission.code === 'project.record.view',
    );
    if (!viewPermission?.dataScope) {
      response.status(403).json({ error: '缺少项目查看权限' });
      return;
    }

    // 权限检查先于项目查询；数据范围条件由服务端加入 SQL，浏览器拿不到越权记录。
    const conditions: string[] = [];
    const parameters: string[] = [];
    if (viewPermission.dataScope === 'self') {
      conditions.push('p.owner_id = ?');
      parameters.push(userId);
    } else if (viewPermission.dataScope === 'team') {
      conditions.push('p.team_id = ?');
      parameters.push(identity.user.team.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const projects = database
      .prepare(
        `SELECT p.id, p.name, p.status, p.description, p.created_at, p.updated_at,
                u.id AS owner_id, u.name AS owner_name,
                t.id AS team_id, t.name AS team_name
         FROM projects p
         JOIN users u ON u.id = p.owner_id
         JOIN teams t ON t.id = p.team_id
         ${whereClause}
         ORDER BY p.id`,
      )
      .all(...parameters) as ProjectRow[];

    response.json({
      items: projects.map((project) => ({
        id: project.id,
        name: project.name,
        owner: { id: project.owner_id, name: project.owner_name },
        team: { id: project.team_id, name: project.team_name },
        status: project.status,
        description: project.description,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      })),
    });
  });

  return router;
}
