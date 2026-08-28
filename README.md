# Public Engineering Notebook

A minimal personal site for documenting:

- projects
- project updates
- Today I Learned
- articles
- decisions and lessons learned

## Running locally

```bash
npm install
npm run dev
```

Then open the address Astro prints.

## Build

```bash
npm run build
```

The final files land in `dist/`.

## Publishing content

### New article

Create a file at:

`src/content/writing/my-article.md`

### New note

Create a file at:

`src/content/notes/my-note.md`

### New project update

Create a file at:

`src/content/updates/my-update.md`

Use the `project` field to tie the update to a project.

### New project

Create a file at:

`src/content/projects/my-project.md`

### An image inside a piece of content

Put the file at:

`src/content/images/my-diagram.png`

And point at it from the Markdown body, in any collection:

```markdown
![Alt text](../images/my-diagram.png "Optional caption")
```

The relative path is what makes Astro treat the image as local: it is
converted, resized, and gets its dimensions written onto the tag at build time.
An image alone in a paragraph becomes a `<figure>` with a caption; an image in
the middle of a sentence stays inline. Details in
`src/content/images/README.md`.

## Syncing from Obsidian

Notes written in the Obsidian vault are copied in with:

```bash
npm run sync           # copy
npm run sync -- --dry  # show what would happen, write nothing
```

Run it **from Git Bash**. In PowerShell, `bash` is `C:\Windows\system32\bash.exe`
— WSL — where a path like `C:\Users\...` does not exist. The script detects that
and says so rather than failing on the paths.

The vault mirrors this folder, one directory per collection, and the sync is
folder to folder:

| In the vault | Lands in                                |
| ------------ | --------------------------------------- |
| `writing/`   | `src/content/writing/`                  |
| `notes/`     | `src/content/notes/`                    |
| `projects/`  | `src/content/projects/`                 |
| `updates/`   | `src/content/updates/`                  |
| `dev-log/`   | `src/content/updates/`, one per heading |
| attachments  | `src/content/images/`                   |

Anything outside those folders — `templates/` above all — stays in the vault,
and the run lists what it left behind.

### Running it from Obsidian

`obsidian-plugin/` is a small plugin of this project's own — not a community
one — that adds a **Sync vault to site** command to Obsidian. It runs
`scripts/sync-and-build.sh`, which syncs and then builds, and reports back in a
notice: the summary on success, and a second notice for any warning the sync
raised. It is only a trigger; all the behaviour lives in the two shell scripts.

To install it, copy the folder into the vault and enable it:

```bash
cp -r obsidian-plugin "<vault>/.obsidian/plugins/sync-to-site"
```

Then Obsidian → Settings → Community plugins → Installed plugins → enable
**Sync to site**. Its settings hold two machine paths, the repository folder and
Git Bash, both of which it checks before running and names if either is wrong.

Being a command, it can take a hotkey, and the Buttons plugin can fire it from
inside a note — a button at the top of a dev log is one way to publish.

### The dev log

Most updates never need a file of their own. `dev-log/` holds one file per
project, named after it, and each heading inside becomes one update:

`dev-log/learning-out-loud.md`

```markdown
## 2026-08-27 — Images shipped

Body, with [[wikilinks]] and ![[attachments]] like any other note.

## 2026-08-25 — Sync rewritten

Body...
```

That writes `src/content/updates/images-shipped.md` and `sync-rewritten.md`,
each with the `title`, `project` and `published` the schema wants. The project
comes from the filename, so it is never typed twice, and the date is what fixes
the update's number in `/projects/<project>/log`, which counts oldest-first.
Anything above the first heading, frontmatter included, is ignored.

The separator between date and title can be an em dash, a hyphen, a pipe or a
colon — all four are treated as decoration.

Four things the run will tell you about:

- **A heading with no `YYYY-MM-DD` date is skipped.** The date orders the log, so
  it is never guessed.
- **The title becomes the filename**, and `src/content/updates/` is flat, so two
  headings that slugify alike overwrite each other.
- **A dev-log file named after no real project**: Astro drops an update whose
  `project` does not resolve and still exits 0, so this is caught here instead.
- **Renaming an old heading renames its file**, which changes that update's URL
  and leaves the previous copy behind.

Update files are generated. Edit the dev log, not `src/content/updates/` — the
next sync overwrites them.

`updates/` still works for a one-off update written as its own file.

On the way in, `[[wikilinks]]` become real links, pointed at whichever section
the target belongs to, and `![[attachments]]` become relative image paths so
Astro optimizes them. Only attachments a copied note actually references are
brought over; they are looked for in the published folder first, then anywhere
in the vault.

**To caption an image**, write it in the vault as a plain Markdown image with a
title — Obsidian resolves the bare filename, and the sync repoints it:

```markdown
![Alt text](my-diagram.png "The caption")
```

The wikilink form has nowhere to put a caption: `![[my-diagram.png|Alt text]]`
gives alt text and nothing else. Remote URLs and paths already pointing at
`../images/` are left exactly as written.

Two things worth knowing:

- **Nothing is ever deleted here.** A note removed or renamed in Obsidian leaves
  its copy behind — `git status` is what shows you.
- **A link to a note that is not in the vault** becomes plain text rather than a
  link to a page that does not exist, and the run says which note to fix.

The three paths are machine-specific and live in `scripts/.env`, which is
gitignored: `VAULT_PATH` (the published folder inside the vault), `CONTENT_PATH`
(this project's `src/content`) and `IMAGES_PATH`.

## Maintenance

The site was deliberately built with:

- Astro
- plain CSS
- Markdown
- no database
- no mandatory CMS
- no client-side framework

Most editorial changes need nothing more than creating or editing Markdown.
