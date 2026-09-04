// SPDX-License-Identifier: Apache-2.0

/**
 * Sanitization helpers for user-supplied input.
 *
 * Per hiero-ledger/solo#4004, this class is the chokepoint for user-controlled values
 * (CLI flags, interactive prompts, environment variables) before they reach hostile sinks
 * (shell commands, Helm templates, JSON parsers, regex constructors, filesystem paths).
 *
 * The top-level {@link UserInput.sanitize} method applies a conservative pass that removes
 * inputs which are dangerous in every context: null bytes and path-traversal sequences.
 * Context-specific escapers (`escapeShell`, `escapeHelmTemplate`, `escapeRegex`,
 * `safeJsonKey`, `safeFilenameComponent`) handle the cases that need stricter treatment
 * for a specific sink.
 */
export class UserInput {
  /**
   * The conservative sanitization pass applied to general user input. Strips:
   *
   * - Null bytes (security: terminates C-string-based syscalls early)
   * - Path-traversal sequences (`../`, `..\\`, leading `./`, leading `.\\`)
   *
   * Returns the input unchanged when the dangerous patterns are not present. This method
   * **does not** escape shell metacharacters, Helm template directives, regex specials, or
   * JSON-pollution keys — those have dedicated methods on this class. Callers picking the
   * right method per sink is the safety contract.
   *
   * @param input - the raw user-supplied string.
   * @returns the sanitized string.
   */
  public static sanitize(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    let result: string = input.replaceAll('\0', '');
    // Remove parent-directory traversal: ../, ..\, and the URL-encoded variants
    // (%2e%2e%2f, ..%2f, ..%5c, etc.). The `while (test) { replace }` shape is the
    // canonical fixed-point sanitization pattern CodeQL's
    // `js/incomplete-multi-character-sanitization` rule recognizes — repeatedly
    // stripping until no traversal pattern remains, which closes overlap bypasses
    // like `....//` that single-pass replace would leave as `../`.
    const traversalPattern: RegExp = /\.\.[/\\]|%2e%2e(?:%2f|%5c|[/\\])|\.\.(?:%2f|%5c)/i;
    const traversalPatternGlobal: RegExp = /\.\.[/\\]|%2e%2e(?:%2f|%5c|[/\\])|\.\.(?:%2f|%5c)/gi;
    while (traversalPattern.test(result)) {
      result = result.replaceAll(traversalPatternGlobal, '');
    }
    // Remove leading single-dot prefixes that resolve relative to CWD when concatenated.
    result = result.replace(/^\.[/\\]+/, '');
    return result;
  }

  /**
   * Escape a value so it is safe to pass as a single shell argument in double-quoted
   * context. The intended use is constructing a shell command string for `bash -c` or
   * similar. **Prefer passing arguments as an array to `spawn`/`execFile` without
   * `shell: true` over relying on this method** — that route is structurally
   * injection-safe and does not need escaping. Use this only when a shell is unavoidable.
   *
   * @param input - the user-supplied value to escape.
   * @returns the escaped value, suitable to wrap in `"..."` in a shell command.
   */
  public static escapeShell(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    // POSIX shell metacharacters in double-quote context. Backslash must come first so it
    // doesn't re-escape the escapes we add below.

    return input.replaceAll('\\', String.raw`\\`).replaceAll(/(["$`!])/g, String.raw`\$1`);
  }

  /**
   * Escape a value so Helm's Go template engine treats it as a literal string rather than
   * a template directive. Helm allows backslash-escaping of `{` and `}` in `--set` values
   * and values-file strings.
   *
   * @param input - the user-supplied value.
   * @returns the value with template-significant characters escaped.
   */
  public static escapeHelmTemplate(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    return input.replaceAll('{', String.raw`\{`).replaceAll('}', String.raw`\}`);
  }

  /**
   * Escape a string so it can be embedded literally inside a regular-expression pattern.
   * Use this when a user-supplied value becomes part of a `new RegExp(...)` invocation.
   *
   * @param input - the user-supplied value.
   * @returns the value with all regex metacharacters escaped.
   */
  public static escapeRegex(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    return input.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  }

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
   * Normalize a single path component for use as a filename. Replaces any character
   * outside `[A-Za-z0-9._-]` with `_`. Intended for use when the input becomes part of a
   * filename and must work across macOS, Linux, and Windows.
   *
   * Does **not** validate full paths or guard against traversal — use {@link sanitize}
   * for that.
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
