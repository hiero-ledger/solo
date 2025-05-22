// SPDX-License-Identifier: Apache-2.0

import {TransformationType, type TransformFnParams} from 'class-transformer';
import {type DeploymentPhase} from '../remote/deployment-phase.js';
import {SemVer} from 'semver';
import {type LedgerPhase} from '../remote/ledger-phase.js';
import {UnsupportedOperationError} from '../../../../business/errors/unsupported-operation-error.js';

export class Transformations {
  private constructor() {
    throw new UnsupportedOperationError('This class cannot be instantiated');
  }

  public static readonly SemVer = ({value, type}: TransformFnParams) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        // Handle potentially invalid version strings
        if (!value) {
          return new SemVer('0.0.0');
        }

        // Remove 'v' prefix if present
        const normalizedValue = typeof value === 'string' && value.startsWith('v')
          ? value.substring(1)
          : value;

        try {
          return new SemVer(normalizedValue);
        } catch (error) {
          // If parsing fails, use a default version
          return new SemVer('0.0.0');
        }
      }
      case TransformationType.CLASS_TO_PLAIN: {
        return value.toString();
      }
      default: {
        return value;
      }
    }
  };

  public static readonly DeploymentPhase = ({value, type}: TransformFnParams) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        return (value as string)?.trim().toLowerCase().replace('_', '-') as DeploymentPhase;
      }
      case TransformationType.CLASS_TO_PLAIN: {
        return value.toString();
      }
      default: {
        return value;
      }
    }
  };

  public static readonly LedgerPhase = ({value, type}: TransformFnParams) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        return (value as string)?.trim().toLowerCase().replace('_', '-') as LedgerPhase;
      }
      case TransformationType.CLASS_TO_PLAIN: {
        return value.toString();
      }
      default: {
        return value;
      }
    }
  };
}
