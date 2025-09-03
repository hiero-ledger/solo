// // SPDX-License-Identifier: Apache-2.0
//
// import {inject, injectable} from 'tsyringe-neo';
// import {patchInject} from '../dependency-injection/container-helper.js';
// import {InjectTokens} from '../dependency-injection/inject-tokens.js';
// import {PackageDownloader} from '../package-downloader.js';
// import {PodmanDependencyManager} from './podman-dependency-manager.js';
//
// const PODMAN_RELEASES_LIST_URL: string = 'https://api.github.com/repos/containers/podman/releases';
//
// @injectable()
// export class PodmanDependencyManagerBuilder {
//   public constructor(
//     @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
//   ) {
//     osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, PodmanDependencyManager.name);
//   }
//
//   public async build(): Promise<PodmanDependencyManager> {
//     return new PodmanDependencyManager();
//   }
// }
