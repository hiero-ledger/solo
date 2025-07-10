// SPDX-License-Identifier: Apache-2.0

export class ExportKubeconfigResponse {
  private readonly _kubectlContext: string | undefined;

  public constructor(protected readonly _rawOutput: string) {
    // Extract context name
    const contextMatch: RegExpMatchArray | null = this._rawOutput.match(/Set kubectl context to "([^"]+)"/);
    this._kubectlContext = contextMatch ? contextMatch[1] : undefined;
  }

  public get kubectlContext(): string | undefined {
    return this._kubectlContext;
  }
}
