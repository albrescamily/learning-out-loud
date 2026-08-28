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
lists, links, blockquotes, inline `code`, fenced code blocks, and images.

What does **not**: tables. They render with browser defaults and will look out
of place until a `.prose table` rule exists in `src/styles/global.css`.

One exception to "the body is yours": an update's body is rendered in full,
inline, inside `/projects/<project>/log`, stacked with its neighbours. Long
updates make that page hard to scan.

## Images

Put the file in `src/content/images/` and point at it from the body. Every
collection is one level above that folder, so the path is the same everywhere:

```markdown
![Alt text](../images/my-diagram.png "Optional caption")
```

The relative path is what makes it a local image: Astro converts and resizes
it into `dist/_astro/` at build time and writes the dimensions onto the tag. An
image alone in its paragraph becomes a captioned `<figure>`; one with text
beside it stays inline and drops the caption. A missing file fails the build.

`src/content/images/README.md` has the rest — alt text versus captions, linked
images, and what happens to remote URLs.

## Appending to a dev log from Obsidian

The templates above create a file each. An update usually does not deserve one:
`dev-log/<project>.md` in the vault holds them as headings, and the sync splits
them out (see "Syncing from Obsidian" in the root README).

This is a Templater snippet for that — it is not part of this project, so it
lives here as text to paste into an Obsidian template. It asks for a title,
picks the project, and appends a dated heading to that project's dev log,
creating the file if it does not exist yet:

```javascript
<%*
const title = await tp.system.prompt("Update title")

const projects = tp.app.vault.getFiles()
  .filter(file => file.path.startsWith("Blog/projects/") && file.extension === "md")

const project = await tp.system.suggester(
  projects.map(file => file.basename),
  projects.map(file => file.basename)
)

const path = `Blog/dev-log/${project}.md`
const date = tp.date.now("YYYY-MM-DD")
const heading = `\n## ${date} — ${title}\n\n`

const existing = tp.app.vault.getAbstractFileByPath(path)
if (existing) await tp.app.vault.append(existing, heading)
else await tp.app.vault.create(path, heading.trimStart())

await tp.app.workspace.openLinkText(path, "", false)
-%>
```

Note the `Blog/projects/` prefix. The vault folder was once called `7. Blog`,
and the Update Template still filters on that old name — which is why its
project picker comes up empty.

## Two things that will catch you

- **Dates are read as UTC.** `published: 2026-08-21` parses as UTC midnight and
  is formatted back in UTC, so it never slips a day in a negative-offset
  timezone.
- **A broken `project:` reference does not fail the build.** Astro prints
  `[ERROR] Invalid content reference` and still exits 0; the update is dropped
  from the site. A green build is not proof the reference resolved — read the
  log.
