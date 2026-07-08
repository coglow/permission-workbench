import { Router } from 'express';
import type Database from 'better-sqlite3';
import { buildDataScopeFilter, readAccess, readDataScope, requirePermission } from './access.ts';
import { PROJECT_STATUSES } from '../../shared/catalog.ts';
import type { ProjectReportSummary, ProjectStatus } from '../../shared/contracts.ts';

/**
 * 项目报表接口（`GET /api/reports/projects`）。
 */
export function createReportsRouter(database: Database.Database) {
  const router = Router();

  // 报表权限带数据范围（本人／团队／全部）：缺少权限或未携带范围都按缺少权限处理。
  const reportGuard = requirePermission(database, 'project.report.view', {
    requireDataScope: true,
    deniedMessage: '缺少项目报表查看权限',
  });

  router.get('/projects', reportGuard, (_request, response) => {
    const access = readAccess(response);
    const scope = readDataScope(access);
    // 数据范围条件由服务端加入 SQL，与项目列表的过滤口径一致。
    const filter = buildDataScopeFilter(scope, access, {
      ownerColumn: 'owner_id',
      teamColumn: 'team_id',
    });
    const whereClause = filter.sql ? `WHERE ${filter.sql}` : '';
    const rows = database
      .prepare(`SELECT status, COUNT(*) AS count FROM projects ${whereClause} GROUP BY status`)
      .all(...filter.params) as Array<{ status: ProjectStatus; count: number }>;

    const counts = new Map(rows.map((row) => [row.status, row.count]));
    const summary: ProjectReportSummary = {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      byStatus: Object.fromEntries(
        PROJECT_STATUSES.map((status) => [status, counts.get(status) ?? 0]),
      ) as ProjectReportSummary['byStatus'],
    };
    response.json(summary);
  });

  return router;
}
