// SPDX-License-Identifier: Apache-2.0

import yaml from 'yaml';
import {ValuesFileParseFailedSoloError} from '../errors/classes/validation/values-file-parse-failed-solo-error.js';

/**
 * Single entry point for turning Helm values file content into an object graph.
 *
 * Every values file solo reads — user supplied via `--values-file` or cached under the solo home directory — must be
 * parsed through here so that an unparseable file fails the command with a coded error naming the offending path
 * instead of being silently ignored or handed to Helm as-is.
 */
export class ValuesFileParser {
  /**
   * Parses the content of a values file as YAML.
   *
   * @param valuesFilePath - path the content was read from; reported in the error so the user knows which file to fix
   * @param content - raw file content
   * @returns the parsed document, which is `null` for an empty file
   * @throws ValuesFileParseFailedSoloError when the content is not valid YAML
   */
  public static parse(valuesFilePath: string, content: string): unknown {
    try {
      return yaml.parse(content);
    } catch (error) {
      throw new ValuesFileParseFailedSoloError(valuesFilePath, error as Error);
    }
  }
}
