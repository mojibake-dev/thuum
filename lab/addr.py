#!/usr/bin/env python3
"""addr.py: resolve Address Library ids for the pinned Skyrim SE runtime.

Reads the Address Library for SKSE Plugins database (versionlib-<v>.bin,
format 2, the AE/1.6.x layout) exactly as CommonLibSSE-NG's REL::IDDatabase
does (CommonLibSSE-NG/include/REL/Relocation.h, header_t::read and
unpack_file), so that an id resolved here matches what a plugin built on
CommonLib resolves at runtime. Nothing here comes from memory: the format is
transcribed from that loader and checked against the versionlib-1-6-353-0.bin
fixture in CommonLibSSE-NG/tests/REL (see lab/tests/test_addr.py).

Rule 1 of CLAUDE.md: an id is looked up, never typed from memory. This tool
is the lookup. Lookups are strict: a missing id is an error, unlike
CommonLib's lower_bound on SE/AE, which silently returns the next id's
offset (Relocation.h, id2offset); pass --commonlib-quirk to reproduce that.

Usage:
  addr.py <addrlib-dir> <runtime-version> <id> [--base HEX] [--commonlib-quirk]
  runtime-version is 1.6.1170 or 1.6.1170.0; the file searched for is
  versionlib-1-6-1170-0.bin under <addrlib-dir>, <addrlib-dir>/SKSE/Plugins,
  or <addrlib-dir>/Data/SKSE/Plugins.
"""

from __future__ import annotations

import argparse
import bisect
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

U64 = (1 << 64) - 1


class AddrLibError(Exception):
    """Malformed database, version mismatch, or missing id."""


@dataclass(frozen=True)
class Header:
    format: int
    version: tuple[int, int, int, int]
    module_name: str
    pointer_size: int
    count: int


@dataclass
class Database:
    header: Header
    ids: list[int]      # sorted
    offsets: list[int]  # parallel to ids

    def offset(self, id_: int, commonlib_quirk: bool = False) -> int:
        """Offset (RVA) for an id. Strict unless commonlib_quirk."""
        i = bisect.bisect_left(self.ids, id_)
        if i >= len(self.ids):
            raise AddrLibError(f"id {id_} is past the end of the table")
        if self.ids[i] != id_ and not commonlib_quirk:
            raise AddrLibError(f"id {id_} is not in the table (nearest higher id is {self.ids[i]})")
        return self.offsets[i]

    def address(self, id_: int, base: int, commonlib_quirk: bool = False) -> int:
        return base + self.offset(id_, commonlib_quirk)

    def __len__(self) -> int:
        return len(self.ids)


def _read_exact(f: BinaryIO, n: int) -> bytes:
    b = f.read(n)
    if len(b) != n:
        raise AddrLibError(f"unexpected end of file (wanted {n} bytes, got {len(b)})")
    return b


def _i32(f: BinaryIO) -> int:
    return struct.unpack("<i", _read_exact(f, 4))[0]


def read_header(f: BinaryIO) -> Header:
    fmt = _i32(f)
    if fmt not in (1, 2):
        raise AddrLibError(f"unknown format {fmt}")
    version = tuple(_i32(f) & 0xFFFF for _ in range(4))
    n = _i32(f)
    if n < 0 or n > 4096:
        raise AddrLibError(f"implausible module name length {n}")
    name = _read_exact(f, n).decode("ascii", errors="replace")
    pointer_size = _i32(f)
    count = _i32(f)
    if pointer_size <= 0 or count < 0:
        raise AddrLibError(f"implausible pointer size {pointer_size} or count {count}")
    return Header(fmt, version, name, pointer_size, count)


def _payload(f: BinaryIO, code: int, prev: int) -> int:
    """One packed value per the shared 8-code scheme (Relocation.h unpack_file)."""
    if code == 0:
        return struct.unpack("<Q", _read_exact(f, 8))[0]
    if code == 1:
        return (prev + 1) & U64
    if code == 2:
        return (prev + _read_exact(f, 1)[0]) & U64
    if code == 3:
        return (prev - _read_exact(f, 1)[0]) & U64
    if code == 4:
        return (prev + struct.unpack("<H", _read_exact(f, 2))[0]) & U64
    if code == 5:
        return (prev - struct.unpack("<H", _read_exact(f, 2))[0]) & U64
    if code == 6:
        return struct.unpack("<H", _read_exact(f, 2))[0]
    if code == 7:
        return struct.unpack("<I", _read_exact(f, 4))[0]
    raise AddrLibError(f"unhandled type code {code}")


def read_entries(f: BinaryIO, header: Header) -> tuple[list[int], list[int]]:
    prev_id = 0
    prev_off = 0
    pairs: list[tuple[int, int]] = []
    for _ in range(header.count):
        t = _read_exact(f, 1)[0]
        lo = t & 0xF
        hi = t >> 4
        id_ = _payload(f, lo, prev_id)
        scaled = (hi & 8) != 0
        base = (prev_off // header.pointer_size) if scaled else prev_off
        off = _payload(f, hi & 7, base)
        if scaled:
            off = (off * header.pointer_size) & U64
        pairs.append((id_, off))
        prev_id, prev_off = id_, off
    pairs.sort(key=lambda p: p[0])
    return [p[0] for p in pairs], [p[1] for p in pairs]


def load(path: Path) -> Database:
    with path.open("rb") as f:
        header = read_header(f)
        ids, offsets = read_entries(f, header)
        return Database(header, ids, offsets)


def parse_version(text: str) -> tuple[int, int, int, int]:
    parts = [int(p) for p in text.strip().split(".")]
    if len(parts) == 3:
        parts.append(0)
    if len(parts) != 4:
        raise AddrLibError(f"version must have three or four parts: {text!r}")
    return tuple(parts)  # type: ignore[return-value]


def database_name(version: tuple[int, int, int, int]) -> str:
    """versionlib-<v>.bin (format 2) for 1.6.x, version-<v>.bin (format 1) for 1.5.x,
    as REL::IDDatabase::load chooses (Relocation.h)."""
    prefix = "versionlib-" if version[1] >= 6 else "version-"
    return prefix + "-".join(str(p) for p in version) + ".bin"


def database_path(addrlib_dir: Path, version: tuple[int, int, int, int]) -> Path:
    name = database_name(version)
    for sub in ("", "SKSE/Plugins", "Data/SKSE/Plugins"):
        candidate = addrlib_dir / sub / name if sub else addrlib_dir / name
        if candidate.is_file():
            return candidate
    raise AddrLibError(f"{name} not found under {addrlib_dir} (Nexus download by Eli; see CLAUDE.md layout)")


def load_for_runtime(addrlib_dir: Path, runtime: str) -> Database:
    version = parse_version(runtime)
    db = load(database_path(addrlib_dir, version))
    if db.header.version != version:
        raise AddrLibError(f"database is for {db.header.version}, asked for {version}")
    return db


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("addrlib_dir", type=Path)
    ap.add_argument("runtime")
    ap.add_argument("id", type=int)
    ap.add_argument("--base", type=lambda s: int(s, 16), default=None, help="module base as hex; prints the address too")
    ap.add_argument("--commonlib-quirk", action="store_true", help="return the next id's offset for a missing id, as CommonLib does on SE/AE")
    args = ap.parse_args(argv)
    try:
        db = load_for_runtime(args.addrlib_dir, args.runtime)
        off = db.offset(args.id, args.commonlib_quirk)
    except AddrLibError as e:
        print(f"E_ADDR: {e}", file=sys.stderr)
        return 1
    line = f"id {args.id} offset 0x{off:x} runtime {'.'.join(map(str, db.header.version))} entries {len(db)}"
    if args.base is not None:
        line += f" address 0x{args.base + off:x}"
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
