# Probe a Windows Steam client for Skyrim Special Edition and print one JSON object:
# the install dir, the exe's FileVersion, and name/path/size/sha256 for SkyrimSE.exe
# and the five master files. Read-only. Run by lab/tools/persist-game.sh over ssh.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # no CLIXML progress records on stderr
$steam = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam' -ErrorAction SilentlyContinue).InstallPath
if (-not $steam) { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath -replace '/', '\' }
$libs = @($steam)
$vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
if (Test-Path $vdf) {
  $libs += (Select-String -Path $vdf -Pattern '"path"\s+"([^"]+)"' -AllMatches).Matches |
    ForEach-Object { $_.Groups[1].Value -replace '\\\\', '\' }
}
$game = $libs | Select-Object -Unique |
  ForEach-Object { Join-Path $_ 'steamapps\common\Skyrim Special Edition' } |
  Where-Object { Test-Path (Join-Path $_ 'SkyrimSE.exe') } | Select-Object -First 1
if (-not $game) { throw "Skyrim Special Edition not found under: $($libs -join '; ')" }
$rel = @('SkyrimSE.exe') + @('Skyrim', 'Update', 'Dawnguard', 'HearthFires', 'Dragonborn' | ForEach-Object { "Data\$_.esm" })
$out = [ordered]@{
  game    = $game
  version = (Get-Item (Join-Path $game 'SkyrimSE.exe')).VersionInfo.FileVersion
  files   = @()
}
foreach ($r in $rel) {
  $p = Join-Path $game $r
  $out.files += [ordered]@{
    name   = [IO.Path]::GetFileName($p)
    path   = $p
    size   = (Get-Item $p).Length
    sha256 = (Get-FileHash -Algorithm SHA256 -Path $p).Hash.ToLower()
  }
}
$out | ConvertTo-Json -Compress -Depth 5
