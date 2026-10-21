#!/usr/bin/env python3
"""layer-render.py: lab/layer/load-order.tsv rendered into the places that repeat it.

The load order lives once, in lab/layer/load-order.tsv (docs/MODS.md, the essentials layer). This writes it into:
  lab/tools/persist-mods.sh            the `plugins=(...)` array (what add-mods.ps1 enables, in order; layer-stage.sh
                                       and lab/tests read the literal, so it has to be in the script)
  lab/deploy/sky-srv/server-settings.json          loadOrder: the masters and Creation Club plugins it already lists,
                                                   then every served plugin (1.6.1170 loads every version's)
  lab/deploy/sky-srv/server-settings-1.7.104.json  the same without the plugins scoped to 1.6.1170
`--check` rewrites nothing and exits 1 when any of the three differs from the render (lab/tests runs it).
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TSV = ROOT / 'lab' / 'layer' / 'load-order.tsv'
SCRIPT = ROOT / 'lab' / 'tools' / 'persist-mods.sh'
SRV = ROOT / 'lab' / 'deploy' / 'sky-srv'
ESM = '/srv/skymp/esm/'


def rows():
    with open(TSV, newline='') as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith('#')), delimiter='\t')]


def shell_word(s):
    return s if re.fullmatch(r'[A-Za-z0-9._+-]+', s) else '"' + s.replace('"', '\\"') + '"'


def render_script(text, order):
    words = ' '.join(shell_word(r['plugin']) for r in order)
    new = f'plugins=({words})'
    out, n = re.subn(r'^plugins=\([^)]*\)', new, text, count=1, flags=re.M)
    if n != 1:
        sys.exit('persist-mods.sh has no plugins=(...) line')
    return out


def render_settings(settings, order, version):
    served = [r['plugin'] for r in order if r['server'] == 'yes' and r['versions'] in ('all', version)]
    lo = settings['loadOrder']
    head = lo[: lo.index(ESM + '_ResourcePack.esl') + 1]   # the masters and the Creation Club plugins, as deployed
    settings = dict(settings)
    settings['loadOrder'] = head + [ESM + p for p in served]
    return settings


def main():
    check = '--check' in sys.argv
    order = rows()
    changed = []
    text = SCRIPT.read_text()
    new = render_script(text, order)
    if new != text:
        changed.append(SCRIPT)
        if not check:
            SCRIPT.write_text(new)
    for name, version in (('server-settings.json', '1.6.1170'), ('server-settings-1.7.104.json', '1.7.104')):
        p = SRV / name
        old = p.read_text()
        settings = render_settings(json.loads(old), order, version)
        new = json.dumps(settings, indent=2, ensure_ascii=False) + '\n'
        if new != old:
            changed.append(p)
            if not check:
                p.write_text(new)
    if check:
        if changed:
            print('not rendered from lab/layer/load-order.tsv: ' + ', '.join(str(c.relative_to(ROOT)) for c in changed))
            sys.exit(1)
        print('load order rendered everywhere')
    else:
        print('rendered: ' + (', '.join(str(c.relative_to(ROOT)) for c in changed) or 'nothing changed'))


if __name__ == '__main__':
    main()
