"""A playtest's seats from its profile (thuum ADR-040 item 6): lab/playtests/<n>.yaml.

    just playtest-setup <n>   before the Moonlight streams: the world restored (both seats relaunched on it),
                              the hold, the camp, each seat's spells, values, items and bars (server-side, through
                              the gamemode's labCommand: never keystrokes in a seat) and perks (the seat's game's
                              own, kept for it by lab-api and lab-driver through every load and relaunch),
                              Sunshine restarted
    just playtest-ready <n>   once the streams are up: both games relaunched under them, then the checks: both
                              players online, the heartbeats, the values and items read back, the bars full, the
                              two stream windows running

A profile's `server: {npcEnabled: true}` is that playtest's server alone (ADR-035 point 9): setup lays the deployed
settings with it over them as /srv/lab/server/server-settings-run.json (the file a run's own npcEnabled uses) and the
restore recreates the server on that file; both setup and ready read the container's mount back. A lab run after the
playtest mounts its own settings again. `server: {gameHour: 7.9}` sets the clock the same way, as the runner's time
block does for a run (the epoch is setup's own time, the hour holds at it). `camp: {teleports: [...]}` names the camp's
teleports as labCommand takes them, in order, where `playtest-start` reads playtest-start.sh's two.

What pt23-setup.sh and pt23-after-streams.sh did for playtest twenty-three (2026-10-18), from a profile instead of
a script per playtest. Every set is read back: an upward set-percentages can revert within 2 s (docs/LAB.md), and a
console set the server took as a no-op shows only in its read (x-headshot-probe's "Archery", 20261018-164202).
"""
from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
API = "https://thuum.gaussing.tv/lab"
JUMP = "root@core.gaussing.tv"
SRV = "eli@10.10.70.10"
# the server's settings as deploy-srv lays them, and the overlay a run or a playtest with its own server setting
# mounts instead (lab-api's runner writes the same file for a run's npcEnabled, ADR-035 point 9)
SETTINGS = "/srv/lab/server/server-settings.json"
OVERLAY = "/srv/lab/server/server-settings-run.json"
SERVER_KEYS = {"npcEnabled", "gameHour"}
PLAYER = 20  # the console's word for the player itself (0x14)
BARS = ("health", "magicka", "stamina")


class ProfileError(ValueError):
    pass


def _int(v: Any, what: str) -> int:
    if isinstance(v, bool) or not isinstance(v, int):
        raise ProfileError(f"{what} is a whole number (hex as 0x...), got {v!r}")
    return v


def load_profile(n: int, root: Path = ROOT) -> dict[str, Any]:
    path = root / "lab" / "playtests" / f"{n}.yaml"
    if not path.is_file():
        raise ProfileError(f"no profile {path}")
    return check_profile(yaml.safe_load(path.read_text()), n)


def check_profile(p: Any, n: int) -> dict[str, Any]:
    """The profile, checked whole before anything touches the lab."""
    if not isinstance(p, dict):
        raise ProfileError("a profile is a mapping")
    if p.get("id") != n:
        raise ProfileError(f"the profile's id is {p.get('id')!r}, not {n}")
    world = p.get("world")
    if not isinstance(world, str) or not re.fullmatch(r"playtest-[A-Za-z0-9-]+", world):
        raise ProfileError(f"world is a saved playtest world (playtest-...), got {world!r}")
    hold = p.get("hold") or {}
    minutes = _int(hold.get("minutes", 180), "hold.minutes")
    if not 1 <= minutes <= 600:
        raise ProfileError("hold.minutes is 1 to 600")
    if not isinstance(hold.get("reason", ""), str):
        raise ProfileError("hold.reason is text")
    server = p.get("server") or {}
    if not isinstance(server, dict) or set(server) - SERVER_KEYS:
        raise ProfileError(f"server takes {sorted(SERVER_KEYS)}, got {server!r}")
    if "npcEnabled" in server and not isinstance(server["npcEnabled"], bool):
        raise ProfileError(f"server.npcEnabled is true or false, got {server['npcEnabled']!r}")
    hour = server.get("gameHour", 0)
    if isinstance(hour, bool) or not isinstance(hour, (int, float)) or not 0 <= hour < 24:
        raise ProfileError(f"server.gameHour is an hour from 0 up to 24, got {server['gameHour']!r}")
    camp = (p.get("camp") or {}).get("teleports")
    if isinstance(camp, list) and camp:
        for t in camp:
            _check_teleport(t)
    elif camp not in (None, "playtest-start"):
        raise ProfileError(f"camp.teleports is playtest-start, a list of teleports, or absent, got {camp!r}")
    seats = p.get("seats")
    if not isinstance(seats, list) or not seats:
        raise ProfileError("seats is a list")
    seen = set()
    for s in seats:
        prof = _int(s.get("profile"), "a seat's profile")
        if prof in seen:
            raise ProfileError(f"profile {prof} is named twice")
        seen.add(prof)
        for sp in s.get("spells") or []:
            _int(sp, f"profile {prof}'s spell")
        for pk in s.get("perks") or []:
            if _int(pk, f"profile {prof}'s perk") <= 0:
                raise ProfileError(f"profile {prof}'s perk is a form id, got {pk!r}")
        for name, v in (s.get("values") or {}).items():
            if not re.fullmatch(r"[A-Za-z]+", str(name)) or isinstance(v, bool) or not isinstance(v, (int, float)):
                raise ProfileError(f"profile {prof}'s value {name!r}: {v!r}")
        for it in s.get("items") or []:
            _int(it.get("id"), f"profile {prof}'s item id")
            if _int(it.get("count", 1), f"profile {prof}'s item count") < 1:
                raise ProfileError(f"profile {prof}'s item count is at least 1")
        for k, v in (s.get("percentages") or {}).items():
            if k not in BARS or isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 1:
                raise ProfileError(f"profile {prof}'s percentage {k}: {v!r} (health, magicka, stamina from 0 to 1)")
    for k, v in (p.get("streams") or {}).items():
        _int(v, f"stream {k}'s port")
    if ((p.get("after") or {}).get("readback")) not in (None, "percentages"):
        raise ProfileError("after.readback is percentages or absent")
    return p


def _check_teleport(t: Any) -> None:
    """A camp teleport as labCommand takes it: {kind: teleport, profileId, cell, pos: [x, y, z], rot: [x, y, z]}."""
    if not isinstance(t, dict) or set(t) != {"kind", "profileId", "cell", "pos", "rot"} or t["kind"] != "teleport":
        raise ProfileError(f"a camp teleport is {{kind: teleport, profileId, cell, pos, rot}}, got {t!r}")
    _int(t["profileId"], "a camp teleport's profileId")
    if not isinstance(t["cell"], str) or not re.fullmatch(r"[0-9a-fA-F]+:[A-Za-z0-9 _.+-]+", t["cell"]):
        raise ProfileError(f"a camp teleport's cell is <form id hex>:<plugin>, got {t['cell']!r}")
    for k in ("pos", "rot"):
        v = t[k]
        if not isinstance(v, list) or len(v) != 3 or any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in v):
            raise ProfileError(f"a camp teleport's {k} is three numbers, got {v!r}")


def overlay_text(settings_text: str, server: dict[str, Any], now: float | None = None) -> str:
    """The deployed settings with the profile's server keys over them, written as the runner writes its overlay: the
    clock's hour as its time block (wire-rules clock.rs: a pure function of the wall clock that reads start.hour at the
    epoch, so the epoch is setup's own time)."""
    d = json.loads(settings_text)
    if "npcEnabled" in server:
        d["npcEnabled"] = server["npcEnabled"]
    if "gameHour" in server:
        block = dict(d.get("time") or {})
        block["epoch"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() if now is None else now))
        block["start"] = {**(block.get("start") or {}), "hour": server["gameHour"]}
        d["time"] = block
    return json.dumps(d, indent=2) + "\n"


def camp_teleports(root: Path = ROOT) -> list[dict[str, Any]]:
    """playtest-start.sh's two camp teleports, read from the script itself (one source for the camp)."""
    text = (root / "lab" / "tools" / "playtest-start.sh").read_text()
    out = [json.loads(m) for m in re.findall(r"^cmd '(\{\"kind\":\"teleport\".*\})'$", text, re.M)]
    if len(out) != 2:
        raise ProfileError(f"playtest-start.sh has {len(out)} camp teleports, not 2")
    return out


def seat_commands(seat: dict[str, Any], have: dict[int, int] | None = None) -> list[tuple[str, dict[str, Any]]]:
    """A seat's server-side sets as labCommand payloads, in order: spells, values, items. An item's count is what
    the seat should carry: given `have` (what it carries now, by base id), only the shortfall is added, since a
    restored world keeps the last playtest's items and a plain add grew the piles (playtest 28's test 1 at four iron
    swords and three capes, 2026-10-20)."""
    prof = seat["profile"]
    out = []
    for sp in seat.get("spells") or []:
        out.append((f"AddSpell {sp:#x}", {"kind": "console", "profileId": prof, "name": "AddSpell", "args": [PLAYER, sp]}))
    for name, v in (seat.get("values") or {}).items():
        out.append((f"SetAV {name} {v}", {"kind": "console", "profileId": prof, "name": "SetAV", "args": [PLAYER, name, v]}))
    for it in seat.get("items") or []:
        n = it.get("count", 1) - (have or {}).get(it["id"], 0)
        if n > 0:
            out.append((f"AddItem {it['id']:#x} {n}", {"kind": "console", "profileId": prof, "name": "AddItem", "args": [PLAYER, it["id"], n]}))
    return out


# ----- the lab --------------------------------------------------------------------------------------------------


def _http(method: str, path: str, body: Any = None) -> Any:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read().decode()
    return json.loads(raw) if raw.strip() else {}


def command(payload: dict[str, Any]) -> dict[str, Any]:
    return _http("POST", "/state/rpc/labCommand", {"payload": payload})


def state(payload: dict[str, Any]) -> dict[str, Any]:
    return _http("POST", "/state/rpc/labState", {"payload": payload})


class Report:
    def __init__(self) -> None:
        self.bad: list[str] = []

    def ok(self, line: str) -> None:
        print(f"   ok {line}", flush=True)

    def fail(self, line: str) -> None:
        print(f"   FAILED {line}", flush=True)
        self.bad.append(line)

    def note(self, line: str) -> None:
        print(f"   {line}", flush=True)


def _set_bars(rep: Report, prof: int, want: dict[str, float]) -> None:
    """set-percentages, read back 8 s later, set again up to three times (docs/LAB.md: an upward set can revert)."""
    for attempt in (1, 2, 3):
        command({"kind": "set-percentages", "profileId": prof, **want})
        time.sleep(8)
        a = state({"kind": "actor", "profileId": prof})
        got = {k: float(a.get(f"{k}Percentage") or 0) for k in want}
        if all(abs(got[k] - want[k]) < 1e-3 for k in want):
            rep.ok(f"profile {prof} bars {got} (set {attempt})")
            return
        rep.note(f"profile {prof} bars {got} 8 s after set {attempt}: again")
    rep.fail(f"profile {prof} bars did not hold {want} after three sets")


def _value(prof: int, name: str) -> Any:
    return command({"kind": "papyrus-av", "profileId": prof, "how": "get", "name": name}).get("value")


def _count(prof: int, base: int) -> int:
    return sum(int(e.get("count", 0)) for e in state({"kind": "inventory", "profileId": prof}).get("entries", []) if e.get("baseId") == base)


def seat_client(prof: int, root: Path = ROOT) -> str:
    """The client whose player is profile `prof`, from lab-api's own clients table."""
    g = yaml.safe_load((root / "lab" / "labapi" / "labapi" / "guests.yaml").read_text())
    for name, c in (g.get("clients") or {}).items():
        if (c or {}).get("profile_id") == prof:
            return name
    raise ProfileError(f"no client plays profile {prof}")


def _perks(rep: Report, prof: int, ids: list[int]) -> None:
    """A seat's perks: the player's game's own (no server path until M5), so they go to its lab-driver, which keeps
    them through every load, and lab-api sends them again to a relaunched game (POST /clients/<c>/perks)."""
    client = seat_client(prof)
    want = ", ".join(f"{i:#x}" for i in ids)
    try:
        ans = _http("POST", f"/clients/{client}/perks", {"ids": ids})
    except Exception as e:  # an HTTP refusal or a game that did not answer: the line says which
        rep.fail(f"profile {prof} perks {want}: {e}")
        return
    r = ans.get("result") or {}
    have = set(r.get("added") or []) | set(r.get("had") or [])
    line = f"profile {prof} perks {want}: added {r.get('added')}, had {r.get('had')}"
    if r.get("missing") or r.get("refused"):
        line += f", missing {r.get('missing')}, refused {r.get('refused')}"
    (rep.ok if have == set(ids) else rep.fail)(line)


def _guest_exec(vmid: int, ps: str, timeout: int = 60) -> dict[str, Any]:
    enc = base64.b64encode(ps.encode("utf-16-le")).decode()
    r = subprocess.run(["ssh", "-o", "BatchMode=yes", JUMP, f"qm guest exec {vmid} --timeout {timeout} -- powershell -NoProfile -NonInteractive -EncodedCommand {enc}"],
                       capture_output=True, text=True, timeout=timeout + 60)
    return json.loads(r.stdout) if r.stdout.strip() else {"exitcode": -1, "err-data": r.stderr}


def _srv(cmd: str, stdin: str | None = None, timeout: int = 60) -> str:
    r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-J", JUMP, SRV, cmd], input=stdin, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"sky-srv: {cmd[:60]}: {r.stderr.strip()[:200]}")
    return r.stdout


def _lay_overlay(server: dict[str, Any]) -> str:
    """The profile's own server setting laid beside the world (the deployed settings with it over them); the
    restore then recreates the server on it, so the shared file never carries it."""
    # lab-api's runner writes the same file as root from its container (a run's npcEnabled), so the playtest's
    # write goes through sudo too, into the same file and mode (playtest thirty's setup, 2026-10-21 13:5x: denied)
    _srv(f"sudo tee {OVERLAY} > /dev/null", stdin=overlay_text(_srv(f"cat {SETTINGS}"), server))
    return OVERLAY


def _mounted_settings() -> str:
    fmt = '{{range .Mounts}}{{if eq .Destination "/srv/skymp/server-settings.json"}}{{.Source}}{{end}}{{end}}'
    return _srv(f"docker inspect --format '{fmt}' lab-skymp-server-1").strip()


def _clients(root: Path = ROOT) -> dict[str, int]:
    """client name -> vmid of the managed clones, from lab-api's own table."""
    g = yaml.safe_load((root / "lab" / "labapi" / "labapi" / "guests.yaml").read_text())
    return {x["client"]: int(x["vmid"]) for x in g.get("guests", []) if x.get("client") and x.get("managed")}


def setup(n: int) -> int:
    p = load_profile(n)
    rep = Report()
    print(f"== playtest {n}: {p.get('build', '')}", flush=True)
    env = dict(os.environ)
    server = p.get("server") or {}
    if server:
        overlay = _lay_overlay(server)
        env["PLAYTEST_SERVER_SETTINGS"] = overlay
        rep.ok(f"server {server} laid over the deployed settings: {overlay}")
    print(f"== restore {p['world']} (both seats relaunched on it) {time.strftime('%H:%M:%S')}", flush=True)
    r = subprocess.run([str(ROOT / "lab/tools/playtest-world.sh"), "restore", p["world"]], text=True, env=env)
    if r.returncode != 0:
        print("== the restore failed: no setup", flush=True)
        return 2
    if server:
        got = _mounted_settings()
        (rep.ok if got == OVERLAY else rep.fail)(f"the server runs on {got or 'no settings mount'} (wanted {OVERLAY})")
    hold = p.get("hold") or {}
    _http("POST", "/hold", {"minutes": int(hold.get("minutes", 180)), "reason": hold.get("reason") or f"playtest {n}"})
    rep.ok(f"hold {hold.get('minutes', 180)} min: {hold.get('reason') or f'playtest {n}'}")
    camp = (p.get("camp") or {}).get("teleports")
    if camp:
        print(f"== the camp {time.strftime('%H:%M:%S')}", flush=True)
        for t in camp_teleports() if camp == "playtest-start" else camp:
            ans = command(t)
            (rep.ok if ans.get("ok") else rep.fail)(f"teleport profile {t['profileId']} to {t['pos']}: {ans}")
    for seat in p["seats"]:
        prof = seat["profile"]
        print(f"== profile {prof}: {seat.get('name', '')} {time.strftime('%H:%M:%S')}", flush=True)
        before = {it["id"]: _count(prof, it["id"]) for it in seat.get("items") or []}
        for label, payload in seat_commands(seat, before):
            ans = command(payload)
            (rep.ok if ans.get("ok") else rep.fail)(f"{label}" + ("" if ans.get("ok") else f": {ans}"))
        time.sleep(2)
        for name, v in (seat.get("values") or {}).items():
            got = _value(prof, name)
            (rep.ok if isinstance(got, (int, float)) and abs(got - v) < 1e-3 else rep.fail)(f"{name} reads {got} on the server (wanted {v})")
        for it in seat.get("items") or []:
            got = _count(prof, it["id"])
            want = it.get("count", 1)
            (rep.ok if got >= want else rep.fail)(f"carries {got} of {it['id']:#x} (had {before[it['id']]}, wanted {want})")
        if seat.get("perks"):
            _perks(rep, prof, seat["perks"])
        if seat.get("percentages"):
            _set_bars(rep, prof, {k: float(v) for k, v in seat["percentages"].items()})
        if seat.get("by_hand"):
            rep.note(f"by hand, in the seat's own game: {seat['by_hand']}")
    print(f"== Sunshine {time.strftime('%H:%M:%S')}", flush=True)
    # polled to 20 s, not read once at 3: on sky-c2's RTX the service read Stopped 3 s after its restart and Running
    # 12 s later (playtest 39, 2026-10-30)
    ps = ("Restart-Service SunshineService -Force; $s = ''; foreach ($i in 1..20) { Start-Sleep -Seconds 1; "
          "$s = [string](Get-Service SunshineService).Status; if ($s -eq 'Running') { break } }; 'sunshine ' + $s + ' after ' + $i + ' s'")
    for client, vmid in sorted(_clients().items()):
        d = _guest_exec(vmid, ps)
        out = (d.get("out-data") or "").strip()
        (rep.ok if "sunshine Running" in out else rep.fail)(f"{client} ({vmid}): {out or d.get('err-data', '')[:200]}")
    print(f"== setup done {time.strftime('%H:%M:%S')}: {'all ok' if not rep.bad else str(len(rep.bad)) + ' failed'}", flush=True)
    return 0 if not rep.bad else 1


def ready(n: int) -> int:
    p = load_profile(n)
    rep = Report()
    print(f"== playtest {n}: both games relaunched under the streams {time.strftime('%H:%M:%S')}", flush=True)
    procs = [subprocess.Popen([str(ROOT / "lab/tools/playtest-relaunch.sh"), c], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) for c in ("c1", "c2")]
    for c, pr in zip(("c1", "c2"), procs):
        out = (pr.communicate()[0] or "").strip().splitlines()
        (rep.ok if pr.returncode == 0 else rep.fail)(f"{c}: {out[-1] if out else 'no output'}")
    online = sorted(x.get("profileId") for x in state({"kind": "online"}).get("players", []))
    want = sorted(s["profile"] for s in p["seats"])
    (rep.ok if online == want else rep.fail)(f"online {online} (wanted {want})")
    if p.get("server"):
        got = _mounted_settings()
        (rep.ok if got == OVERLAY else rep.fail)(f"the server runs on {got or 'no settings mount'} (wanted {OVERLAY}, the profile's server {p['server']})")
    st = _http("GET", "/status")
    hb = st.get("heartbeats_s_ago") or {}
    (rep.ok if hb and all(v < 5 for v in hb.values()) else rep.fail)(f"heartbeats {hb}")
    rep.note(f"hold {(st.get('hold') or {}).get('reason')} until {(st.get('hold') or {}).get('until')}")
    for seat in p["seats"]:
        prof = seat["profile"]
        for name, v in (seat.get("values") or {}).items():
            got = _value(prof, name)
            if isinstance(got, (int, float)) and abs(got - v) < 1e-3:
                rep.ok(f"profile {prof} {name} {got}")
            else:
                command({"kind": "console", "profileId": prof, "name": "SetAV", "args": [PLAYER, name, v]})
                time.sleep(2)
                got = _value(prof, name)
                (rep.ok if isinstance(got, (int, float)) and abs(got - v) < 1e-3 else rep.fail)(f"profile {prof} {name} set again: {got}")
        for it in seat.get("items") or []:
            got = _count(prof, it["id"])
            (rep.ok if got >= it.get("count", 1) else rep.fail)(f"profile {prof} carries {got} of {it['id']:#x}")
        if seat.get("perks"):
            _perks(rep, prof, seat["perks"])  # the relaunched game's, read back from its driver
        if seat.get("percentages") and (p.get("after") or {}).get("readback") == "percentages":
            want_bars = {k: float(v) for k, v in seat["percentages"].items()}
            a = state({"kind": "actor", "profileId": prof})
            got = {k: float(a.get(f"{k}Percentage") or 0) for k in want_bars}
            if all(abs(got[k] - want_bars[k]) < 1e-3 for k in want_bars):
                rep.ok(f"profile {prof} bars {got}")
            else:
                _set_bars(rep, prof, want_bars)
    for name, port in (p.get("streams") or {}).items():
        r = subprocess.run(["pgrep", "-f", f"Moonlight stream core.gaussing.tv:{port}"], capture_output=True, text=True)
        pids = r.stdout.split()
        (rep.ok if len(pids) == 1 else rep.fail)(f"stream {name} ({port}): {'pid ' + pids[0] if len(pids) == 1 else (str(len(pids)) + ' windows' if pids else 'no window')}")
    for seat in p["seats"]:
        if seat.get("by_hand"):
            rep.note(f"profile {seat['profile']} by hand: {seat['by_hand']}")
    print(f"== seats {'ready' if not rep.bad else 'NOT ready'} {time.strftime('%H:%M:%S')}: {'all ok' if not rep.bad else str(len(rep.bad)) + ' failed'}", flush=True)
    return 0 if not rep.bad else 1


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[0] not in ("setup", "ready", "check") or not argv[1].isdigit():
        print("usage: playtest_setup.py setup|ready|check <n>", file=sys.stderr)
        return 2
    n = int(argv[1])
    try:
        if argv[0] == "check":
            p = load_profile(n)
            print(f"profile {n} ok: {len(p['seats'])} seats, {sum(len(seat_commands(s)) for s in p['seats'])} sets, world {p['world']}")
            return 0
        return setup(n) if argv[0] == "setup" else ready(n)
    except ProfileError as e:
        print(f"== profile {n}: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
