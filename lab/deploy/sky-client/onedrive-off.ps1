# Turn OneDrive off on a lab client. Its "Turn On Windows Backup" prompt opened
# over the game on sky-c1 during a launch test (2026-10-04), where it can take
# the game's input, and the lab user has nothing to sync. Windows' own policy
# does it for every user: "Prevent the usage of OneDrive for file storage",
# DisableFileSyncNGSC 1 under HKLM\SOFTWARE\Policies\Microsoft\Windows\OneDrive,
# with which OneDrive does not start. The running client is stopped and the
# lab user's logon entry removed. Run as SYSTEM through the guest agent
# (`just client-onedrive-off <vmid>`); idempotent.
$ErrorActionPreference = 'Stop'
$key = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive'
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name DisableFileSyncNGSC -Type DWord -Value 1
Get-Process OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force
# the lab user's Run key lives in its hive: loaded while it is logged on,
# loaded here for the edit otherwise
$sid = (New-Object System.Security.Principal.NTAccount('lab')).Translate([System.Security.Principal.SecurityIdentifier]).Value
$loaded = Test-Path "Registry::HKEY_USERS\$sid"
if (-not $loaded) { & reg.exe load "HKU\$sid" 'C:\Users\lab\NTUSER.DAT' | Out-Null }
Remove-ItemProperty -Path "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Run" -Name OneDrive -ErrorAction SilentlyContinue
$run = (Get-Item "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Run").GetValueNames() -join ','
if (-not $loaded) { [gc]::Collect(); & reg.exe unload "HKU\$sid" | Out-Null }
@{ policy = (Get-ItemProperty $key).DisableFileSyncNGSC; running = [bool](Get-Process OneDrive -ErrorAction SilentlyContinue); labRun = $run } | ConvertTo-Json -Compress
