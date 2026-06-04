// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import {PathEx} from '../business/utils/path-ex.js';
import {OperatingSystem} from '../business/utils/operating-system.js';
import {type DockerDesktopContainerdCheckResult} from './docker-desktop-containerd-check-result.js';

/**
 * Returns the ordered list of well-known Docker Desktop settings file paths to probe.
 * Docker Desktop >= 4.30 writes settings to `~/.docker/settings-store.json`.
 * On Windows the primary location is `%APPDATA%\Docker\settings-store.json`.
 * On macOS, older versions use `~/Library/Group Containers/group.com.docker/settings.json`.
 * Evaluated lazily so that os.homedir() reflects any test-time overrides.
 */
function getDockerDesktopSettingsPaths(): string[] {
  const home: string = os.homedir();
  const paths: string[] = [
    PathEx.join(home, '.docker', 'settings-store.json'),
    PathEx.join(home, '.docker', 'settings.json'),
  ];
  if (OperatingSystem.isWin32()) {
    // On Windows, Docker Desktop stores settings under %APPDATA%\Docker\.
    const appData: string = process.env['APPDATA'] ?? PathEx.join(home, 'AppData', 'Roaming');
    paths.unshift(
      PathEx.join(appData, 'Docker', 'settings-store.json'),
      PathEx.join(appData, 'Docker', 'settings.json'),
    );
  } else if (OperatingSystem.isDarwin()) {
    // macOS legacy path used by older Docker Desktop versions.
    paths.push(PathEx.join(home, 'Library', 'Group Containers', 'group.com.docker', 'settings.json'));
  }
  return paths;
}

/**
 * Reads the Docker Desktop settings file and checks whether the
 * "Use containerd for pulling and storing images" (`useContainerdSnapshotter`) toggle
 * is enabled.
 *
 * When this toggle is on, Kubernetes workloads may fail with an `ImageInspectError`
 * pointing at `/run/containerd/containerd.sock` because Docker Desktop's containerd
 * snapshotter is not accessible from the Kubernetes node.
 *
 * Returns `{ containerdSnapshotterEnabled: false }` when:
 * - The current platform is not macOS or Windows (where Docker Desktop is used), or
 * - No settings file is found, or
 * - The setting is absent or explicitly set to false.
 */
export function checkDockerDesktopContainerdSetting(): DockerDesktopContainerdCheckResult {
  if (OperatingSystem.isLinux()) {
    return {containerdSnapshotterEnabled: false};
  }

  for (const candidatePath of getDockerDesktopSettingsPaths()) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }

    const enabled: boolean = settings['useContainerdSnapshotter'] === true;
    if (enabled) {
      return {
        containerdSnapshotterEnabled: true,
        settingsFilePath: candidatePath,
        warningMessage:
          'Docker Desktop "Use containerd for pulling and storing images" is enabled. ' +
          'This setting can cause Kubernetes pods to fail with an ImageInspectError pointing ' +
          'at /run/containerd/containerd.sock. ' +
          'To avoid relay and other component deployment failures: ' +
          'open Docker Desktop → Settings → General → uncheck ' +
          '"Use containerd for pulling and storing images" → Apply & Restart.',
      };
    }

    return {containerdSnapshotterEnabled: false, settingsFilePath: candidatePath};
  }

  return {containerdSnapshotterEnabled: false};
}
