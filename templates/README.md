# Content templates

Copy a template into the matching folder and rename it — the filename becomes
the URL slug.

| Template      | Copy to                 | Produces                             |
| ------------- | ----------------------- | ------------------------------------ |
| `writing.md`  | `src/content/writing/`  | `/writing/<filename>`                |
| `notes.md`    | `src/content/notes/`    | `/notes/<filename>`                  |
| `projects.md` | `src/content/projects/` | `/projects/<filename>` and `/…/log`  |
| `updates.md`  | `src/content/updates/`  | `/projects/<project>/log/<filename>` |

This folder is outside every collection's `base`, so nothing here is loaded as
content.

## The frontmatter is the whole contract

Every field in these templates is either rendered on a page or decides how the
site is built. There is nothing decorative left to fill in:

| Collection | Fields                                          |
| ---------- | ----------------------------------------------- |
| writing    | `title`, `description`, `published`             |
| notes      | `title`, `published`                            |
| projects   | `title`, `description`, `status`, `stack`, `order` |
| updates    | `title`, `project`, `published`                 |

The schemas in `src/content.config.ts` also accept `tags` (all but projects)
and `minutes` (writing). They validate, they default to empty, and **no page
renders them** — that is why they are not in the templates. You will see `tags`
in some existing files; it is inert.

## The body is yours

Below the frontmatter, write whatever the piece needs — the site imposes no
structure. Headings, ordering and length are per-entry decisions.

What already has styling inside `.prose`: `##` and `###` headings, paragraphs,
lists, links, blockquotes, inline `code` and fenced code blocks.

What does **not**: tables and images. They render with browser defaults and
will look out of place until `.prose table` / `.prose img` rules exist in
`src/styles/global.css`.

One exception to "the body is yours": an update's body is rendered in full,
inline, inside `/projects/<project>/log`, stacked with its neighbours. Long
updates make that page hard to scan.

## Two things that will catch you

- **Dates are read as UTC.** `published: 2026-08-21` parses as UTC midnight and
  is formatted back in UTC, so it never slips a day in a negative-offset
  timezone.
- **A broken `project:` reference does not fail the build.** Astro prints
  `[ERROR] Invalid content reference` and still exits 0; the update is dropped
  from the site. A green build is not proof the reference resolved — read the
  log.
