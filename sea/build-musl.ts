// SPDX-License-Identifier: Apache-2.0

/**
 * Builds the musl Solo SEA binary, sea/dist/solo-linux-<arch>-musl, for the Docker host's architecture
 * (x64 or arm64), then smoke tests it in a bare Alpine container that adds only libstdc++.
 *
 * sea/build.ts packages the Node.js that runs it, so it must run on a musl Node.js. This script runs
 * `npm ci`, `tsc` and sea/build.ts inside Alpine, with the Node.js musl build of
 * unofficial-builds.nodejs.org for the same major version as the Node.js running this script. Alpine's
 * own nodejs package links about 17 shared libraries, so a binary built from it would not run on a
 * bare Alpine. The unofficial builds are not signed, so each tarball is pinned to an exact version
 * and SHA-256 below. node_modules stays inside the container, so a local checkout keeps its own.
 *
 * Uses only Node.js built-ins, so it runs without `npm ci` on the host.
 *
 * Run with: node sea/build-musl.ts [version]
 *   version  Version to embed in the binary, for example 0.92.0 (default: the package.json version)
 */

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ALPINE_IMAGE: string = 'alpine:3.21.9';
const NODE_DOWNLOAD_URL: string = 'https://unofficial-builds.nodejs.org/download/release';

// Docker reports Go architecture names; Node.js names them x64 and arm64.
const DOCKER_ARCHITECTURES: Record<string, string> = {amd64: 'x64', arm64: 'arm64'};

// SHA-256 of each pinned tarball, from the release's SHASUMS256.txt.
const PINNED_NODE_BUILDS: Record<string, {version: string; sha256: Record<string, string>}> = {
  '22': {
    version: 'v22.23.3',
    sha256: {
      x64: '9b177f0c140a82a3d247e8f54586a65dbdf91e5e3a01f04708dabfdc9e0e01c4',
      arm64: '5464aed53fda1c1fe69941e9715fee74b20503b22b30a56b2efc6b776ead5451',
    },
  },
  '24': {
    version: 'v24.22.0',
    sha256: {
      x64: '46e83f456c80205b3f4805fccb542ca3dfc5a6c28d53fc459a4e70376e503024',
      arm64: '2819e68e3d70a0cfafcc0ae59eda179d02c1c8920da420d472721ec67787fa5d',
    },
  },
};

// Runs in the build container. Files the build writes are handed back to the caller, so a runner can
// clean its workspace without root.
const BUILD_SCRIPT: string = `
  trap 'chown -R "\${OWNER}" dist sea/dist package.json package-lock.json 2>/dev/null || true' EXIT
  apk add --no-cache libstdc++ >/dev/null
  npm ci --no-audit --no-fund
  if [ -n "\${SOLO_VERSION}" ]; then
    npm version "\${SOLO_VERSION}" --no-git-tag-version --allow-same-version
  fi
  npx tsc
  npx tsx sea/build.ts
`;

// Runs in a bare Alpine with only libstdc++ added (it brings libgcc), the one package a user installs.
const SMOKE_TEST_SCRIPT: string = `
  apk add --no-cache libstdc++ >/dev/null
  "\${BINARY}" --help >/dev/null
  echo "✓ --help exited 0"
  actual_version="$("\${BINARY}" --version)"
  echo "\${actual_version}" | grep -qF "\${EXPECTED_VERSION}" ||
    { echo "version mismatch: expected \${EXPECTED_VERSION}, got: \${actual_version}" >&2 && exit 1; }
  echo "✓ --version reports \${EXPECTED_VERSION}"
  # The embedded persist port-forward worker prints its usage and exits 2 when given no arguments.
  exit_code=0
  "\${BINARY}" --internal-persist-port-forward >/dev/null 2>&1 || exit_code=$?
  [ "\${exit_code}" -eq 2 ] || { echo "embedded persist-port-forward worker failed to start (exit \${exit_code})" >&2 && exit 1; }
  echo "✓ Embedded persist-port-forward worker starts"
`;

const ROOT: string = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const soloVersion: string = process.argv[2] ?? '';

function run(command: string, commandArguments: string[], label: string): void {
  console.log(`\n▶ ${label}`);
  execFileSync(command, commandArguments, {stdio: 'inherit'});
}

const dockerArchitecture: string = execFileSync('docker', ['version', '--format', '{{.Server.Arch}}'], {
  encoding: 'utf8',
}).trim();
const architecture: string | undefined = DOCKER_ARCHITECTURES[dockerArchitecture];
if (!architecture) {
  throw new Error(`unsupported Docker host architecture: ${dockerArchitecture}`);
}

const nodeMajor: string = process.versions.node.split('.', 1)[0];
const nodeBuild: {version: string; sha256: Record<string, string>} | undefined = PINNED_NODE_BUILDS[nodeMajor];
if (!nodeBuild) {
  throw new Error(
    `no pinned Node.js musl build for Node.js ${nodeMajor} (pinned: ${Object.keys(PINNED_NODE_BUILDS).join(', ')})`,
  );
}

const binaryName: string = `solo-linux-${architecture}-musl`;
const nodeTarball: string = `node-${nodeBuild.version}-linux-${architecture}-musl.tar.xz`;

// Under RUNNER_TEMP on a runner: a Docker daemon in a sidecar shares the runner's work directory, not /tmp.
const workDirectory: string = mkdtempSync(path.join(process.env.RUNNER_TEMP ?? tmpdir(), 'solo-musl-node-'));
try {
  console.log(`\n▶ Downloading ${nodeTarball}`);
  const response: Response = await fetch(`${NODE_DOWNLOAD_URL}/${nodeBuild.version}/${nodeTarball}`);
  if (!response.ok) {
    throw new Error(`could not download ${nodeTarball}: HTTP ${response.status}`);
  }
  const tarball: Buffer = Buffer.from(await response.arrayBuffer());
  const actualSha256: string = createHash('sha256').update(tarball).digest('hex');
  if (actualSha256 !== nodeBuild.sha256[architecture]) {
    throw new Error(
      `checksum mismatch for ${nodeTarball}: expected ${nodeBuild.sha256[architecture]}, got ${actualSha256}`,
    );
  }
  const tarballPath: string = path.join(workDirectory, nodeTarball);
  const nodeDirectory: string = path.join(workDirectory, 'node');
  writeFileSync(tarballPath, tarball);
  mkdirSync(nodeDirectory);
  execFileSync('tar', ['-xJf', tarballPath, '-C', nodeDirectory, '--strip-components', '1']);

  // The anonymous node_modules volume keeps the musl install out of the checkout.
  run(
    'docker',
    [
      'run',
      '--rm',
      '--volume',
      `${ROOT}:/workspace`,
      '--volume',
      '/workspace/node_modules',
      '--volume',
      `${nodeDirectory}:/opt/node:ro`,
      '--workdir',
      '/workspace',
      '--env',
      'PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      '--env',
      `SOLO_VERSION=${soloVersion}`,
      '--env',
      `OWNER=${process.getuid()}:${process.getgid()}`,
      ALPINE_IMAGE,
      'sh',
      '-euc',
      BUILD_SCRIPT,
    ],
    `Building ${binaryName} with Node.js ${nodeBuild.version} in ${ALPINE_IMAGE}`,
  );
} finally {
  rmSync(workDirectory, {recursive: true, force: true});
}

if (!existsSync(path.join(ROOT, 'sea', 'dist', binaryName))) {
  throw new Error(`sea/build.ts did not produce sea/dist/${binaryName}`);
}

const expectedVersion: string = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
run(
  'docker',
  [
    'run',
    '--rm',
    '--volume',
    `${path.join(ROOT, 'sea', 'dist')}:/dist:ro`,
    '--env',
    `BINARY=/dist/${binaryName}`,
    '--env',
    `EXPECTED_VERSION=${expectedVersion}`,
    ALPINE_IMAGE,
    'sh',
    '-euc',
    SMOKE_TEST_SCRIPT,
  ],
  `Smoke testing ${binaryName} in a bare ${ALPINE_IMAGE} with libstdc++`,
);

console.log(`\n✓ Solo musl SEA binary ready: sea/dist/${binaryName}\n`);
