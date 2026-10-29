#!/usr/bin/env python3
"""glab.py: GitLab pipelines for root/thuum (6) and root/skymp (7).
Read-only calls use the Keychain items thuum-mundus created (service
gitlab-thuum-readapi, accounts thuum and skymp); `run` uses the project access
tokens (service gitlab-thuum-api, same accounts, api scope). Tokens are never
printed. Usage: glab.py [thuum|skymp ...] | glab.py log <project> <job-id> [lines]
| glab.py run <project> [ref] [KEY=VALUE ...]   (an API pipeline: every changes:
rule counts as matched, so the image jobs and difftest-build run even when the
push pipeline skipped them; KEY=VALUE pairs become pipeline variables, so
CLIENT_BUILD_WINDOWS=0 keeps the client build off the seats' host)"""
import json, subprocess, sys, urllib.parse, urllib.request
G = "https://gitlab.gaussing.tv/api/v4"
PROJECTS = {"thuum": 6, "skymp": 7}

def token(name, service="gitlab-thuum-readapi"):
    return subprocess.check_output(["security", "find-generic-password", "-s", service, "-a", name, "-w"], text=True).strip()

def get(tok, path):
    req = urllib.request.Request(G + path, headers={"PRIVATE-TOKEN": tok})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def main():
    which = sys.argv[1:] or list(PROJECTS)
    if which and which[0] == "run":
        name = which[1]
        rest = which[2:]
        variables = [a.split("=", 1) for a in rest if "=" in a]
        refs = [a for a in rest if "=" not in a]
        ref = refs[0] if refs else {"thuum": "main", "skymp": "parity"}[name]
        tok = token(name, "gitlab-thuum-api")
        form = [("ref", ref)]
        for k, v in variables:
            form += [("variables[][key]", k), ("variables[][value]", v)]
        data = urllib.parse.urlencode(form).encode()
        req = urllib.request.Request(f"{G}/projects/{PROJECTS[name]}/pipeline", data=data, method="POST", headers={"PRIVATE-TOKEN": tok})
        with urllib.request.urlopen(req, timeout=30) as r:
            p = json.load(r)
        print(f"pipeline {p['id']} {p['status']} {p['ref']} {p['sha'][:8]} {p['web_url']}")
        return
    if which and which[0] == "log":
        name, job_id = which[1], which[2]
        tok = token(name)
        req = urllib.request.Request(f"{G}/projects/{PROJECTS[name]}/jobs/{job_id}/trace", headers={"PRIVATE-TOKEN": tok})
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8", "replace")
        tail = int(which[3]) if len(which) > 3 else 60
        print("\n".join(text.splitlines()[-tail:]))
        return
    for name in which:
        tok = token(name); pid = PROJECTS[name]
        pipes = get(tok, f"/projects/{pid}/pipelines?per_page=3")
        print(f"=== {name} ===")
        for p in pipes:
            print(f"  pipeline {p['id']} {p['ref']} {p['status']} {p['created_at'][:16]} {p['sha'][:8]}")
        if pipes:
            jobs = get(tok, f"/projects/{pid}/pipelines/{pipes[0]['id']}/jobs?per_page=30")
            for j in jobs:
                print(f"    {j['name']:22} {j['status']:9} {(j.get('failure_reason') or ''):24} id={j['id']}")

if __name__ == "__main__":
    main()
