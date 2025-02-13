/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type IngressClass} from './ingress_class.js';

export interface IngressClasses {
  /**
   * List all IngressClasses in the cluster.
   *
   * @returns a list of IngressClasses
   * @throws SoloError if failed to list IngressClasses
   */
  list(): Promise<IngressClass[]>;

  /**
   * Create an IngressClass
   * @param ingressClassName
   * @param controllerName
   */
  create(ingressClassName: string, controllerName: string): Promise<void>;

  /**
   * Delete an IngressClass
   * @param ingressClassName
   */
  delete(ingressClassName: string): Promise<void>;
}
