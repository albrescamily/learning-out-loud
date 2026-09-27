# Public Engineering Notebook

A minimal personal site for documenting:

- projects
- Today I Learned
- articles
- decisions and lessons learned

Built with Astro, plain CSS and Markdown. No database, no CMS, no client-side
framework.

## Running locally

```bash
npm install
npm run dev      # the site
npm run build    # static output into dist/
npm test         # the sync's test suite — 76 cases
```

## Where content comes from

Notes are written in an Obsidian vault and published into `src/content/` by
`scripts/publish.ts`.

> **`src/content/` is generated.** The vault is the source of truth. A file you
> write there by hand survives until the next `npm run publish -- --all`, which
> makes the folder match the vault exactly — and deletes whatever the vault
> does not account for. Content belongs in the vault.

```bash
npm run publish:list                       # what is pending
npm run publish:check                      # validate the vault, write nothing
npm run publish -- --all --dry             # show every write and removal
npm run publish -- --all                   # apply
npm run publish -- --id notes/kv-cache     # one note; never deletes anything
```

| Flag | Effect |
| ---- | ------ |
| `--dry` | Print every write, copy and removal. Touch nothing. |
| `--build` | Run `npm run build` after a successful publish. |
| `--keep-orphans` | Leave behind what the vault no longer has. `--all` only. |

The vault mirrors this repository, one folder per collection:

| In the vault | Lands in |
| ------------ | ----------------------- |
| `writing/` | `src/content/writing/` |
| `notes/` | `src/content/notes/` |
| `projects/` | `src/content/projects/` |
| attachments, from anywhere in the vault | `src/content/images/` |

Every note is `unpublished`, `modified`, `published` or `orphaned`; `--all`
writes the first two, skips the third and deletes the fourth. **The filename is
the URL** — slugs come from filenames, not titles.

`VAULT_PATH` is the one machine-specific setting. It lives in `scripts/.env`,
which is gitignored, and is read as either `VAULT_PATH='C:\...'` or
`$env:VAULT_PATH = 'C:\...'`.

📖 **[docs/publishing.md](docs/publishing.md)** is the full account: the
pipeline stage by stage, what the conversion does to `[[wikilinks]]`, how
deleting and renaming propagate, and where the sync stops being responsible.

## From Obsidian

**Sync to site** is a plugin of this project's own — not a community one. It
adds four commands, each of which can take its own hotkey:

| Command | Runs | Deletes orphans? |
| ------- | ---- | ---------------- |
| Publish current note | `--id <derived from the open file>` | no |
| Publish… | `--id <chosen from a list>` | no |
| Publish everything | `--all` | yes |
| Preview everything (dry run) | `--all --dry` | writes nothing |

Two settings: the repository folder, and whether to run the Astro build
afterwards.

The plugin is not versioned here — the only copy is the one installed in the
vault, at `<vault>/.obsidian/plugins/obsidian-sync-blog/main.js`. It is only a
trigger; all the behaviour lives in `scripts/publish.ts`.

## Deploying

Publishing is not deploying. `--build` is validation — `dist/` is gitignored,
so Vercel never sees it. What Vercel builds is the Markdown under
`src/content/` as it exists on `master`:

```bash
npm run publish -- --all --build   # or the Obsidian command
git add src/content
git commit -m "content: publish notes from vault"
git push                           # this is the deploy
```

The build in the publish step is there so an invalid note fails on your machine
rather than in a failed deployment.

## Images

Attachments referenced from a note are copied into `src/content/images/`
automatically. To point at one from a Markdown body, in any collection:

```markdown
![Alt text](../images/my-diagram.png "Optional caption")
```

The relative path is what makes Astro treat the image as local: it is
converted, resized, and gets its dimensions written onto the tag at build time.
An image alone in a paragraph becomes a `<figure>` with a caption; an image in
the middle of a sentence stays inline. A missing file fails the build.

`src/content/images/README.md` has the rest — alt text versus captions, linked
images, and what happens to remote URLs.

## Layout

| Path | What it is |
| ---- | ---------- |
| `src/pages/` | Routes. One file per page, plus the two `[...slug]` archives |
| `src/content/` | **Generated.** The published Markdown and its images |
| `src/content.config.ts` | The collection schemas Astro enforces at build time |
| `src/lib/` | Navigation, dates, figures — the shared helpers |
| `scripts/publish.ts` | The sync: discovery, state, writing, removal, CLI |
| `scripts/lib/convert.ts` | Obsidian syntax → site Markdown. Pure, no filesystem |
| `scripts/lib/collections.ts` | Which collections exist and what each demands |
| `scripts/test/` | The suite. Runs the real CLI against a sandbox copy |
| `templates/` | The frontmatter contract, one file per collection |
| `docs/publishing.md` | How publishing works, end to end |

## Maintenance

Most editorial changes need nothing more than writing Markdown in the vault and
running one command. Changes to the site itself are Astro and plain CSS; there
is no build step beyond `astro build` and no runtime to keep alive.

Before touching `scripts/`, run `npm test` — the suite covers the destructive
paths, and the sync deletes files.
