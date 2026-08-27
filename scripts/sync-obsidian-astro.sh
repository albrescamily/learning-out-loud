#!/usr/bin/env bash
#
# Copies Markdown notes out of an Obsidian vault into this site, rewriting
# Obsidian's wikilinks into plain Markdown and bringing along only the
# attachments those notes actually reference.
#
#   bash scripts/sync-obsidian-astro.sh          # copy
#   bash scripts/sync-obsidian-astro.sh --dry    # show what would happen
#
# The vault mirrors the site: one folder per collection. Anything outside those
# four folders — `templates/` above all — is left where it is.
#
#   <vault>/notes/     ->  src/content/notes/
#   <vault>/writing/   ->  src/content/writing/
#   <vault>/projects/  ->  src/content/projects/
#   <vault>/updates/   ->  src/content/updates/
#   attachments        ->  src/content/images/
#
# Nothing is ever deleted from the site: a note removed from the vault stays
# published until you delete it here, where `git status` will show it.
#
# Run it from Git Bash on Windows. The three paths are machine-specific and live
# in `.env` next to this script, which is gitignored.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# The collections defined in src/content.config.ts. A vault folder that is not
# one of these is not content.
COLLECTIONS=(writing notes projects updates)

DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --dry|--dry-run) DRY_RUN=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- configuration ----------------------------------------------------------

load_env() {
  local file=$1 line name value

  if [ ! -f "$file" ]; then
    echo "! no .env at $file - falling back to the current environment" >&2
    return 0
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}                      # the file is CRLF, written on Windows
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

    # One layer of quotes comes off; these paths contain spaces.
    case $value in
      \'*\') value=${value#\'}; value=${value%\'} ;;
      \"*\") value=${value#\"}; value=${value%\"} ;;
    esac

    if [ -z "${!name:-}" ]; then
      export "$name=$value"
    fi
  done < "$file"

  # An explicit success: the loop above ends on a failed test whenever the last
  # variable was already set, and `set -e` would take that for a real failure.
  return 0
}

# `.env` holds Windows paths (`C:\Users\...`); everything below needs POSIX ones.
to_posix() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"
  else printf '%s' "${1//\\//}"
  fi
}

load_env "$SCRIPT_DIR/.env"

missing=()
if [ -z "${VAULT_PATH:-}" ];   then missing+=(VAULT_PATH);   fi
if [ -z "${CONTENT_PATH:-}" ]; then missing+=(CONTENT_PATH); fi
if [ -z "${IMAGES_PATH:-}" ];  then missing+=(IMAGES_PATH);  fi

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

# Obsidian usually keeps attachments in a shared folder at the top of the vault,
# outside the published one, so an image can live a level above VAULT_PATH.
VAULT_ROOT=$(dirname "$VAULT")

# --- helpers ----------------------------------------------------------------

# The filename becomes the URL slug, so it has to survive accents and spaces:
# "Padrões de Projeto.md" -> "padroes-de-projeto". The Templater templates in the
# vault already rename files this way, so this is mostly a safety net.
slugify() {
  printf '%s' "$1" \
    | sed 's/\.md$//I' \
    | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9 -]//g; s/[[:space:]][[:space:]]*/-/g; s/--*/-/g; s/^-//; s/-$//'
}

# Everything between the opening and closing `---` of the first block.
frontmatter_of() {
  awk 'NR==1 && $0!="---" { exit } NR>1 && $0=="---" { exit } NR>1 { print }' <<<"$1"
}

# One frontmatter value, unquoted. Empty when the field is absent.
field_of() {
  grep -m1 -E "^$2:" <<<"$1" \
    | sed "s/^$2:[[:space:]]*//; s/^[\"']//; s/[\"']$//" \
    || true
}

# What each collection's schema requires. A note missing one of these is copied
# anyway, but the next build rejects it, pointing at a file you did not just edit.
required_fields() {
  case $1 in
    writing)  printf 'title description published' ;;
    notes)    printf 'title published' ;;
    projects) printf 'title description status' ;;
    updates)  printf 'title project published' ;;
  esac
}

# --- index ------------------------------------------------------------------

# Which collection each note belongs to, so a [[wikilink]] can be turned into
# the URL that note is actually served from. Built before anything is converted,
# because a note may link to one that has not been read yet.
declare -A note_collection=()
declare -A note_project=()

for collection in "${COLLECTIONS[@]}"; do
  [ -d "$VAULT/$collection" ] || continue

  while IFS= read -r note; do
    slug=$(slugify "$(basename "$note")")
    note_collection["$slug"]=$collection

    # An update is served under its project, so resolving a link to one means
    # knowing which project it belongs to.
    if [ "$collection" = updates ]; then
      note_project["$slug"]=$(field_of "$(frontmatter_of "$(tr -d '\r' <"$note")")" project)
    fi
  done < <(find "$VAULT/$collection" -type f -name '*.md' -not -path '*/.*')
done

# The site URL for a wikilink target, or nothing when it cannot be resolved.
url_for() {
  # One `local` per line on purpose: bash expands every word of a `local`
  # before it creates any of them, so `local slug=$1 collection=${map[$slug]}`
  # would look `slug` up in whatever the caller left in the global of that name.
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

# --- copy -------------------------------------------------------------------

declare -A referenced=()
copied=0

for collection in "${COLLECTIONS[@]}"; do
  [ -d "$VAULT/$collection" ] || continue

  dest="$CONTENT/$collection"
  $DRY_RUN || mkdir -p "$dest"

  while IFS= read -r note; do

    content=$(tr -d '\r' <"$note")
    frontmatter=$(frontmatter_of "$content")

    # Embedded images: ![[diagram.png|alt]] -> ![alt](../images/diagram.png).
    # The path is relative on purpose — that is what makes Astro treat the file
    # as a local image and optimize it. An absolute /images/... would be emitted
    # untouched and 404 on the site.
    #
    # Each distinct wikilink is replaced as a literal string, so nothing in a
    # filename has to be escaped for a regex.
    while IFS= read -r match; do
      [ -z "$match" ] && continue
      inner=${match#'![['}; inner=${inner%']]'}
      file=${inner%%|*}
      alt=""
      [ "$inner" != "$file" ] && alt=${inner#*|}
      referenced["$file"]=1
      content=${content//"$match"/"![$alt](../images/$file)"}
    done < <(grep -o '!\[\[[^]]*\]\]' <<<"$content" | sort -u)

    # Internal links: [[my note|label]] -> [label](/notes/my-note), with the
    # section taken from the collection the target lives in. Images are already
    # gone by now, so this pass cannot catch them.
    while IFS= read -r match; do
      [ -z "$match" ] && continue
      inner=${match#'[['}; inner=${inner%']]'}
      target=${inner%%|*}
      label=$target
      [ "$inner" != "$target" ] && label=${inner#*|}

      # An unresolved target becomes plain text: a link to a page that does not
      # exist is worse than no link, and the warning says which note to fix.
      if url=$(url_for "$(slugify "$target")"); then
        content=${content//"$match"/"[$label]($url)"}
      else
        echo "! $(basename "$note") links to [[$target]], which is not in the vault" >&2
        content=${content//"$match"/"$label"}
      fi
    done < <(grep -o '\[\[[^]]*\]\]' <<<"$content" | sort -u)

    for field in $(required_fields "$collection"); do
      grep -qE "^$field:" <<<"$frontmatter" \
        || echo "! $collection/$(basename "$note") has no \`$field:\` - the build will reject it" >&2
    done

    target_file="$dest/$(slugify "$(basename "$note")").md"

    if $DRY_RUN; then
      echo "[dry] $collection/$(basename "$note") -> $target_file"
    else
      printf '%s\n' "$content" >"$target_file"
      echo "copied: $collection/$(basename "$note")"
    fi

    copied=$((copied + 1))

  done < <(find "$VAULT/$collection" -type f -name '*.md' -not -path '*/.*')
done

# --- attachments ------------------------------------------------------------

if [ ${#referenced[@]} -gt 0 ]; then
  $DRY_RUN || mkdir -p "$IMAGES"

  for asset in "${!referenced[@]}"; do
    source_file=$(find "$VAULT" -type f -name "$asset" -not -path '*/.*' -print -quit)

    if [ -z "$source_file" ]; then
      source_file=$(find "$VAULT_ROOT" -type f -name "$asset" -not -path '*/.*' -print -quit)
    fi

    if [ -z "$source_file" ]; then
      echo "! attachment not found in vault: $asset" >&2
      continue
    fi

    $DRY_RUN || cp -f "$source_file" "$IMAGES/$asset"
    if $DRY_RUN; then echo "[dry] asset: $asset"; else echo "asset: $asset"; fi
  done
fi

# --- what was left behind ---------------------------------------------------

# Markdown outside the four collection folders is not content — the Templater
# files live there. Listing it is the difference between "ignored on purpose"
# and "silently lost".
ignored=()
while IFS= read -r note; do
  relative=${note#"$VAULT/"}
  top=${relative%%/*}

  case " ${COLLECTIONS[*]} " in
    *" $top "*) continue ;;
  esac

  ignored+=("$relative")
done < <(find "$VAULT" -type f -name '*.md' -not -path '*/.*')

if [ ${#ignored[@]} -gt 0 ]; then
  printf '\nnot a collection, left in the vault:\n'
  printf '  %s\n' "${ignored[@]}"
fi

printf '\n%d note(s) copied, %d asset(s), %d ignored.\n' \
  "$copied" "${#referenced[@]}" "${#ignored[@]}"
