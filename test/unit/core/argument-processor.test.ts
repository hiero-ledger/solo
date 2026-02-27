// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {Container} from '../../../src/core/dependency-injection/container-init.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import * as constants from '../../../src/core/constants.js';
import {ArgumentProcessor} from '../../../src/argument-processor.js';

describe('ArgumentProcessor', (): void => {
  let originalExit: (code?: string | number | null | undefined) => never;
  let originalExitCode: number | string | undefined;
  let consoleOutput: string[];
  let originalConsoleLog: (...data: unknown[]) => void;

  beforeEach((): void => {
    // Initialize container
    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
    void container.resolve(InjectTokens.SoloLogger);

    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...arguments_: unknown[]): void => {
      consoleOutput.push(arguments_.map(String).join(' '));
    };

    // Mock process.exit to prevent test from exiting
    originalExit = process.exit;
    originalExitCode = process.exitCode;
    process.exit = ((): never => {
      throw new Error('process.exit called');
    }) as typeof process.exit;
    process.exitCode = undefined;
  });

  afterEach((): void => {
    // Restore original functions
    console.log = originalConsoleLog;
    process.exit = originalExit;
    process.exitCode = originalExitCode;
  });

  describe('Missing Subcommands - Level 1 (Command Groups)', () => {
    it('should show help when running command without subcommand', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        // Should throw SilentBreak
        expect((error as Error).constructor.name).to.equal('SilentBreak');
        expect((error as Error).message).to.include('No subcommand provided');
      }

      // Verify help was shown
      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus');
      expect(output).to.include('Commands:');
      expect(output).to.include('consensus network');
      expect(output).to.include('consensus node');
    });

    it('should exit cleanly and show subcommands/options for consensus', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus');
      expect(output).to.include('Commands:');
      expect(output).to.include('Options:');
      expect(process.exitCode).to.not.equal(1);
    });
  });

  describe('Missing Subcommands - Level 2 (Command Subgroups)', () => {
    it('should show help when running subgroup without action', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus network');
      expect(output).to.include('Commands:');
      expect(output).to.include('deploy');
      expect(output).to.include('destroy');
      expect(output).to.include('freeze');
      expect(output).to.include('upgrade');
    });

    it('should exit cleanly and show subgroup commands/options for consensus network', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus network');
      expect(output).to.include('Commands:');
      expect(output).to.include('Options:');
      expect(process.exitCode).to.not.equal(1);
    });
  });

  describe('Invalid Commands', () => {
    it('should show error and help for unknown top-level command', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'invalid-command'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
        expect((error as Error).message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });

    it('should show error for unknown second-level command', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'invalid-subcommand'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
        expect((error as Error).message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });

    it('should show error for unknown third-level command', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'invalid-action'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
        expect((error as Error).message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });
  });

  describe('Missing Required Arguments - Level 3 (Actions)', () => {
    it('should show error when missing required argument', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
        expect((error as Error).message).to.include('deployment');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Missing required argument');
      expect(output).to.include('deployment');
    });

    it('should fail for destroy without deployment and include exact message', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'destroy'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
        expect.fail('Expected SoloError to be thrown');
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
        expect((error as Error).message).to.include('Missing required argument: deployment');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Missing required argument: deployment');
      expect(process.exitCode).to.equal(1);
    });
  });

  describe('Unknown Arguments', () => {
    it('should show error for unknown flag at action level', async (): Promise<void> => {
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
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
        expect((error as Error).message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Unknown');
    });
  });

  describe('Help Flag Behavior', () => {
    it('should show help when --help flag is used', async (): Promise<void> => {
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

    it('should show clean help for trailing help shorthand on action command', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'destroy', 'help'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus network destroy');
      expect(output).to.not.include('Missing required argument');
      expect(process.exitCode).to.not.equal(1);
    });

    it('should exit cleanly and show subgroup commands/options for consensus network help', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'help'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus network');
      expect(output).to.include('Commands:');
      expect(output).to.include('Options:');
      expect(output).to.not.include('Missing required argument');
      expect(process.exitCode).to.not.equal(1);
    });

    it('should exit cleanly and show subcommands/options for consensus help', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'help'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('consensus');
      expect(output).to.include('Commands:');
      expect(output).to.include('Options:');
      expect(output).to.not.include('Missing required argument');
      expect(process.exitCode).to.not.equal(1);
    });
  });

  describe('No Command Provided', () => {
    it('should show help when no command is provided', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      expect(output).to.include('Usage:');
      expect(output).to.include('solo <command>');
      expect(output).to.include('Commands:');
    });
  });

  describe('Error Message Quality', () => {
    it('should provide clear error message for missing required argument', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).message).to.include('Missing required argument');
        expect((error as Error).message).to.include('deployment');
      }

      const output: string = consoleOutput.join('\n');
      // Should show help with available options
      expect(output).to.include('Options:');
      expect(output).to.include('--deployment');
    });

    it('should provide clear error message for unknown command', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'invalid-command'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).message).to.include('Unknown');
      }

      const output: string = consoleOutput.join('\n');
      // Should show available commands
      expect(output).to.include('Commands:');
    });

    it('should not show ERROR banner when displaying help for missing subcommand', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus'];

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      const output: string = consoleOutput.join('\n');
      // Should NOT contain error banner
      expect(output).not.to.include('*********************************** ERROR');
      // Should contain help information
      expect(output).to.include('Commands:');
    });

    it('should throw SoloError for actual errors', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];

      try {
        await ArgumentProcessor.process(argv);
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error: unknown) {
        // Should throw SoloError for missing required arguments
        expect((error as Error).constructor.name).to.equal('SoloError');
        expect((error as Error).message).to.include('Missing required argument');
      }
    });
  });

  describe('Exit Code Behavior', () => {
    it('should not set error exit code when showing help for missing subcommand', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SilentBreak');
      }

      // Exit code should not be set to error (1) for help display
      expect(process.exitCode).not.to.equal(1);
    });

    it('should set error exit code for missing required arguments', async (): Promise<void> => {
      const argv: string[] = ['node', 'solo.ts', 'consensus', 'network', 'deploy'];
      process.exitCode = undefined;

      try {
        await ArgumentProcessor.process(argv);
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
      }

      // Exit code should be set to error (1) for actual errors
      expect(process.exitCode).to.equal(1);
    });

    it('should set error exit code for unknown arguments', async (): Promise<void> => {
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
      } catch (error: unknown) {
        expect((error as Error).constructor.name).to.equal('SoloError');
      }

      // Exit code should be set to error (1) for unknown arguments
      expect(process.exitCode).to.equal(1);
    });
  });
});
