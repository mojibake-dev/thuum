"""A playtest's seats from its profile (thuum ADR-040 item 6): lab/playtests/<n>.yaml.

    just playtest-setup <n>   before the Moonlight streams: the world restored (both seats relaunched on it),
                              the hold, the camp, each seat's spells, values, items and bars (server-side, through
                              the gamemode's labCommand: never keystrokes in a seat), Sunshine restarted
    just playtest-ready <n>   once the streams are up: both games relaunched under them, then the checks: both
                              players online, the heartbeats, the values and items read back, the bars full, the
                              two stream windows running

What pt23-setup.sh and pt23-after-streams.sh did for playtest twenty-three (2026-10-18), from a profile instead of
a script per playtest. Every set is read back: an upward set-percentages can revert within 2 s (docs/LAB.md), and a
console set the server took as a no-op shows only in its read (x-headshot-probe's "Archery", 20261018-164202).
"""
from __future__ import annotations

import base64
import json
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
    camp = (p.get("camp") or {}).get("teleports")
    if camp not in (None, "playtest-start"):
        raise ProfileError(f"camp.teleports is playtest-start or absent, got {camp!r}")
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


def camp_teleports(root: Path = ROOT) -> list[dict[str, Any]]:
    """playtest-start.sh's two camp teleports, read from the script itself (one source for the camp)."""
    text = (root / "lab" / "tools" / "playtest-start.sh").read_text()
    out = [json.loads(m) for m in re.findall(r"^cmd '(\{\"kind\":\"teleport\".*\})'$", text, re.M)]
    if len(out) != 2:
        raise ProfileError(f"playtest-start.sh has {len(out)} camp teleports, not 2")
    return out


def seat_commands(seat: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """A seat's server-side sets as labCommand payloads, in order: spells, values, items."""
    prof = seat["profile"]
    out = []
    for sp in seat.get("spells") or []:
        out.append((f"AddSpell {sp:#x}", {"kind": "console", "profileId": prof, "name": "AddSpell", "args": [PLAYER, sp]}))
    for name, v in (seat.get("values") or {}).items():
        out.append((f"SetAV {name} {v}", {"kind": "console", "profileId": prof, "name": "SetAV", "args": [PLAYER, name, v]}))
    for it in seat.get("items") or []:
        out.append((f"AddItem {it['id']:#x} {it.get('count', 1)}", {"kind": "console", "profileId": prof, "name": "AddItem", "args": [PLAYER, it["id"], it.get("count", 1)]}))
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


def _guest_exec(vmid: int, ps: str, timeout: int = 60) -> dict[str, Any]:
    enc = base64.b64encode(ps.encode("utf-16-le")).decode()
    r = subprocess.run(["ssh", "-o", "BatchMode=yes", JUMP, f"qm guest exec {vmid} --timeout {timeout} -- powershell -NoProfile -NonInteractive -EncodedCommand {enc}"],
                       capture_output=True, text=True, timeout=timeout + 60)
    return json.loads(r.stdout) if r.stdout.strip() else {"exitcode": -1, "err-data": r.stderr}


def _clients(root: Path = ROOT) -> dict[str, int]:
    """client name -> vmid of the managed clones, from lab-api's own table."""
    g = yaml.safe_load((root / "lab" / "labapi" / "labapi" / "guests.yaml").read_text())
    return {x["client"]: int(x["vmid"]) for x in g.get("guests", []) if x.get("client") and x.get("managed")}


def setup(n: int) -> int:
    p = load_profile(n)
    rep = Report()
    print(f"== playtest {n}: {p.get('build', '')}", flush=True)
    print(f"== restore {p['world']} (both seats relaunched on it) {time.strftime('%H:%M:%S')}", flush=True)
    r = subprocess.run([str(ROOT / "lab/tools/playtest-world.sh"), "restore", p["world"]], text=True)
    if r.returncode != 0:
        print("== the restore failed: no setup", flush=True)
        return 2
    hold = p.get("hold") or {}
    _http("POST", "/hold", {"minutes": int(hold.get("minutes", 180)), "reason": hold.get("reason") or f"playtest {n}"})
    rep.ok(f"hold {hold.get('minutes', 180)} min: {hold.get('reason') or f'playtest {n}'}")
    if (p.get("camp") or {}).get("teleports") == "playtest-start":
        print(f"== the camp {time.strftime('%H:%M:%S')}", flush=True)
        for t in camp_teleports():
            ans = command(t)
            (rep.ok if ans.get("ok") else rep.fail)(f"teleport profile {t['profileId']} to {t['pos']}: {ans}")
    for seat in p["seats"]:
        prof = seat["profile"]
        print(f"== profile {prof}: {seat.get('name', '')} {time.strftime('%H:%M:%S')}", flush=True)
        before = {it["id"]: _count(prof, it["id"]) for it in seat.get("items") or []}
        for label, payload in seat_commands(seat):
            ans = command(payload)
            (rep.ok if ans.get("ok") else rep.fail)(f"{label}" + ("" if ans.get("ok") else f": {ans}"))
        time.sleep(2)
        for name, v in (seat.get("values") or {}).items():
            got = _value(prof, name)
            (rep.ok if isinstance(got, (int, float)) and abs(got - v) < 1e-3 else rep.fail)(f"{name} reads {got} on the server (wanted {v})")
        for it in seat.get("items") or []:
            got = _count(prof, it["id"])
            want = before[it["id"]] + it.get("count", 1)
            (rep.ok if got >= want else rep.fail)(f"carries {got} of {it['id']:#x} (had {before[it['id']]}, wanted {want})")
        if seat.get("percentages"):
            _set_bars(rep, prof, {k: float(v) for k, v in seat["percentages"].items()})
        if seat.get("by_hand"):
            rep.note(f"by hand, in the seat's own game: {seat['by_hand']}")
    print(f"== Sunshine {time.strftime('%H:%M:%S')}", flush=True)
    ps = "Restart-Service SunshineService -Force; Start-Sleep -Seconds 3; 'sunshine ' + (Get-Service SunshineService).Status"
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
