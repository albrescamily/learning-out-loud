/**
 * The pure layer: no filesystem, no subprocess, no sandbox. These run in
 * milliseconds and are where a conversion rule should be pinned down.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  slugify,
  convert,
  type NoteIndex,
} from "../lib/convert.ts";

import {
  COLLECTIONS,
  requiredFields,
} from "../lib/collections.ts";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** An index holding one note per collection, which is all any case here needs. */
function index(): NoteIndex {
  return new Map([
    [
      "kv-cache",
      {
        slug: "kv-cache",
        title: "KV Cache",
        collection: "notes" as const,
        sourcePath: "notes/kv cache.md",
      },
    ],
    [
      "learning-out-loud",
      {
        slug: "learning-out-loud",
        title: "Learning out loud",
        collection: "projects" as const,
        sourcePath: "projects/learning-out-loud.md",
      },
    ],
  ]);
}

function run(body: string) {
  return convert(body, "notes/source.md", index());
}

// =============================================================================
// A. SLUGS
// =============================================================================

describe("slugify", () => {
  test("A1 strips accents", () => {
    assert.equal(
      slugify("Padrões de Projeto.md"),
      "padroes-de-projeto",
    );
  });

  test("A2 strips the extension whatever its case", () => {
    assert.equal(slugify("Note.MD"), "note");
    assert.equal(slugify("Note.md"), "note");
  });

  test("A3 drops punctuation and turns spaces into dashes", () => {
    assert.equal(
      slugify("CQRs: Separating Read & Write!"),
      "cqrs-separating-read-write",
    );
  });

  test("A4 collapses repeated dashes and trims them", () => {
    assert.equal(slugify("  --a   b--  "), "a-b");
  });

  test("A5 gives an empty slug for a name with nothing usable", () => {
    assert.equal(slugify("!!!.md"), "");
  });
});

// =============================================================================
// A. WIKILINKS
// =============================================================================

describe("wikilinks", () => {
  test("A6 resolves a bare link", () => {
    const result = run("see [[KV Cache]] here");

    assert.equal(result.content, "see [KV Cache](/notes/kv-cache) here");
    assert.deepEqual(result.warnings, []);
  });

  test("A7 uses the alias as the label", () => {
    assert.equal(
      run("see [[KV Cache|the cache]]").content,
      "see [the cache](/notes/kv-cache)",
    );
  });

  test("A8 keeps the heading as a slugified anchor", () => {
    assert.equal(
      run("see [[KV Cache#Eviction Policy]]").content,
      "see [KV Cache#Eviction Policy](/notes/kv-cache#eviction-policy)",
    );
  });

  test("A9 handles an alias and a heading together", () => {
    assert.equal(
      run("see [[KV Cache#Eviction|the policy]]").content,
      "see [the policy](/notes/kv-cache#eviction)",
    );
  });

  test("A10 degrades an unresolved link to plain text, with a warning", () => {
    const result = run("see [[Nothing Here]]");

    assert.equal(result.content, "see Nothing Here");
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /cannot be resolved/);
    assert.match(result.warnings[0], /notes\/source\.md/);
  });

  test("A11 rejects a block reference as unsupported", () => {
    const result = run("see [[KV Cache^block]]");

    assert.equal(result.content, "see KV Cache^block");
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /block link/);
  });

  test("A12 points at the target's collection, not the source's", () => {
    assert.equal(
      run("see [[Learning out loud]]").content,
      "see [Learning out loud](/projects/learning-out-loud)",
    );
  });

  test("A13 replaces every occurrence", () => {
    assert.equal(
      run("[[KV Cache]] and [[KV Cache]]").content,
      "[KV Cache](/notes/kv-cache) and [KV Cache](/notes/kv-cache)",
    );
  });

  test("A14 tolerates padding inside the brackets", () => {
    assert.equal(
      run("see [[  KV Cache  ]]").content,
      "see [KV Cache](/notes/kv-cache)",
    );
  });
});

// =============================================================================
// A. ATTACHMENTS
// =============================================================================

describe("attachment embeds", () => {
  test("A15 rewrites the path and registers the attachment", () => {
    const result = run("![[diagram.png]]");

    assert.equal(result.content, "![](../images/diagram.png)");
    assert.deepEqual([...result.attachments], ["diagram.png"]);
  });

  test("A16 uses the alias as alt text", () => {
    assert.equal(
      run("![[diagram.png|A diagram]]").content,
      "![A diagram](../images/diagram.png)",
    );
  });

  test("A17 wraps a filename containing spaces in angle brackets", () => {
    // Without these, CommonMark ends the destination at the first space and
    // the image never reaches the build.
    assert.equal(
      run("![[Pasted image 20260828145319.png]]").content,
      "![](<../images/Pasted image 20260828145319.png>)",
    );
  });

  test("A18 treats ![[x]] as an embed and never as a wikilink", () => {
    // "kv-cache" is in the index, so a wikilink would resolve to a link. The
    // leading ! has to win, and no warning may be raised either way.
    const result = run("![[kv-cache]]");

    assert.equal(result.content, "![](../images/kv-cache)");
    assert.deepEqual(result.warnings, []);
  });

  test("A19 leaves a plain Markdown image alone", () => {
    const body = '![Alt](../images/x.png "Caption")';
    const result = run(body);

    assert.equal(result.content, body);
    assert.equal(result.attachments.size, 0);
  });

  test("A20 records a repeated attachment once", () => {
    const result = run("![[a.png]] and ![[a.png]]");

    assert.deepEqual([...result.attachments], ["a.png"]);
  });
});

// =============================================================================
// A. PURITY
// =============================================================================

describe("purity", () => {
  test("A21 does not mutate its input and is deterministic", () => {
    const body = "[[KV Cache]] and ![[a.png]]";
    const before = body;

    const first = run(body);
    const second = run(body);

    assert.equal(body, before);
    assert.equal(first.content, second.content);
    assert.deepEqual([...first.attachments], [...second.attachments]);
  });
});

// =============================================================================
// B. COLLECTION CONTRACT
// =============================================================================

describe("collections", () => {
  test("B1 states the required fields per collection", () => {
    assert.deepEqual(
      requiredFields("writing"),
      ["title", "description", "published"],
    );

    assert.deepEqual(
      requiredFields("notes"),
      ["title", "published"],
    );

    assert.deepEqual(
      requiredFields("projects"),
      ["title", "description", "status", "published"],
    );
  });

  test("B2 matches the collections Astro actually declares", async () => {
    // A guard against drift: adding a collection to the site without teaching
    // the sync about it would otherwise fail silently, by simply never
    // syncing it.
    const config = await fs.readFile(
      path.join(PROJECT_ROOT, "src", "content.config.ts"),
      "utf8",
    );

    const declared = config.match(
      /export\s+const\s+collections\s*=\s*\{([^}]*)\}/,
    );

    assert.ok(declared, "could not find `export const collections` in content.config.ts");

    const names = declared[1]
      .split(",")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.split(":")[0].trim())
      .sort();

    assert.deepEqual(names, [...COLLECTIONS].sort());
  });
});
