# Lay the script-extender layer into the game from C:\sky-lab: SKSE (if a
# C:\sky-lab\skse directory holds an unpacked SKSE archive) and every
# versionlib-*.bin under C:\sky-lab\addrlib into Data\SKSE\Plugins. Idempotent.
# Run through guest exec after Steam has installed the game:
#   powershell -ExecutionPolicy Bypass -File C:\sky-lab\install-layer.ps1 [-Game <dir>]
param([string]$Game = '')
$ErrorActionPreference = 'Stop'
$lab = 'C:\sky-lab'
if (-not $Game) {
  $steam = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam' -ErrorAction SilentlyContinue).InstallPath
  $libs = @()
  if ($steam) {
    $libs += $steam
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
      $libs += (Select-String -Path $vdf -Pattern '"path"\s+"([^"]+)"' -AllMatches).Matches |
        ForEach-Object { $_.Groups[1].Value -replace '\\\\', '\' }
    }
  }
  $Game = $libs | Select-Object -Unique |
    ForEach-Object { Join-Path $_ 'steamapps\common\Skyrim Special Edition' } |
    Where-Object { Test-Path (Join-Path $_ 'SkyrimSE.exe') } | Select-Object -First 1
  if (-not $Game) { throw 'Skyrim Special Edition not found in any Steam library; pass -Game' }
}
$exe = Get-Item (Join-Path $Game 'SkyrimSE.exe')
$result = [ordered]@{ game = $Game; exeVersion = $exe.VersionInfo.FileVersion; skse = 'not staged'; versionlibs = @() }
$skse = Join-Path $lab 'skse'
if (Test-Path $skse) {
  # the archive unpacks to one directory (skse64_2_03_01\) holding the loader, the dll and Data\
  $root = Get-ChildItem $skse -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'skse64_loader.exe') } | Select-Object -First 1
  if (-not $root -and (Test-Path (Join-Path $skse 'skse64_loader.exe'))) { $root = Get-Item $skse }
  if (-not $root) { throw "no skse64_loader.exe under $skse" }
  Copy-Item (Join-Path $root.FullName '*.exe') $Game -Force
  Copy-Item (Join-Path $root.FullName '*.dll') $Game -Force
  if (Test-Path (Join-Path $root.FullName 'Data')) { Copy-Item (Join-Path $root.FullName 'Data') $Game -Recurse -Force }
  $result.skse = (Get-ChildItem $Game -Filter 'skse64_*.dll' | ForEach-Object { $_.Name }) -join ','
}
$plugins = Join-Path $Game 'Data\SKSE\Plugins'
New-Item -ItemType Directory -Force -Path $plugins | Out-Null
$addr = Join-Path $lab 'addrlib'
if (Test-Path $addr) {
  Get-ChildItem $addr -Recurse -Filter 'versionlib-*.bin' | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $plugins $_.Name) -Force
    $result.versionlibs += $_.Name
  }
}
$result | ConvertTo-Json -Compress
