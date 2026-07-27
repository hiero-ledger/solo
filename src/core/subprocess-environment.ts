// SPDX-License-Identifier: Apache-2.0

import os from 'node:os';
import {SubprocessCommandProfile} from './subprocess-command-profile.js';

/**
 * Builds a minimal, explicit environment for spawning external commands.
 *
 * Historically Solo spread the entire parent environment (`{...process.env}`) into every
 * child process, leaking any secret present in the parent (CI tokens, cloud credentials,
 * SSH/GPG agent vars, API keys) into tools that never need them. This class instead builds
 * the environment from scratch: a common base set plus the minimal per-command extras, and
 * drops everything else.
 *
 * Intentionally dependency-free (no dependency-injection, no logging, no heavy imports) so
 * that the standalone `persist-port-forward` script can import it without pulling in the
 * container.
 */
export class SubprocessEnvironment {
  /** Environment variable names inherited by every external command on every platform. */
  private static readonly COMMON_ALLOWLIST: readonly string[] = [
    // command resolution (POSIX `PATH`, Windows `Path`)
    'PATH',
    'Path',
    // home directory (used to locate ~/.kube/config, ~/.config, credential caches)
    'HOME',
    'USERPROFILE',
    // locale
    'LANG',
    'LANGUAGE',
    'LC_ALL',
    'LC_CTYPE',
    'LC_MESSAGES',
    'TERM',
    // temp directory
    'TMPDIR',
    'TMP',
    'TEMP',
    // proxy configuration
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'all_proxy',
  ];

  /**
   * Additional variable names inherited only on Windows. Many binaries fail to start at all
   * without these (e.g. `SystemRoot`, `PATHEXT`), so they are always allowed on win32.
   */
  private static readonly WINDOWS_ALLOWLIST: readonly string[] = [
    'SystemRoot',
    'SystemDrive',
    'windir',
    'COMSPEC',
    'PATHEXT',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
    'LOCALAPPDATA',
    'APPDATA',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'USERNAME',
    'USERDOMAIN',
  ];

  /** Exact variable names allowed in addition to the common base set, per command profile. */
  private static readonly COMMAND_ALLOWLIST: Record<SubprocessCommandProfile, readonly string[]> = {
    [SubprocessCommandProfile.GENERIC]: [],
    [SubprocessCommandProfile.KUBECTL]: ['KUBECONFIG', 'KUBERNETES_SERVICE_HOST', 'KUBERNETES_SERVICE_PORT'],
    // DOCKER_CONFIG: helm consults the Docker/OCI registry credential file
    // ($DOCKER_CONFIG/config.json) when pulling OCI charts.
    [SubprocessCommandProfile.HELM]: ['KUBECONFIG', 'DOCKER_CONFIG'],
    [SubprocessCommandProfile.KIND]: [
      'KUBECONFIG',
      'KIND_EXPERIMENTAL_PROVIDER',
      'DOCKER_HOST',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      // Kind delegates image operations to the container engine (docker/podman), which reads
      // these registry/storage config locations; forward them so a podman-backed kind works.
      'DOCKER_CONFIG',
      'CONTAINER_HOST',
      'CONTAINERS_CONF',
      'CONTAINERS_STORAGE_CONF',
      'XDG_RUNTIME_DIR',
    ],
    [SubprocessCommandProfile.CONTAINER_ENGINE]: [
      'DOCKER_HOST',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      'DOCKER_CONFIG',
      'DOCKER_CONTEXT',
      'CONTAINER_HOST',
      'CONTAINERS_CONF',
      'CONTAINERS_STORAGE_CONF',
      'REGISTRY_AUTH_FILE',
      'XDG_RUNTIME_DIR',
      'XDG_CONFIG_HOME',
    ],
    [SubprocessCommandProfile.BREW]: ['NONINTERACTIVE'],
    [SubprocessCommandProfile.NPM]: ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'npm_config_registry'],
    [SubprocessCommandProfile.GITHUB_CLI]: [
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'GH_ENTERPRISE_TOKEN',
      'GH_HOST',
      'GH_CONFIG_DIR',
      'XDG_CONFIG_HOME',
    ],
  };

  /**
   * Variable name prefixes allowed in addition to the exact names, per command profile.
   * These cover the families of settings a tool honors (e.g. `HELM_*`, `HOMEBREW_*`).
   */
  private static readonly COMMAND_PREFIX_ALLOWLIST: Partial<Record<SubprocessCommandProfile, readonly string[]>> = {
    [SubprocessCommandProfile.HELM]: ['HELM_'],
    [SubprocessCommandProfile.BREW]: ['HOMEBREW_'],
  };

  /** Returns true when the current platform is Windows. Isolated for testability. */
  private static isWindowsPlatform(): boolean {
    return os.platform() === 'win32';
  }

  /**
   * Builds the minimal environment for the given command profile.
   *
   * @param profile - the command the environment is being built for
   * @param overrides - variables applied last, overriding anything inherited (e.g. a
   *   `PATH` with the tool's installation directory prepended, or `KUBECONFIG` pointed at a
   *   null device). These are always present in the result regardless of the allowlist.
   * @returns a fresh environment object containing only the allowlisted variables plus overrides
   */
  public static forCommand(
    profile: SubprocessCommandProfile,
    overrides: Record<string, string> = {},
  ): Record<string, string> {
    const onWindows: boolean = SubprocessEnvironment.isWindowsPlatform();
    // Windows environment variable names are case-insensitive, and shells expose them in varying
    // case (e.g. Git-bash surfaces `SYSTEMROOT` where the allowlist says `SystemRoot`). Compare
    // case-insensitively on Windows so the intended variables are still forwarded; POSIX names
    // stay case-sensitive.
    const normalize: (name: string) => string = (name: string): string => (onWindows ? name.toLowerCase() : name);

    const allowedExactNames: Set<string> = new Set<string>(
      [
        ...SubprocessEnvironment.COMMON_ALLOWLIST,
        ...(onWindows ? SubprocessEnvironment.WINDOWS_ALLOWLIST : []),
        ...SubprocessEnvironment.COMMAND_ALLOWLIST[profile],
      ].map((name: string): string => normalize(name)),
    );
    const allowedPrefixes: readonly string[] = (SubprocessEnvironment.COMMAND_PREFIX_ALLOWLIST[profile] ?? []).map(
      (prefix: string): string => normalize(prefix),
    );

    const environment: Record<string, string> = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (value === undefined) {
        continue;
      }
      const normalized: string = normalize(name);
      if (
        allowedExactNames.has(normalized) ||
        allowedPrefixes.some((prefix: string): boolean => normalized.startsWith(prefix))
      ) {
        // Preserve the original variable name (and its casing) for the child process.
        environment[name] = value;
      }
    }

    return {...environment, ...overrides};
  }
}
