# Make an exit of SkyrimSE.exe diagnosable: Windows Error Reporting writes a minidump when it crashes,
# under C:\sky-lab\dumps, so an exit without a dialog is diagnosable: WER's
# LocalDumps registry policy (Microsoft, "Collecting User-Mode Dumps",
# https://learn.microsoft.com/windows/win32/wer/collecting-user-mode-dumps).
# DumpType 1 is a minidump, DumpCount keeps the five newest. A process that
# calls ExitProcess leaves no dump; then the exit was deliberate, which is a
# finding in itself. Machine-wide, so it runs as SYSTEM through the guest
# agent (`just client-crash-dumps <vmid>`).
$key = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\SkyrimSE.exe'
New-Item -ItemType Directory -Force -Path 'C:\sky-lab\dumps' | Out-Null
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name DumpFolder -Value 'C:\sky-lab\dumps' -Type ExpandString
Set-ItemProperty -Path $key -Name DumpType -Value 1 -Type DWord
Set-ItemProperty -Path $key -Name DumpCount -Value 5 -Type DWord
# And the exit status of every process that ends, in the Security log (event
# 4689): the way the 0xC0000005 behind a dialog-less exit became visible on
# 2026-10-01 when no dump was written.
auditpol /set /subcategory:"Process Termination" /success:enable /failure:enable | Out-Null
$p = Get-ItemProperty -Path $key
Write-Output ('LocalDumps SkyrimSE.exe: folder=' + $p.DumpFolder + ' type=' + $p.DumpType + ' count=' + $p.DumpCount + '; ' + ((auditpol /get /subcategory:"Process Termination" | Select-String 'Process Termination') -join '').Trim())
