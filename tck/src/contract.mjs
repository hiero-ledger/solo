// SPDX-License-Identifier: Apache-2.0

import {parseArgs} from 'node:util';

export const PROBES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
export const EXIT = {candidate: 1, invalid: 2, environment: 3, kit: 4, unknown: 5};
export const PACKAGES = ['@hiero-ledger/sdk', '@hiero-ledger/proto', '@hiero-ledger/cryptography'];
// Solo one-shot's fixed Mirror REST port; never read from run state, so probes cannot be redirected.
export const MIRROR_URL = 'http://127.0.0.1:38081';
export const LIMITS = {
  total: 1_200_000,
  cleanup: 180_000,
  setup: 180_000,
  deploy: 480_000,
  probes: 180_000,
  load: 180_000,
};

export class Failure extends Error {
  constructor(reason, message, options) {
    super(message, options);
    this.reason = reason;
  }
}

export class Contract {
  static inputs(arguments_, policy) {
    let values;
    try {
      ({values} = parseArgs({
        args: arguments_,
        options: Object.fromEntries(
          [
            'component',
            'candidate-packages',
            'solo-version',
            'solo-tarball',
            'cluster-name',
            'consensus-node-version',
            'mirror-node-version',
          ].map(name => [name, {type: 'string'}]),
        ),
      }));
    } catch (error) {
      throw new Failure('invalid', error.message);
    }
    if (values.component !== 'js-sdk' || !values['candidate-packages']) {
      throw new Failure('invalid', 'This kit implements component js-sdk and requires candidate-packages.');
    }
    const version = values['solo-version'] || policy.default;
    const commit = typeof version === 'string' && /^[0-9a-f]{40}$/.test(version);
    if (!commit && !policy.supported.includes(version)) {
      throw new Failure(
        'invalid',
        `Unsupported Solo ${version ?? '(no default yet)'}. Supported: ${policy.supported.join(', ') || 'none; use an explicit Solo commit SHA during development'}.`,
      );
    }
    if (values['solo-tarball'] && !commit) {
      throw new Failure(
        'invalid',
        'The local-only solo-tarball option requires its explicit 40-character solo-version source SHA.',
      );
    }
    const cluster = values['cluster-name'] || 'solo-cluster';
    if (cluster !== 'solo-cluster' && !/^solo-tck-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cluster)) {
      throw new Failure(
        'invalid',
        'Local cluster-name must start with solo-tck- and contain lowercase letters, digits and hyphens.',
      );
    }
    for (const name of ['consensus-node-version', 'mirror-node-version']) {
      if (values[name] && !/^v?\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(values[name])) {
        throw new Failure('invalid', `Invalid ${name}: ${values[name]}`);
      }
    }
    return {...values, 'solo-version': version, cluster, unreleased: commit};
  }

  static classifyDeploy(message) {
    if (/incompatible|not compatible|unsupported.*version/i.test(message)) {
      return 'invalid';
    }
    // SDK rejection during Solo startup does not prove whether the SDK or Solo is wrong.
    return 'unknown';
  }

  static redact(text, secrets = []) {
    let result = String(text);
    for (const secret of secrets.filter(Boolean)) {
      result = result.split(secret).join('<REDACTED>');
    }
    return result
      .replaceAll(/302e020100300506032b657004220420[\da-f]{64}/gi, '<REDACTED_TEST_KEY>')
      .replaceAll(
        /((?:privateKey|ed25519PrivateKey|ecdsaPrivateKey|operatorKey)["']?\s*[:=]\s*["']?)[\da-f]{32,}/gi,
        '$1<REDACTED_TEST_KEY>',
      )
      .replaceAll(/((?:--ed25519-private-key|--operator-key)[=\s]+)[\da-f]{32,}/gi, '$1<REDACTED_TEST_KEY>');
  }

  static complete(result, watchFailure) {
    if (result.incomplete) {
      throw new Failure('unknown', 'An interrupted run cannot pass');
    }
    if (watchFailure) {
      throw watchFailure;
    }
    if (!PROBES.every(id => result.probes[id]?.status === 'pass')) {
      throw new Failure('kit', 'Cannot pass: at least one required probe did not pass.');
    }
  }

  static #xml(text) {
    return (
      String(text)
        // XML 1.0 forbids these control characters even when escaped.
        // eslint-disable-next-line no-control-regex
        .replaceAll(/[\u0000-\u0008\u000B-\u001F]/g, '')
        .replaceAll(
          /[&<>"']/g,
          character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'})[character],
        )
    );
  }

  static junit(result) {
    const cases = PROBES.map(id => {
      const probe = result.probes[id];
      let content = '<skipped message="Not reached; overall run failed"/>';
      if (probe?.status === 'pass') {
        content = '';
      } else if (probe?.status === 'fail') {
        content = `<failure message="${Contract.#xml(probe.message)}"/>`;
      }
      return `<testcase classname="solo-tck.js-sdk" name="${id}" time="${(probe?.milliseconds || 0) / 1000}">${content}</testcase>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Solo TCK js-sdk" tests="8" failures="${PROBES.filter(id => result.probes[id]?.status === 'fail').length}" skipped="${PROBES.filter(id => !result.probes[id]).length}">${cases.join('')}</testsuite>\n`;
  }
}
