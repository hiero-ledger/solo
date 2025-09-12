// SPDX-License-Identifier: Apache-2.0

export class ClusterCreateResponse {
  private readonly _name: string | undefined;
  private readonly _context: string | undefined;
  private readonly _rawOutput: string | undefined;

  public constructor() {
    // eslint-disable-next-line prefer-rest-params
    this._rawOutput = [...arguments].join('\n');

    // Extract cluster name
    const nameMatch: RegExpMatchArray = this._rawOutput.match(/Creating cluster "([^"]+)"/);
    this._name = nameMatch ? nameMatch[1] : undefined;

    // Extract kubectl context
    const contextMatch: RegExpMatchArray = this._rawOutput.match(/Set kubectl context to "([^"]+)"/);
    this._context = contextMatch ? contextMatch[1] : undefined;
  }

  public get name(): string | undefined {
    return this._name;
  }

  public get context(): string | undefined {
    return this._context;
  }
}
