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

    if (shouldSetChartDirectory && process.env.SOLO_CHARTS_DIR && process.env.SOLO_CHARTS_DIR !== '') {
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
  public static async collectDiagnosticLogs(testName: string, testLogger: SoloLogger, deployment: string): Promise<void> {
    try {
      testLogger.info(`${testName}: Collecting diagnostic logs...`);

      // Create proper Argv object
      const argv: Argv = Argv.getDefaultArgv(NamespaceName.of(testName));
      argv.setArg(Flags.deployment, deployment);
      argv.setCommand(
        DeploymentCommandDefinition.COMMAND_NAME,
        DeploymentCommandDefinition.DIAGNOSTIC_SUBCOMMAND_NAME,
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

  /**
   * Sets up an after() hook for diagnostic log collection in E2E tests.
   * Call this within your test suite describe block.
   */
  public static setupDiagnosticLogCollection(options: BaseTestOptions): void {
    const {testName, testLogger, deployment} = options;

    after(async (): Promise<void> => {
      await BaseCommandTest.collectDiagnosticLogs(testName, testLogger, deployment);
    });
  }
}
