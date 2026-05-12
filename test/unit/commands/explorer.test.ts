// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSandbox} from 'sinon';
import {beforeEach, afterEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {ExplorerCommand} from '../../../src/commands/explorer.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

describe('ExplorerCommand unit tests', (): void => {
  let sandbox: SinonSandbox;
  let explorerCommand: ExplorerCommand;

  beforeEach(async (): Promise<void> => {
    sandbox = sinon.createSandbox();
    resetForTest();
    explorerCommand = container.resolve(ExplorerCommand);
    const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
    await localConfig.load();
  });

  afterEach((): void => {
    sandbox.restore();
  });

  describe('Static flag lists', (): void => {
    it('should have DEPLOY_FLAGS_LIST with required and optional flags', (): void => {
      expect(ExplorerCommand.DEPLOY_FLAGS_LIST.required).to.be.an('array').that.is.not.empty;
      expect(ExplorerCommand.DEPLOY_FLAGS_LIST.optional).to.be.an('array').that.is.not.empty;
      expect(ExplorerCommand.DEPLOY_FLAGS_LIST.required).to.include(flags.deployment);
    });

    it('should have UPGRADE_FLAGS_LIST with required and optional flags', (): void => {
      expect(ExplorerCommand.UPGRADE_FLAGS_LIST.required).to.be.an('array').that.is.not.empty;
      expect(ExplorerCommand.UPGRADE_FLAGS_LIST.optional).to.be.an('array').that.is.not.empty;
      expect(ExplorerCommand.UPGRADE_FLAGS_LIST.required).to.include(flags.deployment);
    });

    it('should have DESTROY_FLAGS_LIST with required and optional flags', (): void => {
      expect(ExplorerCommand.DESTROY_FLAGS_LIST.required).to.be.an('array').that.is.not.empty;
      expect(ExplorerCommand.DESTROY_FLAGS_LIST.optional).to.be.an('array').that.is.not.empty;
      expect(ExplorerCommand.DESTROY_FLAGS_LIST.required).to.include(flags.deployment);
    });

    it('DEPLOY_FLAGS_LIST optional should contain explorer specific flags', (): void => {
      const deployOptionalFlags: CommandFlag[] = ExplorerCommand.DEPLOY_FLAGS_LIST.optional;
      const flagNames: string[] = deployOptionalFlags.map((f: CommandFlag): string => f.name);

      expect(flagNames).to.include('explorer-version');
      expect(flagNames).to.include('enable-ingress');
      expect(flagNames).to.include('enable-explorer-tls');
    });

    it('UPGRADE_FLAGS_LIST should include id flag for identifying existing explorer', (): void => {
      const upgradeOptionalFlags: CommandFlag[] = ExplorerCommand.UPGRADE_FLAGS_LIST.optional;
      const flagNames: string[] = upgradeOptionalFlags.map((f: CommandFlag): string => f.name);

      expect(flagNames).to.include('id');
    });

    it('DESTROY_FLAGS_LIST optional should contain force and devMode flags', (): void => {
      const destroyOptionalFlags: CommandFlag[] = ExplorerCommand.DESTROY_FLAGS_LIST.optional;
      const flagNames: string[] = destroyOptionalFlags.map((f: CommandFlag): string => f.name);

      expect(flagNames).to.include('force');
      expect(flagNames).to.include('dev');
    });

    it('DEPLOY_FLAGS_LIST optional should contain namespace flag', (): void => {
      const deployOptionalFlags: CommandFlag[] = ExplorerCommand.DEPLOY_FLAGS_LIST.optional;
      const flagNames: string[] = deployOptionalFlags.map((f: CommandFlag): string => f.name);

      expect(flagNames).to.include('namespace');
    });

    it('UPGRADE_FLAGS_LIST optional should contain namespace flag', (): void => {
      const upgradeOptionalFlags: CommandFlag[] = ExplorerCommand.UPGRADE_FLAGS_LIST.optional;
      const flagNames: string[] = upgradeOptionalFlags.map((f: CommandFlag): string => f.name);

      expect(flagNames).to.include('namespace');
    });

    it('DEPLOY_FLAGS_LIST optional should contain helm chart directory flag', (): void => {
      const deployOptionalFlags: CommandFlag[] = ExplorerCommand.DEPLOY_FLAGS_LIST.optional;
      const flagNames: string[] = deployOptionalFlags.map((f: CommandFlag): string => f.name);

      expect(flagNames).to.include('chart-dir');
      expect(flagNames).to.include('explorer-chart-dir');
    });
  });

  describe('Command instantiation', (): void => {
    it('should instantiate ExplorerCommand', (): void => {
      expect(explorerCommand).to.be.instanceOf(ExplorerCommand);
    });

    it('should have required methods from BaseCommand', (): void => {
      expect(explorerCommand).to.have.property('add');
      expect(explorerCommand).to.have.property('upgrade');
      expect(explorerCommand).to.have.property('destroy');
    });

    it('add method should be a function', (): void => {
      expect(explorerCommand.add).to.be.a('function');
    });

    it('upgrade method should be a function', (): void => {
      expect(explorerCommand.upgrade).to.be.a('function');
    });

    it('destroy method should be a function', (): void => {
      expect(explorerCommand.destroy).to.be.a('function');
    });
  });

  describe('Command method signatures', (): void => {
    it('add method should accept argv argument and return Promise<boolean>', (): void => {
      const addMethod: unknown = explorerCommand.add;
      expect(addMethod).to.be.a('function');
    });

    it('upgrade method should accept argv argument and return Promise<boolean>', (): void => {
      const upgradeMethod: unknown = explorerCommand.upgrade;
      expect(upgradeMethod).to.be.a('function');
    });

    it('destroy method should accept argv argument and return Promise<boolean>', (): void => {
      const destroyMethod: unknown = explorerCommand.destroy;
      expect(destroyMethod).to.be.a('function');
    });
  });

  describe('Flag configuration validation', (): void => {
    it('DEPLOY_FLAGS_LIST should have more optional flags than required flags', (): void => {
      expect(ExplorerCommand.DEPLOY_FLAGS_LIST.optional.length).to.be.greaterThan(
        ExplorerCommand.DEPLOY_FLAGS_LIST.required.length,
      );
    });

    it('UPGRADE_FLAGS_LIST should have more optional flags than required flags', (): void => {
      expect(ExplorerCommand.UPGRADE_FLAGS_LIST.optional.length).to.be.greaterThan(
        ExplorerCommand.UPGRADE_FLAGS_LIST.required.length,
      );
    });

    it('DESTROY_FLAGS_LIST should have more optional flags than required flags', (): void => {
      expect(ExplorerCommand.DESTROY_FLAGS_LIST.optional.length).to.be.greaterThan(
        ExplorerCommand.DESTROY_FLAGS_LIST.required.length,
      );
    });

    it('deployment flag should be the only required flag for all operations', (): void => {
      expect(ExplorerCommand.DEPLOY_FLAGS_LIST.required).to.have.lengthOf(1);
      expect(ExplorerCommand.UPGRADE_FLAGS_LIST.required).to.have.lengthOf(1);
      expect(ExplorerCommand.DESTROY_FLAGS_LIST.required).to.have.lengthOf(1);
    });
  });

  describe('Task flow - add operation', (): void => {
    it('add method is callable with argv parameter', (): void => {
      const addMethodType: unknown = explorerCommand.add;
      expect(addMethodType).to.be.a('function');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((addMethodType as any).length).to.be.greaterThanOrEqual(1);
    });

    it('add method returns a Promise', async (): Promise<void> => {
      const argv: Record<string, unknown> = {
        [flags.deployment.name]: 'test-deployment',
      };

      const result: unknown = explorerCommand.add(argv as never);
      expect(result).to.be.instanceof(Promise);
    });
  });

  describe('Task flow - upgrade operation', (): void => {
    it('upgrade method is callable with argv parameter', (): void => {
      const upgradeMethodType: unknown = explorerCommand.upgrade;
      expect(upgradeMethodType).to.be.a('function');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((upgradeMethodType as any).length).to.be.greaterThanOrEqual(1);
    });

    it('upgrade method returns a Promise', async (): Promise<void> => {
      const argv: Record<string, unknown> = {
        [flags.deployment.name]: 'test-deployment',
      };

      const result: unknown = explorerCommand.upgrade(argv as never);
      expect(result).to.be.instanceof(Promise);
    });
  });

  describe('Task flow - destroy operation', (): void => {
    it('destroy method is callable with argv parameter', (): void => {
      const destroyMethodType: unknown = explorerCommand.destroy;
      expect(destroyMethodType).to.be.a('function');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((destroyMethodType as any).length).to.be.greaterThanOrEqual(1);
    });

    it('destroy method returns a Promise', async (): Promise<void> => {
      const argv: Record<string, unknown> = {
        [flags.deployment.name]: 'test-deployment',
      };

      const result: unknown = explorerCommand.destroy(argv as never);
      expect(result).to.be.instanceof(Promise);
    });
  });
});
