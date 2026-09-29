# At logon of the lab user: wait for the desktop, then start the game through
# the SKSE loader from the install directory recorded by install-lab.ps1.
# lab-driver (a Skyrim Platform plugin) then heartbeats to lab-api by itself.
$ErrorActionPreference = 'Stop'
$game = Get-Content 'C:\sky-lab\game-dir.txt' -Raw
$game = $game.Trim()
Start-Sleep -Seconds 20
Start-Process -FilePath (Join-Path $game 'skse64_loader.exe') -WorkingDirectory $game
