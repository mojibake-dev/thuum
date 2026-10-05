"""Settings from environment variables only. Every knob has a default that
works on sky-srv as docs/LAB.md describes it; tests override by constructing
Settings directly."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent
LAB_DIR = PKG_DIR.parent.parent  # lab/


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
    # Fault injection and capture, on sky-srv.
    netem_dev: str = "eth0"
    pcap_iface: str = "any"
    game_port: int = 7777
    # Inside a Windows client (template build, Track L2).
    client_lab_dir: str = r"C:\sky-lab"
    # The client log artifact (c1.log): Skyrim Platform's own log, which always
    # exists and carries plugin load, JavaScript exceptions and latent-call
    # traces. lab-driver's writeLogs sink (Data\Platform\Logs\lab-driver-logs.txt
    # in the game directory) only appears once the driver logs an error.
    client_driver_log: str = r"C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE\skyrim-platform.log"
    # lab-driver's own log (Skyrim Platform's writeLogs), relative to the game
    # directory the client recorded in {client_lab_dir}\game-dir.txt at install;
    # collected as <client>-driver.log beside <client>.log.
    client_plugin_log: str = r"Data\Platform\Logs\lab-driver-logs.txt"
    # PowerShell run through the guest agent. {url} {name} {lab_dir} {out} are filled in.
    # frida-inject (the standalone injector, staged by `just client-frida`) attaches
    # to the game by name once it exists plus five seconds (attaching at process
    # start never loaded the agent, 2026-10-01) and keeps running until the game
    # ends; its stdout is the trace. It must run in the lab user's session, the
    # game's: as SYSTEM through the guest agent it failed on both clones on
    # 2026-10-05 ("refused to load frida-agent"), while the same command through
    # the sky-lab-run task (register-runner.ps1, as `lab` on the desktop)
    # attached. So the watcher becomes C:\sky-lab\run.ps1 and that task runs it.
    # Braces are doubled for str.format.
    frida_exec_template: str = (
        "Invoke-WebRequest -UseBasicParsing -Uri '{url}' -OutFile '{lab_dir}\\frida\\{name}'; "
        "$w = @'\n"
        "$d = '{lab_dir}\\frida'; for ($i = 0; $i -lt 1500; $i++) {{ $p = Get-Process SkyrimSE -ErrorAction SilentlyContinue; if ($p) {{ break }}; Start-Sleep -Milliseconds 200 }}; "
        "if ($p) {{ Start-Sleep -Seconds 5; Start-Process -FilePath \"$d\\frida-inject.exe\" -ArgumentList '-p', $p.Id, '-s', \"$d\\{name}\" -RedirectStandardOutput \"$d\\{name}.out\" -RedirectStandardError \"$d\\{name}.err\" -WindowStyle Hidden }}\n"
        "'@; Set-Content -Path '{lab_dir}\\run.ps1' -Value $w; "
        "Start-ScheduledTask -TaskName sky-lab-run"
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
    # scenario's, else game_default (what Steam ships, ADR-018).
    game_default: str = "1.7.104"
    game_esm_dirs: str = "1.7.104=/srv/persist/esm;1.6.1170=/srv/persist/esm/1.6.1170"
    # Run through the guest agent after a client's first heartbeat: the path
    # and file version of the SkyrimSE.exe that is running, one per line.
    # The logon launcher picks the folder; this checks what it started.
    game_check_cmd: str = (
        "$p = Get-Process SkyrimSE -ErrorAction SilentlyContinue | Select-Object -First 1; "
        "if (-not $p) { Write-Error 'no SkyrimSE process'; exit 3 }; "
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
    # relaunch: a player quits the game and starts it again (docs/verbs/
    # map-markers.md). The guest agent stops the game and starts the logon
    # launch task (sky-lab-launch, as `lab` on the desktop); the launcher
    # asks lab-api which version to start. A fresh launch to in-game took 90
    # to 120 s on the clones (launch.log).
    relaunch_cmd: str = (
        "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; "
        "Start-Sleep -Seconds 3; Start-ScheduledTask -TaskName sky-lab-launch"
    )
    relaunch_timeout_s: float = 300.0
    time_scale: float = 1.0
    extra: dict = field(default_factory=dict)

    def game_versions(self) -> dict[str, str]:
        """game_esm_dirs as {version: host directory of its master files}."""
        out: dict[str, str] = {}
        for part in self.game_esm_dirs.split(";"):
            version, sep, path = part.partition("=")
            if sep and version.strip() and path.strip():
                out[version.strip()] = path.strip()
        return out

    @classmethod
    def from_env(cls) -> "Settings":
        d = cls()
        return cls(
            root_path=_env("LAB_ROOT_PATH", d.root_path),
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
            netem_dev=_env("NETEM_DEV", d.netem_dev),
            pcap_iface=_env("PCAP_IFACE", d.pcap_iface),
            game_port=int(_env("GAME_PORT", str(d.game_port))),
            client_lab_dir=_env("CLIENT_LAB_DIR", d.client_lab_dir),
            client_driver_log=_env("CLIENT_DRIVER_LOG", d.client_driver_log),
            client_plugin_log=_env("CLIENT_PLUGIN_LOG", d.client_plugin_log),
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
            time_scale=float(_env("TIME_SCALE", str(d.time_scale))),
            game_default=_env("GAME_DEFAULT", d.game_default),
            game_esm_dirs=_env("GAME_ESM_DIRS", d.game_esm_dirs),
            game_check_cmd=_env("GAME_CHECK_CMD", d.game_check_cmd),
        )
