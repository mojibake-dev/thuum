# At logon of the lab user: wait for Steam to have a logged-in user (offline
# mode counts), then start the game through the SKSE loader from the install
# directory recorded by install-lab.ps1, and start it again if it ends within
# its first half minute. lab-driver (a Skyrim Platform plugin) then heartbeats
# to lab-api by itself.
#
# The waits are not decoration. The game is Steam-wrapped and exits at once
# (status 0x35, no SKSE log) when launched before Steam has finished its own
# startup: sky-c2 lost that race on 2026-10-01 (run 20261001-220543) where a
# fixed 20 s sleep had held on sky-c1 every time. Steam exposes the logged-in
# user as HKCU\Software\Valve\Steam\ActiveProcess\ActiveUser (0 while logged
# out), in offline mode too. The game also leaves the desktop now and then
# right after its generated save loads (lab/deploy/sky-client/README.md), so
# an exit inside the first 30 s gets up to two more launches.
$ErrorActionPreference = 'Stop'
$game = (Get-Content 'C:\sky-lab\game-dir.txt' -Raw).Trim()
$log = 'C:\sky-lab\launch.log'
function Log($m) { Add-Content -Path $log -Value ((Get-Date).ToString('HH:mm:ss.fff') + ' ' + $m) }
Log 'logon: waiting for Steam'
$deadline = (Get-Date).AddSeconds(120)
do {
  $user = (Get-ItemProperty 'HKCU:\Software\Valve\Steam\ActiveProcess' -ErrorAction SilentlyContinue).ActiveUser
  if ($user -and $user -ne 0) { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
Log ('steam ActiveUser=' + $user + ' after ' + [int](120 - ($deadline - (Get-Date)).TotalSeconds) + ' s')
Start-Sleep -Seconds 5
for ($attempt = 1; $attempt -le 3; $attempt++) {
  Log ('launch ' + $attempt)
  Start-Process -FilePath (Join-Path $game 'skse64_loader.exe') -WorkingDirectory $game
  Start-Sleep -Seconds 30
  $p = Get-Process SkyrimSE -ErrorAction SilentlyContinue
  if ($p) { Log ('running pid ' + $p.Id); break }
  Log 'the game is not running 30 s after the launch'
  Start-Sleep -Seconds 10
}
