#!/usr/bin/env python3
"""gate-cite.py <run set id> <fork branch> <gate scenario...>: whether a finished run set may stand for a merge's
gate (ADR-042, `GATE_SET=<id> just verb-merge`). Exits 0 when all five checks hold, 1 when one fails (verb-merge then
runs the gate), printing one line per check:

1. the set is done, green or watch (ADR-027), and every gate scenario's last run in it is green;
2. its runs played one build: the same server image id and the same clone snapshot descriptions in every
   result.json's `build`;
3. that build is the branch's stage: the server image is skymp-server:<branch>-<sha8>, the registry still serves
   that tag as the same id, and every description names "<branch> client <sha8>";
4. the branch head is that sha, or differs from it in .md files only (a change to anything that builds runs the
   gate);
5. nothing replaced the stage after the set began: no line in /srv/lab/turbo.log since its start, and the running
   server and both clones' clean-m1-next still carry the set's build.

FORK_DIR (default skymp) is the fork checkout; LAB_API and RESULTS name lab-api and the results site."""
from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
import sys
import urllib.request

API = os.environ.get("LAB_API", "https://thuum.gaussing.tv/lab")
RESULTS = os.environ.get("RESULTS", "https://thuum.gaussing.tv/results")
JUMP = os.environ.get("JUMP_HOST", "root@core.gaussing.tv")
SRV = os.environ.get("SRV_HOST", "eli@10.10.70.10")
CLONES = {"c1": 711, "c2": 712}


def fetch(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def ssh(*argv: str, srv: bool = True) -> str:
    cmd = ["ssh", "-o", "BatchMode=yes"] + (["-J", JUMP, SRV] if srv else [JUMP]) + list(argv)
    return subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120).stdout


def builds(rs: dict, results: dict[str, dict]) -> set:
    out = set()
    for runs in rs.get("runs", {}).values():
        for e in runs:
            b = (results.get(e.get("run")) or {}).get("build") or {}
            srv = b.get("server") or {}
            descs = tuple(sorted((c, (d or {}).get("description", "")) for c, d in (b.get("clients") or {}).items()))
            out.add((srv.get("image", ""), srv.get("id", ""), descs))
    return out


def checks(rs: dict, results: dict[str, dict], gate: list[str], branch: str, head8: str, changed: list[str] | None,
           registry_id: str | None, live_server: str, live_descs: dict[str, str], turbo_since: list[str]) -> list[tuple[bool, str]]:
    out = []
    last = {s: (runs[-1].get("verdict") if runs else None) for s, runs in rs.get("runs", {}).items()}
    missing = [s for s in gate if s not in rs.get("scenarios", [])]
    unproven = [s for s in gate if s not in missing and last.get(s) != "green"]
    ok1 = rs.get("state") == "done" and rs.get("verdict") in ("green", "watch") and not missing and not unproven
    out.append((ok1, f"1. set {rs.get('id')}: {rs.get('state')}, {rs.get('verdict')}"
                + (f"; lacks {', '.join(missing)}" if missing else "") + (f"; not green last: {', '.join(unproven)}" if unproven else "")))
    bs = builds(rs, results)
    bare = sum(1 for runs in rs.get("runs", {}).values() for e in runs if not (results.get(e.get("run")) or {}).get("build"))
    one = len(bs) == 1 and not bare and all(x[1] for x in bs)
    why = "yes" if one else (f"{bare} run(s) recorded no build (a lab-api before main 7bf200a)" if bare else f"{len(bs)} builds")
    out.append((one, f"2. one build in its runs: {why}"))
    if not one:
        return out + [(False, "3-5. not checked: no single build")]
    image, sid, descs = next(iter(bs))
    m = re.search(rf":{re.escape(branch)}-([0-9a-f]{{8}})$", image)
    sha8 = m.group(1) if m else ""
    named = bool(descs) and all(f"{branch} client {sha8}" in d for _, d in descs)
    ok3 = bool(sha8) and named and registry_id == sid
    out.append((ok3, f"3. the branch's stage: server {image.rsplit('/', 1)[-1]} ({'the registry still serves it' if registry_id == sid else 'the registry serves another id'}), "
                     f"clones {'name' if named else 'do not all name'} '{branch} client {sha8 or '?'}'"))
    docs_only = changed is not None and all(p.endswith(".md") for p in changed)
    ok4 = head8 == sha8 or (bool(sha8) and docs_only)
    out.append((ok4, f"4. head {head8} " + ("is the staged commit" if head8 == sha8 else
                ("differs in .md files only" if docs_only else f"differs from {sha8 or '?'} in more than docs"))))
    same = live_server == sid and dict(descs) == live_descs
    ok5 = same and not turbo_since
    out.append((ok5, "5. nothing replaced it since the set began" if ok5 else
                f"5. replaced since the set began: {len(turbo_since)} turbo push(es), server {'same' if live_server == sid else 'other'}, clones {'same' if dict(descs) == live_descs else 'other'}"))
    return out


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__.split("\n\n")[0], file=sys.stderr)
        return 2
    rid, branch, gate = argv[0], argv[1], argv[2:]
    fork = os.environ.get("FORK_DIR", "skymp")
    rs = fetch(f"{API}/runset/{rid}")
    results = {}
    for runs in rs.get("runs", {}).values():
        for e in runs:
            if e.get("run"):
                try:
                    results[e["run"]] = fetch(f"{RESULTS}/{e['run']}/result.json")
                except Exception:
                    results[e["run"]] = {}
    head8 = subprocess.run(["git", "-C", fork, "rev-parse", "--short=8", f"origin/{branch}"], check=True, capture_output=True, text=True).stdout.strip()
    bs = builds(rs, results)
    image = next(iter(bs))[0] if len(bs) == 1 else ""
    m = re.search(rf":{re.escape(branch)}-([0-9a-f]{{8}})$", image)
    changed = None
    registry_id = None
    if m:
        d = subprocess.run(["git", "-C", fork, "diff", "--name-only", m.group(1), f"origin/{branch}"], capture_output=True, text=True)
        changed = [p for p in d.stdout.splitlines() if p] if d.returncode == 0 else None
        registry_id = ssh(f"docker pull -q {image} >/dev/null && docker image inspect --format '{{{{.Id}}}}' {image}").strip() or None
    live_server = ssh("docker inspect --format '{{.Image}}' lab-skymp-server-1").strip()
    live_descs = {}
    for c, vmid in CLONES.items():
        line = next((ln for ln in ssh(f"qm listsnapshot {vmid}", srv=False).splitlines() if "-> clean-m1-next " in ln), "")
        live_descs[c] = re.sub(r"^.*clean-m1-next +[0-9-]+ [0-9:]+ +", "", line).strip()
    started = datetime.datetime.fromisoformat(rs["started"].replace("Z", "+00:00"))
    turbo_since = []
    for ln in ssh("cat /srv/lab/turbo.log 2>/dev/null || true").splitlines():
        try:
            t = datetime.datetime.fromisoformat(ln.split()[0].replace("Z", "+00:00"))
        except (ValueError, IndexError):
            turbo_since.append(ln)  # a line it cannot date counts against the citation
            continue
        if t >= started:
            turbo_since.append(ln)
    rows = checks(rs, results, gate, branch, head8, changed, registry_id, live_server, live_descs, turbo_since)
    for ok, msg in rows:
        print(("   ok  " if ok else "   NO  ") + msg)
    return 0 if all(ok for ok, _ in rows) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
