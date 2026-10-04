# Give the clone a game folder for a second Skyrim version (ADR-022), built
# from Steam's own depots for that build, which persist keeps under
# game/<version>/ and sky-srv serves inside VLAN 70 (`just client-game`).
#
# The depots are the complete game at that build: every archive, the masters,
# the exe and steam_api64.dll (1.6.1170: depots 489831, 489832 and 489833,
# 46 files). Each file SHA256SUMS lists is fetched into the folder without its
# depot_<id>\ prefix, in depot order, the order the Wildlander downgrade guide
# lays them over a game folder, and checked against its hash; a file already
# in place with the right hash is kept. Then the folder gets the mod layer the
# way every game folder does: install-layer.ps1 (that version's SKSE from
# C:\sky-lab\skse-<version>, the Address Library), install-lab.ps1 (client
# dist, lab-driver, the clone's identity, the record games\<version>.txt that
# launch.ps1 picks per run) and controlmap.ps1.
#
# Steam never sees this folder. The game is started from it through the SKSE
# loader with Steam running, as Wabbajack modlists start their "Stock Game"
# copy. Run as SYSTEM through the guest agent:
#   powershell -ExecutionPolicy Bypass -File C:\sky-lab\add-game.ps1 -Version 1.6.1170 -From http://10.10.70.10:8766
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$From,
  [string]$Dir = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$lab = 'C:\sky-lab'
if (-not $Dir) { $Dir = 'C:\Games\Skyrim Special Edition ' + $Version }
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
# The lab user plays from here and Skyrim Platform writes its logs under
# Data\Platform: users may modify the folder, as they may Steam's own.
& icacls.exe $Dir /grant '*S-1-5-32-545:(OI)(CI)M' /T /Q | Out-Null
$r = [ordered]@{ dir = $Dir; fetched = 0; kept = 0; bytes = 0 }
$sums = ((& curl.exe -sS -f "$From/SHA256SUMS") -join "`n") -split "`n" | Where-Object { $_.Trim() }
if (-not $sums) { throw "no SHA256SUMS at $From" }
# depot_489831/... sorts before depot_489832/... before depot_489833/...
$entries = $sums | ForEach-Object { [pscustomobject]@{ Hash = $_.Substring(0, 64).ToLower(); Rel = $_.Substring(64).TrimStart(' ', '*').Trim() } } | Sort-Object Rel
foreach ($e in $entries) {
  $parts = $e.Rel -split '/'
  if ($parts.Count -lt 2 -or $parts[0] -notmatch '^depot_\d+$') { throw "unexpected entry $($e.Rel)" }
  $dest = Join-Path $Dir (($parts[1..($parts.Count - 1)]) -join '\')
  if ((Test-Path $dest) -and ((Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower() -eq $e.Hash)) { $r.kept++; continue }
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  $url = $From + '/' + (($parts | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
  & curl.exe -sS -f -o $dest $url
  if ($LASTEXITCODE -ne 0) { throw "curl exited $LASTEXITCODE for $($e.Rel)" }
  $got = (Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower()
  if ($got -ne $e.Hash) { throw "hash mismatch for $($e.Rel): $got, want $($e.Hash)" }
  $r.fetched++; $r.bytes += (Get-Item $dest).Length
}
$exe = (Get-Item (Join-Path $Dir 'SkyrimSE.exe')).VersionInfo.FileVersion
if ($exe -ne $Version -and -not $exe.StartsWith($Version + '.')) { throw "SkyrimSE.exe in $Dir is $exe, not $Version" }
$r.exe = $exe
$skse = Join-Path $lab ('skse-' + $Version)
if (-not (Test-Path $skse)) { throw "no SKSE for $Version at $skse (just stage-client)" }
$r.layer = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $lab 'install-layer.ps1') -Game $Dir -Skse $skse | Select-Object -Last 1)
$r.lab = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $lab 'install-lab.ps1') -Game $Dir | Select-Object -Last 1)
$r.controlmap = ((& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $lab 'controlmap.ps1') -Game $Dir) -join ' | ')
$r | ConvertTo-Json -Compress
