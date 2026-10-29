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
# game skips a listed plugin its Data folder lacks.
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
$r = [ordered]@{ games = $games; fetched = 0; kept = 0; bytes = 0; plugins = @() }
$sums = ((& curl.exe -sS -f "$From/SHA256SUMS") -join "`n") -split "`n" | Where-Object { $_.Trim() }
if (-not $sums) { throw "no SHA256SUMS at $From" }
$entries = $sums | ForEach-Object { [pscustomobject]@{ Hash = $_.Substring(0, 64).ToLower(); Rel = $_.Substring(64).TrimStart(' ', '*').Trim() } }
foreach ($folder in $folders) {
  $data = Join-Path $folder.Dir 'Data'
  foreach ($e in $entries) {
    $parts = $e.Rel -split '/'
    if ($parts.Count -lt 2) { throw "unexpected entry $($e.Rel)" }
    $scope = ($parts[0] -split '@', 2)[1]
    if ($scope -and $scope -ne $folder.Version) { continue }
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
# game-ini.tsv (lab/layer/game-ini.tsv): the game's own ini keys every seat sets, "file section key value why" rows,
# written into the lab user's Documents inis under their sections; a missing section is appended, a present key is
# rewritten in place, every other line stays (the file is the game's and the launcher's). An older tree without the
# file changes nothing.
$iniDir = 'C:\Users\lab\Documents\My Games\Skyrim Special Edition'
$gameIni = (& curl.exe -sS -f "$From/game-ini.tsv") -join "`n"
$r.gameIni = @()
if ($LASTEXITCODE -eq 0 -and $gameIni) {
  $rows = @($gameIni -split "`n" | Where-Object { $_.Trim() -and -not $_.StartsWith('#') } | Select-Object -Skip 1 | ForEach-Object {
      $f = $_ -split "`t"; [pscustomobject]@{ File = $f[0]; Section = $f[1]; Key = $f[2]; Value = $f[3] } })
  foreach ($file in ($rows | ForEach-Object { $_.File } | Sort-Object -Unique)) {
    $path = Join-Path $iniDir $file
    $lines = @(); if (Test-Path $path) { $lines = @(Get-Content $path) }
    foreach ($row in ($rows | Where-Object { $_.File -eq $file })) {
      $header = '[' + $row.Section + ']'
      $start = [array]::IndexOf($lines, $header)
      if ($start -lt 0) { $lines += @($header); $start = $lines.Count - 1 }
      $end = $lines.Count
      for ($i = $start + 1; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^\[') { $end = $i; break } }
      $hit = -1
      for ($i = $start + 1; $i -lt $end; $i++) { if ($lines[$i] -match ('^\s*' + [regex]::Escape($row.Key) + '\s*=')) { $hit = $i; break } }
      $line = $row.Key + '=' + $row.Value
      if ($hit -ge 0) { $lines[$hit] = $line } else { $lines = @($lines[0..$start]) + @($line) + @(if ($start + 1 -lt $lines.Count) { $lines[($start + 1)..($lines.Count - 1)] }) }
      $r.gameIni += ($file + ' ' + $header + ' ' + $line)
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
    Set-Content -Path $path -Value $lines -Encoding ASCII
  }
}
$r | ConvertTo-Json -Compress
