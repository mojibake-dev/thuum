#!/usr/bin/env python3
"""bsa-extract.py <archive.bsa> <entry> <out file>

One file out of a Skyrim BSA (version 104 or 105), written to <out file>, parent folders made.
<entry> is the path inside the archive (slashes either way, case ignored). A compressed entry
(the archive's default, or the file's own toggle) is an LZ4 frame after a 4-byte original size
in a version-105 archive, which this reads with its own LZ4 frame decoder (nothing beyond the
standard library), and the decoded length must equal that size; a version-104 entry is zlib.

Why the layer needs it (docs/MODS.md, the essentials layer): a loose file beats every archive
whatever the plugins' order, so a file two archives both carry can be settled by laying the
winner's copy loose, without moving a plugin and its slot. RaceMenu.bsa and SkyUI_SE.bsa both
carry interface/racesex_menu.swf; SkyUI loads last as client-only, so RaceMenu's copy is laid
loose in RaceMenu's folder.
"""
import struct
import sys
import zlib
from pathlib import Path

LZ4_MAGIC = 0x184D2204


def lz4_block(src, out):
    """Append the LZ4 block `src` decoded to the bytearray `out` (matches may reach into earlier blocks)."""
    i, n = 0, len(src)
    while i < n:
        token = src[i]
        i += 1
        lit = token >> 4
        if lit == 15:
            while True:
                b = src[i]
                i += 1
                lit += b
                if b != 255:
                    break
        out += src[i:i + lit]
        i += lit
        if i >= n:
            break
        offset = src[i] | (src[i + 1] << 8)
        i += 2
        if offset == 0:
            raise ValueError('LZ4 block: zero match offset')
        mlen = (token & 0xF) + 4
        if (token & 0xF) == 15:
            while True:
                b = src[i]
                i += 1
                mlen += b
                if b != 255:
                    break
        start = len(out) - offset
        if start < 0:
            raise ValueError('LZ4 block: match before the start of the output')
        if offset >= mlen:
            out += out[start:start + mlen]
        else:
            for k in range(mlen):
                out.append(out[start + k])


def lz4_frame(data):
    """The content of an LZ4 frame (one frame; block and content checksums are skipped, not verified)."""
    if struct.unpack_from('<I', data, 0)[0] != LZ4_MAGIC:
        raise ValueError('not an LZ4 frame')
    flg, bd = data[4], data[5]
    if (flg >> 6) != 1:
        raise ValueError(f'LZ4 frame version {flg >> 6}')
    block_checksum = bool(flg & 0x10)
    p = 6
    if flg & 0x08:
        p += 8  # content size
    if flg & 0x01:
        p += 4  # dictionary id
    p += 1  # header checksum
    out = bytearray()
    while True:
        size = struct.unpack_from('<I', data, p)[0]
        p += 4
        if size == 0:
            break
        if size & 0x80000000:
            size &= 0x7FFFFFFF
            out += data[p:p + size]
        else:
            lz4_block(data[p:p + size], out)
        p += size
        if block_checksum:
            p += 4
    return bytes(out)


def entries(buf):
    """{lower-cased path: (size field, offset)} and the archive's flags and version."""
    if buf[:4] != b'BSA\0':
        raise ValueError('not a BSA')
    ver, off, aflags, nfold, nfile, tfold, tfile, fflags = struct.unpack_from('<8I', buf, 4)
    pos, folders = off, []
    for _ in range(nfold):
        if ver == 105:
            _, cnt, _, foff = struct.unpack_from('<QIIQ', buf, pos)
            pos += 24
        else:
            _, cnt, foff = struct.unpack_from('<QII', buf, pos)
            pos += 16
        folders.append((cnt, foff))
    recs, end = [], pos
    for cnt, foff in folders:
        p = foff - tfile
        folder = ''
        if aflags & 1:
            ln = buf[p]
            folder = buf[p + 1:p + ln].decode('latin1')
            p += 1 + ln
        for _ in range(cnt):
            _, size, offset = struct.unpack_from('<QII', buf, p)
            p += 16
            recs.append((folder, size, offset))
        end = max(end, p)
    names = buf[end:end + tfile].split(b'\0')
    out = {}
    for (folder, size, offset), name in zip(recs, names):
        path = (folder + '\\' + name.decode('latin1')) if folder else name.decode('latin1')
        out[path.lower().replace('\\', '/')] = (size, offset)
    return out, aflags, ver


def extract(buf, entry):
    table, aflags, ver = entries(buf)
    key = entry.lower().replace('\\', '/')
    if key not in table:
        raise KeyError(entry)
    size, offset = table[key]
    compressed = bool(aflags & 4) != bool(size & 0x40000000)
    size &= 0x3FFFFFFF
    p = offset
    if aflags & 0x100:  # the file's name embedded before its data
        ln = buf[p]
        p += 1 + ln
        size -= 1 + ln
    data = buf[p:p + size]
    if not compressed:
        return data
    orig = struct.unpack_from('<I', data, 0)[0]
    out = lz4_frame(data[4:]) if ver == 105 else zlib.decompress(data[4:])
    if len(out) != orig:
        raise ValueError(f'{entry}: decoded {len(out)} bytes, the archive says {orig}')
    return out


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    bsa, entry, out = sys.argv[1:]
    data = extract(Path(bsa).read_bytes(), entry)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_bytes(data)
    print(f'extracted: {entry} from {Path(bsa).name} -> {out} ({len(data)} B)')


if __name__ == '__main__':
    main()
