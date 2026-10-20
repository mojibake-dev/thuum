#!/usr/bin/env python3
"""plugin-patch.py <plugin-patches.tsv> <tree> <load-order.tsv>

Byte-level patches persist-mods applies to plugins it has laid (docs/MODS.md, the essentials layer),
each a row of lab/layer/plugin-patches.tsv: plugin, patch, why. The plugin's folder comes from
lab/layer/load-order.tsv. Every patch is idempotent, keeps the file's size, and prints what it did.

  esl               set the TES4 header's light flag (0x200). Allowed only when the plugin defines no
                    record of its own above 0xFFF (an override-only patch qualifies): a light plugin's
                    own records must fit the FE index space. Nothing else in the file changes.
  hdpt-gender-both  set both gender bits (0x02 male, 0x04 female) in the DATA flag byte of every HDPT
                    record, every other bit kept. RaceMenu applies a head part only when its gender
                    flag matches the actor, so a part with neither bit never seats from a preset
                    (docs/verbs/racemenu-sync.md). The records must be uncompressed (they are, in
                    Playable Headparts All Races); a compressed one is an error, not a silent skip.
"""
import csv
import struct
import sys
from pathlib import Path

LIGHT = 0x200
COMPRESSED = 0x40000


def rows(tsv):
    with open(tsv, newline='') as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith('#')), delimiter='\t')]


def walk(buf):
    """(absolute offset of the record header, type, flags, formid, size) for every record, groups recursed."""
    def rec(start, end):
        o = start
        while o + 24 <= end:
            typ = buf[o:o + 4]
            if typ == b'GRUP':
                size = struct.unpack_from('<I', buf, o + 4)[0]
                yield from rec(o + 24, o + size)
                o += size
                continue
            size, flags, fid = struct.unpack_from('<III', buf, o + 4)
            yield o, typ, flags, fid, size
            o += 24 + size
    yield from rec(0, len(buf))


def masters_of(buf):
    o, typ, flags, fid, size = next(walk(buf))
    assert typ == b'TES4', 'no TES4 header'
    data = buf[o + 24:o + 24 + size]
    out, p = [], 0
    while p + 6 <= len(data):
        sig = data[p:p + 4]
        n = struct.unpack_from('<H', data, p + 4)[0]
        if sig == b'MAST':
            out.append(data[p + 6:p + 6 + n].rstrip(b'\0').decode('cp1252'))
        p += 6 + n
    return out, flags


def patch_esl(buf):
    masters, flags = masters_of(buf)
    own = len(masters)
    high = [fid for _, typ, _, fid, _ in walk(buf) if typ != b'TES4' and (fid >> 24) >= own and (fid & 0xFFFFFF) > 0xFFF]
    if high:
        raise SystemExit(f'esl: {len(high)} records of the plugin\'s own above 0xFFF (first {high[0]:08X}); not a light plugin')
    if flags & LIGHT:
        return buf, 'already light'
    buf = bytearray(buf)
    struct.pack_into('<I', buf, 8, flags | LIGHT)
    return bytes(buf), f'TES4 flags {flags:#x} -> {flags | LIGHT:#x}'


def patch_hdpt_gender_both(buf):
    buf = bytearray(buf)
    before, after, n = {}, {}, 0
    for o, typ, flags, fid, size in walk(buf):
        if typ != b'HDPT':
            continue
        if flags & COMPRESSED:
            raise SystemExit(f'hdpt-gender-both: HDPT {fid:08X} is compressed; this patch edits in place only')
        p, end = o + 24, o + 24 + size
        while p + 6 <= end:
            sig = buf[p:p + 4]
            sz = struct.unpack_from('<H', buf, p + 4)[0]
            if sig == b'DATA' and sz >= 1:
                v = buf[p + 6]
                before[f'{v:02x}'] = before.get(f'{v:02x}', 0) + 1
                buf[p + 6] = v | 0x06
                after[f'{v | 0x06:02x}'] = after.get(f'{v | 0x06:02x}', 0) + 1
                n += 1
            p += 6 + sz
    fmt = lambda t: ' '.join(f'{k}x{t[k]}' for k in sorted(t))
    return bytes(buf), f'{n} HDPT DATA bytes, {fmt(before)} -> {fmt(after)}'


PATCHES = {'esl': patch_esl, 'hdpt-gender-both': patch_hdpt_gender_both}


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    tsv, tree, order_tsv = sys.argv[1:]
    folder_of = {r['plugin'].lower(): r['mod'] for r in rows(order_tsv)}
    for r in rows(tsv):
        plugin, kind = r['plugin'], r['patch']
        if kind not in PATCHES:
            raise SystemExit(f'{plugin}: unknown patch {kind!r}')
        folder = folder_of.get(plugin.lower())
        if not folder:
            raise SystemExit(f'{plugin}: not in {order_tsv}')
        path = Path(tree) / folder / plugin
        if not path.is_file():
            raise SystemExit(f'{plugin}: not at {path}')
        old = path.read_bytes()
        new, what = PATCHES[kind](old)
        if new != old:
            assert len(new) == len(old)
            path.write_bytes(new)
        print(f'patched: {plugin}: {kind} ({what})')


if __name__ == '__main__':
    main()
