# Images

Every image used by a piece of content lives here, in one flat folder. Each
collection sits one level up from it, so the path from any entry is the same:

```markdown
![Alt text](../images/my-diagram.png "Optional caption")
```

That single relative path is the whole convention. It is also what tells Astro
the file is a local image: relative paths are resolved at build time, the file
is converted and resized into `dist/_astro/`, and the `<img>` comes out with
its dimensions, `loading="lazy"`, a hashed filename, and a `srcset` of smaller
copies so a phone downloads a phone-sized file. A path that leaves the project —
a `https://` URL, or anything under `public/` — is emitted as written and never
optimized.

## Every image is the same size

Figures render at the full width of the prose column, whatever the source
measures, and are centred with the caption centred under them. That is a CSS
rule (`.prose figure img` in `src/styles/global.css`), not something an
individual image can opt out of.

The one thing to watch: **save sources at least 1440px wide.** The column is
720px, and doubling it covers high-density screens. A narrower file still fills
the column — the browser stretches it — and stretching is what makes an image
look soft. Astro never generates a copy larger than the source, so the fix is
always a bigger original.

This folder is outside every collection's `base`, so nothing here is loaded as
content, including this file.

## Alt text and captions

They are different jobs and both are worth doing:

- **Alt text**, the `[...]` part, describes the image for someone who cannot
  see it. Write what the image *says*, not that it is an image.
- **The caption**, the quoted title after the path, is printed under the image
  for everyone. It is optional, and it is not a repeat of the alt text.

An image alone in its paragraph becomes a `<figure>`, with the caption as its
`<figcaption>`. An image with text beside it stays inline in that sentence and
takes no caption. Both are set up in `src/lib/figures.ts`.

A link around the image works and stays a figure:

```markdown
[![Alt text](../images/my-diagram.png "Optional caption")](https://example.com)
```

## Two things that will catch you

- **Notes in a subfolder need another `../`.** The path is relative to the
  Markdown file, not to `src/content/`. Keeping entries flat keeps it uniform.
- **A missing file fails the build**, loudly, with the path it tried. That is
  the intended behaviour: a broken image never reaches the site.
