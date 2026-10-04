#!/usr/bin/env python3
"""Read and write Skyrim's compiled Papyrus scripts (.pex), enough to declare
a native function in one.

Skyrim Platform binds its TESModPlatform natives to functions the compiled
script TESModPlatform.pex declares (skyrim-platform/src/platform_se/psc and
pex). The script is compiled with the Creation Kit's PapyrusCompiler.exe,
which neither CI nor this machine has, so a new native's declaration is added
to the compiled file here instead. The .psc gets the same line by hand, so a
Creation Kit build produces the same declaration.

Format (UESP, "Skyrim Mod:Compiled Script File Format"):
- **Encoding.** Big-endian. A string is a uint16 length and its bytes. A
  string reference is a uint16 index into the string table.
- **Header.** Magic 0xFA57C0DE, uint8 major and minor version, uint16 game id,
  uint64 compile time, then the source file, user and machine names.
- **String table:** a uint16 count, then the strings.
- **Debug info:** a uint8 flag. If set: a uint64 modification time, a uint16
  count, and per function the object, state and function name references,
  a uint8 type, a uint16 instruction count and one uint16 line number per
  instruction.
- **User flags:** a uint16 count, then (name reference, uint8 bit) pairs.
- **Objects:** a uint16 count. Each object is a name reference, a uint32 size
  that counts itself, then: parent, docstring, uint32 user flags, auto state,
  variables, properties and states, each list behind a uint16 count.
- **Function:** return type, docstring, uint32 user flags, uint8 flags (1
  global, 2 native), parameters and locals as (name, type) reference pairs,
  then instructions.
- **Instruction:** a uint8 opcode, then that opcode's fixed arguments. Each
  argument is a value: a type byte (0 null, 1 identifier, 2 string, 3 int32,
  4 float, 5 bool) and its payload. An opcode with variable arguments follows
  its fixed ones with a count, itself an integer value, and that many values.

Only that much of the format is modeled; anything else is a parse error.
`dump` prints a script's functions; `add-native` declares a global native
function in an object's default state and writes the file back.

    pex.py dump <file.pex>
    pex.py add-native <file.pex> <object> <function> <returnType> [name:Type ...]
"""

from __future__ import annotations

import struct
import sys
from dataclasses import dataclass, field

MAGIC = 0xFA57C0DE

# Fixed argument counts and whether variable arguments follow, opcodes 0x00 to
# 0x23 (UESP's opcode table): nop, iadd, fadd, isub, fsub, imul, fmul, idiv,
# fdiv, imod, not, ineg, fneg, assign, cast, cmp_eq, cmp_lt, cmp_le, cmp_gt,
# cmp_ge, jmp, jmpt, jmpf, callmethod, callparent, callstatic, return,
# strcat, propget, propset, array_create, array_length, array_getelement,
# array_setelement, array_findelement, array_rfindelement.
OPCODES: list[tuple[int, bool]] = [
    (0, False), (3, False), (3, False), (3, False), (3, False), (3, False), (3, False), (3, False),
    (3, False), (3, False), (2, False), (2, False), (2, False), (2, False), (2, False), (3, False),
    (3, False), (3, False), (3, False), (3, False), (1, False), (2, False), (2, False), (3, True),
    (2, True), (3, True), (1, False), (3, False), (3, False), (3, False), (2, False), (2, False),
    (3, False), (3, False), (4, False), (4, False),
]

FLAG_GLOBAL = 1
FLAG_NATIVE = 2


class PexError(Exception):
    pass


class Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def take(self, n: int) -> bytes:
        if self.pos + n > len(self.data):
            raise PexError(f"truncated at {self.pos}, wanted {n} bytes")
        b = self.data[self.pos:self.pos + n]
        self.pos += n
        return b

    def u8(self) -> int:
        return self.take(1)[0]

    def u16(self) -> int:
        return struct.unpack(">H", self.take(2))[0]

    def u32(self) -> int:
        return struct.unpack(">I", self.take(4))[0]

    def u64(self) -> int:
        return struct.unpack(">Q", self.take(8))[0]

    def wstr(self) -> bytes:
        return self.take(self.u16())


class Writer:
    def __init__(self):
        self.parts: list[bytes] = []

    def raw(self, b: bytes):
        self.parts.append(b)

    def u8(self, v: int):
        self.raw(bytes([v]))

    def u16(self, v: int):
        self.raw(struct.pack(">H", v))

    def u32(self, v: int):
        self.raw(struct.pack(">I", v))

    def u64(self, v: int):
        self.raw(struct.pack(">Q", v))

    def wstr(self, b: bytes):
        self.u16(len(b))
        self.raw(b)

    def bytes(self) -> bytes:
        return b"".join(self.parts)


@dataclass
class Value:
    kind: int
    payload: bytes  # as stored, so a round trip is exact

    @staticmethod
    def read(r: Reader) -> "Value":
        kind = r.u8()
        size = {0: 0, 1: 2, 2: 2, 3: 4, 4: 4, 5: 1}.get(kind)
        if size is None:
            raise PexError(f"value type {kind} at {r.pos - 1}")
        return Value(kind, r.take(size))

    def write(self, w: Writer):
        w.u8(self.kind)
        w.raw(self.payload)

    def as_int(self) -> int:
        if self.kind != 3:
            raise PexError(f"expected an integer value, got type {self.kind}")
        return struct.unpack(">i", self.payload)[0]


@dataclass
class Instruction:
    opcode: int
    args: list[Value]
    varargs: list[Value] | None

    @staticmethod
    def read(r: Reader) -> "Instruction":
        op = r.u8()
        if op >= len(OPCODES):
            raise PexError(f"opcode {op:#x} at {r.pos - 1}")
        fixed, has_var = OPCODES[op]
        args = [Value.read(r) for _ in range(fixed)]
        var = None
        if has_var:
            count = Value.read(r)
            var = [count] + [Value.read(r) for _ in range(count.as_int())]
        return Instruction(op, args, var)

    def write(self, w: Writer):
        w.u8(self.opcode)
        for a in self.args:
            a.write(w)
        for a in self.varargs or []:
            a.write(w)


@dataclass
class Function:
    return_type: int
    docstring: int
    user_flags: int
    flags: int
    params: list[tuple[int, int]]
    locals: list[tuple[int, int]]
    instructions: list[Instruction]

    @staticmethod
    def read(r: Reader) -> "Function":
        ret, doc, uflags, flags = r.u16(), r.u16(), r.u32(), r.u8()
        params = [(r.u16(), r.u16()) for _ in range(r.u16())]
        locals_ = [(r.u16(), r.u16()) for _ in range(r.u16())]
        instructions = [Instruction.read(r) for _ in range(r.u16())]
        return Function(ret, doc, uflags, flags, params, locals_, instructions)

    def write(self, w: Writer):
        w.u16(self.return_type)
        w.u16(self.docstring)
        w.u32(self.user_flags)
        w.u8(self.flags)
        w.u16(len(self.params))
        for n, t in self.params:
            w.u16(n)
            w.u16(t)
        w.u16(len(self.locals))
        for n, t in self.locals:
            w.u16(n)
            w.u16(t)
        w.u16(len(self.instructions))
        for i in self.instructions:
            i.write(w)


@dataclass
class Variable:
    name: int
    type: int
    user_flags: int
    value: Value


@dataclass
class Property:
    name: int
    type: int
    docstring: int
    user_flags: int
    flags: int
    auto_var: int | None
    read_handler: Function | None
    write_handler: Function | None


@dataclass
class State:
    name: int
    functions: list[tuple[int, Function]]


@dataclass
class Object:
    name: int
    parent: int
    docstring: int
    user_flags: int
    auto_state: int
    variables: list[Variable]
    properties: list[Property]
    states: list[State]


@dataclass
class DebugFunction:
    object: int
    state: int
    function: int
    kind: int
    lines: list[int]


@dataclass
class Pex:
    major: int
    minor: int
    game: int
    compiled: int
    source: bytes
    user: bytes
    machine: bytes
    strings: list[bytes]
    debug_time: int | None
    debug: list[DebugFunction]
    user_flags: list[tuple[int, int]]
    objects: list[Object] = field(default_factory=list)

    def string(self, i: int) -> str:
        return self.strings[i].decode("latin-1")

    def index(self, s: str) -> int:
        """The string's index, appending it when absent: existing indices
        never move."""
        b = s.encode("latin-1")
        try:
            return self.strings.index(b)
        except ValueError:
            self.strings.append(b)
            return len(self.strings) - 1


def parse(data: bytes) -> Pex:
    r = Reader(data)
    if r.u32() != MAGIC:
        raise PexError("not a compiled Papyrus script")
    major, minor, game, compiled = r.u8(), r.u8(), r.u16(), r.u64()
    source, user, machine = r.wstr(), r.wstr(), r.wstr()
    strings = [r.wstr() for _ in range(r.u16())]
    debug_time = None
    debug: list[DebugFunction] = []
    if r.u8():
        debug_time = r.u64()
        for _ in range(r.u16()):
            o, s, f, k = r.u16(), r.u16(), r.u16(), r.u8()
            debug.append(DebugFunction(o, s, f, k, [r.u16() for _ in range(r.u16())]))
    user_flags = [(r.u16(), r.u8()) for _ in range(r.u16())]
    p = Pex(major, minor, game, compiled, source, user, machine, strings, debug_time, debug, user_flags)
    for _ in range(r.u16()):
        name, size = r.u16(), r.u32()
        start = r.pos
        parent, doc, uflags, auto_state = r.u16(), r.u16(), r.u32(), r.u16()
        variables = []
        for _ in range(r.u16()):
            vn, vt, vf = r.u16(), r.u16(), r.u32()
            variables.append(Variable(vn, vt, vf, Value.read(r)))
        properties = []
        for _ in range(r.u16()):
            pn, pt, pd, pu, pf = r.u16(), r.u16(), r.u16(), r.u32(), r.u8()
            auto_var = r.u16() if pf & 4 else None
            rh = Function.read(r) if pf & 5 == 1 else None
            wh = Function.read(r) if pf & 6 == 2 else None
            properties.append(Property(pn, pt, pd, pu, pf, auto_var, rh, wh))
        states = []
        for _ in range(r.u16()):
            sn = r.u16()
            states.append(State(sn, [(r.u16(), Function.read(r)) for _ in range(r.u16())]))
        if r.pos - start != size - 4:
            raise PexError(f"object {name}: read {r.pos - start + 4} bytes, its size says {size}")
        p.objects.append(Object(name, parent, doc, uflags, auto_state, variables, properties, states))
    if r.pos != len(data):
        raise PexError(f"{len(data) - r.pos} trailing bytes")
    return p


def write(p: Pex) -> bytes:
    w = Writer()
    w.u32(MAGIC)
    w.u8(p.major)
    w.u8(p.minor)
    w.u16(p.game)
    w.u64(p.compiled)
    w.wstr(p.source)
    w.wstr(p.user)
    w.wstr(p.machine)
    w.u16(len(p.strings))
    for s in p.strings:
        w.wstr(s)
    if p.debug_time is None:
        w.u8(0)
    else:
        w.u8(1)
        w.u64(p.debug_time)
        w.u16(len(p.debug))
        for d in p.debug:
            w.u16(d.object)
            w.u16(d.state)
            w.u16(d.function)
            w.u8(d.kind)
            w.u16(len(d.lines))
            for line in d.lines:
                w.u16(line)
    w.u16(len(p.user_flags))
    for n, b in p.user_flags:
        w.u16(n)
        w.u8(b)
    w.u16(len(p.objects))
    for o in p.objects:
        body = Writer()
        body.u16(o.parent)
        body.u16(o.docstring)
        body.u32(o.user_flags)
        body.u16(o.auto_state)
        body.u16(len(o.variables))
        for v in o.variables:
            body.u16(v.name)
            body.u16(v.type)
            body.u32(v.user_flags)
            v.value.write(body)
        body.u16(len(o.properties))
        for pr in o.properties:
            body.u16(pr.name)
            body.u16(pr.type)
            body.u16(pr.docstring)
            body.u32(pr.user_flags)
            body.u8(pr.flags)
            if pr.auto_var is not None:
                body.u16(pr.auto_var)
            if pr.read_handler is not None:
                pr.read_handler.write(body)
            if pr.write_handler is not None:
                pr.write_handler.write(body)
        body.u16(len(o.states))
        for st in o.states:
            body.u16(st.name)
            body.u16(len(st.functions))
            for fn_name, fn in st.functions:
                body.u16(fn_name)
                fn.write(body)
        b = body.bytes()
        w.u16(o.name)
        w.u32(len(b) + 4)
        w.raw(b)
    return w.bytes()


def add_native(p: Pex, object_name: str, function: str, return_type: str, params: list[tuple[str, str]]) -> None:
    """Declare `function` as a global native in the object's default state,
    as `ReturnType Function F(Type name, ...) global native` compiles."""
    objects = [o for o in p.objects if p.string(o.name).lower() == object_name.lower()]
    if not objects:
        raise PexError(f"no object {object_name}")
    state = next((s for s in objects[0].states if p.string(s.name) == ""), None)
    if state is None:
        raise PexError(f"{object_name} has no default state")
    if any(p.string(n).lower() == function.lower() for n, _ in state.functions):
        raise PexError(f"{object_name}.{function} is already declared")
    fn = Function(
        return_type=p.index(return_type),
        docstring=p.index(""),
        user_flags=0,
        flags=FLAG_GLOBAL | FLAG_NATIVE,
        params=[(p.index(n), p.index(t)) for n, t in params],
        locals=[],
        instructions=[],
    )
    name = p.index(function)
    state.functions.append((name, fn))
    # the compiler lists every function in the debug info, natives too, with
    # type 0 and no line numbers; so does this
    if p.debug_time is not None:
        p.debug.append(DebugFunction(objects[0].name, state.name, name, 0, []))


def describe(p: Pex) -> str:
    out = [f"{p.source.decode('latin-1')} v{p.major}.{p.minor}, {len(p.strings)} strings, {len(p.debug)} debug functions"]
    for o in p.objects:
        out.append(f"object {p.string(o.name)} extends {p.string(o.parent) or '(none)'}")
        for st in o.states:
            for n, f in st.functions:
                kind = " ".join(k for k, bit in (("global", FLAG_GLOBAL), ("native", FLAG_NATIVE)) if f.flags & bit)
                params = ", ".join(f"{p.string(t)} {p.string(pn)}" for pn, t in f.params)
                out.append(f"  [{p.string(st.name)}] {p.string(f.return_type)} {p.string(n)}({params}) {kind} ({len(f.instructions)} instructions)")
    return "\n".join(out)


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] == "dump":
        print(describe(parse(open(argv[2], "rb").read())))
        return 0
    if len(argv) >= 6 and argv[1] == "add-native":
        path, obj, fn, ret = argv[2:6]
        params = []
        for spec in argv[6:]:
            name, _, typ = spec.partition(":")
            if not name or not typ:
                raise SystemExit(f"parameter {spec!r} is not name:Type")
            params.append((name, typ))
        data = open(path, "rb").read()
        p = parse(data)
        if write(p) != data:
            raise SystemExit(f"{path} does not round-trip; refusing to rewrite it")
        add_native(p, obj, fn, ret, params)
        out = write(p)
        parse(out)
        open(path, "wb").write(out)
        print(describe(p))
        return 0
    print(__doc__.split("\n    pex.py", 1)[0].rstrip())
    print("\n    pex.py dump <file.pex>\n    pex.py add-native <file.pex> <object> <function> <returnType> [name:Type ...]")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
