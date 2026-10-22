"""The screenshot step's burst (scenario.py's screenshot {count, intervalMs}): a seat's screen filmed at an
animation's rate.

One plain screenshot is a guest exec, the sky-lab-screenshot task and a 3.8 MB read back through the agent: 2 to 3 s
a shot (x-npc-legs 20261022-190831), while a puppet's walk lasts 1 to 3 s. A burst is one exec: BURST_PS1 runs as
the lab user through the on-demand task sky-lab-burst, registered with -Force at each use as mouse.py's sky-lab-input
is (nothing for a snapshot to carry), headless, and captures `count` frames `intervalMs` apart on one stopwatch into
shots\\<NNN>-burst\\<k>.png, each frame's offset in done.json (a PNG write can push a frame late; the offset says
when it was taken) from `started`, the guest's UTC clock at frame 0. Once the task has written done.json, the exec writes a base64 sidecar beside each frame for the
agent's text-only file API and prints done.json; the runner reads the frames back after it.
"""
from __future__ import annotations

import base64
import json
import math
from typing import Any

TASK = "sky-lab-burst"

# Runs as the lab user: reads burst\request.json, films request.out, writes burst\done.json.
BURST_PS1 = r"""$ErrorActionPreference = 'Stop'
$dir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'burst'
$req = Get-Content (Join-Path $dir 'request.json') -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$out = [string]$req.out
New-Item -ItemType Directory -Force -Path $out | Out-Null
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$n = [int]$req.count; $iv = [int]$req.intervalMs
$frames = New-Object System.Collections.ArrayList
$started = (Get-Date).ToUniversalTime().ToString('o'); $sw = [System.Diagnostics.Stopwatch]::StartNew()
for ($k = 0; $k -lt $n; $k++) {
  $wait = $k * $iv - $sw.ElapsedMilliseconds
  if ($wait -gt 0) { Start-Sleep -Milliseconds ([int]$wait) }
  $ms = $sw.ElapsedMilliseconds
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $name = ('{0:D3}.png' -f $k)
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  [void]$frames.Add(@{ k = $k; ms = $ms; file = $name })
}
$g.Dispose(); $bmp.Dispose()
@{ count = $n; intervalMs = $iv; frames = $frames; width = $b.Width; height = $b.Height; started = $started; at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress -Depth 4 | Set-Content (Join-Path $dir 'done.json') -NoNewline
"""


def wait_s(args: dict[str, Any]) -> int:
    """How long the exec waits for done.json: the burst's span, a quarter second a frame for the PNG writes that can
    push it late, and 30 s for the task to start."""
    span = (int(args["count"]) - 1) * int(args["intervalMs"]) / 1000.0
    return int(math.ceil(span + 0.25 * int(args["count"]) + 30))


def exec_timeout_s(args: dict[str, Any], floor: float) -> float:
    """The exec's own limit: the wait, a tenth of a second a frame for the sidecars, and 30 s, never under `floor`
    (the runner's guest_task_timeout_s)."""
    return max(float(floor), wait_s(args) + 0.1 * int(args["count"]) + 30)


def command(args: dict[str, Any], lab_dir: str, user: str, out: str) -> list[str]:
    """The guest agent's command for one burst into `out` (a directory under the lab dir): burst.ps1 staged, the
    task registered, the request written, the task started, a base64 sidecar written beside each frame once
    done.json is there, and done.json printed (or an error after wait_s)."""
    request = json.dumps({"count": int(args["count"]), "intervalMs": int(args["intervalMs"]), "out": out})
    staged = base64.b64encode(BURST_PS1.encode("utf-8")).decode("ascii")
    w = wait_s(args)
    script = f"""$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$lab = '{lab_dir}'; $dir = Join-Path $lab 'burst'; $done = Join-Path $dir 'done.json'; $out = '{out}'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
if (Test-Path $out) {{ Remove-Item -Recurse -Force $out }}
[IO.File]::WriteAllBytes((Join-Path $lab 'burst.ps1'), [Convert]::FromBase64String('{staged}'))
$ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
$a = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless ' + $ps + ' -NoProfile -ExecutionPolicy Bypass -File ' + (Join-Path $lab 'burst.ps1'))
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$p = New-ScheduledTaskPrincipal -UserId '{user}' -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName '{TASK}' -Action $a -Principal $p -Settings $s -Force | Out-Null
Remove-Item $done -ErrorAction SilentlyContinue
Set-Content -Path (Join-Path $dir 'request.json') -Value '{request}' -NoNewline
Start-ScheduledTask -TaskName '{TASK}'
$d = (Get-Date).AddSeconds({w})
while ((Get-Date) -lt $d -and -not (Test-Path $done)) {{ Start-Sleep -Milliseconds 250 }}
if (-not (Test-Path $done)) {{ Write-Error ('no done.json in {w} s; the task''s last result ' + (Get-ScheduledTaskInfo -TaskName '{TASK}').LastTaskResult); exit 3 }}
Get-ChildItem $out -Filter '*.png' | ForEach-Object {{ [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.FullName)) | Set-Content -Path ($_.FullName + '.b64') -NoNewline }}
Get-Content $done -Raw
"""
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    return ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]


def decode(cmd: list[str]) -> str:
    """The script a command() carries (for tests)."""
    return base64.b64decode(cmd[cmd.index("-EncodedCommand") + 1]).decode("utf-16-le")


def done(text: str) -> dict[str, Any]:
    """done.json, from the exec's last line or the file itself, checked: a frame list of {k, ms, file}."""
    lines = text.strip().lstrip("﻿").splitlines()
    data = json.loads(lines[-1]) if lines else None
    frames = data.get("frames") if isinstance(data, dict) else None
    if not isinstance(frames, list) or not frames or any(not isinstance(f, dict) or {"k", "ms", "file"} - set(f) for f in frames):
        raise ValueError(f"done.json carries no frame list: {text.strip()[:200]!r}")
    return data
