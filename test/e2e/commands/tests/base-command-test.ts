// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag} from '../../../../src/types/flag-types.js';
import {Flags} from '../../../../src/commands/flags.js';
import {getTestCacheDirectory} from '../../../test-utility.js';
import {type BaseTestOptions} from './base-test-options.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type NodeCommand} from '../../../../src/commands/node/index.js';
import {DeploymentCommandDefinition} from '../../../../src/commands/command-definitions/deployment-command-definition.js';
import {Argv} from '../../../helpers/argv-wrapper.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {getEnvironmentVariable} from '../../../../src/core/constants.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {Templates} from '../../../../src/core/templates.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';

export class BaseCommandTest {
  public static newArgv(): string[] {
    return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  }

  public static optionFromFlag(flag: CommandFlag): string {
    return `--${flag.name}`;
  }

  public static argvPushGlobalFlags(
    argv: string[],
    testName: string,
    shouldSetTestCacheDirectory: boolean = false,
    shouldSetChartDirectory: boolean = false,
  ): string[] {
    argv.push(BaseCommandTest.optionFromFlag(Flags.devMode), BaseCommandTest.optionFromFlag(Flags.quiet));

    const soloChartsDirectory: string = getEnvironmentVariable('SOLO_CHARTS_DIR');
    if (shouldSetChartDirectory && soloChartsDirectory && soloChartsDirectory !== '') {
      argv.push(BaseCommandTest.optionFromFlag(Flags.chartDirectory), process.env.SOLO_CHARTS_DIR);
    }

    if (shouldSetTestCacheDirectory) {
      argv.push(BaseCommandTest.optionFromFlag(Flags.cacheDir), getTestCacheDirectory(testName));
    }

    return argv;
  }

  /**
   * Collects diagnostic logs using the deployment diagnostics command.
   * This is a shared helper used by both test patterns.
   */
  public static async collectDiagnosticLogs(
    testName: string,
    testLogger: SoloLogger,
    deployment: string,
  ): Promise<void> {
    try {
      testLogger.info(`${testName}: Collecting diagnostic logs...`);

      // Create proper Argv object
      const argv: Argv = Argv.getDefaultArgv(NamespaceName.of(testName));
      argv.setArg(Flags.deployment, deployment);
      argv.setCommand(
        DeploymentCommandDefinition.COMMAND_NAME,
        DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME,
        DeploymentCommandDefinition.DIAGNOSTIC_LOGS,
      );

      const nodeCmd: NodeCommand = container.resolve<NodeCommand>(InjectTokens.NodeCommand);
      await nodeCmd.handlers.logs(argv.build());

      testLogger.info(`${testName}: Diagnostic logs collected successfully`);
    } catch (error: unknown) {
      testLogger.error(`${testName}: Error collecting diagnostic logs: ${error}`);
      if (error instanceof Error && error.stack) {
        testLogger.error(`${testName}: Stack trace:\n${error.stack}`);
      }
    }
  }

  public static async collectJavaFlightRecorderLogs(
    testName: string,
    testLogger: SoloLogger,
    deployment: string,
    nodeAlias: string,
  ): Promise<void> {
    try {
      testLogger.info(`${testName}: Collecting jfr logs...`);

      // Create proper Argv object
      const argv: Argv = Argv.getDefaultArgv(NamespaceName.of(testName));
      argv.setArg(Flags.deployment, deployment);
      argv.setArg(Flags.nodeAlias, nodeAlias);
      argv.setCommand(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.COLLECT_JFC,
      );

      const nodeCmd: NodeCommand = container.resolve<NodeCommand>(InjectTokens.NodeCommand);
      await nodeCmd.handlers.collectJavaFlightRecorderLogs(argv.build());

      testLogger.info(`${testName}: Java Flight Recorder logs for node ${nodeAlias} collected successfully`);
    } catch (error: unknown) {
      testLogger.error(`${testName}: Error collecting Java Flight Recorder logs for node  ${nodeAlias}: ${error}`);
      if (error instanceof Error && error.stack) {
        testLogger.error(`${testName}: Stack trace:\n${error.stack}`);
      }
    }
  }

  /**
   * Sets up an after() hook for diagnostic log collection in E2E tests.
   * Call this within your test suite describe block.
   */
  public static setupDiagnosticLogCollection(options: BaseTestOptions): void {
    const {testName, testLogger, deployment} = options;

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());

      await BaseCommandTest.collectDiagnosticLogs(testName, testLogger, deployment);
    });
  }

  /**
   * Sets up an after() hook for diagnostic log collection in E2E tests.
   * Call this within your test suite describe block.
   */
  public static setupJavaFlightRecorderLogCollection(options: BaseTestOptions): void {
    const {testName, testLogger, deployment} = options;

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());

      const promises: Promise<void>[] = [];
      for (let index: number = 0; index < options.consensusNodesCount; index++) {
        const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(index + 1);
        promises.push(BaseCommandTest.collectJavaFlightRecorderLogs(testName, testLogger, deployment, nodeAlias));
      }

      await Promise.all(promises);
    });
  }
}
