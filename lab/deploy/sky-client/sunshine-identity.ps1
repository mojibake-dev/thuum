param([string]$Name = 'sky client')
# Give a clone's Sunshine its own identity. Clones of tpl-sky-client inherit
# the template's sunshine_state.json and credentials\, so both lab clients
# answered Moonlight with one uniqueid and one certificate, and Moonlight,
# which keeps one entry per uniqueid, listed only one of them (sky-c1 and
# sky-c2, 2026-10-04). This writes a fresh uniqueid, names the host, forgets
# the template's paired clients (Moonlight pairs this host anew, the PIN going
# in through this clone's web UI) and removes credentials\ so Sunshine makes a
# certificate of its own at start. The web UI login (username, password,
# salt) is kept. Run as SYSTEM through the guest agent
# (`just client-sunshine-identity <vmid> <name>`); then pair, then retake.
$ErrorActionPreference = 'Stop'
$d = 'C:\Program Files\Sunshine\config'
Stop-Service SunshineService
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Process sunshine -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
$statePath = Join-Path $d 'sunshine_state.json'
$st = Get-Content $statePath -Raw | ConvertFrom-Json
$old = $st.root.uniqueid
$st.root.uniqueid = [guid]::NewGuid().ToString().ToUpper()
$st.root.named_devices = @()
$st | ConvertTo-Json -Depth 8 | Set-Content -Path $statePath -Encoding ASCII
$confPath = Join-Path $d 'sunshine.conf'
$conf = @(Get-Content $confPath | Where-Object { $_ -notmatch '^\s*sunshine_name\s*=' }) + "sunshine_name = $Name"
Set-Content -Path $confPath -Value $conf -Encoding ASCII
Remove-Item (Join-Path $d 'credentials\cacert.pem'), (Join-Path $d 'credentials\cakey.pem') -ErrorAction SilentlyContinue
Start-Service SunshineService
$deadline = (Get-Date).AddSeconds(30)
while (-not (Test-Path (Join-Path $d 'credentials\cacert.pem')) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
$now = Get-Content $statePath -Raw | ConvertFrom-Json
[ordered]@{
  name = $Name; uniqueid = $now.root.uniqueid; was = $old; paired = @($now.root.named_devices).Count
  certificate = [bool](Test-Path (Join-Path $d 'credentials\cacert.pem')); service = (Get-Service SunshineService).Status.ToString()
  conf = (Get-Content $confPath) -join ' ; '
} | ConvertTo-Json -Compress
