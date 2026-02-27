#!/usr/bin/env node

import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const usage = () => {
  console.log(`Usage:
  resolve-deployment.mjs [deployment-name] [deployment|namespace]

Examples:
  resolve-deployment.mjs
  resolve-deployment.mjs falcon-deployment
  resolve-deployment.mjs falcon-deployment namespace`);
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

const requested = process.argv[2] ?? '';
const outputField = process.argv[3] ?? 'deployment';

if (outputField !== 'deployment' && outputField !== 'namespace') {
  console.error(`ERROR: Unsupported output field '${outputField}'. Use 'deployment' or 'namespace'.`);
  process.exit(1);
}

const configFile = join(process.env.HOME ?? '', '.solo', 'local-config.yaml');
if (!existsSync(configFile)) {
  console.error(`ERROR: local config not found: ${configFile}`);
  process.exit(1);
}

const normalize = (value) => value.replace(/^['"]|['"]$/g, '').trim();

const lines = readFileSync(configFile, 'utf8').split(/\r?\n/);
const pairs = [];
let inDeployments = false;
let currentName = '';

for (const rawLine of lines) {
  const line = rawLine;
  const trimmed = line.trim();

  if (!inDeployments) {
    if (trimmed === 'deployments:') {
      inDeployments = true;
    }
    continue;
  }

  if (/^[^\s].*:$/.test(line) && trimmed !== 'deployments:') {
    break;
  }

  const nameMatch = line.match(/^\s*name:\s*(.+)\s*$/);
  if (nameMatch) {
    currentName = normalize(nameMatch[1]);
    continue;
  }

  const nsMatch = line.match(/^\s*namespace:\s*(.+)\s*$/);
  if (nsMatch && currentName) {
    pairs.push({name: currentName, namespace: normalize(nsMatch[1])});
    currentName = '';
  }
}

if (pairs.length === 0) {
  console.error(`ERROR: No deployments found in ${configFile}`);
  process.exit(1);
}

const latest = pairs.at(-1);
const found = requested ? pairs.find((pair) => pair.name === requested) : undefined;
const resolved = found ?? latest;

if (outputField === 'deployment') {
  console.log(resolved.name);
  process.exit(0);
}

if (!resolved.namespace) {
  console.error(`ERROR: Namespace not found for deployment ${resolved.name}`);
  process.exit(1);
}

console.log(resolved.namespace);
