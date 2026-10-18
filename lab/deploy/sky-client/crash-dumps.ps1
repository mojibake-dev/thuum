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
# Sunshine's own key. NVIDIA's installer creates LocalDumps by writing its
# per-app subkeys under it, and a LocalDumps key with no values of its own is
# still the global setting at its defaults: every process's crash leaves a
# minidump. A short-lived sunshine.exe child crashes about every 21 s on both
# clones (0x80000003 in KERNELBASE, 2026-10-17; the streams are unaffected), a
# 4 to 38 MB dump each time, during runs too. An app's key overrides the
# global settings (the same page), so this one keeps a single MiniDumpNormal
# (DumpType 0 with CustomDumpFlags 0: stacks only) and leaves the global
# setting and NVIDIA's keys as they are (thuum-mundus's narrowing).
$sun = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\sunshine.exe'
New-Item -Path $sun -Force | Out-Null
Set-ItemProperty -Path $sun -Name DumpType -Value 0 -Type DWord
Set-ItemProperty -Path $sun -Name CustomDumpFlags -Value 0 -Type DWord
Set-ItemProperty -Path $sun -Name DumpCount -Value 1 -Type DWord
# And the exit status of every process that ends, in the Security log (event
# 4689): the way the 0xC0000005 behind a dialog-less exit became visible on
# 2026-10-01 when no dump was written.
auditpol /set /subcategory:"Process Termination" /success:enable /failure:enable | Out-Null
$p = Get-ItemProperty -Path $key
$s = Get-ItemProperty -Path $sun
Write-Output ('LocalDumps SkyrimSE.exe: folder=' + $p.DumpFolder + ' type=' + $p.DumpType + ' count=' + $p.DumpCount + '; sunshine.exe: type=' + $s.DumpType + ' flags=' + $s.CustomDumpFlags + ' count=' + $s.DumpCount + '; ' + ((auditpol /get /subcategory:"Process Termination" | Select-String 'Process Termination') -join '').Trim())
