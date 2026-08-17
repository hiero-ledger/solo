# Linux Installer Tooling Evaluation

**Issue:** [#5720](https://github.com/hiero-ledger/solo/issues/5720)  
**Epic:** [#5714](https://github.com/hiero-ledger/solo/issues/5714) — OS-Specific Solo Installers  
**Blocks:** [#5725](https://github.com/hiero-ledger/solo/issues/5725) — Build Linux Installer

## Background

Solo currently distributes exclusively as an npm package (`npm install -g @hiero-ledger/solo`), which requires Node.js ≥ 22 and npm ≥ 9.8.1 to be pre-installed. The broader initiative is to ship native OS installers so end users need no runtime pre-installed. The Linux leg requires choosing a packaging format before building the installer.

The chosen format must satisfy three requirements from the parent epic:

1. Run `solo cache image pull` as a post-install step.
2. Run a cleanup script on uninstall (remove clusters, image caches, residual files).
3. Generate as a release artifact in CI without excessive pipeline complexity.

### Distribution target matrix

The install-validation workflow at `.github/workflows/flow-install-validation.yaml` defines the supported distributions:

| Distribution | Image tested |
|---|---|
| Ubuntu | 24.04 |
| Debian | 12 |
| Fedora | 44 |
| Rocky Linux | 9 |
| AlmaLinux | 9 |
| Oracle Linux | 9 |
| openSUSE Leap | 16.0 |
| Arch Linux | latest |
| Alpine | 3.21 |

---

## Candidates

### 1. makeself

Creates a self-extracting shell archive (typically `.run` or `.sh`). The archive header is a POSIX shell script; appended to it is a compressed tarball (gzip, bzip2, xz, or zstd). Running the archive extracts the payload to a target directory and then invokes a designated setup script.

**How it works in practice:**

```sh
makeself /path/to/payload solo-installer.run "Solo Installer" ./install.sh
```

Running `sudo ./solo-installer.run` extracts everything to a temp directory and runs `install.sh`, which can copy the SEA binary, add it to `PATH`, and invoke `solo cache image pull`.

An uninstall script can be bundled inside the payload and invoked by a separate `solo-installer.run --uninstall` mechanism, or installed to a known path during setup.

**Install/uninstall UX**

| Step | Command |
|---|---|
| Install | `chmod +x solo.run && sudo ./solo.run` |
| Uninstall | `/opt/solo/uninstall.sh` (or equivalent, installed at setup time) |

No package manager integration; updates require downloading and re-running a new `.run` file.

**CI build complexity**

Very low. `makeself` is a single shell script with no build-system dependencies. One invocation produces the distributable:

```sh
curl -Lo makeself https://github.com/megastep/makeself/releases/download/release-2.5.0/makeself.run
chmod +x makeself && ./makeself  # self-extracts makeself itself
./makeself/makeself.sh payload/ solo.run "Solo ${VERSION}" ./install.sh
```

No cross-compilation, no language runtimes, no registry authentication.

**Distribution target breadth**

Universal. Any POSIX shell + `tar` + the chosen compression binary (`gzip` ships in every base image). Covers all nine distributions in the matrix with one artifact and no package-manager coupling.

**Upgrade path**

No built-in upgrade mechanism. A new release requires the user to download and re-run the latest `.run` file, which overwrites `/opt/solo/` in place.

Solo already ships `VersionUpdateNotifier` (`src/core/version-update-notifier.ts`), a post-command banner that detects when a newer version is available. It currently checks the npm registry (`https://registry.npmjs.org/@hashgraph/solo/latest`) and caches the result for 24 hours in `~/.solo/cache/update-check.json`. For a makeself-installed binary two small adaptations are needed:

1. **Endpoint:** switch to the GitHub Releases API (`https://api.github.com/repos/hiero-ledger/solo/releases/latest`) — the same endpoint `EdgeVersionFetcher` already uses for component version detection.
2. **Banner message:** detect the install method by checking the binary path for an `/opt/solo/` prefix (the same approach `HomebrewDeprecationNotifier` uses to detect a Cellar path) and show a `.run` download URL rather than npm upgrade instructions.

A full `solo upgrade` self-update command — download the new `.run` to a temp path, execute it as a subprocess, exit — is the longer-term option and maps to the "self-upgrade capability" item in #5714.

**Prior art**

NMT (Hedera Network Management Terminal) distributes its Linux release via makeself, providing a reference implementation the team can draw from directly.

---

### 2. AppImage

A portable application format: a squashfs filesystem concatenated with a small runtime binary. The user runs the AppImage file directly — no install step occurs.

**Install/uninstall UX**

| Step | Command |
|---|---|
| "Install" | `chmod +x solo.AppImage && ./solo.AppImage` |
| "Uninstall" | `rm solo.AppImage` |

There is no installation lifecycle. The AppImage runs in place from wherever the user downloaded it. There is no mechanism to place a binary in `PATH`, no post-run hook, and no uninstall script. Users must manually create a `.desktop` file or symlink to get system integration.

**CI build complexity**

Low to medium. `appimagetool` must run on a Linux x86_64 host (or ARM64 for that target). FUSE may be required on the build host depending on AppImage type. Cross-building is unsupported.

**Distribution target breadth**

Universal for glibc-based distributions (≥ 2.17). Does not run natively on Alpine (musl libc); Alpine users would need a compatibility layer. Coverage is therefore incomplete across the nine-distribution matrix.

**Upgrade path**

AppImage has a native delta-update protocol (`AppImageUpdate` / zsync): the `.AppImage` file can download only the changed blocks of a new release and patch itself in-place. However, because AppImage has no install lifecycle, this only updates the portable file — it cannot re-run a post-install hook or update resources installed to the system. The upgrade mechanism is self-contained within the AppImage paradigm, which is incompatible with Solo's requirements.

**Ruling out AppImage**

AppImage is a portable application runner, not an installer. It cannot satisfy the two lifecycle requirements (post-install `solo cache image pull` and uninstall cleanup) without wrapping it in an outer installer — which defeats the purpose of using AppImage and introduces a second tool. AppImage is eliminated.

---

### 3. Native packages (.deb / .rpm)

`.deb` packages (consumed by `apt`/`dpkg`) target Debian and Ubuntu. `.rpm` packages (consumed by `dnf`/`yum`/`rpm`) target Fedora, Rocky Linux, AlmaLinux, Oracle Linux, and openSUSE.

**Install/uninstall UX**

| Step | Debian/Ubuntu | Fedora/RHEL-family |
|---|---|---|
| Install (with repo) | `apt install solo` | `dnf install solo` |
| Install (local file) | `apt install ./solo.deb` | `dnf install ./solo.rpm` |
| Uninstall | `apt remove solo` | `dnf remove solo` |

The with-repository experience is the best of any option evaluated — single command, no download step, automatic dependency resolution. Without a hosted repository, users download and install a local file, which is workable but less ergonomic.

Lifecycle hooks (`postinst`, `prerm`) provide clean places to run `solo cache image pull` and the uninstall script.

**CI build complexity**

High when building both formats independently. `dpkg-deb` or `debhelper` is required for .deb builds; `rpmbuild` is required for .rpm builds. Each format has distinct packaging conventions, directory layouts, and metadata files. Two separate build jobs are needed, with separate GPG signing keys for each format.

Neither format covers Arch Linux or Alpine Linux natively, requiring additional work for those distributions.

**Upgrade path**

With a hosted repository, package manager upgrades work natively: `apt upgrade solo` / `dnf upgrade solo`. Users who added the Solo repository during initial install get upgrades automatically through normal system update flows (`apt update && apt upgrade`, `dnf upgrade`). Without a hosted repository, upgrade is manual — re-download the new `.deb` or `.rpm` and reinstall.

**Distribution target breadth**

Partial. `.deb` covers Ubuntu and Debian; `.rpm` covers Fedora, Rocky, AlmaLinux, Oracle Linux, and openSUSE. Arch requires an AUR package (community-maintained). Alpine uses `apk` — a third format requiring separate tooling. Full nine-distribution coverage needs three or four package formats.

---

### 4. FPM (Effing Package Manager)

FPM is a Ruby gem that generates multiple Linux package formats from a single source directory and a set of command-line flags. One invocation produces a `.deb`; changing `--output-type` produces an `.rpm`, an Alpine `apk`, or an Arch `pacman` package.

```sh
fpm -s dir -t deb -n solo -v "${VERSION}" \
    --after-install scripts/postinstall.sh \
    --before-remove scripts/preuninstall.sh \
    /opt/solo/=/opt/solo/
```

**Install/uninstall UX**

Same as native .deb/.rpm: either package-manager-first (with a hosted repository) or local-file install. Lifecycle hooks (`--after-install`, `--before-remove`) satisfy both post-install and uninstall requirements.

**CI build complexity**

Medium. A single `gem install fpm` step adds Ruby to the CI environment. After that, one FPM invocation per output format covers all target distributions with consistent metadata. The CI surface is significantly smaller than maintaining separate `.deb` and `.rpm` build pipelines.

FPM supports `deb`, `rpm`, `apk`, and `pacman` output types, meaning all nine distributions in the matrix can be covered from one tool.

**Upgrade path**

Same as native .deb/.rpm: `apt upgrade solo` / `dnf upgrade solo` with a hosted repository, or manual re-download without one. Because FPM also generates `apk` and `pacman` packages, Arch and Alpine users get the same package-manager upgrade story if those repositories are hosted.

**Repository hosting**

APT and YUM/DNF repositories are static file trees — `apt` expects a signed `Packages.gz` + `Release`/`InRelease`; `dnf` expects a `repodata/` directory with `repomd.xml`. Three options are viable for Solo:

- **JFrog Artifactory (recommended):** Solo already publishes npm packages to JFrog, which natively supports Debian and RPM repository types. Adding a `debian` and `rpm` repository to the same instance requires no new infrastructure; the release workflow uploads the package alongside the npm tarball.

- **GitHub Pages:** A CI job generates the repository metadata after each release and pushes it to a `gh-pages` branch. GitHub Pages serves the static files. This is GitHub-native and used by projects like Tailscale, but requires maintaining the metadata generation step in CI.

- **GitHub Releases only (no repository):** Upload `.deb` and `.rpm` as release assets. Users install with `apt install ./solo.deb` or `dnf install ./solo.rpm` (local file). `apt upgrade` / `dnf upgrade` do not work — upgrade stays manual. This gives native package format UX at install time without the repository infrastructure overhead.

Once a repository is configured, users add it once during initial setup:

```sh
# Debian/Ubuntu
curl -fsSL https://<repo-host>/solo/apt/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/solo.gpg
echo "deb [signed-by=/usr/share/keyrings/solo.gpg] https://<repo-host>/solo/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/solo.list
sudo apt update && sudo apt install solo

# Fedora/RHEL-family
sudo curl -fsSL -o /etc/yum.repos.d/solo.repo https://<repo-host>/solo/rpm/solo.repo
sudo dnf install solo
```

Subsequent upgrades are handled by the package manager with no user intervention beyond `apt upgrade` or `dnf upgrade`.

**Distribution target breadth**

Full — equivalent to the nine-distribution matrix — if all four output types (`deb`, `rpm`, `apk`, `pacman`) are generated. Without a hosted repository per format, users still install via local file, but all distributions are reachable.

---

## Comparison

| Criterion | makeself | AppImage | .deb / .rpm | FPM |
|---|---|---|---|---|
| **Post-install hook** | Yes (setup script) | No | Yes (postinst) | Yes (--after-install) |
| **Uninstall hook** | Yes (bundled script) | No | Yes (prerm) | Yes (--before-remove) |
| **Install UX** | `./solo.run` | N/A (not an installer) | `apt install ./solo.deb` | Same as .deb/.rpm |
| **Uninstall UX** | Run bundled script | `rm` the file | `apt remove solo` | Same as .deb/.rpm |
| **Package manager integration** | None | None | Full | Full (with hosted repo) |
| **CI complexity** | Very low | Low–medium | High | Medium |
| **Distro coverage** | All 9 (one artifact) | 8/9 (no Alpine) | 7/9 (no Arch, no Alpine) | All 9 (4 output types) |
| **Repository infrastructure** | Not needed | Not needed | Required for best UX | Required for best UX |
| **NMT precedent** | Yes | No | No | No |
| **Build dependencies** | Shell + tar | appimagetool | dpkg-deb + rpmbuild | Ruby + fpm gem |
| **Upgrade path** | Re-run new `.run` + version-check banner | AppImageUpdate delta patch (incompatible with lifecycle) | `apt upgrade` / `dnf upgrade` (requires hosted repo) | Same as .deb/.rpm |

---

## Bundle contents

The makeself payload contains everything Solo needs at runtime — not just the SEA binary. Solo reads the `resources/` directory from disk at runtime (Helm values files, config YAML, shell scripts executed inside pods, CRD manifests, and node configuration templates). The post-build script already copies `resources/` alongside the compiled JS in the npm distribution; the same files must travel with the SEA binary in the installer.

```
payload/
├── solo                   # SEA binary
├── resources/             # runtime assets copied from dist/resources/
│   ├── config/            # helm-chart-config.yaml, solo-cache-images-target.yaml, tss-config.yaml
│   ├── crds/              # CRD manifests applied to the cluster
│   ├── templates/         # application.properties, log4j2.xml, podman configs, etc.
│   └── *.yaml / *.sh      # Helm values overrides, utility scripts run inside pods
├── install.sh             # makeself entry point
└── uninstall.sh           # installed to a known path during setup
```

`install.sh` is responsible for:

1. Copying `solo` → `/usr/local/bin/solo`
2. Copying `resources/` → `/opt/solo/resources/`
3. Installing `uninstall.sh` → `/opt/solo/uninstall.sh`
4. Running `solo cache image pull`

`uninstall.sh` reverses steps 1–3 and runs any cluster/image-cache cleanup.

### Coordination with the SEA build (#5716)

The SEA binary needs to resolve the `resources/` path at runtime. In the current npm distribution this is relative to `__dirname` (or `import.meta.url`). In the SEA build there is no script path to anchor from, so the binary must use a fixed install path (`/opt/solo/resources`) or read it from an environment variable (e.g., `SOLO_RESOURCES_DIR`). The installer must write to whichever path the binary expects — this decision needs to be made in #5716 and matched here.

### Distribution

The `.run` archive is uploaded as a GitHub Release asset as part of the existing release workflow, alongside the npm tarball and example archives. Users download it manually from the releases page or via:

```sh
curl -fsSL -o solo.run \
  https://github.com/hiero-ledger/solo/releases/latest/download/solo-linux-x86_64.run \
  && chmod +x solo.run && sudo ./solo.run
```

---

## Recommendation

**Use makeself for the initial Linux installer (#5725), with FPM as the planned v2.**

### Why makeself for v1

The initial evaluation favoured makeself partly because FPM "requires repository infrastructure." That framing has since weakened: JFrog Artifactory is already in use for npm publishing and natively supports Debian and RPM repository types, so no new infrastructure would need to be stood up.

The reason makeself remains the right call for v1 has therefore shifted:

**makeself ships faster.** Moving to FPM + JFrog requires configuring new repository types in Artifactory, setting up GPG signing per package format, adding multiple publish steps to the release workflow, and writing user-facing repo registration instructions. That is real work that would delay #5725 without changing what Solo does.

**First-install UX favours makeself.** With makeself the user runs one command:
```sh
curl -fsSL -o solo.run https://github.com/hiero-ledger/solo/releases/latest/download/solo-linux-x86_64.run
chmod +x solo.run && sudo ./solo.run
```
With FPM + a hosted repository, first install requires registering a GPG key, adding an apt/dnf source, running `apt update`, then installing — four steps before Solo is usable. The upgrade story is better, but the onboarding story is worse.

**The upgrade gap is bridgeable.** The existing `VersionUpdateNotifier` already notifies users when a newer version is available after every command. With two small adaptations (switch the endpoint from the npm registry to the GitHub Releases API, and adjust the banner to show a `.run` download URL), makeself users get notified automatically. A `solo upgrade` self-update command closes the remaining gap and is a natural follow-on issue.

**All nine distros with one artifact.** makeself requires no per-distro build or publish step, eliminating combinatorial CI complexity and format-maintenance surface.

**NMT precedent.** The NMT team uses makeself for their Linux distribution, providing a working reference the team can draw from directly.

### Why FPM is the right v2

FPM's advantage is the upgrade story: `apt upgrade solo` / `dnf upgrade solo` works automatically after one-time repo registration, with no user action beyond normal system updates. For a pre-1.0 tool that ships breaking changes regularly, automatic package-manager upgrades are meaningfully better than manual re-runs. Since JFrog already supports Debian and RPM repository types, the infrastructure is available when the team is ready to invest in the publish workflow.

FPM's lifecycle hooks and install layout map directly onto the makeself install/uninstall scripts, so migration from v1 to v2 is a CI and publish-workflow change, not a re-architecture of the installer itself.

### Alternatives ruled out

- **AppImage:** no install/uninstall lifecycle; cannot run post-install hooks without an outer wrapper.
- **Raw .deb/.rpm:** two independent build pipelines, incomplete distro coverage (Arch and Alpine excluded natively), and the same repository infrastructure requirement as FPM without FPM's multi-format convenience.

---

*Last updated: 2026-08-17*
