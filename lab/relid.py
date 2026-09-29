#!/usr/bin/env python3
"""Index every Address Library ID that CommonLibSSE-NG names, so a Ghidra
program of SkyrimSE.exe can carry CommonLib's names (docs/LAB.md, Track R3)
and `just addr <id>` can say what an ID is.

Sources, all in the pinned submodule (rule 1: never an ID from memory):
  RELOCATION_ID(se, ae) / REL::RelocationID(se, ae) / REL::ID(id) sites in
    include/ and src/: a function when a `using func_t = decltype(&X::Y);`
    line precedes it, else a data relocation named after its variable and the
    enclosing scope;
  Offsets_VTABLE.h: std::array<REL::VariantID, N> VTABLE_X{ ... } (one row per
    array slot);
  Offsets_RTTI.h and Offsets_NiRTTI.h: constexpr REL::VariantID RTTI_X(...).

Output: a TSV with columns se, ae, vr, kind, name, slot, file, line, sorted by
(ae, se). `python3 lab/relid.py [--root CommonLibSSE-NG] [--out lab/relids.tsv]`.
The table is derived data; it is regenerated, not edited.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ID_CALL = re.compile(
    r"(?:RELOCATION_ID|REL::RelocationID)\(\s*(\d+)\s*,\s*(\d+)\s*\)"
    r"|REL::VariantID\(\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(0x[0-9a-fA-F]+|\d+)\s*)?\)"
    r"|REL::ID\(\s*(\d+)\s*\)"
)
FUNC_T = re.compile(r"using\s+func_t\s*=\s*decltype\(\s*&\s*([A-Za-z_][\w:<>]*)\s*\)")
RELOC_VAR = re.compile(r"REL::Relocation<[^{;]*>\s*([A-Za-z_]\w*)\s*\{")
SCOPE_OPEN = re.compile(r"^\s*(?:namespace|class|struct|union)\s+([A-Za-z_][\w:]*)")
# A definition line: optional return type, a possibly qualified name, an open
# paren, and no semicolon (declarations end with one). One character class per
# segment keeps the match linear; the old nested version took minutes.
FUNC_DEF = re.compile(r"^[^;=(){}]*?((?:[A-Za-z_]\w*::)*~?[A-Za-z_]\w*)\s*\([^;]*$")
OFFSET_CONST = re.compile(r"constexpr\s+auto\s+([A-Za-z_]\w*)\s*=\s*(?:RELOCATION_ID|REL::RelocationID|REL::VariantID|REL::ID)\(")
RTTI_DECL = re.compile(r"REL::VariantID\s+((?:RTTI|NiRTTI)_[A-Za-z_]\w*)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)")
ARRAY_VAR = re.compile(r"\b((?:VTABLE|RTTI|NiRTTI)_[A-Za-z_]\w*)\s*[\{\(]")


@dataclass(frozen=True)
class Entry:
    se: int | None
    ae: int | None
    vr: int | None
    kind: str  # function | data | offset | vtable | rtti | nirtti
    name: str
    slot: int
    file: str
    line: int

    def row(self) -> str:
        v = lambda x: "" if x is None else str(x)  # noqa: E731
        return "\t".join([v(self.se), v(self.ae), v(self.vr), self.kind, self.name, str(self.slot), self.file, str(self.line)])


def _strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def _scan_scopes(lines: list[str]) -> list[list[tuple[str, str]]]:
    """The scope path (namespaces, classes, functions) in force at each line.
    Brace counting over comment-stripped text; templates and macros are best
    effort, and the tests measure how much of the submodule resolves."""
    stack: list[tuple[str, int, str]] = []  # (name, depth at which it opened, ns | type | fn)
    depth = 0
    pending: tuple[str, str] | None = None
    out: list[list[tuple[str, str]]] = []
    for line in lines:
        m = SCOPE_OPEN.match(line)
        if m:
            pending = (m.group(1), "ns" if line.lstrip().startswith("namespace") else "type")
        elif pending is None and "(" in line and ";" not in line:
            fm = FUNC_DEF.match(line)
            if fm and not line.lstrip().startswith(("return", "if", "for", "while", "switch", "else", "using", "#", "REL::", "std::")):
                pending = (fm.group(1), "fn")
        for ch in line:
            if ch == "{":
                depth += 1
                if pending is not None:
                    for part in pending[0].split("::"):
                        stack.append((part, depth, pending[1]))
                    pending = None
            elif ch == "}":
                while stack and stack[-1][1] >= depth:
                    stack.pop()
                depth = max(depth - 1, 0)
        if pending is not None and line.rstrip().endswith(";"):
            pending = None  # a declaration, not a definition
        out.append([(n, k) for n, _, k in stack])
    return out


def _compose(scope: list[tuple[str, str]], target: str) -> str:
    """`decltype(&Actor::Foo)` inside namespace RE is RE::Actor::Foo. The
    namespaces and enclosing types in force qualify the target; a target that
    already names one of them starts there, so nothing is doubled."""
    outer = [n for n, k in scope if k in ("ns", "type")]
    head = target.split("::")[0]
    if head in outer:
        return "::".join(outer[: outer.index(head)] + target.split("::"))
    return "::".join(outer + [target]) if outer else target


def index_file(path: Path, root: Path) -> list[Entry]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    text = _strip_comments(raw)
    lines = text.split("\n")
    rel = str(path.relative_to(root))
    entries: list[Entry] = []
    base = path.name
    if base in ("Offsets_RTTI.h", "Offsets_NiRTTI.h"):
        kind = "rtti" if base == "Offsets_RTTI.h" else "nirtti"
        for i, line in enumerate(lines, 1):
            m = RTTI_DECL.search(line)
            if m:
                entries.append(Entry(int(m.group(2)), int(m.group(3)), int(m.group(4), 0), kind, m.group(1), 0, rel, i))
        return entries
    if base == "Offsets_VTABLE.h":
        for i, line in enumerate(lines, 1):
            nm = ARRAY_VAR.search(line)
            if not nm:
                continue
            for slot, m in enumerate(ID_CALL.finditer(line)):
                se, ae, vr = _ids(m)
                entries.append(Entry(se, ae, vr, "vtable", nm.group(1), slot, rel, i))
        return entries
    scopes = _scan_scopes(lines)
    for i, line in enumerate(lines, 1):
        for m in ID_CALL.finditer(line):
            se, ae, vr = _ids(m)
            scope = scopes[i - 1]
            func_t = None
            for back in range(max(0, i - 6), i):
                fm = FUNC_T.search(lines[back])
                if fm:
                    func_t = fm.group(1)
            if func_t and "func_t" in line:
                entries.append(Entry(se, ae, vr, "function", _compose(scope, func_t), 0, rel, i))
                continue
            names = [n for n, _ in scope]
            om = OFFSET_CONST.search(line)
            if om:  # RE::Offset::Class::Name constants (Offsets.h): a function or a global, the header does not say
                entries.append(Entry(se, ae, vr, "offset", "::".join(names + [om.group(1)]), 0, rel, i))
                continue
            vm = RELOC_VAR.search(line)
            var = vm.group(1) if vm else "?"
            entries.append(Entry(se, ae, vr, "data", "::".join(names + [var]) if names else var, 0, rel, i))
    return entries



def _ids(m: re.Match) -> tuple[int | None, int | None, int | None]:
    if m.group(1):
        return int(m.group(1)), int(m.group(2)), None
    if m.group(3):
        vr = m.group(5)
        return int(m.group(3)), int(m.group(4)), (int(vr, 0) if vr else None)
    return int(m.group(6)), int(m.group(6)), None


def index_tree(root: Path) -> list[Entry]:
    out: list[Entry] = []
    for sub in ("include", "src"):
        for p in sorted((root / sub).rglob("*")):
            if p.suffix in (".h", ".cpp", ".inl") and p.is_file():
                out.extend(index_file(p, root))
    return sorted(out, key=lambda e: (e.ae if e.ae is not None else -1, e.se if e.se is not None else -1, e.slot))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default="CommonLibSSE-NG")
    ap.add_argument("--out", default="lab/relids.tsv")
    a = ap.parse_args(argv)
    root = Path(a.root)
    if not (root / "include" / "REL" / "ID.h").exists():
        print(f"no CommonLibSSE-NG at {root}", file=sys.stderr)
        return 2
    entries = index_tree(root)
    Path(a.out).write_text("se\tae\tvr\tkind\tname\tslot\tfile\tline\n" + "".join(e.row() + "\n" for e in entries))
    kinds: dict[str, int] = {}
    for e in entries:
        kinds[e.kind] = kinds.get(e.kind, 0) + 1
    unnamed = sum(1 for e in entries if e.name.endswith("?"))
    print(f"{len(entries)} ids -> {a.out}: " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())) + f"; {unnamed} data sites without a variable name")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
