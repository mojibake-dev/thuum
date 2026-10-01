# Put the lab user's Steam into offline mode so a cold boot in the dark lab
# reaches a logged-in Steam without a network: without this Steam sits in
# "Connecting" forever (sky-c1, 2026-10-01: connection_log looping on CM
# pings), SkyrimSE.exe started by the SKSE loader exits before SKSE even
# writes its log, and lab-driver never heartbeats. Steam persists the choice
# in config\loginusers.vdf: WantsOfflineMode 1 and SkipOfflineModeWarning 1
# for the remembered account (the same keys the client's "Go Offline" menu
# sets; Steam must have logged in online once with "Remember me" and the game
# must have run once online, both true for the template). Steam is shut down
# first because it rewrites the file on exit, then started again. Runs in the
# lab user's session (`just client-steam-offline <vmid>` through sky-lab-run).
$ErrorActionPreference = 'Stop'
$steam = 'C:\Program Files (x86)\Steam'
$vdf = Join-Path $steam 'config\loginusers.vdf'
$r = [ordered]@{}
if (Get-Process steam -ErrorAction SilentlyContinue) {
  Start-Process -FilePath (Join-Path $steam 'steam.exe') -ArgumentList '-shutdown'
  $deadline = (Get-Date).AddSeconds(40)
  while ((Get-Process steam -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
  Get-Process steam, steamwebhelper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
$text = Get-Content $vdf -Raw
$r.accounts = ([regex]::Matches($text, '"AccountName"\s+"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ','
foreach ($key in 'WantsOfflineMode', 'SkipOfflineModeWarning') {
  if ($text -match ('"' + $key + '"\s+"\d"')) { $text = [regex]::Replace($text, ('"' + $key + '"\s+"\d"'), ('"' + $key + '"		"1"')) }
  else { $text = [regex]::Replace($text, '("RememberPassword"\s+"\d"\r?\n)', ('$1		"' + $key + '"		"1"' + "`r`n"), 1) }
}
Set-Content -Path $vdf -Value $text -NoNewline -Encoding UTF8
$r.vdf = (([regex]::Matches((Get-Content $vdf -Raw), '"(RememberPassword|WantsOfflineMode|SkipOfflineModeWarning|AllowAutoLogin|MostRecent)"\s+"(\d)"') | ForEach-Object { $_.Groups[1].Value + '=' + $_.Groups[2].Value }) -join ' ')
Start-Process -FilePath (Join-Path $steam 'steam.exe') -ArgumentList '-cef-disable-gpu', '-cef-disable-gpu-compositing'
Start-Sleep -Seconds 30
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public class SW { public delegate bool EnumProc(IntPtr h, IntPtr l); [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l); [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); public static List<string> Titles(uint want) { var o = new List<string>(); EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid); if (pid == want && IsWindowVisible(h)) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); if (sb.Length > 0) o.Add(sb.ToString()); } return true; }, IntPtr.Zero); return o; } }
"@
$p = Get-Process steam -ErrorAction SilentlyContinue
$r.steam = if ($p) { 'running since ' + $p.StartTime.ToString('HH:mm:ss') + ' windows: ' + (([SW]::Titles([uint32]$p.Id)) -join ' | ') } else { 'not running' }
$r.connection_log = ((Get-Content (Join-Path $steam 'logs\connection_log.txt') -ErrorAction SilentlyContinue | Select-Object -Last 3 | ForEach-Object { $_.Substring(0, [Math]::Min(120, $_.Length)) }) -join ' || ')
$r | ConvertTo-Json -Compress | Set-Content C:\sky-lab\run.out
