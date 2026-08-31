/**
 * A disposable copy of the project, for testing the sync without touching the
 * real src/content/.
 *
 * publish.ts derives everything from its own location:
 *
 *   publish.ts -> SCRIPT_DIR -> PROJECT_ROOT -> PROJECT_ROOT/src/content
 *
 * so copying the CLI into a sandbox moves the content root with it. That is
 * what lets these tests exercise the destructive paths — a run that deletes is
 * deleting inside the sandbox.
 *
 * The sandbox lives under the project root rather than in the OS temp
 * directory: publish.ts imports gray-matter, and Node resolves that by walking
 * up the directory tree until it finds node_modules/.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const TEST_DIR = path.dirname(__filename);

const SCRIPTS_DIR = path.resolve(
  TEST_DIR,
  "..",
);

const PROJECT_ROOT = path.resolve(
  SCRIPTS_DIR,
  "..",
);

const SANDBOX_ROOT = path.join(
  PROJECT_ROOT,
  ".tmp-tests",
);

/** Collection folders the sync writes into, plus the shared image folder. */
const CONTENT_FOLDERS = [
  "writing",
  "notes",
  "projects",
  "images",
];

export type Result = {
  code: number | null;

  stdout: string;

  stderr: string;

  /** Both streams, for the assertions that do not care which one carried it. */
  output: string;
};

export type SandboxOptions = {
  /**
   * What to put in the sandbox's scripts/.env. `null` writes no file at all,
   * which is how the missing-.env warning is tested.
   */
  env?: string | null;

  /** The `build` script of the sandbox package.json. */
  build?: string;
};

export type Sandbox = {
  root: string;

  /** The folder VAULT_PATH points at. */
  vault: string;

  contentRoot: string;

  run(
    args: string[],
    env?: Record<string, string | undefined>,
  ): Promise<Result>;

  writeVault(relative: string, body: string): Promise<void>;

  writeVaultBytes(relative: string, body: Buffer): Promise<void>;

  /** Writes above Blog/, where Obsidian attachments may also live. */
  writeVaultRoot(relative: string, body: string | Buffer): Promise<void>;

  writeContent(relative: string, body: string): Promise<void>;

  /** Replaces the sandbox's scripts/.env, for the parsing cases. */
  writeEnv(body: string): Promise<void>;

  readContent(relative: string): Promise<string>;

  removeVault(relative: string): Promise<void>;

  /** Every file under src/content/, relative and sorted — the orphan assertion. */
  tree(): Promise<string[]>;

  exists(relative: string): Promise<boolean>;

  dispose(): Promise<void>;
};

let counter = 0;

async function copyDirectory(
  from: string,
  to: string,
) {
  await fs.mkdir(to, { recursive: true });

  for (
    const entry
    of await fs.readdir(from, { withFileTypes: true })
  ) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(source, target);
      continue;
    }

    await fs.copyFile(source, target);
  }
}

export async function sandbox(
  options: SandboxOptions = {},
): Promise<Sandbox> {
  counter += 1;

  const root = path.join(
    SANDBOX_ROOT,
    `${process.pid}-${counter}`,
  );

  const vaultRoot = path.join(root, "vault");
  const vault = path.join(vaultRoot, "Blog");
  const contentRoot = path.join(root, "src", "content");
  const scriptsDir = path.join(root, "scripts");
  const script = path.join(scriptsDir, "publish.ts");

  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(vault, { recursive: true });

  // The collection folders exist before any run, exactly as they do in the
  // real project — .gitkeep included, since surviving the orphan sweep is one
  // of the things under test.
  for (const folder of CONTENT_FOLDERS) {
    await fs.mkdir(path.join(contentRoot, folder), { recursive: true });

    await fs.writeFile(
      path.join(contentRoot, folder, ".gitkeep"),
      "",
      "utf8",
    );
  }

  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.copyFile(
    path.join(SCRIPTS_DIR, "publish.ts"),
    script,
  );
  await copyDirectory(
    path.join(SCRIPTS_DIR, "lib"),
    path.join(scriptsDir, "lib"),
  );

  // A build that leaves a marker on disk, so --build and --dry --build can be
  // told apart without running Astro.
  const build =
    options.build ??
    `node -e "require('fs').writeFileSync('build-ran','')"`;

  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "sandbox",
        private: true,
        type: "module",
        scripts: { build },
      },
      null,
      2,
    ),
    "utf8",
  );

  if (options.env !== null) {
    await fs.writeFile(
      path.join(scriptsDir, ".env"),
      options.env ?? `VAULT_PATH='${vault}'\n`,
      "utf8",
    );
  }

  async function ensureParent(target: string) {
    await fs.mkdir(path.dirname(target), { recursive: true });
  }

  return {
    root,
    vault,
    contentRoot,

    async run(args, extraEnv) {
      // An explicit `undefined` unsets the variable rather than passing the
      // string "undefined" — that is how "VAULT_PATH is not set" is tested.
      const env: Record<string, string> = { ...process.env } as Record<string, string>;

      for (const [key, value] of Object.entries(extraEnv ?? {})) {
        if (value === undefined) {
          delete env[key];
          continue;
        }

        env[key] = value;
      }

      return new Promise<Result>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", script, ...args],
          {
            // cwd is the project root so `--import tsx` resolves; the CLI's own
            // paths come from the script location, not from here.
            cwd: PROJECT_ROOT,
            env,
          },
        );

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", chunk => { stdout += chunk; });
        child.stderr.on("data", chunk => { stderr += chunk; });

        child.on("error", reject);

        child.on("close", code => {
          resolve({
            code,
            stdout,
            stderr,
            output: `${stdout}\n${stderr}`,
          });
        });
      });
    },

    async writeVault(relative, body) {
      const target = path.join(vault, relative);
      await ensureParent(target);
      await fs.writeFile(target, body, "utf8");
    },

    async writeVaultBytes(relative, body) {
      const target = path.join(vault, relative);
      await ensureParent(target);
      await fs.writeFile(target, body);
    },

    async writeVaultRoot(relative, body) {
      const target = path.join(vaultRoot, relative);
      await ensureParent(target);
      await fs.writeFile(target, body);
    },

    async writeContent(relative, body) {
      const target = path.join(contentRoot, relative);
      await ensureParent(target);
      await fs.writeFile(target, body, "utf8");
    },

    async writeEnv(body) {
      await fs.writeFile(
        path.join(scriptsDir, ".env"),
        body,
        "utf8",
      );
    },

    async readContent(relative) {
      return fs.readFile(
        path.join(contentRoot, relative),
        "utf8",
      );
    },

    async removeVault(relative) {
      await fs.rm(
        path.join(vault, relative),
        { force: true },
      );
    },

    async tree() {
      const files: string[] = [];

      async function walk(directory: string) {
        for (
          const entry
          of await fs.readdir(directory, { withFileTypes: true })
        ) {
          const full = path.join(directory, entry.name);

          if (entry.isDirectory()) {
            await walk(full);
            continue;
          }

          files.push(
            path
              .relative(contentRoot, full)
              .split(path.sep)
              .join("/"),
          );
        }
      }

      await walk(contentRoot);

      return files.sort();
    },

    async exists(relative) {
      try {
        await fs.access(path.join(root, relative));
        return true;
      } catch {
        return false;
      }
    },

    async dispose() {
      await fs.rm(root, { recursive: true, force: true });

      // Take the parent with it once the last sandbox is gone. rmdir fails
      // while siblings remain, which is exactly the wanted behaviour and why
      // the error is swallowed rather than checked for.
      try {
        await fs.rmdir(SANDBOX_ROOT);
      } catch {
        // Other sandboxes are still open.
      }
    },
  };
}

// =============================================================================
// NOTE BUILDERS
// =============================================================================

/** A note with valid frontmatter for its collection, so tests state only what they vary. */
export function note(
  collection: "writing" | "notes" | "projects",
  fields: Record<string, string> = {},
  body = "Body.",
): string {
  const base: Record<string, string> =
    collection === "writing"
      ? {
          title: '"A title"',
          description: '"A description"',
          published: "2026-01-01",
        }
      : collection === "notes"
        ? {
            title: '"A title"',
            published: "2026-01-01",
          }
        : {
            title: '"A title"',
            description: '"A description"',
            status: '"active"',
            stack: "[]",
            published: "2026-01-01",
          };

  const merged = { ...base, ...fields };

  const frontmatter = Object.entries(merged)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

/** A 1x1 PNG, so attachment tests copy something real. */
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
