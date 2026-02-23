// SPDX-License-Identifier: Apache-2.0

import {type K8Factory} from '../k8-factory.js';
import {type K8} from '../k8.js';
import {K8Client} from './k8-client.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';

@injectable()
export class K8ClientFactory implements K8Factory {
  private readonly k8Clients: Map<string, K8> = new Map<string, K8>();
  private readonly kubectlExecutable: string;
  private readonly prependToPath: string;

  public constructor(
    @inject(InjectTokens.KubectlInstallationDir) installationDirectory: string,
    @inject(InjectTokens.OsPlatform) platform: string,
  ) {
    this.kubectlExecutable = platform === 'win32' ? 'kubectl.exe' : 'kubectl';
    this.prependToPath = installationDirectory;
  }

  public getK8(context: string): K8 {
    if (!this.k8Clients.has(context)) {
      this.k8Clients.set(context, this.createK8Client(context));
    }

    return this.k8Clients.get(context)!;
  }

  /**
   * Create a new k8Factory client for the given context
   * @param context - The context to create the k8Factory client for
   * @returns a new k8Factory client
   */
  private createK8Client(context: string): K8 {
    return new K8Client(context, this.kubectlExecutable, this.prependToPath);
  }

  public default(): K8 {
    return new K8Client(undefined, this.kubectlExecutable, this.prependToPath);
  }
}
