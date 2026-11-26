// SPDX-License-Identifier: Apache-2.0

// Release verification for the kit Solo co-releases (design §6.3, §6.4). The Solo release workflow runs these steps;
// any failure blocks the release, so a published kit ref and its supported list are always the ones verified.
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual, parseArgs} from 'node:util';
import {Processes} from './process.mjs';

const kit = fileURLToPath(new URL('..', import.meta.url));
const repository = path.dirname(kit);
const VERSION = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/;

export class Release {
  // Negative controls for the implemented lanes (§6.4 step 3). The remaining rows arrive with the MN lane and the
  // branch-companion manifest, which they exercise.
  static CONTROLS = [
    {name: 'An unsupported Solo version', arguments: ['--solo-version', '0.0.0'], exit: 2, reason: 'invalid'},
  ];

  // A failed linux-x64 binary already fails the installer job; these prove the Solo release kept its own assets.
  static ASSETS = ['install.sh', 'SHA256SUMS', 'solo-linux-x64'];

  static compare(left, right) {
    const [a, b] = [left, right].map(version => version.split('-', 1)[0].split('.').map(Number));
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || Number(right.includes('-')) - Number(left.includes('-'));
  }

  // Solo's support window: README "Current Releases" rows whose end of support has not passed.
  static window(readme, today) {
    const section = /^### Current Releases\n([\s\S]*?)(?=^#)/m.exec(`${readme}\n#`)?.[1] ?? '';
    const versions = [];
    for (const line of section.split('\n')) {
      const row = /^\|\s*(\d+\.\d+\.\d+)(?:\s*\(LTS\))?\s*\|.*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*$/.exec(line);
      if (row && row[2] >= today) {
        versions.push(row[1]);
      }
    }
    if (!section.includes('| Solo Version')) {
      throw new Error('README has no Current Releases table; the support window cannot be read');
    }
    return new Set(versions);
  }

  // Which Solo releases this kit must pass with before it ships: the supported releases still in the window, and the
  // release being cut, built from the verified commit. A prerelease is verified against the list but never admitted.
  static plan(policy, {version, commit, readme, today}) {
    if (!VERSION.test(version)) {
      throw new Error(`Invalid release version: ${version}`);
    }
    if (!/^[\da-f]{40}$/.test(commit)) {
      throw new Error(`The verified commit must be a full SHA: ${commit}`);
    }
    const window = Release.window(readme, today);
    const entries = policy.supported
      .filter(solo => solo !== version && window.has(solo))
      .map(solo => ({solo, source: 'npm'}));
    if (!version.includes('-')) {
      entries.push({solo: version, source: 'release'});
    }
    return {version, commit, entries: entries.toSorted((left, right) => Release.compare(right.solo, left.solo))};
  }

  static #matches(result, entry, commit) {
    return entry.source === 'release'
      ? result.soloSource?.kind === 'local-tarball' && result.soloSource.sourceSha === commit
      : result.soloSource?.kind === 'release' && result.soloSource.version === entry.solo;
  }

  // The supported list the release commits. Every planned run must have passed: one failure blocks the release.
  static admit(plan, results) {
    const failures = [];
    for (const entry of plan.entries) {
      const matching = results.filter(result => Release.#matches(result, entry, plan.commit));
      if (matching.length !== 1) {
        failures.push(`Solo ${entry.solo}: expected one lane result, found ${matching.length}`);
      } else if (matching[0].outcome !== 'pass') {
        failures.push(
          `Solo ${entry.solo}: ${matching[0].reason || 'fail'}: ${matching[0].error || 'no error recorded'}`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(`TCK release verification failed; the release is blocked.\n- ${failures.join('\n- ')}`);
    }
    const supported = plan.entries.map(entry => entry.solo);
    return {default: supported[0] ?? null, supported};
  }

  // Bound the release-notes section this workflow owns, so a re-run replaces it instead of adding another.
  static NOTES = ['<!-- solo-tck -->', '<!-- /solo-tck -->'];

  // Commit titles already put kit changes in Solo's release notes. The supported list and default change inside the
  // release commit, which no title describes, so the release notes state them (§6.2).
  static notes(previous, policy, {version, tagCommit}) {
    const changes = [
      ...policy.supported.filter(solo => !previous.supported.includes(solo)).map(solo => `added ${solo}`),
      ...previous.supported.filter(solo => !policy.supported.includes(solo)).map(solo => `removed ${solo}`),
    ];
    const lines = [Release.NOTES[0], '### Solo TCK', ''];
    if (policy.supported.length === 0) {
      lines.push('No Solo release is supported yet; callers pass a full Solo commit SHA as `solo-version`.');
    } else {
      lines.push(
        `Supported Solo releases: ${policy.supported.join(', ')} (${changes.join('; ') || 'unchanged'}).`,
        `Default Solo release: ${policy.default} (${
          policy.default === previous.default ? 'unchanged' : `was ${previous.default ?? 'none'}`
        }).`,
      );
    }
    lines.push('', `Pin this kit with \`uses: hiero-ledger/solo/tck@${tagCommit} # v${version}\`.`, Release.NOTES[1]);
    return lines.join('\n');
  }

  static withNotes(body, section) {
    const [start, end] = Release.NOTES.map(marker => body.indexOf(marker));
    const kept =
      start === -1 ? body.trimEnd() : `${body.slice(0, start).trimEnd()}${body.slice(end + Release.NOTES[1].length)}`;
    return `${kept.trimEnd()}\n\n${section}\n`;
  }

  static kitFiles(files) {
    if (!files.includes('package.json')) {
      throw new Error('The package listing has no package.json; it cannot prove what the package holds');
    }
    return files.filter(file => file === 'tck' || file.startsWith('tck/'));
  }

  // What the release published must be what was verified (§6.1 step 5). A mismatch needs a corrected release;
  // a published action ref is immutable.
  static readback({version, policy, branch, releaseFiles}, published) {
    const problems = [];
    if (published.tagCommit) {
      const unverified = published.changedFiles.filter(file => !releaseFiles.includes(file));
      if (unverified.length > 0) {
        problems.push(`The release commit changed files that were not verified: ${unverified.join(', ')}`);
      }
      if (!isDeepStrictEqual(published.policy, policy)) {
        problems.push(
          `tck/solo-versions.json at the tag is ${JSON.stringify(published.policy)}, verified ${JSON.stringify(policy)}`,
        );
      }
      if (published.kitVersion !== version) {
        problems.push(`tck/package.json at the tag is version ${published.kitVersion}, not ${version}`);
      }
      if (!published.action) {
        problems.push(`GitHub does not serve tck/action.yml at ${published.tagCommit}`);
      }
      if (!published.body?.includes(`hiero-ledger/solo/tck@${published.tagCommit}`)) {
        problems.push(`The release notes of v${version} have no Solo TCK section pinning ${published.tagCommit}`);
      }
    } else {
      problems.push(`Tag v${version} does not exist`);
    }
    const missing = Release.ASSETS.filter(asset => !published.assets.includes(asset));
    if (missing.length > 0) {
      problems.push(`Release v${version} is missing Solo assets: ${missing.join(', ')}`);
    }
    if (branch === 'main' && !version.includes('-') && published.latest !== `v${version}`) {
      problems.push(`releases/latest is ${published.latest}, not v${version}`);
    }
    if (problems.length > 0) {
      throw new Error(`Published release does not match what was verified.\n- ${problems.join('\n- ')}`);
    }
  }

  static controls(candidatePackages) {
    const environment = {...process.env};
    // A control's own failing run must not write the calling job's outputs or summary.
    delete environment.GITHUB_OUTPUT;
    delete environment.GITHUB_STEP_SUMMARY;
    return Release.CONTROLS.map(control => {
      const temporary = mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), 'solo-tck-control-'));
      try {
        const run = spawnSync(
          process.execPath,
          [
            path.join(kit, 'src/run.mjs'),
            '--component',
            'js-sdk',
            '--candidate-packages',
            candidatePackages,
            ...control.arguments,
          ],
          {env: {...environment, RUNNER_TEMP: temporary}, shell: false, encoding: 'utf8', timeout: 120_000},
        );
        const file = /Result: (.+tck-result\.json)/.exec(run.stdout ?? '')?.[1];
        const reason = file ? JSON.parse(readFileSync(file, 'utf8')).reason : undefined;
        return {
          name: control.name,
          expected: {exit: control.exit, reason: control.reason},
          observed: {exit: run.status, reason},
          passed: run.status === control.exit && reason === control.reason,
        };
      } finally {
        rmSync(temporary, {recursive: true, force: true});
      }
    });
  }

  // One listing and one read per result, with no separate check of a path that could change in between.
  static #results(directory) {
    return readdirSync(directory, {recursive: true})
      .filter(file => path.basename(file) === 'tck-result.json')
      .map(file => JSON.parse(readFileSync(path.join(directory, file), 'utf8')));
  }

  static async #npmJson(arguments_) {
    return JSON.parse(await Processes.command('npm', [...arguments_, '--json'], {timeout: 120_000}));
  }

  // The released SDK a Solo release ships with, and the proto and cryptography versions that SDK pins.
  static async #sdk(values) {
    const dependencies = values.manifest
      ? JSON.parse(readFileSync(values.manifest, 'utf8')).dependencies
      : await Release.#npmJson(['view', `@hiero-ledger/solo@${values.solo}`, 'dependencies']);
    const sdk = dependencies['@hiero-ledger/sdk'];
    const pinned = await Release.#npmJson(['view', `@hiero-ledger/sdk@${sdk}`, 'dependencies']);
    mkdirSync(values.out, {recursive: true});
    await Processes.command(
      'npm',
      [
        'pack',
        `@hiero-ledger/sdk@${sdk}`,
        `@hiero-ledger/proto@${pinned['@hiero-ledger/proto']}`,
        `@hiero-ledger/cryptography@${pinned['@hiero-ledger/cryptography']}`,
        '--pack-destination',
        values.out,
      ],
      {timeout: 120_000},
    );
    console.log(`Solo TCK release: packed @hiero-ledger/sdk@${sdk} into ${values.out}`);
  }

  static async #exclusion(values) {
    let files;
    if (values.tarball) {
      const listing = await Processes.command('tar', ['-tzf', values.tarball], {timeout: 60_000});
      files = listing
        .split('\n')
        .filter(Boolean)
        .map(file => file.replace(/^package\//, ''));
    } else {
      // npm can run prepare despite --ignore-scripts and print before its JSON.
      const output = await Processes.command('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: repository,
        timeout: 120_000,
      });
      files = JSON.parse(output.slice(output.search(/^\[/m)))[0].files.map(file => file.path);
    }
    const kitFiles = Release.kitFiles(files);
    if (kitFiles.length > 0) {
      throw new Error(`The Solo npm package must exclude tck/, but holds: ${kitFiles.join(', ')}`);
    }
    console.log('Solo TCK release: the Solo npm package excludes tck/');
  }

  static async #run(program, arguments_) {
    const output = await Processes.command(program, arguments_, {cwd: repository, timeout: 60_000});
    return output.trim();
  }

  // The commit a release tag names, or undefined when the tag does not exist (yet, in a dry run).
  static async #tagCommit(tag) {
    try {
      await Release.#run('git', ['fetch', '--no-tags', 'origin', `+refs/tags/${tag}:refs/tags/${tag}`]);
      return await Release.#run('git', ['rev-parse', `${tag}^{commit}`]);
    } catch {
      // The caller reports a missing tag in its own terms.
      return;
    }
  }

  static async #notes(values) {
    const tag = `v${values.version}`;
    const github = process.env.GITHUB_REPOSITORY;
    const tagCommit = await Release.#tagCommit(tag);
    const section = Release.notes(
      JSON.parse(await Release.#run('git', ['show', `${values.commit}:tck/solo-versions.json`])),
      JSON.parse(readFileSync(values.policy, 'utf8')),
      {version: values.version, tagCommit: tagCommit ?? '<release commit SHA>'},
    );
    console.log(section);
    if (values.publish) {
      if (!tagCommit) {
        throw new Error(`Tag ${tag} does not exist; its release notes cannot be updated`);
      }
      const body = await Release.#run('gh', [
        'release',
        'view',
        tag,
        '--repo',
        github,
        '--json',
        'body',
        '--jq',
        '.body',
      ]);
      const file = path.join(
        mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), 'solo-tck-notes-')),
        'notes.md',
      );
      writeFileSync(file, Release.withNotes(body, section));
      await Release.#run('gh', ['release', 'edit', tag, '--repo', github, '--notes-file', file]);
    }
  }

  static async #readback(values) {
    const git = arguments_ => Release.#run('git', arguments_);
    const gh = arguments_ => Release.#run('gh', arguments_);
    const tag = `v${values.version}`;
    const github = process.env.GITHUB_REPOSITORY;
    const published = {assets: [], changedFiles: [], tagCommit: await Release.#tagCommit(tag)};
    if (published.tagCommit) {
      const changed = await git(['diff', '--name-only', values.commit, published.tagCommit]);
      published.changedFiles = changed.split('\n').filter(Boolean);
      published.policy = JSON.parse(await git(['show', `${published.tagCommit}:tck/solo-versions.json`]));
      published.kitVersion = JSON.parse(await git(['show', `${published.tagCommit}:tck/package.json`])).version;
      try {
        await gh(['api', `repos/${github}/contents/tck/action.yml?ref=${published.tagCommit}`, '--jq', '.name']);
        published.action = true;
      } catch {
        // An action GitHub cannot serve is reported by readback as a problem.
        published.action = false;
      }
    }
    try {
      const release = JSON.parse(await gh(['release', 'view', tag, '--repo', github, '--json', 'assets,body']));
      published.assets = release.assets.map(asset => asset.name);
      published.body = release.body;
      published.latest = await gh(['api', `repos/${github}/releases/latest`, '--jq', '.tag_name']);
    } catch {
      // A missing release leaves no assets, which readback reports.
    }
    const releaserc = JSON.parse(readFileSync(path.join(repository, '.releaserc'), 'utf8'));
    const releaseFiles = releaserc.plugins.find(plugin => plugin[0] === '@semantic-release/git')[1].assets;
    Release.readback(
      {
        version: values.version,
        policy: JSON.parse(readFileSync(values.policy, 'utf8')),
        branch: values.branch,
        releaseFiles,
      },
      published,
    );
    console.log(`Solo TCK release: ${tag} publishes the verified kit and supported list`);
  }

  static async main(arguments_) {
    const [command, ...rest] = arguments_;
    const {values} = parseArgs({
      args: rest,
      options: {
        ...Object.fromEntries(
          [
            'version',
            'commit',
            'out',
            'solo',
            'manifest',
            'tarball',
            'plan',
            'results',
            'policy',
            'branch',
            'candidate-packages',
          ].map(name => [name, {type: 'string'}]),
        ),
        publish: {type: 'boolean'},
      },
    });
    switch (command) {
      case 'plan': {
        const plan = Release.plan(JSON.parse(readFileSync(path.join(kit, 'solo-versions.json'), 'utf8')), {
          version: values.version,
          commit: values.commit,
          readme: readFileSync(path.join(repository, 'README.md'), 'utf8'),
          today: new Date().toISOString().slice(0, 10),
        });
        writeFileSync(values.out, `${JSON.stringify(plan, null, 2)}\n`);
        console.log(
          `Solo TCK release: verify ${plan.entries.map(entry => entry.solo).join(', ') || 'no Solo release'}`,
        );
        break;
      }
      case 'sdk': {
        await Release.#sdk(values);
        break;
      }
      case 'controls': {
        const results = Release.controls(path.resolve(values['candidate-packages']));
        writeFileSync(values.out, `${JSON.stringify(results, null, 2)}\n`);
        for (const result of results) {
          console.log(`${result.passed ? 'pass' : 'FAIL'}: ${result.name} ${JSON.stringify(result.observed)}`);
        }
        if (!results.every(result => result.passed)) {
          throw new Error('A negative control did not fail with its expected exit code and reason');
        }
        break;
      }
      case 'exclusion': {
        await Release.#exclusion(values);
        break;
      }
      case 'admit': {
        const plan = JSON.parse(readFileSync(values.plan, 'utf8'));
        const policy = Release.admit(plan, Release.#results(values.results));
        writeFileSync(values.out, `${JSON.stringify(policy, null, 2)}\n`);
        console.log(`Solo TCK release: supported ${policy.supported.join(', ') || 'none'}; default ${policy.default}`);
        break;
      }
      case 'notes': {
        await Release.#notes(values);
        break;
      }
      case 'readback': {
        await Release.#readback(values);
        break;
      }
      default: {
        throw new Error(
          `Unknown command ${command}; expected plan, sdk, controls, exclusion, admit, notes or readback`,
        );
      }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    await Release.main(process.argv.slice(2));
  } catch (error) {
    console.error(`Solo TCK release: ${error.message}`);
    process.exitCode = 1;
  }
}
