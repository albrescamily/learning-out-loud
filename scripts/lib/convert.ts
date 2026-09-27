/**
 * Obsidian syntax → site Markdown.
 *
 * Everything that knows what `[[a wikilink]]` or `![[an attachment]]` means
 * lives here, and nothing else does. These functions touch no filesystem and
 * read no arguments: they take a string and an index of what exists, and hand
 * back a string plus what they could not resolve. That is what makes the
 * conversion testable on its own, and what keeps the sync free of Obsidian.
 *
 * The direction is one-way by nature. `[[KV Cache]]` becomes
 * `[KV Cache](/notes/kv-cache)`, and going back would mean guessing which
 * links were wikilinks to begin with.
 */

import path from "node:path";

import type { Collection } from "./collections.ts";

/** One note, as the converter needs to see it to resolve a link to it. */
export type NoteIndexEntry = {
  slug: string;

  title: string;

  collection: Collection;

  sourcePath: string;
};

export type NoteIndex =
  Map<string, NoteIndexEntry>;

export type Conversion = {
  content: string;

  /** Attachment filenames the body references, in the order they appeared. */
  attachments: Set<string>;

  /**
   * Returned rather than logged: the converter has no opinion about where a
   * warning should be shown, and its caller does.
   */
  warnings: string[];
};

// =============================================================================
// SLUGS
// =============================================================================

/**
 * A filename or a link target, as a URL-safe slug.
 *
 * "Padrões de Projeto.md" becomes "padroes-de-projeto": decomposing to NFD
 * first is what lets the diacritic strip work on the combining marks rather
 * than on precomposed characters.
 */
export function slugify(
  input: string,
): string {
  return input
    .replace(
      /\.md$/i,
      "",
    )
    .normalize("NFD")
    .replace(
      /\p{Diacritic}/gu,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9 -]/g,
      "",
    )
    .trim()
    .replace(
      /\s+/g,
      "-",
    )
    .replace(
      /-+/g,
      "-",
    )
    .replace(
      /^-|-$/g,
      "",
    );
}

export function slugOf(
  filename: string,
): string {
  return slugify(
    path.basename(
      filename,
    ),
  );
}

// =============================================================================
// URL RESOLUTION
// =============================================================================

/**
 * The site URL a wikilink target points at, or undefined when nothing in the
 * index answers to it.
 */
export function urlFor(
  rawTarget: string,
  index: NoteIndex,
): string | undefined {
  const target =
    rawTarget.trim();

  // Obsidian block references aren't supported.
  if (
    target.includes("^")
  ) {
    return undefined;
  }

  const hashIndex =
    target.indexOf("#");

  let noteName =
    target;

  let heading:
    | string
    | undefined;

  if (
    hashIndex !== -1
  ) {
    noteName =
      target.slice(
        0,
        hashIndex,
      );

    heading =
      target.slice(
        hashIndex + 1,
      );
  }

  const note =
    index.get(
      slugify(
        noteName,
      ),
    );

  if (!note) {
    return undefined;
  }

  let url =
    `/${note.collection}/${note.slug}`;

  if (heading) {
    url +=
      `#${slugify(heading)}`;
  }

  return url;
}

// =============================================================================
// CONVERSION
// =============================================================================

/**
 * One note's body, rewritten for the site.
 *
 * `source` only ever appears in the warnings, so the caller can say which note
 * a problem came from.
 */
export function convert(
  input: string,
  source: string,
  index: NoteIndex,
): Conversion {
  const attachments =
    new Set<string>();

  const warnings: string[] =
    [];

  let content =
    input;

  // ---------------------------------------------------------------------------
  // Embedded attachments
  //
  // ![[diagram.png]]
  // ![[diagram.png|Diagram]]
  // ---------------------------------------------------------------------------

  content =
    content.replace(
      /!\[\[([^\]]+)\]\]/g,
      (
        _match,
        inner: string,
      ) => {
        const pipe =
          inner.indexOf("|");

        const filename =
          pipe === -1
            ? inner.trim()
            : inner
                .slice(
                  0,
                  pipe,
                )
                .trim();

        const alt =
          pipe === -1
            ? ""
            : inner
                .slice(
                  pipe + 1,
                )
                .trim();

        attachments.add(
          filename,
        );

        // Obsidian names a pasted image "Pasted image 20260828145319.png",
        // and CommonMark ends a link destination at the first space unless it
        // is wrapped in angle brackets. Without them the line renders as
        // literal text and the file never reaches the build.
        const destination =
          filename.includes(" ")
            ? `<../images/${filename}>`
            : `../images/${filename}`;

        return (
          `![${alt}]` +
          `(${destination})`
        );
      },
    );

  // ---------------------------------------------------------------------------
  // Wikilinks
  //
  // [[KV Cache]]
  // [[KV Cache|cache]]
  // [[KV Cache#Eviction]]
  // ---------------------------------------------------------------------------

  content =
    content.replace(
      /\[\[([^\]]+)\]\]/g,
      (
        _match,
        inner: string,
      ) => {
        const pipe =
          inner.indexOf("|");

        const target =
          pipe === -1
            ? inner.trim()
            : inner
                .slice(
                  0,
                  pipe,
                )
                .trim();

        const label =
          pipe === -1
            ? target
            : inner
                .slice(
                  pipe + 1,
                )
                .trim();

        if (
          target.includes("^")
        ) {
          warnings.push(
            `${source} uses unsupported Obsidian block link [[${target}]]`,
          );

          return label;
        }

        const url =
          urlFor(
            target,
            index,
          );

        if (!url) {
          warnings.push(
            `${source} links to [[${target}]], which cannot be resolved`,
          );

          return label;
        }

        return (
          `[${label}](${url})`
        );
      },
    );

  return {
    content,
    attachments,
    warnings,
  };
}
