// SPDX-License-Identifier: Apache-2.0

export interface CacheImageTemplateResolver {
  has(key: string): boolean;
  resolve(key: string): string;
}
