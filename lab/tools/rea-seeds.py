#!/usr/bin/env python3
"""rea-seeds.py: a Ghidra seed file for REA from CommonLibSSE-NG's names.

REA (morluto/rea, the re-analyst's default static RE route, docs/LAB.md)
imports the exe into a fresh Ghidra project per server process, so its
answers name functions FUN_14xxxxxxx. REA_GHIDRA_SEED_FILE (format
rea-ghidra-seeds-v1: lines `0x<address>\\t<kind>[\\t<name>]`, kinds function,
code, label; applied before auto-analysis) lets the project start with names.
This script builds that file from lab/relids.tsv (`just relid`: every Address
Library ID CommonLibSSE-NG names) resolved through lab/addr.py for the pinned
runtime, so no address comes from anywhere but the two sources rule 1 allows.

  function and offset rows (CommonLib's function relocations and Offsets.h)
    -> function <Class::Method>  (the leading RE:: or RE::Offset:: dropped)
  data rows                     -> label <scope::name>
  vtable rows                   -> label VTABLE_<Class>[_slot<n>]
  rtti and nirtti rows          -> label RTTI_<Class> / NiRTTI_<Class>

Usage: rea-seeds.py [--relids lab/relids.tsv] [--addrlib addrlib]
                    [--runtime 1.6.1170] [--base 0x140000000] [--out PATH]
The base is the PE image base Ghidra loads the exe at (REA reports its
addresses in that space, docs/research/tools/rea-trial.md). Rows whose AE id
is 0 (CommonLib has no id for that runtime) or absent from the database are
skipped and counted. REA admits one seed per address and kind, so names that
share an address (CommonLib aliases such as MagicItem::IsValid and
IsPermanent) are joined with __or__; relid.py's `::?` (an unnamed data
relocation in a function's scope) becomes `::data`.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import addr  # noqa: E402  (lab/addr.py)

KIND_OF = {"function": "function", "offset": "function", "data": "label",
           "vtable": "label", "rtti": "label", "nirtti": "label"}


def seed_name(kind: str, name: str, slot: str) -> str:
    if kind == "offset" and name.startswith("RE::Offset::"):
        name = name[len("RE::Offset::"):]
    elif name.startswith("RE::"):
        name = name[len("RE::"):]
    if kind == "vtable" and slot not in ("", "0"):
        name = f"{name}_slot{slot}"
    if name.endswith("::?"):
        name = name[:-1] + "data"
    return name.replace(" ", "_").replace("?", "_")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--relids", default="lab/relids.tsv")
    ap.add_argument("--addrlib", default="addrlib")
    ap.add_argument("--runtime", default="1.6.1170")
    ap.add_argument("--base", default="0x140000000")
    ap.add_argument("--out", default="lab/.cache/rea-seeds-1.6.1170.tsv")
    a = ap.parse_args(argv)
    base = int(a.base, 16)
    db = addr.load_for_runtime(Path(a.addrlib), a.runtime)
    tally: Counter[str] = Counter()
    names: dict[tuple[int, str], list[str]] = {}
    with open(a.relids, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            kind = row["kind"]
            if kind not in KIND_OF:
                tally["skipped:kind " + kind] += 1
                continue
            ae = int(row["ae"] or 0)
            if ae == 0:
                tally["skipped:no AE id"] += 1
                continue
            try:
                address = db.address(ae, base)
            except addr.AddrLibError:
                tally["skipped:id not in database"] += 1
                continue
            key = (address, KIND_OF[kind])
            name = seed_name(kind, row["name"], row.get("slot", ""))
            if key in names:
                if name not in names[key]:
                    names[key].append(name)
                    tally["aliases joined"] += 1
                continue
            names[key] = [name]
            tally[KIND_OF[kind]] += 1
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(f"# rea-ghidra-seeds-v1 for SkyrimSE {a.runtime} at base {a.base}: CommonLibSSE-NG's names from {a.relids} through addrlib (thuum lab/tools/rea-seeds.py)\n")
        for (address, kind), alias in sorted(names.items()):
            f.write(f"0x{address:x}\t{kind}\t{'__or__'.join(alias)}\n")
    print(f"{out}: {len(names)} seeds; " + ", ".join(f"{k} {v}" for k, v in sorted(tally.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
