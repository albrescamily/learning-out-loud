#!/usr/bin/env bash
#
# Copies Markdown notes out of an Obsidian vault into this site, rewriting
# wikilinks and bringing along the attachments those notes reference.
#
#   bash scripts/sync-obsidian-astro.sh          # copy
#   bash scripts/sync-obsidian-astro.sh --dry    # show what would happen
#
#   <vault>/notes|writing|projects|updates/  ->  src/content/<the same>/
#   <vault>/dev-log/<project>.md             ->  one update per `## <date> — <title>`
#   attachments                              ->  src/content/images/
#
# Nothing is ever deleted here: a note dropped from the vault stays published
# until you delete it, and `git status` is what shows you. Run it from Git Bash;
# the three machine paths live in `.env` next to this script.

set -euo pipefail

# In PowerShell `bash` is WSL's, where the Windows paths in `.env` do not exist
# and the failure reads like a bad `.env` rather than the wrong shell.
if [ -r /proc/version ] && grep -qi microsoft /proc/version &&
   ! command -v cygpath >/dev/null 2>&1; then
  echo "Running under WSL, where a path like C:\\Users\\... does not exist." >&2
  echo "Run this from Git Bash instead ('C:\\Program Files\\Git\\bin\\bash.exe')." >&2
  exit 1
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# The collections in src/content.config.ts. A vault folder that is not one of
# these is not content.
COLLECTIONS=(writing notes projects updates)

DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --dry|--dry-run) DRY_RUN=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- configuration ----------------------------------------------------------

# Read, not sourced: PowerShell only executes `.ps1` files and would ignore this
# one in silence, so both spellings are accepted — `NAME=value` and the
# PowerShell `$env:NAME = 'value'`.
load_env() {
  local file=$1 line name value

  if [ ! -f "$file" ]; then
    echo "! no .env at $file - falling back to the current environment" >&2
    return 0
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}                      # written on Windows, so CRLF
    line=${line#"${line%%[![:space:]]*}"}   # ltrim
    line=${line%"${line##*[![:space:]]}"}   # rtrim

    [ -z "$line" ] && continue
    case $line in '#'*) continue ;; esac

    if [[ ! $line =~ ^(\$env:)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      echo "! ignoring unreadable line in .env: $line" >&2
      continue
    fi

    name=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}

    # These paths contain spaces, so they arrive quoted.
    case $value in
      \'*\') value=${value#\'}; value=${value%\'} ;;
      \"*\") value=${value#\"}; value=${value%\"} ;;
    esac

    [ -n "${!name:-}" ] || export "$name=$value"
  done < "$file"

  # The loop ends on a failed test whenever the last variable was already set,
  # and `set -e` would take that for a real failure.
  return 0
}

to_posix() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"
  else printf '%s' "${1//\\//}"
  fi
}

load_env "$SCRIPT_DIR/.env"

missing=()
for name in VAULT_PATH CONTENT_PATH IMAGES_PATH; do
  [ -n "${!name:-}" ] || missing+=("$name")
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "Not set in $SCRIPT_DIR/.env: ${missing[*]}" >&2
  exit 1
fi

VAULT=$(to_posix "$VAULT_PATH")
CONTENT=$(to_posix "$CONTENT_PATH")
IMAGES=$(to_posix "$IMAGES_PATH")

if [ ! -d "$VAULT" ]; then
  echo "VAULT_PATH does not exist: $VAULT_PATH" >&2
  exit 1
fi

# Obsidian keeps attachments in a shared folder at the top of the vault, so an
# image can live a level above the published folder.
VAULT_ROOT=$(dirname "$VAULT")

# --- helpers ----------------------------------------------------------------

markdown_in() {
  find "$1" -type f -name '*.md' -not -path '*/.*'
}

# The filename becomes the URL slug, so it has to survive accents and spaces:
# "Padrões de Projeto.md" -> "padroes-de-projeto".
slugify() {
  printf '%s' "$1" \
    | sed 's/\.md$//I' \
    | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9 -]//g; s/[[:space:]][[:space:]]*/-/g; s/--*/-/g; s/^-//; s/-$//'
}

slug_of() {
  slugify "$(basename "$1")"
}

frontmatter_of() {
  awk 'NR==1 && $0!="---" { exit } NR>1 && $0=="---" { exit } NR>1 { print }' <<<"$1"
}

# One frontmatter value, unquoted; empty when the field is absent.
field_of() {
  grep -m1 -E "^$2:" <<<"$1" \
    | sed "s/^$2:[[:space:]]*//; s/^[\"']//; s/[\"']$//" \
    || true
}

# A note missing one of these is copied anyway, and the next build rejects it —
# pointing at a file you did not just edit.
required_fields() {
  case $1 in
    writing)  printf 'title description published' ;;
    notes)    printf 'title published' ;;
    projects) printf 'title description status' ;;
    updates)  printf 'title project published' ;;
  esac
}

# --- index ------------------------------------------------------------------

# Where each note lives, so a [[wikilink]] can become the URL it is served from.
# Built before anything is converted, because a note may link to one that has
# not been read yet.
declare -A note_collection=()
declare -A note_project=()

for collection in "${COLLECTIONS[@]}"; do
  [ -d "$VAULT/$collection" ] || continue

  while IFS= read -r note; do
    slug=$(slug_of "$note")
    note_collection["$slug"]=$collection

    # An update is served under its project, so linking to one means knowing
    # which project that is.
    if [ "$collection" = updates ]; then
      note_project["$slug"]=$(field_of "$(frontmatter_of "$(tr -d '\r' <"$note")")" project)
    fi
  done < <(markdown_in "$VAULT/$collection")
done

url_for() {
  # One `local` per line: bash expands every word of a `local` before creating
  # any of them, so `local slug=$1 collection=${map[$slug]}` would look `slug`
  # up in whatever the caller left in the global of that name.
  local slug=$1
  local collection=${note_collection[$slug]:-}
  local project

  case $collection in
    "") return 1 ;;
    updates)
      project=${note_project[$slug]:-}
      [ -z "$project" ] && return 1
      printf '/projects/%s/log/%s' "$(slugify "$project")" "$slug"
      ;;
    *) printf '/%s/%s' "$collection" "$slug" ;;
  esac
}

# --- writing out ------------------------------------------------------------

declare -A referenced=()
declare -A update_ids=()
copied=0

# Both passes end here, so a copied note and a split dev-log section report the
# same way.
emit() {
  local target=$1
  local source=$2

  if $DRY_RUN; then
    echo "[dry] $source -> $target"
  else
    printf '%s\n' "$BODY" >"$target"
    echo "copied: $source"
  fi

  copied=$((copied + 1))
}

# Rewrites Obsidian syntax in $BODY, in place. It mutates a global rather than
# echoing: called as `$(convert_body ...)` it would run in a subshell, and the
# attachment names it records in `referenced` would die with it — every image
# would silently stop being copied.
convert_body() {
  local source=$1
  local match inner file alt target label url

  # A relative path is what makes Astro treat the image as local and optimize
  # it; an absolute /images/... would be emitted untouched and 404. Each match
  # is replaced as a literal string, so nothing in a filename needs escaping.
  while IFS= read -r match; do
    [ -z "$match" ] && continue
    inner=${match#'![['}; inner=${inner%']]'}
    file=${inner%%|*}
    alt=""
    [ "$inner" != "$file" ] && alt=${inner#*|}
    referenced["$file"]=1
    BODY=${BODY//"$match"/"![$alt](../images/$file)"}
  done < <(grep -o '!\[\[[^]]*\]\]' <<<"$BODY" | sort -u)

  # Images are already gone by now, so this pass cannot catch them.
  while IFS= read -r match; do
    [ -z "$match" ] && continue
    inner=${match#'[['}; inner=${inner%']]'}
    target=${inner%%|*}
    label=$target
    [ "$inner" != "$target" ] && label=${inner#*|}

    # An unresolved target becomes plain text: a link to a page that does not
    # exist is worse than no link, and the warning says which note to fix.
    if url=$(url_for "$(slugify "$target")"); then
      BODY=${BODY//"$match"/"[$label]($url)"}
    else
      echo "! $source links to [[$target]], which is not in the vault" >&2
      BODY=${BODY//"$match"/"$label"}
    fi
  done < <(grep -o '\[\[[^]]*\]\]' <<<"$BODY" | sort -u)
}

# `src/content/updates/` is flat, so the filename is the id for the whole site
# and two sources can collide.
claim_update_id() {
  local id=$1
  local source=$2
  local owner=${update_ids[$id]:-}

  if [ -n "$owner" ]; then
    echo "! $source and $owner both become updates/$id.md - one overwrites the other" >&2
  fi

  update_ids["$id"]=$source
}

# --- copy -------------------------------------------------------------------

for collection in "${COLLECTIONS[@]}"; do
  [ -d "$VAULT/$collection" ] || continue
  $DRY_RUN || mkdir -p "$CONTENT/$collection"

  while IFS= read -r note; do
    BODY=$(tr -d '\r' <"$note")
    frontmatter=$(frontmatter_of "$BODY")
    source="$collection/$(basename "$note")"
    slug=$(slug_of "$note")

    convert_body "$source"

    for field in $(required_fields "$collection"); do
      grep -qE "^$field:" <<<"$frontmatter" \
        || echo "! $source has no \`$field:\` - the build will reject it" >&2
    done

    if [ "$collection" = updates ]; then
      claim_update_id "$slug" "$source"
    fi

    emit "$CONTENT/$collection/$slug.md" "$source"
  done < <(markdown_in "$VAULT/$collection")
done

# --- dev log ----------------------------------------------------------------

write_update() {
  local project=$1
  local date=$2
  local title=$3
  local source=$4
  local id
  id=$(slugify "$title")

  if [ -z "$id" ]; then
    echo "! $source: \"$title\" leaves no filename once slugified - skipped" >&2
    return 0
  fi

  while [ "${BODY:0:1}" = $'\n' ]; do BODY=${BODY#$'\n'}; done
  while [ "${BODY: -1}" = $'\n' ]; do BODY=${BODY%$'\n'}; done

  convert_body "$source"
  claim_update_id "$id" "$source"

  # A quote inside a double-quoted YAML scalar has to be escaped, or the
  # frontmatter stops parsing.
  BODY="---
title: \"${title//\"/\\\"}\"
project: \"$project\"
published: $date
---

$BODY"

  emit "$CONTENT/updates/$id.md" "$source"
}

split_dev_log() {
  local log=$1
  local project=$2
  local name
  name=$(basename "$log")

  local pending=false
  local line rest date title source

  while IFS= read -r line || [ -n "$line" ]; do
    if [[ $line == '## '* ]]; then
      if $pending; then
        write_update "$project" "$date" "$title" "$source"
      fi

      pending=false
      rest=${line#'## '}

      # The date orders the log and fixes each update's number, so a heading
      # without one is skipped rather than guessed at.
      if [[ $rest =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})(.*)$ ]]; then
        date=${BASH_REMATCH[1]}
        # sed, not a bash bracket expression: the separator may be a multibyte
        # dash, and a bracket expression would match a single one of its bytes.
        title=$(sed 's/^[[:space:]]*[-–—|:]*[[:space:]]*//' <<<"${BASH_REMATCH[2]}")
        source="dev-log/$name -> $title"
        pending=true
        BODY=""
      else
        echo "! dev-log/$name: heading \"$rest\" has no YYYY-MM-DD date - skipped" >&2
      fi
    elif $pending; then
      BODY+="$line"$'\n'
    fi
  done < <(tr -d '\r' <"$log")

  if $pending; then
    write_update "$project" "$date" "$title" "$source"
  fi
}

if [ -d "$VAULT/dev-log" ]; then
  $DRY_RUN || mkdir -p "$CONTENT/updates"

  while IFS= read -r log; do
    project=$(slug_of "$log")

    # A `project:` that resolves to nothing does not fail the build: Astro says
    # `Invalid content reference`, exits 0, and drops the update from the site.
    if [ "${note_collection[$project]:-}" != projects ]; then
      echo "! dev-log/$(basename "$log") names no project in the vault - its updates would be dropped from the site" >&2
    fi

    split_dev_log "$log" "$project"
  done < <(markdown_in "$VAULT/dev-log")
fi

# --- attachments ------------------------------------------------------------

find_asset() {
  local found
  found=$(find "$VAULT" -type f -name "$1" -not -path '*/.*' -print -quit)
  [ -n "$found" ] || found=$(find "$VAULT_ROOT" -type f -name "$1" -not -path '*/.*' -print -quit)
  printf '%s' "$found"
}

if [ ${#referenced[@]} -gt 0 ]; then
  $DRY_RUN || mkdir -p "$IMAGES"

  for asset in "${!referenced[@]}"; do
    source_file=$(find_asset "$asset")

    if [ -z "$source_file" ]; then
      echo "! attachment not found in vault: $asset" >&2
      continue
    fi

    if $DRY_RUN; then
      echo "[dry] asset: $asset"
    else
      cp -f "$source_file" "$IMAGES/$asset"
      echo "asset: $asset"
    fi
  done
fi

# --- what was left behind ---------------------------------------------------

# The difference between "ignored on purpose" and "silently lost" — the
# Templater files live outside the collection folders.
ignored=()
while IFS= read -r note; do
  relative=${note#"$VAULT/"}
  top=${relative%%/*}

  case " ${COLLECTIONS[*]} dev-log " in
    *" $top "*) continue ;;
  esac

  ignored+=("$relative")
done < <(markdown_in "$VAULT")

if [ ${#ignored[@]} -gt 0 ]; then
  printf '\nnot a collection, left in the vault:\n'
  printf '  %s\n' "${ignored[@]}"
fi

printf '\n%d note(s) copied, %d asset(s), %d ignored.\n' \
  "$copied" "${#referenced[@]}" "${#ignored[@]}"
