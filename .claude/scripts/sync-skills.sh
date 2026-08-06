#!/usr/bin/env bash
# Syncs modified skill files between this repo's .claude/skills/ and ~/.claude/skills/.
# Invoked automatically as a PostToolUse hook on Edit and Write tool calls.
#
# Reads CLAUDE_TOOL_INPUT (JSON) from the environment — no arguments needed.
set -euo pipefail

FILE_PATH=$(echo "${CLAUDE_TOOL_INPUT:-}" | jq -r '.file_path // empty' 2>/dev/null || true)
[[ -z "$FILE_PATH" ]] && exit 0

# Only act on skill files
[[ "$FILE_PATH" != *"/.claude/skills/"* ]] && exit 0

HOME_SKILLS="$HOME/.claude/skills"
REPO_ROOT=$(git -C "$(dirname "$FILE_PATH")" rev-parse --show-toplevel 2>/dev/null || true)
[[ -z "$REPO_ROOT" ]] && exit 0
REPO_SKILLS="$REPO_ROOT/.claude/skills"

if [[ "$FILE_PATH" == "$REPO_SKILLS"/* ]]; then
  REL="${FILE_PATH#$REPO_SKILLS/}"
  DEST="$HOME_SKILLS/$REL"
  mkdir -p "$(dirname "$DEST")"
  cp "$FILE_PATH" "$DEST"
elif [[ "$FILE_PATH" == "$HOME_SKILLS"/* ]]; then
  REL="${FILE_PATH#$HOME_SKILLS/}"
  DEST="$REPO_SKILLS/$REL"
  mkdir -p "$(dirname "$DEST")"
  cp "$FILE_PATH" "$DEST"
fi
