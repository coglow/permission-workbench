import { Router, type RequestHandler, type Response } from 'express';
import type Database from 'better-sqlite3';
import {
  buildDataScopeFilter,
  isWithinDataScope,
  readAccess,
  readDataScope,
  requirePermission,
} from './access.ts';
import { readBody, toDisplayTimestamp } from './util.ts';
import { isProjectStatus } from '../../shared/catalog.ts';
import type { ParseResult, Project, ProjectDetail, ProjectStatus } from '../../shared/contracts.ts';

// 列表、详情和编辑共用查询列与关联，保持业务字段一致；详情额外返回记录级编辑能力。
const PROJECT_COLUMNS = `p.id, p.name, p.status, p.description, p.created_at, p.updated_at,
                u.id AS owner_id, u.name AS owner_name,
                t.id AS team_id, t.name AS team_name`;

const PROJECT_SOURCE = `FROM projects p
         JOIN users u ON u.id = p.owner_id
         JOIN teams t ON t.id = p.team_id`;

// 创建与编辑都只接受这三个字段；负责人与所属团队由服务端写入，且不可编辑。
const RECORD_FIELDS = ['name', 'status', 'description'];

interface ProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  description: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner_name: string;
  team_id: string;
  team_name: string;
}

interface ProjectInput {
  name?: string;
  status?: ProjectStatus;
  description?: string;
}

// 统一的时间戳格式：UTC 毫秒精度（YYYY-MM-DD HH:MM:SS.SSS），创建与编辑使用同一实现。
function currentTimestamp() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ');
}

// 项目的基础响应：列表、详情、创建与编辑复用同一套业务字段映射。
function toProjectResponse(project: ProjectRow): Project {
  return {
    id: project.id,
    name: project.name,
    owner: { id: project.owner_id, name: project.owner_name },
    team: { id: project.team_id, name: project.team_name },
    status: project.status,
    description: project.description,
    createdAt: toDisplayTimestamp(project.created_at),
    updatedAt: toDisplayTimestamp(project.updated_at),
  };
}

function findProject(database: Database.Database, id: string) {
  return database.prepare(`SELECT ${PROJECT_COLUMNS} ${PROJECT_SOURCE} WHERE p.id = ?`).get(id) as
    ProjectRow | undefined;
}

/**
 * 解析创建／编辑请求体：只接受名称、状态、描述，返回归一化后的值或可直接返回给客户端的错误信息。
 *
 * `mode` 区分必填校验口径：create 必须提供 name 与 status，edit 允许部分字段更新。
 * 由调用方统一传入，避免 POST 处理函数再单独补必填检查。
 */
function parseProjectInput(rawBody: unknown, mode: 'create' | 'edit'): ParseResult<ProjectInput> {
  // 字段白名单：负责人、所属团队以及任何未知字段都不接受。
  const parsed = readBody(rawBody, RECORD_FIELDS);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const body = parsed.value;

  const input: ProjectInput = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return { ok: false, error: '项目名称不能为空' };
    }
    input.name = body.name.trim();
  } else if (mode === 'create') {
    return { ok: false, error: '项目名称不能为空' };
  }

  if (body.status !== undefined) {
    if (!isProjectStatus(body.status)) {
      return { ok: false, error: '状态只能是「规划中」「进行中」「已完成」之一' };
    }
    input.status = body.status;
  } else if (mode === 'create') {
    return { ok: false, error: '状态不能为空' };
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return { ok: false, error: '项目描述必须是文本' };
    }
    input.description = body.description;
  }

  return { ok: true, value: input };
}

// 新记录编号沿用样例的 P + 递增数字：取当前最大编号 +1
function nextProjectId(database: Database.Database) {
  const row = database
    .prepare(
      `SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) AS max_number
       FROM projects WHERE id GLOB 'P[0-9]*'`,
    )
    .get() as { max_number: number | null };
  return `P${(row.max_number ?? 0) + 1}`;
}

/**
 * 记录不存在返回 404；存在但越出数据范围返回 403，用于区分“记录不存在”与“记录不可访问”。
 * 通过后把记录挂到上下文里，处理函数不必再查一次。
 */
function requireProjectInScope(database: Database.Database): RequestHandler<{ id: string }> {
  return (request, response, next) => {
    const access = readAccess(response);
    const project = findProject(database, request.params.id);
    if (!project) {
      response.status(404).json({ error: '项目记录不存在' });
      return;
    }

    if (
      !isWithinDataScope(
        readDataScope(access),
        { ownerId: project.owner_id, teamId: project.team_id },
        access,
      )
    ) {
      response.status(403).json({ error: '项目记录不在可访问的数据范围内' });
      return;
    }

    response.locals.project = project;
    next();
  };
}

/** 读取 requireProjectInScope 装载的记录。 */
function readProject(response: Response) {
  const project = response.locals.project as ProjectRow | undefined;
  if (!project) {
    throw new Error('缺少项目记录：requireProjectInScope 必须先于该处理函数执行');
  }
  return project;
}

export function createProjectsRouter(database: Database.Database) {
  const router = Router();

  // 查看项目所需的守卫：认证 → project.record.view（带数据范围）。
  const requireView = requirePermission(database, 'project.record.view', {
    requireDataScope: true,
    deniedMessage: '缺少项目查看权限',
  });

  router.get('/', requireView, (_request, response) => {
    const access = readAccess(response);
    const scope = readDataScope(access);
    // 数据范围条件由服务端加入 SQL，浏览器拿不到越权记录。
    const filter = buildDataScopeFilter(scope, access, {
      ownerColumn: 'p.owner_id',
      teamColumn: 'p.team_id',
    });
    const whereClause = filter.sql ? `WHERE ${filter.sql}` : '';
    const projects = database
      .prepare(
        `SELECT ${PROJECT_COLUMNS}
         ${PROJECT_SOURCE}
         ${whereClause}
         ORDER BY CAST(SUBSTR(p.id, 2) AS INTEGER)`,
      )
      .all(...filter.params) as ProjectRow[];

    response.json({ items: projects.map(toProjectResponse) });
  });

  router.post(
    '/',
    requirePermission(database, 'project.record.create', { deniedMessage: '缺少项目创建权限' }),
    (request, response) => {
      const access = readAccess(response);
      // create 模式：parseProjectInput 内部已校验 name/status 必填。
      const parsed = parseProjectInput(request.body, 'create');
      if (!parsed.ok) {
        response.status(400).json({ error: parsed.error });
        return;
      }
      const input = parsed.value;

      // 负责人、所属团队与创建时间由服务端写入，请求体不能指定。
      const timestamp = currentTimestamp();
      const id = nextProjectId(database);
      database
        .prepare(
          `INSERT INTO projects (id, name, owner_id, team_id, status, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.name,
          access.userId,
          access.identity.user.team.id,
          input.status,
          input.description ?? '',
          timestamp,
          timestamp,
        );

      response.status(201).json(toProjectResponse(findProject(database, id) as ProjectRow));
    },
  );

  // 详情：守卫链顺序即 认证 → 操作权限 → 记录存在性 → 数据范围。
  router.get('/:id', requireView, requireProjectInScope(database), (_request, response) => {
    const project = readProject(response);
    const access = readAccess(response);
    const editScope = access.identity.permissions.find(
      (permission) => permission.code === 'project.record.edit',
    )?.dataScope;
    // 复用写接口的数据范围判定；查看守卫已装载团队子树，计算 canEdit 不再查询数据库。
    const detail: ProjectDetail = {
      ...toProjectResponse(project),
      canEdit: Boolean(
        editScope &&
        isWithinDataScope(
          editScope,
          { ownerId: project.owner_id, teamId: project.team_id },
          access,
        ),
      ),
    };
    response.json(detail);
  });

  // 编辑：同一套守卫链，鉴权与数据范围全部通过后才校验请求体。
  router.patch(
    '/:id',
    requirePermission(database, 'project.record.edit', {
      requireDataScope: true,
      deniedMessage: '缺少项目编辑权限',
    }),
    requireProjectInScope(database),
    (request, response) => {
      const parsed = parseProjectInput(request.body, 'edit');
      if (!parsed.ok) {
        response.status(400).json({ error: parsed.error });
        return;
      }
      const input = parsed.value;

      if (
        input.name === undefined &&
        input.status === undefined &&
        input.description === undefined
      ) {
        response.status(400).json({ error: '没有可更新的字段' });
        return;
      }

      // 只写入请求中出现的字段，更新时间由服务端生成。
      const assignments: string[] = [];
      const parameters: string[] = [];
      if (input.name !== undefined) {
        assignments.push('name = ?');
        parameters.push(input.name);
      }
      if (input.status !== undefined) {
        assignments.push('status = ?');
        parameters.push(input.status);
      }
      if (input.description !== undefined) {
        assignments.push('description = ?');
        parameters.push(input.description);
      }
      assignments.push('updated_at = ?');
      parameters.push(currentTimestamp());

      const { id } = readProject(response);
      database
        .prepare(`UPDATE projects SET ${assignments.join(', ')} WHERE id = ?`)
        .run(...parameters, id);

      // 重新读取，返回数据库中的最新值。
      response.json(toProjectResponse(findProject(database, id) as ProjectRow));
    },
  );

  return router;
}
