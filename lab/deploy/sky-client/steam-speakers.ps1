# Give the clone an audio output before the game ever launches: Steam's
# virtual "Steam Streaming Speakers", which Sunshine streams from. Without it
# sky-c2's clean-m1 had no audio output at all, so its game started silent
# and stayed so; Sunshine installs the device only when a stream starts
# (install_steam_audio_drivers), by then after the game's launch (2026-10-05,
# docs/PLAN.md, the third playtest's "no sound"). Sunshine does it with
# DiInstallDriverW on Steam's own driver package (src/platform/windows/audio.cpp);
# pnputil /add-driver /install does the same here and creates
# ROOT\STEAMSTREAMINGSPEAKERS\0000 with its Speakers endpoint (sky-c2,
# 2026-10-05). Machine-wide, so it runs as SYSTEM through the guest agent
# (`just client-steam-speakers`).
$inf = [Environment]::ExpandEnvironmentVariables('%CommonProgramFiles(x86)%\Steam\drivers\Windows10\x64\SteamStreamingSpeakers.inf')
if (-not (Test-Path $inf)) { Write-Output "no $inf (is Steam installed?)"; exit 1 }
pnputil /add-driver $inf /install | Out-Null
Start-Sleep -Seconds 3
$dev = Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -eq 'Steam Streaming Speakers' -and $_.Status -eq 'OK' }
$out = Get-PnpDevice -Class AudioEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Steam Streaming Speakers' -and $_.Status -eq 'OK' }
if (-not $dev -or -not $out) { Write-Output 'Steam Streaming Speakers: missing after the install'; exit 1 }
Write-Output ('Steam Streaming Speakers: ' + $dev.InstanceId + ', output ' + $out.FriendlyName)
