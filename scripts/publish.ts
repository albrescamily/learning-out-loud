#!/usr/bin/env node

/**
 * Vault → site.
 *
 * This file is the sync: it finds notes, decides what has changed, writes the
 * result and removes what the vault no longer has. The Obsidian half of the
 * job — wikilinks, attachments, slugs — lives in lib/convert.ts, which knows
 * nothing about the filesystem.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

import {
  COLLECTIONS,
  requiredFields,
  type Collection,
} from "./lib/collections.ts";

import {
  convert,
  slugOf,
  type NoteIndex,
} from "./lib/convert.ts";

// =============================================================================
// TYPES
// =============================================================================

type PublicationState =
  | "unpublished"
  | "modified"
  | "published";

type RawNote = {
  collection: Collection;

  slug: string;

  title: string;

  sourcePath: string;

  sourceLabel: string;

  frontmatter: Record<string, unknown>;

  content: string;
};

type Publishable = {
  /**
   * CLI identifier.
   *
   * Examples:
   *
   * notes/kv-cache
   * writing/llm-serving
   * projects/learning-out-loud
   */
  id: string;

  title: string;

  collection: Collection;

  sourcePath: string;

  sourceLabel: string;

  outputPath: string;

  body: string;

  attachments: Set<string>;
};

/** Files in src/content/ that no note in the vault accounts for any more. */
type Orphans = {
  notes: string[];

  assets: string[];
};

type Diagnostic = {
  level: "warning" | "error";

  message: string;
};

// =============================================================================
// PATHS
// =============================================================================

const __filename = fileURLToPath(import.meta.url);

const SCRIPT_DIR = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(
  SCRIPT_DIR,
  "..",
);

const CONTENT_ROOT = path.join(
  PROJECT_ROOT,
  "src",
  "content",
);

const IMAGES_ROOT = path.join(
  CONTENT_ROOT,
  "images",
);

const ENV_PATH = path.join(
  SCRIPT_DIR,
  ".env",
);

// =============================================================================
// CLI
// =============================================================================

const argv = process.argv.slice(2);

const args = new Map<
  string,
  string | boolean
>();

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];

  if (
    arg === "--list" ||
    arg === "--check" ||
    arg === "--dry" ||
    arg === "--all" ||
    arg === "--build" ||
    arg === "--keep-orphans"
  ) {
    args.set(arg, true);

    continue;
  }

  if (arg === "--id") {
    const value = argv[i + 1];

    if (!value) {
      console.error(
        "error: --id requires a value",
      );

      process.exit(2);
    }

    args.set(
      "--id",
      value,
    );

    i++;

    continue;
  }

  console.error(
    `error: unknown argument: ${arg}`,
  );

  process.exit(2);
}

const LIST_ONLY =
  args.has("--list");

const CHECK_ONLY =
  args.has("--check");

const DRY_RUN =
  args.has("--dry");

const PUBLISH_ALL =
  args.has("--all");

const BUILD_AFTER =
  args.has("--build");

const KEEP_ORPHANS =
  args.has("--keep-orphans");

const SELECTED_ID =
  typeof args.get("--id") === "string"
    ? String(args.get("--id"))
    : undefined;

// =============================================================================
// DIAGNOSTICS
// =============================================================================

const diagnostics: Diagnostic[] = [];

function warning(
  message: string,
) {
  diagnostics.push({
    level: "warning",
    message,
  });
}

function error(
  message: string,
) {
  diagnostics.push({
    level: "error",
    message,
  });
}

function errorCount() {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.level === "error",
  ).length;
}

function warningCount() {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.level === "warning",
  ).length;
}

function printDiagnostics() {
  for (
    const diagnostic
    of diagnostics
  ) {
    console.error(
      `${diagnostic.level}: ${diagnostic.message}`,
    );
  }
}

// =============================================================================
// ENV
// =============================================================================

async function loadEnvFile(
  file: string,
) {
  let text: string;

  try {
    text = await fs.readFile(
      file,
      "utf8",
    );
  } catch {
    warning(
      `no .env at ${file}; using current environment`,
    );

    return;
  }

  for (
    const rawLine
    of text.split(/\r?\n/)
  ) {
    const line =
      rawLine.trim();

    if (!line) {
      continue;
    }

    if (
      line.startsWith("#")
    ) {
      continue;
    }

    const match =
      line.match(
        /^(?:\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
      );

    if (!match) {
      warning(
        `ignoring unreadable .env line: ${line}`,
      );

      continue;
    }

    const [
      ,
      name,
      rawValue,
    ] = match;

    let value =
      rawValue.trim();

    if (
      (
        value.startsWith("'") &&
        value.endsWith("'")
      ) ||
      (
        value.startsWith('"') &&
        value.endsWith('"')
      )
    ) {
      value =
        value.slice(
          1,
          -1,
        );
    }

    if (
      !process.env[name]
    ) {
      process.env[name] =
        value;
    }
  }
}

// =============================================================================
// FILESYSTEM
// =============================================================================

async function exists(
  target: string,
): Promise<boolean> {
  try {
    await fs.access(target);

    return true;
  } catch {
    return false;
  }
}

async function markdownFiles(
  root: string,
): Promise<string[]> {
  if (
    !(await exists(root))
  ) {
    return [];
  }

  const files: string[] =
    [];

  async function walk(
    directory: string,
  ) {
    const entries =
      await fs.readdir(
        directory,
        {
          withFileTypes:
            true,
        },
      );

    for (
      const entry
      of entries
    ) {
      if (
        entry.name.startsWith(
          ".",
        )
      ) {
        continue;
      }

      const fullPath =
        path.join(
          directory,
          entry.name,
        );

      if (
        entry.isDirectory()
      ) {
        await walk(
          fullPath,
        );

        continue;
      }

      if (
        entry.isFile() &&
        entry.name
          .toLowerCase()
          .endsWith(".md")
      ) {
        files.push(
          fullPath,
        );
      }
    }
  }

  await walk(root);

  return files.sort();
}

async function atomicWrite(
  target: string,
  body: string,
) {
  await fs.mkdir(
    path.dirname(target),
    {
      recursive: true,
    },
  );

  const temporary =
    `${target}.tmp-${process.pid}-${Date.now()}`;

  await fs.writeFile(
    temporary,
    body,
    "utf8",
  );

  try {
    await fs.rename(
      temporary,
      target,
    );
  } catch {
    await fs.rm(
      target,
      {
        force: true,
      },
    );

    await fs.rename(
      temporary,
      target,
    );
  }
}

// =============================================================================
// FRONTMATTER
// =============================================================================

function validateFrontmatter(
  collection: Collection,
  frontmatter: Record<
    string,
    unknown
  >,
  source: string,
) {
  for (
    const field
    of requiredFields(
      collection,
    )
  ) {
    const value =
      frontmatter[field];

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      error(
        `${source} is missing '${field}'`,
      );
    }
  }
}

// =============================================================================
// DISCOVERY
// =============================================================================

async function discoverNotes(
  vault: string,
): Promise<RawNote[]> {
  const notes: RawNote[] =
    [];

  for (
    const collection
    of COLLECTIONS
  ) {
    const root =
      path.join(
        vault,
        collection,
      );

    const files =
      await markdownFiles(
        root,
      );

    for (
      const file
      of files
    ) {
      const raw =
        await fs.readFile(
          file,
          "utf8",
        );

      let parsed;

      try {
        parsed =
          matter(raw);
      } catch (cause) {
        error(
          `${collection}/${path.basename(file)} has invalid frontmatter: ${String(cause)}`,
        );

        continue;
      }

      const sourceLabel =
        `${collection}/${path.basename(file)}`;

      validateFrontmatter(
        collection,
        parsed.data,
        sourceLabel,
      );

      const title =
        typeof parsed.data.title ===
        "string"
          ? parsed.data.title
          : path.basename(
              file,
              ".md",
            );

      const slug =
        slugOf(file);

      if (!slug) {
        error(
          `${sourceLabel} produces an empty slug`,
        );

        continue;
      }

      notes.push({
        collection,
        slug,
        title,

        sourcePath:
          file,

        sourceLabel,

        frontmatter:
          parsed.data,

        content:
          parsed.content,
      });
    }
  }

  return notes;
}

// =============================================================================
// INDEX
// =============================================================================

function buildNoteIndex(
  notes: RawNote[],
): NoteIndex {
  const index: NoteIndex =
    new Map();

  for (
    const note
    of notes
  ) {
    const existing =
      index.get(
        note.slug,
      );

    if (existing) {
      error(
        `duplicate slug '${note.slug}': ` +
          `${existing.sourcePath} and ${note.sourcePath}`,
      );

      continue;
    }

    index.set(
      note.slug,
      {
        slug:
          note.slug,

        title:
          note.title,

        collection:
          note.collection,

        sourcePath:
          note.sourcePath,
      },
    );
  }

  return index;
}

// =============================================================================
// PUBLISHABLES
// =============================================================================

function toPublishables(
  notes: RawNote[],
  index: NoteIndex,
): Publishable[] {
  return notes.map(
    (note) => {
      const converted =
        convert(
          note.content,
          note.sourceLabel,
          index,
        );

      for (
        const message
        of converted.warnings
      ) {
        warning(message);
      }

      const body =
        matter.stringify(
          converted.content,
          note.frontmatter,
        );

      return {
        id:
          `${note.collection}/${note.slug}`,

        title:
          note.title,

        collection:
          note.collection,

        sourcePath:
          note.sourcePath,

        sourceLabel:
          note.sourceLabel,

        outputPath:
          path.join(
            CONTENT_ROOT,
            note.collection,
            `${note.slug}.md`,
          ),

        body,

        attachments:
          converted.attachments,
      };
    },
  );
}

// =============================================================================
// OUTPUT COLLISION VALIDATION
// =============================================================================

function validateOutputCollisions(
  publishables: Publishable[],
) {
  const outputs =
    new Map<
      string,
      Publishable
    >();

  for (
    const item
    of publishables
  ) {
    const output =
      path.resolve(
        item.outputPath,
      );

    const previous =
      outputs.get(
        output,
      );

    if (previous) {
      error(
        `output collision:\n` +
          `  ${previous.id}\n` +
          `  ${item.id}\n` +
          `both become ${item.outputPath}`,
      );

      continue;
    }

    outputs.set(
      output,
      item,
    );
  }
}

// =============================================================================
// PUBLICATION STATE
// =============================================================================

function normalizeText(
  text: string,
) {
  return text
    .replace(
      /\r\n/g,
      "\n",
    )
    .trim();
}

async function publicationState(
  item: Publishable,
): Promise<PublicationState> {
  if (
    !(await exists(
      item.outputPath,
    ))
  ) {
    return "unpublished";
  }

  const current =
    await fs.readFile(
      item.outputPath,
      "utf8",
    );

  if (
    normalizeText(current) ===
    normalizeText(item.body)
  ) {
    return "published";
  }

  return "modified";
}

// =============================================================================
// ORPHANS
// =============================================================================

/**
 * What is in src/content/ that the vault no longer accounts for.
 *
 * A note deleted in Obsidian and a note renamed there look identical from
 * here: in both cases a file exists that no vault note would produce. That is
 * why this compares the whole expected set rather than tracking renames — the
 * vault is the source of truth, and anything else is left over.
 *
 * Only meaningful when every note has been enumerated, so only `--all` acts on
 * it: on `--id` the other notes are absent from `publishables` by design, not
 * because they were deleted.
 */
async function findOrphans(
  publishables: Publishable[],
): Promise<Orphans> {
  const expectedNotes =
    new Set(
      publishables.map(
        (item) =>
          path.resolve(
            item.outputPath,
          ),
      ),
    );

  const expectedAssets =
    new Set<string>();

  for (
    const item
    of publishables
  ) {
    for (
      const attachment
      of item.attachments
    ) {
      expectedAssets.add(
        attachment,
      );
    }
  }

  const notes: string[] =
    [];

  for (
    const collection
    of COLLECTIONS
  ) {
    const directory =
      path.join(
        CONTENT_ROOT,
        collection,
      );

    if (
      !(await exists(
        directory,
      ))
    ) {
      continue;
    }

    const entries =
      await fs.readdir(
        directory,
        {
          withFileTypes:
            true,
        },
      );

    for (
      const entry
      of entries
    ) {
      // .gitkeep holds the folder in git so Astro's watcher finds it at
      // startup; a subfolder is not something this sync ever writes.
      if (
        !entry.isFile() ||
        entry.name.startsWith(".") ||
        !entry.name
          .toLowerCase()
          .endsWith(".md")
      ) {
        continue;
      }

      const full =
        path.join(
          directory,
          entry.name,
        );

      if (
        !expectedNotes.has(
          path.resolve(full),
        )
      ) {
        notes.push(full);
      }
    }
  }

  const assets: string[] =
    [];

  if (
    await exists(IMAGES_ROOT)
  ) {
    const entries =
      await fs.readdir(
        IMAGES_ROOT,
        {
          withFileTypes:
            true,
        },
      );

    for (
      const entry
      of entries
    ) {
      // README.md documents the folder rather than being an attachment, and
      // no note will ever reference it.
      if (
        !entry.isFile() ||
        entry.name.startsWith(".") ||
        entry.name
          .toLowerCase()
          .endsWith(".md")
      ) {
        continue;
      }

      if (
        !expectedAssets.has(
          entry.name,
        )
      ) {
        assets.push(
          path.join(
            IMAGES_ROOT,
            entry.name,
          ),
        );
      }
    }
  }

  return {
    notes: notes.sort(),
    assets: assets.sort(),
  };
}

function orphanCount(
  orphans: Orphans,
): number {
  return (
    orphans.notes.length +
    orphans.assets.length
  );
}

async function removeOrphans(
  orphans: Orphans,
): Promise<number> {
  const targets = [
    ...orphans.notes,
    ...orphans.assets,
  ];

  if (
    targets.length === 0
  ) {
    return 0;
  }

  console.log();

  for (
    const target
    of targets
  ) {
    const label =
      path.relative(
        PROJECT_ROOT,
        target,
      );

    if (DRY_RUN) {
      console.log(
        `[dry] remove ${label}`,
      );

      continue;
    }

    await fs.rm(
      target,
      {
        force: true,
      },
    );

    console.log(
      `removed: ${label}`,
    );
  }

  return targets.length;
}

// =============================================================================
// ASSETS
// =============================================================================

type AssetIndex =
  Map<string, string[]>;

async function buildAssetIndex(
  root: string,
): Promise<AssetIndex> {
  const index:
    AssetIndex =
      new Map();

  if (
    !(await exists(root))
  ) {
    return index;
  }

  async function walk(
    directory: string,
  ) {
    const entries =
      await fs.readdir(
        directory,
        {
          withFileTypes:
            true,
        },
      );

    for (
      const entry
      of entries
    ) {
      if (
        entry.name.startsWith(
          ".",
        )
      ) {
        continue;
      }

      const fullPath =
        path.join(
          directory,
          entry.name,
        );

      if (
        entry.isDirectory()
      ) {
        await walk(
          fullPath,
        );

        continue;
      }

      if (
        !entry.isFile()
      ) {
        continue;
      }

      if (
        entry.name
          .toLowerCase()
          .endsWith(".md")
      ) {
        continue;
      }

      const existing =
        index.get(
          entry.name,
        ) ?? [];

      existing.push(
        fullPath,
      );

      index.set(
        entry.name,
        existing,
      );
    }
  }

  await walk(root);

  return index;
}

function resolveAttachments(
  item: Publishable,
  assetIndex: AssetIndex,
): Map<string, string> {
  const resolved =
    new Map<
      string,
      string
    >();

  for (
    const attachment
    of item.attachments
  ) {
    const matches =
      assetIndex.get(
        attachment,
      ) ?? [];

    if (
      matches.length === 0
    ) {
      error(
        `${item.id}: attachment not found: ${attachment}`,
      );

      continue;
    }

    if (
      matches.length > 1
    ) {
      error(
        `${item.id}: attachment '${attachment}' is ambiguous:\n` +
          matches
            .map(
              (file) =>
                `  ${file}`,
            )
            .join("\n"),
      );

      continue;
    }

    resolved.set(
      attachment,
      matches[0],
    );
  }

  return resolved;
}

// =============================================================================
// LIST
// =============================================================================

async function listPublishables(
  publishables: Publishable[],
  orphans: Orphans,
) {
  const unpublished:
    Publishable[] = [];

  const modified:
    Publishable[] = [];

  const published:
    Publishable[] = [];

  for (
    const item
    of publishables
  ) {
    const state =
      await publicationState(
        item,
      );

    switch (state) {
      case "unpublished":
        unpublished.push(
          item,
        );
        break;

      case "modified":
        modified.push(
          item,
        );
        break;

      case "published":
        published.push(
          item,
        );
        break;
    }
  }

  console.log();
  console.log(
    "○ unpublished",
  );

  if (
    unpublished.length === 0
  ) {
    console.log(
      "  none",
    );
  }

  for (
    const item
    of unpublished
  ) {
    console.log(
      `  ${item.id}`,
    );

    console.log(
      `    ${item.title}`,
    );
  }

  console.log();
  console.log(
    "△ modified",
  );

  if (
    modified.length === 0
  ) {
    console.log(
      "  none",
    );
  }

  for (
    const item
    of modified
  ) {
    console.log(
      `  ${item.id}`,
    );

    console.log(
      `    ${item.title}`,
    );
  }

  console.log();
  console.log(
    "✓ published",
  );

  if (
    published.length === 0
  ) {
    console.log(
      "  none",
    );
  }

  for (
    const item
    of published
  ) {
    console.log(
      `  ${item.id}`,
    );

    console.log(
      `    ${item.title}`,
    );
  }

  console.log();
  console.log(
    "⨯ orphaned — deleted or renamed in the vault",
  );

  if (
    orphanCount(orphans) === 0
  ) {
    console.log(
      "  none",
    );
  }

  for (
    const target
    of [
      ...orphans.notes,
      ...orphans.assets,
    ]
  ) {
    console.log(
      `  ${path.relative(PROJECT_ROOT, target)}`,
    );
  }

  console.log();
}

// =============================================================================
// PUBLISH ONE
// =============================================================================

async function publishOne(
  item: Publishable,
  assetIndex: AssetIndex,
) {
  const state =
    await publicationState(
      item,
    );

  console.log();
  console.log(
    `publishing: ${item.id}`,
  );

  console.log(
    `title:      ${item.title}`,
  );

  console.log(
    `state:      ${state}`,
  );

  const resolved =
    resolveAttachments(
      item,
      assetIndex,
    );

  if (
    errorCount() > 0
  ) {
    return;
  }

  if (DRY_RUN) {
    console.log();

    console.log(
      `[dry] ${item.sourceLabel}`,
    );

    console.log(
      `      -> ${path.relative(PROJECT_ROOT, item.outputPath)}`,
    );

    for (
      const [
        name,
        source,
      ]
      of resolved
    ) {
      console.log(
        `[dry] asset ${name}`,
      );

      console.log(
        `      ${source}`,
      );
    }

    return;
  }

  await atomicWrite(
    item.outputPath,
    item.body,
  );

  if (
    resolved.size > 0
  ) {
    await fs.mkdir(
      IMAGES_ROOT,
      {
        recursive: true,
      },
    );
  }

  for (
    const [
      filename,
      source,
    ]
    of resolved
  ) {
    await fs.copyFile(
      source,
      path.join(
        IMAGES_ROOT,
        filename,
      ),
    );
  }

  console.log();

  console.log(
    `published -> ${path.relative(PROJECT_ROOT, item.outputPath)}`,
  );

  console.log(
    `${resolved.size} asset(s) copied.`,
  );
}

// =============================================================================
// BUILD
// =============================================================================

/**
 * Runs the Astro build in a child process.
 *
 * `shell: true` because on Windows `npm` is `npm.cmd`, which Node will not
 * spawn directly.
 */
function runBuild(): Promise<void> {
  console.log();

  console.log(
    "== build ==",
  );

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const child =
        spawn(
          "npm",
          [
            "run",
            "build",
          ],
          {
            cwd: PROJECT_ROOT,
            stdio: "inherit",
            shell: true,
          },
        );

      child.on(
        "error",
        reject,
      );

      child.on(
        "close",
        (code) => {
          if (code === 0) {
            resolve();

            return;
          }

          reject(
            new Error(
              `build failed with exit code ${code}`,
            ),
          );
        },
      );
    },
  );
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  await loadEnvFile(
    ENV_PATH,
  );

  const vaultValue =
    process.env
      .VAULT_PATH
      ?.trim();

  if (!vaultValue) {
    console.error(
      `error: VAULT_PATH is not set in ${ENV_PATH}`,
    );

    process.exit(1);
  }

  const VAULT =
    path.resolve(
      vaultValue,
    );

  if (
    !(await exists(VAULT))
  ) {
    console.error(
      "error: VAULT_PATH does not exist:",
    );

    console.error(
      `  ${VAULT}`,
    );

    process.exit(1);
  }

  // VAULT_PATH points at Blog/.
  //
  // Attachments may exist one level above it.
  const VAULT_ROOT =
    path.dirname(
      VAULT,
    );

  console.log(
    `vault:   ${VAULT}`,
  );

  console.log(
    `project: ${PROJECT_ROOT}`,
  );

  console.log(
    `content: ${CONTENT_ROOT}`,
  );

  // ---------------------------------------------------------------------------
  // DISCOVER
  // ---------------------------------------------------------------------------

  const notes =
    await discoverNotes(
      VAULT,
    );

  // ---------------------------------------------------------------------------
  // INDEX
  // ---------------------------------------------------------------------------

  const noteIndex =
    buildNoteIndex(
      notes,
    );

  // ---------------------------------------------------------------------------
  // TRANSFORM
  // ---------------------------------------------------------------------------

  const publishables =
    toPublishables(
      notes,
      noteIndex,
    );

  // ---------------------------------------------------------------------------
  // VALIDATE
  // ---------------------------------------------------------------------------

  validateOutputCollisions(
    publishables,
  );

  const assetIndex =
    await buildAssetIndex(
      VAULT_ROOT,
    );

  printDiagnostics();

  if (
    errorCount() > 0
  ) {
    console.error();

    console.error(
      `aborted: ${errorCount()} error(s), ${warningCount()} warning(s).`,
    );

    process.exit(1);
  }

  const orphans =
    await findOrphans(
      publishables,
    );

  // ---------------------------------------------------------------------------
  // CHECK
  // ---------------------------------------------------------------------------

  if (CHECK_ONLY) {
    console.log();

    console.log(
      `check passed: ${publishables.length} publishable note(s), ${warningCount()} warning(s).`,
    );

    if (
      orphanCount(orphans) > 0
    ) {
      console.log(
        `${orphanCount(orphans)} orphaned file(s) in src/content/; --all removes them.`,
      );
    }

    return;
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  if (LIST_ONLY) {
    await listPublishables(
      publishables,
      orphans,
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // PUBLISH ALL CHANGED CONTENT
  // ---------------------------------------------------------------------------

  if (PUBLISH_ALL) {
    let count = 0;

    for (
      const item
      of publishables
    ) {
      const state =
        await publicationState(
          item,
        );

      if (
        state ===
        "published"
      ) {
        continue;
      }

      await publishOne(
        item,
        assetIndex,
      );

      if (
        errorCount() > 0
      ) {
        break;
      }

      count++;
    }

    printDiagnostics();

    if (
      errorCount() > 0
    ) {
      process.exit(1);
    }

    // Deletions and renames propagate here, and only here: this is the one
    // path that has seen every note in the vault.
    const removed =
      KEEP_ORPHANS
        ? 0
        : await removeOrphans(
            orphans,
          );

    if (
      KEEP_ORPHANS &&
      orphanCount(orphans) > 0
    ) {
      console.log();

      console.log(
        `${orphanCount(orphans)} orphaned file(s) kept.`,
      );
    }

    console.log();

    console.log(
      `${count} item(s) published, ${removed} removed.`,
    );

    if (
      BUILD_AFTER &&
      !DRY_RUN
    ) {
      await runBuild();
    }

    return;
  }

  // ---------------------------------------------------------------------------
  // PUBLISH SELECTED NOTE
  // ---------------------------------------------------------------------------

  if (SELECTED_ID) {
    const item =
      publishables.find(
        (candidate) =>
          candidate.id ===
          SELECTED_ID,
      );

    if (!item) {
      console.error();

      console.error(
        `error: no publishable note '${SELECTED_ID}'`,
      );

      console.error();

      console.error(
        "Available unpublished/modified notes:",
      );

      for (
        const candidate
        of publishables
      ) {
        const state =
          await publicationState(
            candidate,
          );

        if (
          state !==
          "published"
        ) {
          console.error(
            `  ${candidate.id}`,
          );
        }
      }

      process.exit(1);
    }

    await publishOne(
      item,
      assetIndex,
    );

    printDiagnostics();

    if (
      errorCount() > 0
    ) {
      process.exit(1);
    }

    if (
      BUILD_AFTER &&
      !DRY_RUN
    ) {
      await runBuild();
    }

    return;
  }

  // ---------------------------------------------------------------------------
  // NOTHING SELECTED
  // ---------------------------------------------------------------------------

  console.log();

  console.log(
    "No publication selected.",
  );

  console.log();

  console.log(
    "List content:",
  );

  console.log(
    "  npm run publish:list",
  );

  console.log();

  console.log(
    "Publish one note:",
  );

  console.log(
    "  npm run publish -- --id notes/kv-cache",
  );

  console.log();

  console.log(
    "Publish all unpublished/modified notes:",
  );

  console.log(
    "  npm run publish -- --all",
  );

  console.log();

  console.log(
    "Add --dry to any of those to write nothing, or --build to run the",
  );

  console.log(
    "Astro build straight after publishing. --all also removes what the",
  );

  console.log(
    "vault no longer has; --keep-orphans leaves it in place.",
  );
}

main().catch(
  (cause) => {
    console.error(
      cause,
    );

    process.exit(1);
  },
);
