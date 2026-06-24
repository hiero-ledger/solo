// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from './namespace-name.js';
import {type ObjectMeta} from '../../integration/kube/resources/object-meta.js';

export interface Namespaces {
  /**
   * Create a new namespace
   * @param namespace - the name of the namespace
   * @param labels - labels to add to namespace
   */
  create(namespace: NamespaceName, labels?: Record<string, string>): Promise<boolean>;

  /**
   * Delete a namespace
   * @param namespace - the name of the namespace
   * @param gracePeriodSeconds - optional termination grace period in seconds. Pass 0 for a
   *   non-graceful (forced) deletion that uses background propagation so the call does not block on
   *   contained resources draining their default grace periods (e.g. during destroy). When omitted,
   *   the cluster's default graceful deletion is used.
   */
  delete(namespace: NamespaceName, gracePeriodSeconds?: number): Promise<boolean>;

  /**
   * Get a namespace
   * @param namespace - the name of the namespace
   * @returns metadata for the namespace
   */
  get(namespace: NamespaceName): Promise<ObjectMeta>;

  /**
   * List all namespaces
   * @returns a list of namespace names
   * @throws SoloError if the response from the kubernetes API is incorrect
   */
  list(): Promise<NamespaceName[]>;

  /**
   * Check if a namespace exists
   * @param namespace - the name of the namespace
   * @returns true if the namespace exists
   */
  has(namespace: NamespaceName): Promise<boolean>;
}
