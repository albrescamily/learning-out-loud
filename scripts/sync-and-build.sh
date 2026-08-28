#!/usr/bin/env bash
#
# Sync the vault in, then rebuild the site — what the Obsidian plugin runs.
# Arguments go to the sync, so `--dry` still works.
#
#   bash scripts/sync-and-build.sh
#   bash scripts/sync-and-build.sh --dry
#
# A wrapper on purpose: the behaviour lives in sync-obsidian-astro.sh and in
# `npm run build`, where it can be read and run by hand.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# The sync works from absolute paths, but `npm run build` reads package.json
# from the working directory.
cd -- "$SCRIPT_DIR/.."

sync_log=$(mktemp)
build_log=$(mktemp)
trap 'rm -f "$sync_log" "$build_log"' EXIT

# Each step announces itself, so a caller that only sees the output can tell
# which half failed. `tee` keeps the output flowing while saving it, because the
# last line below collects both summaries — that line is all the plugin shows.
echo "== sync =="
bash "$SCRIPT_DIR/sync-obsidian-astro.sh" "$@" | tee "$sync_log"

echo
echo "== build =="
npm run build | tee "$build_log"

sync_summary=$(tail -n 1 "$sync_log")
build_summary=$(grep -oE '[0-9]+ page\(s\) built' "$build_log" | tail -n 1 || true)

echo
echo "done. ${sync_summary}${build_summary:+ ${build_summary}.}"
