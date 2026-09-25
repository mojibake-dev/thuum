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
    pve_verify_ssl: bool = True
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
    server_ui_port: int = 3000
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
    client_lab_dir: str = r"C:\lab"
    # PowerShell run through the guest agent. {url} {name} {lab_dir} {out} are filled in.
    frida_exec_template: str = (
        "Invoke-WebRequest -UseBasicParsing -Uri '{url}' -OutFile '{lab_dir}\\frida\\{name}'; "
        "Start-Process -FilePath '{lab_dir}\\frida\\frida.exe' -ArgumentList "
        "'-n','SkyrimSE.exe','-l','{lab_dir}\\frida\\{name}','-o','{lab_dir}\\frida\\{name}.jsonl'"
    )
    # Writes a base64 text file next to the PNG so the guest-agent file API (text only) can carry it.
    screenshot_cmd_template: str = "& '{lab_dir}\\screenshot.ps1' -Out '{out}'"
    # Timeouts and budgets (seconds); time_scale shrinks scenario waits in tests.
    step_timeout_s: float = 60.0
    heartbeat_timeout_s: float = 180.0
    server_ready_timeout_s: float = 120.0
    guest_task_timeout_s: float = 120.0
    time_scale: float = 1.0
    extra: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "Settings":
        d = cls()
        return cls(
            root_path=_env("LAB_ROOT_PATH", d.root_path),
            listen_port=int(_env("LAB_LISTEN_PORT", str(d.listen_port))),
            pve_url=_env("PVE_URL", d.pve_url),
            pve_token_id=_env("PVE_TOKEN_ID", d.pve_token_id),
            pve_token_secret=_env("PVE_TOKEN_SECRET", d.pve_token_secret),
            pve_node=_env("PVE_NODE", d.pve_node),
            pve_verify_ssl=_env_bool("PVE_VERIFY_SSL", d.pve_verify_ssl),
            results_dir=_env("RESULTS_DIR", d.results_dir),
            guests_file=_env("GUESTS_FILE", d.guests_file),
            compose_file=_env("COMPOSE_FILE", d.compose_file),
            compose_service=_env("COMPOSE_SERVICE", d.compose_service),
            server_world_dir=_env("SERVER_WORLD_DIR", d.server_world_dir),
            server_snapshots_dir=_env("SERVER_SNAPSHOTS_DIR", d.server_snapshots_dir),
            server_ui_port=int(_env("SERVER_UI_PORT", str(d.server_ui_port))),
            server_snapshot_default=_env("SERVER_SNAPSHOT_DEFAULT", d.server_snapshot_default),
            server_rollback_mode=_env("SERVER_ROLLBACK_MODE", d.server_rollback_mode),
            server_state_url=_env("SERVER_STATE_URL", d.server_state_url),
            lab_api_internal_url=_env("LAB_API_INTERNAL_URL", d.lab_api_internal_url),
            frida_scripts_dir=_env("FRIDA_SCRIPTS_DIR", d.frida_scripts_dir),
            netem_dev=_env("NETEM_DEV", d.netem_dev),
            pcap_iface=_env("PCAP_IFACE", d.pcap_iface),
            game_port=int(_env("GAME_PORT", str(d.game_port))),
            client_lab_dir=_env("CLIENT_LAB_DIR", d.client_lab_dir),
            frida_exec_template=_env("FRIDA_EXEC_TEMPLATE", d.frida_exec_template),
            screenshot_cmd_template=_env("SCREENSHOT_CMD_TEMPLATE", d.screenshot_cmd_template),
            step_timeout_s=float(_env("STEP_TIMEOUT_S", str(d.step_timeout_s))),
            heartbeat_timeout_s=float(_env("HEARTBEAT_TIMEOUT_S", str(d.heartbeat_timeout_s))),
            server_ready_timeout_s=float(_env("SERVER_READY_TIMEOUT_S", str(d.server_ready_timeout_s))),
            guest_task_timeout_s=float(_env("GUEST_TASK_TIMEOUT_S", str(d.guest_task_timeout_s))),
            time_scale=float(_env("TIME_SCALE", str(d.time_scale))),
        )
