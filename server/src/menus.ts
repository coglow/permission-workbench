import { Router, type RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { requirePermission, readAccess } from './access.ts';
import { insertAuditLog } from './audit.ts';
import { getAuthenticatedUserId, readIdentity } from './auth.ts';
import { PAGE_REGISTRY, SYSTEM_MENU_IDS, findRegisteredPage } from '../../shared/catalog.ts';
import type {
  ConfiguredRoute,
  EnabledStatus,
  Identity,
  MenuCatalog,
  MenuNode,
  NavigationNode,
  NavigationPayload,
  PageKey,
  ParseResult,
} from '../../shared/contracts.ts';
import { readBody } from './util.ts';

// 内置菜单标识取共享定义，种子数据引用同一份常量，改名不会让只读护栏静默失效。
const SYSTEM_MENU_ID_SET = new Set<string>(Object.values(SYSTEM_MENU_IDS));
const CREATE_FIELDS = ['parentId', 'title', 'component', 'sortOrder'];
const UPDATE_FIELDS = [...CREATE_FIELDS, 'status'];
const MENU_COLUMNS = 'id, parent_id, title, component, sort_order, status';
interface MenuRow {
  id: string;
  parent_id: string | null;
  title: string;
  component: PageKey | null;
  sort_order: number;
  status: EnabledStatus;
}
interface MenuValues {
  parentId: string | null;
  title: string;
  component: PageKey | null;
  sortOrder: number;
  status: EnabledStatus;
}

/**
 * 读取组件对应的登记页面。
 *
 * 组件标识只能来自 PAGE_REGISTRY：接口写入校验与数据库 CHECK 双重保证，因此失败分支不可达。
 * 保留它是为了在坏数据下报出明确错误，而不是静默产出“组件非空但没有路径”的畸形节点。
 */
function readPage(component: PageKey) {
  const page = findRegisteredPage(component);
  if (!page) throw new Error(`页面未登记：${component}`);
  return page;
}

/** 路径和权限仅从登记页面派生，数据库不保存第二份可修改的绑定。 */
function toMenuNode(row: MenuRow): MenuNode {
  const page = row.component === null ? null : readPage(row.component);
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    path: page?.path ?? null,
    component: row.component,
    permissionCode: page?.permissionCode ?? null,
    sortOrder: row.sort_order,
    status: row.status,
    system: SYSTEM_MENU_ID_SET.has(row.id),
  };
}

function readMenuRows(database: Database.Database) {
  return database
    .prepare(`SELECT ${MENU_COLUMNS} FROM menus ORDER BY sort_order, id`)
    .all() as MenuRow[];
}
function findMenu(database: Database.Database, id: string) {
  return database.prepare(`SELECT ${MENU_COLUMNS} FROM menus WHERE id = ?`).get(id) as
    MenuRow | undefined;
}

function buildTree(rows: MenuRow[]): MenuNode[] {
  const children = new Map<string | null, MenuRow[]>();
  for (const row of rows) {
    const siblings = children.get(row.parent_id) ?? [];
    siblings.push(row);
    children.set(row.parent_id, siblings);
  }
  const build = (row: MenuRow): MenuNode => {
    const node = toMenuNode(row);
    const descendants = (children.get(row.id) ?? []).map(build);
    return descendants.length ? { ...node, children: descendants } : node;
  };
  return (children.get(null) ?? []).map(build);
}

/** 上级只允许分组；沿候选上级向上检查，阻止自引用及祖先变成后代。 */
function validateParent(
  database: Database.Database,
  raw: unknown,
  nodeId?: string,
): ParseResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string' || !raw) return { ok: false, error: '上级菜单格式不正确' };
  const parent = findMenu(database, raw);
  if (!parent) return { ok: false, error: '上级菜单不存在' };
  if (parent.component !== null) return { ok: false, error: '上级必须是分组节点' };
  const visited = new Set<string>();
  let current: string | null = raw;
  while (current) {
    if (current === nodeId || visited.has(current))
      return { ok: false, error: '上级设置不能形成循环' };
    visited.add(current);
    current = findMenu(database, current)?.parent_id ?? null;
  }
  return { ok: true, value: raw };
}

function validateComponent(
  database: Database.Database,
  raw: unknown,
  menu?: MenuRow,
): ParseResult<PageKey | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const page = typeof raw === 'string' ? findRegisteredPage(raw) : undefined;
  if (!page) return { ok: false, error: `页面未登记：${String(raw)}` };
  const bound = database
    .prepare('SELECT id FROM menus WHERE component = ? AND id <> ?')
    .get(page.component, menu?.id ?? '');
  if (bound) return { ok: false, error: `页面「${page.name}」已绑定其他菜单` };
  if (
    menu?.component === null &&
    database.prepare('SELECT id FROM menus WHERE parent_id = ?').get(menu.id)
  ) {
    return { ok: false, error: '存在子菜单的分组不能改为页面节点' };
  }
  return { ok: true, value: page.component };
}

function parseMenuInput(
  database: Database.Database,
  raw: unknown,
  menu?: MenuRow,
): ParseResult<MenuValues> {
  const parsed = readBody(raw, menu ? UPDATE_FIELDS : CREATE_FIELDS, {
    id: '菜单标识由系统生成，不能手动提交',
    path: '页面路径固定，不能手动提交',
    permissionCode: '页面权限固定，不能手动绑定',
  });
  if (!parsed.ok) return parsed;
  const body = parsed.value;
  if (menu && Object.keys(body).length === 0) return { ok: false, error: '没有可更新的字段' };
  const title = body.title === undefined ? menu?.title : body.title;
  if (typeof title !== 'string' || !title.trim()) return { ok: false, error: '请填写菜单名称' };
  const sortOrder = body.sortOrder === undefined ? menu?.sort_order : body.sortOrder;
  if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 0)
    return { ok: false, error: '排序必须是不小于 0 的整数' };
  const status = body.status === undefined ? (menu?.status ?? 'enabled') : body.status;
  if (status !== 'enabled' && status !== 'disabled')
    return { ok: false, error: '菜单状态只能是 enabled 或 disabled' };
  const parent = validateParent(
    database,
    body.parentId === undefined ? menu?.parent_id : body.parentId,
    menu?.id,
  );
  if (!parent.ok) return parent;
  const component = validateComponent(
    database,
    body.component === undefined ? menu?.component : body.component,
    menu,
  );
  if (!component.ok) return component;
  return {
    ok: true,
    value: {
      parentId: parent.value,
      title: title.trim(),
      component: component.value,
      sortOrder,
      status,
    },
  };
}

/** 路由先判断节点及全部祖先启用；权限随后由当前用户的授权判断。 */
function readEnabledPageRoutes(rows: MenuRow[]): ConfiguredRoute[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const enabled = (row: MenuRow) => {
    let current: MenuRow | undefined = row;
    while (current) {
      if (current.status !== 'enabled') return false;
      if (current.parent_id === null) return true;
      current = byId.get(current.parent_id);
    }
    return false;
  };
  return rows
    .filter(
      (row): row is MenuRow & { component: PageKey } => row.component !== null && enabled(row),
    )
    .map((row) => {
      const page = readPage(row.component);
      return { path: page.path, component: page.component, permissionCode: page.permissionCode };
    });
}

function buildNavigation(nodes: MenuNode[], identity: Identity): NavigationNode[] {
  const granted = new Set(identity.permissions.map((permission) => permission.code));
  const build = (node: MenuNode): NavigationNode | null => {
    if (node.status !== 'enabled') return null;
    const children = (node.children ?? [])
      .map(build)
      .filter((child): child is NavigationNode => child !== null);
    if (node.component !== null ? !granted.has(node.permissionCode!) : !children.length)
      return null;
    return {
      id: node.id,
      title: node.title,
      path: node.path,
      component: node.component,
      permissionCode: node.permissionCode,
      children,
    };
  };
  return nodes.map(build).filter((node): node is NavigationNode => node !== null);
}

export function createMenusRouter(database: Database.Database) {
  const router = Router();
  const guard = requirePermission(database, 'system.menu.manage', {
    deniedMessage: '缺少菜单路由管理权限',
  });
  router.get('/', guard, (_request, response) => {
    response.json({
      pages: PAGE_REGISTRY,
      menus: buildTree(readMenuRows(database)),
    } satisfies MenuCatalog);
  });

  router.post('/', guard, (request, response) => {
    const parsed = parseMenuInput(database, request.body);
    if (!parsed.ok) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const menu = parsed.value;
    const page = menu.component === null ? null : findRegisteredPage(menu.component)!;
    const base = page ? `menu.${page.path.slice(1).replaceAll('/', '.')}` : 'menu.group';
    let id = base,
      index = 1;
    while (findMenu(database, id)) id = `${base}.${index++}`;
    // 新增与编辑使用相同事务边界，审计失败也会撤销菜单写入。
    database.transaction(() => {
      database
        .prepare(
          'INSERT INTO menus (id, parent_id, title, component, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, menu.parentId, menu.title, menu.component, menu.sortOrder, menu.status);
      insertAuditLog(database, readAccess(response), {
        action: 'menu.create',
        targetType: 'menu',
        targetId: id,
        targetName: menu.title,
        summary: page ? `绑定页面「${page.name}」` : '创建分组，有可见子页面时展示',
      });
    })();
    response.status(201).json(toMenuNode(findMenu(database, id)!));
  });

  const update: RequestHandler<{ id: string }> = (request, response) => {
    const menu = findMenu(database, request.params.id);
    if (!menu) {
      response.status(404).json({ error: '菜单不存在' });
      return;
    }
    if (SYSTEM_MENU_ID_SET.has(menu.id)) {
      response.status(403).json({ error: '系统管理目录与管理菜单不可修改' });
      return;
    }
    const parsed = parseMenuInput(database, request.body, menu);
    if (!parsed.ok) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const next = parsed.value;
    const changes: string[] = [];
    if (next.title !== menu.title) changes.push(`名称「${menu.title}」→「${next.title}」`);
    if (next.status !== menu.status)
      changes.push(`状态：${next.status === 'enabled' ? '启用' : '停用'}`);
    if (next.parentId !== menu.parent_id) changes.push('调整上级');
    if (next.component !== menu.component)
      changes.push(
        `页面：${menu.component ? findRegisteredPage(menu.component)!.name : '分组'} → ${next.component ? findRegisteredPage(next.component)!.name : '分组'}`,
      );
    if (next.sortOrder !== menu.sort_order)
      changes.push(`排序 ${menu.sort_order} → ${next.sortOrder}`);
    database.transaction(() => {
      database
        .prepare(
          'UPDATE menus SET parent_id = ?, title = ?, component = ?, sort_order = ?, status = ? WHERE id = ?',
        )
        .run(next.parentId, next.title, next.component, next.sortOrder, next.status, menu.id);
      insertAuditLog(database, readAccess(response), {
        action: 'menu.update',
        targetType: 'menu',
        targetId: menu.id,
        targetName: next.title,
        summary: changes.join('；') || '未检测到字段变化',
      });
    })();
    response.json(toMenuNode(findMenu(database, menu.id)!));
  };
  router.patch('/:id', guard, update);
  return router;
}

export function createNavigationRouter(database: Database.Database) {
  const router = Router();
  router.get('/', (request, response) => {
    const userId = getAuthenticatedUserId(database, request, response);
    if (!userId) return;
    const identity = readIdentity(database, userId);
    if (!identity) {
      response.status(401).json({ error: '未登录或会话已过期' });
      return;
    }
    const rows = readMenuRows(database);
    response.json({
      routes: readEnabledPageRoutes(rows),
      navigation: buildNavigation(buildTree(rows), identity),
    } satisfies NavigationPayload);
  });
  return router;
}
