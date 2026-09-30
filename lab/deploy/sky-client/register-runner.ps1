# sky-lab-run: an on-demand scheduled task that runs C:\sky-lab\run.ps1 in the
# interactive session of the lab user, so the guest agent (SYSTEM, session 0)
# can drive things that need the desktop: steam:// links, launchers, the game.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$lab = 'C:\sky-lab'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $lab\run.ps1"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'lab' -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName 'sky-lab-run' -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Set-Content -Path "$lab\run.ps1" -Value '$s = (Get-Process -Id $PID).SessionId; "$(whoami) session $s $(Get-Date -Format s)" | Set-Content C:\sky-lab\run.out'
Start-ScheduledTask -TaskName 'sky-lab-run'
Start-Sleep -Seconds 6
@{ task = (Get-ScheduledTask -TaskName 'sky-lab-run').State.ToString(); last = (Get-ScheduledTaskInfo -TaskName 'sky-lab-run').LastTaskResult; out = (Get-Content "$lab\run.out" -ErrorAction SilentlyContinue) } | ConvertTo-Json -Compress
