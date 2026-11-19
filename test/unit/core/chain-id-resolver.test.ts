// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonStub, type SinonStubbedInstance} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';

import {ChainIdResolver} from '../../../src/core/chain-id-resolver.js';
import {ConfigManager} from '../../../src/core/config-manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type Deployment} from '../../../src/business/runtime-state/config/local/deployment.js';
import {type Optional} from '../../../src/types/index.js';

describe('ChainIdResolver.resolve', (): void => {
  const deploymentName: string = 'deployment';

  let configManager: SinonStubbedInstance<ConfigManager>;
  let deployment: {name: string; chainId: Optional<number>};
  let ledger: {chainId: Optional<number>};
  let localPersist: SinonStub;
  let remotePersist: SinonStub;
  let remoteLoaded: boolean;
  let localConfig: LocalConfigRuntimeState;
  let remoteConfig: RemoteConfigRuntimeStateApi;

  /** Make the user pass --chain-id with the given value */
  const supplyChainId: (value: string) => void = (value: string): void => {
    configManager.wasFlagProvidedByUser.withArgs(flags.chainId).returns(true);
    configManager.getFlag.withArgs(flags.chainId).returns(value);
  };

  const resolve: () => Promise<string> = (): Promise<string> =>
    ChainIdResolver.resolve(configManager, localConfig, remoteConfig, deploymentName);

  beforeEach((): void => {
    configManager = sinon.createStubInstance(ConfigManager);
    configManager.wasFlagProvidedByUser.returns(false);

    deployment = {name: deploymentName, chainId: undefined};
    ledger = {chainId: undefined};
    localPersist = sinon.stub().resolves();
    remotePersist = sinon.stub().resolves();
    remoteLoaded = true;

    localConfig = {
      configuration: {deployments: [deployment as unknown as Deployment]},
      persist: localPersist,
    } as unknown as LocalConfigRuntimeState;

    remoteConfig = {
      get configuration(): unknown {
        return remoteLoaded ? {ledger} : undefined;
      },
      isLoaded: (): boolean => remoteLoaded,
      persist: remotePersist,
    } as unknown as RemoteConfigRuntimeStateApi;
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('without --chain-id', (): void => {
    it('should use the chain ID stored in the remote config', async (): Promise<void> => {
      ledger.chainId = 1234;
      deployment.chainId = 298;

      expect(await resolve()).to.equal('1234');
    });

    it('should use the chain ID stored in the local config when the remote config has none', async (): Promise<void> => {
      deployment.chainId = 1234;

      expect(await resolve()).to.equal('1234');
    });

    it('should use the chain ID stored in the local config when the remote config is not loaded', async (): Promise<void> => {
      remoteLoaded = false;
      deployment.chainId = 1234;

      expect(await resolve()).to.equal('1234');
    });

    it('should fall back to the flag default when the deployment stores no chain ID', async (): Promise<void> => {
      const expected: string = String(Number(flags.chainId.definition.defaultValue as string));

      expect(await resolve()).to.equal(expected);
    });

    it('should not write to the local or remote config', async (): Promise<void> => {
      deployment.chainId = 1234;

      await resolve();

      expect(localPersist.called).to.be.false;
      expect(remotePersist.called).to.be.false;
      expect(ledger.chainId).to.be.undefined;
    });
  });

  describe('with --chain-id', (): void => {
    it('should use the flag over the stored chain ID', async (): Promise<void> => {
      ledger.chainId = 298;
      deployment.chainId = 298;
      supplyChainId('1234');

      expect(await resolve()).to.equal('1234');
    });

    it('should write the chain ID back to the local and remote config', async (): Promise<void> => {
      ledger.chainId = 298;
      deployment.chainId = 298;
      supplyChainId('1234');

      await resolve();

      expect(deployment.chainId).to.equal(1234);
      expect(ledger.chainId).to.equal(1234);
      expect(localPersist.calledOnce).to.be.true;
      expect(remotePersist.calledOnce).to.be.true;
    });

    it('should store a chain ID on a deployment that has none', async (): Promise<void> => {
      supplyChainId('1234');

      await resolve();

      expect(deployment.chainId).to.equal(1234);
      expect(ledger.chainId).to.equal(1234);
    });

    it('should convert a hex chain ID to decimal before returning and storing it', async (): Promise<void> => {
      supplyChainId('0x12a');

      expect(await resolve()).to.equal('298');
      expect(deployment.chainId).to.equal(298);
      expect(ledger.chainId).to.equal(298);
    });

    it('should not persist when the stored chain ID already matches', async (): Promise<void> => {
      ledger.chainId = 1234;
      deployment.chainId = 1234;
      supplyChainId('1234');

      await resolve();

      expect(localPersist.called).to.be.false;
      expect(remotePersist.called).to.be.false;
    });

    it('should write only the local config when the remote config is not loaded', async (): Promise<void> => {
      remoteLoaded = false;
      supplyChainId('1234');

      await resolve();

      expect(deployment.chainId).to.equal(1234);
      expect(localPersist.calledOnce).to.be.true;
      expect(remotePersist.called).to.be.false;
    });

    it('should reject an invalid chain ID without writing it', async (): Promise<void> => {
      supplyChainId('abc');

      await expect(resolve()).to.be.rejected;
      expect(deployment.chainId).to.be.undefined;
      expect(localPersist.called).to.be.false;
      expect(remotePersist.called).to.be.false;
    });
  });
});
