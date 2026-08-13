// SPDX-License-Identifier: Apache-2.0

/**
 * Builds the Solo Node.js Single Executable Application (SEA) for the current platform.
 *
 * Pipeline:
 *   1. esbuild bundles dist/src/index.js (exports main(), no top-level await) into a CJS file
 *   2. A generated CJS SEA entry (sea-main.cjs) bootstraps synchronously, then requires the bundle
 *   3. All files under resources/, persist-port-forward.js, and solo-src-bundle.cjs are SEA assets
 *   4. node --experimental-sea-config generates the SEA blob from sea-main.cjs
 *   5. The current node binary is copied and the blob is injected via postject
 *   6. On macOS the binary is re-signed with an ad-hoc signature
 *
 * Why dist/src/index.js (not dist/solo.js)?
 *   dist/solo.js is compiled from solo.ts which uses top-level await, incompatible with esbuild's
 *   CJS output format. dist/src/index.js exports async function main() with no top-level await.
 *   The source-map-support import is also in solo.ts (not src/index.ts), so the CJS bundle avoids
 *   the dynamic-require issue that crashes esbuild's ESM-format shim (__require2).
 *
 * How bootstrapping works:
 *   sea-main.cjs (the SEA main script, embedded in the blob) runs synchronously:
 *     1. Sets SOLO_SEA_VERSION and SOLO_SEA_ROOT_DIR env vars
 *     2. Extracts all SEA assets (including solo-src-bundle.cjs) to ~/.solo/sea-resources/<ver>/
 *     3. Calls require(seaRoot/solo-src-bundle.cjs) — synchronous CJS
 *     4. Calls main() inside an async IIFE (no top-level await needed in CJS)
 *   constants.ts reads SOLO_SEA_ROOT_DIR (set before require()) for ROOT_DIR.
 *   version.ts reads SOLO_SEA_VERSION (set before require()) for getSoloVersion().
 *
 * Output: sea/dist/solo-<platform>-<arch>[.exe]
 *
 * Run with: npx tsx sea/build.ts
 * Or via:   task sea:build   (which ensures build:compile ran first)
 */

// eslint-disable-next-line n/no-unpublished-import
import * as esbuild from 'esbuild';
import {execSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const SEA_DIR: string = path.dirname(fileURLToPath(import.meta.url));
const ROOT: string = path.join(SEA_DIR, '..');
const BUILD_DIR: string = path.join(SEA_DIR, 'dist');
const RESOURCES_DIR: string = path.join(ROOT, 'resources');
const DIST_DIR: string = path.join(ROOT, 'dist');

const packageJson: {version: string} = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version: string = packageJson.version;

const {platform, arch} = process;
const extension: string = platform === 'win32' ? '.exe' : '';
const binaryName: string = `solo-${platform}-${arch}${extension}`;

const bundlePath: string = path.join(BUILD_DIR, 'solo-src-bundle.cjs');
const seaMainPath: string = path.join(BUILD_DIR, 'sea-main.cjs');
const blobPath: string = path.join(BUILD_DIR, 'sea-prep.blob');
const configPath: string = path.join(BUILD_DIR, 'sea-config.json');
const binaryPath: string = path.join(BUILD_DIR, binaryName);

/** Wraps a path in double quotes for safe shell interpolation on all platforms. */
const quotePath: (filePath: string) => string = (filePath: string): string => `"${filePath}"`;

function run(cmd: string, label: string): void {
  console.log(`\n▶ ${label}`);
  execSync(cmd, {stdio: 'inherit'});
}

/** Recursively collect all files under a directory, returning paths relative to a base directory. */
function collectFiles(directory: string, baseDirectory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath: string = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...collectFiles(fullPath, baseDirectory));
    } else {
      results.push(path.relative(baseDirectory, fullPath));
    }
  }
  return results;
}

console.log(`\nBuilding Solo SEA binary v${version} for ${platform}/${arch}: ${binaryName}`);

mkdirSync(BUILD_DIR, {recursive: true});

// Step 1: bundle the solo module into a self-contained CJS file.
// Entry: dist/src/index.js (exports main(), zero top-level await).
// CJS format: Node.js built-in require() works for transitive CJS packages at runtime.
// import.meta in constants.ts / version.ts is never evaluated because SOLO_SEA_ROOT_DIR /
// SOLO_SEA_VERSION are set by sea-main.cjs before this bundle is require()d.
console.log('\n▶ Bundling dist/src/index.js with esbuild (CJS)');
await esbuild.build({
  entryPoints: [path.join(DIST_DIR, 'src', 'index.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: bundlePath,
  external: ['*.node'],
  keepNames: true,
  // In CJS format, esbuild replaces import.meta with {}. Some ESM packages call
  // Module.createRequire(import.meta.url) at module level — with import.meta.url === undefined
  // that throws ERR_INVALID_ARG_VALUE at runtime. Providing the bundle's own file URL keeps
  // those createRequire() calls valid on all platforms (pathToFileURL produces a correct
  // file:///C:/... URL on Windows, file:///... on Unix).
  define: {'import.meta.url': JSON.stringify(pathToFileURL(bundlePath).href)},
  logOverride: {'empty-import-meta': 'silent'},
  logLevel: 'warning',
});

// Step 2: build the SEA assets map after the bundle exists.
const seaAssets: Record<string, string> = {};

// Resource files: preserve repo-relative path so the bootstrap reconstructs the same
// directory structure under ~/.solo/sea-resources/<version>/.
for (const relativePath of collectFiles(RESOURCES_DIR, ROOT)) {
  seaAssets[relativePath] = path.join(ROOT, relativePath);
}

// persist-port-forward.js is spawned as a detached child process. k8-client-pod.ts
// uses SOLO_SEA_ROOT_DIR to locate it in SEA mode.
seaAssets['scripts/persist-port-forward.js'] = path.join(
  DIST_DIR,
  'src',
  'integration',
  'kube',
  'k8-client',
  'resources',
  'pod',
  'persist-port-forward.js',
);

// package.json — embedded so getSoloVersion() can fall back to it if needed.
seaAssets['package.json'] = path.join(ROOT, 'package.json');

// The bundled solo code: extracted at first run and then required synchronously.
seaAssets['solo-src-bundle.cjs'] = bundlePath;

const assetKeys: string[] = Object.keys(seaAssets);

// Step 3: generate the CJS SEA entry script.
// sea-main.cjs is what Node.js executes from the SEA blob. It:
//   - Bootstraps synchronously (sets env vars, extracts assets)
//   - Requires solo-src-bundle.cjs from the extracted seaRoot
//   - Calls soloModule.main() inside an async IIFE (CJS-compatible, no top-level await)
// Note: Node.js SEA overrides require() to allow only built-in modules (embedderRequire).
// Any non-built-in path passed to require() throws ERR_UNKNOWN_BUILTIN_MODULE.
// Dynamic import() goes through the regular module loader and CAN load filesystem files,
// so we use import() + pathToFileURL to load solo-src-bundle.cjs after extraction.
const seaMainContent: string = `'use strict';
// SEA bootstrap — synchronous CJS; sets env vars and extracts assets before loading solo.
// NOTE: require() in SEA mode is restricted to Node.js built-ins; use import() for files.
const sea = require('node:sea');
const os = require('os');
const path = require('path');
const fs = require('fs');
const url = require('url');

const SOLO_SEA_VERSION = ${JSON.stringify(version)};

let bundleFileUrl;
if (sea.isSea()) {
  process.env['SOLO_SEA_VERSION'] = SOLO_SEA_VERSION;

  const seaRoot = path.join(os.homedir(), '.solo', 'sea-resources', SOLO_SEA_VERSION);
  process.env['SOLO_SEA_ROOT_DIR'] = seaRoot;

  // Skip extraction when the marker already records this exact version.
  const markerPath = path.join(seaRoot, '.sea-extracted');
  let needsExtraction = true;
  try { needsExtraction = fs.readFileSync(markerPath, 'utf8').trim() !== SOLO_SEA_VERSION; }
  catch { /* not yet extracted */ }

  if (needsExtraction) {
    for (const key of ${JSON.stringify(assetKeys)}) {
      let data;
      try { data = sea.getAsset(key); } catch { continue; }
      const destPath = path.join(seaRoot, key);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, Buffer.from(data));
    }
    fs.writeFileSync(markerPath, SOLO_SEA_VERSION);
  }

  bundleFileUrl = url.pathToFileURL(path.join(seaRoot, 'solo-src-bundle.cjs')).href;
} else {
  // Not running as SEA (e.g. development test of the built artefacts).
  bundleFileUrl = url.pathToFileURL(path.join(__dirname, 'solo-src-bundle.cjs')).href;
}

// import() uses the regular module loader and can access the filesystem — unlike require()
// in SEA mode which is restricted to built-ins. Importing a .cjs file returns its
// module.exports as the default export.
import(bundleFileUrl).then(function (mod) {
  const soloModule = mod.default || mod;

  // Run the solo CLI. async IIFE keeps this CJS-compatible (no top-level await).
  void (async function () {
    const context = { logger: undefined };

    await soloModule.main(process.argv, context).catch(function (error) {
      // SilentBreak / UserBreak are solo's clean-exit signals (--help, --version, user ^C).
      // The DI ErrorHandler swallows them; replicate that here so the exit code stays 0.
      const name = (error && (error.name || (error.constructor && error.constructor.name))) || '';
      if (name === 'SilentBreak' || name === 'UserBreak') return;
      process.exitCode = 1;
      console.error(error);
    });

    if (context.logger && typeof context.logger.flush === 'function') {
      context.logger.flush(function () { process.exit(process.exitCode ?? 0); });
    } else {
      process.exit(process.exitCode ?? 0);
    }
  }());
}).catch(function (error) {
  process.exitCode = 1;
  console.error(error);
});
`;
writeFileSync(seaMainPath, seaMainContent);

// Step 4: write sea-config.json and generate the SEA blob from sea-main.cjs.
const seaConfig: Record<string, unknown> = {
  main: seaMainPath,
  output: blobPath,
  assets: seaAssets,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: true,
};
writeFileSync(configPath, JSON.stringify(seaConfig, undefined, 2));

run(`node --experimental-sea-config ${quotePath(configPath)}`, 'Generating SEA blob');

copyFileSync(process.execPath, binaryPath);
console.log(`\n▶ Copied node binary → ${binaryName}`);

if (platform === 'darwin') {
  run(`codesign --remove-signature ${quotePath(binaryPath)}`, 'Removing existing macOS signature');
}

const machoFlag: string = platform === 'darwin' ? '--macho-segment-name NODE_SEA' : '';
run(
  `npx postject ${quotePath(binaryPath)} NODE_SEA_BLOB ${quotePath(blobPath)} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ${machoFlag}`,
  'Injecting SEA blob via postject',
);

if (platform === 'darwin') {
  run(`codesign --sign - ${quotePath(binaryPath)}`, 'Re-signing for macOS (ad-hoc)');
}

console.log(`\n✓ Solo SEA binary ready: sea/dist/${binaryName}\n`);
