/**
 * The command line itself: exit codes, what each flag does and does not do,
 * and the shape of the output other things depend on.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  sandbox,
  note,
  type Sandbox,
} from "./harness.ts";

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

const KEEP = [
  "images/.gitkeep",
  "notes/.gitkeep",
  "projects/.gitkeep",
  "writing/.gitkeep",
];

// =============================================================================
// G. CLI
// =============================================================================

describe("cli", () => {
  test("G1 prints help and succeeds when nothing is selected", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run([]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /No publication selected/);
    assert.match(result.stdout, /npm run publish:list/);
    assert.deepEqual(await box.tree(), KEEP);
  });

  test("G2 rejects an unknown argument with exit 2", async () => {
    const box = await make();

    const result = await box.run(["--nope"]);

    assert.equal(result.code, 2);
    assert.match(result.stderr, /unknown argument: --nope/);
  });

  test("G3 rejects --id without a value with exit 2", async () => {
    const box = await make();

    const result = await box.run(["--id"]);

    assert.equal(result.code, 2);
    assert.match(result.stderr, /--id requires a value/);
  });

  test("G4 rejects an unknown id and lists the candidates", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--id", "notes/nope"]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /no publishable note 'notes\/nope'/);
    assert.match(result.stderr, /notes\/a/);
  });

  test("G5 --id publishes only the note named", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));
    await box.writeVault("notes/b.md", note("notes"));

    const result = await box.run(["--id", "notes/a"]);

    assert.equal(result.code, 0);
    assert.deepEqual(await box.tree(), [...KEEP, "notes/a.md"].sort());
  });

  test("G6 --check writes nothing", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--check"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /check passed: 1 publishable note\(s\)/);
    assert.deepEqual(await box.tree(), KEEP);
  });

  test("G7 --list prints all four groups, with none where empty", async () => {
    const box = await make();

    const result = await box.run(["--list"]);

    assert.equal(result.code, 0);

    for (const heading of ["○ unpublished", "△ modified", "✓ published", "⨯ orphaned"]) {
      assert.ok(
        result.stdout.includes(heading),
        `missing group: ${heading}`,
      );
    }

    assert.equal(
      (result.stdout.match(/^ {2}none$/gm) ?? []).length,
      4,
    );
  });

  test("G8 --dry --all writes, copies and removes nothing", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--all", "--dry"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /\[dry\]/);
    assert.deepEqual(await box.tree(), KEEP);
  });

  test("G9 prints a summary in the shape the Obsidian plugin parses", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--all"]);

    // Kept in step with the regex in the vault plugin's main.js.
    const line = result.stdout
      .split(/\r?\n/)
      .map(text => text.trim())
      .find(text => /^\d+ item\(s\) published, \d+ removed\.$/.test(text));

    assert.ok(line, "no line matched the plugin's summary regex");
    assert.equal(line, "1 item(s) published, 0 removed.");
  });

  test("G10 --build runs the build, and fails when the build fails", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--all", "--build"]);

    assert.equal(result.code, 0);
    assert.ok(await box.exists("build-ran"), "the build did not run");

    const failing = await make({ build: "node -e \"process.exit(1)\"" });

    await failing.writeVault("notes/a.md", note("notes"));

    const failed = await failing.run(["--all", "--build"]);

    assert.equal(failed.code, 1);
    assert.match(failed.output, /build failed with exit code 1/);
  });

  test("G11 --dry --build does not run the build", async () => {
    const box = await make();

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--all", "--dry", "--build"]);

    assert.equal(result.code, 0);
    assert.ok(!(await box.exists("build-ran")), "the build ran on a dry run");
  });

  test("G12 fails when VAULT_PATH is set nowhere", async () => {
    const box = await make({ env: null });

    const result = await box.run(["--all"], { VAULT_PATH: undefined });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /VAULT_PATH is not set/);
  });

  test("G13 fails when VAULT_PATH points at nothing", async () => {
    const box = await make({ env: null });

    const result = await box.run(
      ["--all"],
      { VAULT_PATH: "C:\\does\\not\\exist\\anywhere" },
    );

    assert.equal(result.code, 1);
    assert.match(result.stderr, /VAULT_PATH does not exist/);
  });
});

// =============================================================================
// H. .env
// =============================================================================

describe(".env", () => {
  test("H1 reads NAME=value", async () => {
    const box = await make({ env: "" });

    await box.writeVault("notes/a.md", note("notes"));

    // Written now that the vault path is known.
    await box.writeEnv(`VAULT_PATH=${box.vault}\n`);

    const result = await box.run(["--check"], { VAULT_PATH: undefined });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /check passed: 1 publishable note/);
  });

  test("H2 reads the PowerShell form", async () => {
    const box = await make({ env: "" });

    await box.writeVault("notes/a.md", note("notes"));
    await box.writeEnv(
      `$env:VAULT_PATH = '${box.vault}'\n`,
    );

    const result = await box.run(["--check"], { VAULT_PATH: undefined });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /check passed: 1 publishable note/);
  });

  test("H3 strips single and double quotes", async () => {
    const single = await make({ env: "" });

    await single.writeEnv(
      `VAULT_PATH='${single.vault}'\n`,
    );

    assert.equal(
      (await single.run(["--check"], { VAULT_PATH: undefined })).code,
      0,
    );

    const double = await make({ env: "" });

    await double.writeEnv(
      `VAULT_PATH="${double.vault}"\n`,
    );

    assert.equal(
      (await double.run(["--check"], { VAULT_PATH: undefined })).code,
      0,
    );
  });

  test("H4 skips comments and blank lines", async () => {
    const box = await make({ env: "" });

    await box.writeEnv(
      `# a comment\n\n   \nVAULT_PATH='${box.vault}'\n\n`,
    );

    const result = await box.run(["--check"], { VAULT_PATH: undefined });

    assert.equal(result.code, 0);
    assert.doesNotMatch(result.stderr, /unreadable/);
  });

  test("H5 reads a file written with CRLF", async () => {
    const box = await make({ env: "" });

    await box.writeEnv(
      `# comment\r\nVAULT_PATH='${box.vault}'\r\n`,
    );

    assert.equal(
      (await box.run(["--check"], { VAULT_PATH: undefined })).code,
      0,
    );
  });

  test("H6 warns about an unreadable line and carries on", async () => {
    const box = await make({ env: "" });

    await box.writeEnv(
      `this line has no equals sign\nVAULT_PATH='${box.vault}'\n`,
    );

    const result = await box.run(["--check"], { VAULT_PATH: undefined });

    assert.equal(result.code, 0);
    assert.match(result.stderr, /ignoring unreadable \.env line/);
  });

  test("H7 lets an existing environment variable win", async () => {
    const box = await make({ env: "" });

    await box.writeVault("notes/a.md", note("notes"));

    // The file points somewhere that does not exist; the environment does not.
    await box.writeEnv(
      "VAULT_PATH='C:\\does\\not\\exist'\n",
    );

    const result = await box.run(["--check"], { VAULT_PATH: box.vault });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /check passed/);
  });

  test("H8 warns when there is no .env and uses the environment", async () => {
    const box = await make({ env: null });

    await box.writeVault("notes/a.md", note("notes"));

    const result = await box.run(["--check"], { VAULT_PATH: box.vault });

    assert.equal(result.code, 0);
    assert.match(result.stderr, /no \.env at/);
  });
});
