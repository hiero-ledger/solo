// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {spawn, type ChildProcess} from 'node:child_process';
import process from 'node:process';
import {LockHolder} from '../../../src/core/lock/lock-holder.js';

/** A PID large enough that it is virtually guaranteed not to exist on any platform. */
const NON_EXISTENT_PID: number = 2_147_483_647;

describe('LockHolder', (): void => {
  describe('isProcessAlive', (): void => {
    it('should return true for the current running process', (): void => {
      const holder: LockHolder = LockHolder.default();
      expect(holder.isProcessAlive()).to.be.true;
    });

    it('should return false for a non-existent process', (): void => {
      const holder: LockHolder = LockHolder.fromJson(
        JSON.stringify({username: 'testuser', hostname: 'testhost', pid: NON_EXISTENT_PID}),
      );
      expect(holder.isProcessAlive()).to.be.false;
    });

    it('should return false for a stopped/suspended process', function (this: Mocha.Context): void {
      if (process.platform === 'win32') {
        this.skip();
      }

      const child: ChildProcess = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {detached: false});
      expect(child.pid).to.be.a('number');

      const holder: LockHolder = LockHolder.fromJson(
        JSON.stringify({username: 'testuser', hostname: 'testhost', pid: child.pid}),
      );

      try {
        // Verify the process is alive before stopping it
        expect(holder.isProcessAlive()).to.be.true;

        // Suspend the process (equivalent to Ctrl+Z / SIGTSTP)
        process.kill(child.pid, 'SIGSTOP');

        // Verify the suspended process is detected as not alive for lock management
        expect(holder.isProcessAlive()).to.be.false;
      } finally {
        // Resume and terminate the child process to clean up
        try {
          process.kill(child.pid, 'SIGCONT');
        } catch {
          // Ignore errors during cleanup
        }
        child.kill();
      }
    });
  });
});
