#!/bin/bash
# thuum: REA (morluto/rea) in the sky-re LXC (CT 701), offline, beside pyghidra-mcp; the re-analyst's
# default static RE route since 2026-10-18 (docs/LAB.md, docs/research/tools/rea-trial.md).
# Run inside the container as root; from the host:
#   pct push 701 /root/.ssh/authorized_keys /tmp/core-root-authorized_keys --perms 0600
#   pct exec 701 -- bash -s < install-rea-in-ct.sh
# Inputs, in order of preference:
#   /srv/persist/tools/rea/{node.tar.xz,rea-bundle.tar.xz,SHA256SUMS}: the persist dataset, so a rebuilt
#     or rolled-back sky-re gets REA back with no egress (the CT is dark);
#   /root/rea-in/{node.tar.xz,rea-bundle.tar.xz}: pushed in by hand.
#   node.tar.xz is node v22 linux-x64 from nodejs.org; rea-bundle.tar.xz is a node_modules/ tree holding
#   rea-agents and its dependencies (`npm install --os=linux --cpu=x64 rea-agents@<version>` on a machine
#   with egress, then tar of node_modules).
# The ssh route (the `rea` MCP server in .mcp.json, `just rea`): a system user `rea` with a locked
# password whose authorized_keys are the host's root principals, each under a forced command, so the key
# serves REA or runs its doctor and nothing else. Nothing here touches the Ghidra project under
# /srv/persist/ghidra, pyghidra-mcp and its unit, or the exe.
set -euo pipefail
if [ -f /srv/persist/tools/rea/SHA256SUMS ]; then
  IN=/srv/persist/tools/rea; (cd "$IN" && sha256sum -c --quiet SHA256SUMS) && echo "archives verified in $IN"
else
  IN=/root/rea-in
fi
test -f "$IN/node.tar.xz" && test -f "$IN/rea-bundle.tar.xz"
# Node 22 under /opt/node (its own tree; nothing on PATH changes)
rm -rf /opt/node && mkdir -p /opt/node
tar -xJf "$IN/node.tar.xz" -C /opt/node --strip-components=1
/opt/node/bin/node --version
# the rea package with its dependencies under /opt/rea
rm -rf /opt/rea && mkdir -p /opt/rea
tar -xJf "$IN/rea-bundle.tar.xz" -C /opt/rea
test -f /opt/rea/node_modules/rea-agents/package.json
REA_VERSION=$(/opt/node/bin/node -e 'console.log(require("/opt/rea/node_modules/rea-agents/package.json").version)')
ENTRY=$(ls /opt/rea/node_modules/rea-agents/scripts/rea.mjs 2>/dev/null || ls /opt/rea/node_modules/rea-agents/dist/cli*.mjs 2>/dev/null | head -1 || true)
test -n "$ENTRY"
# the user: a system account, locked password, home where REA keeps its state
getent passwd rea >/dev/null || useradd --system --no-create-home --home-dir /var/lib/rea --shell /bin/bash rea
install -d -m 750 -o rea -g rea /var/lib/rea
install -d -m 700 -o rea -g rea /var/lib/rea/.ssh
if [ -f /tmp/core-root-authorized_keys ]; then
  sed -E 's/^(ssh-[a-z0-9-]+ |ecdsa-[a-z0-9-]+ |sk-[a-z0-9@.-]+ )/restrict,command="\/usr\/local\/bin\/rea-mcp" \1/' \
    /tmp/core-root-authorized_keys > /var/lib/rea/.ssh/authorized_keys
  chown rea:rea /var/lib/rea/.ssh/authorized_keys && chmod 600 /var/lib/rea/.ssh/authorized_keys
  rm -f /tmp/core-root-authorized_keys
  echo "rea: $(grep -c . /var/lib/rea/.ssh/authorized_keys) keys, $(grep -vc '^restrict,command=' /var/lib/rea/.ssh/authorized_keys || true) unrestricted"
else
  echo "rea: no /tmp/core-root-authorized_keys pushed; authorized_keys left as they are"
fi
chown -R rea:rea /var/lib/rea
# the MCP server, stdio, the Ghidra provider only: the existing Ghidra 12.1.4 and Temurin 21, its own
# ephemeral analysis project, 4 GB for the headless JVM (the CT has 8 GB; one import at a time beside
# pyghidra-mcp's heap). REA_GHIDRA_STARTUP_TIMEOUT_MS covers import, analysis and the bridge: the 37 MB
# exe outlives the 330 s default (462 s measured).
cat > /usr/local/bin/rea-mcp <<WRAP
#!/bin/bash
# REA on sky-re: the MCP server over stdio (thuum docs/LAB.md). Over ssh with the forced command, the
# client's requested command arrives in SSH_ORIGINAL_COMMAND: "doctor" (optionally with --format json)
# runs REA's MCP doctor; anything else is refused; no command serves. Run directly, the arguments are
# passed to \`rea mcp\`.
export GHIDRA_INSTALL_DIR=/opt/ghidra
export JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64
export PATH=/opt/node/bin:\$JAVA_HOME/bin:/usr/local/bin:/usr/bin:/bin
export REA_PROVIDER=ghidra
export GHIDRA_HEADLESS_MAXMEM=4G
export REA_GHIDRA_STARTUP_TIMEOUT_MS=1800000
export REA_MCP_INPUT_SCHEMA_PROFILE=compact
export HOME=/var/lib/rea
export XDG_CACHE_HOME=/var/lib/rea/cache
export XDG_DATA_HOME=/var/lib/rea/data
export XDG_CONFIG_HOME=/var/lib/rea/config
# CommonLibSSE-NG's names for the fresh project (lab/tools/rea-seeds.py writes the file onto the dataset)
seeds=/srv/persist/tools/rea/seeds-1.6.1170.tsv
[ -r "\$seeds" ] && export REA_GHIDRA_SEED_FILE="\$seeds"
cd /var/lib/rea
case "\${SSH_ORIGINAL_COMMAND:-}" in
  "") set -- "\$@" ;;
  "doctor") set -- doctor ;;
  "doctor --format json") set -- doctor --format json ;;
  *) echo "rea-mcp: only the server and 'doctor' are offered over ssh" >&2; exit 64 ;;
esac
exec /opt/node/bin/node $ENTRY mcp "\$@"
WRAP
chmod 755 /usr/local/bin/rea-mcp
echo "installed rea-agents $REA_VERSION, entry $ENTRY"
# smoke: REA's own MCP doctor as the rea user (initialize, the tool inventory, one target-free request; no import)
su -s /bin/bash rea -c '/usr/local/bin/rea-mcp doctor --format json' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("doctor as rea:", "healthy" if d.get("healthy") else "UNHEALTHY", d["server"]["version"], d["inventory"]["tools"]["observed"], "tools")'
