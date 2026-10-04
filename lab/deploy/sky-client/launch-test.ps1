# Launch the game through the SKSE loader in the lab user's session, wait, and
# report: processes, the SKSE runtime log, the text of any dialog the game or
# Skyrim Platform put up (a MessageBox's static text), and a screenshot in
# C:\sky-lab\screenshots\latest.png. Run with `just client-launch-test <vmid>`.
# Leaves the game running when it got past loading, so the server side can be
# checked; a dialog means it did not.
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public static string Rect(IntPtr h) { RECT r; if (!GetWindowRect(h, out r)) return "?"; return (r.R - r.L) + "x" + (r.B - r.T) + " at " + r.L + "," + r.T; }
  public static List<string> Top() { var o = new List<string>(); EnumWindows((h, l) => { if (IsWindowVisible(h)) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); if (sb.Length > 0) { uint pid; GetWindowThreadProcessId(h, out pid); o.Add(h.ToInt64() + "\t" + pid + "\t" + sb); } } return true; }, IntPtr.Zero); return o; }
  public static List<string> Children(IntPtr p) { var o = new List<string>(); EnumChildWindows(p, (h, l) => { var sb = new StringBuilder(1024); GetWindowText(h, sb, 1024); var cn = new StringBuilder(128); GetClassName(h, cn, 128); if (sb.Length > 0) o.Add(cn + "=" + sb); return true; }, IntPtr.Zero); return o; }
}
"@
function Tops { [W]::Top() | ForEach-Object { $p = $_ -split "`t", 3; [pscustomobject]@{ h = [IntPtr][int64]$p[0]; pid = [int]$p[1]; title = $p[2] } } }
# the folder in game-dir.txt: the one this boot plays (ADR-022: one per game version)
$game = (Get-Content 'C:\sky-lab\game-dir.txt' -Raw).Trim()
$docs = 'C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE'
$wait = 45
Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item (Join-Path $docs 'skse64.log') -ErrorAction SilentlyContinue
Set-Location $game
Start-Process -FilePath (Join-Path $game 'skse64_loader.exe') -WorkingDirectory $game
Start-Sleep -Seconds $wait
$r = [ordered]@{ launched = (Get-Date).AddSeconds(-$wait).ToString('HH:mm:ss') }
$r.procs = ((Get-Process SkyrimSE -ErrorAction SilentlyContinue | ForEach-Object { $_.Name + ':' + $_.Id + ':' + [int]($_.WorkingSet64 / 1MB) + 'MB' }) -join ',')
# gpu: the Direct3D user-mode driver the game loaded (nvwgf2umx = NVIDIA, d3d10warp = software); window: the game window's size.
$r.gpu = ((Get-Process SkyrimSE -ErrorAction SilentlyContinue | ForEach-Object { $_.Modules } | Where-Object { $_.ModuleName -match '^(nvwgf2umx|d3d10warp|amdxc64|igd1\dumd64)' } | ForEach-Object { $_.ModuleName }) -join ','); if (-not $r.gpu) { $r.gpu = 'none' }
$r.window = ((Tops | Where-Object { $_.title -eq 'Skyrim Special Edition' } | ForEach-Object { [W]::Rect($_.h) }) -join ',')
$r.skse_log = ((Get-Content (Join-Path $docs 'skse64.log') -ErrorAction SilentlyContinue | Select-Object -Last 6) -join ' | ')
$r.dialogs = ''
foreach ($w in (Tops | Where-Object { $_.title -match 'Skyrim|System Error' })) {
  $kids = [W]::Children($w.h) | Where-Object { $_ -match '^(Static|Button)=' }
  if ($kids) { $r.dialogs += $w.title + ' [' + ($kids -join ' / ') + '] ' }
  [void][W]::SetForegroundWindow($w.h)
}
Start-Sleep -Seconds 1
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy Bypass -File C:\sky-lab\screenshot.ps1
$r | ConvertTo-Json -Compress | Set-Content C:\sky-lab\run.out
