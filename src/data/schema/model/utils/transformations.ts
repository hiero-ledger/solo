// SPDX-License-Identifier: Apache-2.0

import {TransformationType, type TransformFnParams} from 'class-transformer';
import {type DeploymentPhase} from '../remote/deployment-phase.js';
import {type LedgerPhase} from '../remote/ledger-phase.js';
import {UnsupportedOperationError} from '../../../../business/errors/unsupported-operation-error.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';

export class Transformations {
  private constructor() {
    throw new UnsupportedOperationError('This class cannot be instantiated');
  }

  public static readonly SemanticVersion: ({value, type}: TransformFnParams) => string | SemanticVersion<string> = ({
    value,
    type,
  }: TransformFnParams): string | SemanticVersion<string> => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        return new SemanticVersion<string>(value);
      }
      case TransformationType.CLASS_TO_PLAIN: {
        return value.toString();
      }
      default: {
        return value;
      }
    }
  };

  public static readonly DeploymentPhase: ({value, type}: TransformFnParams) => string = ({
    value,
    type,
  }: TransformFnParams): string => {
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

  public static readonly LedgerPhase: ({value, type}: TransformFnParams) => string = ({
    value,
    type,
  }: TransformFnParams): string => {
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
