/**
 * The sync, run as the real CLI against a sandbox copy of the project.
 *
 * These assert on the file tree rather than on log lines wherever they can:
 * what matters about the orphan sweep is which files still exist afterwards.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  sandbox,
  note,
  PNG,
  type Sandbox,
} from "./harness.ts";

/** Every sandbox made by a test, so nothing survives the run. */
const open: Sandbox[] = [];

async function make(...args: Parameters<typeof sandbox>) {
  const box = await sandbox(...args);
  open.push(box);
  return box;
}

afterEach(async () => {
  while (open.length > 0) {
    await open.pop()!.dispose();
  }
});

/** The four .gitkeep files a fresh sandbox starts with. */
const KEEP = [
  "images/.gitkeep",
  "notes/.gitkeep",
  "projects/.gitkeep",
  "writing/.gitkeep",
];

// =============================================================================
// C. DISCOVERY AND VALIDATION
// =============================================================================

describe("discovery and validation", () => {
  test("C1 ignores folders that are not collections", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.writeVault("dev-log/b.md", note("notes"));
    await box.writeVault("loose.md", note("notes"));

    const result = await box.run(["--all"]);

    assert.equal(result.code, 0);
    assert.deepEqual(await box.tree(), [...KEEP, "notes/a.md"].sort());
  });

  test("C2 finds a note in a subfolder of a collection", async () => {
    const box = await make();

    await box.writeVault("notes/deep/nested/a.md", note("notes"));

    assert.equal((await box.run(["--all"])).code, 0);
    assert.ok((await box.tree()).includes("notes/a.md"));
  });

  test("C3 ignores non-markdown files, dotfiles and dot-folders", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.writeVault("notes/readme.txt", "not a note");
    await box.writeVault("notes/.hidden.md", note("notes"));
    await box.writeVault(".trash/b.md", note("notes"));

    assert.equal((await box.run(["--all"])).code, 0);
    assert.deepEqual(await box.tree(), [...KEEP, "notes/a.md"].sort());
  });

  test("C4 rejects a note missing a required field, writing nothing", async () => {
    const box = await make();

    await box.writeVault(
      "writing/a.md",
      note("writing", { description: undefined as unknown as string }),
    );

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);
    assert.match(result.output, /is missing 'description'/);
    assert.deepEqual(await box.tree(), KEEP);
  });

  test("C5 treats an empty required field as missing", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", { title: '""' }));

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);
    assert.match(result.output, /is missing 'title'/);
  });

  test("C6 reports invalid frontmatter", async () => {
    const box = await make();

    await box.writeVault(
      "notes/a.md",
      "---\ntitle: \"unterminated\n  bad: [\n---\n\nBody.\n",
    );

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);
    assert.match(result.output, /invalid frontmatter/);
    assert.deepEqual(await box.tree(), KEEP);
  });

  test("C7 rejects a filename that slugifies to nothing", async () => {
    const box = await make();

    await box.writeVault("notes/!!!.md", note("notes"));

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);
    assert.match(result.output, /produces an empty slug/);
  });

  test("C8 reports a duplicate slug and the output collision it causes", async () => {
    const box = await make();

    await box.writeVault("notes/KV Cache.md", note("notes"));
    await box.writeVault("notes/kv-cache.md", note("notes"));

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);
    assert.match(result.output, /duplicate slug 'kv-cache'/);
    assert.match(result.output, /output collision/);
    assert.deepEqual(await box.tree(), KEEP);
  });

  test("C9 aborts before writing any note when one of them is invalid", async () => {
    const box = await make();

    await box.writeVault("notes/good.md", note("notes"));
    await box.writeVault("notes/alsogood.md", note("notes"));
    await box.writeVault("notes/bad.md", note("notes", { published: undefined as unknown as string }));

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);

    // The valid notes must not have been written either.
    assert.deepEqual(await box.tree(), KEEP);
  });
});

// =============================================================================
// D. PUBLICATION STATE
// =============================================================================

describe("publication state", () => {
  test("D1 calls a note with no output file unpublished", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--list"]);

    assert.match(result.stdout, /○ unpublished\s+notes\/a/);
  });

  test("D2 calls an identical output published", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.run(["--all"]);

    const result = await box.run(["--list"]);

    assert.match(result.stdout, /✓ published\s+notes\/a/);
  });

  test("D3 calls a differing output modified", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.run(["--all"]);
    await box.writeContent("notes/a.md", "changed by hand");

    const result = await box.run(["--list"]);

    assert.match(result.stdout, /△ modified\s+notes\/a/);
  });

  test("D4 ignores line endings and surrounding whitespace", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.run(["--all"]);

    const published = await box.readContent("notes/a.md");

    await box.writeContent(
      "notes/a.md",
      `\n\n${published.replace(/\n/g, "\r\n")}   \n`,
    );

    const result = await box.run(["--list"]);

    assert.match(result.stdout, /✓ published\s+notes\/a/);
  });

  test("D5 is idempotent: a second --all publishes nothing", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.writeVault("projects/b.md", note("projects"));

    const first = await box.run(["--all"]);
    const second = await box.run(["--all"]);

    assert.match(first.stdout, /2 item\(s\) published, 0 removed\./);
    assert.match(second.stdout, /0 item\(s\) published, 0 removed\./);
  });

  test("D6 lets the vault win over an edit made in src/content", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "From the vault."));
    await box.run(["--all"]);

    await box.writeContent("notes/a.md", "Edited in the repo.");
    await box.run(["--all"]);

    assert.match(await box.readContent("notes/a.md"), /From the vault\./);
  });
});

// =============================================================================
// E. ATTACHMENTS
// =============================================================================

describe("attachments", () => {
  test("E1 copies an attachment found inside the vault", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "![[d.png]]"));
    await box.writeVaultBytes("assets/d.png", PNG);

    assert.equal((await box.run(["--all"])).code, 0);
    assert.ok((await box.tree()).includes("images/d.png"));
  });

  test("E2 copies an attachment stored above the Blog folder", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "![[d.png]]"));
    // Obsidian attachments may live outside the published folder.
    await box.writeVaultRoot("Attachments/d.png", PNG);

    assert.equal((await box.run(["--all"])).code, 0);
    assert.ok((await box.tree()).includes("images/d.png"));
  });

  test("E3 fails when an attachment is nowhere in the vault", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "![[missing.png]]"));

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);
    assert.match(result.output, /attachment not found: missing\.png/);
    assert.deepEqual(await box.tree(), KEEP);
  });

  test("E4 refuses an ambiguous attachment and names both copies", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "![[d.png]]"));
    await box.writeVaultBytes("one/d.png", PNG);
    await box.writeVaultBytes("two/d.png", PNG);

    const result = await box.run(["--all"]);

    assert.equal(result.code, 1);
    assert.match(result.output, /'d\.png' is ambiguous/);
    assert.match(result.output, /one/);
    assert.match(result.output, /two/);
  });

  test("E5 copies only what a published note references", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "![[used.png]]"));
    await box.writeVaultBytes("assets/used.png", PNG);
    await box.writeVaultBytes("assets/unused.png", PNG);

    assert.equal((await box.run(["--all"])).code, 0);

    const tree = await box.tree();

    assert.ok(tree.includes("images/used.png"));
    assert.ok(!tree.includes("images/unused.png"));
  });

  test("E6 never treats a markdown or dot file as an attachment", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "![[notes.md]]"));

    const result = await box.run(["--all"]);

    // notes.md is not in the asset index, so it cannot be found.
    assert.equal(result.code, 1);
    assert.match(result.output, /attachment not found/);
  });
});

// =============================================================================
// F. ORPHANS
// =============================================================================

describe("orphans", () => {
  test("F1 removes the copy of a note deleted in the vault", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.writeVault("notes/b.md", note("notes"));
    await box.run(["--all"]);

    await box.removeVault("notes/b.md");
    const result = await box.run(["--all"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /removed: .*notes.b\.md/);
    assert.deepEqual(await box.tree(), [...KEEP, "notes/a.md"].sort());
  });

  test("F2 propagates a rename: old slug out, new slug in", async () => {
    const box = await make();

    await box.writeVault("notes/old name.md", note("notes"));
    await box.run(["--all"]);

    assert.ok((await box.tree()).includes("notes/old-name.md"));

    await box.removeVault("notes/old name.md");
    await box.writeVault("notes/new name.md", note("notes"));

    const result = await box.run(["--all"]);

    assert.equal(result.code, 0);
    assert.deepEqual(await box.tree(), [...KEEP, "notes/new-name.md"].sort());
  });

  test("F3 removes an image nothing references any more", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes", {}, "![[d.png]]"));
    await box.writeVaultBytes("assets/d.png", PNG);
    await box.run(["--all"]);

    assert.ok((await box.tree()).includes("images/d.png"));

    await box.writeVault("notes/a.md", note("notes", {}, "No image now."));
    await box.run(["--all"]);

    assert.ok(!(await box.tree()).includes("images/d.png"));
  });

  test("F4 never removes .gitkeep", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    assert.equal((await box.run(["--all"])).code, 0);

    const tree = await box.tree();

    for (const keep of KEEP) {
      assert.ok(tree.includes(keep), `${keep} was removed`);
    }
  });

  test("F5 never removes images/README.md", async () => {
    const box = await make();

    await box.writeContent("images/README.md", "# Images\n");
    await box.writeVault("notes/a.md", note("notes"));

    assert.equal((await box.run(["--all"])).code, 0);
    assert.ok((await box.tree()).includes("images/README.md"));
  });

  test("F6 leaves a subfolder inside a collection alone", async () => {
    const box = await make();

    await box.writeContent("notes/drafts/scratch.md", "not generated");
    await box.writeVault("notes/a.md", note("notes"));

    assert.equal((await box.run(["--all"])).code, 0);
    assert.ok((await box.tree()).includes("notes/drafts/scratch.md"));
  });

  test("F7 --keep-orphans keeps them and says how many", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.run(["--all"]);
    await box.removeVault("notes/a.md");

    const result = await box.run(["--all", "--keep-orphans"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /1 orphaned file\(s\) kept\./);
    assert.match(result.stdout, /0 item\(s\) published, 0 removed\./);
    assert.ok((await box.tree()).includes("notes/a.md"));
  });

  test("F8 --id never sweeps", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.writeVault("notes/b.md", note("notes"));
    await box.run(["--all"]);

    // b is now an orphan, and publishing a must not touch it.
    await box.removeVault("notes/b.md");
    await box.writeVault("notes/a.md", note("notes", {}, "Changed."));

    const result = await box.run(["--id", "notes/a"]);

    assert.equal(result.code, 0);
    assert.ok((await box.tree()).includes("notes/b.md"));
  });

  test("F9 --dry lists the removals and deletes nothing", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.run(["--all"]);
    await box.removeVault("notes/a.md");

    const before = await box.tree();
    const result = await box.run(["--all", "--dry"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /\[dry\] remove .*notes.a\.md/);
    assert.deepEqual(await box.tree(), before);
  });

  test("F10 --list shows the orphan section", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.run(["--all"]);
    await box.removeVault("notes/a.md");

    const result = await box.run(["--list"]);

    assert.match(result.stdout, /⨯ orphaned/);
    assert.match(result.stdout, /notes.a\.md/);
  });

  test("F11 --check counts orphans and removes none", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.run(["--all"]);
    await box.removeVault("notes/a.md");

    const before = await box.tree();
    const result = await box.run(["--check"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /1 orphaned file\(s\)/);
    assert.deepEqual(await box.tree(), before);
  });
});
