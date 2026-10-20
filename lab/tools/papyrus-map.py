#!/usr/bin/env python3
"""papyrus-map.py <tree> <admitted.tsv> <load-order.tsv> <game plugin dir> <out>

ADR-044's served list: the Papyrus script class names each admitted plugin brings, one line per
plugin, for skymp5-client's event block to admit at login (the hook sees script class names, not
plugins). Written by persist-mods as the layer file papyrus-admitted/Platform/papyrus-scripts.txt,
regenerated at every build and listed in SHA256SUMS like every layer file, so add-mods.ps1 installs
it hash-checked at Data\\Platform\\papyrus-scripts.txt in every game folder, where Skyrim Platform reads
it at its load (train-29); a client without the layer has no file and admits nothing.

Format, one plugin per line, names sorted, unique, case as the plugin or the .pex spells them:
  <plugin file name>: <class name> <class name> ...
Lines starting with # are comments.

A plugin's names are read from its VMAD subrecords on every record (the scripts attached to the
form; a quest's alias scripts; the fragment classes of quests, perks, dialogue infos, packages and
scenes) and, for a plugin from a layer folder (lab/layer/load-order.tsv names the folder), from the
folder's compiled scripts too: loose scripts/*.pex and the scripts folder entries of its BSAs' name tables
(names only; nothing is extracted or decompiled). A plugin of source `game` (the game's own files,
the Creation Club set: ccQDRSSE001-SurvivalMode.esl) has no layer folder, so only its VMAD names
are read, from the copy persist-mods pulls off the host's persist esm directory into
lab/.cache/game.

lab/layer/papyrus-admitted.tsv: plugin, source (layer | game), why.
"""
import csv
import os
import re
import struct
import sys
import zlib
from pathlib import Path


# ---- plugin records --------------------------------------------------------------------------

def wstr(b, o):
    n = struct.unpack_from('<H', b, o)[0]
    return b[o + 2:o + 2 + n].decode('cp1252', 'replace'), o + 2 + n


def subrecords(data):
    out, o, big = [], 0, None
    while o + 6 <= len(data):
        sig = data[o:o + 4]
        size = struct.unpack_from('<H', data, o + 4)[0]
        o += 6
        if sig == b'XXXX':
            big = struct.unpack_from('<I', data, o)[0]
            o += 4
            continue
        if big is not None:
            size, big = big, None
        out.append((sig, data[o:o + size]))
        o += size
    return out


def records(buf):
    """(type, flags, formid, data) for every record, groups recursed, compressed records inflated."""
    o = 0
    while o + 24 <= len(buf):
        typ = buf[o:o + 4]
        if typ == b'GRUP':
            size = struct.unpack_from('<I', buf, o + 4)[0]
            yield from records(buf[o + 24:o + size])
            o += size
            continue
        size, flags, fid = struct.unpack_from('<III', buf, o + 4)
        data = buf[o + 24:o + 24 + size]
        if flags & 0x40000:
            try:
                data = zlib.decompress(data[4:])
            except zlib.error:
                data = b''
        yield typ.decode('ascii', 'replace'), flags, fid, data
        o += 24 + size


# ---- VMAD -------------------------------------------------------------------------------------

def _value(d, o, t, fmt):
    if t == 1:
        return o + 8
    if t == 2:
        return wstr(d, o)[1]
    if t in (3, 4):
        return o + 4
    if t == 5:
        return o + 1
    if 11 <= t <= 15:
        n = struct.unpack_from('<I', d, o)[0]
        o += 4
        for _ in range(n):
            o = _value(d, o, t - 10, fmt)
        return o
    raise ValueError(f'VMAD property type {t}')


def _scripts(d, o, count, ver, fmt, names):
    for _ in range(count):
        name, o = wstr(d, o)
        names.append(name)
        if ver >= 4:
            o += 1  # status
        pc = struct.unpack_from('<H', d, o)[0]
        o += 2
        for _ in range(pc):
            _, o = wstr(d, o)
            t = d[o]
            o += 2 if ver >= 4 else 1
            o = _value(d, o, t, fmt)
    return o


def _fragment(d, o, names, with_index=False, quest=False, phase=False):
    if with_index:
        o += 2 + 2  # index, unknown
        if quest:
            o += 4  # log entry
    if phase:
        o += 1 + 4  # unknown, phase
    o += 1  # unknown
    script, o = wstr(d, o)
    names.append(script)
    _, o = wstr(d, o)  # fragment function name
    return o


def vmad_names(typ, d):
    """Every script class name a VMAD subrecord carries: the record's scripts, a quest's alias scripts,
    and the fragment classes (the fragment file and each fragment's script)."""
    names = []
    try:
        ver, fmt, n = struct.unpack_from('<hhH', d, 0)
        o = _scripts(d, 6, n, ver, fmt, names)
        if typ in ('INFO', 'PACK', 'SCEN') and o < len(d):
            o += 1  # unknown (2)
            flags = d[o]
            o += 1
            f, o = wstr(d, o)
            names.append(f)
            mask = 0x3 if typ in ('INFO', 'SCEN') else 0x7
            for bit in range(3):
                if flags & mask & (1 << bit):
                    o = _fragment(d, o, names)
            if typ == 'SCEN':
                pc = struct.unpack_from('<H', d, o)[0]
                o += 2
                for _ in range(pc):
                    o = _fragment(d, o, names, phase=True)
        elif typ == 'PERK' and o < len(d):
            o += 1
            f, o = wstr(d, o)
            names.append(f)
            fc = struct.unpack_from('<H', d, o)[0]
            o += 2
            for _ in range(fc):
                o = _fragment(d, o, names, with_index=True)
        elif typ == 'QUST' and o < len(d):
            o += 1
            fc = struct.unpack_from('<H', d, o)[0]
            o += 2
            f, o = wstr(d, o)
            names.append(f)
            for _ in range(fc):
                o = _fragment(d, o, names, with_index=True, quest=True)
            ac = struct.unpack_from('<H', d, o)[0]
            o += 2
            for _ in range(ac):
                o += 8  # the alias object
                aver, afmt, asc = struct.unpack_from('<hhH', d, o)
                o += 6
                o = _scripts(d, o, asc, aver, afmt, names)
    except (struct.error, IndexError, ValueError, UnicodeDecodeError):
        # a layout this reader does not know: keep what was read before it, plus every identifier-shaped
        # wstring in the rest, minus the Fragment_N function names
        names.extend(_identifiers(d))
    return [n for n in names if n]


_IDENT = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _identifiers(d):
    out, o = [], 0
    while o + 2 <= len(d):
        n = struct.unpack_from('<H', d, o)[0]
        s = d[o + 2:o + 2 + n]
        if 2 <= n <= 96 and len(s) == n:
            try:
                t = s.decode('ascii')
            except UnicodeDecodeError:
                t = ''
            if _IDENT.match(t) and not t.lower().startswith('fragment_'):
                out.append(t)
                o += 2 + n
                continue
        o += 1
    return out


def plugin_names(path):
    names = []
    for typ, flags, fid, data in records(Path(path).read_bytes()):
        if typ == 'TES4':
            continue
        for sig, payload in subrecords(data):
            if sig == b'VMAD':
                names.extend(vmad_names(typ, payload))
    return names


# ---- the folder's compiled scripts --------------------------------------------------------------

def bsa_script_names(path):
    b = Path(path).read_bytes()
    if b[:4] != b'BSA\0':
        return []
    ver, off, aflags, nfold, nfile, tfold, tfile, fflags = struct.unpack_from('<8I', b, 4)
    pos, folders = off, []
    for _ in range(nfold):
        if ver == 105:
            _, cnt, _, foff = struct.unpack_from('<QIIQ', b, pos)
            pos += 24
        else:
            _, cnt, foff = struct.unpack_from('<QII', b, pos)
            pos += 16
        folders.append((cnt, foff))
    recs, end = [], pos
    for cnt, foff in folders:
        p = foff - tfile
        folder = ''
        if aflags & 1:
            ln = b[p]
            folder = b[p + 1:p + ln].decode('latin1')
            p += 1 + ln
        for _ in range(cnt):
            p += 16
            recs.append(folder)
        end = max(end, p)
    names = b[end:end + tfile].split(b'\0')
    out = []
    for folder, name in zip(recs, names):
        n = name.decode('latin1')
        if folder.lower().startswith('scripts') and n.lower().endswith('.pex'):
            out.append(n[:-4])
    return out


def folder_names(folder):
    names = []
    for d, _, fs in os.walk(folder):
        parts = [p.lower() for p in Path(os.path.relpath(d, folder)).parts]
        for n in fs:
            low = n.lower()
            if low.endswith('.pex') and 'scripts' in parts:
                names.append(n[:-4])
            elif low.endswith('.bsa'):
                names.extend(bsa_script_names(os.path.join(d, n)))
    return names


# ---- the map ----------------------------------------------------------------------------------

def unique(names):
    seen = {}
    for n in names:
        seen.setdefault(n.lower(), n)
    return sorted(seen.values(), key=str.lower)


def rows(tsv):
    with open(tsv, newline='') as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith('#')), delimiter='\t')]


def build(tree, admitted_tsv, load_order_tsv, game_dir):
    folder_of = {r['plugin'].lower(): r['mod'] for r in rows(load_order_tsv)}
    lines, summary = [], []
    for r in rows(admitted_tsv):
        plugin, source = r['plugin'], r['source']
        if source == 'layer':
            folder = folder_of.get(plugin.lower())
            if not folder:
                raise SystemExit(f'{plugin}: not in {load_order_tsv}')
            path = Path(tree) / folder / plugin
            if not path.is_file():
                raise SystemExit(f'{plugin}: not at {path}')
            names = unique(plugin_names(path) + folder_names(Path(tree) / folder))
        elif source == 'game':
            path = Path(game_dir) / plugin
            if not path.is_file():
                raise SystemExit(f'{plugin}: not at {path} (persist-mods pulls it off the host\'s persist esm directory)')
            names = unique(plugin_names(path))
        else:
            raise SystemExit(f'{plugin}: unknown source {source!r}')
        lines.append(f'{plugin}: ' + ' '.join(names))
        summary.append(f'{plugin}: {len(names)} script class names ({source})')
    return lines, summary


def main():
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    tree, admitted, load_order, game_dir, out = sys.argv[1:]
    lines, summary = build(tree, admitted, load_order, game_dir)
    header = ('# Papyrus script class names admitted by plugin (ADR-044): "<plugin>: <class> <class> ...", one line per admitted\n'
              '# plugin (lab/layer/papyrus-admitted.tsv), read from the plugin\'s VMAD records and its layer folder\'s .pex files by\n'
              '# lab/tools/papyrus-map.py at every persist-mods build; add-mods.ps1 installs it at Data\\Platform\\papyrus-scripts.txt, where Skyrim Platform\n'
              '# reads it at its load and admits these names through its Papyrus event block.\n')
    Path(out).write_text(header + '\n'.join(lines) + '\n', encoding='utf-8')
    for s in summary:
        print('papyrus: ' + s)


if __name__ == '__main__':
    main()
