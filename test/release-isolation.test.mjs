// SPDX-License-Identifier: Apache-2.0

// Install the release workflow's toolchain in a temporary directory, then run the tests:
// npm install --prefix <directory> --ignore-scripts --no-audit --no-fund \
//   semantic-release@25.0.2 conventional-changelog-conventionalcommits@9.1.0
// SOLO_RELEASE_TEST_TOOLS=<directory> node --test test/release-isolation.test.mjs

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {createRequire} from 'node:module';
import {devNull, tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const toolchain = process.env.SOLO_RELEASE_TEST_TOOLS;
assert.ok(toolchain, 'Set SOLO_RELEASE_TEST_TOOLS to the temporary release-toolchain installation directory.');
const toolchainRequire = createRequire(path.join(path.resolve(toolchain), 'package.json'));
const releaseRequire = createRequire(toolchainRequire.resolve('semantic-release'));
const {analyzeCommits} = await import(pathToFileURL(releaseRequire.resolve('@semantic-release/commit-analyzer')));
const configuration = JSON.parse(readFileSync(path.join(root, '.releaserc'), 'utf8'));
const analyzerOptions = configuration.plugins.find(plugin => plugin[0] === '@semantic-release/commit-analyzer')[1];
const skill = readFileSync(path.join(root, '.claude/skills/solo-prepare-release/SKILL.md'), 'utf8');
const rootManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

for (const [name, messages, expected] of [
  ['TCK feature', ['feat(tck): add an SDK lane'], 'minor'],
  ['TCK fix', ['fix(tck): collect diagnostics'], 'patch'],
  ['TCK breaking header', ['fix(tck)!: change the caller inputs'], 'minor'],
  ['TCK breaking footer', ['fix(tck): change the result\n\nBREAKING CHANGE: new result schema'], 'minor'],
  ['TCK indented breaking footer', ['fix(tck): change\n\n  BREAKING CHANGE: new output'], 'minor'],
  ['Solo feature', ['feat: add a command'], 'minor'],
  ['Solo fix', ['fix: repair a command'], 'patch'],
  ['Solo performance change', ['perf(cli): speed up a command'], 'patch'],
  ['Solo documentation', ['docs: explain a command'], null],
  ['unscoped Solo breaking header', ['fix!: change the CLI'], 'minor'],
  ['unscoped Solo breaking footer', ['fix: change output\n\nBREAKING CHANGE: new output'], 'minor'],
  ['Solo breaking header', ['fix(cli)!: change the CLI'], 'minor'],
  ['Solo breaking footer', ['fix(cli): change output\n\nBREAKING CHANGE: new output'], 'minor'],
  ['distinct scope', ['feat(tck-tools): change Solo tooling'], 'minor'],
  ['TCK feature plus Solo fix', ['feat(tck): add a lane', 'fix(cli): repair a command'], 'minor'],
  ['TCK breaking header plus Solo fix', ['fix(tck)!: change inputs', 'fix(cli): repair a command'], 'minor'],
  [
    'TCK breaking footer plus Solo fix',
    ['fix(tck): change the result\n\nBREAKING CHANGE: new result schema', 'fix(cli): repair a command'],
    'minor',
  ],
  ['TCK fix plus Solo fix', ['fix(tck): repair a probe', 'fix(cli): repair a command'], 'patch'],
  ['TCK change plus Solo feature', ['fix(tck): repair a probe', 'feat(cli): add a command'], 'minor'],
]) {
  test(`semantic-release: ${name}`, async () => {
    const actual = await analyzeCommits(analyzerOptions, {
      cwd: toolchain,
      commits: messages.map((message, index) => ({message, hash: String(index)})),
      logger: {log() {}},
    });
    assert.equal(actual, expected);
  });
}

function fixture(context) {
  const directory = mkdtempSync(path.join(tmpdir(), 'solo-release-isolation-'));
  context.after(() => rmSync(directory, {recursive: true, force: true}));
  return directory;
}

function run(command, arguments_, cwd) {
  return execFileSync(command, arguments_, {
    cwd,
    shell: false,
    stdio: 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Release Isolation Test',
      GIT_AUTHOR_EMAIL: 'release-test@example.com',
      GIT_COMMITTER_NAME: 'Release Isolation Test',
      GIT_COMMITTER_EMAIL: 'release-test@example.com',
      npm_config_cache: path.join(cwd, '.npm-cache'),
      npm_config_offline: 'true',
      npm_config_update_notifier: 'false',
    },
  });
}

function git(cwd, ...arguments_) {
  return run(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'init.defaultBranch=main', ...arguments_],
    cwd,
  );
}

function history(context, messages) {
  const directory = fixture(context);
  git(directory, 'init', '--quiet');
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({name: 'solo-release-test', version: '0.93.0'}));
  git(directory, 'add', 'package.json');
  git(directory, 'commit', '--quiet', '-m', 'chore: initial release');
  git(directory, 'tag', '-a', 'v0.93.0', '-m', 'Solo release');
  for (const message of messages) git(directory, 'commit', '--quiet', '--allow-empty', '-m', message);
  git(directory, 'tag', '-a', 'tck-v9.0.0', '-m', 'Newer kit release');
  return directory;
}

test('every release-skill tag lookup ignores a newer annotated TCK tag', context => {
  const directory = history(context, ['feat(tck): add a lane']);
  const lookups = skill.match(/git describe[^`)\n]+/g);
  assert.ok(lookups.length >= 3);
  for (const lookup of lookups)
    assert.equal(run('bash', ['-eu', '-o', 'pipefail', '-c', lookup], directory).trim(), 'v0.93.0');
});

for (const [name, messages, expected] of [
  ['empty history', [], null],
  ['TCK-only features', ['feat(tck): add a lane'], '0.94.0'],
  ['TCK-only fixes', ['fix(tck): repair a probe'], '0.93.1'],
  ['TCK-only breaking headers', ['fix(tck)!: change inputs'], '0.94.0'],
  ['TCK-only breaking footers', ['fix(tck): change inputs\n\nBREAKING CHANGE: new caller inputs'], '0.94.0'],
  ['TCK-only indented breaking footers', ['fix(tck): change\n\n  BREAKING CHANGE: new output'], '0.94.0'],
  ['TCK features and a Solo fix', ['feat(tck): add a lane', 'fix(cli): repair a command'], '0.94.0'],
  ['TCK breaking headers and a Solo fix', ['fix(tck)!: change inputs', 'fix(cli): repair a command'], '0.94.0'],
  [
    'TCK breaking footers and a Solo fix',
    ['fix(tck): change inputs\n\nBREAKING CHANGE: new caller inputs', 'fix(cli): repair a command'],
    '0.94.0',
  ],
  ['TCK fixes and a Solo fix', ['fix(tck): repair a probe', 'fix(cli): repair a command'], '0.93.1'],
  ['a Solo feature before the TCK tag', ['feat(cli): add a command', 'fix(tck): repair a probe'], '0.94.0'],
  ['a Solo fix', ['fix(cli): repair a command'], '0.93.1'],
  ['a Solo breaking header', ['fix(cli)!: change inputs'], '0.94.0'],
  ['a Solo breaking footer', ['fix(cli): change inputs\n\nBREAKING CHANGE: new caller inputs'], '0.94.0'],
  ['a distinct scope', ['feat(tck-tools): change Solo tooling'], '0.94.0'],
]) {
  test(`release-skill calculation: ${name}`, context => {
    const directory = history(context, messages);
    const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(match => match[1]);
    const setup = blocks.find(block => block.startsWith('LAST_TAG='));
    const calculation = blocks.find(block => block.startsWith('CUR='));
    assert.ok(setup && calculation, 'Run the actual tag lookup and version calculation from the skill.');
    const output = run('bash', ['-eu', '-o', 'pipefail', '-c', `${setup}\n${calculation}`], directory);
    if (expected === null) {
      assert.ok(output.includes('No commits since v0.93.0; nothing to prepare.'), output);
      assert.ok(!output.includes('Next version:'), output);
      return;
    }
    assert.ok(
      output.includes(`Next version: ${expected}`),
      `Expected next version ${expected}; skill output:\n${output}`,
    );
  });
}

function versionFixture(context, packages) {
  const directory = fixture(context);
  for (const folder of packages) {
    const project = path.join(directory, folder);
    mkdirSync(project, {recursive: true});
    const manifest = {
      name: folder === '.' ? 'solo-release-test' : 'solo-tck-release-test',
      version: folder === '.' ? '0.93.0' : '0.92.0',
      license: 'Apache-2.0',
      dependencies: {'fixture-probe': '1.2.3'},
    };
    writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({
        ...manifest,
        ...(folder === '.' && rootManifest.scripts.version ? {scripts: {version: rootManifest.scripts.version}} : {}),
      }),
    );
    writeFileSync(
      path.join(project, 'package-lock.json'),
      JSON.stringify({
        name: manifest.name,
        version: manifest.version,
        lockfileVersion: 3,
        requires: true,
        packages: {'': manifest, 'node_modules/fixture-probe': {version: '1.2.3', integrity: 'fixture-integrity'}},
      }),
    );
  }
  if (rootManifest.scripts.version) {
    mkdirSync(path.join(directory, 'scripts'));
    copyFileSync(path.join(root, 'scripts/sync-tck-version.mjs'), path.join(directory, 'scripts/sync-tck-version.mjs'));
  }
  if (packages.includes('tck')) {
    writeFileSync(
      path.join(directory, 'tck/solo-versions.json'),
      JSON.stringify({default: '0.91.0', supported: ['0.91.0', '0.93.0']}),
    );
  }
  assert.ok(!existsSync(path.join(directory, 'node_modules')), 'Exercise the version hook before npm ci.');
  return directory;
}

function prepare(directory, nextVersion) {
  const prepareCommand = configuration.plugins.find(plugin => plugin[0] === '@semantic-release/exec')[1].prepareCmd;
  return run('sh', ['-c', prepareCommand.replaceAll('${nextRelease.version}', nextVersion)], directory);
}

for (const [name, packages, nextVersion] of [
  ['without a TCK directory', ['.'], '0.94.0'],
  ['with a TCK directory', ['.', 'tck'], '0.94.0'],
  ['with a TCK directory and prerelease', ['.', 'tck'], '0.94.0-rc.1'],
]) {
  test(`semantic-release prepare synchronizes package and lock versions ${name}`, context => {
    const directory = versionFixture(context, packages);
    prepare(directory, nextVersion);

    const versions = Object.fromEntries(
      packages.map(folder => {
        const manifest = JSON.parse(readFileSync(path.join(directory, folder, 'package.json'), 'utf8'));
        const lock = JSON.parse(readFileSync(path.join(directory, folder, 'package-lock.json'), 'utf8'));
        assert.deepEqual(manifest.dependencies, {'fixture-probe': '1.2.3'});
        assert.deepEqual(lock.packages[''].dependencies, {'fixture-probe': '1.2.3'});
        assert.deepEqual(lock.packages['node_modules/fixture-probe'], {
          version: '1.2.3',
          integrity: 'fixture-integrity',
        });
        assert.equal(manifest.license, 'Apache-2.0');
        assert.equal(lock.packages[''].license, 'Apache-2.0');
        return [folder, {package: manifest.version, lock: lock.version, lockPackage: lock.packages[''].version}];
      }),
    );
    assert.deepEqual(
      versions,
      Object.fromEntries(
        packages.map(folder => [folder, {package: nextVersion, lock: nextVersion, lockPackage: nextVersion}]),
      ),
    );
    if (packages.includes('tck')) {
      assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'tck/solo-versions.json'), 'utf8')), {
        default: '0.91.0',
        supported: ['0.91.0', '0.93.0'],
      });
    }
    assert.ok(!existsSync(path.join(directory, 'node_modules')));
  });
}

test('semantic-release prepare allows a TCK manifest without a lockfile', context => {
  const directory = versionFixture(context, ['.', 'tck']);
  rmSync(path.join(directory, 'tck/package-lock.json'));
  prepare(directory, '0.94.0');
  assert.equal(JSON.parse(readFileSync(path.join(directory, 'tck/package.json'), 'utf8')).version, '0.94.0');
  assert.ok(!existsSync(path.join(directory, 'tck/package-lock.json')));
});

for (const file of ['tck/package.json', 'tck/package-lock.json']) {
  test(`semantic-release prepare fails visibly for invalid JSON in ${file}`, context => {
    const directory = versionFixture(context, ['.', 'tck']);
    writeFileSync(path.join(directory, file), 'invalid JSON\n');
    assert.throws(
      () => prepare(directory, '0.94.0'),
      error => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /SyntaxError|JSON/);
        return true;
      },
    );
  });
}

test('npm version --allow-same-version synchronizes the kit through the real lifecycle hook', context => {
  const directory = versionFixture(context, ['.', 'tck']);
  run('npm', ['version', '0.93.0', '--no-git-tag-version', '--allow-same-version'], directory);
  const manifest = JSON.parse(readFileSync(path.join(directory, 'tck/package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(directory, 'tck/package-lock.json'), 'utf8'));
  assert.deepEqual([manifest.version, lock.version, lock.packages[''].version], ['0.93.0', '0.93.0', '0.93.0']);
});

test('npm version does not overwrite a TCK lockfile replaced after reading', context => {
  const directory = versionFixture(context, ['.', 'tck']);
  const lockPath = path.join(directory, 'tck/package-lock.json');
  const originalPath = path.join(directory, 'tck/package-lock.original.json');
  const preloaderPath = path.join(directory, 'replace-lockfile.mjs');
  const replacement = '{"version":"replacement","untouched":true}\n';
  const originalLock = JSON.parse(readFileSync(lockPath, 'utf8'));
  originalLock.version = `0.92.0-${'old'.repeat(256)}`;
  writeFileSync(lockPath, JSON.stringify(originalLock));
  chmodSync(lockPath, 0o640);
  const before = statSync(lockPath);
  writeFileSync(
    preloaderPath,
    `// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';

const lockPath = new URL('./tck/package-lock.json', import.meta.url);
const originalPath = new URL('./tck/package-lock.original.json', import.meta.url);
const {readFileSync, renameSync, writeFileSync, statSync, fstatSync} = fs;
const original = statSync(lockPath);
let replaced = false;
fs.readFileSync = (file, ...arguments_) => {
  const contents = readFileSync(file, ...arguments_);
  const metadata = typeof file === 'number' ? fstatSync(file) : statSync(file);
  if (!replaced && metadata.dev === original.dev && metadata.ino === original.ino) {
    replaced = true;
    renameSync(lockPath, originalPath);
    writeFileSync(lockPath, ${JSON.stringify(replacement)});
  }
  return contents;
};
syncBuiltinESMExports();
`,
  );

  run(
    'npm',
    ['version', '0.94.0', '--no-git-tag-version', `--node-options=--import=${pathToFileURL(preloaderPath).href}`],
    directory,
  );

  assert.equal(readFileSync(lockPath, 'utf8'), replacement, 'The replacement lockfile must remain untouched.');
  const lock = JSON.parse(readFileSync(originalPath, 'utf8'));
  assert.deepEqual([lock.version, lock.packages[''].version], ['0.94.0', '0.94.0']);
  const after = statSync(originalPath);
  assert.deepEqual([after.uid, after.gid, after.mode], [before.uid, before.gid, before.mode]);
});

for (const [name, files] of [
  ['retain the default root assets', ['CHANGELOG.md', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json']],
  ['include both TCK manifests', ['tck/package.json', 'tck/package-lock.json']],
]) {
  test(`semantic-release git assets ${name}`, () => {
    const gitOptions = configuration.plugins.find(plugin => plugin[0] === '@semantic-release/git')[1];
    const assets = gitOptions.assets ?? ['CHANGELOG.md', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json'];
    assert.deepEqual(
      files.filter(file => assets.some(pattern => path.matchesGlob(file, pattern))),
      files,
    );
  });
}

test('npm pack excludes the kit and retains Solo CLI and resources', context => {
  const directory = fixture(context);
  const project = path.join(directory, 'package');
  for (const folder of ['dist', 'resources', 'tck/lib', 'tck/specs', 'tck/node_modules/example']) {
    mkdirSync(path.join(project, folder), {recursive: true});
  }
  copyFileSync(path.join(root, '.npmignore'), path.join(project, '.npmignore'));
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  // This fixture tests tarball contents without the source tree needed by lifecycle scripts.
  delete manifest.scripts;
  writeFileSync(path.join(project, 'package.json'), JSON.stringify(manifest));
  for (const file of [
    'dist/solo.js',
    'resources/solo.yaml',
    'tck/action.yml',
    'tck/lib/run.js',
    'tck/specs/js-sdk.md',
    'tck/node_modules/example/index.js',
  ]) {
    writeFileSync(path.join(project, file), 'release isolation fixture\n');
  }
  writeFileSync(path.join(project, 'tck/.npmignore'), '!action.yml\n');
  const [packed] = JSON.parse(
    run(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        directory,
        '--cache',
        path.join(directory, 'npm-cache'),
      ],
      project,
    ),
  );
  const files = packed.files.map(file => file.path);
  assert.ok(
    !files.some(file => file.startsWith('tck/')),
    `Kit leaked into the tarball: ${files.filter(file => file.startsWith('tck/'))}`,
  );
  for (const file of ['package.json', 'dist/solo.js', 'resources/solo.yaml']) assert.ok(files.includes(file), file);
});
