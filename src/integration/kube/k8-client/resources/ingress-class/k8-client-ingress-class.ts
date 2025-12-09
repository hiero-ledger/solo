// SPDX-License-Identifier: Apache-2.0

import {type IngressClass} from '../../../resources/ingress-class/ingress-class.js';

export class K8ClientIngressClass implements IngressClass {
  public constructor(public readonly name: string) {}
}
