// SPDX-License-Identifier: Apache-2.0

import {type HelmSchedulingValueFallback} from './helm-scheduling-value-fallback.js';

export interface HelmSchedulingValueMapping {
  targetPaths: string[];
  sourcePaths?: string[];
  includeTopLevel?: boolean;
  fallback?: HelmSchedulingValueFallback;
}
