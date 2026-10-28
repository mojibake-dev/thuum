#!/usr/bin/env bash
# client-hot.sh <c1|c2> <file|fork-ref> (ADR-054 item 1): a skymp5-client.js laid into ONE seat's running game with no
# relaunch. Skyrim Platform reloads a plugin 8 ms after a last-write change under Data\Platform\Plugins
# (DirectoryMonitor.cpp), and since ADR-041's storageProxy fix a reloaded client keeps its world model and its
# connection: measured 2026-10-28 07:27Z on c2, the server's record followed a turn (rot 180 to 0) and a walk (531
# units) after the reload as it did before it (the 2026-10-19 red predates the fix).
# 1. A file argument is laid as it is (a fork worktree's webpack build, build/dist/client/Data/Platform/Plugins/
#    skymp5-client.js); anything else is a fork ref, built on this Mac by turbo-client-build.sh.
# 2. It travels over the in-VLAN hop (turbo-client's: scp to sky-srv, a throwaway http.server, Invoke-WebRequest),
#    its SHA256 checked inside the guest.
# 3. The plugin it replaces in the running game's folder (game-dir.txt) is kept under C:\sky-lab\turbo\<stamp>\ with
#    its path beside it, so `just turbo-back` puts it back; the new bytes are written in place (WriteAllBytes, a
#    last-write change: ReplaceFile, turbo-client's swap, never triggers the reload).
# 4. The reload is proven by a new "Found settings file ... for plugin skymp5-client" line in skyrim-platform.log
#    (SkyrimPlatform.cpp's LoadFiles) within 20 s, read with a shared read; none is a failure, the file stays laid.
# 5. C:\sky-lab\hot.txt marks the seat (a rollback clears it with the rest of the clone); /srv/lab/turbo.log gets
#    "<UTC> hot <stamp> <vmid> <sha8>".
set -euo pipefail
client=${1:?c1 or c2}; what=${2:?a skymp5-client.js file or a fork ref}
case "$client" in c1) vmid=711;; c2) vmid=712;; *) echo "c1 or c2" >&2; exit 2;; esac
here=$(cd "$(dirname "$0")/../.." && pwd)
jump=${JUMP_HOST:-root@core.gaussing.tv}
srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${HOT_PORT:-8767}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() {  # run <powershell>: the guest's output; an answer that is no JSON is asked again (turbo-client's rule)
  local out try
  for try in 1 2 3; do
    out=$(ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 120 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" || true)
    printf '%s' "$out" | python3 -c 'import sys,json; json.load(sys.stdin, strict=False)' 2>/dev/null && break
    sleep 5
  done
  printf '%s' "$out" | python3 -c 'import sys,json; d=json.load(sys.stdin, strict=False); print((d.get("out-data") or d.get("err-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'
}
spl='C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE\skyrim-platform.log'
reloads() { run "\$s = [IO.File]::Open('$spl', 'Open', 'Read', 'ReadWrite'); \$r = New-Object IO.StreamReader(\$s); \$t = \$r.ReadToEnd(); \$s.Close(); ([regex]::Matches(\$t, 'Found settings file .* for plugin skymp5-client')).Count"; }
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "== a lab run is active ($active): a hot push waits for it (its rollback would undo the file)" >&2; exit 3; }
if [ -f "$what" ]; then
  bundle=$what; sha8=$(shasum -a 256 "$bundle" | cut -c1-8)
else
  bundle=$("$here/lab/tools/turbo-client-build.sh" "$what" | tail -1)
  sha8=$(git -C "$here/lab/.cache/turbo-fork" rev-parse --short=8 HEAD)
fi
want=$(shasum -a 256 "$bundle" | awk '{print $1}')
stamp=$(date -u +%Y%m%dT%H%M%SZ)
t0=$(date +%s)
echo "== client-hot $client ($vmid) ${sha8} $(( $(wc -c < "$bundle") / 1024 )) KiB $(date +%H:%M:%S)"
n0=$(reloads) || { echo "== $client: skyrim-platform.log unread" >&2; exit 4; }
ssh -o BatchMode=yes -J "$jump" "$srv" 'mkdir -p /srv/lab/handover'
scp -q -o BatchMode=yes -J "$jump" "$bundle" "$srv:/srv/lab/handover/hot-$stamp.js"
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/lab/handover && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > .hot-http.pid)"
trap 'ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.hot-http.pid) 2>/dev/null; rm -f /srv/lab/handover/hot-$stamp.js /srv/lab/handover/.hot-http.pid" >/dev/null 2>&1 || true' EXIT
sleep 1
got=$(run "\$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'http://$srv_ip:$port/hot-$stamp.js' -OutFile 'C:\\sky-lab\\hot-incoming.js'; (Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\hot-incoming.js').Hash.ToLower()" | tail -1 | tr -d '\r')
[ "$got" = "$want" ] || { echo "== $client: the bundle arrived as ${got:-nothing}, not $want" >&2; exit 5; }
laid=$(run "\$g = (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim(); \$dst = Join-Path \$g 'Data\\Platform\\Plugins\\skymp5-client.js'
\$k = 'C:\\sky-lab\\turbo\\$stamp'; New-Item -ItemType Directory -Force -Path \$k | Out-Null
if (Test-Path \$dst) { Copy-Item \$dst (Join-Path \$k '1.js') -Force; Set-Content (Join-Path \$k '1.js.path') \$dst -NoNewline }
[IO.File]::WriteAllBytes(\$dst, [IO.File]::ReadAllBytes('C:\\sky-lab\\hot-incoming.js'))
Set-Content 'C:\\sky-lab\\hot.txt' ('$stamp $sha8 ' + \$dst) -NoNewline
'laid into ' + \$g") || { echo "== $client: $laid" >&2; exit 6; }
echo "   $laid"
ssh -o BatchMode=yes -J "$jump" "$srv" "echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) hot $stamp $vmid $sha8\" >> /srv/lab/turbo.log"
n1=$n0
for _ in $(seq 1 10); do sleep 2; n1=$(reloads || echo "$n0"); [ "$n1" -gt "$n0" ] 2>/dev/null && break; done
if [ "$n1" -gt "$n0" ] 2>/dev/null; then
  echo "== reloaded on $client $(( $(date +%s) - t0 )) s after the push (skyrim-platform.log's load lines $n0 -> $n1; turbo-back $stamp undoes it)"
else
  echo "== $client shows no reload in 20 s (load lines still $n0): the file is laid; read the seat's log, or relaunch it" >&2; exit 7
fi
