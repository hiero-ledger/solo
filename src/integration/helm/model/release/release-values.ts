// SPDX-License-Identifier: Apache-2.0

/** The user-supplied values of a deployed Helm release, as reported by `helm get values`. */
export class ReleaseValues {
  [key: string]: unknown;
}
