#!/bin/bash
# thuum: REA (morluto/rea) in the sky-re LXC, offline, beside pyghidra-mcp.
# Run inside the container as root with the two archives in /root/rea-in/:
#   node.tar.xz (node v22 linux-x64), rea-bundle.tar.xz (node_modules with
#   rea-agents and its dependencies, built on the Mac with --os=linux --cpu=x64).
# Nothing here touches the Ghidra project under /srv/persist/ghidra or the exe.
set -euo pipefail
IN=/root/rea-in
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
# the MCP server, stdio, the Ghidra provider only (docs/installation.md and
# docs/client-configuration.md): the existing Ghidra 12.1.4 and Temurin 21,
# its own analysis database under /var/lib/rea (the same dataset as
# /srv/persist is read-only here), 4 GB for the headless JVM (the
# CT has 8 GB; pyghidra-mcp's JVM is capped at 5 GB and idles between reads)
mkdir -p /var/lib/rea
cat > /usr/local/bin/rea-mcp <<WRAP
#!/bin/bash
export GHIDRA_INSTALL_DIR=/opt/ghidra
export JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64
export PATH=/opt/node/bin:\$JAVA_HOME/bin:\$PATH
export REA_PROVIDER=ghidra
export GHIDRA_HEADLESS_MAXMEM=4G
export REA_MCP_INPUT_SCHEMA_PROFILE=compact
export HOME=/var/lib/rea
export XDG_CACHE_HOME=/var/lib/rea/cache
export XDG_DATA_HOME=/var/lib/rea/data
export XDG_CONFIG_HOME=/var/lib/rea/config
cd /var/lib/rea
exec /opt/node/bin/node $ENTRY mcp "\$@"
WRAP
chmod +x /usr/local/bin/rea-mcp
echo "installed rea-agents $REA_VERSION, entry $ENTRY"
# smoke: an MCP initialize over stdio must answer with the server's name
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"thuum-smoke","version":"0"}}}' \
  | timeout 60 /usr/local/bin/rea-mcp 2>/tmp/rea-smoke.err | head -c 600 || true
echo; echo "--- stderr head:"; head -c 400 /tmp/rea-smoke.err || true
