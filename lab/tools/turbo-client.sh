#!/usr/bin/env bash
# turbo-client.sh <fork-ref> (ADR-041 item 2(a)): a live session's TypeScript client push.
# 1. The bundle is built on this Mac (turbo-client-build.sh: a sparse fork worktree, yarn 1 through npx, webpack).
# 2. It goes to each seat's clone over the in-VLAN hop (stage-client.sh's: scp to sky-srv, a throwaway http.server,
#    Invoke-WebRequest, its SHA256 checked inside the guest).
# 3. The game is stopped. The bundle goes into every game folder's Data\Platform\Plugins, each replaced file kept
#    under C:\sky-lab\turbo\<stamp>\ with its path beside it (turbo-back puts them back). The new file is swapped in
#    by one ReplaceFile, which a running game neither reads half-written nor reloads (measured 2026-10-19), in case
#    the logon launcher started one again meanwhile.
# 4. The seats are relaunched together; playtest-relaunch.sh waits for each back online. It also takes the lab's
#    playtest hold (180 min, renewed per call), which a playtest wants; outside one, `just lab-release` afterwards.
# 5. /srv/lab/turbo.log gets "<UTC> client <stamp> <vmids> <sha8>".
# Every push relaunches (ADR-041: until a lab measurement shows skymp5-client whole across a hot reload). The
# measurement of 2026-10-19 is red: Skyrim Platform reloads a running game's plugins 8 ms after a last-write change
# (DirectoryMonitor.cpp), and the reloaded client stays on the old connection without a login and sends no movement
# (docs/LAB.md, Turbo mode).
# TURBO_CLIENTS overrides the seats ("c1:711 c2:712"; one seat for a probe).
set -euo pipefail
ref=${1:?fork ref: a branch or sha (just turbo-client m2-train-27-snap)}
here=$(cd "$(dirname "$0")/../.." && pwd)
jump=${JUMP_HOST:-root@core.gaussing.tv}
srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${TURBO_PORT:-8766}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
seats=${TURBO_CLIENTS:-c1:711 c2:712}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() {  # run <vmid> <powershell>: the guest's output; an answer that is no JSON is asked again (client-driver.sh's rule)
  local out try
  for try in 1 2 3; do
    out=$(ssh -o BatchMode=yes "$jump" "qm guest exec $1 --timeout 120 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$2")" || true)
    printf '%s' "$out" | python3 -c 'import sys,json; json.load(sys.stdin, strict=False)' 2>/dev/null && break
    sleep 5
  done
  printf '%s' "$out" | python3 -c 'import sys,json; d=json.load(sys.stdin, strict=False); print((d.get("out-data") or d.get("err-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'
}
online() {
  curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d '{"payload":{"kind":"online"}}' \
    | python3 -c 'import json,sys; print(" ".join(str(p) for p in sorted(x.get("profileId") for x in json.load(sys.stdin).get("players", []))))'
}
t0=$(date +%s)
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "== a lab run is active ($active): a turbo push waits for it" >&2; exit 3; }
bundle=$("$here/lab/tools/turbo-client-build.sh" "$ref" | tail -1)
sha8=$(git -C "$here/lab/.cache/turbo-fork" rev-parse --short=8 HEAD)
want=$(shasum -a 256 "$bundle" | awk '{print $1}')
stamp=$(date -u +%Y%m%dT%H%M%SZ)
echo "== turbo-client ${sha8} $(( $(wc -c < "$bundle") / 1024 )) KiB, seats ${seats} $(date +%H:%M:%S)"
ssh -o BatchMode=yes -J "$jump" "$srv" 'mkdir -p /srv/lab/handover'
scp -q -o BatchMode=yes -J "$jump" "$bundle" "$srv:/srv/lab/handover/turbo-$stamp.js"
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/lab/handover && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > .turbo-http.pid)"
trap 'ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.turbo-http.pid) 2>/dev/null; rm -f /srv/lab/handover/turbo-$stamp.js /srv/lab/handover/.turbo-http.pid" >/dev/null 2>&1 || true' EXIT
sleep 1
vmids=()
stop="Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3"
for pair in $seats; do
  c=${pair%%:*}; vmid=${pair#*:}; vmids+=("$vmid")
  got=$(run "$vmid" "\$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'http://$srv_ip:$port/turbo-$stamp.js' -OutFile 'C:\\sky-lab\\turbo-incoming.js'; (Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\turbo-incoming.js').Hash.ToLower()")
  [ "$got" = "$want" ] || { echo "== $c ($vmid): the bundle arrived as ${got:-nothing}, not $want" >&2; exit 4; }
  laid=$(run "$vmid" "$stop
\$k = 'C:\\sky-lab\\turbo\\$stamp'; New-Item -ItemType Directory -Force -Path \$k | Out-Null
\$gs = @(Get-ChildItem 'C:\\sky-lab\\games' -Filter '*.txt' | ForEach-Object { (Get-Content \$_.FullName -Raw).Trim() })
\$i = 0
foreach (\$g in \$gs) { \$dst = Join-Path \$g 'Data\\Platform\\Plugins\\skymp5-client.js'
  if (Test-Path \$dst) { \$i++; \$kept = Join-Path \$k (\$i.ToString() + '.js')
    # a retried lay (the guest agent's answer lost) finds the original kept already and must not keep the new bundle over it
    if (-not (Test-Path \$kept)) { Copy-Item \$dst \$kept -Force; Set-Content (\$kept + '.path') \$dst -NoNewline } }
  # staged beside the plugin folder and swapped in by one ReplaceFile (step 3)
  \$tmp = Join-Path \$g 'Data\\Platform\\skymp5-client.js.turbo'
  Copy-Item 'C:\\sky-lab\\turbo-incoming.js' \$tmp -Force
  if (Test-Path \$dst) { [System.IO.File]::Replace(\$tmp, \$dst, [NullString]::Value) } else { Move-Item \$tmp \$dst -Force } }
'laid into ' + \$gs.Count + ' game folder(s), ' + \$i + ' kept'") || { echo "== $c ($vmid): $laid" >&2; exit 5; }
  echo "   $c ($vmid): $laid"
done
ssh -o BatchMode=yes -J "$jump" "$srv" "echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) client $stamp $(IFS=,; echo "${vmids[*]}") $sha8\" >> /srv/lab/turbo.log"
pids=()
for pair in $seats; do "$here/lab/tools/playtest-relaunch.sh" "${pair%%:*}" & pids+=($!); done
ok=0; for p in "${pids[@]}"; do wait "$p" || ok=1; done
[ "$ok" = 0 ] || { echo "== a seat did not come back after its relaunch: just turbo-back" >&2; exit 6; }
echo "== seats back online ($(online)) $(( $(date +%s) - t0 )) s after the push $(date +%H:%M:%S)"
