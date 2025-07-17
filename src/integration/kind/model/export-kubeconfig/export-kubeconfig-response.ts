// SPDX-License-Identifier: Apache-2.0

export class ExportKubeConfigResponse {
  private readonly _kubeConfigContext: string | undefined;

  public constructor(protected readonly _rawOutput: string) {
    // Extract context name
    const contextMatch: RegExpMatchArray | null = this._rawOutput.match(/Set kubectl context to "([^"]+)"/);
    this._kubeConfigContext = contextMatch ? contextMatch[1] : undefined;
  }

  public get kubeConfigContext(): string | undefined {
    return this._kubeConfigContext;
  }
}
