#!/usr/bin/env python3
"""ini-patch.py <ini-patches.tsv> <tree>

Settings persist-mods writes into a laid mod's ini after laying it (docs/MODS.md, the essentials
layer), each a row of lab/layer/ini-patches.tsv: folder, file, section, key, value, why. The mod's
own file stays the mod's; the manifest holds only the lab's deltas, as lab/layer/plugin-patches.tsv
does for plugins. The file keeps its byte order mark, line endings and every other line; a key is
matched without regard to case or spacing and rewritten as `key = value`; a key the section lacks
is appended at the section's end; a section the file lacks is an error, not an addition (the
file's shape changed, read it before patching). Idempotent: a second run changes nothing.
"""
import csv
import re
import sys
from pathlib import Path


def rows(tsv):
    with open(tsv, newline='') as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith('#')), delimiter='\t')]


def patch(text, section, key, value):
    """(new text, what changed) with `key = value` set in [section]."""
    nl = '\r\n' if '\r\n' in text else '\n'
    lines = text.split(nl)
    sec_re = re.compile(r'^\s*\[(.+?)\]\s*$')
    key_re = re.compile(r'^\s*' + re.escape(key) + r'\s*=\s*(.*?)\s*$', re.I)
    start = None
    for i, line in enumerate(lines):
        m = sec_re.match(line)
        if m and m.group(1).strip().lower() == section.lower():
            start = i
            break
    if start is None:
        raise SystemExit(f'ini-patch: no [{section}] section')
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if sec_re.match(lines[j]):
            end = j
            break
    for j in range(start + 1, end):
        m = key_re.match(lines[j])
        if m:
            if m.group(1) == value:
                return text, f'{key} = {value} already'
            old = m.group(1)
            lines[j] = f'{key} = {value}'
            return nl.join(lines), f'{key} = {value} (was {old})'
    # append before the trailing blank lines of the section
    k = end
    while k > start + 1 and lines[k - 1].strip() == '':
        k -= 1
    lines.insert(k, f'{key} = {value}')
    return nl.join(lines), f'{key} = {value} (added to [{section}])'


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    tsv, tree = sys.argv[1:]
    for r in rows(tsv):
        path = Path(tree) / r['folder'] / r['file']
        if not path.is_file():
            raise SystemExit(f'ini-patch: {path} is not there')
        raw = path.read_bytes()
        bom = raw.startswith(b'\xef\xbb\xbf')
        text = raw[3:].decode('utf-8') if bom else raw.decode('utf-8')
        new, what = patch(text, r['section'], r['key'], r['value'])
        if new != text:
            path.write_bytes((b'\xef\xbb\xbf' if bom else b'') + new.encode('utf-8'))
        print(f"ini: {r['folder']}/{r['file']} [{r['section']}] {what}")


if __name__ == '__main__':
    main()
