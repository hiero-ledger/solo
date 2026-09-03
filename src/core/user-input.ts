// SPDX-License-Identifier: Apache-2.0

/**
 * Sanitization helpers for user-supplied input.
 *
 * Per hiero-ledger/solo#4004, this class is the chokepoint for user-controlled values
 * (CLI flags, interactive prompts, environment variables) before they reach hostile sinks
 * (JSON/YAML parsers, filesystem paths).
 *
 * `stripUnsafeJsonKeys` (built on `safeJsonKey`) scrubs prototype-pollution keys from parsed
 * untrusted documents; `safeFilenameComponent` normalizes a value that becomes a filename.
 * Regex escaping lives in {@link Regex.escape} (`src/business/utils/regex.ts`).
 */
export class UserInput {
  /**
   * Returns true if {@link key} is safe to use as a property name on an object created
   * from JSON input. Rejects keys that would mutate the prototype chain.
   *
   * @param key - the candidate object key.
   * @returns true when the key is safe; false when it is a known prototype-pollution
   *   vector (`__proto__`, `constructor`, `prototype`, `__defineGetter__`,
   *   `__defineSetter__`).
   */
  public static safeJsonKey(key: string): boolean {
    if (typeof key !== 'string') {
      return false;
    }
    const forbidden: ReadonlySet<string> = new Set<string>([
      '__proto__',
      'constructor',
      'prototype',
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ]);
    return !forbidden.has(key);
  }

  /**
   * Recursively rebuild a value parsed from untrusted JSON/YAML, dropping every object key that
   * {@link safeJsonKey} rejects. This closes prototype-pollution vectors (`__proto__`,
   * `constructor`, `prototype`, …) that `JSON.parse` / `yaml.parse` surface as own properties
   * before the graph is merged into other objects.
   *
   * Arrays and primitives pass through structurally; only object keys are filtered. Plain data
   * graphs (the shape produced by JSON/YAML parsing) are the intended input — class instances are
   * not preserved.
   *
   * @param value - the parsed, untrusted value.
   * @returns the value with prototype-pollution keys removed at every depth.
   */
  public static stripUnsafeJsonKeys<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((element: unknown): unknown => UserInput.stripUnsafeJsonKeys(element)) as T;
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (UserInput.safeJsonKey(key)) {
          result[key] = UserInput.stripUnsafeJsonKeys(entry);
        }
      }
      return result as T;
    }
    return value;
  }

  /**
   * Normalize a single path component for use as a filename. Replaces any character
   * outside `[A-Za-z0-9._-]` with `_`. Intended for use when the input becomes part of a
   * filename and must work across macOS, Linux, and Windows.
   *
   * Does **not** validate full paths or guard against traversal; it neutralizes path
   * separators so the result is safe to use as a single path component.
   *
   * @param input - the user-supplied component (e.g. a deployment name).
   * @returns the safe filename component.
   */
  public static safeFilenameComponent(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    return input.replaceAll(/[^\dA-Za-z._-]/g, '_');
  }
}
