# macOS DMG Installer: Tool Selection and Design

## 1. Context

[#5714](https://github.com/hiero-ledger/solo/issues/5714) tracks building OS-specific installers around the Solo Node.js
[Single Executable Application (SEA)](https://nodejs.org/api/single-executable-applications.html) binary. On macOS this
means producing a signed, notarized `.dmg` that:

- Presents the Solo binary for installation with a branded layout (background image, icon placement).
- Optionally shows a license/EULA screen before the volume can be used.
- Triggers `solo cache image pull` as a post-install step, per the parent issue's goals.

This document is the research task for [#5719](https://github.com/hiero-ledger/solo/issues/5719): evaluate open-source
DMG builder options and select one. It is a dependency of [#5724](https://github.com/hiero-ledger/solo/issues/5724)
(build the macOS DMG installer), which also depends on the SEA build pipeline
([#5716](https://github.com/hiero-ledger/solo/issues/5716)), signing infrastructure
([#5717](https://github.com/hiero-ledger/solo/issues/5717)), and the shared uninstall design
([#5721](https://github.com/hiero-ledger/solo/issues/5721)).

## 2. Goals

- Select an open-source DMG builder tool suitable for packaging a bare CLI binary (not an Electron/`.app` bundle).
- Define the DMG layout: background image and icon/window positioning.
- Define how a license/EULA screen is presented before mounting.
- Define how the post-install hook (`solo cache image pull`) is actually wired, given that a plain DMG has no
  native post-install mechanism.

## 3. Non-Goals

- Implementing the DMG build ([#5724](https://github.com/hiero-ledger/solo/issues/5724)).
- Designing the uninstall flow ([#5721](https://github.com/hiero-ledger/solo/issues/5721)) — this document only notes
  where the installer choice constrains that design.
- Code-signing/notarization CI wiring ([#5717](https://github.com/hiero-ledger/solo/issues/5717)) — covered here only
  to the extent it constrains tool choice.
- Windows (NSIS) or Linux (makeself-style) installers — tracked separately under #5714.
- Designing the self-upgrade flow ([#5722](https://github.com/hiero-ledger/solo/issues/5722)) — §9 captures research
  findings only, as background for that design task; it is not a substitute for it.

## 4. Important Nuance: a DMG Has No Post-Install Hook

A drag-and-drop `.dmg` is a mounted read-only volume. The user drags the binary onto a target (typically an
`/Applications` symlink or, for a CLI tool, a `/usr/local/bin`-style location); nothing executes automatically once
the copy finishes. There is no DMG-level equivalent of a Windows NSIS `postInstall` section.

The only Apple-native artifact with a real post-install script hook is a `.pkg`, built with `pkgbuild` and (for
multi-component installs) composed with `productbuild`:

- `pkgbuild --scripts <dir> ...` picks up a `postinstall` script from the scripts directory by name and runs it after
  the payload is written.
- `productbuild` composes one or more `pkgbuild` component packages plus a `distribution.xml` into a signed, uber
  installer package.
- Apple's App Store/TestFlight submission path disallows install scripts; this does not apply to direct,
  notarized distribution, which is what Solo needs.

This means "select a DMG tool" and "wire the post-install hook" are two separate concerns: the DMG tool controls
presentation (background, icons, license screen); the post-install hook requires a `.pkg` inside (or alongside) that
DMG. The alternatives to a `.pkg` — a LaunchAgent self-registered on first run, or the binary bootstrapping itself on
first launch — do not match the parent issue's explicit goal of the *installer* triggering the pull, and are weaker:
they depend on the user actually launching the binary once, which a CLI tool copied to a `PATH` directory may not
prompt for in the same way a `.app` icon double-click does.

**Design decision: ship a signed `.pkg` inside the DMG.** The DMG remains the distributable, branded artifact
(background image, custom icon layout, license screen); double-clicking the `.pkg` it contains runs the real
installer, which places the SEA binary and executes `postinstall` to run `solo cache image pull`.

## 5. Options Considered

| Tool | Maintenance | Install | Background image | Icon/window layout | License screen | Bare binary (non-`.app`) | Verdict |
|---|---|---|---|---|---|---|---|
| [`sindresorhus/create-dmg`](https://github.com/sindresorhus/create-dmg) (npm `create-dmg`) | Active (v8.1.0, 2026-03) | `npm i -g create-dmg` | Fixed, not customizable | Fixed, not customizable | Yes, auto-detected from `license.txt`/`license.rtf` | No — requires a `.app` bundle (reads `Info.plist`) | Rejected: no layout control, wrong input shape |
| [`create-dmg/create-dmg`](https://github.com/create-dmg/create-dmg) (formerly `andreyvit/create-dmg`; Homebrew) | Active (v1.3.0, 2026-07) | `brew install create-dmg` | Configurable (PNG/GIF/JPG) | Configurable (per-icon position/size, window size/position) | Yes, via `--eula` | Yes — accepts any file/folder | **Selected** |
| [`appdmg`](https://github.com/LinusU/node-appdmg) (npm, aka `node-appdmg`) | Stale — last release 2023-02, 56 open issues | `npm i -g appdmg` | Configurable via JSON spec | Configurable via JSON spec | No documented support | Yes | Rejected: unmaintained, no license-screen support |
| `electron-builder`'s `dmg-builder` | Active, but Electron-specific | N/A (not standalone) | Configurable | Configurable | Configurable (`license` key) | No — Electron-only | Reference only; confirms this feature set is achievable via `hdiutil` |
| Raw `hdiutil` + AppleScript | N/A (Apple-native) | Pre-installed | Fully manual | Fully manual | Manual (`SLAResources`) | Yes | Rejected as primary tool: `create-dmg/create-dmg` already wraps this correctly and maintains it |

Note the naming collision: the issue's reference to `create-dmg` most likely means the Homebrew/Bash tool
(`create-dmg/create-dmg`, formerly `andreyvit/create-dmg`), not the unrelated npm package by Sindre Sorhus of the
same name. They share no code. Both wrap `hdiutil`/AppleScript independently.

### Why not `appdmg`

`appdmg` has had no commits or releases since early 2023 and carries 56 open issues. It has no license-screen
support at all, which is a hard requirement here. Its APFS support was only added in its final 2023 release, so
compatibility with current macOS toolchains and Apple Silicon CI runners is unverified. Given the SEA-installer
pipeline needs to remain reliable across macOS releases for the life of this feature, a stale dependency here is a
liability that `create-dmg/create-dmg`'s active maintenance avoids.

### Why not `sindresorhus/create-dmg`

It is well-maintained but intentionally non-configurable — no background image, no icon positioning — and it
expects a `.app` bundle as input (it reads the bundle's `Info.plist` for name/version and icon). Solo's SEA output is
a bare executable, not a bundle, so this tool would require first wrapping the binary in a synthetic `.app`, adding
a step this design doesn't otherwise need.

## 6. Design

### 6.1 Layout

The DMG is built with `create-dmg/create-dmg` (Homebrew-installed in CI) against a build directory containing:

- The signed `.pkg` (see §6.3), the actual install target the user double-clicks.
- An `/Applications`-style convenience is not applicable (no `.app`); instead the window shows just the `.pkg`
  and, optionally, a `README`/link back to docs.

Example invocation shape (finalized during implementation in #5724):

```bash
create-dmg \
  --volname "Solo Installer" \
  --background "assets/dmg-background.png" \
  --window-size 660 400 \
  --icon-size 128 \
  --icon "Solo.pkg" 330 200 \
  --eula "LICENSE.rtf" \
  --hide-extension "Solo.pkg" \
  "dist/Solo-Installer.dmg" \
  "build/dmg-root/"
```

### 6.2 License Screen

`create-dmg/create-dmg`'s `--eula <path>` flag embeds the license as an `SLAResources`-style agreement: the volume
will not mount (and the installer is inaccessible) until the user clicks "Agree." The source file is `LICENSE.rtf`,
generated at build time from the repository's `LICENSE` file (plain text is accepted; RTF gives control over
formatting for the dialog). This runs once, at DMG-mount time, before the `.pkg` is even reachable — it is a gate on
viewing the installer, not a gate the `.pkg` itself needs to repeat.

### 6.3 Post-Install Hook Wiring

The post-install action lives entirely in the `.pkg`, not in the DMG tooling:

1. `pkgbuild` packages the SEA binary (installed to, e.g., `/usr/local/bin/solo` or a versioned
   `/usr/local/lib/solo/<version>/solo` with a symlink) together with a `--scripts build/pkg-scripts/` directory
   containing a `postinstall` executable script.
2. The `postinstall` script invokes the just-installed binary: `/usr/local/bin/solo cache image pull` (exact path
   and flags to be finalized in #5724; should be non-interactive and log to the standard Solo log location so
   failures are diagnosable without blocking install completion).
3. `productbuild` (if multiple components are ever needed — e.g., a future MSYS2-equivalent dependency bundle) would
   compose the component `.pkg`s; for a single-component install `pkgbuild`'s output can be used directly.
4. The resulting `.pkg` is signed with the **Developer ID Installer** certificate (distinct from the **Developer ID
   Application** certificate used for the binary itself — both come from #5717) and notarized via `notarytool`,
   with the ticket stapled via `stapler`.
5. The signed, notarized `.pkg` is placed into the `create-dmg` build root and the DMG is built and separately
   signed/notarized as a `Developer ID Application`-signed disk image.

This keeps the "branding" concern (DMG: background, icon layout, license gate) and the "installation logic" concern
(`.pkg`: file placement, postinstall script, uninstall receipt registration) cleanly separated, and matches how
Apple expects post-install automation to be expressed.

### 6.4 Uninstall Interaction

**macOS has no native pre/post-uninstall hook.** `pkgbuild`/`productbuild`/`/usr/sbin/installer` only support
`preinstall`/`postinstall` scripts; if a package with the same identifier is installed again, those same scripts run
once more, so they effectively double as pre/post-*upgrade* hooks — but there is no removal-time counterpart,
because flat `.pkg` installs have no built-in "uninstall" action at all. `pkgutil` only tracks a receipt of what was
installed:

- `pkgutil --pkgs` lists installed package identifiers.
- `pkgutil --files <package-id>` lists the files a given package wrote.
- `pkgutil --forget <package-id>` deletes the receipt.

None of these delete files, unload LaunchAgents, or run any script — they are bookkeeping only. Anything the
`postinstall` script registers (e.g., a LaunchAgent for the self-upgrade check in #5714) has to be torn down
explicitly by whatever performs the uninstall, since there is no OS event to hook for automatic cleanup.

This is why uninstall behavior is scoped as its own design task
([#5721](https://github.com/hiero-ledger/solo/issues/5721)) rather than an installer-provided hook: Solo must supply
its own uninstall path. The `.pkg` receipt from §6.3 is the natural data source for that path — most likely a
`solo uninstall` CLI subcommand (rather than a separate script/app dropped alongside the binary, since Solo is
already the CLI users would reach for) that:

1. Reads `pkgutil --files <solo-pkg-id>` to enumerate installed files instead of hardcoding paths.
2. Deletes any Kind clusters, image caches, and Solo cache directories per the #5721 design.
3. Unloads/removes any LaunchAgent registered during install (`launchctl bootout`, then delete the plist).
4. Removes the enumerated files and finishes with `pkgutil --forget <solo-pkg-id>` to clear the receipt.

Third-party GUI packaging tools (e.g., Whitebox Packages, or Jamf in MDM-managed environments) sometimes layer a
"post-removal" convention on top of `pkgbuild` output, but this is not part of Apple's native format and would add a
tooling dependency that doesn't fit Solo's direct-distribution model — the `solo uninstall` subcommand approach
above needs no such dependency. This section is called out here only because it depends on the `.pkg`-based approach
chosen in §6.3; the full uninstall behavior itself is designed in #5721.

## 7. Risks / Open Questions

- **macOS 26 (Tahoe) notarization flakiness:** there are open Apple Developer Forum reports of `spctl --type install`
  intermittently rejecting properly signed/notarized `.pkg` files downloaded from the internet
  ([forum thread](https://developer.apple.com/forums/thread/817887)). Not yet resolved upstream; #5724 should budget
  time for retry logic / Apple support escalation if CI notarization checks flake.
- **Binary install location:** whether the SEA binary should install to `/usr/local/bin` directly or to a versioned
  path with a symlink (to support the self-upgrade goal in #5714) is deferred to #5724, since it affects the
  `pkgbuild` component layout but not the DMG tool choice.
- **CI headless AppleScript step:** `create-dmg/create-dmg` (like all `hdiutil`/AppleScript-based tools) needs a
  logged-in GUI session to set Finder window/icon layout. GitHub Actions macOS runners provide this, so it works
  today, but it is a soft dependency on the runner image worth re-verifying at implementation time; the tool's
  `--skip-jenkins`/`--sandbox-safe` flags exist for CI accommodation.

## 9. Related: Self-Upgrade Mechanism Research (#5722)

The parent goal in #5714 includes self-upgrade ("inform the user there is a new version and prompt them if they
would like to install it/upgrade now"), designed separately in
[#5722](https://github.com/hiero-ledger/solo/issues/5722). It is captured here only because the `.pkg`-based install
in §6.3 and the versioned-binary-location question in §7 both constrain it. This section is research background, not
the design itself.

**Version-check strategy.** Unauthenticated GitHub REST calls are capped at 60 requests/hour per IP — easily
exhausted for a widely-used CLI shared behind a NAT or CI runner, so relying on `ETag`/`If-None-Match` alone is not
enough (conditional requests only reliably avoid the rate-limit cost when authenticated). The observed real-world
pattern (`update-notifier`, and GitHub's own `gh` CLI) is a background check on a ~24h cadence, with the last-check
timestamp cached locally, and the check never blocking the current invocation.

**UX.** `update-notifier` (the standard npm library for this, used historically by npm and Yeoman) is stale — no
release in ~2 years, flagged as an unhealthy release cadence by dependency-health scanners despite having listed
maintainers. It also only *notifies*; it has no binary-replacement capability. Modern practice favors a silent
background check plus a terse one-line notice on the next invocation, never an interactive blocking prompt, with an
easy opt-out.

**Atomic binary replacement.** On POSIX (macOS/Linux), `rename()` over a running executable's file is safe — the
kernel keeps the old inode alive via the running process's open reference until it exits, so the standard pattern is
"download to a temp file on the same filesystem, then `rename()` over the target." On Windows, a running `.exe`'s
file is locked but can still be *renamed*; the standard workaround (implemented by Rust's `self-replace` crate, used
by `rustup self update`) is: rename the current exe aside (e.g. `.old`), move the new binary into place, then have a
helper process delete the `.old` file (via `FILE_FLAG_DELETE_ON_CLOSE`) after the parent exits. Deno's `deno upgrade`
follows the same shape, adding binary diffing and a `.old.exe` rename step on Windows. Bun's `bun upgrade` overwrites
its own binary directly but explicitly defers to the OS package manager for package-manager-installed copies.
Notably, **GitHub's own `gh` CLI does not self-update at all** — it only checks and notifies, deferring upgrades
entirely to Homebrew/WinGet/Scoop/Chocolatey. No mature generic Node.js library exists for the actual binary-swap
step (only for the notification half).

**Integrity verification.** Rigor varies across the precedents: rustup trusts HTTPS transport only (PGP/TUF support
exists but is warn-only, not enforced); Deno verifies SHA-256 on every downloaded artifact and supports an explicit
checksum-pinning flag; the Rust `self_update` crate verifies GitHub's auto-published SHA256 digests by default;
Electron's Squirrel-based updaters go furthest, re-validating both checksum and code signature before installing.
Given Solo's SEA binaries will already be signed/notarized (per #5717), re-verifying the downloaded binary's
signature before swap — not just a checksum — is the strongest option available and worth carrying into #5722.

**Rollback.** The consistent pattern across all of the above: never touch the currently-running binary until the new
one is fully downloaded and verified, and keep the old binary recoverable (renamed aside, not deleted) until the new
one is confirmed to launch successfully; only clean up the old copy after that confirmation.

## 10. References

- [`create-dmg/create-dmg`](https://github.com/create-dmg/create-dmg) (selected)
- [`sindresorhus/create-dmg`](https://github.com/sindresorhus/create-dmg)
- [`LinusU/node-appdmg`](https://github.com/LinusU/node-appdmg)
- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
- [`pkgbuild` man page](https://keith.github.io/xcode-man-pages/pkgbuild.1.html)
- [Building simple packages with scripts (scriptingosx.com)](https://scriptingosx.com/2019/01/build-simple-packages-with-scripts/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/macos/distribution/)
- [`electron-builder` DMG options](https://www.electron.build/dmg.html) (reference only)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) (§9)
- [`update-notifier` (npm)](https://www.npmjs.com/package/update-notifier) (§9)
- [`self-replace` crate (Rust, used by rustup)](https://github.com/mitsuhiko/self-replace) (§9)
- [`self_update` crate (Rust)](https://crates.io/crates/self_update) (§9)
- [Deno upgrade system (DeepWiki)](https://deepwiki.com/denoland/deno/2.8-upgrade-system) (§9)
- [`electron-builder` auto-update docs](https://www.electron.build/docs/features/auto-update/) (§9)
