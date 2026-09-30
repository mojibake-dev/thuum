# Set this client's Sunshine base port (its HTTPS, web UI, RTSP and UDP ports
# follow at fixed offsets) and restart the service. Moonlight learns the HTTPS
# port from Sunshine's own /serverinfo, so the host cannot translate ports:
# every client gets its own base here and the host maps it one to one.
# Usage (through guest exec, as SYSTEM): sunshine-port.ps1 -Base 48989
param([int]$Base = 48989)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$conf = 'C:\Program Files\Sunshine\config\sunshine.conf'
$lines = @()
if (Test-Path $conf) { $lines = Get-Content $conf | Where-Object { $_ -notmatch '^\s*port\s*=' } }
$lines += "port = $Base"
Set-Content -Path $conf -Value $lines -Encoding ASCII
Restart-Service SunshineService
$deadline = (Get-Date).AddSeconds(60)
do {
  Start-Sleep -Seconds 3
  $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in ($Base - 5), $Base, ($Base + 1), ($Base + 21) } |
    ForEach-Object { $_.LocalPort } | Sort-Object -Unique
} while ($ports.Count -lt 4 -and (Get-Date) -lt $deadline)
@{ base = $Base; listening = ($ports -join ','); service = (Get-Service SunshineService).Status.ToString() } | ConvertTo-Json -Compress
