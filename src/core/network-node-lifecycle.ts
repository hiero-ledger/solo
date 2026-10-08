// SPDX-License-Identifier: Apache-2.0

import * as constants from './constants.js';

/**
 * Builds the shell commands Solo runs in the root container to control the consensus node process.
 *
 * Two images are supported, selected by the NETWORK_NODE_LIFECYCLE_MODE environment variable:
 *  - `solo-container` (default): solo-containers `debian-s6-java25`, controlled by its
 *    `/command/network-node-lifecycle` helper.
 *  - `consensus-node-image`: the hiero-consensus-node deterministic image, which runs the node as a single
 *    s6 `consensus` service controlled with `s6-svc` and never auto-starts (AUTO_START_CONSENSUS_SERVICE=false).
 */
export class NetworkNodeLifecycle {
  public static readonly SOLO_CONTAINER_MODE: string = 'solo-container';
  public static readonly CONSENSUS_NODE_IMAGE_MODE: string = 'consensus-node-image';

  private static readonly SOLO_CONTAINER_HELPER_PATH: string = '/command/network-node-lifecycle';
  private static readonly S6_SERVICE_CONTROL_PATH: string = '/command/s6-svc';
  private static readonly CONSENSUS_SERVICE_PATH: string = '/run/service/consensus';
  private static readonly SERVICE_STOP_TIMEOUT_MILLISECONDS: number = 60_000;

  public static isConsensusNodeImage(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): boolean {
    return mode === NetworkNodeLifecycle.CONSENSUS_NODE_IMAGE_MODE;
  }

  /** Command used by `consensus node start` to (re)start the node process. */
  public static buildStartCommand(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): string {
    if (NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      return NetworkNodeLifecycle.buildConsensusNodeImageStartCommand();
    }

    const helperPath: string = NetworkNodeLifecycle.SOLO_CONTAINER_HELPER_PATH;
    return [
      // Fail fast when the helper is missing so callers immediately know the image
      // does not satisfy Solo's lifecycle contract.
      `test -x "${helperPath}" || { echo "missing ${helperPath}; update solo-container image" >&2; exit 1; }`,
      [
        "if ps -ef | grep -q '[c]om.hedera.node.app.ServicesMain'",
        "then curl -sf http://localhost:9999/metrics | grep 'platform_PlatformStatus' | grep -q ' 2[.]0$' && true < /dev/tcp/127.0.0.1/50211",
        'else false',
        'fi',
      ].join('\n'),
      // ACTIVE nodes only need the autostart marker restored; the full helper start
      // path deliberately forces a down/up cycle for transitional or frozen nodes.
      `if [ $? -eq 0 ]; then "${helperPath}" enable-autostart; exit 0; fi`,
      // A JVM can remain alive with only background threads after the main platform
      // exits. Clear any non-ready process before asking the helper to start it.
      `"${helperPath}" stop-and-disable-autostart`,
      // The helper owns both service control and autostart marker semantics.
      `"${helperPath}" start-and-enable-autostart`,
    ].join('\n');
  }

  /**
   * Start command for the consensus node image. That image has no ps, pgrep or curl, and none of solo-containers'
   * startup staging, so the ACTIVE check uses /proc and /dev/tcp, and the files that solo-containers' stage_files.sh
   * links or copies into the application directory are staged here before the service starts.
   */
  private static buildConsensusNodeImageStartCommand(): string {
    const serviceControl: string = NetworkNodeLifecycle.S6_SERVICE_CONTROL_PATH;
    const servicePath: string = NetworkNodeLifecycle.CONSENSUS_SERVICE_PATH;
    const applicationDirectory: string = constants.HEDERA_HAPI_PATH;

    return [
      `test -x "${serviceControl}" || { echo "missing ${serviceControl}; update the consensus node image" >&2; exit 1; }`,
      // log4j2.xml and settings.txt come from the hapi-app config map; hedera.crt and hedera.key from the secrets
      `for file_path in /etc/network-node/config/*; do [ -e "$file_path" ] || break; ln -sf "$file_path" "${applicationDirectory}/$(basename "$file_path")"; done`,
      `if [ -d /shared-hapiapp ] && [ -n "$(ls -A /shared-hapiapp)" ]; then cp -f /shared-hapiapp/* "${applicationDirectory}/"; fi`,
      // ACTIVE nodes are left running. A JVM that is alive but not ACTIVE is stopped first.
      "if grep -qa 'com.hedera.node.app.ServicesMain' /proc/[0-9]*/cmdline 2>/dev/null; then",
      `  if ${NetworkNodeLifecycle.buildMetricsFetchCommand()} | grep 'platform_PlatformStatus' | grep -q ' 2[.]0$'; then exit 0; fi`,
      'fi',
      `"${serviceControl}" -wD -T ${NetworkNodeLifecycle.SERVICE_STOP_TIMEOUT_MILLISECONDS} -d "${servicePath}"`,
      `"${serviceControl}" -o "${servicePath}"`,
    ].join('\n');
  }

  /** Command used to read the node's platform status metric from inside the root container. */
  public static buildPlatformStatusCommand(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): string {
    const metrics: string = NetworkNodeLifecycle.isConsensusNodeImage(mode)
      ? NetworkNodeLifecycle.buildMetricsFetchCommand()
      : 'curl -s http://localhost:9999/metrics';
    return String.raw`${metrics} | grep platform_PlatformStatus | grep -v \#`;
  }

  /** Fetches the node metrics over /dev/tcp, because the consensus node image has no curl. */
  private static buildMetricsFetchCommand(): string {
    return String.raw`( exec 3<>/dev/tcp/127.0.0.1/9999 && printf 'GET /metrics HTTP/1.0\r\n\r\n' >&3 && cat <&3 ) 2>/dev/null`;
  }

  /** Command used by `consensus node stop` to stop the node process. */
  public static buildStopCommand(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): string {
    if (NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      const serviceControl: string = NetworkNodeLifecycle.S6_SERVICE_CONTROL_PATH;
      return [
        `test -x "${serviceControl}" || { echo "missing ${serviceControl}; update the consensus node image" >&2; exit 1; }`,
        `"${serviceControl}" -wD -T ${NetworkNodeLifecycle.SERVICE_STOP_TIMEOUT_MILLISECONDS} -d "${NetworkNodeLifecycle.CONSENSUS_SERVICE_PATH}"`,
      ].join('\n');
    }

    const helperPath: string = NetworkNodeLifecycle.SOLO_CONTAINER_HELPER_PATH;
    return [
      `test -x "${helperPath}" || { echo "missing ${helperPath}; update solo-container image" >&2; exit 1; }`,
      // Keep Solo orchestration-only: hard-stop and escalation logic must stay in
      // solo-container's /command/network-node-lifecycle helper.
      `"${helperPath}" stop-and-disable-autostart`,
    ].join('\n');
  }

  /**
   * Command used before killing a pod so it does not start the node on restart before new config is staged.
   * The consensus node image never auto-starts (AUTO_START_CONSENSUS_SERVICE=false), so nothing is needed there.
   */
  public static buildDisableAutostartCommand(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): string {
    if (NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      return 'true';
    }
    const helperPath: string = NetworkNodeLifecycle.SOLO_CONTAINER_HELPER_PATH;
    return `test -x "${helperPath}" && "${helperPath}" disable-autostart`;
  }

  /**
   * Helm values (relative to `defaults`) for the released consensus node image of the given release tag, or
   * undefined when the solo-container image is used: the root container image, and `appJarsInImage` so the chart
   * does not mount empty data/lib and data/apps volumes over the jar files baked into that image.
   */
  public static buildDefaultsValues(
    releaseTag: string,
    mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE,
  ):
    | {
        root: {image: {registry: string; repository: string; tag: string; pullPolicy: string}};
        volumeClaims: {appJarsInImage: boolean};
      }
    | undefined {
    if (!NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      return undefined;
    }
    return {
      root: {
        image: {
          registry: constants.CONSENSUS_NODE_IMAGE_REGISTRY,
          repository: constants.CONSENSUS_NODE_IMAGE_REPOSITORY,
          tag: releaseTag.replace(/^v/, ''),
          pullPolicy: 'IfNotPresent',
        },
      },
      volumeClaims: {appJarsInImage: true},
    };
  }
}
