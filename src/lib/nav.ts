/**
 * Single source of truth for site navigation. The header, the footer and the
 * breadcrumbs all read from here, so a new section is added in one place.
 */
export interface NavItem {
  href: string;
  label: string;
}

/** Content archives — the parents of every detail page. */
export const sections: NavItem[] = [
  { href: "/writing", label: "writing" },
  { href: "/projects", label: "projects" },
  { href: "/updates", label: "updates" },
  { href: "/notes", label: "notes" }
];

/** Standalone pages. */
export const pages: NavItem[] = [
  { href: "/about", label: "about" },
  { href: "/now", label: "now" }
];

export const nav: NavItem[] = [...sections, ...pages];

/**
 * URL builders. Every update lives under its project, so these are the only
 * place that knows the shape of the nested path.
 */
export function projectHref(projectId: string): string {
  return `/projects/${projectId}`;
}

export function logHref(projectId: string): string {
  return `${projectHref(projectId)}/log`;
}

export function updateHref(projectId: string, updateId: string): string {
  return `${logHref(projectId)}/${updateId}`;
}

/** Trailing slashes vary between dev and build output; normalize before comparing. */
function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** True for the item's own page and for anything nested under it. */
export function isActive(pathname: string, href: string): boolean {
  const path = normalize(pathname);
  return path === href || path.startsWith(`${href}/`);
}

/**
 * The archive a detail page belongs to, for breadcrumbs. Only archives are
 * candidates — a standalone page is its own leaf, not a parent of itself.
 */
export function sectionFor(pathname: string): NavItem | undefined {
  return sections.find(item => isActive(pathname, item.href));
}

/** Neighbours in a newest-first list, for the prev/next pager. */
export function neighbours<T>(list: T[], index: number): { newer?: T; older?: T } {
  return { newer: list[index - 1], older: list[index + 1] };
}
