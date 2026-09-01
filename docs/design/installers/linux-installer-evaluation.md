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
- **Self-upgrade flow** — [#5722](https://github.com/hiero-ledger/solo/issues/5722).
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

|                                    | makeself                                                      | AppImage                                                                                                   | .deb/.rpm (separate)                                                  | nfpm / FPM (multi-format)                                                              |
|------------------------------------|---------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| **What it is**                     | Self-extracting shell archive (`.run`)                        | Portable squashfs + runtime, no install step                                                               | Native packages per distro family                                     | One declarative source → `deb`/`rpm`/`apk`/`archlinux`                                 |
| **Install**                        | `sudo ./solo.run`                                             | `./solo.AppImage`                                                                                          | `apt install ./solo.deb` / `dnf install ./solo.rpm`                   | Same as .deb/.rpm                                                                      |
| **Uninstall**                      | Bundled `uninstall.sh`                                        | `rm` the file                                                                                              | `apt remove` / `dnf remove`                                           | Same                                                                                   |
| **Post-install / uninstall hooks** | Yes (setup script)                                            | **No**                                                                                                     | Yes (`postinst`/`prerm`)                                              | Yes (`postinstall`/`preremove`)                                                        |
| **Package manager integration**    | None                                                          | None                                                                                                       | Full                                                                  | Full (with hosted repo)                                                                |
| **CI build complexity**            | Very low (shell + tar)                                        | Low–medium (`appimagetool`, no cross-build)                                                                | High — two independent pipelines (`dpkg-deb`/`debhelper`, `rpmbuild`) | Low — single static binary (nfpm) or Ruby gem + `rpmbuild` (FPM)                       |
| **Distro coverage**                | All non-Alpine (still glibc/x64-bound)                        | 8/9, glibc only, no Alpine                                                                                 | 7/9 (no Arch, no Alpine)                                              | 9/9 reachable (`deb`,`rpm`,`apk`,`archlinux`); `apk` ships once musl SEA binary exists |
| **Upgrade path**                   | Re-run new `.run` + version-check banner                      | Delta patch via AppImageUpdate — can't re-run post-install hook                                            | `apt upgrade`/`dnf upgrade` w/ hosted repo; manual otherwise          | Same as .deb/.rpm                                                                      |
| **Verdict**                        | Kept as documented fallback (§6.3) — no repo, manual upgrades | **Ruled out** — no lifecycle hooks means it can't satisfy either requirement without a second wrapper tool | Two pipelines for the coverage nfpm gets from one                     | **Recommended tool: nfpm** (see below)                                                 |

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
better-fitted tool** for the "four formats, one source" need.

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

---

## 6. Repository Hosting and Signing

Whether signing is required depends on the install path:

- **Local-file install (§6.3), no repository:** not required. `apt`/`dnf` don't verify a signature
  on a `.deb`/`.rpm` installed directly from disk.
- **Hosted repository (§6.2):** effectively required. `apt` refuses an unsigned repo by default,
  `dnf` repos are conventionally `gpgcheck=1`, and `apk` has no unsigned-custom-repo path at all.
  Since §9 recommends hosted repos for all four formats, [#5717](https://github.com/hiero-ledger/solo/issues/5717) is a blocking dependency, not a parallel concern.

### 6.1 Signing per format

nfpm/FPM produce unsigned packages by default:

- **apt (`.deb`):** `debsigs`/`dpkg-sig` signs the package; `Release`/`InRelease` needs a GPG
  signature too.
- **dnf (`.rpm`):** `rpmsign` (`%_gpg_name`) + `gpgkey=` in the client's `.repo` file.
- **apk:** `abuild-sign` with an RSA key installed into `/etc/apk/keys` on every client — no
  trust-on-first-add flow.
- **pacman:** `repo-add --sign` for the repo database + `pacman-key` client trust.

Four repository types to host and sign, not two. Key custody/rotation is
[#5717](https://github.com/hiero-ledger/solo/issues/5717)'s job.

### 6.2 Hosting

**JFrog Artifactory (recommended, all four formats).** Solo already publishes npm here. JFrog has
native repo types for Debian, RPM, and Alpine — each auto-signs its own metadata on reindex once
the key is uploaded. Arch/`pacman` has no native repo type, so it's served from a generic/raw
repo with CI running `repo-add --sign`. One instance, one pipeline, all four formats.

*Ruled out:* GitHub Pages (duplicates infra Solo already has in JFrog).

**GitHub Release assets, always, regardless of repository hosting** — so
`apt install ./solo.deb` / `dnf install ./solo.rpm` works even before a client adds the repo (no
`apt upgrade` for free, but it works).

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

### 6.4 Keys required

Two distinct kinds of key material, not four:

| Format               | Key type          | Signs                                        |
|----------------------|-------------------|----------------------------------------------|
| apt (`.deb`)         | OpenPGP           | `Release`/`InRelease`; optionally the `.deb` |
| dnf (`.rpm`)         | OpenPGP           | Each `.rpm` header; optionally `repomd.xml`  |
| pacman (`archlinux`) | OpenPGP           | Repository database                          |
| apk (Alpine)         | RSA (not OpenPGP) | `APKINDEX`                                   |

1. **One OpenPGP identity**, reusable across apt/dnf/pacman (distributed three different ways).
   Whether to mint separate keys per format instead is a custody decision, not a technical one.
2. **One RSA keypair for Alpine** — `abuild-sign` doesn't speak OpenPGP.

Once uploaded to Artifactory's Signing Keys config, Artifactory signs repo metadata automatically
on reindex for apt/dnf/apk. It does **not** embed a per-package RPM signature (a separate
`rpmsign --addsign` pass is still needed if per-package verification matters), and it has no
Arch repo type at all — `repo-add --sign` happens entirely in CI there.

Unlike the macOS/Windows legs of the same epic (Apple Developer ID, Microsoft Authenticode —
both purchased, CA-issued), both Linux key types are self-generated. **#5717's scope should be
extended to cover them explicitly** (§8).

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
under `~/.solo/` checked on first invocation, independent of install channel (npm, makeself, or a
distro package). `postinst`'s only job becomes printing a one-line notice that the first run will
warm the cache (optionally a preseed flag like `--with-image-cache` for non-interactive
provisioning). Exact mechanism is an implementation decision for
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
differently per OS. Note for that design: `~/.solo/sea-resources/<version>/` (§5.1) needs to be in
its cleanup scope too.

---

## 8. Recommendation

**Use nfpm to produce and host all four package formats — `deb`, `rpm`, `apk`, and `archlinux`
(pacman) — as one coordinated release pipeline covering the full nine-distribution matrix.** This
is the complete design for #5714's Linux leg, sequenced only by real technical prerequisites
(§3), not a phased scope cut.

- **nfpm over FPM** — single static binary, no Ruby/`rpmbuild` dependency, 17 vs. 791 open issues,
  first-class `apk`/`archlinux` support (§4).
- **Hosted repositories for all four formats from the outset**, via JFrog Artifactory (§6.2), with
  every format also attached to the GitHub Release for local-file install.
- **Format availability tracks its own prerequisites:**
  - `deb`/`rpm` ship now — they package the existing `linux/x64` glibc SEA binary and cover 7/9
    distros (Ubuntu, Debian, Fedora, Rocky, AlmaLinux, Oracle Linux, openSUSE).
  - `apk`/`archlinux` need the musl SEA binary ([#5716](https://github.com/hiero-ledger/solo/issues/5716)); nfpm config and hosting are already covered here and apply the moment it exists.
  - `arm64` needs a new SEA build leg; same nfpm config packages it once that lands.
- **Lifecycle hooks stay thin** (§7): `postinstall` doesn't call `solo cache image pull` directly;
  `preremove` doesn't delete clusters directly. Both defer to Solo-owned mechanisms.

**Implementation notes for #5725:**

1. Package the SEA binary as `.deb`/`.rpm`/`.apk`/`.pkg.tar.zst` via nfpm (`/usr/bin/solo`, §5.2);
   host through JFrog and attach to the GitHub Release.
2. Wire `postinstall`/`preremove` to the thin hand-offs in §7.1/§7.2 — contingent on the first-run
   warm-up mechanism and `solo uninstall` existing (not finalized here).
3. Coordinate sequencing with [#5716](https://github.com/hiero-ledger/solo/issues/5716) (musl,
   unblocks apk), the arm64 SEA leg, [#5717](https://github.com/hiero-ledger/solo/issues/5717)
   (signing, unblocks hosted repos), and [#5722](https://github.com/hiero-ledger/solo/issues/5722)
   (self-upgrade, independent of format).

### Alternatives ruled out

- **AppImage** — no install/uninstall lifecycle; needs an outer wrapper to get hooks at all (§4).
- **makeself** — kept as a documented fallback (no-sudo path, §9), not the primary mechanism.
- **Raw `.deb`/`.rpm` built independently** — two pipelines for coverage nfpm gets from one (§4).
- **FPM** — viable, but heavier CI dependency and larger issue backlog than nfpm (§4).

---

## 9. Risks / Open Questions

- **No-sudo fallback undecided.** A user without `sudo` can `npm install -g` but not
  `apt install`. Whether a tarball or the makeself `.run` (§4) is kept as an unprivileged
  fallback, or root becomes a hard requirement, needs an explicit decision before #5725 ships.
- **First-run warm-up mechanism undesigned.** §7.1 states the direction, not the trigger, marker
  location, or opt-in/opt-out UX — needed before #5725 can write the `postinstall` message.
- **`solo uninstall` doesn't exist yet.** §7.2 depends on
  [#5721](https://github.com/hiero-ledger/solo/issues/5721) landing it; until then `preremove` has
  nothing safe to hand off to but a printed instruction.
- **JFrog's generic-repo signing for `pacman` is unverified** against Solo's actual instance (only
  checked against JFrog's public docs).
- **nfpm's built-in signing coverage is unconfirmed** — whether external tools (`debsigs`,
  `rpmsign`) are still needed in CI should be confirmed during #5725's implementation.
- **#5717 doesn't scope the Linux signing keys yet** — only macOS/Windows certs are named
  currently; the OpenPGP identity and Alpine RSA keypair (§6.4) need to be added to its scope.

---

## 10. References

- [makeself](https://github.com/megastep/makeself)
- [AppImage](https://appimage.org/)
- [`nfpm`](https://github.com/goreleaser/nfpm) — chosen tool (§8)
- [`fpm`](https://github.com/jordansissel/fpm) — ruled-out alternative (§4)
- [Filesystem Hierarchy Standard](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html) —
  `/usr/local` reservation (§5.2)
- [Debian Policy Manual — maintainer scripts](https://www.debian.org/doc/debian-policy/ch-maintainerscripts.html) (§7.1)
- [`abuild-sign` / Alpine package signing](https://wiki.alpinelinux.org/wiki/Abuild_and_Helpers) (§6.1)
- [Arch Linux `repo-add`/`pacman-key`](https://wiki.archlinux.org/title/Pacman/Package_signing) (§6.1)
- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
- [#5810 — feat: add Node.js SEA build pipeline](https://github.com/hiero-ledger/solo/pull/5810) (§5.1)
- [macOS installer design document](macos-dmg-installer.md) — house style and shared
  uninstall/self-upgrade reasoning (§7.2, §3)

---

*Last updated: 2026-09-01*
