// SPDX-License-Identifier: Apache-2.0

import {type ErrorRegistryEntry} from './error-registry-entry.js';
import {ErrorCategory} from './error-category.js';
import {SoloErrorCode} from './solo-error-code.js';

const DOC_BASE: string = 'https://solo.hiero.org/docs/errors';

const REGISTRY_ENTRIES: ReadonlyArray<ErrorRegistryEntry> = [
  {
    code: SoloErrorCode.LOCAL_CONFIG_NOT_FOUND,
    category: ErrorCategory.CONFIGURATION,
    messageTemplate: 'local_config_not_found_message',
    retryable: false,
    troubleshootingSteps: 'local_config_not_found_troubleshooting_steps',
  },
  {
    code: SoloErrorCode.REMOTE_CONFIGS_MISMATCH,
    category: ErrorCategory.CONFIGURATION,
    messageTemplate: 'remote_configs_mismatch_message',
    retryable: false,
    troubleshootingSteps: 'remote_configs_mismatch_troubleshooting_steps',
  },
  {
    code: SoloErrorCode.DEPLOYMENT_NAME_ALREADY_EXISTS,
    category: ErrorCategory.DEPLOYMENT,
    messageTemplate: 'deployment_already_exists_message',
    retryable: false,
    troubleshootingSteps: 'deployment_already_exists_troubleshooting_steps',
  },
];

export class ErrorRegistry {
  private static readonly registryMap: ReadonlyMap<SoloErrorCode, ErrorRegistryEntry> = new Map(
    REGISTRY_ENTRIES.map((entry: ErrorRegistryEntry): [SoloErrorCode, ErrorRegistryEntry] => [entry.code, entry]),
  );

  public static get(code: SoloErrorCode): ErrorRegistryEntry | undefined {
    return ErrorRegistry.registryMap.get(code);
  }

  public static getAll(): ReadonlyMap<SoloErrorCode, ErrorRegistryEntry> {
    return ErrorRegistry.registryMap;
  }

  /** Returns the human-readable label, e.g. "SOLO-3004" */
  public static formatCode(code: SoloErrorCode): string {
    return `SOLO-${code}`;
  }

  /** Returns the documentation URL for the given error code, e.g. "https://solo.hiero.org/docs/errors/SOLO-2004" */
  public static getDocUrl(code: SoloErrorCode): string {
    return `${DOC_BASE}/${ErrorRegistry.formatCode(code)}`;
  }

  /**
   * Interpolates {{key}} placeholders in a template string using the provided context.
   * Unknown placeholders are left unchanged.
   */
  public static interpolate(
    template: string,
    context: Readonly<Record<string, string | number | boolean | undefined>>,
  ): string {
    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match: string, key: string): string => {
      const value: string | number | boolean | undefined = context[key];
      return value === undefined ? `{{${key}}}` : String(value);
    });
  }
}
