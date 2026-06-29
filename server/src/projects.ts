import { Router, type RequestHandler, type Response } from 'express';
import type Database from 'better-sqlite3';
import { isWithinDataScope, readAccess, readDataScope, requirePermission } from './access.ts';

// 列表、详情和编辑共用同一套查询列与关联，保证三处返回的记录结构完全一致。
const PROJECT_COLUMNS = `p.id, p.name, p.status, p.description, p.created_at, p.updated_at,
                u.id AS owner_id, u.name AS owner_name,
                t.id AS team_id, t.name AS team_name`;

const PROJECT_SOURCE = `FROM projects p
         JOIN users u ON u.id = p.owner_id
         JOIN teams t ON t.id = p.team_id`;

// 状态取值与 projects 表的 CHECK 约束保持一致。
const PROJECT_STATUSES = ['规划中', '进行中', '已完成'];

// 创建与编辑都只接受这三个字段；负责人与所属团队由服务端写入，且不可编辑。
const RECORD_FIELDS = ['name', 'status', 'description'];

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

interface ProjectInput {
  name?: string;
  status?: string;
  description?: string;
}

// 统一的时间戳格式：UTC 毫秒精度（YYYY-MM-DD HH:MM:SS.SSS），创建与编辑使用同一实现。
function currentTimestamp() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ');
}

// 接口返回的展示时间：北京时间（Asia/Shanghai）、只保留到秒
const BEIJING_TIME_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function toDisplayTimestamp(value: string) {
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;

  return BEIJING_TIME_FORMATTER.format(parsed);
}

// 记录的对外结构：列表、详情、创建与编辑返回同一结构。
function toProjectResponse(project: ProjectRow) {
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

// 解析创建／编辑请求体：只接受名称、状态、描述，返回归一化后的值或可直接返回给客户端的错误信息。
function parseProjectInput(rawBody: unknown): { input: ProjectInput; error?: string } {
  if (
    rawBody !== undefined &&
    (rawBody === null || typeof rawBody !== 'object' || Array.isArray(rawBody))
  ) {
    return { input: {}, error: '请求体必须是 JSON 对象' };
  }

  const body = (rawBody ?? {}) as Record<string, unknown>;

  // 字段白名单：负责人、所属团队以及任何未知字段都不接受。
  const unknownField = Object.keys(body).find((key) => !RECORD_FIELDS.includes(key));
  if (unknownField) {
    return { input: {}, error: `不支持的字段：${unknownField}` };
  }

  const input: ProjectInput = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return { input: {}, error: '项目名称不能为空' };
    }
    input.name = body.name.trim();
  }

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !PROJECT_STATUSES.includes(body.status)) {
      return { input: {}, error: '状态只能是「规划中」「进行中」「已完成」之一' };
    }
    input.status = body.status;
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return { input: {}, error: '项目描述必须是文本' };
    }
    input.description = body.description;
  }

  return { input };
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

    // 数据范围条件由服务端加入 SQL，浏览器拿不到越权记录。
    const conditions: string[] = [];
    const parameters: string[] = [];
    const scope = readDataScope(access);
    if (scope === 'self') {
      conditions.push('p.owner_id = ?');
      parameters.push(access.userId);
    } else if (scope === 'team') {
      conditions.push('p.team_id = ?');
      parameters.push(access.identity.user.team.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const projects = database
      .prepare(
        `SELECT ${PROJECT_COLUMNS}
         ${PROJECT_SOURCE}
         ${whereClause}
         ORDER BY CAST(SUBSTR(p.id, 2) AS INTEGER)`,
      )
      .all(...parameters) as ProjectRow[];

    response.json({ items: projects.map(toProjectResponse) });
  });

  router.post(
    '/',
    requirePermission(database, 'project.record.create', { deniedMessage: '缺少项目创建权限' }),
    (request, response) => {
      const access = readAccess(response);
      const { input, error } = parseProjectInput(request.body);
      if (error) {
        response.status(400).json({ error });
        return;
      }

      if (input.name === undefined) {
        response.status(400).json({ error: '项目名称不能为空' });
        return;
      }
      if (input.status === undefined) {
        response.status(400).json({ error: '状态不能为空' });
        return;
      }

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
    response.json(toProjectResponse(readProject(response)));
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
      const { input, error } = parseProjectInput(request.body);
      if (error) {
        response.status(400).json({ error });
        return;
      }

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
