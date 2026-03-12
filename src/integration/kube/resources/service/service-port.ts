// SPDX-License-Identifier: Apache-2.0

export interface ServicePort {
  readonly name?: string;
  readonly port: number;
  readonly targetPort?: number | string;
  readonly protocol?: string;
}
