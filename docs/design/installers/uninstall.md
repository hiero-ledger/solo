# Uninstall: What `solo uninstall` Removes on Each OS

## 1. Context

Part of epic [#5714](https://github.com/hiero-ledger/solo/issues/5714). This is the design task for
[#5721](https://github.com/hiero-ledger/solo/issues/5721): define what an uninstall removes on each OS, so every
install channel implements the same behavior.

Every installer design defers uninstall to this document:

- [Linux installer design](linux-installer-evaluation.md): uninstall is "designed once, shared across OSes" (§3).
  One `solo uninstall`, run as the real user (§7.2), is a prerequisite for a complete install-script channel (§8,
  note 2). Until it exists, removal is "a printed instruction" (§9).
- [macOS installer design](macos-dmg-installer.md) (§7.2): "Same shared `solo uninstall`". On the install-script
  channel it removes `~/.solo/bin/solo`, the `PATH` line it added and `~/.solo/sea-resources/`.
- Windows installer design ([#6196](https://github.com/hiero-ledger/solo/pull/6196), §6.3 and §7.2): uninstall must
  also remove the user `PATH` entry and the MSYS2 folder, Windows cannot delete a running `solo.exe`, and the deferred
  NSIS uninstaller runs the shared uninstall logic.

Earlier implementation issues [#6088](https://github.com/hiero-ledger/solo/issues/6088) (ownership record) and
[#6089](https://github.com/hiero-ledger/solo/issues/6089) (`solo uninstall`) were closed without code. Their sketch
is the starting point here, updated for the merged designs (the binary lives in `~/.solo/bin`, and macOS uses the
install script, not a `.pkg`) and for the review answers on [#6275](https://github.com/hiero-ledger/solo/pull/6275).

### 1.1 What exists today

- No uninstall command, and nothing records which resources Solo created. `KindClient.deleteCluster()` and
  `HelmClient.removeRepository()` have no callers.
- `solo one-shot single destroy` removes the network, the deployment and `~/.solo/one-shot-<deployment>/`. It leaves
  the kind cluster, its kube context, helm repositories, the podman machine and everything else in `~/.solo`
  ([#4948](https://github.com/hiero-ledger/solo/issues/4948)).
- The documented full reset is manual: `kind delete cluster` for each cluster named `solo*`, then `rm -rf ~/.solo`
  (solo-docs Cleanup page).
- Measured after `one-shot single deploy` and `destroy` with the v0.94.0 install script (Ubuntu 24.04, arm64):
  kind cluster `solo-cluster` and context `kind-solo-cluster` still present, `~/.solo` about 390 MB (`bin/` 243 MB,
  `cache/` 132 MB, `sea-resources/` 17 MB), and seven helm repositories added to the user's own helm config.
  `cache/` holds no image archives: no release publishes `cache-manifest.json` yet
  ([#5747](https://github.com/hiero-ledger/solo/issues/5747)). Once one does, a one-shot deploy or an opt-in pull
  adds several GB under `cache/images/`.

## 2. Goals

- One `solo uninstall` for every install channel, run as the user who installed Solo.
- Delete only what Solo created. Never touch the user's own clusters, images or tools, or their kube and helm
  configuration.
- Ask before deleting anything in an interactive run; `--quiet-mode` for scripts and package uninstallers.
- When something is left, say exactly what and the command to remove it.
- Safe to repeat: running `solo uninstall` again finishes an interrupted or partial run.

## 3. Non-Goals

- Destroying networks inside clusters Solo did not create (`solo one-shot single destroy` does that).
- Removing tools from the host: Docker, podman, Homebrew, Node.js, git, iptables. This includes the ones the rootful
  Linux podman path installs when they are missing (§4.2), since other software may depend on them by then.
- Removing images from the host's Docker or Podman store.
- Building the native package channels (deb/rpm, NSIS). Only how they start the uninstall is defined here (§7).
- Self-upgrade ([#5722](https://github.com/hiero-ledger/solo/issues/5722),
  [#6104](https://github.com/hiero-ledger/solo/pull/6104)), including pruning old `sea-resources/<version>/` folders
  after an update (#6104 §10).

## 4. What Solo Creates

### 4.1 Files under `SOLO_HOME` (default `~/.solo`)

- `bin/`: helm, kind, kubectl, podman and `podman-helpers/`, plus the `solo` binary on the install-script channel.
- `config/`: podman's `containers.conf`, `registries.conf` and runtime override.
- `cache/`, or `SOLO_CACHE_DIR` when set: templates, values files, platform build zips, `update-check.json`, and the
  node keys a deploy stages before it stores them as cluster secrets (removed after that unless `--debug` is set).
  Image and chart archives and their catalog always use `$SOLO_HOME/cache`, even when `SOLO_CACHE_DIR` points
  elsewhere.
- `logs/`, `local-config.yaml` and `one-shot-<deployment>/`.
- `solo-config.yaml`: optional, written by the user (for example the subprocess environment allowlist). Solo only
  reads it.
- `image-cache-warm-up.json`: the first-run warm-up marker from
  [#6094](https://github.com/hiero-ledger/solo/issues/6094) (PR #6109, not merged yet).
- `sea-resources/<version>/`: one folder per version, never pruned today.

The install-script binary (`~/.solo/bin/solo`) and `sea-resources/` always live under `~/.solo`, even when
`SOLO_HOME` is set: the script and the SEA bootstrap (`sea/sea-main.template.cjs`) ignore it.

### 4.2 Outside `SOLO_HOME`

- Install script: the `# >>> solo installer >>>` block in `~/.bashrc` or `${ZDOTDIR:-$HOME}/.zshrc`
  (`~/.bash_profile` for bash on macOS), or `~/.config/fish/conf.d/solo.fish`. Only for the default folder: with
  `--prefix` or `SOLO_INSTALL_DIR`, the script prints the `PATH` line instead of editing a startup file.
- Windows install script (#6196): `%USERPROFILE%\.solo\bin\solo.exe`, the MSYS2 files in
  `%USERPROFILE%\.solo\msys2\` and a user `PATH` entry.
- kube contexts: `kind-<cluster>` in `$KUBECONFIG` or `~/.kube/config`, written by kind.
- Rootful Linux podman path (no Docker, or `FORCE_PODMAN=true`): Solo installs git and iptables with the OS package
  manager when git is missing, and Homebrew and podman when they are missing. It creates the cluster `kind` with
  `sudo`, so kind writes the context to root's kubeconfig. Solo then appends the `kind-kind` cluster, context and user
  to `/home/<user>/.kube/config` itself and makes it the current context.
- Helm: repositories in the user's global helm config (Solo sets no `HELM_*` variables). Every command that uses helm
  adds `hedera-json-rpc`, `mirror`, `kube-prometheus-stack`, `operator`, `metrics-server` and `haproxy-ingress`; a
  network deploy that installs the monitoring CRDs adds `prometheus-operator-crds`, and a multi-cluster
  `solo config ops restore-clusters` adds `metallb`. Solo adds all but `metallb` with `--force-update`, so it
  overwrites a user repository with the same name. Helm keeps the repository indexes and downloaded charts in its own
  cache.
- `solo config ops backup` writes a backup to `--output-dir`, by default `./solo-backup` in the current folder.

### 4.3 Container resources and processes

- kind clusters: `solo-cluster` from one-shot deploys; `kind` on the rootful Linux podman path; one per backup context
  from `solo config ops restore-clusters`, which also recreates the `kind` container network when it restores more
  than one cluster.
- Podman machine `podman-machine-default` (macOS and Windows, when Docker is missing or `FORCE_PODMAN=true`).
- Persistent port-forward workers: detached processes with `persist-port-forward` in their command line. A SEA binary
  runs them from `solo` itself. They have no PID files, and they stop once their context, namespace or cluster is
  gone, but only while they can still run Solo's `kubectl` from `bin/`.
- Detached `kubectl port-forward` processes without a worker: `AccountManager` and the rapid-fire commands start them
  and stop them when they finish, so an interrupted command can leave them running.
- Not created by Solo, and left alone: images in the host's Docker or Podman store, including `kindest/node`.

## 5. Ownership Record

Solo deletes only the local kind clusters and the podman machine that it created and recorded. It never deletes remote
clusters, or clusters and contexts it did not create.

The record is `SOLO_HOME/owned-resources.yaml`, from #6088:

```yaml
schemaVersion: 1
resources:
  - type: kind-cluster
    name: solo-cluster
    provider: docker # or podman
    sudo: false # true on the rootful Linux podman path
    createdAt: 2026-10-26T12:00:00Z
  - type: podman-machine
    name: podman-machine-default
    createdAt: 2026-10-26T11:58:00Z
```

- Solo writes an entry right after a creation succeeds, in the four places that create these resources: the default
  cluster task in `ClusterTaskManager` (`solo-cluster`), its rootful Linux podman task (`kind`, with `sudo`), the
  cluster creation in `solo config ops restore-clusters`, and `podman machine init` in `ClusterTaskManager`.
- Reusing a cluster or machine that already exists adds nothing. Solo removes the entry when it deletes the resource.
- The file is separate from `local-config.yaml`, so no local-config schema migration is needed. It has these two
  types only; a new type is added when Solo starts creating something new outside `SOLO_HOME`.
- Only a run with the same `SOLO_HOME` finds the record (§10).
- The record ships before `solo uninstall`, because clusters created before it have no entry.

Installs from before the record:

- An interactive run asks about a `solo-cluster` found by `kind get clusters` (docker and podman providers), and about
  `podman-machine-default` when `~/.solo/bin/podman` exists. The default answer is no.
- `--quiet-mode` never deletes them. The report prints the delete command instead.
- Without a record, uninstall does not look for the rootful `kind` cluster: finding it needs `sudo`, and `kind` is also
  the name kind gives any cluster by default.

## 6. What `solo uninstall` Removes

| Item | Default | Notes |
|------|---------|-------|
| Persistent port-forward workers | stop | All of them, first, matched by `persist-port-forward` in the command line. A worker can't restart `kubectl` once `bin/` is gone, and on Windows a SEA worker is `solo.exe` itself, which would block its removal. |
| `kubectl port-forward` processes from `bin/` | stop | Right after the workers: every `kubectl port-forward` whose executable is Solo's `kubectl` in `bin/`, such as one an interrupted command left (§4.3). On Windows it would block the removal of `bin\`. |
| Recorded kind clusters | delete | Also when deployments still run on them: after confirmation in an interactive run, without asking in `--quiet-mode`. `kind delete cluster` with the provider and privileges that created the cluster, which also removes the context kind wrote. |
| Recorded podman machine | delete | After the clusters that run in it. A stopped machine is started first, so kind can delete those clusters. Before `bin/`, which holds its podman and helpers. |
| Unrecorded `solo-cluster` and `podman-machine-default` | ask | §5. `--quiet-mode` leaves them. |
| `SOLO_HOME` at the default `~/.solo` | delete | The whole folder, except what `--keep-config` keeps. The program files go last (§8). |
| `SOLO_HOME` or `SOLO_CACHE_DIR` set to another folder | ask | Solo can't tell its files from the user's there. An interactive run asks about each folder (default no) and never offers the home folder, a filesystem root or a folder that contains either. `--quiet-mode` leaves the folder and lists it. |
| `~/.solo/sea-resources/` | delete | All versions. A separate step when `SOLO_HOME` is set, since it ignores `SOLO_HOME`. |
| Program and `PATH` lines | delete | Per channel (§7), unless `--keep-binary`. |
| Helm repositories | leave | The report lists the ones still present with Solo's URL, and the `helm repo remove` command for them. Solo doesn't record which repositories it added, and it may have overwritten a user's repository with the same name. The same in `--quiet-mode`. |
| `kind-kind` entries in the user's kubeconfig | leave | Rootful Linux podman path. After deleting that cluster, the report lists the `kind-kind` entries still in the user's kubeconfig, with the `kubectl config` commands to remove them. Uninstall never edits the user's kubeconfig. |
| Backups from `solo config ops backup` | never | They hold the user's data, and Solo doesn't record where it wrote them (§4.2), so the report can't list them either. |
| Everything else | never | The user's clusters, contexts and podman machines, remote clusters, container images, the `kind` container network, helm's cache, and host tools (§3). |

`--keep-config` keeps `local-config.yaml`, `solo-config.yaml` and the `one-shot-<deployment>/` folders of deployments
whose clusters all survive. A deployment is dropped from `local-config.yaml` when one of its cluster refs points at a
cluster that uninstall deleted, and so are those cluster refs. Everything else in `SOLO_HOME` is deleted, including
`cache/keys/`: a deploy only stages keys there, then stores them as cluster secrets.

The rootful Linux podman path should let kind write the context itself, so `kind delete cluster` removes it. That fix
is tracked in [#6306](https://github.com/hiero-ledger/solo/issues/6306); until it lands, uninstall only lists the
leftover entries.

## 7. Install Channels

| Channel | Program | How uninstall starts | Who removes the program |
|---------|---------|----------------------|-------------------------|
| Install script, Linux and macOS | `~/.solo/bin/solo`, or the `--prefix` folder | `solo uninstall` | `solo uninstall`: the binary, then the marked `PATH` block or `solo.fish` |
| Install script, Windows (#6196) | `%USERPROFILE%\.solo\bin\solo.exe`, and MSYS2 in `%USERPROFILE%\.solo\msys2\` | `solo uninstall` | `solo uninstall` deletes `msys2\`; after the command exits, a detached helper deletes `solo.exe` and removes the user `PATH` entry (§7.1) |
| npm | npm global prefix | `solo uninstall` | The user: Solo removes the data, then prints `npm uninstall -g @hiero-ledger/solo` |
| Homebrew (deprecated) | Cellar | `solo uninstall` | The user: Solo removes the data, then prints `brew uninstall solo` |
| NSIS installer (deferred, #5723) | The same folders as the Windows script | Settings > Apps runs `Uninstall.exe` | `Uninstall.exe` runs `solo.exe uninstall --quiet-mode --keep-binary` (plus `--keep-config` if the user chooses to keep their configuration). When that succeeds, it removes the program folder, the `PATH` entry and its registry key. On a non-zero exit it shows the report and asks before it removes the program; a silent uninstall (`/S`) stops and keeps it |
| deb/rpm packages (deferred, Linux §8) | `/usr/bin/solo` | `preremove` prints a notice | The package manager. `preremove` runs as root and can't clean the user's data (Linux §7.2), so the notice asks to run `solo uninstall --keep-binary` first and to remove the package only after it reports success |

- Uninstall detects the channel the same way `solo update` does (#6104 §6.1): `isSea()`, the real path of
  `process.execPath`, Homebrew's Cellar path, and NSIS's `Uninstall.exe` next to `solo.exe`. Run by hand on an NSIS
  install, `solo uninstall` removes the data and tells the user to finish in Settings > Apps.
- On the script channels the program is the real path of `process.execPath`. Nothing records a `--prefix` folder or
  which startup file the script edited, so uninstall looks for the installer's block in `~/.bashrc`, `~/.bash_profile`
  and `${ZDOTDIR:-$HOME}/.zshrc`, and for `solo.fish`, since the user may have changed shells after installing. It
  deletes `solo.fish` only while it holds just what the installer wrote.
- Uninstall never elevates itself. When the program's folder is not writable (a `sudo` install with `--prefix`), the
  report prints `sudo rm <path>`, the same way `solo update` prints the install command (#6104 §7).
- After the program, uninstall removes `~/.solo/bin` and `~/.solo` if they are empty.
- If `PATH` still finds another `solo`, for example an npm install next to a script install, the report names it and
  how to remove it, as the install script already warns.
- `--keep-binary` leaves the program to the package uninstaller, and keeps its folder only when that folder is in
  `~/.solo` (`bin\` and `msys2\` with NSIS). A deb/rpm package puts the program in `/usr/bin` and never touches
  `~/.solo/bin`, which then holds only helm, kind, kubectl and podman, so uninstall deletes it as in any other run.

### 7.1 Windows: removing the running `solo.exe`

Windows cannot delete a running `.exe`. As its last step, `solo uninstall` starts a short-lived detached helper (a
`powershell.exe` process, which Windows ships with) and exits. The helper:

1. waits for the `solo uninstall` process to exit,
2. deletes `solo.exe` and its `bin\` folder, retrying for up to 30 seconds while another `solo.exe` still holds the
   file, then deletes `%USERPROFILE%\.solo` if it is empty,
3. removes `%USERPROFILE%\.solo\bin` from the user `PATH`.

If the helper cannot start, the report prints the manual commands. The helper's own errors can't reach the user, so
the report always says that `solo.exe` is removed after the command exits, and how to finish if it is still there.

Windows also cannot delete Solo's open log file, so uninstall closes it before it deletes `logs\`.

## 8. Command and Flow

```text
solo uninstall [--quiet-mode] [--keep-config] [--keep-binary] [--force]
```

| Flag | Effect |
|------|--------|
| `--quiet-mode` | No prompts. Deletes recorded clusters even when deployments run on them, leaves unrecorded resources and overridden folders, and continues past unreachable resources. Package uninstallers use it. |
| `--keep-config` | Keeps the configuration listed in §6. |
| `--keep-binary` | Leaves the program, and its folder when that is in `~/.solo`, to the package uninstaller (§7). |
| `--force` | Interactive runs only: continue when a recorded resource can't be reached. It has no effect with `--quiet-mode`, which already continues. |

There is no `--keep-clusters` flag.

1. **Preflight** (read-only): find the channel and the program; read the ownership record; check that each recorded
   resource can be reached (its runtime runs and the resource exists); look for an unrecorded `solo-cluster` and
   `podman-machine-default`; read `local-config.yaml` to see which deployments run on which clusters.
2. **Plan** (interactive runs only): show what will be deleted and what stays. Ask about each recorded cluster that
   still runs deployments, each unrecorded resource and each overridden folder (default no), then confirm the whole
   plan (default no). Deployments on clusters that stay keep running, and Solo forgets them unless `--keep-config` is
   set; the plan suggests destroying them first.
3. **Stop** the persistent port-forward workers, then the `kubectl port-forward` processes that run from `bin/` (§6).
4. **Delete** the clusters, then the podman machine. Each record entry is removed as soon as its resource is gone.
5. **Delete files**: `SOLO_HOME` (or the confirmed overridden folders), except the program files and what
   `--keep-config` keeps, then `~/.solo/sea-resources/`.
6. **Remove the program** and its `PATH` lines (§7), unless `--keep-binary` is set.
7. **Report** what was removed, and every leftover with the command to remove it. Exit `0` when the plan completed,
   non-zero when anything in it was left. On Windows the helper starts after the report (§7.1).

- `solo uninstall` skips the usual command setup: no dependency check or download, no helm repository setup, no update
  check and no first-run warm-up. Otherwise it would download tools and add helm repositories just before removing
  them, and write files back into `SOLO_HOME` after deleting it.
- Unreachable recorded resource (Docker stopped, for example; a stopped recorded podman machine is started instead):
  an interactive run stops before deleting anything and asks the user to start it and retry. `--force` continues.
  `--quiet-mode` always continues.
- Continuing leaves that resource with its record entry, and keeps `bin/` and the program, so starting the runtime and
  running `solo uninstall` again finishes the job. The report says so and exits non-zero; §7 says how package
  uninstallers handle that exit code.
- On the rootful Linux podman path, checking and deleting the cluster need `sudo`, as creating it did. `--quiet-mode`
  uses `sudo -n`, which fails at once when it would need a password, instead of waiting for one nobody types. If
  `sudo` can't run, the cluster counts as unreachable.

## 9. Related Work

- [#6273](https://github.com/hiero-ledger/solo/issues/6273) and
  [#6276](https://github.com/hiero-ledger/solo/issues/6276): the install script and `npm install -g` (PR #6277)
  download images only on request. `solo one-shot single deploy` still caches them unless
  `ENABLE_IMAGE_CACHE=false`. Either way the archives land in `$SOLO_HOME/cache/images/`, which uninstall removes
  with `SOLO_HOME`.
- [#6094](https://github.com/hiero-ledger/solo/issues/6094): the first-run warm-up marker lives in `SOLO_HOME` (§4.1),
  and `solo uninstall` must not trigger the warm-up (§8).
- [#6104](https://github.com/hiero-ledger/solo/pull/6104) §10: `solo update` keeps the version it replaced and the new
  one, and prunes the other `sea-resources/<version>/` folders only after the update succeeds. Uninstall removes the
  whole folder.
- [#4948](https://github.com/hiero-ledger/solo/issues/4948): cleanup gaps in `destroy`, such as the cluster that
  `one-shot single destroy` leaves. Uninstall doesn't change `destroy`.
- The manual removal steps in the solo-docs Linux Install Script page and the full reset on the Cleanup page are
  replaced by `solo uninstall` once it ships.

## 10. Risks

- **Clusters from before the record** are only offered by name in an interactive run, and `--quiet-mode` leaves them.
  A package uninstaller can therefore leave a `solo-cluster` behind on machines that ran Solo before the record
  shipped.
- **The record is per `SOLO_HOME`.** Clusters created with `SOLO_HOME=/data/solo` look unrecorded to a plain
  `solo uninstall`: only `solo-cluster` is offered, in an interactive run, and `--quiet-mode` leaves them all. Run
  `solo uninstall` with the `SOLO_HOME` that created them.
- **Leftover commands need the tool on `PATH`.** The `helm`, `kind`, `podman` and `kubectl` commands in the report
  can't use Solo's copies, which go with `bin/`. The report says so when the tool is missing.
- **`--quiet-mode` deletes recorded clusters with their deployments.** A package uninstaller that runs it should say so
  in its own confirmation.
- **Overridden folders stay in `--quiet-mode`**, including a `$SOLO_HOME/cache/images/` that can hold several GB. The
  report lists them.
- **The Windows helper can fail without telling anyone.** A `solo.exe` started in another terminal can hold the file
  past the helper's retries. The report printed before exit says how to finish.
- **The rootful Linux podman path leaves `kind-kind` in the user's kubeconfig** until kind writes that context itself
  (§6).

## 11. Implementation

1. Ownership record (§5), replacing #6088. It ships first.
2. `solo uninstall` (§6 to §8), replacing #6089. It is a top-level command with no group, like `solo update`, so it
   also updates the CLI architecture document.
3. Rootful Linux podman path ([#6306](https://github.com/hiero-ledger/solo/issues/6306)): let kind write the
   cluster's context into the user's kubeconfig, so `kind delete cluster` removes it.
4. Docs: replace the manual removal steps in solo-docs (Linux Install Script and Cleanup pages) with `solo uninstall`.
5. Installers: the macOS branch of `install.sh` (#5724) writes the same marked `PATH` block, and `install.ps1`
   (#6196) installs into the folders in §7, so `solo uninstall` finds both. The NSIS uninstaller (#5723) runs
   `solo.exe uninstall --quiet-mode --keep-binary` and checks its exit code before it removes the program (§7).

## 12. References

- [Linux installer design](linux-installer-evaluation.md) (§3, §5.1, §5.2, §7.2, §8, §9)
- [macOS installer design](macos-dmg-installer.md) (§5, §7.2)
- [Windows installer design](https://github.com/hiero-ledger/solo/pull/6196) (§4.6, §5.1, §6.3, §7.2, §7.5)
- [Self-upgrade design](https://github.com/hiero-ledger/solo/pull/6104) (§6.1, §7, §10)
- [#6088](https://github.com/hiero-ledger/solo/issues/6088), [#6089](https://github.com/hiero-ledger/solo/issues/6089),
  [#4948](https://github.com/hiero-ledger/solo/issues/4948)
- [Review answers on #6275](https://github.com/hiero-ledger/solo/pull/6275#issuecomment-6339221986)

---

_Last updated: 2026-10-27 (second review round folded in)_
