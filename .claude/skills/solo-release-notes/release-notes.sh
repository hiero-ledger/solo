#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Solo Release Notes helper
#
# Read-only/local subcommands used by the solo-release-notes skill:
#
#   gather   <tag|latest> [--previous <tag>] [--out <dir>]
#       Collects everything needed to write human release notes for <tag>:
#       the current GitHub release body, the commits and PRs since the
#       previous tag, and diff signals that commonly hide breaking changes
#       (version.ts, package.json, flags, command definitions, schema
#       migrations, env.md). Writes them to <dir> and prints a short summary.
#
#   assemble <dir> <summary.md>
#       Builds <dir>/final-notes.md = <summary.md> wrapped in markers, followed
#       by the original semantic-release changelog. Any summary block from a
#       previous run is stripped first, so re-running is idempotent.
#
#   check    <dir>
#       Exits non-zero if the live release changelog (generated summary
#       stripped) no longer matches <dir>/changelog.md, i.e. someone edited the
#       release after gather ran and publishing would overwrite their change.
#
# Nothing here edits the GitHub release — publishing is a separate, explicitly
# confirmed `gh release edit` step in the skill.
#
# Requirements: gh (authenticated), git, jq, bash 3.2+. Run from the solo repo root.

set -euo pipefail

REPO="hiero-ledger/solo"
START_MARKER="<!-- solo-release-notes:start -->"
END_MARKER="<!-- solo-release-notes:end -->"

usage() {
  sed -n '4,27p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

# Removes a previously generated summary block so only the semantic-release changelog remains.
strip_generated_block() {
  awk -v start="${START_MARKER}" -v end="${END_MARKER}" '
    $0 == start { skipping = 1; next }
    $0 == end   { skipping = 0; dropBlank = 1; next }
    skipping    { next }
    dropBlank && /^[[:space:]]*$/ { next }
    { dropBlank = 0; print }
  '
}

# Prints each line of $1 as a markdown bullet, or "(none)" when empty.
list_or_none() {
  if [[ -n "$1" ]]; then
    printf '%s\n' "$1" | sed 's/^/- /'
  else
    echo "(none)"
  fi
}

gather() {
  local tag="" previous="" out=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --previous) previous="$2"; shift 2 ;;
      --out) out="$2"; shift 2 ;;
      -*) usage ;;
      *) tag="$1"; shift ;;
    esac
  done
  [[ -z "${tag}" ]] && usage

  git fetch --tags --quiet origin

  if [[ "${tag}" == "latest" ]]; then
    tag="$(gh release view --repo "${REPO}" --json tagName --jq .tagName)"
  fi
  git rev-parse --verify --quiet "${tag}^{commit}" >/dev/null || {
    echo "error: tag ${tag} not found locally after fetch" >&2
    exit 1
  }

  # Nearest tag reachable from the parent of <tag>: on a maintenance line (release/N.N) this is
  # the previous patch of that line, on main it is the previous main release.
  if [[ -z "${previous}" ]]; then
    previous="$(git describe --tags --abbrev=0 "${tag}^")"
  fi

  out="${out:-${TMPDIR:-/tmp}/solo-release-notes-${tag}}"
  rm -rf "${out}"
  mkdir -p "${out}/prs"

  # 1. Current release body (semantic-release changelog), minus any earlier generated summary.
  gh release view "${tag}" --repo "${REPO}" --json body --jq .body | strip_generated_block > "${out}/changelog.md"

  # 2. Commits and their squash-merge PR numbers. The release bot commit is excluded.
  git log "${previous}..${tag}" --no-merges --pretty=format:'%H%x09%s' \
    | grep -v -E $'\t''chore\(release\): ' \
    | awk -F'\t' '{
        pr = ""
        if (match($2, /\(#[0-9]+\)$/)) { pr = substr($2, RSTART + 2, RLENGTH - 3) }
        print $1 "\t" pr "\t" $2
      }' > "${out}/commits.tsv"

  # Commits that declare a breaking change explicitly (type! or BREAKING CHANGE footer).
  git log "${previous}..${tag}" --no-merges --pretty=format:'%H%x09%s%x09%b%x1e' \
    | awk -v RS='\x1e' -F'\t' '$2 ~ /^[a-z]+(\([^)]*\))?!:/ || $3 ~ /BREAKING[ -]CHANGE/ { gsub(/^\n/, "", $1); print $1 "\t" $2 }' \
    > "${out}/declared-breaking.tsv"

  # 3. PR details, fetched in parallel.
  cut -f2 "${out}/commits.tsv" | grep -E '^[0-9]+$' | sort -u \
    | xargs -P 8 -I{} sh -c \
      "gh pr view {} --repo '${REPO}' --json number,title,url,author,labels,files,body > '${out}/prs/{}.json'"

  # Compact digest: template boilerplate removed, breaking-change checkbox extracted, and a
  # coarse user-facing/internal hint from the touched paths (the skill makes the final call).
  jq -s '
    map({
      number,
      title,
      url,
      author: .author.login,
      labels: [.labels[].name],
      files: [.files[].path],
      noBreakingChangesChecked: (
        (.body // "") | test("\\\\?\\[[xX]\\\\?\\] This PR has no breaking changes")
      ),
      touchesProductCode: (
        [.files[].path]
        | any(test("^(src/|version\\.ts$|package\\.json$|resources/|solo\\.ts$|installers/|scripts/postinstall\\.mjs$)"))
      ),
      description: (
        (.body // "")
        | gsub("<details>[\\s\\S]*?</details>"; "")
        | gsub("(?m)^\\s*[*-] \\\\?\\[[ xX]\\\\?\\].*$\\n?"; "")
        | gsub("\\n{3,}"; "\n\n")
      )
    })
    | sort_by(.number)
  ' "${out}"/prs/*.json > "${out}/prs.json" 2>/dev/null || echo '[]' > "${out}/prs.json"

  # 4. Diff signals that commonly carry breaking changes or upgrade notes.
  {
    echo "# Diff signals ${previous}..${tag}"
    echo
    echo "## version.ts (component default versions)"
    echo '```diff'
    git diff "${previous}" "${tag}" -- version.ts | grep -E '^[+-][^+-]' || echo "(no changes)"
    echo '```'
    echo
    echo "## package.json (engines and runtime dependencies)"
    echo '```diff'
    git diff "${previous}" "${tag}" -- package.json | grep -E '^[+-][^+-]' || echo "(no changes)"
    echo '```'
    echo
    echo "## CLI flags added/removed or changed default (src/commands/flags.ts)"
    echo '```diff'
    git diff -U0 "${previous}" "${tag}" -- src/commands/flags.ts \
      | grep -E "^[+-][[:space:]]+(name: '|defaultValue:|public static readonly [a-zA-Z]+: CommandFlag)" \
      || echo "(no changes)"
    echo '```'
    echo
    echo "## Command definitions (src/commands/command-definitions)"
    echo '```diff'
    git diff -U0 "${previous}" "${tag}" -- src/commands/command-definitions \
      | grep -E "^([+-][^+-].*(COMMAND_NAME|SUBCOMMAND_NAME|_COMMAND|_SUBCOMMAND|_OPERATION)|diff --git)" \
      | head -200 || echo "(no changes)"
    echo '```'
    echo
    echo "## Config schema migrations added (one-way upgrades of local/remote config)"
    list_or_none "$(git diff --name-only --diff-filter=A "${previous}" "${tag}" -- src/data/schema/migration)"
    echo
    echo "## Files removed under src/commands"
    list_or_none "$(git diff --name-only --diff-filter=D "${previous}" "${tag}" -- src/commands)"
    echo
    echo "## Environment variables documentation (docs/site/content/en/docs/env.md)"
    echo '```diff'
    git diff "${previous}" "${tag}" -- docs/site/content/en/docs/env.md \
      | grep -E '^[+-](## |\* \*\*(Description|Default):)' || echo "(no changes)"
    echo '```'
  } > "${out}/signals.md"

  printf '%s\n' "${tag}" > "${out}/tag"
  printf '%s\n' "${previous}" > "${out}/previous"

  local commitCount prCount productCount declaredBreaking
  commitCount="$(wc -l < "${out}/commits.tsv" | tr -d ' ')"
  prCount="$(jq length "${out}/prs.json")"
  productCount="$(jq '[.[] | select(.touchesProductCode)] | length' "${out}/prs.json")"
  declaredBreaking="$(grep -c . "${out}/declared-breaking.tsv" || true)"

  echo "tag=${tag}"
  echo "previous=${previous}"
  echo "out=${out}"
  echo "commits=${commitCount} prs=${prCount} prs_touching_product_code=${productCount} declared_breaking_commits=${declaredBreaking}"
  echo "files: changelog.md commits.tsv declared-breaking.tsv prs.json signals.md"
}

assemble() {
  local out="${1:-}" summary="${2:-}"
  [[ -z "${out}" || -z "${summary}" ]] && usage
  [[ -f "${out}/changelog.md" ]] || { echo "error: ${out}/changelog.md missing — run gather first" >&2; exit 1; }

  {
    echo "${START_MARKER}"
    # Never nest markers if the summary file already contains them.
    grep -v -F -x -e "${START_MARKER}" -e "${END_MARKER}" "${summary}"
    echo
    echo "## Full Changelog"
    echo "${END_MARKER}"
    echo
    cat "${out}/changelog.md"
  } > "${out}/final-notes.md"

  echo "${out}/final-notes.md"
}

# Drops trailing blank lines; GitHub stores release bodies with an extra trailing newline.
trim_trailing_blank_lines() {
  awk '/^[[:space:]]*$/ { blank = blank $0 "\n"; next } { printf "%s", blank; blank = ""; print }'
}

check() {
  local out="${1:-}"
  [[ -z "${out}" ]] && usage
  [[ -f "${out}/tag" ]] || { echo "error: ${out}/tag missing — run gather first" >&2; exit 1; }

  local tag
  tag="$(cat "${out}/tag")"
  if diff -q \
    <(gh release view "${tag}" --repo "${REPO}" --json body --jq .body | strip_generated_block | trim_trailing_blank_lines) \
    <(trim_trailing_blank_lines < "${out}/changelog.md") >/dev/null; then
    echo "unchanged: ${tag} release changelog matches ${out}/changelog.md"
  else
    echo "changed: ${tag} release body was edited after gather; re-run gather and assemble" >&2
    exit 2
  fi
}

case "${1:-}" in
  gather) shift; gather "$@" ;;
  assemble) shift; assemble "$@" ;;
  check) shift; check "$@" ;;
  *) usage ;;
esac
