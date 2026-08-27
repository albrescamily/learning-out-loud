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

The vault mirrors this folder, one directory per collection, and the sync is
folder to folder:

| In the vault | Lands in              |
| ------------ | --------------------- |
| `writing/`   | `src/content/writing/`  |
| `notes/`     | `src/content/notes/`    |
| `projects/`  | `src/content/projects/` |
| `updates/`   | `src/content/updates/`  |
| attachments  | `src/content/images/`   |

Anything outside those four folders — `templates/` above all — stays in the
vault, and the run lists what it left behind.

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
