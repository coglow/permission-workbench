import type { ParseResult } from '../../shared/contracts.ts';

/**
 * 用户查询的统一列与来源
 * 用户表增删字段只改这里，避免四处列清单各自漂移。
 */
export const USER_COLUMNS = `u.id, u.account, u.name, t.id AS team_id, t.name AS team_name`;
export const USER_SOURCE = `FROM users u JOIN teams t ON t.id = u.team_id`;

/** 团队层级的一行：parentId 为空表示顶层团队。 */
export interface TeamHierarchyRow {
  id: string;
  parent_id: string | null;
}

/**
 * 收集某个团队及其全部下级团队的 ID（含自身）。
 *
 * 数据范围的「团队」档位按「所在团队及下级团队」判定，因此这里用广度优先遍历整棵子树；
 * 团队表是小表且层级不深，遍历在内存里完成，避免把递归查询嵌进每条业务 SQL。
 * 传入的层级数据缺环（如父级不存在）时按能到达的节点返回，不抛错。
 */
export function collectTeamSubtreeIds(teams: TeamHierarchyRow[], rootId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const team of teams) {
    if (!team.parent_id) continue;
    const children = childrenByParent.get(team.parent_id) ?? [];
    children.push(team.id);
    childrenByParent.set(team.parent_id, children);
  }

  const collected: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (collected.includes(current)) continue;
    collected.push(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }
  return collected;
}

/** 判断请求体是否为普通对象（非 null、非数组）；菜单／角色／用户校验共用。 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 请求体白名单校验：非普通对象、或含白名单外字段时返回错误文案，避免各接口各写一遍。
 *
 * `fieldMessages` 供调用方对特定字段给出更明确的文案
 */
export function readBody(
  raw: unknown,
  allowedFields: readonly string[],
  fieldMessages: Record<string, string> = {},
): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: '请求体必须是 JSON 对象' };
  }

  const unknownField = Object.keys(raw).find((key) => !allowedFields.includes(key));
  if (unknownField) {
    return { ok: false, error: fieldMessages[unknownField] ?? `不支持的字段：${unknownField}` };
  }

  return { ok: true, value: raw };
}

/** 接口返回的展示时间：北京时间（Asia/Shanghai），只保留到秒。 */
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

/**
 * 把库内 UTC 毫秒串（`YYYY-MM-DD HH:MM:SS.SSS`）换算成北京时间秒级展示串。
 */
export function toDisplayTimestamp(value: string) {
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);

  return BEIJING_TIME_FORMATTER.format(parsed);
}
