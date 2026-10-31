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
  flst-set <formid> <id,id,...>
                    replace a form list's entries (its LNAM subrecords) with the given form ids in that
                    order (hex, as the plugin numbers them); every other subrecord of the record stays.
                    The record and the groups around it resize, the header's count does not move. For
                    rotfern's vampire pairing: RaceCompatibility's PlayerVampireQuestScript pairs
                    PlayableRaceList[i] with PlayableVampireList[i], so both lists must put a race and
                    its vampire at one index (docs/research/vampirism-under-the-server.md).
  perk-drop-ability <formid>
                    remove a PERK's ability entry (the PRKE with type 1, its DATA and its PRKF); every other
                    subrecord stays, so the perk keeps its node, name, description and conditions and does
                    nothing. The record and its groups resize. For the multiplayer defaults (docs/MODS.md):
                    Steady Hand's slow time, where time is the server's.
  spell-magnitude <formid> <value>
                    set every EFIT magnitude of a SPEL to <value>; areas, durations and effects stay, the
                    size too. A plugin without the record gets it first, copied from the master that owns
                    it (read from <game plugin dir>, decompressed) into its SPEL group, the header's count
                    following: the one way to patch a record no plugin of the layer overrides. A localized
                    master's text fields (FULL, DESC: string ids into its own strings files) cannot travel
                    into a plugin that is not localized, so they are dropped from the copy. The Slow Time
                    shout's three spells and Block's Quick Reflexes at 1.0, time at its pace.

A patch that targets a record (drop-record, flst-set, perk-drop-ability, spell-magnitude) must hit the
copy that wins: after patching, every plugin later in the load order is scanned for an override of the
same record (by master name and local id), and one found stops the build and names the plugin to
patch instead.
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


def patch_flst_set(buf, ctx, fid_hex, items_hex):
    fid = int(fid_hex, 16)
    items = [int(x, 16) for x in items_hex.split(',') if x]
    if not items:
        raise SystemExit('flst-set: no entries given')
    hit = next(((o, flags, size) for o, typ, flags, rfid, size in walk(buf) if typ == b'FLST' and rfid == fid), None)
    if hit is None:
        raise SystemExit(f'flst-set: no FLST {fid:08X} in the plugin')
    o, flags, size = hit
    if flags & COMPRESSED:
        raise SystemExit(f'flst-set: FLST {fid:08X} is compressed; this patch rewrites uncompressed records only')
    body = buf[o + 24:o + 24 + size]
    keep, current, p = [], [], 0
    while p + 6 <= len(body):
        sig = body[p:p + 4]
        n = struct.unpack_from('<H', body, p + 4)[0]
        if sig == b'LNAM' and n == 4:
            current.append(struct.unpack_from('<I', body, p + 6)[0])
        else:
            keep.append(body[p:p + 6 + n])
        p += 6 + n
    if current == items:
        return buf, f'FLST {fid:08X} already holds these {len(items)} entries'
    new_body = b''.join(keep) + b''.join(b'LNAM' + struct.pack('<HI', 4, x) for x in items)
    hdr = bytearray(buf[o:o + 24])
    struct.pack_into('<I', hdr, 4, len(new_body))
    new_rec = bytes(hdr) + new_body

    def build(start, end):
        chunks, q = [], start
        while q + 24 <= end:
            typ = buf[q:q + 4]
            if typ == b'GRUP':
                gsize = struct.unpack_from('<I', buf, q + 4)[0]
                inner = build(q + 24, q + gsize)
                ghdr = bytearray(buf[q:q + 24])
                struct.pack_into('<I', ghdr, 4, 24 + len(inner))
                chunks.append(bytes(ghdr) + inner)
                q += gsize
                continue
            rsize = struct.unpack_from('<I', buf, q + 4)[0]
            chunks.append(new_rec if q == o else buf[q:q + 24 + rsize])
            q += 24 + rsize
        return b''.join(chunks)

    new = build(0, len(buf))
    return new, f'FLST {fid:08X}: {len(current)} -> {len(items)} entries, {len(buf)} -> {len(new)} B'


def record_at(buf, fid, typ=None):
    hit = next(((o, flags, size) for o, t, flags, rfid, size in walk(buf) if rfid == fid and t != b'TES4' and (typ is None or t == typ)), None)
    return hit


def subrecords(body):
    out, p = [], 0
    while p + 6 <= len(body):
        sig = body[p:p + 4]
        n = struct.unpack_from('<H', body, p + 4)[0]
        out.append((sig, body[p + 6:p + 6 + n]))
        p += 6 + n
    return out


def join_subrecords(subs):
    return b''.join(sig + struct.pack('<H', len(data)) + data for sig, data in subs)


def replace_record(buf, o, new_rec):
    """the file with the record at offset o replaced by new_rec, every enclosing group's size following."""
    def build(start, end):
        chunks, q = [], start
        while q + 24 <= end:
            typ = buf[q:q + 4]
            if typ == b'GRUP':
                gsize = struct.unpack_from('<I', buf, q + 4)[0]
                inner = build(q + 24, q + gsize)
                ghdr = bytearray(buf[q:q + 24])
                struct.pack_into('<I', ghdr, 4, 24 + len(inner))
                chunks.append(bytes(ghdr) + inner)
                q += gsize
                continue
            rsize = struct.unpack_from('<I', buf, q + 4)[0]
            chunks.append(new_rec if q == o else buf[q:q + 24 + rsize])
            q += 24 + rsize
        return b''.join(chunks)
    return build(0, len(buf))


def rebuilt(buf, o, body, flags):
    hdr = bytearray(buf[o:o + 24])
    struct.pack_into('<II', hdr, 4, len(body), flags)
    return replace_record(buf, o, bytes(hdr) + body)


def patch_perk_drop_ability(buf, ctx, fid_hex):
    fid = int(fid_hex, 16)
    hit = record_at(buf, fid, b'PERK')
    if hit is None:
        raise SystemExit(f'perk-drop-ability: no PERK {fid:08X} in the plugin')
    o, flags, size = hit
    if flags & COMPRESSED:
        raise SystemExit(f'perk-drop-ability: PERK {fid:08X} is compressed; this patch rewrites uncompressed records only')
    subs = subrecords(buf[o + 24:o + 24 + size])
    out, i, dropped = [], 0, 0
    while i < len(subs):
        sig, data = subs[i]
        if sig == b'PRKE' and data[:1] == b'\x01':
            j = i + 1
            while j < len(subs) and subs[j][0] != b'PRKF':
                j += 1
            i, dropped = j + 1, dropped + 1
            continue
        out.append((sig, data))
        i += 1
    if not dropped:
        return buf, f'PERK {fid:08X} already has no ability entry'
    new = rebuilt(buf, o, join_subrecords(out), flags)
    return new, f'PERK {fid:08X}: {dropped} ability entr{"y" if dropped == 1 else "ies"} removed, {len(buf)} -> {len(new)} B'


LOCALIZED = 0x80
LSTRINGS = {b'FULL', b'DESC', b'NNAM', b'CNAM', b'ONAM', b'RNAM', b'SHRT', b'TNAM'}  # the lstring-typed subrecords of SPEL, PERK, MGEF and kin


def master_record(game_dir, master, local_fid, typ):
    """(header, decompressed body, the master's TES4 flags) of a master's record by local form id, or None."""
    path = next((p for p in Path(game_dir).iterdir() if p.name.lower() == master.lower()), None)
    if path is None:
        raise SystemExit(f'{master} is not in {game_dir} (persist-mods pulls it off the host\'s persist esm directory)')
    buf = path.read_bytes()
    mflags = struct.unpack_from('<I', buf, 8)[0]
    for o, t, flags, rfid, size in walk(buf):
        if t == typ and (rfid & 0xFFFFFF) == local_fid and t != b'TES4':
            body = buf[o + 24:o + 24 + size]
            if flags & COMPRESSED:
                import zlib
                body = zlib.decompress(body[4:])
            return buf[o:o + 24], body, mflags
    return None


def portable_body(body, source_flags, target_flags):
    """the record body fit for the target plugin: a localized plugin's text fields are string ids into its own
    strings files, so when the source and the target differ in the localized flag the text subrecords (FULL,
    DESC, ...) cannot travel and are dropped; the record keeps every other field."""
    if bool(source_flags & LOCALIZED) == bool(target_flags & LOCALIZED):
        return body, []
    kept, dropped = [], []
    for sig, data in subrecords(body):
        (dropped if sig in LSTRINGS else kept).append((sig, data))
    return join_subrecords(kept), [s.decode() for s, _ in dropped]


def inject_record(buf, typ, fid, hdr, body, flags_mask=~COMPRESSED):
    """the file with a record appended to its top group of that type (made after the last group if absent),
    the header's record count up by one (and by two for a new group)."""
    flags = struct.unpack_from('<I', hdr, 8)[0] & flags_mask
    rec = typ + struct.pack('<III', len(body), flags, fid) + hdr[16:24] + body
    size0 = struct.unpack_from('<I', buf, 4)[0]
    o, groups = 24 + size0, []
    while o + 24 <= len(buf):
        gsize = struct.unpack_from('<I', buf, o + 4)[0]
        groups.append((o, gsize, buf[o + 8:o + 12], struct.unpack_from('<I', buf, o + 12)[0]))
        o += gsize
    new = bytearray(buf)
    added = 1
    hit = next(((go, gs) for go, gs, label, gtype in groups if label == typ and gtype == 0), None)
    if hit:
        go, gs = hit
        new[go + gs:go + gs] = rec
        struct.pack_into('<I', new, go + 4, gs + len(rec))
    else:
        new += b'GRUP' + struct.pack('<I', 24 + len(rec)) + typ + struct.pack('<IHHHH', 0, 0, 0, 44, 0) + rec
        added = 2
    p, end = 24, 24 + size0
    while p + 6 <= end:
        sig = new[p:p + 4]
        n = struct.unpack_from('<H', new, p + 4)[0]
        if sig == b'HEDR':
            count = struct.unpack_from('<I', new, p + 6 + 4)[0]
            struct.pack_into('<I', new, p + 6 + 4, count + added)
            break
        p += 6 + n
    return bytes(new)


def patch_spell_magnitude(buf, ctx, fid_hex, value):
    fid, value = int(fid_hex, 16), float(value)
    hit = record_at(buf, fid, b'SPEL')
    injected = ''
    if hit is None:
        masters, _ = masters_of(buf)
        if (fid >> 24) >= len(masters):
            raise SystemExit(f'spell-magnitude: no SPEL {fid:08X} in the plugin and it is the plugin\'s own index, nothing to copy')
        master = masters[fid >> 24]
        src = master_record(ctx['game_dir'], master, fid & 0xFFFFFF, b'SPEL')
        if src is None:
            raise SystemExit(f'spell-magnitude: no SPEL {fid:08X} in the plugin nor in {master}')
        hdr, body, mflags = src
        body, dropped = portable_body(body, mflags, struct.unpack_from('<I', buf, 8)[0])
        buf = inject_record(buf, b'SPEL', fid, hdr, body)
        injected = f', the record injected from {master}' + (f' without its text fields {", ".join(dropped)} (string ids of a localized master)' if dropped else '')
        hit = record_at(buf, fid, b'SPEL')
    o, flags, size = hit
    if flags & COMPRESSED:
        raise SystemExit(f'spell-magnitude: SPEL {fid:08X} is compressed; this patch rewrites uncompressed records only')
    buf = bytearray(buf)
    p, end, before = o + 24, o + 24 + size, []
    while p + 6 <= end:
        sig = buf[p:p + 4]
        sz = struct.unpack_from('<H', buf, p + 4)[0]
        if sig == b'EFIT' and sz >= 4:
            before.append(struct.unpack_from('<f', buf, p + 6)[0])
            struct.pack_into('<f', buf, p + 6, value)
        p += 6 + sz
    if not before:
        raise SystemExit(f'spell-magnitude: SPEL {fid:08X} has no EFIT')
    if all(b == value for b in before) and not injected:
        return bytes(buf), f'SPEL {fid:08X} already at {value:g}'
    return bytes(buf), f'SPEL {fid:08X}: {len(before)} magnitude(s) {", ".join(f"{b:g}" for b in before)} -> {value:g}{injected}'


PATCHES = {'esl': patch_esl, 'hdpt-gender-from-master': patch_hdpt_gender_from_master, 'drop-record': patch_drop_record,
           'flst-set': patch_flst_set, 'perk-drop-ability': patch_perk_drop_ability, 'spell-magnitude': patch_spell_magnitude}
NEEDS_MASTERS = {'hdpt-gender-from-master', 'spell-magnitude'}
RESIZES = {'drop-record', 'flst-set', 'perk-drop-ability', 'spell-magnitude'}
RECORD_KINDS = {'drop-record', 'flst-set', 'perk-drop-ability', 'spell-magnitude'}


def record_key(masters, plugin, fid):
    """(owner file, local id) of a form id as a plugin numbers it: its master by index, or the plugin itself."""
    idx = fid >> 24
    owner = masters[idx] if idx < len(masters) else plugin
    return owner.lower(), fid & 0xFFFFFF


def later_overrides(tree, order_tsv, plugin, fid):
    """the plugins after `plugin` in the load order that carry a record for the same form."""
    order = rows(order_tsv)
    names = [r['plugin'] for r in order]
    pos = next((i for i, n in enumerate(names) if n.lower() == plugin.lower()), None)
    if pos is None:
        return []
    here = Path(tree) / next(r['mod'] for r in order if r['plugin'].lower() == plugin.lower()) / plugin
    key = record_key(masters_of(here.read_bytes())[0], plugin, fid)
    found = []
    for r in order[pos + 1:]:
        path = Path(tree) / r['mod'] / r['plugin']
        if not path.is_file():
            continue
        buf = path.read_bytes()
        masters = masters_of(buf)[0]
        if key[0] != r['plugin'].lower() and key[0] not in [m.lower() for m in masters]:
            continue
        for _, typ, _, rfid, _ in walk(buf):
            if typ != b'TES4' and record_key(masters, r['plugin'], rfid) == key:
                found.append(r['plugin'])
                break
    return found


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
            if kind == 'hdpt-gender-from-master':
                need.update(hdpt_masters_needed(path.read_bytes()))
            elif kind == 'spell-magnitude':
                buf = path.read_bytes()
                fid = int(args[0], 16)
                masters, _ = masters_of(buf)
                if record_at(buf, fid, b'SPEL') is None and (fid >> 24) < len(masters):
                    need.add(masters[fid >> 24])
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
        if kind in RECORD_KINDS:
            later = later_overrides(tree, order_tsv, plugin, int(args[0], 16))
            if later:
                raise SystemExit(f'{plugin}: {r["patch"]} does not win: {", ".join(later)} override(s) {args[0]} later in the load order; patch the last of them instead')


if __name__ == '__main__':
    main()
