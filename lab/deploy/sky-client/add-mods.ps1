# The lab's mod layer (docs/MODS.md, `just persist-mods`) on this clone. sky-srv
# serves persist's mods/ inside VLAN 70 (`just client-mods`): SHA256SUMS lists
# every file as "<hash>  <mod>/<path inside Data>", plugins.txt the plugins to
# enable in load order. Each file goes into the Data folder of every game
# folder the clone records (C:\sky-lab\games\<version>.txt, ADR-022), or,
# for a mod directory named <mod>@<version>, only that version's (RaceMenu
# loads on 1.6.1170 only, ADR-025), and is checked against its hash; a file
# already in place with the right hash is kept. Then the lab user's
# plugins.txt, which every game folder shares (it lives in the user's AppData),
# lists exactly these plugins, enabled, under the game's own comment lines; a
# game skips a listed plugin its Data folder lacks. A file an earlier render laid
# and this one dropped is deleted, by hash, against the clone's record of its
# last lay (C:\sky-lab\mods.sums) and the render's PREVIOUS.sums (below).
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
$folders = @(Get-ChildItem (Join-Path $lab 'games') -Filter '*.txt' | ForEach-Object {
    [pscustomobject]@{ Version = $_.BaseName; Dir = (Get-Content $_.FullName -Raw).Trim() } } |
  Where-Object { $_.Dir -and (Test-Path (Join-Path $_.Dir 'SkyrimSE.exe')) })
if (-not $folders) { throw "no game folder recorded in $lab\games" }
$games = @($folders | ForEach-Object { $_.Dir })
$r = [ordered]@{ games = $games; fetched = 0; kept = 0; bytes = 0; pruned = 0; unpruned = 0; plugins = @() }
# where an entry lands in a game folder, or $null when its mod is scoped to another version (<mod>@<version>)
function Get-DataPath([string]$rel, $folder) {
  $parts = $rel -split '/'
  if ($parts.Count -lt 2) { throw "unexpected entry $rel" }
  $scope = ($parts[0] -split '@', 2)[1]
  if ($scope -and $scope -ne $folder.Version) { return $null }
  Join-Path (Join-Path $folder.Dir 'Data') (($parts[1..($parts.Count - 1)]) -join '\')
}
$sums = ((& curl.exe -sS -f "$From/SHA256SUMS") -join "`n") -split "`n" | Where-Object { $_.Trim() }
if (-not $sums) { throw "no SHA256SUMS at $From" }
$entries = $sums | ForEach-Object { [pscustomobject]@{ Hash = $_.Substring(0, 64).ToLower(); Rel = $_.Substring(64).TrimStart(' ', '*').Trim() } }
foreach ($folder in $folders) {
  foreach ($e in $entries) {
    $dest = Get-DataPath $e.Rel $folder
    if (-not $dest) { continue }
    $parts = $e.Rel -split '/'
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
# What an earlier render laid and this one dropped goes, the way a mod manager purges
# what it deployed (Vortex's vortex.deployment.json). The earlier entries are this
# clone's record of its last lay (written at the end) and the render's PREVIOUS.sums
# (persist-mods: the host's manifest before this render, for a clone laid before the
# record existed). A file goes only when its hash is the one that render laid; anything
# else at its path stays, counted; directories stay. Before 2026-10-27 nothing was ever
# removed, and D37's DeathDropOverhaul.dll, out of the layer, would still have loaded.
$record = Join-Path $lab 'mods.sums'
$earlier = @()
if (Test-Path $record) { $earlier += @(Get-Content $record) }
$prev = Join-Path $lab 'mods-previous.sums'
if (Test-Path $prev) { Remove-Item -Force $prev }
& curl.exe -s -f -o $prev "$From/PREVIOUS.sums"
if ($LASTEXITCODE -eq 0 -and (Test-Path $prev)) { $earlier += @(Get-Content $prev) }
$gone = @($earlier | Where-Object { $_.Trim() } | ForEach-Object { [pscustomobject]@{ Hash = $_.Substring(0, 64).ToLower(); Rel = $_.Substring(64).TrimStart(' ', '*').Trim() } })
foreach ($folder in $folders) {
  $now = @{}
  foreach ($e in $entries) { $d = Get-DataPath $e.Rel $folder; if ($d) { $now[$d.ToLower()] = $true } }
  foreach ($e in $gone) {
    $d = Get-DataPath $e.Rel $folder
    if (-not $d -or $now.ContainsKey($d.ToLower()) -or -not (Test-Path $d)) { continue }
    if ((Get-FileHash -Algorithm SHA256 $d).Hash.ToLower() -eq $e.Hash) { Remove-Item -Force $d; $r.pruned++ } else { $r.unpruned++ }
  }
}
# plugins.txt: "*Name" enables a plugin; the game's own comment lines stay and
# nothing else does, so a plugin an earlier layer enabled and this one dropped
# goes (keeping every line the list did not name left such a plugin enabled on
# a stacked snapshot, 2026-10-19)
$plugins = @(((& curl.exe -sS -f "$From/plugins.txt") -join "`n") -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (-not $plugins) { throw "no plugins.txt at $From" }
$lines = @()
if (Test-Path $PluginsTxt) {
  $lines = @(Get-Content $PluginsTxt | Where-Object { $_.TrimStart().StartsWith('#') })
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $PluginsTxt) | Out-Null
}
$lines += $plugins | ForEach-Object { '*' + $_ }
[IO.File]::WriteAllLines($PluginsTxt, [string[]]$lines)
$r.plugins = $plugins
# this lay's record, the next lay's earlier entries
[IO.File]::WriteAllLines($record, [string[]]$sums)
$r | ConvertTo-Json -Compress
