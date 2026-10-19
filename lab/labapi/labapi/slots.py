"""The engine's plugin slots for a load order: the lab's one slot math. lab-api resolves a scenario's
FormDesc form name, "<local hex>:<plugin>", against the run's own load order with it, and
lab/tools/load-order-check.py (layer-stage step 2b) holds a layer's client order to the server's with it.

The engine sorts every master-type plugin (an .esm or .esl, or the ESM flag 0x1 in its TES4 header) before
the rest, keeping the listed order within each group, and gives a light plugin (an .esl, or the ESL flag
0x200) the next FE slot and every other plugin the next full slot (UESP, "Skyrim Mod:Mod File Format";
libespm reads light the same way, Combiner.cpp). A form id carries its plugin's slot: the slot and a
24-bit local id for a full plugin, FE, a 12-bit slot and a 12-bit local id for a light one. A form named
by plugin and local id therefore survives any change to the load order: the essentials layer moved
Apocalypse from 0C to 1A and LostGrimoire from 0B to 28 (2026-10-19)."""
from __future__ import annotations

import json
import struct
from pathlib import Path

ESM, ESL = 0x1, 0x200


def header(path: Path) -> tuple[int, list[str]]:
    """A plugin's TES4 record flags and its masters (MAST fields), in order."""
    with open(path, "rb") as f:
        h = f.read(24)
        if h[:4] != b"TES4":
            raise ValueError(f"{path}: not a TES4 plugin")
        size, flags = struct.unpack("<II", h[4:12])
        data = f.read(size)
    masters, i = [], 0
    while i + 6 <= len(data):
        typ, n = data[i:i + 4], struct.unpack("<H", data[i + 4:i + 6])[0]
        if typ == b"MAST":
            masters.append(data[i + 6:i + 6 + n].rstrip(b"\0").decode("cp1252"))
        i += 6 + n
    return flags, masters


def is_master(name: str, flags: int) -> bool:
    return name.lower().endswith((".esm", ".esl")) or bool(flags & ESM)


def is_light(name: str, flags: int) -> bool:
    return name.lower().endswith(".esl") or bool(flags & ESL)


def engine_order(order: list[str], flags: dict[str, int]) -> list[str]:
    """The order the engine loads `order` in: master-type plugins first. `flags` is keyed by lowercased name."""
    f = lambda n: flags.get(n.lower(), 0)
    return [n for n in order if is_master(n, f(n))] + [n for n in order if not is_master(n, f(n))]


def slots(order: list[str], flags: dict[str, int]) -> dict[str, tuple[bool, int]]:
    """Each plugin's slot in the engine's order, keyed by lowercased name: (light, index)."""
    out: dict[str, tuple[bool, int]] = {}
    full = light = 0
    for n in engine_order(order, flags):
        if is_light(n, flags.get(n.lower(), 0)):
            out[n.lower()] = (True, light); light += 1
        else:
            out[n.lower()] = (False, full); full += 1
    return out


def label(slot: tuple[bool, int]) -> str:
    """A slot as a form id's prefix reads: "1A" for a full one, "FE004" for a light one."""
    light, index = slot
    return f"FE{index:03X}" if light else f"{index:02X}"


def compose(slot: tuple[bool, int], local: int) -> int:
    """The form id of a plugin's record `local` in `slot`."""
    light, index = slot
    if light:
        if not 0 <= local <= 0xFFF:
            raise ValueError(f"local id 0x{local:X} does not fit a light plugin's 12 bits")
        return 0xFE000000 | (index << 12) | local
    if not 0 <= local <= 0xFFFFFF:
        raise ValueError(f"local id 0x{local:X} does not fit a full plugin's 24 bits")
    return (index << 24) | local


def for_settings(settings: Path, esm_dir: Path) -> dict[str, tuple[bool, int]]:
    """The slots of a server settings file's loadOrder, each plugin's flags read from its file in esm_dir
    (the directory the server mounts at /srv/skymp/esm for that game version)."""
    order = [Path(p).name for p in json.loads(Path(settings).read_text())["loadOrder"]]
    flags = {n.lower(): header(Path(esm_dir) / n)[0] for n in order}
    return slots(order, flags)
