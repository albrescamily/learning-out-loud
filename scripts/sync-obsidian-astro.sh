#!/usr/bin/env bash
#
# Copies Markdown notes out of an Obsidian vault into this Astro site,
# rewriting wikilinks and bringing along referenced attachments.
#
# Usage:
#
#   bash scripts/sync-obsidian-astro.sh
#   bash scripts/sync-obsidian-astro.sh --dry
#
# Vault:
#
#   <vault>/notes|writing|projects|updates/  -> src/content/<same>/
#   <vault>/dev-log/<project>.md             -> one update per section
#   attachments                              -> src/content/images/
#
# Only VAULT_PATH is machine-specific.
#
# The Astro project paths are derived automatically from this script:
#
#   scripts/sync-obsidian-astro.sh
#            │
#            └── ..
#                └── PROJECT_ROOT
#
# Nothing is deleted automatically.
#
# Run this script using Git Bash on Windows.

set -euo pipefail


# -----------------------------------------------------------------------------
# Shell validation
# -----------------------------------------------------------------------------

# If this script is launched using `bash` from PowerShell, Windows may resolve
# that command to WSL's bash instead of Git Bash.
#
# The vault path in .env is a Windows path such as:
#
#   C:\Users\camily albres\...
#
# Git Bash can convert that path using cygpath.
# WSL cannot use it directly.
if [ -r /proc/version ] &&
   grep -qi microsoft /proc/version &&
   ! command -v cygpath >/dev/null 2>&1; then

  echo "Running under WSL, where a path like C:\\Users\\... does not exist." >&2
  echo "Run this from Git Bash instead:" >&2
  echo "'C:\\Program Files\\Git\\bin\\bash.exe'" >&2

  exit 1
fi


# -----------------------------------------------------------------------------
# Project paths
# -----------------------------------------------------------------------------

# Absolute directory containing this script.
#
# Example:
#
#   /c/projects/learning-out-loud/scripts
SCRIPT_DIR=$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)


# Parent of scripts/.
#
# Example:
#
#   /c/projects/learning-out-loud
PROJECT_ROOT=$(
  cd -- "$SCRIPT_DIR/.."
  pwd
)


# These belong to the Astro project, so there is no reason to configure them
# manually in .env.
CONTENT="$PROJECT_ROOT/src/content"
IMAGES="$CONTENT/images"


# -----------------------------------------------------------------------------
# Astro collections
# -----------------------------------------------------------------------------

# Must correspond to the collections configured by Astro.
COLLECTIONS=(
  writing
  notes
  projects
  updates
)


# -----------------------------------------------------------------------------
# CLI arguments
# -----------------------------------------------------------------------------

DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry|--dry-run)
      DRY_RUN=true
      ;;

    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done


# -----------------------------------------------------------------------------
# Environment
# -----------------------------------------------------------------------------

# Reads .env manually instead of sourcing it.
#
# This lets the file contain either:
#
#   VAULT_PATH='C:\Users\...'
#
# or:
#
#   $env:VAULT_PATH = 'C:\Users\...'
#
# It also avoids Bash interpreting the backslashes inside Windows paths.
load_env() {
  local file=$1
  local line
  local name
  local value

  if [ ! -f "$file" ]; then
    echo "! no .env at $file - falling back to current environment" >&2
    return 0
  fi

  while IFS= read -r line || [ -n "$line" ]; do

    # Remove CR when .env uses Windows CRLF.
    line=${line%$'\r'}

    # Trim leading whitespace.
    line=${line#"${line%%[![:space:]]*}"}

    # Trim trailing whitespace.
    line=${line%"${line##*[![:space:]]}"}

    # Skip blank lines.
    [ -z "$line" ] && continue

    # Skip comments.
    case "$line" in
      '#'*)
        continue
        ;;
    esac

    # Accept:
    #
    #   NAME=value
    #
    # and:
    #
    #   $env:NAME = value
    if [[ ! $line =~ ^(\$env:)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      echo "! ignoring unreadable line in .env: $line" >&2
      continue
    fi

    name=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}

    # Remove surrounding quotes.
    #
    # Important because the vault path contains spaces.
    case "$value" in
      \'*\')
        value=${value#\'}
        value=${value%\'}
        ;;

      \"*\")
        value=${value#\"}
        value=${value%\"}
        ;;
    esac

    # Existing environment variables win over .env.
    [ -n "${!name:-}" ] || export "$name=$value"

  done < "$file"

  return 0
}


# Convert:
#
#   C:\Users\camily albres\...
#
# into:
#
#   /c/Users/camily albres/...
#
# when running inside Git Bash.
to_posix() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$1"
  else
    printf '%s' "${1//\\//}"
  fi
}


# .env lives beside this worker:
#
#   scripts/
#   ├── .env
#   └── sync-obsidian-astro.sh
load_env "$SCRIPT_DIR/.env"


# VAULT_PATH is now the only required machine-specific setting.
if [ -z "${VAULT_PATH:-}" ]; then
  echo "VAULT_PATH is not set." >&2
  echo "Expected it in:" >&2
  echo "  $SCRIPT_DIR/.env" >&2
  exit 1
fi


VAULT=$(to_posix "$VAULT_PATH")


if [ ! -d "$VAULT" ]; then
  echo "VAULT_PATH does not exist:" >&2
  echo "  $VAULT_PATH" >&2
  echo >&2
  echo "Resolved Git Bash path:" >&2
  echo "  $VAULT" >&2
  exit 1
fi


# Obsidian attachments may live above Blog/, so keep the parent available.
VAULT_ROOT=$(dirname "$VAULT")


# -----------------------------------------------------------------------------
# Diagnostics
# -----------------------------------------------------------------------------

echo "vault:   $VAULT"
echo "project: $PROJECT_ROOT"
echo "content: $CONTENT"
echo "images:  $IMAGES"

if $DRY_RUN; then
  echo "mode:    dry-run"
fi

echo


# -----------------------------------------------------------------------------
# Markdown helpers
# -----------------------------------------------------------------------------

markdown_in() {
  find "$1" \
    -type f \
    -name '*.md' \
    -not -path '*/.*'
}


# Convert filenames into URL-safe slugs.
#
# Example:
#
#   Padrões de Projeto.md
#
# becomes:
#
#   padroes-de-projeto
slugify() {
  printf '%s' "$1" \
    | sed 's/\.md$//I' \
    | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null \
    | tr '[:upper:]' '[:lower:]' \
    | sed '
        s/[^a-z0-9 -]//g;
        s/[[:space:]][[:space:]]*/-/g;
        s/--*/-/g;
        s/^-//;
        s/-$//
      '
}


slug_of() {
  slugify "$(basename "$1")"
}


# Return YAML frontmatter without the surrounding --- lines.
frontmatter_of() {
  awk '
    NR == 1 && $0 != "---" {
      exit
    }

    NR > 1 && $0 == "---" {
      exit
    }

    NR > 1 {
      print
    }
  ' <<< "$1"
}


# Return one frontmatter field.
field_of() {
  grep -m1 -E "^$2:" <<< "$1" \
    | sed "s/^$2:[[:space:]]*//; s/^[\"']//; s/[\"']$//" \
    || true
}


required_fields() {
  case "$1" in
    writing)
      printf 'title description published'
      ;;

    notes)
      printf 'title published'
      ;;

    projects)
      printf 'title description status'
      ;;

    updates)
      printf 'title project published'
      ;;
  esac
}


# -----------------------------------------------------------------------------
# Build wikilink index
# -----------------------------------------------------------------------------

# Maps a slug to its Astro collection.
declare -A note_collection=()

# Updates also need to know which project they belong to.
declare -A note_project=()


for collection in "${COLLECTIONS[@]}"; do

  [ -d "$VAULT/$collection" ] || continue

  while IFS= read -r note; do

    slug=$(slug_of "$note")

    note_collection["$slug"]=$collection

    if [ "$collection" = "updates" ]; then

      BODY=$(tr -d '\r' < "$note")
      frontmatter=$(frontmatter_of "$BODY")

      note_project["$slug"]=$(
        field_of "$frontmatter" project
      )

    fi

  done < <(markdown_in "$VAULT/$collection")

done


url_for() {
  local slug=$1
  local collection=${note_collection[$slug]:-}
  local project

  case "$collection" in

    "")
      return 1
      ;;

    updates)

      project=${note_project[$slug]:-}

      [ -z "$project" ] && return 1

      printf '/projects/%s/log/%s' \
        "$(slugify "$project")" \
        "$slug"
      ;;

    *)

      printf '/%s/%s' \
        "$collection" \
        "$slug"
      ;;

  esac
}


# -----------------------------------------------------------------------------
# Output state
# -----------------------------------------------------------------------------

declare -A referenced=()
declare -A update_ids=()

copied=0


# -----------------------------------------------------------------------------
# Emit generated Markdown
# -----------------------------------------------------------------------------

emit() {
  local target=$1
  local source=$2

  if $DRY_RUN; then

    echo "[dry] $source -> $target"

  else

    mkdir -p "$(dirname "$target")"

    printf '%s\n' "$BODY" > "$target"

    echo "copied: $source"

  fi

  copied=$((copied + 1))
}


# -----------------------------------------------------------------------------
# Obsidian syntax conversion
# -----------------------------------------------------------------------------

convert_body() {
  local source=$1
  local match
  local inner
  local file
  local alt
  local target
  local label
  local url


  # ---------------------------------------------------------------------------
  # Embedded attachments
  #
  #   ![[diagram.png]]
  #
  # becomes:
  #
  #   ![](../images/diagram.png)
  # ---------------------------------------------------------------------------

  while IFS= read -r match; do

    [ -z "$match" ] && continue

    inner=${match#'![['}
    inner=${inner%']]'}

    file=${inner%%|*}

    alt=""

    if [ "$inner" != "$file" ]; then
      alt=${inner#*|}
    fi

    referenced["$file"]=1

    BODY=${BODY//"$match"/"![$alt](../images/$file)"}

  done < <(
    grep -o '!\[\[[^]]*\]\]' <<< "$BODY" | sort -u
  )


  # ---------------------------------------------------------------------------
  # Wikilinks
  #
  #   [[KV Cache]]
  #
  # becomes:
  #
  #   [KV Cache](/notes/kv-cache)
  #
  #
  #   [[KV Cache|the cache]]
  #
  # becomes:
  #
  #   [the cache](/notes/kv-cache)
  # ---------------------------------------------------------------------------

  while IFS= read -r match; do

    [ -z "$match" ] && continue

    inner=${match#'[['}
    inner=${inner%']]'}

    target=${inner%%|*}

    label=$target

    if [ "$inner" != "$target" ]; then
      label=${inner#*|}
    fi


    if url=$(url_for "$(slugify "$target")"); then

      BODY=${BODY//"$match"/"[$label]($url)"}

    else

      echo "! $source links to [[$target]], which is not in the vault" >&2

      BODY=${BODY//"$match"/"$label"}

    fi

  done < <(
    grep -o '\[\[[^]]*\]\]' <<< "$BODY" | sort -u
  )
}


# -----------------------------------------------------------------------------
# Update collision detection
# -----------------------------------------------------------------------------

claim_update_id() {
  local id=$1
  local source=$2
  local owner=${update_ids[$id]:-}

  if [ -n "$owner" ]; then

    echo \
      "! $source and $owner both become updates/$id.md - one overwrites the other" \
      >&2

  fi

  update_ids["$id"]=$source
}


# -----------------------------------------------------------------------------
# Copy standard collections
# -----------------------------------------------------------------------------

for collection in "${COLLECTIONS[@]}"; do

  [ -d "$VAULT/$collection" ] || continue

  $DRY_RUN || mkdir -p "$CONTENT/$collection"


  while IFS= read -r note; do

    BODY=$(tr -d '\r' < "$note")

    frontmatter=$(frontmatter_of "$BODY")

    source="$collection/$(basename "$note")"

    slug=$(slug_of "$note")


    convert_body "$source"


    for field in $(required_fields "$collection"); do

      grep -qE "^$field:" <<< "$frontmatter" \
        || echo \
          "! $source has no \`$field:\` - the build will reject it" \
          >&2

    done


    if [ "$collection" = "updates" ]; then
      claim_update_id "$slug" "$source"
    fi


    emit \
      "$CONTENT/$collection/$slug.md" \
      "$source"


  done < <(
    markdown_in "$VAULT/$collection"
  )

done


# -----------------------------------------------------------------------------
# Dev log
# -----------------------------------------------------------------------------

write_update() {
  local project=$1
  local date=$2
  local title=$3
  local source=$4
  local id


  id=$(slugify "$title")


  if [ -z "$id" ]; then

    echo \
      "! $source: \"$title\" leaves no filename once slugified - skipped" \
      >&2

    return 0

  fi


  # Remove leading blank lines.
  while [ "${BODY:0:1}" = $'\n' ]; do
    BODY=${BODY#$'\n'}
  done


  # Remove trailing blank lines.
  while [ "${BODY: -1}" = $'\n' ]; do
    BODY=${BODY%$'\n'}
  done


  convert_body "$source"

  claim_update_id "$id" "$source"


  BODY="---
title: \"${title//\"/\\\"}\"
project: \"$project\"
published: $date
---

$BODY"


  emit \
    "$CONTENT/updates/$id.md" \
    "$source"
}


split_dev_log() {
  local log=$1
  local project=$2
  local name

  name=$(basename "$log")


  local pending=false
  local line
  local rest
  local date
  local title
  local source


  while IFS= read -r line || [ -n "$line" ]; do

    if [[ $line == '## '* ]]; then


      # Write previous section.
      if $pending; then
        write_update \
          "$project" \
          "$date" \
          "$title" \
          "$source"
      fi


      pending=false

      rest=${line#'## '}


      # Expected:
      #
      #   ## 2026-08-28 — Something happened
      if [[ $rest =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})(.*)$ ]]; then

        date=${BASH_REMATCH[1]}


        title=$(
          sed \
            's/^[[:space:]]*[-–—|:]*[[:space:]]*//' \
            <<< "${BASH_REMATCH[2]}"
        )


        source="dev-log/$name -> $title"

        pending=true

        BODY=""

      else

        echo \
          "! dev-log/$name: heading \"$rest\" has no YYYY-MM-DD date - skipped" \
          >&2

      fi


    elif $pending; then

      BODY+="$line"$'\n'

    fi

  done < <(
    tr -d '\r' < "$log"
  )


  # Write final section.
  if $pending; then

    write_update \
      "$project" \
      "$date" \
      "$title" \
      "$source"

  fi
}


if [ -d "$VAULT/dev-log" ]; then

  $DRY_RUN || mkdir -p "$CONTENT/updates"


  while IFS= read -r log; do

    project=$(slug_of "$log")


    if [ "${note_collection[$project]:-}" != "projects" ]; then

      echo \
        "! dev-log/$(basename "$log") names no project in the vault - its updates would be dropped from the site" \
        >&2

    fi


    split_dev_log \
      "$log" \
      "$project"


  done < <(
    markdown_in "$VAULT/dev-log"
  )

fi


# -----------------------------------------------------------------------------
# Attachments
# -----------------------------------------------------------------------------

find_asset() {
  local found


  # First search inside Blog/.
  found=$(
    find "$VAULT" \
      -type f \
      -name "$1" \
      -not -path '*/.*' \
      -print \
      -quit
  )


  # If missing, search one level above Blog/.
  if [ -z "$found" ]; then

    found=$(
      find "$VAULT_ROOT" \
        -type f \
        -name "$1" \
        -not -path '*/.*' \
        -print \
        -quit
    )

  fi


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

      cp -f \
        "$source_file" \
        "$IMAGES/$asset"

      echo "asset: $asset"

    fi

  done

fi


# -----------------------------------------------------------------------------
# Notes outside collections
# -----------------------------------------------------------------------------

ignored=()


while IFS= read -r note; do

  relative=${note#"$VAULT/"}

  top=${relative%%/*}


  case " ${COLLECTIONS[*]} dev-log " in

    *" $top "*)
      continue
      ;;

  esac


  ignored+=("$relative")


done < <(
  markdown_in "$VAULT"
)


if [ ${#ignored[@]} -gt 0 ]; then

  printf '\nnot a collection, left in the vault:\n'

  printf '  %s\n' \
    "${ignored[@]}"

fi


# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

printf '\n%d note(s) copied, %d asset(s), %d ignored.\n' \
  "$copied" \
  "${#referenced[@]}" \
  "${#ignored[@]}"