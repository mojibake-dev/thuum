"""Settings from environment variables only. Every knob has a default that
works on sky-srv as docs/LAB.md describes it; tests override by constructing
Settings directly."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent
LAB_DIR = PKG_DIR.parent.parent  # lab/
# Settings.client_reset's values (ADR-036)
CLIENT_RESETS = ("rollback", "relaunch")
# Settings.seat_stop's values
SEAT_STOPS = ("stop", "shutdown")


def _version_map(spec: str) -> dict[str, str]:
    """"<version>=<path>;..." as {version: path}."""
    out: dict[str, str] = {}
    for part in spec.split(";"):
        version, sep, path = part.partition("=")
        if sep and version.strip() and path.strip():
            out[version.strip()] = path.strip()
    return out


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_verify(name: str, default: bool | str) -> bool | str:
    """PVE_VERIFY_SSL: "true" or "false" as booleans, anything else is a CA
    bundle path (what requests accepts as `verify`)."""
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    low = raw.strip().lower()
    if low in ("1", "true", "yes", "on"):
        return True
    if low in ("0", "false", "no", "off"):
        return False
    return raw.strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    # HTTP
    root_path: str = "/lab"
    listen_port: int = 80
    # the commit this lab-api was built from (the image's LABAPI_VERSION), in GET /status
    version: str = "dev"
    # Proxmox API, called directly by IP (Caddy 403s guest VLANs), pool-scoped token.
    pve_url: str = "https://10.0.0.10:8006"
    pve_token_id: str = ""  # user@realm!tokenname
    pve_token_secret: str = ""
    pve_node: str = "core"
    # true, false, or a path to a CA bundle: Proxmox's API certificate is
    # issued by the cluster's own CA (pve-root-ca.pem on the host), so the
    # right setting on sky-srv is that file, mounted read-only.
    pve_verify_ssl: bool | str = True
    # proxmoxer's per-request HTTP timeout; its 5 s default is shorter than a
    # guest exec that waits for a screenshot task (run 20261001-201016).
    pve_timeout_s: float = 30.0
    # Where runs land (rpool/sky/results over virtiofs) and where the guest table is.
    results_dir: str = "/srv/lab/results"
    guests_file: str = str(PKG_DIR / "guests.yaml")
    # The server next door: compose file, service name, its world/ directory
    # (the `file` database driver), the directory of world snapshots to restore
    # from, and the UI port used as the readiness probe.
    compose_file: str = "/srv/skymp/docker-compose.yml"
    compose_service: str = "skymp-server"
    server_world_dir: str = "/srv/skymp/server/world"
    server_snapshots_dir: str = "/srv/skymp/snapshots"
    # uid:gid the server container runs as; a restored world/ is handed to it.
    server_uid: int = 1001
    server_gid: int = 1001
    server_ui_port: int = 3000
    # The headless legacy client shipped in the server image, run through
    # `docker compose run` for `server: fakeclient` steps (T2 without Windows).
    server_port: int = 7777
    fakeclient_bin: str = "/srv/skymp/fakeclient"
    fakeclient_timeout_s: float = 90.0
    server_snapshot_default: str = "clean"
    # "state": stop the server container, restore world/ from the named
    # snapshot, start, wait (lab-api runs on sky-srv and cannot roll back the
    # VM it lives in). "vm": Proxmox stop, rollback, start of the server guest;
    # only valid when lab-api runs somewhere else.
    server_rollback_mode: str = "state"
    # The server's UI base, where the RPC hook lives (CONTRACT.md).
    server_state_url: str = "http://127.0.0.1:3000"
    # Where clients pull Frida scripts from (inside the VLAN, plain http).
    lab_api_internal_url: str = "http://10.10.70.10/lab"
    frida_scripts_dir: str = str(LAB_DIR / "frida")
    # The committed scenarios as `just deploy-srv` put them on sky-srv: what a run
    # set (POST /lab/runset, the merge gate and the nightly sweep) plays by id.
    scenarios_dir: str = str(LAB_DIR / "scenarios")
    # The committed fixture worlds (ADR-043's rule-6 scenario): lab/fixtures/worlds/<name>/,
    # a world directory (changeForms/ and its load-order.json) a scenario's `server: {world:
    # <name>}` lays in place of a snapshot's, reviewed in git rather than kept on sky-srv alone.
    fixture_worlds_dir: str = str(LAB_DIR / "fixtures" / "worlds")
    # The committed reference traces (ADR-031): lab/references/<action>-a.json and
    # -b.json, reviewed like scenarios, read by a parity scenario's assertion.
    references_dir: str = str(LAB_DIR / "references")
    # The nightly sweep (ADR-030): every scenario, started by the clock at this
    # UTC time ("10:30" is 03:30 PDT) once the lab has been idle nightly_quiet_s;
    # empty means no nightly.
    nightly_sweep_utc: str = ""
    nightly_quiet_s: float = 1800.0
    nightly_window_s: float = 5400.0   # the nightly starts within this long after its minute, or not that day
    heartbeat_fresh_s: float = 120.0   # the nightly needs every managed client's poll this recent (its game up)
    # Fault injection and capture, on sky-srv.
    netem_dev: str = "eth0"
    pcap_iface: str = "any"
    game_port: int = 7777
    # Inside a Windows client (template build, Track L2).
    client_lab_dir: str = r"C:\sky-lab"
    # the Windows account the clones' games run as (install-lab.ps1's -User): the mouse step's task runs as it
    client_lab_user: str = "lab"
    # The client log artifact (c1.log): Skyrim Platform's own log, which always
    # exists and carries plugin load, JavaScript exceptions and latent-call
    # traces. lab-driver's writeLogs sink (Data\Platform\Logs\lab-driver-logs.txt
    # in the game directory) only appears once the driver logs an error.
    client_driver_log: str = r"C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE\skyrim-platform.log"
    # lab-driver's own log (Skyrim Platform's writeLogs), relative to the game
    # directory the client recorded in {client_lab_dir}\game-dir.txt at install;
    # collected as <client>-driver.log beside <client>.log.
    client_plugin_log: str = r"Data\Platform\Logs\lab-driver-logs.txt"
    # every line the game's console printed (lab-driver's consoleMessage tee, its own writeLogs file, relative to
    # the game directory as above): skymp5-client's printConsole, logTrace and logError lines reach no other
    # file; collected as <client>-console.log, and log-count reads it beside <client>.log
    client_console_log: str = r"Data\Platform\Logs\lab-console-logs.txt"
    # PowerShell run through the guest agent. {url} {name} {lab_dir} {out} {user} are filled in.
    # frida-inject (the standalone injector, staged by `just client-frida`) attaches
    # to the game by name once it exists plus five seconds (attaching at process
    # start never loaded the agent, 2026-10-01) and keeps running until the game
    # ends; its stdout is the trace. It must run in the lab user's session, the
    # game's: as SYSTEM through the guest agent it failed on both clones on
    # 2026-10-05 ("refused to load frida-agent"), while the same command through
    # a task running as `lab` on the desktop attached. So the watcher becomes
    # C:\sky-lab\frida-watch.ps1 and the on-demand task sky-lab-frida runs it,
    # registered with -Force at each use (nothing for a snapshot to carry) and
    # headless, as mouse.py's sky-lab-input is: through Windows 11's default
    # console host a -WindowStyle Hidden PowerShell still opens a window over the
    # game (install-lab.ps1's screenshot note), and a seat relaunched under Frida
    # came up with the taskbar over its game and its keys going nowhere
    # (x-start-box 20261026-022654: the console did not open, as in x-quit-watch
    # 015302 and x-quit-scan 020652 and 021213). conhost --headless opens no
    # window, and frida-inject shares its console (-NoNewWindow), so the game
    # keeps the foreground its launch gave it. Braces are doubled for str.format.
    # frida-inject eternalizes the script and exits (-e, frida 17.19.0's own option): a load error is
    # flushed to its .out at once, and the script's lines reach its .log through runner.frida_script_text's
    # preamble (stdout redirected to a file sat in the injector's buffer until it exited: P0, 2026-10-21)
    frida_exec_template: str = (
        "Invoke-WebRequest -UseBasicParsing -Uri '{url}' -OutFile '{lab_dir}\\frida\\{name}'; "
        "$w = @'\n"
        "$d = '{lab_dir}\\frida'; for ($i = 0; $i -lt 1500; $i++) {{ $p = Get-Process SkyrimSE -ErrorAction SilentlyContinue; if ($p) {{ break }}; Start-Sleep -Milliseconds 200 }}; "
        "if ($p) {{ Start-Sleep -Seconds 5; Start-Process -FilePath \"$d\\frida-inject.exe\" -ArgumentList '-p', $p.Id, '-s', \"$d\\{name}\", '-e' -RedirectStandardOutput \"$d\\{name}.out\" -RedirectStandardError \"$d\\{name}.err\" -NoNewWindow }}\n"
        "'@; "
        # one watcher at a time: the task's IgnoreNew policy drops a start while a previous watcher still
        # sleeps before its inject (x-frida-flush 20261022-043924: a second frida step a second after the
        # first never started), so a step waits up to 20 s for the task to be idle and fails if it is not
        "for ($i = 0; $i -lt 100 -and (Get-ScheduledTask -TaskName sky-lab-frida -ErrorAction SilentlyContinue).State -eq 'Running'; $i++) {{ Start-Sleep -Milliseconds 200 }}; "
        "if ((Get-ScheduledTask -TaskName sky-lab-frida -ErrorAction SilentlyContinue).State -eq 'Running') {{ Write-Error 'sky-lab-frida still runs a previous frida watcher (it waits for the game)'; exit 3 }}; "
        "Set-Content -Path '{lab_dir}\\frida-watch.ps1' -Value $w; "
        "$ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'; "
        "$a = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless ' + $ps + ' -NoProfile -ExecutionPolicy Bypass -File {lab_dir}\\frida-watch.ps1'); "
        "$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew; "
        "$t = New-ScheduledTaskPrincipal -UserId '{user}' -LogonType Interactive -RunLevel Highest; "
        "Register-ScheduledTask -TaskName sky-lab-frida -Action $a -Principal $t -Settings $s -Force | Out-Null; "
        "Start-ScheduledTask -TaskName sky-lab-frida"
    )
    # Writes a base64 text file next to the PNG so the guest-agent file API (text only) can carry it.
    # The capture must happen in the lab user's session: the guest agent runs
    # as SYSTEM in session 0, which cannot see the desktop (and the client's
    # execution policy blocks a bare script there). So: start the on-demand
    # task sky-lab-screenshot (screenshot.ps1 as the lab user, writes
    # C:\sky-lab\screenshots\latest.png), wait for the file to be newer than
    # the start, copy it to {out} and write a base64 sidecar the runner reads
    # through the agent file API. Braces are doubled for str.format.
    screenshot_cmd_template: str = (
        "$t0 = Get-Date; Start-ScheduledTask -TaskName sky-lab-screenshot; "
        "$f = '{lab_dir}\\screenshots\\latest.png'; $d = (Get-Date).AddSeconds(25); "
        "while ((Get-Date) -lt $d -and -not ((Test-Path $f) -and (Get-Item $f).LastWriteTime -gt $t0)) {{ Start-Sleep -Milliseconds 500 }}; "
        "if (-not ((Test-Path $f) -and (Get-Item $f).LastWriteTime -gt $t0)) {{ Write-Error 'no new latest.png within 25 s'; exit 3 }}; "
        "New-Item -ItemType Directory -Force -Path (Split-Path '{out}') | Out-Null; Copy-Item $f '{out}' -Force; "
        "[Convert]::ToBase64String([IO.File]::ReadAllBytes('{out}')) | Set-Content -Path '{out}.b64' -NoNewline"
    )
    # The game versions the lab plays (ADR-022) and, for each, the host
    # directory of the master files the server mounts at /srv/skymp/esm for a
    # run on it (the compose file's ESM_DIR). A server and its clients must
    # run the same masters: skymp5-client compares size and CRC32 with the
    # server's manifest. A run plays the request's version, else the
    # scenario's, else game_default (the version players run, ADR-025).
    game_default: str = "1.6.1170"
    game_esm_dirs: str = "1.7.104=/srv/persist/esm;1.6.1170=/srv/persist/esm/1.6.1170"
    # The server's settings file for each version (the compose file's
    # SERVER_SETTINGS): the load orders differ, since RaceMenu's plugins are
    # full slots that only 1.6.1170 loads (ADR-025). Same format as above.
    game_server_settings: str = (
        "1.7.104=/srv/lab/server/server-settings-1.7.104.json;"
        "1.6.1170=/srv/lab/server/server-settings.json"
    )
    # Run through the guest agent after a client's first heartbeat: the game
    # process's identity (pid@start, UTC), then the path and file version of the
    # SkyrimSE.exe that is running, one per line. The logon launcher picks the
    # folder; this checks what it started, and the run's end reads the identity
    # again (a game replaced or lost mid-run is a lab fault, Runner._crash_check).
    # First, "base <hex>": the image's base address as skse64.log prints it, for ADR-036's note that a relaunch
    # within one boot tends to keep the base a cold boot randomizes (Mandiant, "Six facts about address space layout
    # randomization on Windows", 2020); the lines after it are read from the end, so a check without it still parses.
    game_check_cmd: str = (
        "$p = Get-Process SkyrimSE -ErrorAction SilentlyContinue | Select-Object -First 1; "
        "if (-not $p) { Write-Error 'no SkyrimSE process'; exit 3 }; "
        "'base ' + $p.MainModule.BaseAddress.ToInt64().ToString('X16'); "
        "'' + $p.Id + '@' + $p.StartTime.ToUniversalTime().ToString('o'); "
        "$p.Path; (Get-Item -LiteralPath $p.Path).VersionInfo.FileVersion"
    )
    # Timeouts and budgets (seconds); time_scale shrinks scenario waits in tests.
    step_timeout_s: float = 60.0
    # connect / reconnect: how long the server may take to report the client
    # online. A clone's logon launcher relaunches the game 40 s after a launch
    # that lost the Steam startup race, and a reconnect after a server restart
    # takes about 40 s, so one retry has to fit (run 20261001-233852: c2 came
    # online after the 60 s budget while every other run of the day logged in
    # within a second of its step).
    connect_timeout_s: float = 120.0
    # After the server reports the client online, the client still refuses
    # MoveRefrToPosition until its generated save has loaded and fifty Papyrus
    # updates have passed (Skyrim Platform's LoadGame sink; about eight seconds
    # after online on sky-c1, measured 2026-10-01, longer when the load is slow),
    # so a teleport sent in that window is dropped on the client and the
    # server's record snaps back to the client's real position within three
    # seconds. The teleport step therefore judges itself by the server's
    # record: send, wait teleport_settle_s, read back, and send again until the
    # record sits within teleport_tolerance units of the target or
    # teleport_timeout_s is spent. connect_settle_s is an extra pause after
    # online for scenarios that need one; the judged teleport needs none.
    connect_settle_s: float = 0.0
    teleport_settle_s: float = 3.0
    teleport_timeout_s: float = 60.0
    teleport_tolerance: float = 64.0
    # a cold boot of a clone to its first lab-driver poll: Windows, the logon,
    # Steam's own startup (65 s on sky-c2 on 2026-10-03, launch.ps1 waits for
    # it), the game and Skyrim Platform; 180 s was too tight that day
    heartbeat_timeout_s: float = 300.0
    server_ready_timeout_s: float = 120.0
    guest_task_timeout_s: float = 120.0
    # a run that starts this long after the last one ended follows a quiet
    # spell (a playtest, hand probes) and keeps the clients' Skyrim Platform
    # logs as <client>-before.log before rolling them back; inside a sweep the
    # runs are seconds apart and the clients hold only the previous run's log;
    # 0 turns the fetch off (the server's own log is kept regardless)
    before_logs_quiet_s: float = 600.0
    # A seat that stops answering mid-run (a step that times out naming it: the load freeze of
    # 2026-10-16, a game silent after PostLoadGame) holds the only evidence of why, and the next
    # run's rollback erases it. With hang_evidence on, that run's artifacts take the seat's
    # skse64.log and a full dump of SkyrimSE.exe (dbghelp's MiniDumpWriteDump from PowerShell
    # as SYSTEM: nothing installed), which the seat uploads itself to
    # PUT {client_lab_api_url}/clients/<client>/hang-dump/<run>: <client>-SkyrimSE.dmp, a few GB.
    hang_evidence: bool = True
    hang_dump_timeout_s: float = 900.0
    # A mod's start-up message box over a seat's game from its first load pauses it for the whole run (x-body-release
    # 20261025-235731: Intuitive Dragon Ride Control's own "SKSE is not loaded" check racing c2's load, so c2 measured
    # nothing and the run ended E_RUN_PAUSED). With clear_start_box on, start_box_wait_s after each connect lab-api reads
    # the seat's menus once and closes a MessageBoxMenu it finds, saying so in the run's notes; a box raised later in
    # the run stays a finding (E_RUN_PAUSED at the assert or the end). OFF by default since 2026-10-26: its wait made
    # every connect and reconnect 3 s slower (the nightly 20261026-104926: 197 steps at 3.04 s or more, 0.009 s
    # before), which pushed m0-death's check past the server's 25 s respawn (145408); and its close posts a kHide
    # that IDRC's box ignores ("it stayed after a close", x-quit-scan 021707), while the box has not come since the
    # Frida watcher went headless (20f10f31). The end check still reads a box (E_RUN_PAUSED). CLEAR_START_BOX=1 turns
    # it back on for a seat that needs it.
    clear_start_box: bool = False
    start_box_wait_s: float = 3.0
    # lab-api as the clones reach it (lab-driver-settings.txt: labApiBase + labApiPath)
    client_lab_api_url: str = "http://10.10.70.10/lab"
    # where Windows Error Reporting writes SkyrimSE.exe's crash dumps on a clone (LocalDumps'
    # DumpFolder, lab/deploy/sky-client/crash-dumps.ps1), which every run's end reads; the read
    # and the upload of a minidump (about 80 MB) fit well inside the timeout, which bounds a run's
    # end on a seat whose guest agent stopped answering
    client_dump_dir: str = r"C:\sky-lab\dumps"
    crash_check_timeout_s: float = 300.0
    # relaunch: a player quits the game and starts it again (docs/verbs/
    # map-markers.md). The guest agent stops the game and starts the logon
    # launch task (sky-lab-launch, as `lab` on the desktop); the launcher
    # asks lab-api which version to start. A fresh launch to in-game took 90
    # to 120 s on the clones (launch.log).
    # The launch task is stopped before the game (ADR-036): install-lab.ps1:104 registers it IgnoreNew, and
    # launch.ps1 watches its game for a minute after the window and starts it again itself when it exits inside
    # that minute (launch.ps1:117-135), so a kill in that minute was followed by the old launcher's own launch,
    # with that boot's game folder and solo switch, while the Start-ScheduledTask was dropped (the ADR's review,
    # 2026-10-17). Stopped first, the old launcher neither relaunches nor keeps a pid log, and the start is a
    # fresh launch.ps1. The relaunch step, its files lever and the relaunch between runs all stop this way.
    relaunch_stop_cmd: str = (
        "Stop-ScheduledTask -TaskName sky-lab-launch -ErrorAction SilentlyContinue; "
        "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3"
    )
    # a relaunch {frida} starts the game alone: its files step stopped it and the watcher is armed
    relaunch_start_cmd: str = "Start-ScheduledTask -TaskName sky-lab-launch"
    relaunch_cmd: str = relaunch_stop_cmd + "; " + relaunch_start_cmd
    relaunch_timeout_s: float = 300.0
    # ADR-036: how a seat starts a run. "rollback" stops its VM, rolls the disk back to its snapshot and boots it,
    # two vfio resets of its GPU (sky-c2's GTX 1050 wedged at one twice on 2026-10-29, at 02:44 PDT and at 14:03 PDT on
    # its 37th rollback of the day, the sixth wedge in sixteen days; docs/LOG.md). "relaunch" stops the game, cleans
    # what a run leaves and starts the launch task with the VM left running, and rolls back only when something
    # asks (Runner._rollback_reason).
    # Rollback until the first live day has measured the other; anything else is refused at load.
    client_reset: str = "rollback"
    # in relaunch mode a seat rolls back once it has played this many runs since its last rollback, as a floor
    relaunch_rollback_every: int = 20
    # relaunch tries before the seat rolls back in that same run (a try is the guest exec and the new game's poll)
    reset_relaunch_tries: int = 2
    # how long one relaunch try waits for the new game's poll: launch.ps1's 15 s settle (launch.ps1:78), a window in
    # about 30 s and the login put a good try's poll near a minute (ADR-036's measured relaunch, a median 31.5 s in
    # game), so 180 s is a slow try's bound, well short of heartbeat_timeout_s: two tries at 300 s and the rollback
    # after them would outlast a scenario's own timeout
    relaunch_heartbeat_timeout_s: float = 180.0
    # seconds between one seat's GPU reset (a VM stop or start) and another's (proxmox.GuestControl, core's
    # dual-reset finding of 2026-10-30: every wedge came with both lab cards reset within seconds)
    reset_stagger_s: float = 20.0
    # how a client seat's VM stops before a rollback (proxmox.GuestControl): "stop" at once, or "shutdown" (an ACPI
    # shutdown PVE forces to a stop after seat_shutdown_timeout_s), for the night's question of 2026-10-30 whether a
    # running NVIDIA driver pulled out from under its GPU matters to the wedges
    seat_stop: str = "stop"
    seat_shutdown_timeout_s: int = 60
    # Before a self-service snapshot (proxmox.GuestControl.snapshot_clone):
    # stop the game, its loader and Windows Error Reporting, and any running
    # sky-lab task, so the clone shuts down quiet (thuum-mundus's recipe). Then
    # empty the crash dump folders and WER's report queues, so no image carries
    # an old crash into every run that rolls back to it (2026-10-17: c2's
    # clean-m1 held five Skyrim dumps of 10-15 under C:\sky-lab\dumps, c1's a
    # queued WER report of 10-06, and sunshine.exe dumps sat under SYSTEM's
    # CrashDumps on both).
    quiesce_cmd: str = (
        "Get-Process SkyrimSE, skse64_loader, WerFault -ErrorAction SilentlyContinue | Stop-Process -Force; "
        "Get-ScheduledTask -TaskName 'sky-lab*' -ErrorAction SilentlyContinue | "
        "Where-Object { $_.State -eq 'Running' } | Stop-ScheduledTask; "
        r"Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -Path 'C:\sky-lab\dumps\*', "
        r"'C:\Windows\System32\config\systemprofile\AppData\Local\CrashDumps\*', 'C:\Users\*\AppData\Local\CrashDumps\*', "
        r"'C:\ProgramData\Microsoft\Windows\WER\ReportQueue\*', 'C:\ProgramData\Microsoft\Windows\WER\ReportArchive\*'"
    )
    time_scale: float = 1.0
    extra: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        # a mistyped mode must stop lab-api at its start, not leave the lab in a reset nobody chose
        if self.client_reset not in CLIENT_RESETS:
            raise ValueError(f"LAB_CLIENT_RESET is one of {', '.join(CLIENT_RESETS)}, not {self.client_reset!r}")
        if self.seat_stop not in SEAT_STOPS:
            raise ValueError(f"LAB_SEAT_STOP is one of {', '.join(SEAT_STOPS)}, not {self.seat_stop!r}")

    def game_versions(self) -> dict[str, str]:
        """game_esm_dirs as {version: host directory of its master files}."""
        return _version_map(self.game_esm_dirs)

    def game_settings_files(self) -> dict[str, str]:
        """game_server_settings as {version: host path of its settings file}."""
        return _version_map(self.game_server_settings)

    @classmethod
    def from_env(cls) -> "Settings":
        d = cls()
        return cls(
            root_path=_env("LAB_ROOT_PATH", d.root_path),
            version=_env("LABAPI_VERSION", d.version),
            listen_port=int(_env("LAB_LISTEN_PORT", str(d.listen_port))),
            pve_url=_env("PVE_URL", d.pve_url),
            pve_token_id=_env("PVE_TOKEN_ID", d.pve_token_id),
            pve_token_secret=_env("PVE_TOKEN_SECRET", d.pve_token_secret),
            pve_timeout_s=float(_env("PVE_TIMEOUT_S", str(d.pve_timeout_s))),
            pve_node=_env("PVE_NODE", d.pve_node),
            pve_verify_ssl=_env_verify("PVE_VERIFY_SSL", d.pve_verify_ssl),
            results_dir=_env("RESULTS_DIR", d.results_dir),
            guests_file=_env("GUESTS_FILE", d.guests_file),
            compose_file=_env("COMPOSE_FILE", d.compose_file),
            compose_service=_env("COMPOSE_SERVICE", d.compose_service),
            server_world_dir=_env("SERVER_WORLD_DIR", d.server_world_dir),
            server_snapshots_dir=_env("SERVER_SNAPSHOTS_DIR", d.server_snapshots_dir),
            server_uid=int(_env("SERVER_UID", str(d.server_uid))),
            server_gid=int(_env("SERVER_GID", str(d.server_gid))),
            server_ui_port=int(_env("SERVER_UI_PORT", str(d.server_ui_port))),
            server_port=int(_env("SERVER_PORT", str(d.server_port))),
            fakeclient_bin=_env("FAKECLIENT_BIN", d.fakeclient_bin),
            fakeclient_timeout_s=float(_env("FAKECLIENT_TIMEOUT_S", str(d.fakeclient_timeout_s))),
            server_snapshot_default=_env("SERVER_SNAPSHOT_DEFAULT", d.server_snapshot_default),
            server_rollback_mode=_env("SERVER_ROLLBACK_MODE", d.server_rollback_mode),
            server_state_url=_env("SERVER_STATE_URL", d.server_state_url),
            lab_api_internal_url=_env("LAB_API_INTERNAL_URL", d.lab_api_internal_url),
            frida_scripts_dir=_env("FRIDA_SCRIPTS_DIR", d.frida_scripts_dir),
            scenarios_dir=_env("SCENARIOS_DIR", d.scenarios_dir),
            fixture_worlds_dir=_env("FIXTURE_WORLDS_DIR", d.fixture_worlds_dir),
            references_dir=_env("REFERENCES_DIR", d.references_dir),
            nightly_sweep_utc=_env("NIGHTLY_SWEEP_UTC", d.nightly_sweep_utc),
            nightly_quiet_s=float(_env("NIGHTLY_QUIET_S", str(d.nightly_quiet_s))),
            nightly_window_s=float(_env("NIGHTLY_WINDOW_S", str(d.nightly_window_s))),
            heartbeat_fresh_s=float(_env("HEARTBEAT_FRESH_S", str(d.heartbeat_fresh_s))),
            netem_dev=_env("NETEM_DEV", d.netem_dev),
            pcap_iface=_env("PCAP_IFACE", d.pcap_iface),
            game_port=int(_env("GAME_PORT", str(d.game_port))),
            client_lab_dir=_env("CLIENT_LAB_DIR", d.client_lab_dir),
            client_lab_user=_env("CLIENT_LAB_USER", d.client_lab_user),
            client_driver_log=_env("CLIENT_DRIVER_LOG", d.client_driver_log),
            client_plugin_log=_env("CLIENT_PLUGIN_LOG", d.client_plugin_log),
            client_console_log=_env("CLIENT_CONSOLE_LOG", d.client_console_log),
            frida_exec_template=_env("FRIDA_EXEC_TEMPLATE", d.frida_exec_template),
            screenshot_cmd_template=_env("SCREENSHOT_CMD_TEMPLATE", d.screenshot_cmd_template),
            step_timeout_s=float(_env("STEP_TIMEOUT_S", str(d.step_timeout_s))),
            connect_timeout_s=float(_env("CONNECT_TIMEOUT_S", str(d.connect_timeout_s))),
            connect_settle_s=float(_env("CONNECT_SETTLE_S", str(d.connect_settle_s))),
            teleport_settle_s=float(_env("TELEPORT_SETTLE_S", str(d.teleport_settle_s))),
            teleport_timeout_s=float(_env("TELEPORT_TIMEOUT_S", str(d.teleport_timeout_s))),
            teleport_tolerance=float(_env("TELEPORT_TOLERANCE", str(d.teleport_tolerance))),
            heartbeat_timeout_s=float(_env("HEARTBEAT_TIMEOUT_S", str(d.heartbeat_timeout_s))),
            server_ready_timeout_s=float(_env("SERVER_READY_TIMEOUT_S", str(d.server_ready_timeout_s))),
            guest_task_timeout_s=float(_env("GUEST_TASK_TIMEOUT_S", str(d.guest_task_timeout_s))),
            before_logs_quiet_s=float(_env("BEFORE_LOGS_QUIET_S", str(d.before_logs_quiet_s))),
            hang_evidence=_env_bool("HANG_EVIDENCE", d.hang_evidence),
            hang_dump_timeout_s=float(_env("HANG_DUMP_TIMEOUT_S", str(d.hang_dump_timeout_s))),
            clear_start_box=_env_bool("CLEAR_START_BOX", d.clear_start_box),
            start_box_wait_s=float(_env("START_BOX_WAIT_S", str(d.start_box_wait_s))),
            client_lab_api_url=_env("CLIENT_LAB_API_URL", d.client_lab_api_url),
            client_dump_dir=_env("CLIENT_DUMP_DIR", d.client_dump_dir),
            crash_check_timeout_s=float(_env("CRASH_CHECK_TIMEOUT_S", str(d.crash_check_timeout_s))),
            client_reset=_env("LAB_CLIENT_RESET", d.client_reset).strip() or d.client_reset,  # unset or empty: rollback
            relaunch_rollback_every=int(_env("LAB_RELAUNCH_ROLLBACK_EVERY", str(d.relaunch_rollback_every))),
            relaunch_heartbeat_timeout_s=float(_env("LAB_RELAUNCH_HEARTBEAT_TIMEOUT_S", str(d.relaunch_heartbeat_timeout_s))),
            reset_stagger_s=float(_env("LAB_RESET_STAGGER_S", str(d.reset_stagger_s))),
            seat_stop=_env("LAB_SEAT_STOP", d.seat_stop).strip() or d.seat_stop,  # unset or empty: stop
            seat_shutdown_timeout_s=int(_env("LAB_SEAT_SHUTDOWN_TIMEOUT_S", str(d.seat_shutdown_timeout_s))),
            time_scale=float(_env("TIME_SCALE", str(d.time_scale))),
            game_default=_env("GAME_DEFAULT", d.game_default),
            game_esm_dirs=_env("GAME_ESM_DIRS", d.game_esm_dirs),
            game_server_settings=_env("GAME_SERVER_SETTINGS", d.game_server_settings),
            game_check_cmd=_env("GAME_CHECK_CMD", d.game_check_cmd),
        )
