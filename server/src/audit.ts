import { Router } from 'express';
import type Database from 'better-sqlite3';
import { requirePermission, type AccessContext } from './access.ts';
import { toDisplayTimestamp } from './util.ts';

import type { AuditLogEntry } from '../../shared/contracts.ts';

interface AuditLogRow {
  id: number;
  actor_user_id: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  target_name: string;
  summary: string;
  created_at: string;
}

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    summary: row.summary,
    createdAt: toDisplayTimestamp(row.created_at),
  };
}

/**
 * 写一条审计日志。必须在调用方事务内执行，与业务变更同进同退。
 *
 * actor 直接取自访问上下文，调用方不必各自重复取 userId 与姓名；
 * target 名称由调用方传入并冗余存储，避免后续改名影响历史记录。
 */
export function insertAuditLog(
  database: Database.Database,
  access: AccessContext,
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    targetName: string;
    summary: string;
  },
) {
  database
    .prepare(
      `INSERT INTO audit_logs
        (actor_user_id, actor_name, action, target_type, target_id, target_name, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      access.userId,
      access.identity.user.name,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.targetName,
      entry.summary,
    );
}

export function createAuditRouter(database: Database.Database) {
  const router = Router();

  const guard = requirePermission(database, 'system.audit.view', {
    deniedMessage: '缺少审计日志查看权限',
  });

  router.get('/', guard, (_request, response) => {
    const rows = database
      .prepare(
        `SELECT id, actor_user_id, actor_name, action, target_type, target_id, target_name, summary, created_at
         FROM audit_logs
         ORDER BY id DESC`,
      )
      .all() as AuditLogRow[];

    response.json({ items: rows.map(toAuditLogEntry) });
  });

  return router;
}
