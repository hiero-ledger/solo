// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Release} from '../src/release.mjs';

const commit = 'c'.repeat(40);
const readme = `# Solo

### Current Releases

| Solo Version | Node.js             | Consensus Node | Kubernetes | Docker Resources               | Release Date | End of Support |
|--------------|---------------------|----------------|------------|--------------------------------|--------------|----------------|
| 0.99.0       | >= 22.0.0 (lts/jod) | v0.78.1        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-11-24   | 2026-12-24     |
| 0.98.0 (LTS) | >= 22.0.0 (lts/jod) | v0.78.1        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-11-17   | 2027-02-17     |
| 0.95.0       | >= 22.0.0 (lts/jod) | v0.78.1        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-10-27   | 2026-11-27     |

To see a list of legacy releases, please check the legacy versions page.

## Next section

| 0.10.0 | not a release row | 2099-01-01 |
`;

function lane(solo, outcome = 'pass') {
  return {
    outcome,
    reason: outcome === 'pass' ? '' : 'unknown',
    error: outcome === 'pass' ? undefined : 'deploy failed',
    soloSource: solo === 'release' ? {kind: 'local-tarball', sourceSha: commit} : {kind: 'release', version: solo},
  };
}

test('versions order numerically, and a prerelease sorts before its release', () => {
  const sorted = ['0.9.0', '0.100.0', '0.100.0-alpha.1', '0.99.1', '1.0.0'].toSorted(Release.compare);
  assert.deepEqual(sorted, ['0.9.0', '0.99.1', '0.100.0-alpha.1', '0.100.0', '1.0.0']);
});

test('the support window is the README Current Releases rows still in support', () => {
  assert.deepEqual([...Release.window(readme, '2026-11-27')], ['0.99.0', '0.98.0', '0.95.0']);
  assert.deepEqual([...Release.window(readme, '2026-11-28')], ['0.99.0', '0.98.0']);
  assert.throws(() => Release.window('# Solo\n', '2026-11-28'), /no Current Releases table/);
});

test('the plan verifies the release being cut and every supported release still in the window', () => {
  const plan = Release.plan(
    {default: '0.99.0', supported: ['0.99.0', '0.95.0', '0.90.0']},
    {version: '0.100.0', commit, readme, today: '2026-11-28'},
  );
  // 0.95.0 left support yesterday and 0.90.0 is not listed: neither is verified, so neither stays supported.
  assert.deepEqual(plan, {
    version: '0.100.0',
    commit,
    entries: [
      {solo: '0.100.0', source: 'release'},
      {solo: '0.99.0', source: 'npm'},
    ],
  });
});

test('a release never admits a Solo release it did not verify, and a prerelease admits nothing new', () => {
  // 0.98.0 is in the window but was never supported: becoming supported needs its own verified release.
  const first = Release.plan({default: null, supported: []}, {version: '0.100.0', commit, readme, today: '2026-11-28'});
  assert.deepEqual(first.entries, [{solo: '0.100.0', source: 'release'}]);
  const prerelease = Release.plan(
    {default: '0.99.0', supported: ['0.99.0']},
    {version: '0.100.0-alpha.1', commit, readme, today: '2026-11-28'},
  );
  assert.deepEqual(prerelease.entries, [{solo: '0.99.0', source: 'npm'}]);
  for (const [version, sha] of [
    ['main', commit],
    ['0.100.0', 'abc123'],
  ]) {
    assert.throws(() => Release.plan({supported: []}, {version, commit: sha, readme, today: '2026-11-28'}));
  }
});

test('admission writes the verified list with the newest release as default', () => {
  const plan = {
    version: '0.100.0',
    commit,
    entries: [
      {solo: '0.100.0', source: 'release'},
      {solo: '0.99.0', source: 'npm'},
    ],
  };
  assert.deepEqual(Release.admit(plan, [lane('0.99.0'), lane('release')]), {
    default: '0.100.0',
    supported: ['0.100.0', '0.99.0'],
  });
  assert.deepEqual(Release.admit({version: '0.100.0-alpha.1', commit, entries: []}, []), {
    default: null,
    supported: [],
  });
});

test('any failed, missing or ambiguous lane result blocks the release', () => {
  const plan = {
    version: '0.100.0',
    commit,
    entries: [
      {solo: '0.100.0', source: 'release'},
      {solo: '0.99.0', source: 'npm'},
    ],
  };
  assert.throws(
    () => Release.admit(plan, [lane('0.99.0', 'fail'), lane('release')]),
    /Solo 0\.99\.0: unknown: deploy failed/,
  );
  assert.throws(() => Release.admit(plan, [lane('release')]), /Solo 0\.99\.0: expected one lane result, found 0/);
  assert.throws(
    () => Release.admit(plan, [lane('0.99.0'), lane('release'), lane('release')]),
    /Solo 0\.100\.0: expected one lane result, found 2/,
  );
  // A tarball run of a different commit does not verify this one.
  const other = {...lane('release'), soloSource: {kind: 'local-tarball', sourceSha: 'd'.repeat(40)}};
  assert.throws(() => Release.admit(plan, [lane('0.99.0'), other]), /blocked/);
});

test('the Solo npm package listing must not hold the kit', () => {
  assert.deepEqual(Release.kitFiles(['package.json', 'dist/solo.js', 'tck-notes.md']), []);
  assert.deepEqual(Release.kitFiles(['package.json', 'tck/action.yml', 'tck']), ['tck/action.yml', 'tck']);
  assert.throws(() => Release.kitFiles([]), /no package\.json/);
});

const verified = {default: '0.100.0', supported: ['0.100.0', '0.99.0']};
const releaseFiles = ['CHANGELOG.md', 'package.json', 'tck/package.json', 'tck/solo-versions.json'];

function published(overrides = {}) {
  return {
    tagCommit: 'e'.repeat(40),
    changedFiles: ['CHANGELOG.md', 'package.json', 'tck/package.json', 'tck/solo-versions.json'],
    policy: structuredClone(verified),
    kitVersion: '0.100.0',
    action: true,
    assets: ['install.sh', 'SHA256SUMS', 'solo-linux-x64', 'docs-latest.tar.gz'],
    latest: 'v0.100.0',
    body: `## Changes\n\n${Release.notes(verified, verified, {version: '0.100.0', tagCommit: 'e'.repeat(40)})}\n`,
    ...overrides,
  };
}

test('readback accepts a release that publishes exactly what was verified', () => {
  Release.readback({version: '0.100.0', policy: verified, branch: 'main', releaseFiles}, published());
  // A maintenance or prerelease line leaves releases/latest alone.
  Release.readback(
    {version: '0.95.3', policy: verified, branch: 'release/0.95', releaseFiles},
    published({kitVersion: '0.95.3', latest: 'v0.100.0'}),
  );
});

test('readback reports every way the published release differs from the verified one', () => {
  assert.throws(
    () =>
      Release.readback(
        {version: '0.100.0', policy: verified, branch: 'main', releaseFiles},
        published({
          changedFiles: ['package.json', 'src/index.ts'],
          policy: {default: '0.99.0', supported: ['0.99.0']},
          kitVersion: '0.99.0',
          action: false,
          assets: ['docs-latest.tar.gz'],
          latest: 'v0.99.0',
          body: '## Changes\n',
        }),
      ),
    error => {
      for (const problem of [
        /not verified: src\/index\.ts/,
        /tck\/solo-versions\.json at the tag/,
        /version 0\.99\.0, not 0\.100\.0/,
        /does not serve tck\/action\.yml/,
        /missing Solo assets: install\.sh, SHA256SUMS, solo-linux-x64/,
        /releases\/latest is v0\.99\.0/,
        /release notes of v0\.100\.0 have no Solo TCK section/,
      ]) {
        assert.match(error.message, problem);
      }
      return true;
    },
  );
  assert.throws(
    () =>
      Release.readback(
        {version: '0.100.0', policy: verified, branch: 'main', releaseFiles},
        published({tagCommit: undefined}),
      ),
    /Tag v0\.100\.0 does not exist/,
  );
});

test('release notes state what the release commit changed in the supported list', () => {
  const tagCommit = 'e'.repeat(40);
  const changed = Release.notes(
    {default: '0.99.0', supported: ['0.99.0', '0.95.0']},
    {default: '0.100.0', supported: ['0.100.0', '0.99.0']},
    {version: '0.100.0', tagCommit},
  );
  assert.match(changed, /Supported Solo releases: 0\.100\.0, 0\.99\.0 \(added 0\.100\.0; removed 0\.95\.0\)\./);
  assert.match(changed, /Default Solo release: 0\.100\.0 \(was 0\.99\.0\)\./);
  assert.match(changed, new RegExp(String.raw`uses: hiero-ledger/solo/tck@${tagCommit} # v0\.100\.0`));
  const first = Release.notes(
    {default: null, supported: []},
    {default: '0.100.0', supported: ['0.100.0']},
    {
      version: '0.100.0',
      tagCommit,
    },
  );
  assert.match(first, /\(added 0\.100\.0\)\.\nDefault Solo release: 0\.100\.0 \(was none\)\./);
  const prerelease = Release.notes(verified, verified, {version: '0.101.0-alpha.1', tagCommit});
  assert.match(prerelease, /\(unchanged\)\.\nDefault Solo release: 0\.100\.0 \(unchanged\)\./);
  const none = Release.notes(
    {default: null, supported: []},
    {default: null, supported: []},
    {version: '0.100.0', tagCommit},
  );
  assert.match(none, /No Solo release is supported yet/);
  assert.doesNotMatch(none, /Default Solo release/);
});

test('a re-run replaces the Solo TCK section of the release notes instead of adding another', () => {
  const section = version => Release.notes(verified, verified, {version, tagCommit: 'e'.repeat(40)});
  const once = Release.withNotes('## Features\n\n* a feature\n', section('0.100.0'));
  assert.equal(once, `## Features\n\n* a feature\n\n${section('0.100.0')}\n`);
  const twice = Release.withNotes(once, section('0.100.0'));
  assert.equal(twice, once);
  // Notes a person prepended later survive, and so does anything after the section.
  const edited = `Overview\n\n${once}Trailer\n`;
  const replaced = Release.withNotes(edited, section('0.100.0'));
  assert.equal(replaced.split(Release.NOTES[0]).length, 2);
  assert.ok(replaced.startsWith('Overview') && replaced.includes('Trailer'));
});

test('readback allows exactly the files the release commit carries', () => {
  const releaserc = JSON.parse(readFileSync(new URL('../../.releaserc', import.meta.url), 'utf8'));
  const assets = releaserc.plugins.find(plugin => plugin[0] === '@semantic-release/git')[1].assets;
  // The verified supported list is only published if the release commit carries it.
  assert.ok(assets.includes('tck/solo-versions.json'));
  assert.ok(assets.includes('tck/package.json'));
});

test('negative controls run the real lane and match their expected exit code and reason', () => {
  const results = Release.controls('/no-candidate-needed-before-the-version-check');
  assert.deepEqual(
    results.map(result => ({name: result.name, passed: result.passed, observed: result.observed})),
    [{name: 'An unsupported Solo version', passed: true, observed: {exit: 2, reason: 'invalid'}}],
  );
});
