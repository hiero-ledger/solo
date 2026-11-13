# SPDX-License-Identifier: Apache-2.0
#
# Fails unless the one-shot mirror node ingests at least one new block within the polling window.
#
# The mirror reads blocks from the block node, so a mirror that stops advancing usually means the
# block node stopped storing them (see hiero-ledger/solo#6427). Checking this at each stage of a test
# reports a stall at the step where it happened, instead of at whichever later step first looks.
#
# Solo records the mirror ingress and the explorer on the same local port (both 38082), and
# refreshing the forwards stops one to start the other, so that port cannot be trusted to reach the
# mirror. Open a dedicated forward straight to the mirror REST service instead.

param(
  # Describes when the check runs, for example 'before Docker restart'. Used in log and error messages.
  [Parameter(Mandatory = $true)]
  [string]$Stage,

  [int]$Port = 38090
)

$ErrorActionPreference = 'Stop'

$mirrorForward = Start-Process -FilePath kubectl -WindowStyle Hidden -PassThru `
  -ArgumentList @('--context', 'kind-solo-cluster', '--namespace', 'one-shot', 'port-forward', 'svc/mirror-1-rest', "${Port}:80")
try {
  $script:lastMirrorError = ''
  function Get-LatestMirrorBlock() {
    for ($try = 1; $try -le 30; $try++) {
      try {
        return (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v1/blocks?limit=1&order=desc" -TimeoutSec 10).blocks[0].number
      } catch {
        # best-effort: the forward or mirror REST may still be settling; keep the last error to report it
        $script:lastMirrorError = $_.Exception.Message
        Start-Sleep -Seconds 5
      }
    }
    throw "Mirror REST via svc/mirror-1-rest on port $Port never answered /api/v1/blocks ${Stage}: $script:lastMirrorError"
  }

  $firstBlock = Get-LatestMirrorBlock
  $latestBlock = $firstBlock
  $advanced = $false
  for ($attempt = 1; $attempt -le 30 -and -not $advanced; $attempt++) {
    Start-Sleep -Seconds 5
    $latestBlock = Get-LatestMirrorBlock
    $advanced = $latestBlock -gt $firstBlock
  }
  if (-not $advanced) {
    throw "Mirror did not ingest new blocks $Stage (stuck at block $firstBlock). The mirror reads blocks from the block node; check the block node log for a stalled publisher stream."
  }
  Write-Host "Mirror advanced from block $firstBlock to $latestBlock $Stage"
} finally {
  if (-not $mirrorForward.HasExited) { Stop-Process -Id $mirrorForward.Id -Force }
}
