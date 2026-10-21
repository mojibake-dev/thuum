#!/usr/bin/env python3
"""gate-cite.py [--layer <thuum branch> <run id>] <run set id> <fork branch> <gate scenario...>: whether a finished
run set may stand for a merge's gate (ADR-042, `GATE_SET=<id> just verb-merge`; ADR-042a, a layer staged under that
train, `GATE_SET=<id> LAYER_RUN=<run id> TRAIN=<fork branch> just layer-merge <thuum branch>`). Exits 0 when every
check holds, 1 when one fails (the merge then runs its own gate), printing one line per check:

1. the set is done, green or watch (ADR-027), and every gate scenario's last run in it is green;
2. its runs played one build: the same server image id and the same clone snapshot descriptions in every
   result.json's `build`;
3. that build is the branch's stage: the server image is skymp-server:<branch>-<sha8>, or the branch's bare tag that
   verb-stage pins (SERVER_TAG=<branch>) with every description naming the one <sha8>; the registry still serves
   skymp-server:<branch>-<sha8> as the same id, and every description names "<branch> client <sha8>";
4. the branch head is that sha, or differs from it in .md files only (a change to anything that builds runs the
   gate);
5. nothing replaced the stage after the set began: no line in /srv/lab/turbo.log since its start, and the running
   server and both clones' clean-m1-next still carry the set's build.

With --layer, the train's five, then the layer's three (ADR-042a: the train staged over the layer as laid, the gate
every scenario of the set):
6. the layer's own stage run (its smoke or a decider, named) is green, every clone it played was described
   "<thuum branch> layer <sha8>" with one <sha8>, and it began before the set did;
7. the thuum branch's head carries that staged layer: every path it changed since <sha8> is a .md file or matches
   origin/main's blob (a merge of main brought it);
8. persist's mods are the ones laid: /srv/persist/mods/SHA256SUMS was last written before that run began.

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


def staged_sha(branch: str, image: str, descs) -> str:
    """The commit a build stages: its image's own <branch>-<sha8> tag, or, under the branch's bare tag (verb-stage's
    SERVER_TAG=<branch>, m2-train-30's stage on 2026-10-20), the one commit the clones' descriptions name."""
    m = re.search(rf":{re.escape(branch)}-([0-9a-f]{{8}})$", image)
    if m:
        return m.group(1)
    if not image.endswith(f":{branch}"):
        return ""
    named = {x.group(1) for _, d in descs for x in [re.search(rf"{re.escape(branch)} client ([0-9a-f]{{8}})", d)] if x}
    return next(iter(named)) if len(named) == 1 else ""


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
    sha8 = staged_sha(branch, image, descs)
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


def _time(s: str) -> datetime.datetime:
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))


def layer_sha(layer_branch: str, run: dict) -> str:
    """The one <sha8> the layer stage run's clones were described with ("<thuum branch> layer <sha8>"), else ""."""
    descs = [(d or {}).get("description", "") for d in ((run.get("build") or {}).get("clients") or {}).values()]
    named = {x.group(1) for d in descs for x in [re.search(rf"{re.escape(layer_branch)} layer ([0-9a-f]{{8}})", d)] if x}
    return next(iter(named)) if len(named) == 1 and descs and all(f"{layer_branch} layer " in d for d in descs) else ""


def layer_checks(layer_branch: str, run_id: str, run: dict, rs: dict, foreign: list[str] | None,
                 sums_written: datetime.datetime | None) -> list[tuple[bool, str]]:
    out = []
    lsha8 = layer_sha(layer_branch, run)
    began = _time(run["started"]) if run.get("started") else None
    before = began is not None and bool(rs.get("started")) and began < _time(rs["started"])
    ok6 = run.get("verdict") == "green" and bool(lsha8) and before
    out.append((ok6, f"6. the layer's own stage: run {run_id} {run.get('verdict')}, clones "
                     + (f"'{layer_branch} layer {lsha8}'" if lsha8 else f"not one '{layer_branch} layer <sha8>'")
                     + (", before the set" if before else ", not before the set")))
    ok7 = foreign is not None and not foreign
    out.append((ok7, "7. the head carries that layer: " + ("every change since is main's or a .md file" if ok7 else
                (f"changed since {lsha8 or '?'}: {', '.join(foreign[:4])}" + ("..." if len(foreign) > 4 else "")) if foreign
                else "the diff since the staged commit could not be read")))
    ok8 = sums_written is not None and began is not None and sums_written < began
    out.append((ok8, "8. persist's mods are the ones laid: SHA256SUMS " + (
        f"written {sums_written:%Y-%m-%dT%H:%MZ}, before the run" if ok8 else
        f"written {sums_written:%Y-%m-%dT%H:%MZ}, after the run began" if sums_written else "unreadable")))
    return out


def _blob(ref: str, path: str) -> str | None:
    r = subprocess.run(["git", "rev-parse", "-q", "--verify", f"{ref}:{path}"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def main(argv: list[str]) -> int:
    layer = None
    if argv[:1] == ["--layer"]:
        if len(argv) < 5:
            print(__doc__.split("\n\n")[0], file=sys.stderr)
            return 2
        layer, argv = (argv[1], argv[2]), argv[3:]
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
    image, _, descs = next(iter(bs)) if len(bs) == 1 else ("", "", ())
    sha8 = staged_sha(branch, image, descs)
    changed = None
    registry_id = None
    if sha8:
        d = subprocess.run(["git", "-C", fork, "diff", "--name-only", sha8, f"origin/{branch}"], capture_output=True, text=True)
        changed = [p for p in d.stdout.splitlines() if p] if d.returncode == 0 else None
        # the commit's own tag, whichever tag the stage ran: its id is what the set's runs must have played
        tagged = image if image.endswith(f"-{sha8}") else f"{image}-{sha8}"
        registry_id = ssh(f"docker pull -q {tagged} >/dev/null && docker image inspect --format '{{{{.Id}}}}' {tagged}").strip() or None
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
    if layer and not gate:
        gate = list(rs.get("scenarios", []))  # a layer's gate is the whole set (ADR-042a)
    rows = checks(rs, results, gate, branch, head8, changed, registry_id, live_server, live_descs, turbo_since)
    if layer:
        lbranch, lrun = layer
        try:
            run = fetch(f"{RESULTS}/{lrun}/result.json")
        except Exception:
            run = {}
        lsha8 = layer_sha(lbranch, run)
        foreign = None
        if lsha8:
            subprocess.run(["git", "fetch", "-q", "origin", lbranch, "main"], capture_output=True)
            d = subprocess.run(["git", "diff", "--name-only", lsha8, f"origin/{lbranch}"], capture_output=True, text=True)
            if d.returncode == 0:
                foreign = [p for p in d.stdout.splitlines() if p and not p.endswith(".md")
                           and _blob(f"origin/{lbranch}", p) != _blob("origin/main", p)]
        try:
            sums_written = datetime.datetime.fromtimestamp(
                int(ssh("stat -c %Y /srv/persist/mods/SHA256SUMS").strip()), datetime.timezone.utc)
        except (subprocess.CalledProcessError, ValueError):
            sums_written = None
        rows += layer_checks(lbranch, lrun, run, rs, foreign, sums_written)
    for ok, msg in rows:
        print(("   ok  " if ok else "   NO  ") + msg)
    return 0 if all(ok for ok, _ in rows) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
