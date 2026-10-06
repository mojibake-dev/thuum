# The lab's mod layer (docs/MODS.md, `just persist-mods`) on this clone. sky-srv
# serves persist's mods/ inside VLAN 70 (`just client-mods`): SHA256SUMS lists
# every file as "<hash>  <mod>/<path inside Data>", plugins.txt the plugins to
# enable in load order. Each file goes into the Data folder of every game
# folder the clone records (C:\sky-lab\games\<version>.txt, ADR-022) and is
# checked against its hash; a file already in place with the right hash is
# kept. Then the plugins are enabled in the lab user's plugins.txt, which every
# game folder shares (it lives in the user's AppData), after what it lists.
# The engine loads them after the masters and the Creation Club plugins
# Skyrim.ccc lists; the server's loadOrder holds the same full-slot plugins in
# the same order (docs/LAB.md), so form ids agree.
#
# Run as SYSTEM through a one-shot task (client-mods.sh):
#   powershell -ExecutionPolicy Bypass -File C:\sky-lab\add-mods.ps1 -From http://10.10.70.10:8767
param(
  [Parameter(Mandatory = $true)][string]$From,
  [string]$PluginsTxt = 'C:\Users\lab\AppData\Local\Skyrim Special Edition\plugins.txt'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$lab = 'C:\sky-lab'
$games = @(Get-ChildItem (Join-Path $lab 'games') -Filter '*.txt' | ForEach-Object { (Get-Content $_.FullName -Raw).Trim() } |
  Where-Object { $_ -and (Test-Path (Join-Path $_ 'SkyrimSE.exe')) })
if (-not $games) { throw "no game folder recorded in $lab\games" }
$r = [ordered]@{ games = $games; fetched = 0; kept = 0; bytes = 0; plugins = @() }
$sums = ((& curl.exe -sS -f "$From/SHA256SUMS") -join "`n") -split "`n" | Where-Object { $_.Trim() }
if (-not $sums) { throw "no SHA256SUMS at $From" }
$entries = $sums | ForEach-Object { [pscustomobject]@{ Hash = $_.Substring(0, 64).ToLower(); Rel = $_.Substring(64).TrimStart(' ', '*').Trim() } }
foreach ($game in $games) {
  $data = Join-Path $game 'Data'
  foreach ($e in $entries) {
    $parts = $e.Rel -split '/'
    if ($parts.Count -lt 2) { throw "unexpected entry $($e.Rel)" }
    $dest = Join-Path $data (($parts[1..($parts.Count - 1)]) -join '\')
    if ((Test-Path $dest) -and ((Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower() -eq $e.Hash)) { $r.kept++; continue }
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    $url = $From + '/' + (($parts | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
    & curl.exe -sS -f -o $dest $url
    if ($LASTEXITCODE -ne 0) { throw "curl exited $LASTEXITCODE for $($e.Rel)" }
    $got = (Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower()
    if ($got -ne $e.Hash) { throw "hash mismatch for $($e.Rel): $got, want $($e.Hash)" }
    $r.fetched++; $r.bytes += (Get-Item $dest).Length
  }
}
# plugins.txt: "*Name" enables a plugin; the game's own header lines stay
$plugins = @(((& curl.exe -sS -f "$From/plugins.txt") -join "`n") -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (-not $plugins) { throw "no plugins.txt at $From" }
$lines = @()
if (Test-Path $PluginsTxt) {
  $lines = @(Get-Content $PluginsTxt | Where-Object { $plugins -notcontains $_.TrimStart('*').Trim() })
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $PluginsTxt) | Out-Null
}
$lines += $plugins | ForEach-Object { '*' + $_ }
[IO.File]::WriteAllLines($PluginsTxt, [string[]]$lines)
$r.plugins = $plugins
$r | ConvertTo-Json -Compress
