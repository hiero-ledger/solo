# Linux Installer: Packaging Format and Tool Selection

## 1. Context

Solo currently distributes exclusively as the published npm package `@hiero-ledger/solo`
(`npm install -g @hiero-ledger/solo`), which requires Node.js ≥ 22 and npm ≥ 9.8.1 to be
pre-installed. Homebrew is also a live channel on Linux today — `HomebrewDeprecationNotifier`'s
`HOMEBREW_CELLAR_PATTERN` (`src/core/homebrew-deprecation-notifier.ts:26,30`) is deliberately
prefix-agnostic and matches `/home/linuxbrew/.linuxbrew/Cellar/solo/...` the same way it matches
macOS's `/opt/homebrew` or `/usr/local`, so the same deprecation banner and timeline already
covers Linuxbrew installs; nothing Linux-specific needs to change there. The npm package is kept
as-is for developers who prefer it, matching the decision the macOS sibling document makes for its
platform (`docs/design/installers/macos-dmg-installer.md:7`).

The broader initiative ([#5714](https://github.com/hiero-ledger/solo/issues/5714)) is to ship
native OS installers so end users need no runtime pre-installed. This document is the
research/design task for [#5720](https://github.com/hiero-ledger/solo/issues/5720) (Linux
specifically) and feeds [#5725](https://github.com/hiero-ledger/solo/issues/5725) (build the
Linux installer), which also depends on the SEA build pipeline
([#5716](https://github.com/hiero-ledger/solo/issues/5716)), signing infrastructure
([#5717](https://github.com/hiero-ledger/solo/issues/5717)), and the shared uninstall design
([#5721](https://github.com/hiero-ledger/solo/issues/5721)).

The actual requirements driving this work, from the parent epic:

1. Trigger an image-cache warm-up (`solo cache image pull`) around install time so the first real
   `solo` invocation doesn't stall on a large download.
2. Run cleanup on removal (Kind clusters, image caches, residual files) — scoped in detail in
   [#5721](https://github.com/hiero-ledger/solo/issues/5721).
3. Generate as a release artifact in CI without excessive pipeline complexity.

Framed against §8 below, requirement 1 is *not* the same as "run `solo cache image pull` from a
package `postinst` script" — that specific mechanism turns out to be unsafe, for reasons detailed
there. The requirement is the outcome (the cache gets warmed near install time); the doc is
explicit about *how* below.

### Distribution target matrix

The install-validation workflow at `.github/workflows/flow-install-validation.yaml` defines the
distributions Solo already validates against:

| Distribution  | Image tested |
|---------------|--------------|
| Ubuntu        | 24.04        |
| Debian        | 12           |
| Fedora        | 44           |
| Rocky Linux   | 9            |
| AlmaLinux     | 9            |
| Oracle Linux  | 9            |
| openSUSE Leap | 16.0         |
| Arch Linux    | latest       |
| Alpine        | 3.21         |

Per `.github/workflows/flow-install-validation.yaml:92`, Alpine's row already runs on musl libc
and uses the `apk`-provided Node instead of `actions/setup-node`'s glibc build, because the glibc
build cannot execute there. That same constraint applies to any glibc-linked artifact this
document produces — see §3 and §6.4.

***

## 2. Goals

* Select a Linux packaging format/tool and justify it against install/uninstall UX, CI build
  complexity, and distribution-target breadth, per the acceptance criteria in
  [#5720](https://github.com/hiero-ledger/solo/issues/5720).
* Apply the same tool-health rigor the macOS document applies to DMG builders
  (`docs/design/installers/macos-dmg-installer.md:146-163`) to whatever packaging tool is
  recommended here.
* Define an install path layout that is both FHS-compliant and consistent with how the SEA build
  ([#5810](https://github.com/hiero-ledger/solo/pull/5810)) actually resolves its runtime
  resources, so [#5725](https://github.com/hiero-ledger/solo/issues/5725) does not have to
  reverse-engineer it.
* Redesign the "run `solo cache image pull`" requirement around a mechanism that actually works
  under a package manager's lifecycle-script constraints (root, no TTY, sometimes no network).
* Scope repository hosting *and* signing for whichever package formats are chosen, matching the
  level of detail [#5717](https://github.com/hiero-ledger/solo/issues/5717) needs.

## 3. Non-Goals

* **Full uninstall behavior** — deleting Kind clusters, image caches, and Solo directories is
  designed once, shared across OSes, in
  [#5721](https://github.com/hiero-ledger/solo/issues/5721). This document only says *where* the
  Linux package hooks into that shared design (§8.2), not what the cleanup itself does.
* **Signing-key custody and CI secret provisioning** — tracked in
  [#5717](https://github.com/hiero-ledger/solo/issues/5717); this document covers only which
  signing step each package format needs (§7).
* **The self-upgrade flow** — [#5722](https://github.com/hiero-ledger/solo/issues/5722); §6.4's
  `VersionUpdateNotifier` discussion is background for that task, not a substitute for it.
* **macOS or Windows installers** — tracked separately under #5714; this document is Linux-only.
* **Building a musl-linked SEA binary.** The SEA build matrix in
  [#5810](https://github.com/hiero-ledger/solo/pull/5810)
  (`.github/workflows/flow-build-sea.yaml`) builds the Linux leg on `hiero-solo-linux-medium`
  (a self-hosted, glibc-based runner) for `linux/x64` only — there is no musl-linked leg yet. A
  musl-compatible SEA binary is what Alpine packaging needs to exist first; producing it is a
  [#5716](https://github.com/hiero-ledger/solo/issues/5716)/#5810 workstream in the same epic, not
  a packaging-format question this document decides (see §6.4). §9's recommendation packages
  Alpine the same way as every other distribution as soon as that binary exists.
* **Extending the SEA build matrix to `arm64`/`aarch64`.** The same SEA build matrix produces
  `x64` only on every platform today; no `linux/arm64` leg exists yet. Adding one is its own
  workstream (and needs an architecture-naming mapping — `deb` calls it `arm64`, `rpm` calls it
  `aarch64`) that this document doesn't design, but §9's nfpm configuration packages `arm64`
  alongside `x64` without any change once that leg lands.
* **Publishing to the AUR.** `pacman` can install an nfpm-produced package directly (§9), but the
  channel Arch users actually expect is the AUR — a community-maintained `PKGBUILD` reviewed and
  voted on by Arch users through the AUR's own submission process, which is a different
  publishing mechanism than a CI-built package artifact. Maintaining an AUR `PKGBUILD` is an
  ongoing commitment (keeping it in sync with every release) distinct from anything nfpm
  produces; it is worth its own tracked issue if the team wants Solo listed there, but it isn't
  something this document's packaging pipeline can output.

***

## 4. Candidates

### 4.1 makeself

Creates a self-extracting shell archive (typically `.run` or `.sh`). The archive header is a
POSIX shell script; appended to it is a compressed tarball (gzip, bzip2, xz, or zstd). Running the
archive extracts the payload to a target directory and then invokes a designated setup script.

**How it works in practice:**

```sh
makeself /path/to/payload solo-installer.run "Solo Installer" ./install.sh
```

Running `sudo ./solo-installer.run` extracts everything to a temp directory and runs
`install.sh`, which can copy the SEA binary, add it to `PATH`, and trigger the image-cache
warm-up.

**Install/uninstall UX**

| Step      | Command                                                      |
|-----------|--------------------------------------------------------------|
| Install   | `chmod +x solo.run && sudo ./solo.run`                       |
| Uninstall | `/opt/solo/uninstall.sh` (or equivalent, installed at setup) |

No package manager integration; updates require downloading and re-running a new `.run` file.

**CI build complexity**

Very low. `makeself` is a single shell script with no build-system dependencies:

```sh
curl -Lo makeself https://github.com/megastep/makeself/releases/download/release-2.5.0/makeself.run
chmod +x makeself && ./makeself  # self-extracts makeself itself
./makeself/makeself.sh payload/ solo.run "Solo ${VERSION}" ./install.sh
```

No cross-compilation, no language runtimes, no registry authentication.

**Distribution target breadth**

Universal at the shell level — any POSIX shell + `tar` + the chosen compression binary. But
"universal shell support" is not the same as "the payload runs": the payload is still the SEA
binary from `hiero-solo-linux-medium` (glibc, x64), so makeself does not, by itself, extend
coverage to Alpine or arm64 — see §6.4.

**Upgrade path**

No built-in upgrade mechanism. A new release requires the user to download and re-run the latest
`.run` file, which overwrites `/opt/solo/` in place.

Solo already ships `VersionUpdateNotifier` (`src/core/version-update-notifier.ts`), a
post-command banner that detects when a newer version is available. It currently checks the npm
registry (`https://registry.npmjs.org/@hiero-ledger/solo/latest` — built from `PACKAGE_NAME` in
`src/core/constants.ts:22`, not the pre-rename `@hashgraph/solo`) and caches the result for 24
hours in `~/.solo/cache/update-check.json`. For a makeself-installed binary two small adaptations
are needed:

1. **Endpoint:** switch to the GitHub Releases API
   (`https://api.github.com/repos/hiero-ledger/solo/releases/latest`) — the same endpoint
   `EdgeVersionFetcher` already uses for component version detection.
2. **Banner message:** detect the install method by checking the binary path for an `/opt/solo/`
   prefix (the same approach `HomebrewDeprecationNotifier` uses for a Cellar path) and show a
   `.run` download URL rather than npm upgrade instructions.

A full `solo upgrade` self-update command is the longer-term option and maps to the self-upgrade
item in #5714, designed in [#5722](https://github.com/hiero-ledger/solo/issues/5722).

***

### 4.2 AppImage

A portable application format: a squashfs filesystem concatenated with a small runtime binary.
The user runs the AppImage file directly — no install step occurs.

**Install/uninstall UX**

| Step        | Command                                     |
|-------------|---------------------------------------------|
| "Install"   | `chmod +x solo.AppImage && ./solo.AppImage` |
| "Uninstall" | `rm solo.AppImage`                          |

There is no installation lifecycle: no mechanism to place a binary in `PATH`, no post-run hook,
no uninstall script.

**CI build complexity**

Low to medium. `appimagetool` must run on a Linux host matching the target architecture; FUSE may
be required depending on AppImage type. Cross-building is unsupported.

**Distribution target breadth**

Even setting aside the lifecycle problem below, AppImage only runs on glibc-based distributions
(≥ 2.17) — it does not run natively on Alpine, which needs its own musl build regardless (§3).

**Upgrade path**

AppImage has a native delta-update protocol (`AppImageUpdate`/zsync), but because there is no
install lifecycle, it can only patch the portable file in place — it cannot re-run a post-install
hook. Incompatible with Solo's requirements.

**Ruling out AppImage**

AppImage is a portable application runner, not an installer. It cannot satisfy the two lifecycle
requirements (image-cache warm-up, uninstall cleanup) without wrapping it in an outer installer —
which defeats the purpose of using it and introduces a second tool. AppImage is eliminated.

***

### 4.3 Native packages (.deb / .rpm), built independently

`.deb` packages (consumed by `apt`/`dpkg`) target Debian and Ubuntu. `.rpm` packages (consumed by
`dnf`/`yum`/`rpm`) target Fedora, Rocky Linux, AlmaLinux, Oracle Linux, and openSUSE.

**Install/uninstall UX**

| Step                 | Debian/Ubuntu            | Fedora/RHEL-family       |
|----------------------|--------------------------|--------------------------|
| Install (with repo)  | `apt install solo`       | `dnf install solo`       |
| Install (local file) | `apt install ./solo.deb` | `dnf install ./solo.rpm` |
| Uninstall            | `apt remove solo`        | `dnf remove solo`        |

The with-repository experience is the best of any option evaluated. Lifecycle hooks (`postinst`,
`prerm`) provide clean places to hook into the shared install/uninstall design — see §8 for why
"clean place to hook in" is not the same as "safe to run image-pull or cluster-deletion logic
directly."

**CI build complexity**

High when building both formats independently: `dpkg-deb`/`debhelper` for `.deb`, `rpmbuild` for
`.rpm`, distinct packaging conventions and metadata files, two build jobs, and (per §7) two
separate signing paths.

Neither format covers Arch or Alpine natively.

**Upgrade path**

With a hosted repository: `apt upgrade solo` / `dnf upgrade solo`. Without one: manual
re-download and reinstall.

**Distribution target breadth**

Partial: `.deb` covers Ubuntu/Debian; `.rpm` covers Fedora/Rocky/AlmaLinux/Oracle/openSUSE. Arch
and Alpine need separate formats and tooling. This is exactly the gap a multi-format generator
(§4.4) exists to close, at the cost of a maintenance surface (two independent build pipelines)
that's strictly worse than the alternative below with no offsetting benefit.

***

### 4.4 Multi-format package generators: FPM vs. nfpm

Both tools generate multiple Linux package formats from one declarative source, avoiding the
"two independent pipelines" problem in §4.3.

**FPM (Effing Package Manager)** is a Ruby gem:

```sh
fpm -s dir -t deb -n solo -v "${VERSION}" \
    --after-install scripts/postinstall.sh \
    --before-remove scripts/preuninstall.sh \
    /usr/bin/solo=/usr/bin/solo
```

**nfpm** is a single static Go binary from the GoReleaser project, built explicitly as a
dependency-free alternative to FPM:

```yaml
# nfpm.yaml
name: solo
version: "${VERSION}"
platform: linux
contents:
  - src: ./dist/solo
    dst: /usr/bin/solo
scripts:
  postinstall: scripts/postinstall.sh
  preremove: scripts/preuninstall.sh
```

```sh
nfpm package --config nfpm.yaml --packager deb --target dist/
nfpm package --config nfpm.yaml --packager rpm --target dist/
nfpm package --config nfpm.yaml --packager apk --target dist/
nfpm package --config nfpm.yaml --packager archlinux --target dist/
```

**Install/uninstall UX**

Identical for both — the output is a standard `.deb`/`.rpm`/`.apk`/`.pkg.tar.zst`, so it's the
same package-manager-first or local-file experience as §4.3, and the same lifecycle-hook
discussion in §8 applies to both tools' scripts equally.

**CI build complexity**

* **FPM:** `gem install fpm` adds a Ruby toolchain to CI. `rpm` output additionally needs
  `rpmbuild` on the build host.
* **nfpm:** a single static binary (`go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest`,
  or a pinned release download) — no Ruby, no `rpmbuild` dependency, no native-extension
  compilation step. This is a smaller CI surface than FPM's for the same output.

**Tool-health assessment**

The macOS document applies a maintenance/release-cadence/issue-load comparison to its DMG-builder
candidates (`docs/design/installers/macos-dmg-installer.md:146-163`); the same rigor applies here,
since "one tool, four formats" is the entire argument for using either of these over §4.3:

|                         | FPM (`jordansissel/fpm`)                                                                              | nfpm (`goreleaser/nfpm`)                                                                                                                                |
|-------------------------|-------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Latest release          | v1.18.0 (2026-08-26)                                                                                  | v2.47.0 (2026-06-20)                                                                                                                                    |
| Open issues             | 791                                                                                                   | 17                                                                                                                                                      |
| Runtime dependency      | Ruby (`gem install fpm`); `rpmbuild` for `.rpm`                                                       | None — static Go binary                                                                                                                                 |
| Output formats          | `deb`, `rpm`, `apk`, `pacman`, and others (via a large flag surface)                                  | `deb`, `rpm`, `apk`, `archlinux` — declarative one-file-per-target config (repo ships `apk/`, `arch/`, `deb/`, `rpm/`, `ipk/` packager implementations) |
| `apk`/`pacman` maturity | Best-effort output types layered onto a `deb`/`rpm`-first tool; no first-class test matrix documented | First-class packager implementations alongside `deb`/`rpm`, part of the same acceptance test suite                                                      |
| CI footprint            | Ruby + gem install + native extensions on some hosts                                                  | Single pinned static binary                                                                                                                             |

FPM is still actively released, so "unmaintained" (the reason the macOS document rejected
`appdmg`) does not apply. But its 791 open issues against nfpm's 17 — on top of the Ruby
toolchain dependency this project would otherwise not need anywhere else in its CI — is a real
maintenance-surface difference, and nfpm's `apk`/`archlinux` support is exercised as a first-class
packager rather than a secondary output type. **nfpm is the better-fitted tool** for exactly the
"four formats from one source" use case this document needs; see §9.

**Upgrade path**

Same as §4.3: `apt upgrade solo` / `dnf upgrade solo` with a hosted repository, or manual
re-download without one. `apk` and `pacman` outputs get the same story once those repositories
exist (§7).

**Distribution target breadth**

Full coverage of the nine-distribution matrix is reachable from nfpm alone — `deb`, `rpm`, `apk`,
and `archlinux` are all first-class packager implementations in the same tool (§4.4). `apk`
packaging starts as soon as the musl SEA binary in §3 exists; a `pacman`-installable package is
available the same way, though the AUR itself (the channel Arch users actually reach for) is a
separate, non-nfpm publishing mechanism per §3.

***

## 5. Comparison

| Criterion                       | makeself                                             | AppImage                                                 | .deb / .rpm (separate)                            | nfpm                                                                                 |
|---------------------------------|------------------------------------------------------|----------------------------------------------------------|---------------------------------------------------|--------------------------------------------------------------------------------------|
| **Post-install hook**           | Yes (setup script)                                   | No                                                       | Yes (`postinst`)                                  | Yes (`postinstall`)                                                                  |
| **Uninstall hook**              | Yes (bundled script)                                 | No                                                       | Yes (`prerm`)                                     | Yes (`preremove`)                                                                    |
| **Install UX**                  | `./solo.run`                                         | N/A (not an installer)                                   | `apt install ./solo.deb`                          | Same as `.deb`/`.rpm`                                                                |
| **Uninstall UX**                | Run bundled script                                   | `rm` the file                                            | `apt remove solo`                                 | Same as `.deb`/`.rpm`                                                                |
| **Package manager integration** | None                                                 | None                                                     | Full                                              | Full (with hosted repo)                                                              |
| **CI complexity**               | Very low                                             | Low–medium                                               | High (two pipelines)                              | Low (single static binary)                                                           |
| **Distro coverage**             | All non-Alpine (one artifact, still glibc/x64-bound) | 8/9 (no Alpine; not an installer regardless)             | 7/9 (no Arch, no Alpine)                          | 9/9 target (`deb`, `rpm`, `apk`, `archlinux`); `apk` ships once the musl SEA build (§3) lands |
| **Repository infrastructure**   | Not needed                                           | Not needed                                               | Required for best UX                              | Required for best UX (§7)                                                            |
| **Build dependencies**          | Shell + tar                                          | appimagetool                                             | dpkg-deb + rpmbuild                               | Single static binary                                                                 |
| **Upgrade path**                | Re-run new `.run` + version-check banner             | AppImageUpdate delta patch (incompatible with lifecycle) | `apt upgrade` / `dnf upgrade` (needs hosted repo) | Same as `.deb`/`.rpm`                                                                |

***

## 6. Bundle Contents and Install Layout

### 6.1 What actually ships in the payload

Per [#5810](https://github.com/hiero-ledger/solo/pull/5810), there is **no `resources/`
directory to package**: `sea/build.ts` embeds every file under `resources/`,
`scripts/persist-port-forward.js`, `package.json`, and the bundled CLI itself
(`solo-src-bundle.cjs`) as SEA assets baked into the binary. At first run,
`sea/sea-main.template.cjs` sets `SOLO_SEA_ROOT_DIR` to `~/.solo/sea-resources/<version>/` and
extracts those assets there (guarded by a `.sea-extracted` marker keyed on a build ID, so a
second invocation is a no-op). `constants.ts`'s `ROOT_DIR` and `version.ts`'s `getSoloVersion()`
both read the SEA-set environment variables directly.

Two consequences for this document:

* **The installer payload is just the binary.** There is no `SOLO_RESOURCES_DIR` for the
  installer to set and no `resources/` tree for it to place.
* **Resource extraction is per-user, at first run, under the invoking user's `$HOME`.** This is
  the same fact that makes a root `postinst` unsuitable for the image-cache warm-up (§8.1) and
  something the uninstall path must account for per user (§8.2), not just once at the system
  level.

### 6.2 Install layout (FPM/nfpm path)

`/usr/local/bin` + `/opt/solo` is a valid makeself layout (§4.1 uses it, since makeself has no
distro-packaging conventions to answer to) but **not** a valid layout for a distro package:
`/usr/local` is reserved for the local administrator under the FHS and Debian Policy, and both
`lintian` and `rpmlint` flag packages that write there.

For the nfpm/FPM path, the payload is:

```
dist/
└── solo              # SEA binary, mapped to /usr/bin/solo
```

`/usr/bin/solo` directly (a single static binary needs nothing under `/usr/lib/solo/`) is the
simplest FHS-compliant target; an `/opt/solo/` payload with a `/usr/bin/solo` symlink is the
alternative if a future release needs to ship more than the one binary. Either is acceptable;
`/usr/local/*` is not. This is stated explicitly here so #5725 doesn't have to guess.

### 6.3 Makeself layout (unchanged, kept as the ruled-out alternative's design)

```
payload/
├── solo                   # SEA binary
├── install.sh             # makeself entry point
└── uninstall.sh           # installed to a known path during setup
```

`install.sh` copies `solo` → `/usr/local/bin/solo` (makeself is not a distro package, so `/opt` +
`/usr/local` conventions are fine here) and installs `uninstall.sh` to `/opt/solo/uninstall.sh`.
Since §6.1 removed the `resources/` copy step, `install.sh`'s job is now solely placing the
binary and registering the uninstaller — no resource-directory copy, no `SOLO_RESOURCES_DIR` to
set.

### 6.4 Architecture and libc coverage

`x86_64` is the only architecture the SEA build produces (§3), and Alpine's musl libc cannot run
a glibc-linked binary built on `hiero-solo-linux-medium` regardless of which package format wraps
it (`.github/workflows/flow-install-validation.yaml:92` documents the same constraint for CI
tooling). Neither is a packaging-format problem; both are prerequisites this document defers to
[#5716](https://github.com/hiero-ledger/solo/issues/5716)/[#5810](https://github.com/hiero-ledger/solo/pull/5810)
(musl build) and a future SEA matrix change (arm64 leg).

***

## 7. Repository Hosting and Signing

Hosting covers *where* the packages live; signing is the harder half and the part users hit
first, so both need to be scoped together before #5725 assumes a JFrog upload step is sufficient.

Whether signing is actually *required* depends on which install path is used, and the two
differ sharply:

* **Local-file install (§7.3), no repository involved:** signing is not required. `apt`/`dnf`
  don't verify a signature on a `.deb`/`.rpm` file installed directly from disk — there is no
  repository metadata to check it against. `dnf` may print a "package is not signed" notice for
  an unsigned local file, but it doesn't block the install.
* **Hosted repository (§7.2):** signing is effectively required, not optional. `apt` refuses to
  trust a repository with no signed `Release`/`InRelease` by default (it needs
  `--allow-unauthenticated` to bypass, which isn't something a documented install flow should
  ask users to pass), `dnf` repos are conventionally configured `gpgcheck=1`, and `apk` has no
  unsigned-custom-repo path at all — `abuild-sign`ing the index is how a client trusts a
  third-party repo, full stop. Since §9 recommends hosted repositories for all four formats,
  signing is a hard prerequisite for that design, which is why
  [#5717](https://github.com/hiero-ledger/solo/issues/5717) is listed as a blocking dependency
  there rather than a parallel concern.

### 7.1 Signing, per format

nfpm/FPM produce unsigned packages by default — for the hosted-repository path, signing is a
separate step per format:

* **apt (`.deb`):** `debsigs`/`dpkg-sig` signs the package itself; the repository's
  `Release`/`InRelease` index also needs a GPG signature.
* **dnf (`.rpm`):** `rpmsign` with `%_gpg_name`, plus a `gpgkey=` entry in the client's `.repo`
  file pointing at the public key.
* **apk:** `abuild-sign` with an RSA key that must be installed into `/etc/apk/keys` on every
  client — there is no APT/DNF-style "trust on first repo add" flow.
* **pacman:** `repo-add --sign` for the repository database, plus `pacman-key` trust setup on the
  client.

So this is **four repository types to host and sign, not two.** Where the signing key lives, who
holds it, and how it rotates should reference
[#5717](https://github.com/hiero-ledger/solo/issues/5717), the same way the macOS document does
(`docs/design/installers/macos-dmg-installer.md:211`).

### 7.2 Hosting options

* **JFrog Artifactory (recommended, all four formats):** Solo already publishes npm packages
  here. JFrog natively supports Debian and RPM repository types for `deb`/`rpm`. For `apk` and
  `pacman` it has no native repository type, so those are served from a generic/raw repository on
  the same instance, with CI generating the `APKINDEX`/`repo-add` metadata each release — one
  Artifactory instance, one release pipeline, all four formats, rather than treating apk/pacman
  hosting as a separate later decision.
* **GitHub Pages:** a CI job regenerates repository metadata after each release and pushes it to
  a `gh-pages` branch. GitHub-native, used by projects like Tailscale; requires maintaining the
  metadata-generation step in CI. Not chosen here since it duplicates infrastructure Solo already
  has in JFrog.
* **GitHub Release assets, in addition to the repository:** every format is also attached
  directly to the GitHub Release regardless of repository hosting, so
  `apt install ./solo.deb` / `dnf install ./solo.rpm` (local-file install) always works even for
  a client that hasn't added the Solo repository yet — it just doesn't get `apt upgrade` /
  `dnf upgrade` for free the way the hosted repository does.

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

Alpine (`apk add --repository ... solo`, after adding the key to `/etc/apk/keys` per §7.1) and
Arch (a `[solo]` entry in `pacman.conf` pointing at the same host, after `pacman-key` trust setup)
follow the same one-time repository-add pattern once those formats are built. Subsequent upgrades
are then handled by the package manager with no user intervention beyond `apt upgrade`,
`dnf upgrade`, `apk upgrade`, or `pacman -Syu`.

### 7.3 Local-file install (GitHub Release asset, no repository, no signing)

Since every format is also attached to the GitHub Release directly (§7.2), a user can install
straight from the downloaded file with the package manager itself, without ever adding the Solo
repository. For `apt`:

```sh
curl -fsSL -o solo.deb \
  https://github.com/hiero-ledger/solo/releases/latest/download/solo_<version>_amd64.deb
sudo apt install ./solo.deb
```

Two details matter here:

* **Use `apt install`, not `dpkg -i`.** `apt` reads the same `.deb` control metadata but also
  resolves and installs any declared dependencies from the repositories already configured on
  the system — `dpkg -i` does not, and leaves the system needing a follow-up
  `apt-get install -f` if the package declares any. Since the SEA binary is a single
  self-contained executable with no runtime dependencies, both commands succeed either way here,
  but `apt install` is the generally correct one to document.
* **The `./` (or a full path) is required.** `apt install solo.deb`, without a path prefix, is
  parsed as a request to install a package *named* `solo.deb` from the configured repositories —
  it is not found there and the command fails. The leading `./` is what tells `apt` this
  argument is a filesystem path to a local package file rather than a package name to resolve.

`dnf` follows the identical shape:

```sh
curl -fsSL -o solo.rpm \
  https://github.com/hiero-ledger/solo/releases/latest/download/solo-<version>-1.x86_64.rpm
sudo dnf install ./solo.rpm
```

No GPG key import, no `sources.list.d`/`.repo` file, and no `apt update`/`dnf makecache` step —
the package is installed directly from the file exactly as downloaded. The trade-off is the one
noted in §7.2: since the package didn't come from a repository, `apt upgrade`/`dnf upgrade` don't
know to look for a newer Solo release. Upgrading means re-running the same two commands against
a newly downloaded release asset (both package managers treat this as an in-place version
upgrade of the same package name, not a conflict), and `VersionUpdateNotifier` (§4.1) is what
tells the user a new version exists in the first place. Uninstalling is the normal
`sudo apt remove solo` / `sudo dnf remove solo` either way (§4.3) — removal doesn't care whether
the package was originally installed from a repository or a local file.

### 7.4 Keys required

Four package formats, but not four independent keys — apt, dnf, and pacman all speak plain
OpenPGP, while `apk` uses a categorically different key type that cannot be shared with the
other three:

| Format               | Key type                  | What it signs                                                                                       | How clients get the public half                                                 |
|----------------------|---------------------------|-----------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| apt (`.deb`)         | OpenPGP (GPG)             | The repository's `Release`/`InRelease` index; optionally the `.deb` itself via `debsigs`/`dpkg-sig` | Dearmored into a keyring file, referenced via `signed-by=` in `sources.list`    |
| dnf (`.rpm`)         | OpenPGP (GPG)             | Each `.rpm` package header directly (`rpmsign`); optionally `repomd.xml` too if `repo_gpgcheck=1`   | `gpgkey=` entry in the client's `.repo` file                                    |
| pacman (`archlinux`) | OpenPGP (GPG)             | The repository database (`repo-add --sign`)                                                         | Imported via `pacman-key --add`, trusted via `--lsign-key` or a keyring package |
| apk (Alpine)         | RSA keypair (not OpenPGP) | The `APKINDEX` (`abuild-sign`)                                                                      | Installed as `/etc/apk/keys/<name>.rsa.pub`                                     |

That collapses to **two distinct kinds of key material to provision, not four**:

1. **One OpenPGP identity**, usable across apt, dnf, and pacman — the same public key can be
   distributed three different ways (a keyring file, a `.repo` file's `gpgkey=`, and
   `pacman-key --add`) without needing three separate keypairs. Whether to actually reuse one
   identity across all three or mint a separate one per format is a custody/blast-radius
   decision for whoever owns key management, not a technical requirement — nothing in `apt`,
   `dnf`, or `pacman` cares either way.
2. **One RSA keypair for Alpine**, which cannot be consolidated with the OpenPGP identity above —
   `abuild-sign` doesn't speak OpenPGP, and `apk` doesn't accept a GPG public key as a trusted
   signer.

Notably, none of these are a purchased or CA-issued certificate the way the macOS and Windows
legs of the same epic are:
[#5717](https://github.com/hiero-ledger/solo/issues/5717) as currently scoped names an **Apple
Developer ID** certificate and a **Microsoft Authenticode (EV)** certificate — both third-party
issued, vetted, and paid for — but says nothing about Linux. The two Linux key types above are
self-generated keypairs Solo's own release pipeline can create directly; the open work is
custody and rotation (where the private keys live, who can trigger a signing operation, how a
compromised key gets revoked and replaced), not procurement. **#5717's scope should be extended
to cover these two Linux key types explicitly** — see §10.

***

## 8. Lifecycle Hook Design

### 8.1 Image-cache warm-up is not a safe `postinst` action

A package `postinst` hook cannot simply call `solo cache image pull`, for three independent
reasons:

* **It runs as root, non-interactively, with no TTY** — nothing to prompt or render progress to.
* **It may run with no network** (image bakes, `apt install` inside a Dockerfile, offline
  mirrors), and Debian policy discourages network access from maintainer scripts.
* **A non-zero exit fails the whole package install** and leaves `dpkg` in a half-configured
  state — a flaky registry pull becomes an install failure.

There is a fourth, Solo-specific problem: per §6.1, the SEA bootstrap extracts resources — and by
the same logic, `solo cache image pull` would write — to the *invoking user's* `~/.solo/cache/`
(`SOLO_HOME_DIR`/`SOLO_CACHE_DIR`, `src/core/constants.ts:42-46`). A root `postinst` invocation
populates `/root/.solo/cache`, not the cache of the user who will actually run `solo`. A
`postinst`-driven warm-up would silently do nothing useful for the normal, non-root user.

**Recommendation:** move the warm-up out of the package script entirely, into a first-run check
inside Solo itself — a per-user marker under `~/.solo/` that the CLI checks on its first
invocation as that user, independent of which channel (npm, makeself, or a distro package)
installed it. This also means the same mechanism works for every install path without
per-format lifecycle-script logic. The `postinst` script's only job becomes printing a one-line
notice that the first `solo` run will warm the cache (or, as an opt-in alternative worth
considering during implementation, a debconf-style preseed flag such as `--with-image-cache` for
non-interactive provisioning). The exact mechanism is an implementation decision for
[#5725](https://github.com/hiero-ledger/solo/issues/5725); this document's job is to rule out the
naive `postinst` version before that PR builds it.

### 8.2 Uninstall hooks defer to a `solo` subcommand, not a package script

"Remove clusters" from a package `preremove`/`postrm` is a large behavioral claim to make in
passing. `apt remove solo` running as root and silently deleting a user's Kind clusters is
surprising and unrecoverable — and it isn't clear whose clusters would even be discoverable from
a root context, for the same `$HOME`-scoping reason as §8.1.

The macOS document reaches the same conclusion independently, via `pkgutil`'s complete lack of a
native uninstall hook (`docs/design/installers/macos-dmg-installer.md:218-248`): it lands on a
`solo uninstall` CLI subcommand, run as the actual user, as the interface for the shared cleanup
design in [#5721](https://github.com/hiero-ledger/solo/issues/5721), rather than having the OS
installer perform destructive cleanup directly. Linux packaging *does* have a real `preremove`
hook (unlike macOS's `.pkg`), but the same per-user-context problem argues for using it the same
way: `preremove` should, at most, invoke or prompt for `solo uninstall` as the installing user (or
print instructions if it can't safely determine that user), not independently delete clusters or
caches itself. This keeps Linux and macOS consistent — one shared uninstall implementation behind
`solo uninstall`, invoked differently per OS's packaging lifecycle — rather than Linux deleting
clusters from `preremove` while macOS asks the user to run a subcommand.

The full behavior (which clusters, which caches, which files, in what order) is
[#5721](https://github.com/hiero-ledger/solo/issues/5721)'s job. Also worth noting for that
design: per §6.1, `~/.solo/sea-resources/<version>/` is a new per-user directory the SEA build
introduces, and it needs to be in scope for cleanup the same way `~/.solo/cache/` already is.

***

## 9. Recommendation

**Use nfpm to produce and host all four package formats — `deb`, `rpm`, `apk`, and `archlinux`
(pacman) — as one coordinated release pipeline covering the full nine-distribution matrix.**
[#5714](https://github.com/hiero-ledger/solo/issues/5714) tracks Linux, macOS, and Windows
installers as a single epic and this work is planned as one effort, not a phased subset — the
formats below are the complete design, sequenced only by the real technical prerequisites each
one has elsewhere in that same epic (§3), not by a deliberate scope cut in this document.

**nfpm over FPM.** Both produce the formats this document needs, but nfpm is a single static Go
binary with no Ruby/`rpmbuild` dependency, carries a far smaller open-issue backlog (17 vs. 791 —
§4.4), and treats `apk`/`archlinux` as first-class packager implementations rather than secondary
output types layered onto a `deb`/`rpm`-first tool. It is the better-maintained tool for exactly
the "one declarative source, four formats" need in §4.4.

**Hosted repositories for all four formats, from the outset.** JFrog Artifactory hosts
`deb`/`rpm` natively and `apk`/`pacman` via a generic/raw repository on the same instance (§7.2)
— one release pipeline, one signing setup (#5717), all four formats, rather than treating
repository hosting as a later add-on. Every format is also attached to the GitHub Release
directly, so a local-file install always works even before a client adds the repository.

**Format availability is sequenced by its own prerequisites, not by scope choice:**

* `deb` and `rpm` package the `linux/x64` glibc SEA binary that already exists
  ([#5810](https://github.com/hiero-ledger/solo/pull/5810)) and cover seven of the nine
  distributions in the matrix (Ubuntu, Debian, Fedora, Rocky, AlmaLinux, Oracle Linux, openSUSE).
* `apk` needs the musl-linked SEA binary [#5716](https://github.com/hiero-ledger/solo/issues/5716)
  is building; the nfpm configuration and repository hosting for it are already covered by this
  document (§4.4, §7) and apply the moment that binary exists — no separate design step.
  `pacman` packaging for Arch has the same binary dependency; the AUR channel itself is a
  separate, non-nfpm submission per §3.
* `x86_64` is the only architecture available from the SEA build matrix today; extending it to
  `arm64` is a prerequisite this document doesn't own (§3), and the same nfpm configuration
  packages both architectures without a design change here once that leg lands.

**Lifecycle hooks stay thin.** Per §8, the `postinstall` script does not call
`solo cache image pull` directly (root/no-TTY/no-network/wrong-`$HOME` problems), and
`preremove` does not delete clusters directly — both defer to mechanisms Solo itself owns
(first-run warm-up; `solo uninstall`), keeping the package scripts thin.

**Implementation notes for #5725:**

1. Package the SEA binary as `.deb`, `.rpm`, `.apk`, and `.pkg.tar.zst` via nfpm (§6.2 layout:
   `/usr/bin/solo`); host all four through JFrog (§7.2) and attach them to the GitHub Release.
2. Wire the `postinstall`/`preremove` scripts to the thin hand-off behaviors in §8.1/§8.2 —
   contingent on the first-run warm-up mechanism and the `solo uninstall` subcommand existing,
   which are implementation decisions for #5725 and #5721 respectively, not finalized here.
3. Coordinate on sequencing with the sibling epic issues this document depends on but doesn't
   own: [#5716](https://github.com/hiero-ledger/solo/issues/5716) (musl SEA build, unblocks
   `apk`), a SEA matrix change for `arm64` (unblocks that architecture across every format),
   [#5717](https://github.com/hiero-ledger/solo/issues/5717) (signing, unblocks all four hosted
   repositories), and [#5722](https://github.com/hiero-ledger/solo/issues/5722) (self-upgrade,
   independent of packaging format).

### Alternatives ruled out

* **AppImage:** no install/uninstall lifecycle; cannot run post-install hooks without an outer
  wrapper (§4.2).
* **makeself:** simpler first-install UX and no distro-packaging conventions to satisfy, but no
  package manager integration and manual upgrades; kept as a documented fallback path rather than
  the primary mechanism (§4.1, §6.3).
* **Raw `.deb`/`.rpm` built independently:** two independent build pipelines for the same
  distribution coverage nfpm gets from one tool and one CI dependency (§4.3).
* **FPM:** viable, but a heavier CI dependency (Ruby) and a substantially larger open-issue
  backlog than nfpm for the same output formats (§4.4).

***

## 10. Risks / Open Questions

* **No-sudo fallback.** A user without `sudo` can `npm install -g` but
  cannot `apt install`/`dnf install`. This document does not resolve whether a plain tarball (or
  the makeself `.run` from §4.1) is retained as an unprivileged fallback on Linux, or whether root
  is now an effectively hard requirement for the packaged install path. Worth an explicit decision
  before #5725 ships, not a silent default.
* **First-run warm-up mechanism is undesigned.** §8.1 states the *direction* (out of `postinst`,
  into a Solo-owned first-run check) but not the exact trigger, marker location, or
  opt-out/opt-in UX. #5725 needs this resolved before the `postinstall` script's message can be
  written.
* **`solo uninstall` doesn't exist yet.** §8.2's design depends on
  [#5721](https://github.com/hiero-ledger/solo/issues/5721) landing a subcommand both this
  document and the macOS document assume. Until then, `preremove` has nothing safe to hand off to
  beyond a printed instruction.
* **JFrog's apk/pacman coverage is unconfirmed.** §7.2 assumes a generic/raw repository would be
  needed for Alpine/Arch hosting since JFrog's native Debian/RPM support doesn't extend there;
  this hasn't been verified against Solo's actual JFrog instance and matters once the musl SEA
  binary in §3 lands.
* **nfpm's built-in signing coverage.** nfpm can invoke external signing tools per format, but
  whether its built-in `rpm`/`deb` signing config is sufficient on its own or whether the
  external tools in §7.1 (`debsigs`, `rpmsign`) are still needed in CI should be confirmed during
  [#5725](https://github.com/hiero-ledger/solo/issues/5725)'s implementation, not assumed here.
* **#5717 doesn't currently scope the Linux signing keys.** As filed,
  [#5717](https://github.com/hiero-ledger/solo/issues/5717) names only the macOS Developer ID and
  Windows Authenticode certificates. The OpenPGP identity and Alpine RSA keypair in §7.4 need to
  be added to that issue's scope (or tracked in a new one) before #5725 has anywhere to request
  them from.

***

## 11. References

* [makeself](https://github.com/megastep/makeself)
* [AppImage](https://appimage.org/)
* [`nfpm`](https://github.com/goreleaser/nfpm) — chosen tool (§9)
* [`fpm`](https://github.com/jordansissel/fpm) — ruled-out alternative (§4.4)
* [Filesystem Hierarchy Standard](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html) —
  `/usr/local` reservation (§6.2)
* [Debian Policy Manual — maintainer scripts](https://www.debian.org/doc/debian-policy/ch-maintainerscripts.html)
  (§8.1)
* [`abuild-sign` / Alpine package signing](https://wiki.alpinelinux.org/wiki/Abuild_and_Helpers)
  (§7.1)
* [Arch Linux `repo-add`/`pacman-key`](https://wiki.archlinux.org/title/Pacman/Package_signing)
  (§7.1)
* [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
* [#5810 — feat: add Node.js SEA build pipeline](https://github.com/hiero-ledger/solo/pull/5810)
  (§6.1)
* [macOS installer design document](macos-dmg-installer.md) — house style and shared
  uninstall/self-upgrade reasoning (§8.2, §3)

***

*Last updated: 2026-08-31*
