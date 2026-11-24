// SPDX-License-Identifier: Apache-2.0

import {createHash} from 'node:crypto';
import {createReadStream, lstatSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {Failure} from './contract.mjs';
import {Processes} from './process.mjs';

// Raise only with a new manifest shape; schema version 1 is design §4.1.
export const COMPANION_SCHEMA_VERSION = 1;
// Every module image Solo expands a Mirror Node image prefix into; the archive must hold all of them.
export const MIRROR_NODE_MODULES = ['importer', 'grpc', 'rest', 'rest-java', 'web3', 'monitor'];
// Modules Solo's one-shot Mirror Node runs; the monitor stays off with the pinger.
export const MIRROR_NODE_RUNNING_MODULES = ['importer', 'grpc', 'rest', 'rest-java', 'web3'];
// Artifact fields and Falcon wiring per companion type (design §4.1).
export const COMPANIONS = {
  'consensus-node': {
    required: ['buildPath'],
    optional: [],
    section: 'setup',
    versionFlag: 'consensus-node-version',
    versionPrefix: 'v',
  },
  'mirror-node': {
    required: ['image', 'archive', 'chartDir'],
    optional: [],
    section: 'mirrorNode',
    versionFlag: 'mirror-node-version',
    versionPrefix: 'v',
    chartFlag: 'mirror-node-chart-dir',
  },
  'block-node': {
    required: ['image', 'archive'],
    optional: ['chartDir'],
    section: 'blockNode',
    versionFlag: 'block-node-version',
    versionPrefix: '',
    chartFlag: 'block-node-chart-dir',
  },
  relay: {
    required: ['image', 'archive'],
    optional: ['chartDir'],
    section: 'relayNode',
    versionFlag: 'relay-version',
    versionPrefix: '',
    chartFlag: 'relay-chart-dir',
  },
};
// Components each lane deploys; a companion outside its lane's topology could never run.
export const LANE_COMPONENTS = {'js-sdk': ['consensus-node', 'mirror-node']};
// Where Solo installs a local consensus node build inside each node pod's root container.
export const CONSENSUS_NODE_DATA = '/opt/hgcapp/services-hedera/HapiApp2.0/data';

const VERSION = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const COMMIT = /^[\da-f]{40}$/;
// A tagged image reference without a digest, following the Docker reference grammar.
const IMAGE = /^[a-z\d]+(?:[._-][a-z\d]+)*(?::\d+)?(?:\/[a-z\d]+(?:(?:[._]|__|-+)[a-z\d]+)*)*:\w[\w.-]{0,127}$/;

export class Companions {
  static #invalid(message) {
    return new Failure('invalid', `Invalid companion-builds: ${message}`);
  }

  static #unobserved(component, detail) {
    return new Failure('unknown', `Supplied ${component} companion was never observed running: ${detail}`, {
      probe: 'P3',
    });
  }

  static #object(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  static #fields(value, allowed, label) {
    if (!Companions.#object(value)) {
      throw Companions.#invalid(`${label} must be a JSON object`);
    }
    const unknown = Object.keys(value).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
      throw Companions.#invalid(
        `${label} has unknown field(s) ${unknown.join(', ')}; allowed: ${allowed.join(', ')}. ` +
          'The manifest is not a passthrough for Helm values or CLI flags.',
      );
    }
  }

  static #directory(directory) {
    try {
      return statSync(directory).isDirectory();
    } catch {
      return false; /* A missing path is reported as a missing artifact by the caller. */
    }
  }

  static async #sha256(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }

  // Same line format as sha256sum, so a digest can be reproduced from its file list.
  static #digest(files) {
    const lines = Object.entries(files)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([name, hash]) => `${hash}  ${name}\n`);
    return createHash('sha256').update(lines.join('')).digest('hex');
  }

  // Same tag rule as Solo: a colon after the last slash starts the tag, so a registry port is never a tag.
  static #split(image) {
    const name = image.split('@', 1)[0];
    const colon = name.lastIndexOf(':');
    return colon > name.lastIndexOf('/')
      ? {repository: name.slice(0, colon), tag: name.slice(colon + 1)}
      : {repository: name, tag: ''};
  }

  static images(component, image, modules = MIRROR_NODE_MODULES) {
    if (component !== 'mirror-node') {
      return [image];
    }
    const {repository, tag} = Companions.#split(image);
    return modules.map(module => `${repository}-${module}:${tag}`);
  }

  static async #buildPath(directory, label) {
    const jars = {};
    for (const folder of ['apps', 'lib']) {
      const location = path.join(directory, folder);
      const names = Companions.#directory(location)
        ? readdirSync(location).filter(name => name.endsWith('.jar') && statSync(path.join(location, name)).isFile())
        : [];
      if (names.length === 0) {
        throw Companions.#invalid(`${label}.buildPath ${directory} has no ${folder}/*.jar`);
      }
      for (const name of names) {
        jars[`${folder}/${name}`] = await Companions.#sha256(path.join(location, name));
      }
    }
    return {path: directory, sha256: Companions.#digest(jars), jars};
  }

  static async #chartDirectory(directory, label) {
    if (!Companions.#directory(directory)) {
      throw Companions.#invalid(`${label}.chartDir ${directory} is not a directory`);
    }
    const files = {};
    for (const name of readdirSync(directory, {recursive: true})) {
      if (lstatSync(path.join(directory, name)).isFile()) {
        files[name.split(path.sep).join('/')] = await Companions.#sha256(path.join(directory, name));
      }
    }
    return {path: directory, sha256: Companions.#digest(files), files: Object.keys(files).length};
  }

  static async #archive(file, images, label, runtime) {
    if (!statSync(file, {throwIfNoEntry: false})?.isFile()) {
      throw Companions.#invalid(`${label}.archive ${file} is not a file`);
    }
    let tags;
    try {
      const manifest = JSON.parse(await Processes.command('tar', ['-xOf', file, 'manifest.json'], runtime));
      tags = manifest.flatMap(entry => entry.RepoTags ?? []);
    } catch (error) {
      if (runtime.signal?.aborted) {
        throw error;
      }
      throw Companions.#invalid(`${label}.archive ${file} is not a docker save archive: ${error.message}`);
    }
    const missing = images.filter(image => !tags.includes(image));
    if (missing.length > 0) {
      throw Companions.#invalid(
        `${label}.archive ${file} does not hold ${missing.join(', ')}` +
          (images.length > 1 ? '; Mirror Node archives must hold the full module set' : ''),
      );
    }
    return {path: file, sha256: await Companions.#sha256(file)};
  }

  static #image(entry, label) {
    if (!IMAGE.test(entry.image)) {
      throw Companions.#invalid(`${label}.image ${entry.image} is not a tagged image reference`);
    }
    const {repository, tag} = Companions.#split(entry.image);
    if (tag !== entry.version) {
      throw Companions.#invalid(`${label}.image tag ${tag} must equal version ${entry.version}`);
    }
    if (entry.component === 'mirror-node' && MIRROR_NODE_MODULES.some(module => repository.endsWith(`-${module}`))) {
      throw Companions.#invalid(`${label}.image must be the prefix Solo expands into every Mirror Node module image`);
    }
    return {reference: entry.image, images: Companions.images(entry.component, entry.image)};
  }

  static async #entry(entry, label, base, runtime) {
    const definition = COMPANIONS[entry.component];
    const artifacts = {};
    for (const field of definition.required) {
      if (entry[field] === undefined) {
        throw Companions.#invalid(`${label} is missing artifact ${field}`);
      }
    }
    for (const field of [...definition.required, ...definition.optional]) {
      if (entry[field] !== undefined && (typeof entry[field] !== 'string' || !entry[field].trim())) {
        throw Companions.#invalid(`${label}.${field} must be a non-empty string`);
      }
    }
    if (entry.buildPath !== undefined) {
      artifacts.buildPath = await Companions.#buildPath(path.resolve(base, entry.buildPath), label);
    }
    if (entry.image !== undefined) {
      artifacts.image = Companions.#image(entry, label);
      artifacts.archive = await Companions.#archive(
        path.resolve(base, entry.archive),
        artifacts.image.images,
        label,
        runtime,
      );
    }
    if (entry.chartDir !== undefined) {
      artifacts.chartDir = await Companions.#chartDirectory(path.resolve(base, entry.chartDir), label);
    }
    return {
      component: entry.component,
      version: entry.version,
      source: {repository: entry.source.repository, commit: entry.source.commit},
      // The kit cannot see the caller's checkout; it verifies what ran, not what it was built from.
      sourceShaVerified: false,
      artifacts,
    };
  }

  static async load(file, lane, overrides = {}, runtime = {}) {
    const manifestPath = path.resolve(file);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      throw Companions.#invalid(`cannot read ${manifestPath}: ${error.message}`);
    }
    Companions.#fields(manifest, ['schemaVersion', 'components'], 'manifest');
    if (manifest.schemaVersion !== COMPANION_SCHEMA_VERSION) {
      throw Companions.#invalid(
        `unsupported schemaVersion ${JSON.stringify(manifest.schemaVersion)}; supported: ${COMPANION_SCHEMA_VERSION}`,
      );
    }
    if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
      throw Companions.#invalid('components must be a non-empty array');
    }
    const seen = new Set();
    for (const [index, entry] of manifest.components.entries()) {
      const label = `components[${index}]`;
      if (!Companions.#object(entry) || !Object.hasOwn(COMPANIONS, entry.component)) {
        throw Companions.#invalid(
          `${label} has unsupported component ${JSON.stringify(entry?.component)}; supported: ${Object.keys(COMPANIONS).join(', ')}`,
        );
      }
      const definition = COMPANIONS[entry.component];
      Companions.#fields(
        entry,
        ['component', 'source', 'version', ...definition.required, ...definition.optional],
        label,
      );
      if (entry.component === lane) {
        throw Companions.#invalid(`${label} is the ${lane} candidate; supply it through the candidate inputs`);
      }
      if (seen.has(entry.component)) {
        throw Companions.#invalid(`${label} duplicates component ${entry.component}`);
      }
      seen.add(entry.component);
      if (!LANE_COMPONENTS[lane]?.includes(entry.component)) {
        throw Companions.#invalid(`the ${lane} lane does not deploy ${entry.component}`);
      }
      if (overrides[definition.versionFlag]) {
        throw Companions.#invalid(
          `--${definition.versionFlag} overrides ${entry.component}, which the manifest already supplies`,
        );
      }
      Companions.#fields(entry.source, ['repository', 'commit'], `${label}.source`);
      if (typeof entry.source.repository !== 'string' || !REPOSITORY.test(entry.source.repository)) {
        throw Companions.#invalid(`${label}.source.repository must be owner/name`);
      }
      if (typeof entry.source.commit !== 'string' || !COMMIT.test(entry.source.commit)) {
        throw Companions.#invalid(`${label}.source.commit must be a full 40-character commit SHA`);
      }
      if (typeof entry.version !== 'string' || !VERSION.test(entry.version)) {
        throw Companions.#invalid(`${label}.version must be a semver version`);
      }
    }
    const base = path.dirname(manifestPath);
    const components = [];
    for (const [index, entry] of manifest.components.entries()) {
      components.push(await Companions.#entry(entry, `components[${index}]`, base, runtime));
    }
    return {manifest: {path: manifestPath, sha256: await Companions.#sha256(manifestPath)}, components};
  }

  // Falcon section keys and top-level flags for the supplied companions; the manifest adds nothing else.
  static falcon(components, laneSections = {}) {
    const sections = structuredClone(laneSections);
    const flags = [];
    for (const {component, version, artifacts} of components) {
      const definition = COMPANIONS[component];
      const section = (sections[definition.section] ??= {});
      if (artifacts.buildPath) {
        section['--local-build-path'] = artifacts.buildPath.path;
      }
      if (artifacts.image) {
        section['--component-image'] = artifacts.image.reference;
        section['--component-image-archive'] = artifacts.archive.path;
      }
      if (artifacts.chartDir) {
        section[`--${definition.chartFlag}`] = artifacts.chartDir.path;
      }
      flags.push(`--${definition.versionFlag}`, `${definition.versionPrefix}${version}`);
    }
    // JSON scalars are valid YAML, so paths and references cannot change the document's structure.
    const values = Object.entries(sections)
      .map(
        ([name, keys]) =>
          `${name}:\n${Object.entries(keys)
            .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}\n`)
            .join('')}`,
      )
      .join('');
    return {values, flags};
  }

  static parseChecksums(output, component) {
    const files = {};
    for (const line of output.split('\n').filter(Boolean)) {
      const match = /^([\da-f]{64}) [ *](.+)$/.exec(line.trim());
      if (!match) {
        throw Companions.#unobserved(component, `unexpected checksum output: ${line}`);
      }
      files[match[2]] = match[1];
    }
    return files;
  }

  static #sample(names) {
    return names.slice(0, 5).join(', ') + (names.length > 5 ? ` and ${names.length - 5} more` : '');
  }

  static compareJars(expected, observed, pod) {
    const missing = Object.keys(expected).filter(name => !Object.hasOwn(observed, name));
    const extra = Object.keys(observed).filter(name => !Object.hasOwn(expected, name));
    const changed = Object.keys(expected).filter(
      name => Object.hasOwn(observed, name) && observed[name] !== expected[name],
    );
    const differences = [
      missing.length > 0 && `missing ${Companions.#sample(missing)}`,
      extra.length > 0 && `unexpected ${Companions.#sample(extra)}`,
      changed.length > 0 && `different ${Companions.#sample(changed)}`,
    ].filter(Boolean);
    if (differences.length > 0) {
      throw Companions.#unobserved('consensus-node', `${pod} jars differ from buildPath: ${differences.join('; ')}`);
    }
  }

  static observeImages(companion, pods) {
    const {component, artifacts} = companion;
    const expected = new Map(artifacts.image.images.map(image => [Companions.#split(image).repository, image]));
    const containers = pods
      .filter(pod => pod.ready)
      .flatMap(pod => pod.containers.map(container => ({pod: pod.name, ...container})))
      .filter(container => expected.has(Companions.#split(container.image).repository));
    const fallback = containers.filter(
      container => container.image !== expected.get(Companions.#split(container.image).repository),
    );
    if (fallback.length > 0) {
      throw Companions.#unobserved(
        component,
        `${fallback.map(container => `${container.pod}/${container.name}`).join(', ')} ran ${[...new Set(fallback.map(container => container.image))].join(', ')} instead; there is no release fallback`,
      );
    }
    const pulled = containers.filter(container => container.imagePullPolicy !== 'Never');
    if (pulled.length > 0) {
      throw Companions.#unobserved(
        component,
        `${pulled.map(container => `${container.pod}/${container.name}`).join(', ')} may pull instead of using the loaded archive (imagePullPolicy is not Never)`,
      );
    }
    const required =
      component === 'mirror-node'
        ? Companions.images(component, artifacts.image.reference, MIRROR_NODE_RUNNING_MODULES)
        : artifacts.image.images;
    const missing = required.filter(image => !containers.some(container => container.image === image));
    if (missing.length > 0) {
      throw Companions.#unobserved(component, `no Ready container runs ${missing.join(', ')}`);
    }
    return {
      containers: containers.map(({pod, name, image, imageID}) => ({pod, container: name, image, imageID})),
    };
  }

  static async #observeJars(companion, runtime) {
    const listing = JSON.parse(
      await Processes.command(
        'kubectl',
        ['get', 'pods', '-n', 'solo-tck', '-l', 'solo.hedera.com/type=network-node', '-o', 'json'],
        {...runtime, timeout: 10_000},
      ),
    );
    const names = listing.items.map(item => item.metadata.name);
    if (names.length === 0) {
      throw Companions.#unobserved('consensus-node', 'no consensus node pod exists');
    }
    const pods = [];
    for (const name of names) {
      let output;
      try {
        output = await Processes.command(
          'kubectl',
          [
            'exec',
            '-n',
            'solo-tck',
            name,
            '-c',
            'root-container',
            '--',
            'sh',
            '-c',
            // Same tool fallback as Solo's saved-state hashing; every tool prints `<hex>  <file>` or `<hex> *<file>`.
            `cd ${CONSENSUS_NODE_DATA} && files='apps/*.jar lib/*.jar' && ` +
              'if command -v sha256sum >/dev/null; then sha256sum $files; ' +
              'elif command -v shasum >/dev/null; then shasum -a 256 $files; ' +
              'else openssl dgst -sha256 -r $files; fi',
          ],
          {...runtime, timeout: 60_000},
        );
      } catch (error) {
        if (runtime.signal?.aborted) {
          throw error;
        }
        throw Companions.#unobserved('consensus-node', `cannot hash the jars in ${name}: ${error.message}`);
      }
      const observed = Companions.parseChecksums(output, 'consensus-node');
      Companions.compareJars(companion.artifacts.buildPath.jars, observed, name);
      pods.push({pod: name, sha256: Companions.#digest(observed)});
    }
    return {pods};
  }

  // Proves every supplied companion ran its supplied artifact; a companion never observed fails as unknown.
  static async observe(components, pods, runtime) {
    for (const companion of components) {
      companion.observed = companion.artifacts.buildPath
        ? await Companions.#observeJars(companion, runtime)
        : Companions.observeImages(companion, pods);
    }
  }
}
