// SPDX-License-Identifier: Apache-2.0

import {type ErrorRegistryEntry} from './error-registry-entry.js';
import {ErrorCategory} from './error-category.js';
import {SoloErrorCode} from './solo-error-code.js';

const DOC_BASE: string = 'https://solo.hiero.org/docs/errors';

const REGISTRY_ENTRIES: ReadonlyArray<ErrorRegistryEntry> = [
  {
    code: SoloErrorCode.LOCAL_CONFIG_NOT_FOUND,
    category: ErrorCategory.CONFIGURATION,
    messageTemplate: 'Local configuration file not found',
    retryable: false,
    docUrl: `${DOC_BASE}/SOLO-1001`,
    troubleshootingSteps: ['Create a local config: solo deployment config create'],
  },
  {
    code: SoloErrorCode.REMOTE_CONFIGS_MISMATCH,
    category: ErrorCategory.CONFIGURATION,
    messageTemplate: 'Remote configurations in clusters {{cluster1}} and {{cluster2}} do not match',
    retryable: false,
    docUrl: `${DOC_BASE}/SOLO-1012`,
    troubleshootingSteps: ['Inspect both configs: kubectl get configmap -n solo', 'Sync manually before retrying'],
  },
  {
    code: SoloErrorCode.POD_NOT_READY,
    category: ErrorCategory.DEPLOYMENT,
    messageTemplate: "Pod '{{pod}}' did not become ready within {{timeout}}s in namespace '{{namespace}}'",
    retryable: true,
    docUrl: `${DOC_BASE}/SOLO-2004`,
    troubleshootingSteps: [
      'kubectl get pods -n {{namespace}}',
      'kubectl describe pod {{pod}} -n {{namespace}}',
      'kubectl logs {{pod}} -n {{namespace}}',
    ],
  },
  {
    code: SoloErrorCode.RELAY_NOT_READY,
    category: ErrorCategory.COMPONENT,
    messageTemplate: "Relay '{{name}}' did not become ready within {{timeout}}s",
    retryable: true,
    docUrl: `${DOC_BASE}/SOLO-3004`,
    troubleshootingSteps: [
      'Check mirror node status: solo mirror node status',
      'kubectl get pods -n {{namespace}} -l app=relay',
      'kubectl logs -n {{namespace}} {{pod}}',
    ],
  },
  {
    code: SoloErrorCode.INVALID_ARGUMENT,
    category: ErrorCategory.VALIDATION,
    messageTemplate: "Invalid argument '{{argument}}': {{reason}}",
    retryable: false,
    docUrl: `${DOC_BASE}/SOLO-4001`,
  },
  {
    code: SoloErrorCode.HELM_EXECUTION_FAILED,
    category: ErrorCategory.SYSTEM,
    messageTemplate: 'Helm command failed with exit code {{exitCode}}',
    retryable: false,
    docUrl: `${DOC_BASE}/SOLO-5001`,
    troubleshootingSteps: ['Check helm version: helm version', 'Review helm logs above for details'],
  },
  {
    code: SoloErrorCode.KUBERNETES_API_ERROR,
    category: ErrorCategory.SYSTEM,
    messageTemplate: 'Kubernetes API request failed with status {{statusCode}}',
    retryable: true,
    docUrl: `${DOC_BASE}/SOLO-5004`,
    troubleshootingSteps: ['kubectl cluster-info', 'kubectl get nodes'],
  },
  {
    code: SoloErrorCode.INTERNAL_ERROR,
    category: ErrorCategory.INTERNAL,
    messageTemplate: 'An unexpected internal error occurred',
    retryable: false,
    docUrl: `${DOC_BASE}/SOLO-9001`,
    troubleshootingSteps: ['Please report this issue at https://github.com/hiero-ledger/solo/issues'],
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
