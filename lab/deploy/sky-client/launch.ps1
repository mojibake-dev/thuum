# At logon of the lab user: wait for Steam's process, give it a moment, start
# the game through the SKSE loader from the install directory recorded by
# install-lab.ps1, and start it again if it is gone 30 s later. lab-driver (a
# Skyrim Platform plugin) then heartbeats to lab-api by itself.
#
# The retry is not decoration. The game is Steam-wrapped and exits at once
# (status 0x35, no SKSE log) when launched before Steam has finished its own
# startup: sky-c2 lost that race on 2026-10-01 (run 20261001-220543) where a
# fixed 20 s sleep had held on sky-c1 every time. Steam exposes no readiness
# signal in offline mode (ActiveUser stays 0 there), so the second launch is
# the signal: it comes 40 s after the first. The same retry covers the game
# leaving the desktop right after its generated save loads
# (lab/deploy/sky-client/README.md). Logs to C:\sky-lab\launch.log.
$ErrorActionPreference = 'Stop'
$game = (Get-Content 'C:\sky-lab\game-dir.txt' -Raw).Trim()
$log = 'C:\sky-lab\launch.log'
function Log($m) { Add-Content -Path $log -Value ((Get-Date).ToString('HH:mm:ss.fff') + ' ' + $m) }
Log 'logon'
$deadline = (Get-Date).AddSeconds(60)
while (-not (Get-Process steam -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
Log ('steam ' + [bool](Get-Process steam -ErrorAction SilentlyContinue))
Start-Sleep -Seconds 20
for ($attempt = 1; $attempt -le 3; $attempt++) {
  Log ('launch ' + $attempt)
  Start-Process -FilePath (Join-Path $game 'skse64_loader.exe') -WorkingDirectory $game
  Start-Sleep -Seconds 30
  $p = Get-Process SkyrimSE -ErrorAction SilentlyContinue
  if ($p) { Log ('running pid ' + $p.Id); break }
  Log 'the game is not running 30 s after the launch'
  Start-Sleep -Seconds 10
}
