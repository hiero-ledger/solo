// SPDX-License-Identifier: Apache-2.0

import {type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, afterEach} from 'mocha';
import {SubprocessEnvironment} from '../../../src/core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../src/core/subprocess-command-profile.js';
import {type AnyObject} from '../../../src/types/aliases.js';

describe('SubprocessEnvironment', (): void => {
  const temporaryKeys: string[] = [];
  const allProfiles: SubprocessCommandProfile[] = Object.values(SubprocessCommandProfile);

  /** Sets an environment variable for the duration of a single test and schedules its removal. */
  function setTemporaryEnvironmentVariable(name: string, value: string): void {
    temporaryKeys.push(name);
    process.env[name] = value;
  }

  afterEach((): void => {
    for (const key of temporaryKeys) {
      delete process.env[key];
    }
    temporaryKeys.length = 0;
    sinon.restore();
  });

  it('includes common base variables that are set in the parent environment', (): void => {
    setTemporaryEnvironmentVariable('LANG', 'en_US.UTF-8');
    setTemporaryEnvironmentVariable('HTTPS_PROXY', 'http://proxy.example:8080');

    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC);

    expect(environment.LANG).to.equal('en_US.UTF-8');
    expect(environment.HTTPS_PROXY).to.equal('http://proxy.example:8080');
  });

  it('does not fabricate variables that are absent from the parent environment', (): void => {
    delete process.env.LC_ALL;

    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC);

    expect(environment).to.not.have.property('LC_ALL');
  });

  it('drops arbitrary secrets for every command profile', (): void => {
    setTemporaryEnvironmentVariable('AWS_SECRET_ACCESS_KEY', 'super-secret');
    setTemporaryEnvironmentVariable('MY_API_TOKEN', 'do-not-leak');

    for (const profile of allProfiles) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      expect(environment, `profile ${profile}`).to.not.have.property('AWS_SECRET_ACCESS_KEY');
      expect(environment, `profile ${profile}`).to.not.have.property('MY_API_TOKEN');
    }
  });

  it('includes KUBECONFIG only for kubernetes-facing profiles', (): void => {
    setTemporaryEnvironmentVariable('KUBECONFIG', '/home/user/.kube/config');

    const kubernetesProfiles: SubprocessCommandProfile[] = [
      SubprocessCommandProfile.KUBECTL,
      SubprocessCommandProfile.HELM,
      SubprocessCommandProfile.KIND,
    ];
    for (const profile of kubernetesProfiles) {
      expect(SubprocessEnvironment.forCommand(profile), `profile ${profile}`).to.have.property('KUBECONFIG');
    }
    const nonKubernetesProfiles: SubprocessCommandProfile[] = [
      SubprocessCommandProfile.GENERIC,
      SubprocessCommandProfile.BREW,
      SubprocessCommandProfile.NPM,
      SubprocessCommandProfile.CONTAINER_ENGINE,
      SubprocessCommandProfile.GITHUB_CLI,
    ];
    for (const profile of nonKubernetesProfiles) {
      expect(SubprocessEnvironment.forCommand(profile), `profile ${profile}`).to.not.have.property('KUBECONFIG');
    }
  });

  it('forwards DOCKER_CONFIG to helm (OCI registry auth) and the container-engine/kind profiles', (): void => {
    setTemporaryEnvironmentVariable('DOCKER_CONFIG', '/home/user/.docker');

    const dockerConfigProfiles: SubprocessCommandProfile[] = [
      SubprocessCommandProfile.HELM,
      SubprocessCommandProfile.KIND,
      SubprocessCommandProfile.CONTAINER_ENGINE,
    ];
    for (const profile of dockerConfigProfiles) {
      expect(SubprocessEnvironment.forCommand(profile), `profile ${profile}`).to.have.property('DOCKER_CONFIG');
    }
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL)).to.not.have.property('DOCKER_CONFIG');
  });

  it('forwards CONTAINERS_STORAGE_CONF to kind (podman-backed) and the container-engine profile', (): void => {
    setTemporaryEnvironmentVariable('CONTAINERS_STORAGE_CONF', '/home/user/.config/containers/storage.conf');

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KIND)).to.have.property('CONTAINERS_STORAGE_CONF');
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.CONTAINER_ENGINE)).to.have.property(
      'CONTAINERS_STORAGE_CONF',
    );
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM)).to.not.have.property(
      'CONTAINERS_STORAGE_CONF',
    );
  });

  it('matches HELM_ prefixed variables only for the helm profile', (): void => {
    setTemporaryEnvironmentVariable('HELM_REPOSITORY_CONFIG', '/home/user/.config/helm/repositories.yaml');

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM)).to.have.property('HELM_REPOSITORY_CONFIG');
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL)).to.not.have.property(
      'HELM_REPOSITORY_CONFIG',
    );
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC)).to.not.have.property(
      'HELM_REPOSITORY_CONFIG',
    );
  });

  it('matches HOMEBREW_ prefixed variables only for the brew profile', (): void => {
    setTemporaryEnvironmentVariable('HOMEBREW_NO_ANALYTICS', '1');

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.BREW)).to.have.property('HOMEBREW_NO_ANALYTICS');
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC)).to.not.have.property(
      'HOMEBREW_NO_ANALYTICS',
    );
  });

  it('includes GitHub CLI credentials only for the github-cli profile', (): void => {
    setTemporaryEnvironmentVariable('GH_TOKEN', 'ghp_example');
    setTemporaryEnvironmentVariable('GITHUB_TOKEN', 'ghp_example2');

    const githubEnvironment: Record<string, string> = SubprocessEnvironment.forCommand(
      SubprocessCommandProfile.GITHUB_CLI,
    );
    expect(githubEnvironment).to.have.property('GH_TOKEN');
    expect(githubEnvironment).to.have.property('GITHUB_TOKEN');

    const genericEnvironment: Record<string, string> = SubprocessEnvironment.forCommand(
      SubprocessCommandProfile.GENERIC,
    );
    expect(genericEnvironment).to.not.have.property('GH_TOKEN');
    expect(genericEnvironment).to.not.have.property('GITHUB_TOKEN');
  });

  /** Case-insensitive key lookup — Windows may surface env var names in any case (e.g. SYSTEMROOT). */
  function hasKeyIgnoreCase(environment: Record<string, string>, key: string): boolean {
    return Object.keys(environment).some((name: string): boolean => name.toLowerCase() === key.toLowerCase());
  }

  it('includes Windows-only variables only on Windows', (): void => {
    setTemporaryEnvironmentVariable('SystemRoot', String.raw`C:\Windows`);
    setTemporaryEnvironmentVariable('PATHEXT', '.COM;.EXE;.BAT');

    const windowsStub: SinonStub = sinon.stub(SubprocessEnvironment as AnyObject, 'isWindowsPlatform').returns(true);
    const onWindows: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(hasKeyIgnoreCase(onWindows, 'SystemRoot'), 'SystemRoot on windows').to.equal(true);
    expect(hasKeyIgnoreCase(onWindows, 'PATHEXT'), 'PATHEXT on windows').to.equal(true);

    windowsStub.returns(false);
    const onPosix: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(hasKeyIgnoreCase(onPosix, 'SystemRoot'), 'SystemRoot on posix').to.equal(false);
    expect(hasKeyIgnoreCase(onPosix, 'PATHEXT'), 'PATHEXT on posix').to.equal(false);
  });

  it('matches Windows allowlist entries case-insensitively (e.g. Git-bash SYSTEMROOT)', (): void => {
    // Git-bash / MSYS surfaces the variable uppercased; the allowlist lists it as 'SystemRoot'.
    setTemporaryEnvironmentVariable('SYSTEMROOT', String.raw`C:\Windows`);

    sinon.stub(SubprocessEnvironment as AnyObject, 'isWindowsPlatform').returns(true);
    const onWindows: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(hasKeyIgnoreCase(onWindows, 'SystemRoot'), 'uppercase SYSTEMROOT is forwarded').to.equal(true);
    expect(onWindows).to.have.property('SYSTEMROOT'); // original casing preserved for the child
  });

  it('applies overrides last, winning over inherited values and bypassing the allowlist', (): void => {
    setTemporaryEnvironmentVariable('PATH', '/usr/bin');

    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC, {
      PATH: '/custom/bin:/usr/bin',
      KUBECONFIG: '/dev/null',
    });

    // override replaces the inherited value
    expect(environment.PATH).to.equal('/custom/bin:/usr/bin');
    // override is present even though KUBECONFIG is not on the generic allowlist
    expect(environment.KUBECONFIG).to.equal('/dev/null');
  });
});
