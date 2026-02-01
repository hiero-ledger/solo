// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {Container} from '../../../src/core/dependency-injection/container-init.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import * as constants from '../../../src/core/constants.js';
import {ArgumentProcessor} from '../../../src/argument-processor.js';

describe('ArgumentProcessor', () => {
  let originalExit: (code?: string | number | null | undefined) => never;
  let originalExitCode: number | string | undefined;
  let consoleOutput: string[];
  let originalConsoleLog: (...data: any[]) => void;

  beforeEach(() => {
    // Initialize container
    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
    void container.resolve<SoloLogger>(InjectTokens.SoloLogger);

    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...arguments_: any[]): void => {
      consoleOutput.push(arguments_.map(String).join(' '));
    };

    // Mock process.exit to prevent test from exiting
    originalExit = process.exit;
    originalExitCode = process.exitCode;
    process.exit = ((): never => {
      throw new Error('process.exit called');
    }) as any;
    process.exitCode = undefined;
  });

  afterEach(() => {
    // Restore original functions
    console.log = originalConsoleLog;
    process.exit = originalExit;
    process.exitCode = originalExitCode;
  });

  describe('Missing Subcommands - Level 1 (Command Groups)', () => {
    it('should show help when running command without subcommand', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        // Should throw SilentBreak
        expect(error.constructor.name).to.equal('SilentBreak');
        expect(error.message).to.include('No subcommand provided');
      }

      // Verify help was shown
      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus');
      expect(output).to.include('Commands:');
      expect(output).to.include('consensus network');
      expect(output).to.include('consensus node');
    });
  });

  describe('Missing Subcommands - Level 2 (Command Subgroups)', () => {
    it('should show help when running subgroup without action', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus network');
      expect(output).to.include('Commands:');
      expect(output).to.include('deploy');
      expect(output).to.include('destroy');
      expect(output).to.include('freeze');
      expect(output).to.include('upgrade');
    });
  });

  describe('Invalid Commands', () => {
    it('should show error and help for unknown top-level command', async () => {
      const argv: string[] = ['node', 'solo.ts', 'invalid-command'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SoloError');
        expect(error.message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });

    it('should show error for unknown second-level command', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'invalid-subcommand'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SoloError');
        expect(error.message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });

    it('should show error for unknown third-level command', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'invalid-action'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SoloError');
        expect(error.message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });
  });

  describe('Missing Required Arguments - Level 3 (Actions)', () => {
    it('should show error when missing required argument', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SoloError');
        expect(error.message).to.include('deployment');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Missing required argument');
      expect(output).to.include('deployment');
    });
  });

  describe('Unknown Arguments', () => {
    it('should show error for unknown flag at action level', async () => {
      const argv: string[] = [
        'node',
        'solo.ts',
        'consensus',
        'network',
        'deploy',
        '--deployment',
        'test',
        '--unknown-flag',
      ];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SoloError');
        expect(error.message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });
  });

  describe('Help Flag Behavior', () => {
    it('should show help when --help flag is used', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', '--help'];

      try {
        await ArgumentProcessor.process(argv);
      } catch {
        // Should throw SilentBreak or Error (due to process.exit mock)
        // Just verify help was shown
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus');
      expect(output).to.include('Commands:');
    });
  });

  describe('No Command Provided', () => {
    it('should show help when no command is provided', async () => {
      const argv: string[] = ['node', 'solo.ts'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Usage:');
      expect(output).to.include('solo <command>');
      expect(output).to.include('Commands:');
    });
  });

  describe('Error Message Quality', () => {
    it('should provide clear error message for missing required argument', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.message).to.include('Missing required argument');
        expect(error.message).to.include('deployment');
      }

      const output: string = consoleOutput.join('\n');
      // Should show help with available options
      expect(output).to.include('Options:');
      expect(output).to.include('--deployment');
    });

    it('should provide clear error message for unknown command', async () => {
      const argv: string[] = ['node', 'solo.ts', 'invalid-command'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      // Should show available commands
      expect(output).to.include('Commands:');
    });

    it('should not show ERROR banner when displaying help for missing subcommand', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      // Should NOT contain error banner
      expect(output).not.to.include('*********************************** ERROR');
      // Should contain help information
      expect(output).to.include('Commands:');
    });

    it('should throw SoloError for actual errors', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];

      try {
        await ArgumentProcessor.process(argv);
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        // Should throw SoloError for missing required arguments
        expect(error.constructor.name).to.equal('SoloError');
        expect(error.message).to.include('Missing required argument');
      }
    });
  });

  describe('Exit Code Behavior', () => {
    it('should not set error exit code when showing help for missing subcommand', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SilentBreak');
      }

      // Exit code should not be set to error (1) for help display
      expect(process.exitCode).not.to.equal(1);
    });

    it('should set error exit code for missing required arguments', async () => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SoloError');
      }

      // Exit code should be set to error (1) for actual errors
      expect(process.exitCode).to.equal(1);
    });

    it('should set error exit code for unknown arguments', async () => {
      const argv: string[] = [
        'node',
        'solo.ts',
        'consensus',
        'network',
        'deploy',
        '--deployment',
        'test',
        '--unknown-flag',
      ];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: any) {
        expect(error.constructor.name).to.equal('SoloError');
      }

      // Exit code should be set to error (1) for unknown arguments
      expect(process.exitCode).to.equal(1);
    });
  });
});
