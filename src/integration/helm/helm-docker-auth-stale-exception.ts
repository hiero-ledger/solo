// SPDX-License-Identifier: Apache-2.0

export class HelmDockerAuthStaleException extends Error {
  public constructor() {
    super('GHCR stale Docker authentication detected');
    this.name = 'HelmDockerAuthStaleException';
    // eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace
    Error.captureStackTrace(this, this.constructor);
  }
}
