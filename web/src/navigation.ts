import type { MenuNode, NavigationNode } from '../../shared/contracts.ts';

/** 按服务端已排序、已过滤的导航取首个可访问页面；无入口时返回 null。 */
export function findDefaultPagePath(nodes: NavigationNode[]): string | null {
  for (const node of nodes) {
    if (node.path) return node.path;
    const path = findDefaultPagePath(node.children);
    if (path) return path;
  }
  return null;
}

/** 菜单配置只遍历一次，页面绑定、分组候选和默认展开分别筛选这份列表。 */
export function flattenMenus(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => [node, ...flattenMenus(node.children ?? [])]);
}
