#!/usr/bin/env python3
"""load-order-check.py <mods dir> <server-settings.json>: the load order the clients will enable, checked against the
server's before deploy-srv (layer-stage step 2b). It runs where persist's mods/ is, on sky-srv, read from stdin
(`python3 - <mods dir> <settings>`), because the plugins it reads the headers of live there.

The clients enable <mods dir>/plugins.txt after the masters and the Creation Club plugins (add-mods.ps1). The engine
sorts every master-type plugin (an .esm or .esl, or the ESM flag 0x1 in its TES4 header) before the rest, keeping the
listed order within each group, and gives a light plugin (an .esl, or the ESL flag 0x200) the next FE slot and every
other plugin the next full slot (UESP, "Skyrim Mod:Mod File Format"; libespm reads light the same way, Combiner.cpp).
A form id carries its plugin's slot, so each plugin the server loads must sit on the slot the clients' engine gives
it. The base entries (the server's loadOrder entries with no file under <mods dir>: the masters, the Creation Club
plugins, _ResourcePack.esl) are taken as the clients load them, in the server's order (x-light-probe, run
20261008-101512, matched the Creation Club lights to Skyrim.ccc's order). Refused, exit 1:
  - an enabled plugin with a master that is neither a base entry nor enabled before it: the engine never finishes
    booting (the essentials layer, 2026-10-19: LoweredHoods_MoreCraftableEquipment_CCNecromanticGrimoire.esp over a
    patch whose Creation Club master the lab lacks, SkyrimSE.exe+01D74A0 on InitTESThread on both clones);
  - a plugin the server loads that the clients do not enable, or enable on another slot (a client-only plugin that
    sorts before a served one of its kind shifts it: TrueHUD.esl, an .esl and so a master, took FE004 on the clients
    the same night);
  - a server list the engine's master-first sort would reorder;
  - two copies of one plugin under <mods dir> (the clients' Data keeps one of them);
  - an enabled or served plugin that carries a record of the player's, Skyrim.esm's NPC_ 0x7 (the base every seat's
    player is built on, so one plugin's copy changes every player at once) or 0x14 (PlayerRef, which the engine makes
    itself: no record in Skyrim.esm holds it); the essentials layer's survival tweak carried an 0x7, a vanilla copy
    plus its own script, the suspect in a-rotfern's CTD of run 20261020-224918 (2026-10-20,
    docs/research/layer-reds-2026-10-20.md).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# the slot math is lab-api's (lab/labapi/labapi/slots.py), the one the runner resolves plugin-relative form
# names with; layer-stage ships both files to sky-srv in this tree's layout
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "labapi" / "labapi"))
from slots import ESL, ESM, engine_order, header, label, slots  # noqa: E402,F401
# the record walk is lab/esm.py's, shipped beside the tools/ directory as in this tree
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import esm  # noqa: E402

# the player's two forms in Skyrim.esm's numbering, read from Skyrim.esm 1.6.1170 with esm.headers (2026-10-20: NPC_
# 0x7 is a record, 0x14 is in none of its 869,688)
PLAYER = {0x000007: "the player's base record (Skyrim.esm's NPC_ 0x7), which every seat's player is built on",
          0x000014: "the player's reference (Skyrim.esm's 0x14, PlayerRef), which the engine makes for every seat"}


def player_records(path: Path, masters: list[str]) -> list[int]:
    """The PLAYER forms a plugin carries a record for, of any type and in any group, numbered in the plugin's own
    master list (the top byte is Skyrim.esm's index among its MAST entries)."""
    lower = [m.lower() for m in masters]
    if "skyrim.esm" not in lower:
        return []
    want = {(lower.index("skyrim.esm") << 24) | k: k for k in PLAYER}
    buf = path.read_bytes()
    return sorted({want[fid] for _, fid, _, _ in esm.headers(buf, 0, len(buf), None) if fid in want})


def check(mods: Path, settings: Path) -> tuple[list[str], str]:
    served = [Path(p).name for p in json.loads(settings.read_text())["loadOrder"]]
    enabled = [ln.strip() for ln in (mods / "plugins.txt").read_text(encoding="utf-8").splitlines()
               if ln.strip() and not ln.strip().startswith("#")]
    enabled = [n[1:] if n.startswith("*") else n for n in enabled]
    files: dict[str, list[Path]] = {}
    for d, _, fs in os.walk(mods):
        for name in fs:
            if name.lower().endswith((".esp", ".esm", ".esl")):
                files.setdefault(name.lower(), []).append(Path(d) / name)
    problems = []
    for k, ps in sorted(files.items()):
        ps.sort()
        if len(ps) > 1:
            problems.append(f"two copies of {ps[0].name}: " + ", ".join(str(p.relative_to(mods)) for p in ps))
    base = [n for n in served if n.lower() not in files]
    flags: dict[str, int] = {}
    masters: dict[str, list[str]] = {}
    for n in enabled + served:
        ps = files.get(n.lower())
        if ps and n.lower() not in flags:
            flags[n.lower()], masters[n.lower()] = header(ps[0])
    for n in enabled:
        if n.lower() not in files and n.lower() not in {b.lower() for b in base}:
            problems.append(f"{n} is enabled but no mod under {mods} holds it")
    for n in {n.lower(): n for n in enabled + served}.values():
        ps = files.get(n.lower())
        for k in player_records(ps[0], masters.get(n.lower(), [])) if ps else []:
            problems.append(f"{n} overrides {PLAYER[k]}: patch the override out or drop the plugin")
    client = base + [n for n in enabled if n.lower() not in {b.lower() for b in base}]
    engine = engine_order(client, flags)
    cslot = {k: label(v) for k, v in slots(client, flags).items()}
    # a plugin loads only when every master is a base entry or a plugin that loads before it; the engine disables
    # one whose master is not in Data at all, and a plugin over a master it disabled stops the boot (both seen on
    # 2026-10-19), so neither may be enabled
    loads = {b.lower() for b in base}
    for n in engine:
        missing = [m for m in masters.get(n.lower(), []) if m.lower() not in loads]
        if not missing:
            loads.add(n.lower())
        for m in missing:
            if m.lower() not in files:
                problems.append(f"{n} needs {m}, which no mod holds: the engine disables {n}")
            else:
                problems.append(f"{n} needs {m}, which does not load before it: the clients' engine stops booting")
    sengine = engine_order(served, flags)
    sslot = {k: label(v) for k, v in slots(served, flags).items()}
    if [n.lower() for n in sengine] != [n.lower() for n in served]:
        problems.append("the server's loadOrder is not in the engine's order (master-type plugins first)")
    for n in served:
        c = cslot.get(n.lower())
        if c is None:
            problems.append(f"{n} is on the server, not enabled on the clients")
        elif c != sslot[n.lower()]:
            problems.append(f"{n} is on slot {c} on the clients and {sslot[n.lower()]} on the server")
    light = sum(1 for v in cslot.values() if v.startswith("FE"))
    summary = (f"load order: {len(client)} on the clients ({len(client) - light} full, {light} light), "
               f"{len(served)} on the server, every served plugin on the clients' slot")
    return problems, summary


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.split("\n\n")[0], file=sys.stderr)
        return 2
    problems, summary = check(Path(argv[0]), Path(argv[1]))
    for p in problems:
        print(p)
    print(summary if not problems else f"{len(problems)} load-order problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
