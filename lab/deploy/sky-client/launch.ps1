# At logon of the lab user: wait for Steam's process, give it a moment, start
# the game through the SKSE loader from the install directory recorded by
# install-lab.ps1, and start it again when no game has started loading 30 s
# later; a loading game gets two minutes for its window and is never launched
# over. lab-driver (a Skyrim Platform plugin) then heartbeats to lab-api by
# itself.
#
# The retry is not decoration. The game is Steam-wrapped and exits at once
# (status 0x35, no SKSE log) when launched before Steam has finished its own
# startup: sky-c2 lost that race on 2026-10-01 (run 20261001-220543) where a
# fixed 20 s sleep had held on sky-c1 every time. Steam exposes no readiness
# signal in offline mode (ActiveUser stays 0 there), so the second launch is
# the signal: it comes 35 s after the first when no game has started
# loading. The same retry covers the game
# leaving the desktop right after its generated save loads
# (lab/deploy/sky-client/README.md). Logs to C:\sky-lab\launch.log.
$ErrorActionPreference = 'Stop'
$game = (Get-Content 'C:\sky-lab\game-dir.txt' -Raw).Trim()
$log = 'C:\sky-lab\launch.log'
function Log($m) { Add-Content -Path $log -Value ((Get-Date).ToString('HH:mm:ss.fff') + ' ' + $m) }
Log 'logon'
# Which game this boot plays (ADR-022): lab-api names the version, the run's
# or its default, and each version has its own folder, recorded by
# install-lab.ps1 as C:\sky-lab\games\<version>.txt. The chosen folder becomes
# game-dir.txt, which everything else on the clone reads (lab-api's log
# fetch, identity.ps1, controlmap.ps1). With no answer, or no folder for the
# version asked, the last folder stays; lab-api's game check then fails the
# run with the version it found, rather than letting it play another build.
try {
  $cfg = Get-Content 'C:\sky-lab\lab-driver-settings.txt' -Raw | ConvertFrom-Json
  $uri = $cfg.labApiBase + $cfg.labApiPath + '/game?client=' + $cfg.client
  $want = $null
  for ($i = 0; $i -lt 10 -and -not $want; $i++) {
    try { $want = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $uri).Content | ConvertFrom-Json | ForEach-Object { $_.version } } catch { Start-Sleep -Seconds 3 }
  }
  $rec = if ($want) { Join-Path 'C:\sky-lab\games' ($want + '.txt') } else { $null }
  if ($rec -and (Test-Path $rec)) {
    $game = (Get-Content $rec -Raw).Trim()
    Set-Content -Path 'C:\sky-lab\game-dir.txt' -Value $game -NoNewline
    Log ('game ' + $want + ': ' + $game)
  } elseif ($want) { Log ('game ' + $want + ' asked, no folder recorded for it; staying on ' + $game) }
  else { Log ('no answer from ' + $uri + '; staying on ' + $game) }
} catch { Log ('game choice failed: ' + $_.Exception.Message + '; staying on ' + $game) }
# Skyrim Platform's writeLogs opens Data\Platform\Logs\<plugin>-logs.txt and never
# creates the directory (ConsoleApi.cpp); without it lab-driver's log silently
# does not exist (sky-c1, 2026-10-01). lab-api collects it as <client>-driver.log.
New-Item -ItemType Directory -Force -Path (Join-Path $game 'Data\Platform\Logs') | Out-Null
# Steam is through its own startup once its web helper runs (offline mode
# included): on sky-c2 on 2026-10-03 it came 65 s after steam.exe, after a
# launch at a fixed 20 s, and that boot's three loaders hung with no game
# until lab-api gave up (run 20261003-110508). Wait for it, up to two
# minutes, then the settle.
$deadline = (Get-Date).AddSeconds(120)
while (-not (Get-Process steamwebhelper -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
Log ('steam ' + [bool](Get-Process steam -ErrorAction SilentlyContinue) + ', service ' + [bool](Get-Process steamservice -ErrorAction SilentlyContinue) + ', web helper ' + [bool](Get-Process steamwebhelper -ErrorAction SilentlyContinue))
Start-Sleep -Seconds 15
# A game process is loading when it has no window yet but is no longer the
# small, suspended image a failed attempt leaves (thuum-mundus stopped three of
# those on sky-c2 on 2026-10-03: the loader waiting forever and the
# SkyrimSE.exe it created suspended for the injection, with no window). A
# loading game is never launched over: on sky-c2 after a restart on
# 2026-10-04 the window took more than 30 s, a second launch started a second
# game while the first was logging in, and both died within seconds (runs
# 20261004-194607 and three by hand).
$loadingMB = 200
function Get-Loading { Get-Process SkyrimSE -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -or $_.WorkingSet64 -ge $loadingMB * 1MB } | Select-Object -First 1 }
for ($attempt = 1; $attempt -le 3; $attempt++) {
  Get-Process skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force
  Get-Process SkyrimSE -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq 0 -and $_.WorkingSet64 -lt $loadingMB * 1MB } | Stop-Process -Force
  if (Get-Loading) { Log ('a game is already loading; attempt ' + $attempt + ' waits for it') }
  else {
    Log ('launch ' + $attempt)
    Start-Process -FilePath (Join-Path $game 'skse64_loader.exe') -WorkingDirectory $game
  }
  # up to two minutes for a window. A launch is still under way while a game
  # loads or the SKSE loader runs: on sky-c2 on 2026-10-04 the loader took
  # 31 s to create the game. With neither 30 s in, this attempt failed (gone,
  # or the small suspended image with no loader). A loader still running at
  # two minutes is the hung case, killed with its image by the next attempt.
  $t0 = Get-Date
  $p = $null
  do {
    Start-Sleep -Seconds 3
    $p = Get-Process SkyrimSE -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    $busy = (Get-Loading) -or (Get-Process skse64_loader -ErrorAction SilentlyContinue)
    $age = ((Get-Date) - $t0).TotalSeconds
  } while (-not $p -and $age -lt 120 -and ($busy -or $age -lt 30))
  if ($p) { Log ('running pid ' + $p.Id + ' after ' + [int]$age + ' s'); break }
  $ws = (Get-Process SkyrimSE -ErrorAction SilentlyContinue | ForEach-Object { [int]($_.WorkingSet64 / 1MB) }) -join ','
  Log ('no game window ' + [int]$age + ' s after the launch (game working sets MB: ' + $(if ($ws) { $ws } else { 'none' }) + ')')
  Start-Sleep -Seconds 5
}
