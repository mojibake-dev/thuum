"""The mouse step (scenario.py's mouse): a relative mouse move in a seat's own desktop session.

The guest agent runs as SYSTEM in session 0, which has no desktop to send input to, so the move is made by
INPUT_PS1 run as the lab user through the on-demand task sky-lab-input, registered with -Force at each use
(nothing for a snapshot to carry), the way sky-lab-screenshot runs: conhost --headless, so no window comes
in front of the game's input. user32 SendInput with MOUSEEVENTF_MOVE is relative motion that raw input,
and DirectInput over it, takes as a device's: on c1 (2026-10-18 22:08) a move took the game out of its
vanity camera and a second pitched the first-person view.
"""
from __future__ import annotations

import base64
import json
from typing import Any

TASK = "sky-lab-input"

# Runs as the lab user: reads input\request.json, writes input\done.json.
INPUT_PS1 = r"""$ErrorActionPreference = 'Stop'
$dir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'input'
$req = Get-Content (Join-Path $dir 'request.json') -Raw | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LabMouse {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  public static uint Move(int dx, int dy) {
    var i = new INPUT[1];
    i[0].type = 0;
    i[0].mi.dx = dx; i[0].mi.dy = dy; i[0].mi.dwFlags = 0x0001;
    return SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@
$steps = [Math]::Max(1, [int]$req.steps)
$script:sent = 0
function Send-Move([int]$dx, [int]$dy) {
  $doneX = 0; $doneY = 0
  for ($k = 1; $k -le $steps; $k++) {
    $x = [int][Math]::Round($dx * $k / $steps) - $doneX
    $y = [int][Math]::Round($dy * $k / $steps) - $doneY
    $script:sent += [LabMouse]::Move($x, $y); $doneX += $x; $doneY += $y
    if ($k -lt $steps -and [int]$req.ms -gt 0) { Start-Sleep -Milliseconds ([int]$req.ms) }
  }
  return @($doneX, $doneY)
}
if ([int]$req.wake -gt 0) { [void](Send-Move 0 ([int]$req.wake)); [void](Send-Move 0 (-[int]$req.wake)); Start-Sleep -Milliseconds 250 }
$moved = Send-Move ([int]$req.dx) ([int]$req.dy)
@{ sent = $script:sent; dx = $moved[0]; dy = $moved[1]; steps = $steps; wake = [int]$req.wake; at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress | Set-Content (Join-Path $dir 'done.json') -NoNewline
"""


def events(args: dict[str, Any]) -> int:
    """The SendInput events a move with these (normalized) args makes: its steps, and twice more with wake."""
    return int(args["steps"]) * (3 if int(args.get("wake", 0)) > 0 else 1)


def command(args: dict[str, Any], lab_dir: str, user: str, wait_s: int = 30) -> list[str]:
    """The guest agent's command for one move: input.ps1 staged, the task registered, the request written,
    the task started, and done.json printed once the task writes it (or an error after wait_s)."""
    request = json.dumps({k: int(args[k]) for k in ("dx", "dy", "steps", "ms", "wake")})
    staged = base64.b64encode(INPUT_PS1.encode("utf-8")).decode("ascii")
    script = f"""$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$lab = '{lab_dir}'; $dir = Join-Path $lab 'input'; $done = Join-Path $dir 'done.json'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
[IO.File]::WriteAllBytes((Join-Path $lab 'input.ps1'), [Convert]::FromBase64String('{staged}'))
$ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
$a = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless ' + $ps + ' -NoProfile -ExecutionPolicy Bypass -File ' + (Join-Path $lab 'input.ps1'))
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$p = New-ScheduledTaskPrincipal -UserId '{user}' -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName '{TASK}' -Action $a -Principal $p -Settings $s -Force | Out-Null
Remove-Item $done -ErrorAction SilentlyContinue
Set-Content -Path (Join-Path $dir 'request.json') -Value '{request}' -NoNewline
Start-ScheduledTask -TaskName '{TASK}'
$d = (Get-Date).AddSeconds({int(wait_s)})
while ((Get-Date) -lt $d -and -not (Test-Path $done)) {{ Start-Sleep -Milliseconds 200 }}
if (-not (Test-Path $done)) {{ Write-Error ('no done.json in {int(wait_s)} s; the task''s last result ' + (Get-ScheduledTaskInfo -TaskName '{TASK}').LastTaskResult); exit 3 }}
Get-Content $done -Raw
"""
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    return ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]


def decode(cmd: list[str]) -> str:
    """The script a command() carries (for tests and for the step's own log line)."""
    return base64.b64decode(cmd[cmd.index("-EncodedCommand") + 1]).decode("utf-16-le")
