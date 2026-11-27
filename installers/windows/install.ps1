# SPDX-License-Identifier: Apache-2.0
#
# Installs the Solo CLI as a standalone binary on Windows, no Node.js required.
#
#   irm https://github.com/hiero-ledger/solo/releases/latest/download/install.ps1 | iex
#
# `iex` runs the script without a parameter list, so options are passed by invoking it as a script
# block instead:
#
#   & ([scriptblock]::Create((irm https://github.com/hiero-ledger/solo/releases/latest/download/install.ps1))) -Version v0.92.0
#
# Run with -Help for all options.

param(
  # Release to install, for example v0.92.0.
  [string]$Version = 'latest',

  # Directory for solo.exe. Defaults to $env:SOLO_INSTALL_DIR, then ~\.solo\bin.
  [string]$Prefix,

  # Run 'solo cache image pull' after installing to download the images Solo deploys.
  [switch]$WithImageCache,

  # Accepted and ignored: the image download is opt-in, so install commands that still pass this
  # keep working.
  [switch]$SkipImageCache,

  # Release download base URL.
  [string]$BaseUrl,

  [switch]$Help
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell renders a progress bar for every chunk Invoke-WebRequest reads, which costs more
# than the download itself for a binary this size.
$ProgressPreference = 'SilentlyContinue'
# Windows PowerShell leaves .NET's default protocol list in place, which can still exclude TLS 1.2.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$soloRepositoryUrl = 'https://github.com/hiero-ledger/solo'
$checksumsAsset = 'SHA256SUMS'
$signerIdentity = "$soloRepositoryUrl/.github/workflows/flow-sign-release-assets.yaml@refs/heads/main"
$oidcIssuer = 'https://token.actions.githubusercontent.com'
$npmFallback = 'install with: npm install -g @hiero-ledger/solo'
$defaultInstallDirectory = Join-Path $HOME '.solo\bin'

# Resolved here, at the top level, and not inside a function: `irm ... | iex` runs this as a script
# block, where an assignment made inside a function does not reach the parameters declared above.
$releaseBaseUrl = if ($BaseUrl) { $BaseUrl.TrimEnd('/') } else { "$soloRepositoryUrl/releases" }
$releaseVersion = if ($Version -match '^\d') { "v$Version" } else { $Version }

function Write-Info([string]$Message) {
  Write-Host "solo-install: $Message"
}

function Write-Note([string]$Message) {
  Write-Host "solo-install: warning: $Message" -ForegroundColor Yellow
}

function Show-Usage {
  Write-Host @"
Install the Solo CLI on Windows.

Usage: install.ps1 [options]

Options:
  -Version <tag>      Release to install, for example v0.92.0 (default: latest)
  -Prefix <dir>       Directory for solo.exe (default: ~\.solo\bin, or SOLO_INSTALL_DIR)
  -WithImageCache     Run 'solo cache image pull' after installing to download the images Solo deploys
  -BaseUrl <url>      Release download base URL (default: $soloRepositoryUrl/releases)
  -Help               Show this help
"@
}

# Runs a native command and returns its combined output and exit code. PowerShell turns a redirected
# stderr line into an error record, which $ErrorActionPreference = 'Stop' would raise as terminating
# even when the command went on to succeed, so these calls run with it relaxed.
function Invoke-Native([string]$FilePath, [string[]]$Arguments) {
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $FilePath @Arguments 2>&1 | Out-String
    return [pscustomobject]@{Output = $output; ExitCode = $LASTEXITCODE}
  } catch {
    # The command could not be started at all; report it the same way as a non-zero exit.
    return [pscustomobject]@{Output = $_.Exception.Message; ExitCode = -1}
  }
}

# Returns the release asset name for this machine, for example solo-win32-x64.exe.
function Get-AssetName {
  # OSArchitecture reports the machine, not the host process, so a 32-bit PowerShell on a 64-bit
  # Windows still resolves to x64.
  $osArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  switch ($osArchitecture) {
    'X64' { return 'solo-win32-x64.exe' }
    'Arm64' {
      # Windows on Arm runs x64 binaries under emulation. A native arm64 build is not published yet.
      Write-Info 'no native arm64 build is published yet; installing the x64 binary, which Windows runs under emulation'
      return 'solo-win32-x64.exe'
    }
    default { throw "unsupported CPU architecture: $osArchitecture; $npmFallback" }
  }
}

function Get-ReleaseUrl([string]$AssetName) {
  if ($releaseVersion -eq 'latest') {
    return "$releaseBaseUrl/latest/download/$AssetName"
  }
  return "$releaseBaseUrl/download/$releaseVersion/$AssetName"
}

function Save-Asset([string]$AssetName, [string]$Destination) {
  $url = Get-ReleaseUrl $AssetName
  # A file:// base URL serves a release staged on disk, for an air-gapped install or a test.
  # Invoke-WebRequest has no file transport, so copy it directly; a missing file is not retried.
  if (([uri]$url).IsFile) {
    Copy-Item -LiteralPath ([uri]$url).LocalPath -Destination $Destination -Force
    return
  }

  $lastError = $null
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $Destination -UseBasicParsing
      return
    } catch {
      $lastError = $_
      # An asset the release does not have will never appear; only a transient failure is worth a retry.
      if ($_.Exception.Response -and "$($_.Exception.Response.StatusCode)" -eq 'NotFound') {
        break
      }
      Start-Sleep -Seconds ($attempt * 2)
    }
  }
  throw $lastError
}

# Returns the local cosign release as a comparable integer, or $null when it reports no version.
function Get-CosignRelease {
  $cosign = Invoke-Native 'cosign' @('version')
  $match = [regex]::Match($cosign.Output, '(?m)^GitVersion:\s*v?(\d+)\.(\d+)\.(\d+)')
  if (-not $match.Success) {
    return $null
  }
  return [int]$match.Groups[1].Value * 1000000 + [int]$match.Groups[2].Value * 1000 + [int]$match.Groups[3].Value
}

# Verifies the SHA256SUMS signature when cosign is installed. Windows has no cosign by default, so
# this stays best-effort; the checksum check itself always runs.
function Test-ChecksumsSignature([string]$ChecksumsFile, [string]$WorkDirectory) {
  if (-not (Get-Command cosign -ErrorAction SilentlyContinue)) {
    Write-Info "cosign not found; skipping signature verification of $checksumsAsset (checksum is still verified)"
    return
  }

  # The release bundles use the Sigstore bundle format: cosign 2.4.2 reads it, 2.4.1 needs a flag,
  # older releases cannot.
  $bundleFormatOption = @()
  $cosignRelease = Get-CosignRelease
  if ($null -ne $cosignRelease) {
    if ($cosignRelease -lt 2004001) {
      Write-Note "this cosign cannot verify the release signature (needs 2.4.1 or later); skipping signature verification of $checksumsAsset (checksum is still verified)"
      return
    }
    if ($cosignRelease -lt 2004002) {
      $bundleFormatOption = @('--new-bundle-format')
    }
  }

  $bundle = Join-Path $WorkDirectory "$checksumsAsset.sigstore.json"
  try {
    Save-Asset "$checksumsAsset.sigstore.json" $bundle
  } catch {
    # A release published before the signing workflow ran has no bundle; the checksum still gates it.
    Write-Note "no signature bundle published for ${checksumsAsset}; skipping signature verification"
    return
  }

  $cosign = Invoke-Native 'cosign' (@('verify-blob') + $bundleFormatOption + @(
      '--bundle', $bundle,
      '--certificate-identity', $signerIdentity,
      '--certificate-oidc-issuer', $oidcIssuer,
      $ChecksumsFile))
  if ($cosign.ExitCode -ne 0) {
    throw "signature verification of ${checksumsAsset} failed: $($cosign.Output)"
  }
  Write-Info "verified the signature of $checksumsAsset"
}

# Downloads SHA256SUMS and the binary, and returns the path of the verified download.
function Save-VerifiedBinary([string]$AssetName, [string]$WorkDirectory) {
  Write-Info "downloading $AssetName ($releaseVersion)"

  $checksumsFile = Join-Path $WorkDirectory $checksumsAsset
  try {
    Save-Asset $checksumsAsset $checksumsFile
  } catch {
    throw "could not download $checksumsAsset for release ${releaseVersion}: $($_.Exception.Message)"
  }
  Test-ChecksumsSignature $checksumsFile $WorkDirectory

  # sha256sum writes "<hash>  <name>" in text mode and "<hash> *<name>" in binary mode.
  $checksumMatch = [regex]::Match(
    (Get-Content -LiteralPath $checksumsFile -Raw),
    "(?m)^([0-9a-fA-F]{64})\s+\*?$([regex]::Escape($AssetName))\s*$")
  if (-not $checksumMatch.Success) {
    throw "release $releaseVersion has no Solo binary for this machine ($AssetName); $npmFallback"
  }

  $downloaded = Join-Path $WorkDirectory 'solo.exe'
  try {
    Save-Asset $AssetName $downloaded
  } catch {
    throw "could not download $AssetName for release ${releaseVersion}: $($_.Exception.Message)"
  }

  $actualSha256 = (Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash
  if ($actualSha256 -ne $checksumMatch.Groups[1].Value) {
    throw "checksum mismatch for ${AssetName}: expected $($checksumMatch.Groups[1].Value), got $actualSha256"
  }
  Write-Info "verified the checksum of $AssetName"

  return $downloaded
}

# Reports the binary's Authenticode signature. Until the certificate is provisioned
# (hiero-ledger/solo#5867) the published binary carries none, so an absent signature is a warning
# and a broken one is fatal.
function Test-BinarySignature([string]$BinaryPath, [string]$AssetName) {
  $signature = Get-AuthenticodeSignature -LiteralPath $BinaryPath
  switch ($signature.Status) {
    'Valid' {
      Write-Info "verified the Authenticode signature of $AssetName ($($signature.SignerCertificate.Subject))"
    }
    'NotSigned' {
      Write-Note "$AssetName is not Authenticode signed yet; it is verified by checksum only, and Windows SmartScreen may warn about it"
    }
    default {
      throw "the Authenticode signature of $AssetName is not valid ($($signature.Status)); do not run it"
    }
  }
}

# Installs the verified download and returns the installed path.
function Install-Binary([string]$DownloadedBinary, [string]$InstallDirectory) {
  $target = Join-Path $InstallDirectory 'solo.exe'
  New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
  $staged = Join-Path $InstallDirectory ".solo.install.$PID.exe"
  Copy-Item -LiteralPath $DownloadedBinary -Destination $staged -Force

  try {
    # Run the new binary before it replaces anything, so one that cannot run here leaves an existing
    # install intact.
    $solo = Invoke-Native $staged @('--version')
    if ($solo.ExitCode -ne 0) {
      throw "the downloaded solo binary does not run on this system: $($solo.Output)"
    }
    # Windows keeps a running executable locked, so a reinstall while solo is running lands here.
    try {
      Move-Item -LiteralPath $staged -Destination $target -Force
    } catch {
      throw "could not replace ${target}: $($_.Exception.Message). Close any running solo and try again."
    }
  } finally {
    if (Test-Path -LiteralPath $staged) {
      Remove-Item -LiteralPath $staged -Force
    }
  }

  # solo --version prints a banner; keep only the value of its "Version :" line.
  $versionMatch = [regex]::Match($solo.Output, '(?m)^Version\s*:\s*(\S+)')
  $installedVersion = if ($versionMatch.Success) { $versionMatch.Groups[1].Value } else { $releaseVersion }
  Write-Info "installed solo $installedVersion to $target"
  return $target
}

# Appends the install directory to the user PATH and reports whether it added it. The registry value
# kind is preserved: .NET's SetEnvironmentVariable rewrites Path as REG_SZ, which stops any
# %USERPROFILE% already in it from expanding.
function Add-UserPathEntry([string]$InstallDirectory) {
  # CreateSubKey, not OpenSubKey: it opens the key for writing and returns a usable key rather than
  # $null on the rare profile that has no Environment key yet.
  $environmentKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
  try {
    $currentPath = [string]$environmentKey.GetValue(
      'Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $entries = @($currentPath -split ';' | Where-Object {$_ -ne ''})
    foreach ($entry in $entries) {
      if ([Environment]::ExpandEnvironmentVariables($entry).TrimEnd('\') -eq $InstallDirectory.TrimEnd('\')) {
        return $false
      }
    }

    # A user with no Path value of their own gets one that can hold %USERPROFILE%-style entries.
    $valueKind = if ($entries.Count -gt 0) {
      $environmentKey.GetValueKind('Path')
    } else {
      [Microsoft.Win32.RegistryValueKind]::ExpandString
    }
    $environmentKey.SetValue('Path', ($entries + $InstallDirectory) -join ';', $valueKind)
    return $true
  } finally {
    $environmentKey.Dispose()
  }
}

function Set-SoloPath([string]$InstallDirectory) {
  # Only the default directory is added to the user PATH; a -Prefix directory is the caller's to manage.
  if ($InstallDirectory -eq $defaultInstallDirectory) {
    if (Add-UserPathEntry $InstallDirectory) {
      Write-Info "added $InstallDirectory to your user PATH"
    }
  } else {
    Write-Info "$InstallDirectory is not added to your PATH; add it yourself to run solo by name"
  }

  Write-Info 'open a new terminal, or run this to use solo in this one:'
  Write-Host "`n  `$env:Path += ';$InstallDirectory'`n"
}

# The install directory is appended to PATH, so an earlier solo (for example from npm) keeps winning.
function Write-ShadowWarning([string]$Target) {
  $resolved = (Get-Command solo -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if ($resolved -and $resolved -ne $Target) {
    Write-Note "$resolved comes before $Target on your PATH; remove it (npm: npm uninstall -g @hiero-ledger/solo) to use this install"
  }
}

function Initialize-ImageCache([string]$Target) {
  if (-not $WithImageCache) {
    Write-Info "run 'solo cache image pull' before your first deployment to speed it up"
    return
  }

  Write-Info 'pre-pulling the container images Solo deploys'
  & $Target cache image pull --quiet-mode
  if ($LASTEXITCODE -ne 0) {
    Write-Note "the image cache was not fully populated; run 'solo cache image pull' to retry"
  }
}

function Install-Solo {
  if ($Help) {
    Show-Usage
    return
  }

  # Get-FileHash and RuntimeInformation both need Windows PowerShell 5.1 or later.
  if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw "this installer needs Windows PowerShell 5.1 or later (found $($PSVersionTable.PSVersion)); $npmFallback"
  }

  $installDirectory = if ($Prefix) {
    $Prefix.TrimEnd('\')
  } elseif ($env:SOLO_INSTALL_DIR) {
    $env:SOLO_INSTALL_DIR.TrimEnd('\')
  } else {
    $defaultInstallDirectory
  }

  $assetName = Get-AssetName
  $workDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "solo-install-$PID"
  New-Item -ItemType Directory -Path $workDirectory -Force | Out-Null
  try {
    $downloadedBinary = Save-VerifiedBinary $assetName $workDirectory
    Test-BinarySignature $downloadedBinary $assetName
    $target = Install-Binary $downloadedBinary $installDirectory
    Set-SoloPath $installDirectory
    Write-ShadowWarning $target
    Initialize-ImageCache $target
    Write-Info 'done'
  } finally {
    Remove-Item -LiteralPath $workDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Everything runs from Install-Solo so a partially downloaded script executes nothing.
Install-Solo
