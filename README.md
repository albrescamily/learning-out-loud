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

## Maintenance

The site was deliberately built with:

- Astro
- plain CSS
- Markdown
- no database
- no mandatory CMS
- no client-side framework

Most editorial changes need nothing more than creating or editing Markdown.
