#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Extract a version-like string for a TypeScript const target.

Usage:
  extract-version.sh <TARGET> <SOURCE_FILE>

Arguments:
  TARGET       TypeScript const name to extract (for example HEDERA_PLATFORM_VERSION)
  SOURCE_FILE  Path to the TypeScript file to parse

Examples:
  extract-version.sh PREV_BLOCK_NODE_VERSION version-test.ts
  extract-version.sh HEDERA_PLATFORM_VERSION version.ts
EOF
  exit 0
fi

if [[ "$#" -ne 2 ]]; then
  echo "Usage: $0 <TARGET> <SOURCE_FILE> (use --help for details)" >&2
  exit 1
fi

TARGET="$1"
SOURCE_FILE="$2"

if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "Source file not found: ${SOURCE_FILE}" >&2
  exit 1
fi

value="$({
  # Primary pass:
  # - Parse by declaration blocks (RS=';') so multiline assignments are supported.
  # - Prefer quoted values after '||' to skip env var name strings.
  awk -v target="${TARGET}" '
    BEGIN {
      RS = ";"
      value = ""
      declarationFound = 0
    }

    function extract_value(text,    idx, candidate, s, token, v) {
      idx = index(text, "||")
      if (idx > 0) {
        candidate = substr(text, idx + 2)
      } else {
        candidate = text
      }

      s = candidate
      v = ""
      while (match(s, /\047[^\047]*\047|\"[^\"]*\"/)) {
        token = substr(s, RSTART, RLENGTH)
        v = substr(token, 2, length(token) - 2)
        s = substr(s, RSTART + RLENGTH)
      }

      return v
    }

    {
      if ($0 ~ "(^|[[:space:]])(export[[:space:]]+)?const[[:space:]]+" target "([[:space:]]|:)" ) {
        declarationFound = 1
        value = extract_value($0)
        if (value != "") {
          print value
          exit
        }
      }
    }

    END {
      if (declarationFound == 0 || value == "") {
        exit 1
      }
    }
  ' "${SOURCE_FILE}" || true
} | head -n 1)"

if [[ -z "${value}" ]]; then
  value="$({
    # Fallback pass:
    # - Scan line by line for the target and apply the same extraction logic.
    # - Keeps backward compatibility for unusual formatting.
    awk -v target="${TARGET}" '
      function extract_value(text,    idx, candidate, s, token, v) {
        idx = index(text, "||")
        if (idx > 0) {
          candidate = substr(text, idx + 2)
        } else {
          candidate = text
        }

        s = candidate
        v = ""
        while (match(s, /\047[^\047]*\047|\"[^\"]*\"/)) {
          token = substr(s, RSTART, RLENGTH)
          v = substr(token, 2, length(token) - 2)
          s = substr(s, RSTART + RLENGTH)
        }

        return v
      }

      {
        if (index($0, target) > 0) {
          value = extract_value($0)
          if (value != "") {
            print value
            exit
          }
        }
      }

      END {
        if (value == "") {
          exit 1
        }
      }
    ' "${SOURCE_FILE}" || true
} | head -n 1)"
fi

if [[ -z "${value}" ]]; then
  echo "Unable to extract value for target \"${TARGET}\" from ${SOURCE_FILE}" >&2
  exit 1
fi

printf '%s' "${value}"

