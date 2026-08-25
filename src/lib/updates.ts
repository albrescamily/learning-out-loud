/**
 * Loading and numbering for project updates.
 *
 * Every page that shows an update needs the same three things: the project it
 * belongs to, its canonical (nested) URL and its position in that project's
 * log. Deriving them here keeps the templates from re-implementing the join.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { updateHref } from "./nav";

export interface LoadedUpdate {
  entry: CollectionEntry<"updates">;
  /** Id of the project this update belongs to, resolved from the reference. */
  projectId: string;
  /** Position in the project's log. 1 is the oldest update. */
  number: number;
  /** Canonical URL: /projects/:project/log/updates/:update */
  href: string;
}

const newestFirst = (a: CollectionEntry<"updates">, b: CollectionEntry<"updates">) =>
  b.data.published.valueOf() - a.data.published.valueOf();

/** Every update, newest first. */
export async function loadUpdates(): Promise<LoadedUpdate[]> {
  const projectIds = new Set((await getCollection("projects")).map(p => p.id));

  // An update whose `project` reference does not resolve gets no page of its
  // own, so it must not be listed either — otherwise the feed links to a 404.
  // Astro logs the bad reference but still exits 0, so this is the only guard.
  const entries = (await getCollection("updates"))
    .filter(entry => projectIds.has(entry.data.project.id));

  // Number oldest-first so an update keeps its number forever — publishing a
  // new one must not renumber the entries already linked to.
  const seen = new Map<string, number>();
  const numbers = new Map<string, number>();
  for (const entry of [...entries].sort((a, b) => -newestFirst(a, b))) {
    const projectId = entry.data.project.id;
    const next = (seen.get(projectId) ?? 0) + 1;
    seen.set(projectId, next);
    numbers.set(entry.id, next);
  }

  return [...entries].sort(newestFirst).map(entry => {
    const projectId = entry.data.project.id;
    return {
      entry,
      projectId,
      number: numbers.get(entry.id) ?? 1,
      href: updateHref(projectId, entry.id)
    };
  });
}

/**
 * Updates grouped by project id, each list newest first. Pages that render one
 * row per project use this so the collection is only walked once.
 */
export async function updatesByProject(): Promise<Map<string, LoadedUpdate[]>> {
  const grouped = new Map<string, LoadedUpdate[]>();
  for (const update of await loadUpdates()) {
    const list = grouped.get(update.projectId);
    if (list) list.push(update);
    else grouped.set(update.projectId, [update]);
  }
  return grouped;
}

/** One project's updates, newest first. Empty for a project with no log yet. */
export async function updatesFor(projectId: string): Promise<LoadedUpdate[]> {
  return (await updatesByProject()).get(projectId) ?? [];
}
