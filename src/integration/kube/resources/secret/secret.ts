// SPDX-License-Identifier: Apache-2.0

export interface Secret {
  data: Record<string, string>;
  name: string;
  namespace: string;
  type: string;
  labels: Record<string, string>;
}
