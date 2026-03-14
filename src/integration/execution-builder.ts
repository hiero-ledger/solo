// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';

export class ExecutionBuilder {
  public prefixPath(environment: Record<string, string>, prefix: string): void {
    // find the PATH variable in the environment variables, ignoring case sensitivity, POSIX is PATH, Windows is Path or PATH
    const pathKey: string = Object.keys(environment).find((key: string): boolean => key.toLowerCase() === 'path');
    if (pathKey) {
      environment[pathKey] = `${prefix}${path.delimiter}${environment[pathKey]}`;
    } else {
      environment['PATH'] = prefix || '';
    }
  }
}
