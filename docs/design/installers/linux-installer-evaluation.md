# Linux Installer: Packaging Format and Tool Selection

## 1. Context

Solo currently ships only as the npm package `@hiero-ledger/solo`, which requires Node.js ≥ 22
pre-installed. Homebrew on Linux (Linuxbrew) is already covered by `HomebrewDeprecationNotifier`'s
prefix-agnostic `HOMEBREW_CELLAR_PATTERN` — nothing Linux-specific needed there. npm stays as a
channel for developers, matching the macOS document's decision.

Part of epic [#5714](https://github.com/hiero-ledger/solo/issues/5714) (native OS installers,
no runtime pre-install required). This document is the research task for
[#5720](https://github.com/hiero-ledger/solo/issues/5720) and feeds
[#5725](https://github.com/hiero-ledger/solo/issues/5725) (build the installer), which also
depends on the SEA build ([#5716](https://github.com/hiero-ledger/solo/issues/5716)), signing
([#5717](https://github.com/hiero-ledger/solo/issues/5717)), and shared uninstall
([#5721](https://github.com/hiero-ledger/solo/issues/5721)).

Requirements from the parent epic:

1. Warm the image cache (`solo cache image pull`) around install time.
2. Clean up on removal (Kind clusters, image caches, residual files) — scoped in
   [#5721](https://github.com/hiero-ledger/solo/issues/5721).
3. Generate as a CI release artifact without excessive pipeline complexity.

Requirement 1 is the *outcome* (cache warmed near install), not "call it from `postinst`" — that
specific mechanism is unsafe (§8.1).

### Distribution target matrix

From `.github/workflows/flow-install-validation.yaml`:

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

Alpine runs musl libc and needs its own build — the glibc SEA binary cannot execute there
(`flow-install-validation.yaml:92`). Same constraint applies to any glibc artifact this document
produces (§6.4).

---

## 2. Goals

- Select a packaging format/tool, justified on install/uninstall UX, CI complexity, and
  distribution breadth, per [#5720](https://github.com/hiero-ledger/solo/issues/5720).
- Apply the macOS document's tool-health rigor to whatever tool is recommended.
- Define an FHS-compliant install layout consistent with how the SEA build
  ([#5810](https://github.com/hiero-ledger/solo/pull/5810)) resolves runtime resources.
- Redesign the cache-warm-up requirement around something that works under a package manager's
  lifecycle-script constraints (root, no TTY, sometimes no network).
- Scope repository hosting and signing for the chosen formats, to the level
  [#5717](https://github.com/hiero-ledger/solo/issues/5717) needs.

## 3. Non-Goals

- **Uninstall behavior** — designed once, shared across OSes, in
  [#5721](https://github.com/hiero-ledger/solo/issues/5721); this doc only says where Linux hooks
  into it (§8.2).
- **Signing-key custody / CI secrets** — [#5717](https://github.com/hiero-ledger/solo/issues/5717).
- **Self-upgrade flow** — [#5722](https://github.com/hiero-ledger/solo/issues/5722). §7.3 sketches
  how it would work for the install-script channel specifically, as input to that design, but does
  not finalize it.
- **macOS/Windows installers** — tracked under #5714.
- **musl-linked SEA binary** — a prerequisite for Alpine packaging, owned by
  [#5716](https://github.com/hiero-ledger/solo/issues/5716)/#5810. Once it exists, §9's
  recommendation packages Alpine the same way as every other distro, no design change needed.
- **arm64/aarch64 SEA build** — the SEA matrix produces `x64` only today; adding arm64 is its own
  workstream. §9's nfpm config packages it once that leg lands.
- **Publishing to the AUR** — nfpm's `pacman` output installs directly, but the AUR is a
  separately-maintained, community-reviewed `PKGBUILD` channel, not something a CI pipeline
  outputs. Worth its own issue if wanted.

---

## 4. Candidates

|                                    | makeself                                                      | AppImage                                                                                                   | .deb/.rpm (separate)                                                  | nfpm / FPM (multi-format)                                                              | Install script (`curl \| sh`)                                                                                                                                 |
|------------------------------------|---------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **What it is**                     | Self-extracting shell archive (`.run`)                        | Portable squashfs + runtime, no install step                                                               | Native packages per distro family                                     | One declarative source → `deb`/`rpm`/`apk`/`archlinux`                                 | POSIX shell script that detects OS/libc/arch, downloads the matching SEA binary from GitHub Releases, verifies it, and drops it on `PATH`                     |
| **Install**                        | `sudo ./solo.run`                                             | `./solo.AppImage`                                                                                          | `apt install ./solo.deb` / `dnf install ./solo.rpm`                   | Same as .deb/.rpm                                                                      | `curl -fsSL https://<install-host>/install.sh \| sh`                                                                                                          |
| **Uninstall**                      | Bundled `uninstall.sh`                                        | `rm` the file                                                                                              | `apt remove` / `dnf remove`                                           | Same                                                                                   | `solo uninstall` (§7.2) removes the binary itself; there is no package-manager bookkeeping to undo                                                            |
| **Post-install / uninstall hooks** | Yes (setup script)                                            | **No**                                                                                                     | Yes (`postinst`/`prerm`)                                              | Yes (`postinstall`/`preremove`)                                                        | **None needed** — the script runs synchronously as the invoking user, so there is no root/no-TTY/wrong-`$HOME` boundary to hand off across in the first place |
| **Package manager integration**    | None                                                          | None                                                                                                       | Full                                                                  | Full (with hosted repo)                                                                | None                                                                                                                                                          |
| **CI build complexity**            | Very low (shell + tar)                                        | Low–medium (`appimagetool`, no cross-build)                                                                | High — two independent pipelines (`dpkg-deb`/`debhelper`, `rpmbuild`) | Low — single static binary (nfpm) or Ruby gem + `rpmbuild` (FPM)                       | Very low — one shell script plus the raw SEA binaries already attached to the GitHub Release (§6.2); no packaging step at all                                 |
| **Distro coverage**                | All non-Alpine (still glibc/x64-bound)                        | 8/9, glibc only, no Alpine                                                                                 | 7/9 (no Arch, no Alpine)                                              | 9/9 reachable (`deb`,`rpm`,`apk`,`archlinux`); `apk` ships once musl SEA binary exists | 9/9 — a script has no packaging format to be excluded from; limited only by which SEA binaries exist (glibc now, musl once #5716 lands)                       |
| **Upgrade path**                   | Re-run new `.run` + version-check banner                      | Delta patch via AppImageUpdate — can't re-run post-install hook                                            | `apt upgrade`/`dnf upgrade` w/ hosted repo; manual otherwise          | Same as .deb/.rpm                                                                      | `solo update` self-replaces the binary in place (§7.3), or re-running the install command                                                                     |
| **Verdict**                        | Kept as documented fallback (§6.3) — no repo, manual upgrades | **Ruled out** — no lifecycle hooks means it can't satisfy either requirement without a second wrapper tool | Two pipelines for the coverage nfpm gets from one                     | Solid secondary channel for users who specifically want repo-based installs (§8)       | **Recommended primary channel** (see §8)                                                                                                                      |

### Install script vs. native packaging

The two requirements driving this whole document — warm the cache, clean up on removal — turn out
not to need a package manager at all once §7 is worked through: `postinst`/`postinstall` can't
safely do the cache warm-up itself (root, no TTY, sometimes no network, wrong `$HOME`), and
`preremove` can't safely delete clusters either, so *all* of the real logic already has to live in
Solo itself — a first-run check and a `solo uninstall` subcommand (§7.1/§7.2). A package's
lifecycle hooks end up doing nothing more than printing a notice and invoking that subcommand.

An install script gets the same outcome for a fraction of the infrastructure, because it runs as
the installing user by construction — there is no root/wrong-`$HOME` boundary to design around in
the first place:

- No repository hosting or per-format signing (§6) — no OpenPGP identity, no Alpine RSA keypair,
  no JFrog repo types, no four separate trust-establishment steps for the user. A checksum (and
  optionally a detached signature using the *same* OpenPGP identity §6.4 already needs) over the
  raw binary is enough (§6.5).
- No dependency on the musl/arm64 SEA legs landing before Alpine/Arch users are covered (§3) — the
  script can serve whichever binary asset exists for the detected `(os, libc, arch)` triple the
  moment it's published, with no new packaging config per target.
- A single, uniform update story across every distro (`solo update`, §7.3) instead of five
  different upgrade commands (`apt upgrade`/`dnf upgrade`/`apk upgrade`/`pacman -Syu`/manual).
- Direct precedent for this exact shape of tool — a Node.js SEA-style single binary with no system
  dependencies — is shipped this way by `rustup`, Deno, Bun, uv, and the OpenAI Codex CLI
  (`curl -fsSL https://chatgpt.com/codex/install.sh | sh`).

What it gives up, and why that trade-off is acceptable here: no listing in `apt`/`dnf`/`pacman`
search results, no `apt upgrade`-style passive updates without `solo update` running, and no
OS-native "installed software" bookkeeping. Some organizations' security policies also flag
pipe-to-shell installs on principle (§9). None of these are the epic's stated requirements (cache
warm-up, clean removal, low CI complexity) — they're the value a *hosted repository* adds on top,
which nfpm-built packages remain available to provide as a secondary channel for users who ask for
it (§8).

### nfpm vs. FPM

Both generate multiple formats from one source. FPM is a Ruby gem requiring `rpmbuild` for RPM
output; nfpm is a single static Go binary with no runtime dependency.

|                    | FPM (`jordansissel/fpm`)        | nfpm (`goreleaser/nfpm`)              |
|--------------------|---------------------------------|---------------------------------------|
| Latest release     | v1.18.0 (2026-08-26)            | v2.47.0 (2026-06-20)                  |
| Open issues        | 791                             | 17                                    |
| Runtime dependency | Ruby + `rpmbuild`               | None — static binary                  |
| `apk`/`pacman`     | Best-effort, layered on deb/rpm | First-class packager, same test suite |

FPM is still maintained (unlike `appdmg`, which the macOS doc rejected as abandoned), but the
791-vs-17 issue gap plus the Ruby dependency this project has nowhere else make **nfpm the
better-fitted tool** for the "four formats, one source" need, when a native-package channel is
built at all (§8).

---

## 5. Bundle Contents and Install Layout

### 5.1 What ships in the payload

Per [#5810](https://github.com/hiero-ledger/solo/pull/5810), there is **no `resources/` directory
to package** — `sea/build.ts` embeds everything as SEA assets baked into the binary. At first run,
`sea/sea-main.template.cjs` extracts them to `~/.solo/sea-resources/<version>/` (guarded by a
`.sea-extracted` marker). So:

- **The installer payload is just the binary.** No `SOLO_RESOURCES_DIR` to set, no `resources/`
  tree to place.
- **Resource extraction happens per-user, at first run, under `$HOME`.** This is why a root
  `postinst` can't do the cache warm-up (§8.1) or uninstall cleanup (§8.2) — it runs in the wrong
  user's `$HOME`.

### 5.2 Install layout (nfpm/FPM path)

`/usr/local/bin` + `/opt/solo` (makeself's layout, §5.3) is **not valid** for a distro package —
`/usr/local` is reserved for the local admin under FHS/Debian Policy, and `lintian`/`rpmlint` flag
it.

```
dist/
└── solo              # SEA binary → /usr/bin/solo
```

`/usr/bin/solo` directly is the simplest FHS-compliant target (a static binary needs nothing under
`/usr/lib/solo/`). An `/opt/solo/` payload with a `/usr/bin/solo` symlink is the alternative if a
future release ships more than one binary. `/usr/local/*` is not acceptable either way.

### 5.3 Makeself layout (fallback path, §4)

```
payload/
├── solo                   # SEA binary
├── install.sh             # copies solo → /usr/local/bin/solo
└── uninstall.sh           # installed to /opt/solo/uninstall.sh
```

No resource-directory copy needed (§5.1) — `install.sh` only places the binary and registers the
uninstaller.

### 5.4 Architecture and libc coverage

`x86_64` is the only architecture the SEA build produces; Alpine's musl libc can't run the
glibc-linked binary regardless of package format. Both are prerequisites owned elsewhere (§3), not
packaging-format problems.

### 5.5 Install script layout

Unlike §5.2/§5.3, the install script should **not** target `/usr/bin` or `/usr/local/bin` by
default:

```
~/.solo/bin/solo          # the SEA binary
~/.solo/bin/               added to PATH (via the invoked shell's rc file, appended idempotently)
```

A per-user, per-`$HOME` location is what makes `solo update` (§7.3) work without `sudo` — the
invoking user already owns every byte on the path from the binary up to `$HOME`. Landing in
`/usr/bin` instead would reintroduce the exact root-owned-file problem §7.1/§7.2 exist to avoid,
just moved from the package manager into the script. This mirrors rustup's (`~/.cargo/bin`) and
Deno's (`~/.deno/bin`) default, non-`sudo` install location.

The script itself:

1. Detects `(os, libc, arch)` — `uname -s`/`uname -m`, plus an `ldd --version` or `/etc/os-release`
   check to distinguish glibc from musl for the Alpine case (§3).
2. Downloads the matching SEA binary and its checksum manifest from the GitHub Release (§6.2).
3. Verifies the checksum (and signature, §6.5) before it ever executes anything downloaded.
4. Writes the binary to `~/.solo/bin/solo`, `chmod +x`, and appends `~/.solo/bin` to `PATH` in the
   detected shell's rc file if not already present.
5. Prints the same first-run notice §7.1 describes for the package path, since the script has no
   `postinst`-equivalent hook of its own either — it just runs that logic inline instead of
   deferring it.

A `--prefix`/`SOLO_INSTALL_DIR` override should exist for users who explicitly want a system-wide,
`sudo`-run install to `/usr/bin` — accepting that `solo update` then needs elevated privileges for
that install only (§7.3).

---

## 6. Repository Hosting and Signing

Whether signing is required depends on the install path:

- **Local-file install (§6.3), no repository:** not required. `apt`/`dnf` don't verify a signature
  on a `.deb`/`.rpm` installed directly from disk.
- **Hosted repository (§6.2):** effectively required. `apt` refuses an unsigned repo by default,
  `dnf` repos are conventionally `gpgcheck=1`, and `apk` has no unsigned-custom-repo path at all.
  If a hosted-repo secondary channel is built (§8), [#5717](https://github.com/hiero-ledger/solo/issues/5717) is a blocking dependency for it, not a parallel concern.
- **Install script (§6.5):** a checksum manifest is the minimum bar; a detached signature over that
  manifest, reusing the same OpenPGP identity as the repo formats, closes the gap with them.

### 6.1 Signing per format

nfpm/FPM produce unsigned packages by default:

- **apt (`.deb`):** `debsigs`/`dpkg-sig` signs the package; `Release`/`InRelease` needs a GPG
  signature too.
- **dnf (`.rpm`):** `rpmsign` (`%_gpg_name`) + `gpgkey=` in the client's `.repo` file.
- **apk:** `abuild-sign` with an RSA key installed into `/etc/apk/keys` on every client — no
  trust-on-first-add flow.
- **pacman:** `repo-add --sign` for the repo database + `pacman-key` client trust.

Four repository types to host and sign, not two, if the secondary hosted-repo channel (§8) is
built. Key custody/rotation is [#5717](https://github.com/hiero-ledger/solo/issues/5717)'s job.

### 6.2 Hosting

**JFrog Artifactory (recommended, if/when the secondary native-package channel is built).** Solo
already publishes npm here. JFrog has native repo types for Debian, RPM, and Alpine — each
auto-signs its own metadata on reindex once the key is uploaded. Arch/`pacman` has no native repo
type, so it's served from a generic/raw repo with CI running `repo-add --sign`. One instance, one
pipeline, all four formats.

*Ruled out:* GitHub Pages (duplicates infra Solo already has in JFrog).

**GitHub Release assets, always, regardless of repository hosting** — this is also where the
install script (§4, §5.5) fetches the raw SEA binary and checksum manifest from, so
`apt install ./solo.deb` / `dnf install ./solo.rpm` / `curl ... | sh` all work off the same
release artifacts even before a client adds any repo (no `apt upgrade` for free, but it works).

Once a repo is configured, users add it once:

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

Alpine and Arch follow the same one-time repo-add pattern once those formats are built. After
that, upgrades are `apt upgrade` / `dnf upgrade` / `apk upgrade` / `pacman -Syu` with no further
user action.

### 6.3 Local-file install (no repository, no signing)

```sh
curl -fsSL -o solo.deb \
  https://github.com/hiero-ledger/solo/releases/latest/download/solo_<version>_amd64.deb
sudo apt install ./solo.deb
```

Two details to get right: use `apt install` (not `dpkg -i`, which skips dependency resolution —
moot here since the SEA binary has none, but still the correct command to document); and the
leading `./` is required, or `apt` parses the argument as a package *name* to resolve from
repositories rather than a local file path. `dnf install ./solo.rpm` follows the identical shape.
No GPG import, no repo file, no `apt update` step. Trade-off: `apt upgrade`/`dnf upgrade` won't
find a newer release this way — `VersionUpdateNotifier` (§4) is what tells the user one exists.
Uninstall (`apt remove` / `dnf remove`) doesn't care how the package was originally installed.

### 6.4 Keys required (native-package channel)

Two distinct kinds of key material, not four:

| Format               | Key type          | Signs                                        |
|----------------------|-------------------|----------------------------------------------|
| apt (`.deb`)         | OpenPGP           | `Release`/`InRelease`; optionally the `.deb` |
| dnf (`.rpm`)         | OpenPGP           | Each `.rpm` header; optionally `repomd.xml`  |
| pacman (`archlinux`) | OpenPGP           | Repository database                          |
| apk (Alpine)         | RSA (not OpenPGP) | `APKINDEX`                                   |

1. **One OpenPGP identity**, reusable across apt/dnf/pacman (distributed three different ways) —
   and, per §6.5, reusable again to sign the install script's checksum manifest.
2. **One RSA keypair for Alpine** — `abuild-sign` doesn't speak OpenPGP.

Once uploaded to Artifactory's Signing Keys config, Artifactory signs repo metadata automatically
on reindex for apt/dnf/apk. It does **not** embed a per-package RPM signature (a separate
`rpmsign --addsign` pass is still needed if per-package verification matters), and it has no
Arch repo type at all — `repo-add --sign` happens entirely in CI there.

Unlike the macOS/Windows legs of the same epic (Apple Developer ID, Microsoft Authenticode —
both purchased, CA-issued), both Linux key types are self-generated. **#5717's scope should be
extended to cover them explicitly** (§8), whether or not the native-package channel ships in the
first release.

### 6.5 Integrity verification for the install script

The install script has no package-manager signature chain to lean on, so CI publishes, alongside
every SEA binary attached to the GitHub Release:

- A `SHA256SUMS` manifest covering every platform's binary.
- A detached OpenPGP signature over that manifest (`SHA256SUMS.asc`), signed with the **same**
  identity §6.4 mints for apt/dnf/pacman — no new key material, just one more thing that key signs.

The script downloads the binary and the manifest, verifies the checksum unconditionally, and
verifies the signature when a local `gpg`/equivalent is available (best-effort, not a hard
dependency — a missing local GPG tool shouldn't block install, but should print a warning that
signature verification was skipped).

---

## 7. Lifecycle Hook Design

### 7.1 Image-cache warm-up is not a safe `postinst` action

A `postinst` hook cannot call `solo cache image pull` directly:

- Runs as root, non-interactively, no TTY.
- May run with no network (image bakes, offline mirrors); Debian policy discourages network
  access from maintainer scripts.
- A non-zero exit fails the whole install, leaving `dpkg` half-configured — a flaky registry pull
  becomes an install failure.
- Per §5.1, it would populate `/root/.solo/cache`, not the actual invoking user's — silently
  useless.

**Recommendation:** move the warm-up into a first-run check inside Solo itself — a per-user marker
under `~/.solo/` checked on first invocation, independent of install channel (npm, install script,
makeself, or a distro package). `postinst`'s only job, on the native-package channel, becomes
printing a one-line notice that the first run will warm the cache (optionally a preseed flag like
`--with-image-cache` for non-interactive provisioning). The install script has no separate hook to
design here — it just runs the same first-run logic inline right after placing the binary (§5.5).
Exact mechanism is an implementation decision for
[#5725](https://github.com/hiero-ledger/solo/issues/5725).

### 7.2 Uninstall hooks defer to a `solo` subcommand, not a package script

`apt remove solo` running as root and silently deleting a user's Kind clusters is surprising,
unrecoverable, and doesn't know whose clusters to even look for (same `$HOME`-scoping problem as
§7.1). The macOS document reaches the same conclusion via a different route (`pkgutil` has no
uninstall hook at all) and lands on a `solo uninstall` subcommand run as the actual user.

Linux's `preremove` hook is real, unlike macOS's `.pkg`, but should be used the same way: invoke
or prompt for `solo uninstall` as the installing user (or print instructions if it can't determine
that user) — not delete clusters or caches itself. One shared uninstall implementation
([#5721](https://github.com/hiero-ledger/solo/issues/5721)) behind `solo uninstall`, invoked
differently per channel. On the install-script channel, `solo uninstall` also removes
`~/.solo/bin/solo` and the `PATH` entry it added (§5.5) — there is no `preremove` to do that for
it. Note for that design: `~/.solo/sea-resources/<version>/` (§5.1) needs to be in its cleanup
scope too.

### 7.3 Self-upgrade (`solo update`)

The install script's upgrade story needs its own command rather than relying on a package
manager's `upgrade` verb, since there is no package manager on this channel. This section sketches
the mechanism as input to [#5722](https://github.com/hiero-ledger/solo/issues/5722), which owns
the final design across all channels.

**Mechanism — atomic self-replace.** `solo update`:

1. Resolves the latest version and per-`(os, libc, arch)` download URL/checksum from the GitHub
   Releases API — the same source §6.2/§6.5 already publish to, so no new release artifact is
   needed. `VersionUpdateNotifier`'s existing 24-hour-cache pattern can be reused here, pointed at
   GitHub Releases for this channel instead of the npm registry.
2. Downloads the new binary into a temp file in the **same directory** as the current one
   (`~/.solo/bin/`, §5.5), so the final step is a same-filesystem rename.
3. Verifies its checksum/signature (§6.5).
4. `chmod +x`, then renames the temp file over the current binary path. Renaming over a running
   executable is safe on Linux — the running process keeps its already-open inode until it exits;
   the directory entry simply now points at the new binary for the next invocation.

**Channel detection matters more than the swap itself.** `solo update` must never touch a binary
it doesn't own. It should detect how the running binary was installed (extending
`HomebrewDeprecationNotifier`'s existing path-sniffing approach) and branch:

- **Install script** (binary under `~/.solo/bin/`, or wherever `SOLO_INSTALL_DIR` pointed, §5.5) →
  do the self-replace above.
- **npm-installed** → shell out to `npm install -g @hiero-ledger/solo@latest`; don't touch the file
  directly, or npm's own bookkeeping goes stale.
- **Native package** (if the secondary channel from §8 is built) → delegate to the package
  manager (`apt upgrade` etc.), never self-replace a file `dpkg`/`rpm` thinks it owns.
- **System-wide install script run** (`SOLO_INSTALL_DIR=/usr/bin`, §5.5) → detect the missing
  write permission and either re-exec with `sudo` (prompting) or print the manual command.

**Naming.** The CLI architecture doc already uses `upgrade` as a per-resource operation
(`block-node upgrade`, node `upgrade` — upgrading a *network component*), so reusing that word for
upgrading Solo itself would be ambiguous. `solo update`, as a bare top-level command with no
resource, avoids the collision.

---

## 8. Recommendation

**Ship a curl-pipe-to-shell install script as the primary Linux distribution channel, with the
nfpm-built native packages (`deb`/`rpm`/`apk`/`archlinux`) as an optional secondary channel for
users or environments that specifically need repo-based installs.** The install script alone
already satisfies every requirement in the parent epic (§1) — cache warm-up, clean removal, low CI
complexity — at a fraction of the infrastructure the native-package channel needs (§4), because it
sidesteps the root/no-TTY/wrong-`$HOME` constraints that the package-format lifecycle hooks exist
to work around in the first place (§7).

- **Install script (primary):**
  - One shell script (§5.5), no packaging format, no repository, no signing infrastructure beyond
    a checksum manifest reusing an OpenPGP identity Solo needs anyway (§6.5).
  - Covers all 9 distros immediately for whichever `(libc, arch)` SEA binaries exist — glibc/x64
    today, musl/arm64 the moment [#5716](https://github.com/hiero-ledger/solo/issues/5716) and the
    arm64 SEA leg land, with no packaging-config changes required (unlike the native channel,
    which needs new nfpm targets).
  - `solo update` (§7.3) gives one uniform, no-`sudo`-by-default upgrade command instead of five
    different package-manager upgrade verbs.
- **Native packages via nfpm (secondary, if/when built):**
  - **nfpm over FPM** if this channel is built — single static binary, no Ruby/`rpmbuild`
    dependency, 17 vs. 791 open issues, first-class `apk`/`archlinux` support (§4).
  - Hosted via JFrog Artifactory (§6.2), with every format also attached to the GitHub Release for
    local-file install (§6.3) even without repo hosting.
  - Justified by real demand for `apt`/`dnf`/`pacman` search-and-install and passive
    `apt upgrade`-style updates — not built speculatively ahead of that demand.
- **Lifecycle hooks stay thin on the native channel, and don't exist as a separate concept on the
  install-script channel** (§7): neither calls `solo cache image pull` or deletes clusters
  directly; both defer to Solo-owned mechanisms (first-run check, `solo uninstall`).

**Implementation notes for #5725:**

1. Write the install script (§5.5): OS/libc/arch detection, download + checksum/signature
   verification (§6.5), install to `~/.solo/bin/solo`, `PATH` setup, first-run notice (§7.1).
   Publish it at a stable, short URL (e.g. `https://<install-host>/install.sh`) alongside the SEA
   binaries and `SHA256SUMS`/`SHA256SUMS.asc` on the GitHub Release.
2. Implement `solo update` (§7.3) and `solo uninstall`'s install-script branch (§7.2) — both are
   prerequisites for the script to be a complete, self-sufficient channel rather than a one-way
   install.
3. Defer the nfpm native-package channel (§4, §6) until there's a concrete ask for repo-based
   installs; when built, package the SEA binary as `.deb`/`.rpm`/`.apk`/`.pkg.tar.zst` via nfpm
   (`/usr/bin/solo`, §5.2), host through JFrog, and wire `postinstall`/`preremove` to the same thin
   hand-offs (§7.1/§7.2).
4. Coordinate sequencing with [#5716](https://github.com/hiero-ledger/solo/issues/5716) (musl SEA
   binary, unblocks Alpine on both channels), the arm64 SEA leg, and
   [#5717](https://github.com/hiero-ledger/solo/issues/5717) (signing — needed for §6.5 regardless
   of whether the native-package channel ships), and [#5722](https://github.com/hiero-ledger/solo/issues/5722) (self-upgrade — §7.3 is input to it, not a substitute).

### Alternatives ruled out

- **AppImage** — no install/uninstall lifecycle; needs an outer wrapper to get hooks at all (§4).
- **makeself** — kept as a documented fallback (no-sudo path, §9), largely superseded by the
  install script (§5.5), which achieves the same no-`sudo`, no-package-manager outcome with a
  simpler, more widely recognized UX.
- **Raw `.deb`/`.rpm` built independently** — two pipelines for coverage nfpm gets from one (§4).
- **FPM** — viable, but heavier CI dependency and larger issue backlog than nfpm (§4).

---

## 9. Risks / Open Questions

- **Pipe-to-shell trust perception.** Some organizations' security policies flag `curl | sh` on
  principle, independent of what the script actually does. §6.5's checksum/signature verification
  mitigates the technical risk but not the policy objection; documenting a "download, inspect,
  then run" alternative (`curl -fsSL ... -o install.sh && less install.sh && sh install.sh`) is a
  cheap way to address it without changing the primary flow.
- **No OS-native "installed software" listing on the install-script channel.** Nothing shows up in
  `apt list --installed`, GNOME Software, etc. If that discoverability turns out to matter to
  users, it's the concrete signal to prioritize building the nfpm secondary channel (§8).
- **First-run warm-up mechanism undesigned.** §7.1 states the direction, not the trigger, marker
  location, or opt-in/opt-out UX — needed before #5725 can implement it for either channel.
- **`solo uninstall` doesn't exist yet.** §7.2 depends on
  [#5721](https://github.com/hiero-ledger/solo/issues/5721) landing it; until then the install
  script's own removal path (and `preremove`, if the native channel is built) has nothing safe to
  hand off to but a printed instruction.
- **`solo update`'s self-replace is proposed here, not yet designed end-to-end.** §7.3 is scoped
  as input to [#5722](https://github.com/hiero-ledger/solo/issues/5722); Windows's inability to
  rename over a running `.exe` in particular needs that document's attention once a Windows
  install-script/PowerShell equivalent exists (out of scope here, §3).
- **JFrog's generic-repo signing for `pacman` is unverified** against Solo's actual instance (only
  checked against JFrog's public docs) — relevant only if/when the native-package channel is built.
- **nfpm's built-in signing coverage is unconfirmed** — whether external tools (`debsigs`,
  `rpmsign`) are still needed in CI should be confirmed if that channel is built.
- **#5717 doesn't scope the Linux signing keys yet** — only macOS/Windows certs are named
  currently; the OpenPGP identity (needed regardless of channel, per §6.5) and Alpine RSA keypair
  (needed only for the native channel) need to be added to its scope.

---

## 10. References

- [makeself](https://github.com/megastep/makeself)
- [AppImage](https://appimage.org/)
- [`nfpm`](https://github.com/goreleaser/nfpm) — native-package secondary channel (§8)
- [`fpm`](https://github.com/jordansissel/fpm) — ruled-out alternative (§4)
- [Filesystem Hierarchy Standard](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html) —
  `/usr/local` reservation (§5.2)
- [Debian Policy Manual — maintainer scripts](https://www.debian.org/doc/debian-policy/ch-maintainerscripts.html) (§7.1)
- [`abuild-sign` / Alpine package signing](https://wiki.alpinelinux.org/wiki/Abuild_and_Helpers) (§6.1)
- [Arch Linux `repo-add`/`pacman-key`](https://wiki.archlinux.org/title/Pacman/Package_signing) (§6.1)
- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
- [#5810 — feat: add Node.js SEA build pipeline](https://github.com/hiero-ledger/solo/pull/5810) (§5.1)
- Install-script precedent for single-binary CLIs — `rustup` (`sh.rustup.rs`), Deno
  (`deno.land/install.sh`), Bun (`bun.sh/install`), uv (`astral.sh/uv/install.sh`), and the
  OpenAI Codex CLI (`chatgpt.com/codex/install.sh`) (§4)
- [macOS installer design document](macos-dmg-installer.md) — house style and shared
  uninstall/self-upgrade reasoning (§7.2, §3)

---

*Last updated: 2026-09-04*
