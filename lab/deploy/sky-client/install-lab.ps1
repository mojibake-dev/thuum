# Apply C:\sky-lab to the clone's game folders, each one already carrying SKSE
# (install-layer.ps1). Idempotent. Lays the client dist, copies the lab-driver
# plugin and the two settings files into Data\Platform\Plugins, records each
# folder under C:\sky-lab\games\<version>.txt (ADR-022: one folder per game
# version, which launch.ps1 picks per run), and registers two scheduled tasks
# for the lab user: sky-lab-launch (at logon: launch.ps1) and
# sky-lab-screenshot (on demand: screenshot.ps1). With -Game it applies to that
# folder; without, to every recorded folder, or to Steam's on a clone that has
# none recorded yet. Run as an administrator inside the VM or through guest
# exec: powershell -ExecutionPolicy Bypass -File C:\sky-lab\install-lab.ps1 [-Game <dir>] [-User lab]
param([string]$Game = '', [string]$User = 'lab')
$ErrorActionPreference = 'Stop'
$lab = 'C:\sky-lab'
$records = Join-Path $lab 'games'
function Get-Recorded {
  if (Test-Path $records) { Get-ChildItem $records -Filter '*.txt' | ForEach-Object { (Get-Content $_.FullName -Raw).Trim() } }
}
function Find-SteamGame {
  $steam = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam' -ErrorAction SilentlyContinue).InstallPath
  if (-not $steam) { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath -replace '/', '\' }
  $libs = @()
  if ($steam) {
    $libs += $steam
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
      $libs += (Select-String -Path $vdf -Pattern '"path"\s+"([^"]+)"' -AllMatches).Matches |
        ForEach-Object { $_.Groups[1].Value -replace '\\\\', '\' }
    }
  }
  $found = $libs | Select-Object -Unique |
    ForEach-Object { Join-Path $_ 'steamapps\common\Skyrim Special Edition' } |
    Where-Object { Test-Path (Join-Path $_ 'SkyrimSE.exe') } | Select-Object -First 1
  if (-not $found) { throw 'Skyrim Special Edition not found in any Steam library; pass -Game' }
  $found
}
$targets = @(if ($Game) { $Game } else { Get-Recorded })
if (-not $targets) { $targets = @(Find-SteamGame) }
# A clone's identity (identity.ps1: lab-driver's client name, skymp5-client's
# profileId) lives in the two settings files in a game folder's Plugins; the
# staged copies in C:\sky-lab are the template's (c1 / 1). Keep the clone's own
# across a relay: sky-c2 came back as c1 / profile 1 after a client-dist on
# 2026-10-01 and collided with sky-c1's login. Read it from any game folder,
# the target or one recorded before, before anything is laid over Plugins:
# the client dist carries its own skymp5-client-settings.txt (profile 1), and
# reading after the dist made sky-c2 log in as profile 1 on 2026-10-02. A new
# folder (a second game version, add-game.ps1) has none of its own yet.
$identity = $null
foreach ($dir in (@($targets) + @(Get-Recorded) | Select-Object -Unique)) {
  $oldDriver = Join-Path $dir 'Data\Platform\Plugins\lab-driver-settings.txt'
  $oldClient = Join-Path $dir 'Data\Platform\Plugins\skymp5-client-settings.txt'
  if ((Test-Path $oldDriver) -and (Test-Path $oldClient)) {
    try {
      $identity = @{ client = (Get-Content $oldDriver -Raw | ConvertFrom-Json).client; profileId = (Get-Content $oldClient -Raw | ConvertFrom-Json).gameData.profileId }
      if ($identity.client -and $identity.profileId) { break }
    } catch { }
    $identity = $null
  }
}
$done = @()
foreach ($g in $targets) {
  $exe = Get-Item (Join-Path $g 'SkyrimSE.exe')
  $plugins = Join-Path $g 'Data\Platform\Plugins'
  if (-not (Test-Path (Join-Path $g 'skse64_loader.exe'))) { throw "no skse64_loader.exe in $g (run install-layer.ps1 first)" }
  # The client dist (Skyrim Platform, skymp5-client, their scripts and UI) first,
  # when `just stage-client` put it under C:\sky-lab\dist; then the lab's own files.
  $dist = Join-Path $lab 'dist\Data'
  if (Test-Path $dist) { Copy-Item (Join-Path $dist '*') (Join-Path $g 'Data') -Recurse -Force }
  if (-not (Test-Path $plugins)) { throw "no Skyrim Platform at $plugins after laying the dist" }
  # writeLogs (Skyrim Platform) needs this directory to exist; it never creates it.
  New-Item -ItemType Directory -Force -Path (Join-Path $g 'Data\Platform\Logs') | Out-Null
  foreach ($f in 'lab-driver.js', 'lab-driver-settings.txt', 'skymp5-client-settings.txt') {
    Copy-Item (Join-Path $lab $f) (Join-Path $plugins $f) -Force
  }
  if ($identity) {
    foreach ($dir in @($lab, $plugins)) {
      $d = Join-Path $dir 'lab-driver-settings.txt'
      $j = Get-Content $d -Raw | ConvertFrom-Json; $j.client = [string]$identity.client
      $j | ConvertTo-Json | Set-Content -Path $d -Encoding ASCII
      $c = Join-Path $dir 'skymp5-client-settings.txt'
      $k = Get-Content $c -Raw | ConvertFrom-Json; $k.gameData.profileId = [int]$identity.profileId
      $k | ConvertTo-Json | Set-Content -Path $c -Encoding ASCII
    }
  }
  # the version a run names: 1.7.104 for file version 1.7.104.0
  $version = (($exe.VersionInfo.FileVersion -split '\.')[0..2]) -join '.'
  New-Item -ItemType Directory -Force -Path $records | Out-Null
  Set-Content -Path (Join-Path $records ($version + '.txt')) -Value $g -NoNewline
  $done += [ordered]@{ game = $g; version = $version; exeVersion = $exe.VersionInfo.FileVersion }
}
# game-dir.txt is the folder this boot plays; launch.ps1 rewrites it at every
# logon from lab-api's answer. A first install names the folder installed.
if (-not (Test-Path (Join-Path $lab 'game-dir.txt'))) { Set-Content -Path (Join-Path $lab 'game-dir.txt') -Value $targets[0] -NoNewline }
$ps = 'powershell.exe'
$launch = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $lab\launch.ps1"
# The capture runs headless: through Windows Terminal (Windows 11's default
# console host) -WindowStyle Hidden still opened a window over the game, in
# the next capture and in front of the game's input (runs 20261003-074358 on).
# conhost --headless opens none (sky-c1, 2026-10-03: two captures, no window).
$shot = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless $ps -NoProfile -ExecutionPolicy Bypass -File $lab\screenshot.ps1"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 12) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'sky-lab-launch' -Action $launch -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $User) -Principal $principal -Settings $settings -Force | Out-Null
Register-ScheduledTask -TaskName 'sky-lab-screenshot' -Action $shot -Principal $principal -Settings $settings -Force | Out-Null
@{ games = $done; gameDir = (Get-Content (Join-Path $lab 'game-dir.txt') -Raw).Trim(); tasks = @('sky-lab-launch', 'sky-lab-screenshot'); identity = $(if ($identity) { 'kept ' + $identity.client + '/' + $identity.profileId } else { 'template' }) } | ConvertTo-Json -Compress -Depth 4
