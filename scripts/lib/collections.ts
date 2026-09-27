/**
 * What the site publishes, and what each collection demands of a note.
 *
 * This is the contract `src/content.config.ts` enforces at build time, stated
 * once here so the sync can reject a note before Astro ever sees it.
 */

export const COLLECTIONS = [
  "writing",
  "notes",
  "projects",
] as const;

export type Collection =
  (typeof COLLECTIONS)[number];

/**
 * The frontmatter a note cannot be published without. The schemas accept more
 * — `tags` everywhere but projects, `minutes` on writing — but those default,
 * so their absence is not a failure.
 */
export function requiredFields(
  collection: Collection,
): string[] {
  switch (collection) {
    case "writing":
      return [
        "title",
        "description",
        "published",
      ];

    case "notes":
      return [
        "title",
        "published",
      ];

    case "projects":
      return [
        "title",
        "description",
        "status",
        "published",
      ];
  }
}
