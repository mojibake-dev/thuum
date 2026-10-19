#!/usr/bin/env python3
"""client-builds.py <branch> [--sha <prefix>] [--source gitlab|github|both]

The successful client builds of a fork branch, newest first, one per line:

    <source> <id> <sha>

where <source> is `gitlab` (the fork's client-build job on sky-build, id = the
job id; its artifact is build/dist) or `github` (the mirror's Parity Windows
run, id = the run id; its artifact `dist`). Both sources build the same dist
from the same commit; verb-stage's REUSE_DIST walk and `just build-client`
read this list so a head takes whichever source built it (or an ancestor with
its client), GitLab preferred when both have the same commit (ADR-040 item 3;
sky-build, 2026-10-19).

GitLab is read with the read token in the keychain (gitlab-thuum-readapi, the
justfile's); GitHub through gh. A source that cannot be read is skipped with a
note on stderr, never an error: the other source still answers.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request

GITLAB = "https://gitlab.gaussing.tv/api/v4/projects/" + os.environ.get("GITLAB_PROJECT", "7")


def gitlab_token() -> str:
    for account in ("skymp", "thuum"):
        try:
            return subprocess.run(
                ["security", "find-generic-password", "-s", "gitlab-thuum-readapi", "-a", account, "-w"],
                check=True, capture_output=True, text=True).stdout.strip()
        except subprocess.CalledProcessError:
            continue
    return ""


def gitlab_builds(branch: str) -> list[tuple[str, str, str]]:
    tok = gitlab_token()
    if not tok:
        print("   client-builds: no GitLab read token in the keychain; GitLab skipped", file=sys.stderr)
        return []
    out: list[tuple[str, str, str]] = []
    try:
        for page in (1, 2):
            q = urllib.parse.urlencode({"scope[]": "success", "per_page": 100, "page": page})
            req = urllib.request.Request(f"{GITLAB}/jobs?{q}", headers={"PRIVATE-TOKEN": tok})
            jobs = json.load(urllib.request.urlopen(req, timeout=60))
            if not isinstance(jobs, list):
                break
            for j in jobs:
                if j.get("name") == "client-build" and j.get("ref") == branch and j.get("artifacts_file"):
                    out.append(("gitlab", str(j["id"]), str(j["commit"]["id"])))
            if len(jobs) < 100:
                break
    except Exception as e:  # noqa: BLE001
        print(f"   client-builds: GitLab not read ({e}); GitLab skipped", file=sys.stderr)
    return out


def github_builds(branch: str) -> list[tuple[str, str, str]]:
    try:
        r = subprocess.run(
            ["gh", "run", "list", "-R", "mojibake-dev/skymp", "--workflow", "parity-windows.yml", "--branch", branch,
             "--status", "success", "--limit", "30", "--json", "databaseId,headSha"],
            check=True, capture_output=True, text=True)
        return [("github", str(x["databaseId"]), str(x["headSha"])) for x in json.loads(r.stdout)]
    except Exception as e:  # noqa: BLE001
        print(f"   client-builds: GitHub not read ({e}); GitHub skipped", file=sys.stderr)
        return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("branch")
    ap.add_argument("--sha", default="", help="only builds of a commit with this prefix")
    ap.add_argument("--source", choices=("gitlab", "github", "both"), default="both")
    a = ap.parse_args()
    rows: list[tuple[str, str, str]] = []
    if a.source in ("gitlab", "both"):
        rows += gitlab_builds(a.branch)
    if a.source in ("github", "both"):
        rows += github_builds(a.branch)
    # newest first within a source already; across sources the GitLab job of a
    # commit comes before the GitHub run of the same commit, and the order of
    # commits follows the GitHub list (the branch's history), GitLab-only
    # commits (a push-option run) first
    seen_sha = []
    for _, _, sha in rows:
        if sha not in seen_sha:
            seen_sha.append(sha)
    order = {s: i for i, s in enumerate(seen_sha)}
    rows.sort(key=lambda r: (order[r[2]], 0 if r[0] == "gitlab" else 1))
    for src, rid, sha in rows:
        if a.sha and not sha.startswith(a.sha):
            continue
        print(src, rid, sha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
