// SPDX-License-Identifier: Apache-2.0

import {MissingArgumentError} from '../errors/missing-argument-error.js';
import {readFileSync} from 'node:fs';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

/**
 * A representation of a leaseholder who is identified by a username, hostname, and process id (PID). This implementation
 * is serializable to/from a JSON object and is comparable to other leaseholders.
 */
export class LockHolder {
  /** The user's identity which is typically the OS login username. */
  private readonly _username: string;

  /** The machine's identity which is typically the hostname. */
  private readonly _hostname: string;

  /** The process identifier which is typically the OS PID. */
  private readonly _processId: number;

  /**
   * Constructs a new leaseholder with the given username, hostname, and process id. This constructor is private and
   * should not be called directly. Use the static factory methods to create a new instance.
   *
   * @param username - the user's identity.
   * @param hostname - the machine's identity.
   * @param processId - the process identifier.
   */
  private constructor(username: string, hostname: string, processId: number) {
    if (!username) {
      throw new MissingArgumentError('username is required');
    }
    if (!hostname) {
      throw new MissingArgumentError('hostname is required');
    }
    if (!processId) {
      throw new MissingArgumentError('pid is required');
    }

    this._username = username;
    this._hostname = hostname;
    this._processId = processId;
  }

  /**
   * Creates a new leaseholder with the given username. The hostname is set to the current machine's hostname and the
   * process id is set to the current process's PID.
   * @param username - the user's identity.
   * @returns a new leaseholder instance.
   */
  public static of(username: string): LockHolder {
    return new LockHolder(username, os.hostname(), process.pid);
  }

  /**
   * Creates a new leaseholder by retrieving the current user's identity, the current machine's hostname, and the
   * current process's PID.
   * @returns a new leaseholder instance.
   */
  public static default(): LockHolder {
    return LockHolder.of(os.userInfo().username);
  }

  /**
   * The user's identity which is typically the OS login username.
   * @returns the user's identity.
   */
  public get username(): string {
    return this._username;
  }

  /**
   * The machine's identity which is typically the hostname.
   * @returns the machine's identity.
   */
  public get hostname(): string {
    return this._hostname;
  }

  /**
   * The process identifier which is typically the OS PID.
   * @returns the process identifier.
   */
  public get processId(): number {
    return this._processId;
  }

  /**
   * Returns a plain object representation of this leaseholder. This object may be serialized to JSON.
   * @returns a plain object representation of this leaseholder.
   */
  public toObject(): any {
    return {
      username: this._username,
      hostname: this._hostname,
      pid: this._processId,
    };
  }

  /**
   * Compares this leaseholder to another leaseholder to determine if they are equal. Two leaseholders are equal if
   * their username, hostname, and process id are the same.
   * @param other - the other leaseholder to compare.
   * @returns true if the leaseholders are equal; false otherwise.
   */
  public equals(other: LockHolder): boolean {
    return this.username === other.username && this.hostname === other.hostname && this.processId === other.processId;
  }

  /**
   * Compares this leaseholder to another leaseholder to determine if they are the same machine. Two leaseholders are
   * the same machine if their username and hostname are the same.
   * @param other - the other leaseholder to compare.
   * @returns true if the leaseholders are the same machine; false otherwise.
   */
  public isSameMachineIdentity(other: LockHolder): boolean {
    return this.username === other.username && this.hostname === other.hostname;
  }

  /**
   * Determines if the process associated with this leaseholder is still alive. This method will return false if the
   * process is not alive, is suspended/stopped (e.g. via Ctrl+Z), or an error occurs while checking the process status.
   * A suspended process cannot renew its lock, so it is treated as not alive for lock management purposes.
   * @returns true if the process is alive and running; false otherwise.
   */
  public isProcessAlive(): boolean {
    try {
      const exists: boolean = process.kill(this.processId, 0);
      if (!exists) {
        return false;
      }
      return !LockHolder.isProcessStopped(this.processId);
    } catch (error: any) {
      return error.code === 'EPERM';
    }
  }

  /**
   * Determines if the given process is in a stopped/suspended state (e.g. via Ctrl+Z / SIGTSTP).
   * A stopped process exists on the OS but cannot make progress or renew locks.
   * Returns false if the state cannot be determined (defaults to assuming the process is running).
   *
   * @param processId - the process identifier to check.
   * @returns true if the process is stopped/suspended; false otherwise or if indeterminate.
   */
  private static isProcessStopped(processId: number): boolean {
    // Validate that processId is a positive integer to prevent unexpected behaviour
    if (!Number.isInteger(processId) || processId <= 0) {
      return false;
    }
    try {
      if (process.platform === 'linux') {
        const status: string = readFileSync(`/proc/${processId}/status`, 'utf8');
        // State 'T' means stopped by job control signal (e.g. Ctrl+Z / SIGTSTP)
        // State 't' means stopped by debugger/tracer
        return /^State:\s+[Tt]/m.test(status);
      } else if (process.platform === 'darwin' || process.platform === 'freebsd') {
        const result: SpawnSyncReturns<Buffer> = spawnSync('ps', ['-p', String(processId), '-o', 'stat=']);
        if (result.status === 0) {
          const stat: string = (result.stdout?.toString() ?? '').trim();
          // 'T' in the stat field means the process is stopped
          return stat.startsWith('T');
        }
      }
    } catch {
      // If we cannot determine the process state, assume it is running
    }
    return false;
  }

  /**
   * Serializes this leaseholder to a JSON string representation.
   * @returns a JSON string representation of this leaseholder.
   */
  public toJson(): string {
    return JSON.stringify(this.toObject());
  }

  /**
   * Deserializes a JSON string representation of a leaseholder into a new leaseholder instance.
   * @param json - the JSON string representation of a leaseholder.
   * @returns a new leaseholder instance.
   */
  public static fromJson(json: string): LockHolder {
    const object: ReturnType<LockHolder['toObject']> = JSON.parse(json);
    return new LockHolder(object.username, object.hostname, object.pid);
  }
}
