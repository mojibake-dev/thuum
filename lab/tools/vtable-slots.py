#!/usr/bin/env python3
"""vtable-slots.py: CommonLibSSE-NG's virtual slot comments as rows that
lab/tools/GhidraNames.java names vtable targets from.

CommonLib declares every virtual with its slot in a trailing comment, grouped
under section headers (RE/T/TESForm.h:121 to :133):

    // override (BaseFormComponent)
    void InitializeDataComponent() override;  // 01
    // add
    virtual bool AddChange(std::uint32_t a_changeFlags);  // 0A

A class's primary vtable, VTABLE_<Class>[0] in Offsets_VTABLE.h, holds the
slots of its primary base chain (the first base listed, recursively) and of
its own `// add` section. An override of a secondary base (TESObjectREFR's
`// override (BSHandleRefObject)`) lives in that base's subobject vtable,
VTABLE_<Class>[n] for n > 0, so those sections are skipped and counted, not
guessed. A slot with no section header, or under a bare `// override`, is kept
when the class has one base or none, when it is the destructor (slot 0 of
every vtable), or when a class of the primary chain declares the same method
at the same slot; otherwise it is skipped. Pure virtuals (`= 0`) are skipped:
an abstract class's slot holds _purecall, not the method.

Conditional blocks are read as an AE-only build compiles them: ENABLE_SKYRIM_AE
defined; ENABLE_SKYRIM_SE, ENABLE_SKYRIM_VR and so SKYRIM_CROSS_VR (REL/Common.h:3)
undefined, which makes SKYRIM_REL_VR_VIRTUAL `virtual` (REL/Common.h:94); its
slot comments name the SE/AE slot first (`// 1B, 1C`). Template classes are
skipped (one header, many vtables).

Each class's vtable is the VTABLE constant it declares (`inline static
constexpr auto VTABLE = VTABLE_TESObjectREFR;`), else the one its RTTI constant
names (RTTI_X, VTABLE_X), else VTABLE_<path> with `::` as `__`. Offsets_VTABLE.h
spells the engine's RTTI name, which CommonLib's C++ path can differ from
(RE::CraftingSubMenus::CraftingSubMenus::AlchemyMenu is RTTI_CraftingSubMenus__AlchemyMenu),
so rows name the class as the vtable does. The address is lab/relids.tsv's AE id
(kind vtable, slot 0) resolved through lab/addr.py, never typed (rule 1).

Output, thuum-vtable-slots-v1, sorted by primary-chain depth so a base class's
row comes before a derived class's at a shared (folded) target:
  0x<vtable address>\\t0x<slot>\\t<Class::method>\\t<RE/file.h:line>
at image base 0x140000000; GhidraNames.java reads the pointer at vtable + slot * 8
and checks the vtable's RTTI against the class first.

Usage: vtable-slots.py [--root CommonLibSSE-NG] [--relids lab/relids.tsv]
                       [--addrlib addrlib] [--runtime 1.6.1170]
                       [--base 0x140000000] [--out PATH]
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import addr  # noqa: E402  (lab/addr.py)

# The AE-only build's macros (module docstring); every other macro is undefined.
DEFINED = {"ENABLE_SKYRIM_AE"}

COND = re.compile(r"^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)$")
HEAD = re.compile(r"^\s*(?:template\s*<.*>\s*)?(?:class|struct|union)\b")
TEMPLATE = re.compile(r"^\s*template\s*<")
NAMESPACE = re.compile(r"^\s*(?:inline\s+)?namespace\b\s*([A-Za-z_][\w:]*)?")
SECTION_ADD = re.compile(r"^\s*add\s*$")
SECTION_OVERRIDE = re.compile(r"^\s*overrides?\b\s*(?:for\b)?\s*\(?\s*(.*?)\s*\)?\s*$")
SECTION_END = re.compile(r"^\s*members\s*$")
SLOT = re.compile(r"^\s*([0-9A-Fa-f]{1,3})(?![0-9A-Za-z_])")
VTABLE_CONST = re.compile(r"\bVTABLE\s*=\s*(VTABLE_\w+)\s*;")
RTTI_CONST = re.compile(r"\bRTTI\s*=\s*RTTI_(\w+)\s*;")
VIRTUAL = re.compile(r"\b(?:virtual|override|SKYRIM_REL_VR_VIRTUAL)\b")
PURE = re.compile(r"=\s*0\s*;")
ATTRIBUTE = re.compile(r"\[\[[^\]]*\]\]")
METHOD = re.compile(r"(operator\s*(?:\(\s*\)|[^\s(]+)|~?\b[A-Za-z_]\w*)\s*\(")
DECOR = re.compile(r"__declspec\s*\([^)]*\)|alignas\s*\([^)]*\)|\[\[[^\]]*\]\]")
MAX_SLOT = 0x400
# Offsets_VTABLE.h spells an anonymous namespace as an empty component (VTABLE___ArmorRatingVisitorBase,
# VTABLE_BSResource____DevNull); Ghidra's MSVC demangler names one `anonymous namespace' and applies it
# with the space as _ (ghidra/app/util/demangler/DemangledObject.java), so the rows do too.
ANON = "`anonymous_namespace'"


@dataclass
class Slot:
    slot: int
    method: str
    section: str | None  # None: before any header; "add"; "override" (bare); else the base as written
    pure: bool
    line: int


@dataclass
class ClassDecl:
    path: tuple[str, ...]  # ("RE", "BSScript", "Internal", "VirtualMachine")
    bases: list[str]
    template: bool
    file: str
    line: int
    vtable: str | None = None
    rtti: str | None = None
    slots: list[Slot] = field(default_factory=list)

    @property
    def name(self) -> str:
        p = self.path[1:] if self.path[:1] == ("RE",) else self.path
        return "::".join(p)


def eval_cond(kind: str, expr: str, unknown: Counter) -> bool:
    expr = expr.split("//")[0].strip()
    if kind == "ifdef":
        return expr.split()[0] in DEFINED
    if kind == "ifndef":
        return expr.split()[0] not in DEFINED
    py = re.sub(r"defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)",
                lambda m: " True " if (m.group(1) or m.group(2)) in DEFINED else " False ", expr)
    py = py.replace("&&", " and ").replace("||", " or ")
    py = re.sub(r"!(?!=)", " not ", py)
    if set(re.findall(r"[A-Za-z_]\w*", py)) <= {"True", "False", "and", "or", "not"} and re.fullmatch(r"[\w\s()]*", py):
        return bool(eval(py))  # noqa: S307  (only True/False/and/or/not/parens/digits reach here)
    unknown[expr] += 1
    return False


def split_comment(line: str) -> tuple[str, str | None]:
    """Code and the trailing // comment (outside string and char literals)."""
    quote = None
    i = 0
    while i < len(line):
        c = line[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'":
            quote = c
        elif line.startswith("//", i):
            return line[:i], line[i + 2:]
        i += 1
    return line, None


def strip_literals(code: str) -> str:
    return re.sub(r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'", '""', code)


def split_bases(text: str) -> list[str]:
    out, depth, cur = [], 0, ""
    for c in text:
        if c == "<":
            depth += 1
        elif c == ">":
            depth -= 1
        if c == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += c
    out.append(cur)
    bases = []
    for b in out:
        b = re.sub(r"\b(public|protected|private|virtual)\b", "", b).strip()
        if b:
            bases.append(re.sub(r"\s+", "", b))
    return bases


def parse_head(text: str) -> tuple[str, list[str], bool] | None:
    """`class X : public A, public B` -> (X, [A, B], is_template_specialization)."""
    text = DECOR.sub(" ", text)
    m = re.match(r"^\s*(?:template\s*<.*?>\s*)?(?:class|struct|union)\s+([A-Za-z_]\w*)\s*(<)?", text)
    if not m:
        return None
    rest = text[m.end():]
    special = m.group(2) is not None
    if special:
        depth = 1
        i = 0
        while i < len(rest) and depth:
            depth += {"<": 1, ">": -1}.get(rest[i], 0)
            i += 1
        rest = rest[i:]
    rest = re.sub(r"^\s*final\b", "", rest)
    bases = split_bases(rest.split(":", 1)[1]) if rest.lstrip().startswith(":") else []
    return m.group(1), bases, special


def parse_file(path: Path, root: Path, unknown: Counter) -> list[ClassDecl]:
    rel = str(path.relative_to(root / "include"))
    lines = path.read_text(encoding="utf-8", errors="replace").split("\n")
    classes: list[ClassDecl] = []
    cond: list[tuple[bool, bool]] = []  # (active, a branch already taken)
    frames: list[tuple[str, str | None, int, ClassDecl | None]] = []  # (kind, name, depth, decl)
    depth = 0
    in_block = False
    in_macro = False
    pending: tuple[str, str, int, bool] | None = None  # (kind, head text, line, template)
    template_next = False
    section: dict[int, str | None] = {}  # class frame depth -> current section
    stmt: dict[int, str] = {}  # class frame depth -> code since the last statement boundary

    def active() -> bool:
        return all(a for a, _ in cond)

    for lineno, raw in enumerate(lines, 1):
        m = COND.match(raw)
        if m and not in_block:
            kind, expr = m.group(1), m.group(2)
            if kind in ("if", "ifdef", "ifndef"):
                outer = active()
                val = eval_cond(kind, expr, unknown) if outer else False
                cond.append((val, val))
            elif kind == "elif" and cond:
                _, taken = cond[-1]
                outer = all(a for a, _ in cond[:-1])
                val = (not taken) and outer and eval_cond("if", expr, unknown)
                cond[-1] = (val, taken or val)
            elif kind == "else" and cond:
                _, taken = cond[-1]
                outer = all(a for a, _ in cond[:-1])
                cond[-1] = (outer and not taken, True)
            elif kind == "endif" and cond:
                cond.pop()
            continue
        if not active():
            continue
        if in_macro:
            in_macro = raw.rstrip().endswith("\\")
            continue
        if raw.lstrip().startswith("#") and not in_block:
            in_macro = raw.rstrip().endswith("\\")
            continue
        line = raw
        if in_block:
            end = line.find("*/")
            if end < 0:
                continue
            line = " " * (end + 2) + line[end + 2:]
            in_block = False
        while "/*" in split_comment(line)[0]:
            start = line.find("/*")
            end = line.find("*/", start + 2)
            if end < 0:
                line = line[:start]
                in_block = True
                break
            line = line[:start] + " " * (end + 2 - start) + line[end + 2:]
        code, comment = split_comment(line)
        code_nl = strip_literals(code)

        top = frames[-1] if frames else None
        in_class_body = top is not None and top[0] == "class" and top[2] == depth
        if in_class_body:
            decl = top[3]
            if not code.strip() and comment is not None:
                if SECTION_ADD.match(comment):
                    section[depth] = "add"
                elif comment.strip().startswith("override") and SECTION_OVERRIDE.match(comment):
                    base = SECTION_OVERRIDE.match(comment).group(1)
                    section[depth] = re.sub(r"\s+", "", base) if base else "override"
                elif SECTION_END.match(comment):
                    section[depth] = "members"
            vm = VTABLE_CONST.search(code_nl)
            if vm:
                decl.vtable = vm.group(1)
            rm = RTTI_CONST.search(code_nl)
            if rm:
                decl.rtti = rm.group(1)
            sm = SLOT.match(comment) if comment is not None else None
            text = stmt.get(depth, "") + " " + code_nl
            if sm and code.strip():
                if VIRTUAL.search(text):
                    t = ATTRIBUTE.sub(" ", text)
                    mm = METHOD.search(t)
                    if mm:
                        method = re.sub(r"\s+", "", mm.group(1))
                        decl.slots.append(Slot(int(sm.group(1), 16), method, section.get(depth),
                                               bool(PURE.search(t)), lineno))
                stmt[depth] = ""
            elif code.strip():
                stmt[depth] = text
            if code.strip().endswith((";", "{", "}", ":")):
                stmt[depth] = ""

        stripped = code_nl.strip()
        if pending is None and stripped:
            if TEMPLATE.match(stripped) and not HEAD.match(stripped):
                template_next = True
            elif HEAD.match(stripped) and not re.match(r"^\s*(?:enum|friend)\b", stripped):
                pending = ("class", "", lineno, template_next or bool(TEMPLATE.match(stripped)))
                template_next = False
            elif NAMESPACE.match(stripped):
                pending = ("ns", "", lineno, False)
            elif stripped.endswith((";", "}")):
                template_next = False

        for ch in code_nl:
            if pending is not None and ch not in "{;":
                pending = (pending[0], pending[1] + ch, pending[2], pending[3])
            if ch == "{":
                depth += 1
                if pending is not None:
                    kind, head, hline, tmpl = pending
                    pending = None
                    if kind == "ns":
                        nm = NAMESPACE.match(head)
                        name = nm.group(1) if nm and nm.group(1) else None
                        for part in (name or "").split("::"):
                            frames.append(("ns", part or None, depth, None))
                    else:
                        parsed = parse_head(head)
                        if parsed is None:
                            frames.append(("other", None, depth, None))
                            continue
                        name, bases, special = parsed
                        outer = tuple(n for k, n, _, _ in frames if k in ("ns", "class") and n)
                        decl = ClassDecl(outer + (name,), bases, tmpl or special, rel, hline)
                        classes.append(decl)
                        frames.append(("class", name, depth, decl))
                        section[depth] = None
                        stmt[depth] = ""
                else:
                    frames.append(("other", None, depth, None))
            elif ch == "}":
                while frames and frames[-1][2] >= depth:
                    frames.pop()
                depth = max(depth - 1, 0)
            elif ch == ";" and pending is not None:
                pending = None  # a forward declaration or a using-namespace line
        if pending is not None:
            pending = (pending[0], pending[1] + " ", pending[2], pending[3])  # heads span lines
    return classes


def resolve(base: str, scope: tuple[str, ...], index: dict[tuple[str, ...], ClassDecl]) -> ClassDecl | None:
    parts = tuple(re.sub(r"<.*>", "", base).split("::"))
    if parts[0] == "":
        parts = parts[1:]
    for n in range(len(scope), -1, -1):
        decl = index.get(scope[:n] + parts)
        if decl is not None:
            return decl
    return None


def chain_of(decl: ClassDecl, index: dict[tuple[str, ...], ClassDecl]) -> tuple[list[ClassDecl], set[str]]:
    """The primary base chain (first base, recursively) and every spelling of it
    an override header might use: as written, without template arguments,
    fully qualified without RE::, and the last component."""
    chain: list[ClassDecl] = []
    names: set[str] = set()
    cur = decl
    seen = {decl.path}
    while cur.bases:
        base = cur.bases[0]
        names.update({base, re.sub(r"<.*>", "", base), base.split("::")[-1]})
        nxt = resolve(base, cur.path[:-1], index)
        if nxt is None or nxt.path in seen:
            break
        seen.add(nxt.path)
        chain.append(nxt)
        names.update({nxt.name, nxt.path[-1]})
        cur = nxt
    return chain, names


def primary_slots(c: ClassDecl, chain: list[ClassDecl], chain_names: set[str]) -> tuple[list[Slot], list[tuple[str, str]]]:
    """The class's slot declarations that sit in its primary vtable, and (reason, where) for the rest."""
    declared = {(s.method, s.slot) for k in chain for s in k.slots}
    kept: dict[int, Slot | None] = {}
    skipped: list[tuple[str, str]] = []
    for s in c.slots:
        where = f"{c.name}::{s.method} ({c.file}:{s.line})"
        if s.slot >= MAX_SLOT:
            skipped.append(("slot comment past 0x400", where))
            continue
        if s.pure:
            skipped.append(("pure virtual (the slot holds _purecall)", where))
            continue
        if s.section == "members":
            skipped.append(("declared after a // members header", where))
            continue
        if s.section in (None, "override"):
            if not (len(c.bases) <= 1 or s.method.startswith("~") or (s.method, s.slot) in declared):
                skipped.append(("no base named and the class has several", where))
                continue
        elif s.section != "add" and s.section not in chain_names:
            skipped.append(("secondary base's vtable", where))
            continue
        if s.slot in kept:
            prev = kept[s.slot]
            if prev is None or prev.method != s.method:
                skipped.append(("two methods claim one slot", f"{where} vs {prev.method if prev else 'another'}"))
                kept[s.slot] = None  # neither is trusted
            continue
        kept[s.slot] = s
    return [s for s in kept.values() if s is not None], skipped


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default="CommonLibSSE-NG")
    ap.add_argument("--relids", default="lab/relids.tsv")
    ap.add_argument("--addrlib", default="addrlib")
    ap.add_argument("--runtime", default="1.6.1170")
    ap.add_argument("--base", default="0x140000000")
    ap.add_argument("--out", default="lab/.cache/vtable-slots-1.6.1170.tsv")
    a = ap.parse_args(argv)
    root = Path(a.root)
    if not (root / "include" / "RE").is_dir():
        print(f"no CommonLibSSE-NG headers under {root}", file=sys.stderr)
        return 2
    base = int(a.base, 16)
    db = addr.load_for_runtime(Path(a.addrlib), a.runtime)
    vtable_ae: dict[str, int] = {}
    with open(a.relids, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            if row["kind"] == "vtable" and row["slot"] == "0":
                vtable_ae[row["name"]] = int(row["ae"] or 0)

    unknown: Counter[str] = Counter()
    classes: list[ClassDecl] = []
    for p in sorted((root / "include" / "RE").rglob("*.h")):
        classes.extend(parse_file(p, root, unknown))
    index: dict[tuple[str, ...], ClassDecl] = {}
    for c in classes:
        index.setdefault(c.path, c)

    tally: Counter[str] = Counter()
    examples: dict[str, list[str]] = defaultdict(list)

    def skip(reason: str, what: str, n: int = 1) -> None:
        tally["skipped: " + reason] += n
        if len(examples[reason]) < 4:
            examples[reason].append(what)

    rows: list[tuple[int, str, int, int, str, str]] = []  # (depth, class, slot, vtable, name, where)
    for c in classes:
        if not c.slots:
            continue
        if c.template:
            skip("template class (one header, many vtables)", c.name, len(c.slots))
            continue
        # The class's own VTABLE constant, else the one its RTTI constant names (Offsets_VTABLE.h and
        # Offsets_RTTI.h spell the engine's RTTI name alike; CommonLib's C++ path can differ, e.g.
        # RE::CraftingSubMenus::CraftingSubMenus::AlchemyMenu is RTTI_CraftingSubMenus__AlchemyMenu),
        # else its path. Rows carry the engine's name, the one the binary's RTTI spells.
        vt_name = c.vtable or (f"VTABLE_{c.rtti}" if c.rtti else "VTABLE_" + c.name.replace("::", "__"))
        engine = "::".join(part or ANON for part in vt_name[len("VTABLE_"):].split("__"))
        ae = vtable_ae.get(vt_name)
        if ae is None:
            skip("no vtable row in relids.tsv", f"{c.name} ({vt_name})", len(c.slots))
            continue
        if ae == 0:
            skip("vtable has no AE id", vt_name, len(c.slots))
            continue
        try:
            vt = db.address(ae, base)
        except addr.AddrLibError:
            skip("vtable id not in the database", f"{vt_name} ({ae})", len(c.slots))
            continue
        chain, chain_names = chain_of(c, index)
        kept, skipped = primary_slots(c, chain, chain_names)
        for reason, where in skipped:
            skip(reason, where)
        for s in kept:
            rows.append((len(chain), engine, s.slot, vt, f"{engine}::{s.method}", f"{c.file}:{s.line}"))
        tally["rows"] += len(kept)
        tally["classes with rows"] += 1 if kept else 0

    rows.sort(key=lambda r: (r[0], r[1], r[2]))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(f"# thuum-vtable-slots-v1 for SkyrimSE {a.runtime} at base {a.base}: CommonLibSSE-NG's primary-vtable slot comments, "
                f"vtables from {a.relids} through addrlib (thuum lab/tools/vtable-slots.py)\n")
        for _, _, slot, vt, name, where in rows:
            f.write(f"0x{vt:x}\t0x{slot:02x}\t{name}\t{where}\n")
    print(f"{out}: {tally['rows']} slot rows from {tally['classes with rows']} classes ({len(classes)} class bodies parsed)")
    for k, v in sorted(tally.items()):
        if k.startswith("skipped: "):
            print(f"  {k}: {v}; e.g. " + "; ".join(examples[k[len('skipped: '):]]))
    for expr, n in unknown.most_common():
        print(f"  conditional read as false (unknown macro): #if {expr} ({n}x)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
