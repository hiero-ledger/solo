// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import chalk from 'chalk';
import path from 'node:path';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';

@injectable()
export class Zippy {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Zip a file or directory
   * @param srcPath - path to a file or directory
   * @param destPath - path to the output zip file
   * @param [verbose] - if true, log the progress
   * @returns path to the output zip file
   */
  async zip(sourcePath: string, destinationPath: string, _verbose = false) {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }
    if (!destinationPath.endsWith('.zip')) {
      throw new SoloErrors.validation.missingArgument('destPath must be a path to a zip file');
    }

    try {
      const zip = new AdmZip('', {});

      const stat = fs.statSync(sourcePath);
      if (stat.isDirectory()) {
        zip.addLocalFolder(sourcePath, '');
      } else {
        zip.addFile(path.basename(sourcePath), fs.readFileSync(sourcePath), '', stat as any);
      }

      await zip.writeZipPromise(destinationPath, {overwrite: true});

      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloErrors.system.archiveUnzipFailed(sourcePath, error);
    }
  }

  unzip(sourcePath: string, destinationPath: string, verbose = false) {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloErrors.validation.illegalArgument('srcPath does not exists', sourcePath);
    }

    try {
      const zip = new AdmZip(sourcePath, {readEntries: true});

      for (const zipEntry of zip.getEntries()) {
        if (verbose) {
          this.logger.debug(`Extracting file: ${zipEntry.entryName} -> ${destinationPath}/${zipEntry.entryName} ...`, {
            src: zipEntry.entryName,
            dst: `${destinationPath}/${zipEntry.entryName}`,
          });
        }

        zip.extractEntryTo(zipEntry, destinationPath, true, true, true, zipEntry.entryName);
        if (verbose) {
          this.logger.showUser(
            chalk.green('OK'),
            `Extracted: ${zipEntry.entryName} -> ${destinationPath}/${zipEntry.entryName}`,
          );
        }
      }

      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloErrors.system.archiveUnzipFailed(sourcePath, error);
    }
  }

  tar(sourcePath: string, destinationPath: string) {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }
    if (!destinationPath.endsWith('.tar.gz')) {
      throw new SoloErrors.validation.missingArgument('destPath must be a path to a tar.gz file');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloErrors.validation.illegalArgument('srcPath does not exists', sourcePath);
    }

    try {
      tar.c(
        {
          gzip: true,
          file: destinationPath,
          sync: true,
        },
        [sourcePath],
      );
      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloErrors.system.archiveTarFailed(sourcePath, error);
    }
  }

  untar(sourcePath: string, destinationPath: string) {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloErrors.validation.illegalArgument('srcPath does not exists', sourcePath);
    }
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath);
    }

    try {
      tar.x({
        C: destinationPath,
        file: sourcePath,
        sync: true,
      });
      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloErrors.system.archiveUntarFailed(sourcePath, error);
    }
  }
}
