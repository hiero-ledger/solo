// SPDX-License-Identifier: Apache-2.0

/**
 * A flat map of locale keys to string values.
 *
 * Keys follow the naming convention:
 *   - `<name>_message` — Handlebars-style message template, e.g. "pod_not_ready_message"
 *   - `<name>_troubleshooting_steps` — newline-joined list of troubleshooting hints
 */
export type LocaleData = Readonly<Record<string, string>>;
