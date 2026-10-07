param([int]$W = 1920, [int]$H = 1080, [int]$Hz = 60)
# Set the desktop mode of a headless clone (its only monitor is the Virtual
# Display Driver, which comes up at 800x600) and make the game fill it: the
# mode is applied to the primary display with CDS_UPDATEREGISTRY so it survives
# a reboot, and SkyrimPrefs.ini gets iSize W/H = the mode, windowed and
# borderless, so Sunshine and the screenshot task capture the whole frame.
# Stops a running game first (it rewrites the prefs on exit). Must run in the
# lab user's session (`just client-display <vmid>` through sky-lab-run): a mode
# change from session 0 does not reach the interactive desktop.
# API: EnumDisplaySettingsA / ChangeDisplaySettingsExA and DEVMODEA,
# https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-changedisplaysettingsexa
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Disp {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency;
    public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern bool EnumDisplaySettingsA(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern int ChangeDisplaySettingsExA(string dev, ref DEVMODE dm, IntPtr hwnd, uint flags, IntPtr lp);
  public const int ENUM_CURRENT_SETTINGS = -1; public const uint CDS_UPDATEREGISTRY = 1;
  public static DEVMODE Fresh() { var d = new DEVMODE(); d.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); return d; }
}
"@
# The device is named explicitly: PowerShell hands a $null string to native code as "", not NULL.
Add-Type -AssemblyName System.Windows.Forms
$dev = [System.Windows.Forms.Screen]::PrimaryScreen.DeviceName
$r = [ordered]@{ device = $dev }
$cur = [Disp]::Fresh(); [void][Disp]::EnumDisplaySettingsA($dev, [Disp]::ENUM_CURRENT_SETTINGS, [ref]$cur)
$r.before = '' + $cur.dmPelsWidth + 'x' + $cur.dmPelsHeight + '@' + $cur.dmDisplayFrequency
$best = $null; $i = 0; $m = [Disp]::Fresh()
while ([Disp]::EnumDisplaySettingsA($dev, $i, [ref]$m)) {
  if ($m.dmPelsWidth -eq $W -and $m.dmPelsHeight -eq $H -and $m.dmBitsPerPel -eq 32) {
    if ($null -eq $best -or ($m.dmDisplayFrequency -le $Hz -and $m.dmDisplayFrequency -gt $best.dmDisplayFrequency) -or ($best.dmDisplayFrequency -gt $Hz -and $m.dmDisplayFrequency -lt $best.dmDisplayFrequency)) { $best = $m }
  }
  $i++; $m = [Disp]::Fresh()
}
if ($null -eq $best) { $r.error = 'no ' + $W + 'x' + $H + ' mode among ' + $i + ' modes' }
else {
  $r.mode = '' + $best.dmPelsWidth + 'x' + $best.dmPelsHeight + '@' + $best.dmDisplayFrequency
  $r.rc = [Disp]::ChangeDisplaySettingsExA($dev, [ref]$best, [IntPtr]::Zero, [Disp]::CDS_UPDATEREGISTRY, [IntPtr]::Zero)
  Start-Sleep -Seconds 2
  $now = [Disp]::Fresh(); [void][Disp]::EnumDisplaySettingsA($dev, [Disp]::ENUM_CURRENT_SETTINGS, [ref]$now)
  $r.after = '' + $now.dmPelsWidth + 'x' + $now.dmPelsHeight + '@' + $now.dmDisplayFrequency
}
Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force
$prefs = 'C:\Users\lab\Documents\My Games\Skyrim Special Edition\SkyrimPrefs.ini'
if (Test-Path $prefs) {
  # bUse64bitsHDRRenderTarget: the template's launcher left it 0, so bright
  # skin specular clipped to white (rotfern, docs/verbs/racemenu-sync.md);
  # fenestrate had 1, the launcher's High and Ultra presets set 1
  $want = @{ 'iSize W' = $W; 'iSize H' = $H; 'bFull Screen' = 0; 'bBorderless' = 1; 'bUse64bitsHDRRenderTarget' = 1 }
  $lines = Get-Content $prefs
  $lines = $lines | ForEach-Object { $l = $_; foreach ($k in $want.Keys) { if ($l -match ('^' + [regex]::Escape($k) + '=')) { $l = $k + '=' + $want[$k]; $want.Remove($k) } }; $l }
  if ($want.Count) { $lines = @($lines[0..$lines.IndexOf('[Display]')]) + @($want.Keys | ForEach-Object { $_ + '=' + $want[$_] }) + @($lines[($lines.IndexOf('[Display]') + 1)..($lines.Count - 1)]) }
  Set-Content -Path $prefs -Value $lines -Encoding ASCII
  $r.prefs = ((Select-String -Path $prefs -Pattern '^(iSize W|iSize H|bFull Screen|bBorderless)=' | ForEach-Object { $_.Line }) -join ';')
} else { $r.prefs = 'missing' }
$r | ConvertTo-Json -Compress | Set-Content C:\sky-lab\run.out
