#!/usr/bin/env python3
"""plugin-patch.py <plugin-patches.tsv> <tree> <load-order.tsv> <game plugin dir>
plugin-patch.py --needs <plugin-patches.tsv> <tree> <load-order.tsv>   (the game plugins the rows read)

Byte-level patches persist-mods applies to plugins it has laid (docs/MODS.md, the essentials layer),
each a row of lab/layer/plugin-patches.tsv: plugin, patch, why. The plugin's folder comes from
lab/layer/load-order.tsv. Every patch is idempotent, keeps the file's size, and prints what it did.

  esl               set the TES4 header's light flag (0x200). Allowed only when the plugin defines no
                    record of its own above 0xFFF (an override-only patch qualifies): a light plugin's
                    own records must fit the FE index space. Nothing else in the file changes.
  hdpt-gender-from-master
                    give every HDPT override the gender bits (0x02 male, 0x04 female) of the record it
                    overrides in its master (Skyrim.esm, Dawnguard.esm, ... read from <game plugin dir>),
                    every other bit kept. RaceMenu applies a head part only when its gender flag
                    matches the actor, and the vanilla menu's rebuild reads a part with the female bit
                    as female, so an all-races mod that clears the bits (Playable Headparts) loses the
                    parts on a preset load, and one that sets both swaps a male's hair at menu open;
                    the master's own bits are right for both (docs/verbs/racemenu-sync.md). The records
                    must be uncompressed; a compressed one or a missing master record is an error.
  drop-record <formid>
                    remove the record with that form id (hex, as the plugin numbers it) from the
                    plugin: the groups around it shrink, a group left empty goes too, and the
                    header's record count follows. The file gets shorter, the one patch that changes
                    the size. For the layer's rule that no served plugin overrides the player's base
                    record NPC_ 0x00000007 (SkyMP's server owns it for every player).
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


def patch_esl(buf, ctx):
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


def hdpt_flags_of(master_path):
    """local form id -> DATA flag byte for every HDPT record of a plugin (its HDPT top group only)."""
    buf = Path(master_path).read_bytes()
    out, o = {}, 0
    while o + 24 <= len(buf):
        typ = buf[o:o + 4]
        if typ == b'TES4':
            o += 24 + struct.unpack_from('<I', buf, o + 4)[0]
            continue
        size = struct.unpack_from('<I', buf, o + 4)[0]
        if typ == b'GRUP' and buf[o + 8:o + 12] == b'HDPT':
            for ro, rtyp, rflags, fid, rsize in walk(buf[o:o + size]):
                if rtyp != b'HDPT':
                    continue
                data = buf[o + ro + 24:o + ro + 24 + rsize]
                if rflags & COMPRESSED:
                    import zlib
                    data = zlib.decompress(data[4:])
                p = 0
                while p + 6 <= len(data):
                    sig = data[p:p + 4]
                    n = struct.unpack_from('<H', data, p + 4)[0]
                    if sig == b'DATA' and n >= 1:
                        out[fid & 0xFFFFFF] = data[p + 6]
                        break
                    p += 6 + n
        o += size
    return out


def hdpt_masters_needed(buf):
    """the master files whose HDPT records a plugin overrides, by name as the plugin spells them."""
    masters, _ = masters_of(buf)
    need = set()
    for _, typ, _, fid, _ in walk(buf):
        if typ == b'HDPT' and (fid >> 24) < len(masters):
            need.add(masters[fid >> 24])
    return sorted(need)


def patch_hdpt_gender_from_master(buf, ctx):
    masters, _ = masters_of(buf)
    tables = {}
    for name in hdpt_masters_needed(buf):
        path = next((p for p in Path(ctx['game_dir']).iterdir() if p.name.lower() == name.lower()), None)
        if path is None:
            raise SystemExit(f'hdpt-gender-from-master: {name} is not in {ctx["game_dir"]} (persist-mods pulls it off the host\'s persist esm directory)')
        tables[name] = hdpt_flags_of(path)
    buf = bytearray(buf)
    before, after, n, per = {}, {}, 0, {}
    for o, typ, flags, fid, size in walk(buf):
        if typ != b'HDPT' or (fid >> 24) >= len(masters):
            continue
        if flags & COMPRESSED:
            raise SystemExit(f'hdpt-gender-from-master: HDPT {fid:08X} is compressed; this patch edits in place only')
        master = masters[fid >> 24]
        mflags = tables[master].get(fid & 0xFFFFFF)
        if mflags is None:
            raise SystemExit(f'hdpt-gender-from-master: HDPT {fid:08X} has no record in {master}')
        p, end = o + 24, o + 24 + size
        while p + 6 <= end:
            sig = buf[p:p + 4]
            sz = struct.unpack_from('<H', buf, p + 4)[0]
            if sig == b'DATA' and sz >= 1:
                v = buf[p + 6]
                nv = (v & ~0x06 & 0xFF) | (mflags & 0x06)
                before[f'{v:02x}'] = before.get(f'{v:02x}', 0) + 1
                after[f'{nv:02x}'] = after.get(f'{nv:02x}', 0) + 1
                per[master] = per.get(master, 0) + 1
                buf[p + 6] = nv
                n += 1
                break
            p += 6 + sz
    fmt = lambda t: ' '.join(f'{k}x{t[k]}' for k in sorted(t))
    src = ', '.join(f'{c} from {m}' for m, c in sorted(per.items()))
    return bytes(buf), f'{n} HDPT DATA bytes ({src}), {fmt(before)} -> {fmt(after)}'


def patch_drop_record(buf, ctx, fid_hex):
    fid = int(fid_hex, 16)
    dropped = {'records': 0, 'groups': 0}

    def build(start, end):
        chunks, o = [], start
        while o + 24 <= end:
            typ = buf[o:o + 4]
            if typ == b'GRUP':
                size = struct.unpack_from('<I', buf, o + 4)[0]
                inner = build(o + 24, o + size)
                if inner:
                    hdr = bytearray(buf[o:o + 24])
                    struct.pack_into('<I', hdr, 4, 24 + len(inner))
                    chunks.append(bytes(hdr) + inner)
                else:
                    dropped['groups'] += 1
                o += size
                continue
            size, flags, rfid = struct.unpack_from('<III', buf, o + 4)
            if typ != b'TES4' and rfid == fid:
                dropped['records'] += 1
            else:
                chunks.append(buf[o:o + 24 + size])
            o += 24 + size
        return b''.join(chunks)

    new = bytearray(build(0, len(buf)))
    if not dropped['records']:
        return buf, f'{fid:08X} already absent'
    # the TES4 header's record count (HEDR: version f32, count u32) follows the removals
    size = struct.unpack_from('<I', new, 4)[0]
    p, end = 24, 24 + size
    while p + 6 <= end:
        sig = new[p:p + 4]
        n = struct.unpack_from('<H', new, p + 4)[0]
        if sig == b'HEDR':
            count = struct.unpack_from('<I', new, p + 6 + 4)[0]
            struct.pack_into('<I', new, p + 6 + 4, max(0, count - dropped['records'] - dropped['groups']))
            break
        p += 6 + n
    return bytes(new), f"dropped {dropped['records']} record(s) {fid:08X}" + (f" and {dropped['groups']} emptied group(s)" if dropped['groups'] else '') + f', {len(buf)} -> {len(new)} B'


PATCHES = {'esl': patch_esl, 'hdpt-gender-from-master': patch_hdpt_gender_from_master, 'drop-record': patch_drop_record}
NEEDS_MASTERS = {'hdpt-gender-from-master'}
RESIZES = {'drop-record'}


def locate(tsv, tree, order_tsv):
    folder_of = {r['plugin'].lower(): r['mod'] for r in rows(order_tsv)}
    for r in rows(tsv):
        plugin = r['plugin']
        kind, *args = r['patch'].split()
        if kind not in PATCHES:
            raise SystemExit(f'{plugin}: unknown patch {kind!r}')
        folder = folder_of.get(plugin.lower())
        if not folder:
            raise SystemExit(f'{plugin}: not in {order_tsv}')
        path = Path(tree) / folder / plugin
        if not path.is_file():
            raise SystemExit(f'{plugin}: not at {path}')
        yield r, kind, args, path


def main():
    if len(sys.argv) == 5 and sys.argv[1] == '--needs':
        need = set()
        for r, kind, args, path in locate(*sys.argv[2:]):
            if kind in NEEDS_MASTERS:
                need.update(hdpt_masters_needed(path.read_bytes()))
        print('\n'.join(sorted(need)))
        return
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    tsv, tree, order_tsv, game_dir = sys.argv[1:]
    ctx = {'game_dir': game_dir}
    for r, kind, args, path in locate(tsv, tree, order_tsv):
        plugin = r['plugin']
        old = path.read_bytes()
        new, what = PATCHES[kind](old, ctx, *args)
        if new != old:
            assert kind in RESIZES or len(new) == len(old)
            path.write_bytes(new)
        print(f'patched: {plugin}: {r["patch"]} ({what})')


if __name__ == '__main__':
    main()
