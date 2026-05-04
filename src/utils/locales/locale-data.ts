// SPDX-License-Identifier: Apache-2.0

/** Shape for locale entries that pair a message with optional troubleshooting steps. */
export type SoloErrorLocaleEntry = {
  readonly message: string;
  readonly troubleshooting_steps?: string;
};

/** Union of all supported locale value shapes. */
export type LocaleValue = string | SoloErrorLocaleEntry;
