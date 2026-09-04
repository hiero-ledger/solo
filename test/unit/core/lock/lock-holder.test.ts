// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {LockHolder} from '../../../../src/core/lock/lock-holder.js';

/**
 * Unit tests for {@link LockHolder.isProcessLost}, the predicate `IntervalLock` uses to decide
 * whether a same-machine lease can be reclaimed. The behavior under test is the union of
 * {@link LockHolder.isProcessAlive} and {@link LockHolder.isProcessSuspended}.
 */
describe('LockHolder process state', (): void => {
  // process.pid is guaranteed to exist and be running while this test executes.
  const ALIVE_RUNNING_PID: number = process.pid;
  // A very large PID that is overwhelmingly unlikely to exist on the test runner.
  const DEAD_PID: number = 2_147_483_647;

  it('reports the current process as alive', (): void => {
    const holder: LockHolder = makeHolderWithPid(ALIVE_RUNNING_PID);
    expect(holder.isProcessAlive()).to.equal(true);
  });

  it('reports a nonexistent PID as not alive', (): void => {
    const holder: LockHolder = makeHolderWithPid(DEAD_PID);
    expect(holder.isProcessAlive()).to.equal(false);
  });

  it('reports the current (running) process as not suspended', (): void => {
    const holder: LockHolder = makeHolderWithPid(ALIVE_RUNNING_PID);
    expect(holder.isProcessSuspended()).to.equal(false);
  });

  it('reports a nonexistent PID as not suspended (defensive default on read failure)', (): void => {
    const holder: LockHolder = makeHolderWithPid(DEAD_PID);
    expect(holder.isProcessSuspended()).to.equal(false);
  });

  it('does not flag the current running process as lost', (): void => {
    const holder: LockHolder = makeHolderWithPid(ALIVE_RUNNING_PID);
    expect(holder.isProcessLost()).to.equal(false);
  });

  it('flags a nonexistent PID as lost', (): void => {
    const holder: LockHolder = makeHolderWithPid(DEAD_PID);
    expect(holder.isProcessLost()).to.equal(true);
  });
});

function makeHolderWithPid(pid: number): LockHolder {
  // LockHolder.of() forces process.pid, so we round-trip through JSON to inject the desired PID.
  const template: LockHolder = LockHolder.of('lock-holder-test');
  const serialized: Record<string, unknown> = {
    username: template.username,
    hostname: template.hostname,
    pid,
  };
  return LockHolder.fromJson(JSON.stringify(serialized));
}
