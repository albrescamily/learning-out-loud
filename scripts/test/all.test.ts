/**
 * The whole suite, in one process — the target of `npm test`.
 *
 * node:test registers whatever the imported modules declare, so this stays a
 * list of imports. Any one file can still be run on its own:
 *
 *   npx tsx scripts/test/convert.test.ts
 *
 * Note that `node --import tsx --test` does not work here: the loader flag
 * does not reach the child processes the test runner spawns, and every file
 * fails to load.
 */

import "./convert.test.ts";
import "./sync.test.ts";
import "./cli.test.ts";
