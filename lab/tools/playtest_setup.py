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
block does for a run (the epoch is setup's own time, the hour holds at it). `server: {cureSpells: []}` lays the sitting's
own cure list (ADR-068 rung 5's D-T3 B), each entry's plugin one of the deployed load order's, case for case.
`camp: {teleports: [...]}` names the camp's
teleports as labCommand takes them, in order, where `playtest-start` reads playtest-start.sh's two. From profile 48 a
camp is outside unless `camp: {interior: <reason>}` says why not, and every living actor placed near it is listed in
`camp: {near: [<form id>, ...]}` (CAMP_RULES_FROM, playtest 47's two load-in faults).

What pt23-setup.sh and pt23-after-streams.sh did for playtest twenty-three (2026-10-18), from a profile instead of
a script per playtest. Every set is read back: an upward set-percentages can revert within 2 s (docs/LAB.md), and a
console set the server took as a no-op shows only in its read (x-headshot-probe's "Archery", 20261018-164202).
"""
from __future__ import annotations

import base64
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
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
# the turbo switches (docs/private/playtest-turbo-2.md: the merged base carries every switch OFF, each item turns
# its own on): the deployed settings keep them ON for the gates' scenarios, a playtest's overlay says otherwise
SWITCHES = ("locks", "weatherSync", "perks", "leveling")
SERVER_KEYS = {"npcEnabled", "gameHour", "cureSpells", *SWITCHES}
# a cure as the server's cureSpells setting takes it, "<hex id>:<plugin>" (ADR-068 rung 5's D-T3 B: playtest 51 lifts
# Sanguinare Vampiris b8780:Skyrim.esm so a seat can turn)
CURE = re.compile(r"[0-9A-Fa-f]{1,8}:[^:]+\.(?:esm|esp|esl)", re.IGNORECASE)
PLAYER = 20  # the console's word for the player itself (0x14)
BARS = ("health", "magicka", "stamina")
# The standing base (Eli, 2026-11-03, after playtest 44's first lay: "every test should have - no survival - weather synced -
# rotfern has headshots - no-pause on menus", then "everything that we KNOW works should be in from here on out"). From
# profile 44 on, check_profile lays what a profile leaves out and refuses a profile that turns one off, and ready() proves
# the four on the relaunched seats. The menus' no-pause is the Skyrim Souls RE layer (lab/layer, merged into main 32459beb).
STANDING_FROM = 44
SURVIVAL_OFF = {"form": "828:ccQDRSSE001-SurvivalMode.esl", "value": 0}
# Survival_PlayerHasBeenPrompted: the "Enable Survival Mode?" box is a separate flag from the switch, and its box
# stops the game (playtest 46: rotfern frozen on it with 828 already 0); marked answered on every seat with the switch
SURVIVAL_PROMPTED = {"form": "8df:ccQDRSSE001-SurvivalMode.esl", "value": 1}
HEADSHOT_PROFILE = 1  # rotfern, test 1: CIF's rule wants base Archery 60 and Overdraw40 (docs/verbs/headshot.md:35-68)
HEADSHOT_PERK = 0x7934B  # Overdraw40
HEADSHOT_ARCHERY = 60  # the actor value Marksman
SOULS_DLL = r"Data\SKSE\Plugins\SkyrimSoulsRE.dll"  # the archive's SKSE/Plugins/SkyrimSoulsRE.dll (lab/layer/essentials.tsv)
# A playtest's client settings (`clientSettings: {<key>: <value>}`; playtest 51's questFragmentLive, D-Q10 A, until ADR-070
# moves it to the server's settings): keys of the client's skymp5-client-settings.txt, read once at the client's start, so
# ready's relaunch sets them while each game is stopped, by the probes' own relaunch file change (lab-api's
# runner._relaunch_files_ps on the lab's default game, the entries checked by scenario._relaunch_args). The file keeps them
# through the playtest's later relaunches; a clone's rollback restores the dist's copy.
CLIENT_SETTINGS_FILE = "Data/Platform/Plugins/skymp5-client-settings.txt"
# The camp's two rules, from profile 48 (playtest 47, 2026-11-05). Outside: both seats logged in inside Bleak Falls Temple
# 0x371de and neither game ran the cell's OnCellLoad, so the pillars sat empty and the darts unarmed; after the restart
# outside the entrance, both walked in by a real cell load and every scripted item worked. A camp inside a cell needs
# camp.interior, its reason, until thuum-cf's login-inside-a-cell read (x-login-in-cell) is fixed. Declared neighbours:
# the first camp put Prisoner in two entrance bandits' reach, dead 7.5 s after the ready relaunch, and the restart camp
# had LvlBanditMissile 0x29600 1,364 units off. Every actor Skyrim.esm places within CAMP_NEAR of a camp spot (the x-y
# plane, lab/esm.py's own `near` measure) that the restored world does not record dead is named, and setup stops before
# the camp unless camp.near lists it.
CAMP_RULES_FROM = 48
CAMP_NEAR = 2500
EXTERIOR = 0x3C  # Tamriel, the worldspace an exterior camp names (it has no one host; any other cell is a camp inside)
ESM = "/srv/persist/esm/1.6.1170/Skyrim.esm"  # the players' master (ADR-025); /srv/persist/esm/Skyrim.esm is another build's


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
    # lab-api's perks step (app.py seat_perks) refuses a hold whose reason is not a playtest's (E_NO_PLAYTEST): profile
    # 40's first setup gave no perks under "turbo 2: ..." (2026-11-02)
    if hold.get("reason") and not str(hold["reason"]).startswith("playtest"):
        raise ProfileError(f"hold.reason starts with 'playtest' (lab-api's perks step needs it), got {hold['reason']!r}")
    server = p.get("server") or {}
    if not isinstance(server, dict) or set(server) - SERVER_KEYS:
        raise ProfileError(f"server takes {sorted(SERVER_KEYS)}, got {server!r}")
    for key in ("npcEnabled", *SWITCHES):
        if key in server and not isinstance(server[key], bool):
            raise ProfileError(f"server.{key} is true or false, got {server[key]!r}")
    hour = server.get("gameHour", 0)
    if isinstance(hour, bool) or not isinstance(hour, (int, float)) or not 0 <= hour < 24:
        raise ProfileError(f"server.gameHour is an hour from 0 up to 24, got {server['gameHour']!r}")
    cures = server.get("cureSpells", [])
    if not isinstance(cures, list) or not all(isinstance(c, str) and CURE.fullmatch(c) for c in cures):
        raise ProfileError(f'server.cureSpells is a list of "<hex id>:<plugin>" strings ([] lifts every cure), got {cures!r}')
    camp_block = p.get("camp") or {}
    if not isinstance(camp_block, dict) or set(camp_block) - {"teleports", "interior", "near"}:
        raise ProfileError(f"camp takes teleports, interior and near, got {camp_block!r}")
    camp = camp_block.get("teleports")
    if isinstance(camp, list) and camp:
        for t in camp:
            _check_teleport(t)
    elif camp not in (None, "playtest-start"):
        raise ProfileError(f"camp.teleports is playtest-start, a list of teleports, or absent, got {camp!r}")
    interior = camp_block.get("interior")
    if interior is not None and (not isinstance(interior, str) or not interior.strip()):
        raise ProfileError("camp.interior is the reason a camp sits inside a cell, as text")
    near = camp_block.get("near") or []
    if not isinstance(near, list) or any(_int(r, "a camp.near form id") <= 0 for r in near):
        raise ProfileError(f"camp.near is a list of form ids, got {near!r}")
    if n >= CAMP_RULES_FROM and not interior:
        inside = sorted({t["cell"] for t in _camp_list(camp) if _camp_cell(t) != EXTERIOR})
        if inside:
            raise ProfileError(f"a camp inside a cell ({', '.join(inside)}) logs its seat in with no OnCellLoad, so the cell's "
                               "scripts sit dead (playtest 47's first session: the pillars and darts); camp outside and walk in, "
                               "or give camp.interior its reason")
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
        for g in s.get("globals") or []:
            form, v = (g or {}).get("form"), (g or {}).get("value")
            if not isinstance(form, str) or not re.fullmatch(r"[0-9A-Fa-f]{1,8}:[^:\s]+\.(esm|esp|esl)", form) or isinstance(v, bool) or not isinstance(v, (int, float)):
                raise ProfileError(f"profile {prof}'s global is {{form: \"<hex>:<plugin>\", value: <number>}}, got {g!r}")
        for k, v in (s.get("percentages") or {}).items():
            if k not in BARS or isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 1:
                raise ProfileError(f"profile {prof}'s percentage {k}: {v!r} (health, magicka, stamina from 0 to 1)")
    for k, v in (p.get("streams") or {}).items():
        _int(v, f"stream {k}'s port")
    if ((p.get("after") or {}).get("readback")) not in (None, "percentages"):
        raise ProfileError("after.readback is percentages or absent")
    _check_lay(p.get("lay"))
    if "clientSettings" in p:
        client_settings_files(p["clientSettings"])
    if n >= STANDING_FROM:
        _standing(p)
    return p


def _labapi() -> tuple[Any, Any, Any]:
    """lab-api's runner, scenario grammar and settings defaults (playtest_setup runs in lab/labapi's uv project)."""
    sys.path.insert(0, str(ROOT / "lab" / "labapi"))
    from labapi import config, runner, scenario

    return runner, scenario, config.Settings()


def client_settings_files(settings: Any) -> list[dict[str, Any]]:
    """A profile's clientSettings as a relaunch's JSON file changes, checked as a scenario's are."""
    if not isinstance(settings, dict) or not settings:
        raise ProfileError(f"clientSettings is a map of skymp5-client-settings.txt keys to values, got {settings!r}")
    _, scenario, _ = _labapi()
    try:
        return scenario._relaunch_args({"files": [{"json": CLIENT_SETTINGS_FILE, "key": k, "value": v} for k, v in settings.items()]})["files"]
    except ValueError as e:
        raise ProfileError(f"clientSettings: {e}") from None


def client_settings_ps(settings: Any) -> str:
    """The PowerShell that sets a profile's clientSettings in a stopped game (playtest-relaunch.sh runs it between the stop
    and the launch task): the runner's own text, with no stop command of its own."""
    runner, _, s = _labapi()
    return runner._relaunch_files_ps(s.client_lab_dir, s.game_default, client_settings_files(settings), "")


def _check_lay(lay: Any) -> None:
    """The profile's build, go's first step (_lay): {server: <image tag>, dist: {branch, sha}, client: <commit>}, each
    optional, every commit a quoted hex sha (an all-digit one would read as a number)."""
    if lay is None:
        return
    if not isinstance(lay, dict) or not lay or set(lay) - {"server", "dist", "client"}:
        raise ProfileError(f"lay takes server, dist and client, got {lay!r}")
    sha = re.compile(r"[0-9a-f]{8,40}")
    if "server" in lay and not (isinstance(lay["server"], str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", lay["server"])):
        raise ProfileError(f"lay.server is a server image tag (turbo-srv's <ref-slug>-<sha8>), got {lay['server']!r}")
    d = lay.get("dist")
    if "dist" in lay and not (isinstance(d, dict) and set(d) == {"branch", "sha"} and isinstance(d["branch"], str)
                              and d["branch"] and isinstance(d["sha"], str) and sha.fullmatch(d["sha"])):
        raise ProfileError(f"lay.dist is {{branch, sha}}, a fork branch and its commit, got {d!r}")
    if "client" in lay and not (isinstance(lay["client"], str) and sha.fullmatch(lay["client"])):
        raise ProfileError(f"lay.client is a fork commit (turbo-client's), got {lay['client']!r}")


def _standing(p: dict[str, Any]) -> None:
    """The standing base laid into a checked profile: weatherSync on, Survival off on every seat, rotfern's headshot
    conditions. A profile that turns one off is refused, so no copy of a profile can drop it (40's every-switch-off shape
    went forward unchecked into 41 to 44)."""
    server = p.get("server") or {}
    if server.get("weatherSync") is False:
        raise ProfileError("weatherSync is standing from playtest 44 (Eli, 2026-11-03: \"weather synced\"); a profile cannot turn it off")
    server["weatherSync"] = True
    p["server"] = server
    for s in p["seats"]:
        prof = s["profile"]
        gl = s.get("globals") or []
        same = [g for g in gl if str(g["form"]).lower() == SURVIVAL_OFF["form"].lower()]
        if any(g["value"] != SURVIVAL_OFF["value"] for g in same):
            raise ProfileError(f"profile {prof}: Survival is standing OFF from playtest 44 (Eli, 2026-11-03: \"no survival\")")
        if not same:
            gl.append(dict(SURVIVAL_OFF))
        asked = [g for g in gl if str(g["form"]).lower() == SURVIVAL_PROMPTED["form"].lower()]
        if any(g["value"] != SURVIVAL_PROMPTED["value"] for g in asked):
            raise ProfileError(f"profile {prof}: Survival's prompt is standing answered from playtest 46 (its box froze rotfern's game)")
        if not asked:
            gl.append(dict(SURVIVAL_PROMPTED))
        s["globals"] = gl
        if prof == HEADSHOT_PROFILE:
            perks = s.get("perks") or []
            if HEADSHOT_PERK not in perks:
                perks.append(HEADSHOT_PERK)
            s["perks"] = perks
            values = s.get("values") or {}
            if values.get("Marksman", HEADSHOT_ARCHERY) < HEADSHOT_ARCHERY:
                raise ProfileError(f"profile {prof}: rotfern's headshots are standing from playtest 44 (Eli, 2026-11-03); Marksman is at least {HEADSHOT_ARCHERY}")
            values.setdefault("Marksman", HEADSHOT_ARCHERY)
            s["values"] = values


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
    for key in ("npcEnabled", *SWITCHES):
        if key in server:
            d[key] = server[key]
    if "cureSpells" in server:
        # the server matches a cure's plugin case for case and skips an unresolved one silently (fork FormDesc.cpp:62-70,
        # ActionListener.cpp:6765-6770), as lab-api's runner refuses one for a run
        plugins = {Path(p).name for p in d.get("loadOrder") or []}
        unknown = [c for c in server["cureSpells"] if c.split(":", 1)[1] not in plugins]
        if unknown:
            raise ProfileError(f"server.cureSpells {unknown} name a plugin the deployed load order lacks (case counts)")
        d["cureSpells"] = list(server["cureSpells"])
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
    # a listed player global through the server's SetGlobal (ConsoleCommands.cpp's ExecuteSetGlobal): Survival off is
    # 828:ccQDRSSE001-SurvivalMode.esl at 0 on both records (Eli, 2026-10-31), which playtest 42's profile lacked
    for g in seat.get("globals") or []:
        out.append((f"SetGlobal {g['form']} {g['value']}", {"kind": "console", "profileId": prof, "name": "SetGlobal", "args": [PLAYER, g["form"], g["value"]]}))
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


def perk_commands(prof: int, ids: list[int]) -> list[tuple[str, dict[str, Any]]]:
    """A seat's perks as the server's own AddPerk (ConsoleCommands.cpp: AddPerkByServer plus SendPerkState, no points
    spent; docs/verbs/perks.md:134-138): the perk lives in the record, PerkState restores it at every login and
    relaunch, and nothing on the seat removes it. The driver's Papyrus addPerk was the lever before the server owned
    perks: under `perks` on, the seat reported it as a pick every 5 s, the server refused it for want of points at
    level 1 (E_PERK_POINTS, "its state resent") and the resent state stripped it again, so CIF's HasPerk Overdraw40 was
    false for part of every cycle and rotfern's headshots failed "occasionally" (playtest 44, 2026-11-03; F7 before it)."""
    return [(f"AddPerk {i:#x}", {"kind": "console", "profileId": prof, "name": "AddPerk", "args": [PLAYER, i]}) for i in ids]


def perks_switch_on(overlay_text_now: str | None, deployed_text: str) -> bool:
    """Whether the server owns perks on this run: the running overlay's `perks` when it reads, else the deployed
    settings' (lab/deploy/sky-srv/server-settings.json carries perks: true since 2026-10-31)."""
    for text in (overlay_text_now, deployed_text):
        if not text:
            continue
        try:
            d = json.loads(text)
        except ValueError:
            continue
        if isinstance(d, dict) and "perks" in d:
            return bool(d["perks"])
    return False


def perk_refusals(server_log: str, perks: list[int]) -> list[str]:
    """The server's E_PERK_POINTS lines that name one of the seats' standing perks: the lever loop's signature
    ("[verb:perks] E_PERK_POINTS: ff000000 picks 7934b at level 1 with 0 perk(s); refused, its state resent").
    Any such line after the relaunch means a seat still adds the perk by its own engine and the server strips it."""
    want = {f"{i:x}" for i in perks}
    out = []
    for line in server_log.splitlines():
        m = re.search(r"E_PERK_POINTS: ([0-9a-f]+) picks ([0-9a-f]+)", line)
        if m and m.group(2).lower() in want:
            out.append(line.strip())
    return out


def _perks_on() -> bool:
    try:
        overlay = _srv(f"cat {OVERLAY}")
    except Exception:
        overlay = None
    deployed = (ROOT / "lab" / "deploy" / "sky-srv" / "server-settings.json").read_text()
    return perks_switch_on(overlay, deployed)


def _perks(rep: Report, prof: int, ids: list[int]) -> None:
    """A seat's perks. Under the server's `perks` switch: the server's AddPerk per perk (the record path, perk_commands)
    and the driver's keep cleared, so no seat re-adds a perk by its own engine; without the switch: the player's game's
    own through its lab-driver, which keeps them through every load and lab-api sends again to a relaunched game
    (POST /clients/<c>/perks)."""
    client = seat_client(prof)
    want = ", ".join(f"{i:#x}" for i in ids)
    if _perks_on():
        bad = []
        for label, payload in perk_commands(prof, ids):
            try:
                r = command(payload)
            except Exception as e:  # an HTTP refusal: the line says which
                bad.append(f"{label}: {e}")
                continue
            if not r.get("ok"):
                bad.append(f"{label}: {r}")
        try:
            _http("POST", f"/clients/{client}/perks", {"ids": []})  # the driver's keep cleared: the record owns them now
            cleared = "driver keep cleared"
        except Exception as e:
            cleared = f"driver keep not cleared ({e})"
        (rep.ok if not bad else rep.fail)(f"profile {prof} perks {want} through the server's AddPerk (the record path, {cleared})" + (f": {'; '.join(bad)}" if bad else ""))
        return
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
    if camp and n >= CAMP_RULES_FROM:
        print(f"== the camp's neighbours {time.strftime('%H:%M:%S')}", flush=True)
        if not _neighbours(rep, p):
            print("== the camp has living neighbours camp.near does not list: no camp (list them, or move the camp)", flush=True)
            return 3
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
    try:
        since = _srv("date -u +%Y-%m-%dT%H:%M:%SZ").strip()
    except Exception:
        since = None
    env = dict(os.environ)
    if p.get("clientSettings"):  # set in each stopped game before its launch task, read back by the relaunch
        env["CLIENT_SETTINGS_PS"] = base64.b64encode(client_settings_ps(p["clientSettings"]).encode()).decode()
    procs = [subprocess.Popen([str(ROOT / "lab/tools/playtest-relaunch.sh"), c], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
             for c in ("c1", "c2")]
    for c, pr in zip(("c1", "c2"), procs):
        out = (pr.communicate()[0] or "").strip().splitlines()
        (rep.ok if pr.returncode == 0 else rep.fail)(f"{c}: {out[-1] if out else 'no output'}")
        if p.get("clientSettings"):
            got = [line for line in out if line.startswith("set ")]
            (rep.ok if len(got) == len(p["clientSettings"]) else rep.fail)(f"{c}: client settings {'; '.join(got) or 'none set'}")
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
        if seat.get("perks") and not _perks_on():
            _perks(rep, prof, seat["perks"])  # the relaunched game's, read back from its driver (the record path needs no re-send: PerkState at login)
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
        if len(pids) != 1:
            rep.fail(f"stream {name} ({port}): {str(len(pids)) + ' windows' if pids else 'no window'}")
            continue
        # a window that outlived a Sunshine restart (setup's own) or a clone rollback is a dead session that pgrep
        # still lists: it holds no socket, a live stream holds several (playtest 40, 2026-11-02: playtest 39's two
        # windows passed this check with 0 sockets each and showed nothing; the fresh ones held 3)
        s = subprocess.run(["lsof", "-nP", "-a", "-p", pids[0], "-i"], capture_output=True, text=True)
        socks = max(len(s.stdout.splitlines()) - 1, 0)
        (rep.ok if socks else rep.fail)(f"stream {name} ({port}): pid {pids[0]}, {socks} sockets" + ("" if socks else ": a dead session, close it and open a fresh stream, then playtest-ready again"))
    for seat in p["seats"]:
        if seat.get("by_hand"):
            rep.note(f"profile {seat['profile']} by hand: {seat['by_hand']}")
    # the lever loop cannot come back silently: no E_PERK_POINTS for a seat's perk since the relaunch (the server's own
    # log; a seat still adding the perk by its engine would show here within 5 s of its login)
    perks = sorted({i for seat in p["seats"] for i in (seat.get("perks") or [])})
    if perks and since:
        time.sleep(8)
        try:
            log = _srv(f"docker logs --since {since} lab-skymp-server-1 2>&1 | grep E_PERK_POINTS || true")
        except Exception as e:
            log = None
            rep.fail(f"perk refusals: the server log did not read ({e})")
        if log is not None:
            bad = perk_refusals(log, perks)
            (rep.ok if not bad else rep.fail)(f"perk refusals since the relaunch for {', '.join(f'{i:#x}' for i in perks)}: {len(bad)}" + (f" ({bad[0][:160]})" if bad else ""))
    if n >= STANDING_FROM:
        _standing_ready(rep, p)
    print(f"== seats {'ready' if not rep.bad else 'NOT ready'} {time.strftime('%H:%M:%S')}: {'all ok' if not rep.bad else str(len(rep.bad)) + ' failed'}", flush=True)
    return 0 if not rep.bad else 1


def _standing_ready(rep: Report, p: dict[str, Any]) -> None:
    """The standing base proven on the relaunched seats, ready's last step: weatherSync on in the running overlay;
    Survival off sent again to each seat in turn, since a relaunch lets the game's own save switch it back on (playtest
    43: survival back after the final relaunch, and a re-send 5 s after it froze c2), each only after a steady minute
    of heartbeats and watched for 15 s after; Skyrim Souls RE's plugin in every game folder of both clones. rotfern's
    Archery and Overdraw40 are read above with the seat's values and perks; the shot itself is the stage's b-headshot."""
    try:
        laid = json.loads(_srv(f"cat {OVERLAY}"))
    except ValueError:
        laid = {}
    (rep.ok if laid.get("weatherSync") is True else rep.fail)(f"weather synced: the running overlay's weatherSync is {laid.get('weatherSync')!r}")

    def beats() -> dict[str, float]:
        return _http("GET", "/status").get("heartbeats_s_ago") or {}

    steady = True
    for _ in range(6):
        h = beats()
        if not h or max(h.values()) > 8:
            steady = False
            break
        time.sleep(10)
    if not steady:
        rep.fail(f"survival off: not sent, a seat was not heartbeating steadily ({beats()})")
    else:
        for seat in p["seats"]:
            prof = seat["profile"]
            client = seat_client(prof)
            command({"kind": "console", "profileId": prof, "name": "SetGlobal", "args": [PLAYER, SURVIVAL_PROMPTED["form"], SURVIVAL_PROMPTED["value"]]})
            r = command({"kind": "console", "profileId": prof, "name": "SetGlobal", "args": [PLAYER, SURVIVAL_OFF["form"], SURVIVAL_OFF["value"]]})
            worst = 0.0
            for _ in range(5):
                time.sleep(3)
                worst = max(worst, float(beats().get(client, 99.0)))
            (rep.ok if r.get("ok") and worst <= 8 else rep.fail)(f"survival off on profile {prof} ({client}): sent {r.get('ok')}, worst heartbeat {worst:.1f} s over the 15 s after")
            if worst > 8:
                break  # a stalled seat is the finding; nothing more is sent
    souls = ("Get-ChildItem 'C:\\sky-lab\\games' -Filter '*.txt' | ForEach-Object { $g = (Get-Content $_.FullName -Raw).Trim(); "
             "$_.BaseName + '=' + (Test-Path (Join-Path $g '" + SOULS_DLL + "')) }")
    for client, vmid in sorted(_clients().items()):
        # the game folder the seat launches (lab-api's /game, ADR-025): the layer carries Souls RE for 1.6.1170 alone, so
        # a 1.7.104 folder without it is no finding (playtest 44: "1.6.1170=True, 1.7.104=False" on both seats)
        try:
            version = str(_http("GET", f"/game?client={client}").get("version") or "")
        except Exception:
            version = ""
        r = _guest_exec(vmid, souls)
        rows = [x.strip() for x in (r.get("out-data") or "").splitlines() if x.strip()]
        played = [x for x in rows if x.split("=", 1)[0] == version]
        good = len(played) == 1 and played[0].endswith("=True")
        (rep.ok if good else rep.fail)(f"no-pause menus: {SOULS_DLL} on {client}'s {version or 'unknown'} game: {', '.join(rows) or str(r.get('err-data', 'no answer'))[:120]}")


def last_grant(server_log: str, cell: int) -> str:
    """How a cell's current host got it, from the server's cell-host lines ("<actor> hosts cell <id> at epoch N", "<actor>
    stops hosting cell <id>", "cell <id> is unhosted"): "fresh" when the last grant came with nobody hosting (the first
    since the server started, or after "is unhosted"), "inherited" when it followed another seat's stop directly (that seat
    loaded the cell as a guest first: its replayed pillar graphs and its own scripts disagree, playtest 46's stuck
    pillars), "none" when no grant is in the log."""
    want = f"{cell:x}"
    hosted = False
    how = "none"
    for line in server_log.splitlines():
        if "cell-host:" not in line or f"cell {want} " not in line + " ":
            continue
        if f"hosts cell {want} at epoch" in line:
            how = "inherited" if hosted else "fresh"
            hosted = True
        elif f"stops hosting cell {want}" in line:
            hosted = True  # until an "is unhosted" line, the next grant is a hand-off
        elif f"cell {want} is unhosted" in line:
            hosted = False
    return how


def _camp_list(camp: Any) -> list[dict[str, Any]]:
    """A profile's camp.teleports as the teleports themselves: playtest-start.sh's two, the listed ones, or none."""
    if camp == "playtest-start":
        return camp_teleports()
    return list(camp) if isinstance(camp, list) else []


def _camp_cell(t: dict[str, Any]) -> int | None:
    """A camp teleport's cell ("<hex>:<plugin>") as a form id, or None when it names none."""
    c = str(t.get("cell") or "")
    return int(c.split(":", 1)[0], 16) if ":" in c else None


def _camp_cells(p: dict[str, Any]) -> list[int]:
    """The interior cells the profile's camp puts a seat in (an exterior camp names a worldspace, which has no one host)."""
    cells = []
    for t in _camp_list((p.get("camp") or {}).get("teleports")):
        n = _camp_cell(t)
        if n is not None and n != EXTERIOR and n not in cells:
            cells.append(n)
    return cells


_PLACED = re.compile(r"^0x([0-9a-fA-F]+) NPC_ 0x[0-9a-fA-F]+ (\S+) at \(([-\d.]+), ([-\d.]+), [-\d.]+\)")


def placed_actors(listing: str) -> list[tuple[int, str, float, float]]:
    """lab/esm.py's `near` or `cellrefs` lines for NPC_ bases ("0x00029600 NPC_ 0x0001e79e LvlBanditMissile at (-2308,
    -44526, 6145), 1364 away"): (the reference, its base's editor id, x, y)."""
    out = []
    for line in listing.splitlines():
        m = _PLACED.match(line.strip())
        if m:
            out.append((int(m.group(1), 16), m.group(2), float(m.group(3)), float(m.group(4))))
    return out


def camp_neighbours(actors: list[tuple[int, str, float, float]], spot: tuple[float, float],
                    records: dict[int, dict[str, Any] | None], declared: set[int],
                    radius: float = CAMP_NEAR) -> tuple[list[str], list[str]]:
    """One camp spot's placed actors within radius, as (undeclared, the rest): an actor is undeclared when the restored
    world does not record it dead and camp.near does not list it. records maps a reference to its labState ref answer;
    None means the server holds no record of it, so it stands where Skyrim.esm placed it, alive."""
    undeclared, rest = [], []
    for ref, edid, x, y in actors:
        d = math.hypot(x - spot[0], y - spot[1])
        if d > radius:
            continue
        rec = records.get(ref)
        dead = bool(rec and rec.get("isDead"))
        line = (f"{ref:#x} {edid}, {d:.0f} units off, " + ("dead" if dead else "alive" if rec else "no record (alive where placed)")
                + (" (camp.near)" if ref in declared and not dead else ""))
        (rest if dead or ref in declared else undeclared).append(line)
    return undeclared, rest


def esm_listing(rc: int, out: str, err: str) -> str:
    """lab/esm.py's answer over ssh as a listing: its exit 1 with nothing on stderr is "no record found", an empty listing
    (48's second camp, Embershard's back door with no actor within 2,500 units, stopped the first neighbour check here);
    any other failure, a traceback included, is raised."""
    if rc == 0 or (rc == 1 and not err.strip()):
        return out
    raise RuntimeError(f"lab/esm.py on sky-srv: exit {rc}: {err.strip()[:200]}")


def _esm(how: str, src: str) -> str:
    """lab/esm.py run on sky-srv (where the master files are) with its source on stdin."""
    r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-J", JUMP, SRV, f"python3 - {how}"], input=src, capture_output=True,
                       text=True, timeout=240)
    return esm_listing(r.returncode, r.stdout, r.stderr)


def _neighbours(rep: Report, p: dict[str, Any]) -> bool:
    """Each camp spot's placed actors (CAMP_NEAR), read from Skyrim.esm on sky-srv and checked against the restored
    world's records: False when one is alive there and camp.near does not list it."""
    camp_block = p.get("camp") or {}
    declared = {int(r) for r in camp_block.get("near") or []}
    src = (ROOT / "lab" / "esm.py").read_text()
    ok = True
    for t in _camp_list(camp_block.get("teleports")):
        cell, _, plugin = str(t.get("cell") or "").partition(":")
        who = f"profile {t['profileId']}'s spot"
        if plugin.lower() != "skyrim.esm":
            rep.note(f"{who} is in {t.get('cell')!r}, not a Skyrim.esm cell: its neighbours are not read")
            continue
        n = int(cell, 16)
        x, y = float(t["pos"][0]), float(t["pos"][1])
        how = f"near {ESM} {n:#x} {x:.0f} {y:.0f} {CAMP_NEAR} NPC_" if n == EXTERIOR else f"cellrefs {ESM} {n:#x} NPC_"
        actors = placed_actors(_esm(how, src))
        records: dict[int, dict[str, Any] | None] = {}
        for ref, _, ax, ay in actors:
            if math.hypot(ax - x, ay - y) <= CAMP_NEAR:
                ans = state({"kind": "ref", "actorId": ref})
                records[ref] = ans if ans.get("found") else None
        undeclared, rest = camp_neighbours(actors, (x, y), records, declared)
        for line in rest:
            rep.note(f"near {who}: {line}")
        for line in undeclared:
            rep.fail(f"near {who}, not in camp.near: {line}")
        ok = ok and not undeclared
    return ok


def _streams(rep: Report, p: dict[str, Any]) -> None:
    """Each seat's Moonlight stream on this Mac: a live one kept, a stale one (no socket) replaced, a missing one opened."""
    for name, port in sorted((p.get("streams") or {}).items()):
        pids = subprocess.run(["pgrep", "-f", f"Moonlight stream core.gaussing.tv:{port}"], capture_output=True, text=True).stdout.split()
        live = [x for x in pids if subprocess.run(["sh", "-c", f"lsof -nP -a -p {x} -i | grep -cE 'UDP|TCP'"], capture_output=True, text=True).stdout.strip() not in ("", "0")]
        if live:
            rep.ok(f"stream {name} ({port}) live, pid {live[0]}")
            continue
        for x in pids:
            subprocess.run(["kill", x], capture_output=True)
        subprocess.run(["open", "-n", "-a", "Moonlight", "--args", "stream", f"core.gaussing.tv:{port}", "Desktop",
                        "--display-mode", "windowed", "--1080"], capture_output=True)
        time.sleep(12)
        pids = subprocess.run(["pgrep", "-f", f"Moonlight stream core.gaussing.tv:{port}"], capture_output=True, text=True).stdout.split()
        (rep.ok if pids else rep.fail)(f"stream {name} ({port}) opened: {pids or 'no process'}")


def _lay(rep: Report, p: dict[str, Any]) -> bool:
    """The profile's build laid first (lay: {server: <tag>, dist: {branch, sha}, client: <sha>}, each optional), so no
    later push relaunches a seat after the world is restored: the server image by turbo-srv, the dist by turbo-dist with
    each seat checked in turbo.log (a missing seat laid once more), the client script by turbo-client."""
    lay = p.get("lay") or {}
    started = _srv("date -u +%Y-%m-%dT%H:%M:%SZ").strip()
    if lay.get("server"):
        tag = _srv("grep -E '^SERVER_TAG=' /srv/lab/.env | cut -d= -f2").strip()
        if tag != lay["server"]:
            subprocess.run(["just", "turbo-srv", str(lay["server"])], cwd=ROOT, capture_output=True, text=True)
            tag = _srv("grep -E '^SERVER_TAG=' /srv/lab/.env | cut -d= -f2").strip()
        (rep.ok if tag == lay["server"] else rep.fail)(f"server {tag} (wanted {lay['server']})")
    if lay.get("dist"):
        branch, sha = str(lay["dist"]["branch"]), str(lay["dist"]["sha"])[:8]
        env = dict(os.environ, SHA=sha)
        for seats in ("both", None):
            missing = [c for c, vmid in sorted(_clients().items())
                       if not _srv(f"awk -v s={started} '$1 >= s && $4 == \"{vmid}\" && $5 == \"{sha}\"' /srv/lab/turbo.log").strip()]
            if not missing:
                break
            for c in (["both"] if seats == "both" else missing):
                subprocess.run(["just", "turbo-dist", branch, c], cwd=ROOT, env=env, capture_output=True, text=True)
        missing = [c for c, vmid in sorted(_clients().items())
                   if not _srv(f"awk -v s={started} '$1 >= s && $4 == \"{vmid}\" && $5 == \"{sha}\"' /srv/lab/turbo.log").strip()]
        (rep.fail if missing else rep.ok)(f"dist {branch} {sha} on every seat" + (f": missing on {missing}" if missing else ""))
    if lay.get("client"):
        r = subprocess.run(["just", "turbo-client", str(lay["client"])], cwd=ROOT, capture_output=True, text=True)
        (rep.ok if r.returncode == 0 else rep.fail)(f"client {lay['client']} by turbo-client (exit {r.returncode})")
    return not rep.bad


def roles(n: int) -> int:
    """Who hosts each interior cell of profile n's camp now, and how the host got it (last_grant over the server's
    cell-host lines since its process started): a playtest's checklist says which seat is the guest, and a cell's
    scripts run on its host alone (playtest 46: the roles swapped across relaunches and the checklist assumed them)."""
    p = load_profile(n)
    names = {s["profile"]: s.get("name") or f"profile {s['profile']}" for s in p["seats"]}
    # the container's log keeps every run since its creation (a `docker compose restart` keeps the container): only the
    # lines after the wire's last "listening on" are this process's host table
    lines = _srv("cd /srv/lab && docker compose logs --no-color skymp-server 2>/dev/null | grep -E 'cell-host:|WireServer: listening on'", timeout=120).splitlines()
    starts = [i for i, x in enumerate(lines) if "WireServer: listening on" in x]
    log = "\n".join(lines[starts[-1] + 1:] if starts else lines)
    online = {int(pl.get("actorId") or 0): int(pl.get("profileId") or 0) for pl in state({"kind": "online"}).get("players") or []}
    cells = _camp_cells(p)
    if not cells:
        print(f"profile {n}: no interior camp cell")
    for c in cells:
        h = state({"kind": "cellHost", "cell": c})
        prof = online.get(int(h.get("actorId") or 0), 0)
        who = (f"{names.get(prof, f'profile {prof}')} (profile {prof})" if prof else f"actor {int(h.get('actorId') or 0):x}, not online") if h.get("hosted") else "nobody"
        print(f"cell {c:x}: host {who}, epoch {h.get('epoch')}, its grant {last_grant(log, c)}; every other seat in it is a guest")
    return 0


def streams(n: int) -> int:
    """The profile's two Moonlight streams on this Mac kept, replaced or opened (go's step, alone)."""
    rep = Report()
    _streams(rep, load_profile(n))
    return 1 if rep.bad else 0


def go(n: int) -> int:
    """The one way into a playtest (Eli, 2026-11-04 after 46: "that should be canonized into a script instead of hand
    rolled every time"), in a fixed order: the profile's build laid first; setup (the world restored, the server's host
    table fresh, the camp, the standing base); the streams; ready, which relaunches both seats TOGETHER (a seat
    relaunched alone hands its hosted cells to a seat that loaded them as a guest); then every interior camp cell's host
    proven a fresh grant from the server's own lines, both seats relaunched together again when one was inherited (at most
    twice). The recorder is the caller's next command: `just playtest-record <n>`, in the background."""
    p = load_profile(n)
    rep = Report()
    print(f"== playtest {n}: go {time.strftime('%H:%M:%S')}", flush=True)
    if not _lay(rep, p):
        print(f"== go stopped: the build is not laid ({len(rep.bad)} failed)")
        return 1
    if setup(n) != 0:
        print("== go stopped: setup failed")
        return 1
    since = _srv("date -u +%Y-%m-%dT%H:%M:%SZ").strip()
    _streams(rep, p)
    for attempt in range(3):
        rc = ready(n)
        log = _srv(f"cd /srv/lab && docker compose logs --no-color --since {since} skymp-server 2>/dev/null | grep 'cell-host:'", timeout=90)
        hows = {c: last_grant(log, c) for c in _camp_cells(p)}
        bad = {f"{c:x}": h for c, h in hows.items() if h != "fresh"}
        print(f"   hosts: " + (", ".join(f"{c:x} {h}" for c, h in hows.items()) or "no interior camp cell"), flush=True)
        if rc == 0 and not bad:
            roles(n)
            print(f"== playtest {n} ready {time.strftime('%H:%M:%S')}: next `just playtest-record {n}` in the background")
            return 0
        print(f"   attempt {attempt + 1}: ready exit {rc}, not fresh {bad or 'none'}: both seats relaunched together again", flush=True)
    print(f"== playtest {n} NOT ready after three attempts")
    return 1


def switched(overlay_text_now: str, key: str, on: bool) -> str:
    """The running overlay with one turbo switch set, every other key as it is (a playtest's server alone)."""
    if key not in SWITCHES:
        raise ProfileError(f"a turbo switch is one of {', '.join(SWITCHES)}, got {key!r}")
    d = json.loads(overlay_text_now)
    d[key] = on
    return json.dumps(d, indent=2) + "\n"


def switch(n: int, key: str, on: bool) -> int:
    """One turbo switch on a running playtest's server (docs/private/playtest-turbo-2.md: the overlay's line, the
    server's restart, both seats relaunched), each step gated on the one before (playtest 34's unguarded restart): the
    write read back, the mount checked, the restart's listen line awaited, then ready(n), and the profile's hold
    again, since the relaunch takes its own 180 min one (Turbo 2's arm one, 2026-11-02, from a scratchpad script)."""
    p = load_profile(n)
    text = switched(_srv(f"cat {OVERLAY}"), key, on)
    print(f"== playtest {n}: {key} {'on' if on else 'off'} {time.strftime('%H:%M:%S')}", flush=True)
    mount = _mounted_settings()
    if mount != OVERLAY:
        print(f"== the server runs on {mount or 'no settings mount'}, not {OVERLAY}: no write, no restart", flush=True)
        return 1
    _srv(f"sudo tee {OVERLAY} > /dev/null", stdin=text)
    back = json.loads(_srv(f"cat {OVERLAY}"))
    if back.get(key) is not on:
        print(f"== the overlay reads {key} {back.get(key)!r} after the write: no restart", flush=True)
        return 1
    print(f"== the overlay reads {({k: back.get(k) for k in SWITCHES})}", flush=True)
    since = _srv("date -u +%Y-%m-%dT%H:%M:%SZ").strip()
    _srv("cd /srv/lab && docker compose restart skymp-server", timeout=240)
    for _ in range(60):
        if _srv(f"docker logs --since {since} lab-skymp-server-1 2>&1 | grep -c 'listening on' || true").strip() not in ("", "0"):
            break
        time.sleep(2)
    else:
        print(f"== no listen line within 120 s of the restart at {since}: no relaunch", flush=True)
        return 1
    mount = _mounted_settings()
    if mount != OVERLAY:
        print(f"== after the restart the server runs on {mount or 'no settings mount'}: no relaunch", flush=True)
        return 1
    rc = ready(n)
    hold = p.get("hold") or {}
    _http("POST", "/hold", {"minutes": int(hold.get("minutes", 180)), "reason": hold.get("reason") or f"playtest {n}"})
    print(f"== hold {hold.get('minutes', 180)} min again: {hold.get('reason') or f'playtest {n}'}", flush=True)
    return rc


def _records() -> int:
    """The live world's change forms on the lab server (the directory a restart flushes into)."""
    out = _srv("ls /srv/lab/server/world/changeForms | wc -l").strip()
    return int(out) if out.isdigit() else -1


def restart(n: int) -> int:
    """A plain server restart in a running playtest, no relaunch: the seats reconnect by themselves (49's item and 50's
    item 4, the pillars through a restart; the restart scenarios' shape). Gated as switch is (the mount, the restart's
    listen line), with the live world's record count before and after (10b3edcb: a plain restart must not grow the
    world; 49's grew from 1,542 to 15,393 records) and both profiles awaited online again."""
    p = load_profile(n)
    mount = _mounted_settings()
    if mount != OVERLAY:
        print(f"== the server runs on {mount or 'no settings mount'}, not {OVERLAY}: no restart", flush=True)
        return 1
    before = _records()
    print(f"== playtest {n}: the server restarted {time.strftime('%H:%M:%S')}; the world holds {before} records", flush=True)
    since = _srv("date -u +%Y-%m-%dT%H:%M:%SZ").strip()
    _srv("cd /srv/lab && docker compose restart skymp-server", timeout=240)
    for _ in range(60):
        if _srv(f"docker logs --since {since} lab-skymp-server-1 2>&1 | grep -c 'listening on' || true").strip() not in ("", "0"):
            break
        time.sleep(2)
    else:
        print(f"== no listen line within 120 s of the restart at {since}", flush=True)
        return 1
    after = _records()
    print(f"   listening again {time.strftime('%H:%M:%S')}; the world holds {after} records ({after - before:+d})", flush=True)
    want = sorted(s["profile"] for s in p["seats"])
    online: list[int] = []
    for _ in range(60):
        try:  # lab-api answers 502 while the restarted server's gamemode comes up (playtest 50, 22:11Z): read again
            online = sorted(x.get("profileId") for x in state({"kind": "online"}).get("players", []))
        except (urllib.error.URLError, OSError, ValueError):
            online = []
        if online == want:
            break
        time.sleep(3)
    print(f"   {'ok' if online == want else 'FAIL'} online {online} (wanted {want}) {time.strftime('%H:%M:%S')}", flush=True)
    return 0 if online == want else 1


def main(argv: list[str]) -> int:
    if len(argv) == 4 and argv[0] == "switch" and argv[1].isdigit() and argv[3] in ("on", "off"):
        try:
            return switch(int(argv[1]), argv[2], argv[3] == "on")
        except ProfileError as e:
            print(f"== profile {argv[1]}: {e}", file=sys.stderr)
            return 2
    if len(argv) != 2 or argv[0] not in ("setup", "ready", "check", "go", "roles", "streams", "restart") or not argv[1].isdigit():
        print("usage: playtest_setup.py go|setup|ready|check|roles|streams|restart <n> | switch <n> <" + "|".join(SWITCHES) + "> on|off", file=sys.stderr)
        return 2
    n = int(argv[1])
    try:
        if argv[0] == "check":
            p = load_profile(n)
            print(f"profile {n} ok: {len(p['seats'])} seats, {sum(len(seat_commands(s)) for s in p['seats'])} sets, world {p['world']}")
            return 0
        return {"go": go, "setup": setup, "ready": ready, "roles": roles, "streams": streams, "restart": restart}[argv[0]](n)
    except ProfileError as e:
        print(f"== profile {n}: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
