// SPDX-License-Identifier: Apache-2.0

import {type ClusterReferenceSetupConfigClass} from './cluster-reference-setup-config-class.js';

export interface ClusterReferenceSetupContext {
  config: ClusterReferenceSetupConfigClass;
  valuesArg: string;
  context: string;
}
