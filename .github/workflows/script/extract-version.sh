#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "Usage: $0 <TARGET> <SOURCE_FILE>" >&2
  exit 1
fi

TARGET="$1"
SOURCE_FILE="$2"

if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "Source file not found: ${SOURCE_FILE}" >&2
  exit 1
fi

TARGET="${TARGET}" SOURCE_FILE="${SOURCE_FILE}" node <<'NODE'
const fs = require('fs');

const target = process.env.TARGET;
const sourceFile = process.env.SOURCE_FILE;
const content = fs.readFileSync(sourceFile, 'utf8');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const targetPattern = escapeRegex(target);

const declarationRegex = new RegExp(`(?:export\\s+)?const\\s+${targetPattern}\\b[\\s\\S]*?;`, 'g');
const quoteRegex = /['"]([^'"]+)['"]/g;

const getLastQuoted = (input) => {
  let match;
  let last;
  while ((match = quoteRegex.exec(input)) !== null) {
    last = match[1];
  }
  return last;
};

let value;
for (const declaration of content.match(declarationRegex) || []) {
  value = getLastQuoted(declaration);
  if (value) {
    break;
  }
}

if (!value) {
  for (const line of content.split('\n')) {
    if (line.includes(target)) {
      value = getLastQuoted(line);
      if (value) {
        break;
      }
    }
  }
}

if (!value) {
  console.error(`Unable to extract value for target "${target}" from ${sourceFile}`);
  process.exit(1);
}

process.stdout.write(value);
NODE
