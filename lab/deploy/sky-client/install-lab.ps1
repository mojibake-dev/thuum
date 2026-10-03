# Apply C:\sky-lab to a Skyrim SE install that already carries SKSE and Skyrim
# Platform (Eli's layer: game 1.6.1170, SKSE 2.2.6, SP). Idempotent. Copies the
# lab-driver plugin and the two settings files into Data\Platform\Plugins,
# records the game directory, and registers two scheduled tasks for the lab
# user: sky-lab-launch (at logon: launch.ps1) and sky-lab-screenshot
# (on demand: screenshot.ps1). Run as an administrator inside the VM or through
# guest exec: powershell -ExecutionPolicy Bypass -File C:\sky-lab\install-lab.ps1 [-Game <dir>] [-User lab]
param([string]$Game = '', [string]$User = 'lab')
$ErrorActionPreference = 'Stop'
$lab = 'C:\sky-lab'
if (-not $Game) {
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
  $Game = $libs | Select-Object -Unique |
    ForEach-Object { Join-Path $_ 'steamapps\common\Skyrim Special Edition' } |
    Where-Object { Test-Path (Join-Path $_ 'SkyrimSE.exe') } | Select-Object -First 1
  if (-not $Game) { throw 'Skyrim Special Edition not found in any Steam library; pass -Game' }
}
$exe = Get-Item (Join-Path $Game 'SkyrimSE.exe')
$plugins = Join-Path $Game 'Data\Platform\Plugins'
if (-not (Test-Path (Join-Path $Game 'skse64_loader.exe'))) { throw "no skse64_loader.exe in $Game (run install-layer.ps1 first)" }
# A clone's identity (identity.ps1: lab-driver's client name, skymp5-client's
# profileId) lives in the two settings files already in Plugins; the staged
# copies are the template's (c1 / 1). Keep the clone's own across a relay:
# sky-c2 came back as c1 / profile 1 after a client-dist on 2026-10-01 and
# collided with sky-c1's login. Read it before anything is laid over Plugins:
# the client dist carries its own skymp5-client-settings.txt (profile 1), and
# reading after the dist made sky-c2 log in as profile 1 on 2026-10-02.
$identity = $null
$oldDriver = Join-Path $plugins 'lab-driver-settings.txt'
$oldClient = Join-Path $plugins 'skymp5-client-settings.txt'
if ((Test-Path $oldDriver) -and (Test-Path $oldClient)) {
  try {
    $identity = @{ client = (Get-Content $oldDriver -Raw | ConvertFrom-Json).client; profileId = (Get-Content $oldClient -Raw | ConvertFrom-Json).gameData.profileId }
  } catch { $identity = $null }
}
# The client dist (Skyrim Platform, skymp5-client, their scripts and UI) first,
# when `just stage-client` put it under C:\sky-lab\dist; then the lab's own files.
$dist = Join-Path $lab 'dist\Data'
if (Test-Path $dist) { Copy-Item (Join-Path $dist '*') (Join-Path $Game 'Data') -Recurse -Force }
if (-not (Test-Path $plugins)) { throw "no Skyrim Platform at $plugins after laying the dist" }
# writeLogs (Skyrim Platform) needs this directory to exist; it never creates it.
New-Item -ItemType Directory -Force -Path (Join-Path $Game 'Data\Platform\Logs') | Out-Null
foreach ($f in 'lab-driver.js', 'lab-driver-settings.txt', 'skymp5-client-settings.txt') {
  Copy-Item (Join-Path $lab $f) (Join-Path $plugins $f) -Force
}
if ($identity -and $identity.client -and $identity.profileId) {
  foreach ($dir in @($lab, $plugins)) {
    $d = Join-Path $dir 'lab-driver-settings.txt'
    $j = Get-Content $d -Raw | ConvertFrom-Json; $j.client = [string]$identity.client
    $j | ConvertTo-Json | Set-Content -Path $d -Encoding ASCII
    $c = Join-Path $dir 'skymp5-client-settings.txt'
    $k = Get-Content $c -Raw | ConvertFrom-Json; $k.gameData.profileId = [int]$identity.profileId
    $k | ConvertTo-Json | Set-Content -Path $c -Encoding ASCII
  }
}
Set-Content -Path (Join-Path $lab 'game-dir.txt') -Value $Game -NoNewline
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
@{ game = $Game; exeVersion = $exe.VersionInfo.FileVersion; plugins = $plugins; tasks = @('sky-lab-launch', 'sky-lab-screenshot'); identity = $(if ($identity) { 'kept ' + $identity.client + '/' + $identity.profileId } else { 'template' }) } | ConvertTo-Json -Compress
