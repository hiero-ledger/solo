// SPDX-License-Identifier: Apache-2.0

/**
 * @file generate-error-documentation.ts
 *
 * Generates the Markdown *bodies* for the SoloError documentation pages by
 * reading the TypeScript error sources in this repository. The output is
 * intentionally frontmatter-free: the solo-docs site downloads the bundled
 * archive produced by `task build:docs:content` and prepends the Hugo/Docsy
 * frontmatter itself (it owns the site presentation), exactly as it already
 * does for `solo-cli.md`.
 *
 * For each error class the following is extracted:
 *   - Error code (e.g. SOLO-1001)
 *   - Class name
 *   - Category (component / config / deployment / internal / system / validation)
 *   - Ownership (User / Infrastructure / Solo)
 *   - Retryable flag
 *   - Troubleshooting steps
 *   - Optional @description TSDoc tag
 *
 * Output (relative to docs/site/build/solo-docs-content):
 *   troubleshooting/errors/_index.md               — listing page with tables per category
 *   troubleshooting/errors/{category}/_index.md    — category section page (redirect)
 *   troubleshooting/errors/{category}/SOLO-XXXX.md — individual page per error
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import chalk from 'chalk';

const currentDirectory: string = path.dirname(fileURLToPath(import.meta.url));
const projectRoot: string = path.resolve(currentDirectory, '../../');
process.chdir(projectRoot);

const ERRORS_DIRECTORY: string = path.join(projectRoot, 'src/core/errors/classes');
const REGISTRY_FILE: string = path.join(projectRoot, 'src/core/errors/error-code-registry.ts');

const OUTPUT_DIRECTORY: string = path.join(projectRoot, 'docs/site/build/solo-docs-content/troubleshooting/errors');
const BUG_REPORT_URL: string = 'https://github.com/hiero-ledger/solo/issues';

const CATEGORY_LABELS: Record<string, string> = {
  config: 'Configuration',
  deployment: 'Deployment',
  component: 'Component',
  validation: 'Validation',
  system: 'System',
  internal: 'Internal',
};

type ErrorMeta = {
  code: string;
  className: string;
  category: string;
  ownership: string | undefined;
  retryable: boolean | undefined;
  troubleshootingSteps: string[];
  description: string | undefined;
};

function retryableLabel(retryable: boolean | undefined): string {
  if (retryable === true) {
    return 'Yes';
  }
  if (retryable === false) {
    return 'No';
  }
  return '—';
}

// ── Code registry ─────────────────────────────────────────────────────────────

/**
 * Reads error-code-registry.ts and returns a Map from registry key to code string.
 * e.g. 'LOCAL_CONFIG_NOT_FOUND' → 'SOLO-1001'
 */
function buildCodeMap(): Map<string, string> {
  const source: string = fs.readFileSync(REGISTRY_FILE, 'utf8');
  const map: Map<string, string> = new Map();
  for (const [, key, code] of source.matchAll(/^\s{2}(\w+):\s*'(SOLO-\d+)'/gm)) {
    map.set(key, code);
  }
  return map;
}

// ── Source parsing helpers ────────────────────────────────────────────────────

function extractClassName(source: string): string | undefined {
  const match: RegExpMatchArray | null = source.match(/export class (\w+) extends SoloError/);
  return match ? match[1] : undefined;
}

function extractOwnership(source: string): string | undefined {
  const match: RegExpMatchArray | null = source.match(/ErrorOwnership\.(\w+)/);
  return match ? match[1] : undefined;
}

function extractRetryable(source: string): boolean | undefined {
  const match: RegExpMatchArray | null = source.match(/retryable:\s*boolean\s*=\s*(true|false)/);
  if (!match) {
    return undefined;
  }
  return match[1] === 'true';
}

function extractCodeKey(source: string): string | undefined {
  const match: RegExpMatchArray | null = source.match(/code:\s*ErrorCodeRegistry\.(\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Extracts troubleshooting steps from the source. The steps are stored as a
 * multiline string in one of several forms:
 *   - Single-quoted strings joined with '+': 'Step 1\n' + 'Step 2'
 *   - A single single-quoted string:          'Only step'
 *   - A template literal:                     `Step with ${SoloError.bugReportUrl}`
 *   - Mixed: template literal + single-quoted string concatenated with '+'
 *
 * Returns an array of step strings (one element per `\n`-separated segment).
 */
function extractTroubleshootingSteps(source: string): string[] {
  const stepsIndex: number = source.indexOf('troubleshootingSteps:');
  if (stepsIndex === -1) {
    return [];
  }

  const region: string = source.slice(stepsIndex + 'troubleshootingSteps:'.length, stepsIndex + 4000);

  // Stop at the first line that starts with whitespace + '}' (closes the SoloErrorInit
  // object), regardless of whether it's followed by cause, ')', or ';'.
  const closingMatch: RegExpMatchArray | null = region.match(/\n[ \t]+\}/);
  const valueSource: string = closingMatch ? region.slice(0, closingMatch.index) : region;

  // Replace ${SoloError.bugReportUrl} with the actual URL before string extraction
  const withBugUrl: string = valueSource.replaceAll('${SoloError.bugReportUrl}', BUG_REPORT_URL);

  // Collect all string parts in source order (single-quoted or template literal)
  const parts: string[] = [];
  for (const match of withBugUrl.matchAll(/'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    if (match[1] !== undefined) {
      // Single-quoted string — use as-is
      parts.push(match[1]);
    } else if (match[2] !== undefined) {
      // Template literal — replace runtime variable references with <varName>
      parts.push(match[2].replaceAll(/\$\{([^}]+)\}/g, '<$1>'));
    }
  }

  if (parts.length === 0) {
    return [];
  }

  return parts
    .join('')
    .split(String.raw`\n`)
    .map((s: string): string => s.trim())
    .filter(Boolean);
}

/**
 * Extracts the @description TSDoc tag from the comment block immediately
 * preceding the `export class ... extends SoloError` declaration.
 * Returns undefined if no @description is found.
 */
function extractDescription(source: string): string | undefined {
  const classIndex: number = source.search(/export class \w+ extends SoloError/);
  if (classIndex === -1) {
    return undefined;
  }

  const beforeClass: string = source.slice(0, classIndex);
  const lastCommentStart: number = beforeClass.lastIndexOf('/**');
  if (lastCommentStart === -1) {
    return undefined;
  }

  const comment: string = beforeClass.slice(lastCommentStart);
  const descriptionMatch: RegExpMatchArray | null = comment.match(/@description\s+([\s\S]+?)(?:\n\s*\*\s*@|\s*\*\/)/);
  if (!descriptionMatch) {
    return undefined;
  }

  return descriptionMatch[1]
    .split('\n')
    .map((line: string): string => line.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ');
}

// ── File scanning ─────────────────────────────────────────────────────────────

function collectErrorFiles(): string[] {
  return fs
    .readdirSync(ERRORS_DIRECTORY, {recursive: true, withFileTypes: true})
    .filter(
      (entry: fs.Dirent): boolean => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.startsWith('index'),
    )
    .map((entry: fs.Dirent): string => path.join(entry.parentPath, entry.name));
}

// ── Error metadata extraction ─────────────────────────────────────────────────

function parseErrorFile(filePath: string, codeMap: Map<string, string>): ErrorMeta | undefined {
  const source: string = fs.readFileSync(filePath, 'utf8');
  const className: string | undefined = extractClassName(source);
  if (!className) {
    return undefined;
  }

  const codeKey: string | undefined = extractCodeKey(source);
  const code: string | undefined = codeKey ? codeMap.get(codeKey) : undefined;
  if (!code) {
    return undefined;
  }

  // Category is the first directory segment under 'classes/'
  const relative: string = path.relative(ERRORS_DIRECTORY, filePath);
  const category: string = relative.split(path.sep)[0];

  return {
    code,
    className,
    category,
    ownership: extractOwnership(source),
    retryable: extractRetryable(source),
    troubleshootingSteps: extractTroubleshootingSteps(source),
    description: extractDescription(source),
  };
}

// ── Sorting ───────────────────────────────────────────────────────────────────

function numericCode(code: string): number {
  return Number.parseInt(code.replace('SOLO-', ''), 10);
}

function emptyCategoryBuckets(): Map<string, ErrorMeta[]> {
  return new Map(Object.keys(CATEGORY_LABELS).map((key: string): [string, ErrorMeta[]] => [key, []]));
}

// ── Markdown body generation (frontmatter is added downstream by solo-docs) ─────

function generateIndexPageBody(errors: ErrorMeta[]): string {
  let document: string = '';
  document += 'All Solo errors carry a structured code, an ownership classification, and troubleshooting\n';
  document += 'steps. Click an error code to see its dedicated page.\n\n';

  // Group errors by category, preserving the canonical order defined in CATEGORY_LABELS.
  const byCategory: Map<string, ErrorMeta[]> = emptyCategoryBuckets();
  for (const error of errors) {
    const bucket: ErrorMeta[] = byCategory.get(error.category) ?? [];
    bucket.push(error);
    byCategory.set(error.category, bucket);
  }

  for (const [category, bucket] of byCategory) {
    if (bucket.length === 0) {
      continue;
    }
    const categoryLabel: string = CATEGORY_LABELS[category] ?? category;
    document += `## ${categoryLabel}\n\n`;
    document += '| Code | Class | Ownership | Retryable |\n';
    document += '|------|-------|-----------|----------|\n';
    for (const error of bucket) {
      // Link into the category subdirectory so Hugo resolves directly without a redirect.
      document += `| [${error.code}](${error.category}/${error.code}) | \`${error.className}\` | ${error.ownership ?? '—'} | ${retryableLabel(error.retryable)} |\n`;
    }
    document += '\n';
  }

  // When a visitor arrives via a category redirect (e.g. /docs/troubleshooting/errors/config/ →
  // /docs/troubleshooting/errors/#configuration), the sidebar category section should auto-expand.
  // Docsy's foldable nav uses hidden checkboxes: checking one expands its child ul.
  // Sidebar links for category sections have class td-sidebar-link__section and
  // href under /docs/troubleshooting/errors/.  We match on link text vs the hash target.
  document += '<script>\n';
  document += '(function () {\n';
  document += '  function expandCategory(hash) {\n';
  document += '    if (!hash || hash.length < 2) return;\n';
  document += '    var target = hash.slice(1).toLowerCase();\n';
  document +=
    '    var links = document.querySelectorAll(\'a.td-sidebar-link__section[href^="/docs/troubleshooting/errors/"]\');\n';
  document += '    for (var i = 0; i < links.length; i++) {\n';
  document += '      if (links[i].textContent.trim().toLowerCase() === target) {\n';
  document += "        var li = links[i].closest('li');\n";
  document += '        if (li) { var cb = li.querySelector(\'input[type="checkbox"]\'); if (cb) cb.checked = true; }\n';
  document += '        break;\n';
  document += '      }\n';
  document += '    }\n';
  document += '  }\n';
  document +=
    "  document.addEventListener('DOMContentLoaded', function () { expandCategory(window.location.hash); });\n";
  document += "  window.addEventListener('hashchange', function () { expandCategory(window.location.hash); });\n";
  document += '})();\n';
  document += '</script>\n';

  return document;
}

function generateCategoryIndexPageBody(category: string): string {
  const label: string = CATEGORY_LABELS[category] ?? category;
  // Hugo generates heading IDs as the lowercase label: ## Configuration → #configuration.
  const anchor: string = label.toLowerCase();
  const target: string = `/docs/troubleshooting/errors/#${anchor}`;

  let document: string = '';
  // Raw HTML redirect — goldmark.renderer.unsafe is true in hugo.yaml.
  document += `<script>window.location.replace("${target}");</script>\n`;
  document += `<meta http-equiv="refresh" content='0; url=${target}'>\n`;

  return document;
}

function generateErrorPageBody(error: ErrorMeta): string {
  const categoryLabel: string = CATEGORY_LABELS[error.category] ?? error.category;

  let document: string = '';
  document += `## \`${error.className}\`\n\n`;

  document += '| | |\n';
  document += '|---|---|\n';
  document += `| **Code** | \`${error.code}\` |\n`;
  document += `| **Category** | ${categoryLabel} |\n`;
  document += `| **Ownership** | ${error.ownership ?? '—'} |\n`;
  document += `| **Retryable** | ${retryableLabel(error.retryable)} |\n\n`;

  if (error.description) {
    document += '## Description\n\n';
    document += `${error.description}\n\n`;
  }

  if (error.troubleshootingSteps.length > 0) {
    document += '## Troubleshooting Steps\n\n';
    for (const step of error.troubleshootingSteps) {
      document += `1. ${step}\n`;
    }
    document += '\n';
  }

  return document;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(chalk.cyan('Generating Solo error code documentation page bodies...'));

  if (!fs.existsSync(ERRORS_DIRECTORY)) {
    console.error(chalk.red(`Error: Solo errors directory not found at ${ERRORS_DIRECTORY}`));
    // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
    process.exit(1);
  }

  const codeMap: Map<string, string> = buildCodeMap();
  console.log(chalk.dim(`Loaded ${codeMap.size} error codes from registry`));

  const errorFiles: string[] = collectErrorFiles();
  const errors: ErrorMeta[] = [];

  for (const filePath of errorFiles) {
    const meta: ErrorMeta | undefined = parseErrorFile(filePath, codeMap);
    if (meta) {
      errors.push(meta);
    }
  }

  errors.sort((a: ErrorMeta, b: ErrorMeta): number => numericCode(a.code) - numericCode(b.code));
  console.log(chalk.green(`✓ Parsed ${errors.length} error classes`));

  // Rebuild the output tree from scratch so removed errors don't leave orphans.
  fs.rmSync(OUTPUT_DIRECTORY, {recursive: true, force: true});
  fs.mkdirSync(OUTPUT_DIRECTORY, {recursive: true});

  // Main listing page body.
  const indexPath: string = path.join(OUTPUT_DIRECTORY, '_index.md');
  fs.writeFileSync(indexPath, generateIndexPageBody(errors), 'utf8');
  console.log(chalk.green(`✓ Wrote index page → ${path.relative(projectRoot, indexPath)}`));

  // Group errors by category.
  const byCategory: Map<string, ErrorMeta[]> = emptyCategoryBuckets();
  for (const error of errors) {
    (byCategory.get(error.category) ?? []).push(error);
  }

  let written: number = 0;
  for (const [category, categoryErrors] of byCategory) {
    if (categoryErrors.length === 0) {
      continue;
    }

    const categoryDirectory: string = path.join(OUTPUT_DIRECTORY, category);
    fs.mkdirSync(categoryDirectory, {recursive: true});

    // Category section page — redirects to the corresponding anchor on the main errors page.
    fs.writeFileSync(path.join(categoryDirectory, '_index.md'), generateCategoryIndexPageBody(category), 'utf8');

    // Individual error pages
    for (const error of categoryErrors) {
      fs.writeFileSync(path.join(categoryDirectory, `${error.code}.md`), generateErrorPageBody(error), 'utf8');
      written++;
    }

    console.log(chalk.green(`✓ ${CATEGORY_LABELS[category]}: ${categoryErrors.length} pages → ${category}/`));
  }

  console.log(chalk.green(`✓ Wrote ${written} individual error page bodies total`));
  console.log(chalk.cyan('Done.'));
}

main();
