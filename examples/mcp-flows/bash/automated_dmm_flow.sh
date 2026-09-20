#!/usr/bin/env bash
#
# Automated DMM Flow in Bash using SCPI-flow MCP stdio and jq.
#
set -euo pipefail

CLI_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/src/mcp_cli.ts"
URL="${1:-http://127.0.0.1:8000}"

echo "=== SCPI-flow Automated DMM Flow in Bash ==="

# Helper to send a request and read a response line
send_flow() {
  cat <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"bash-dmm-flow","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"load","arguments":{"id":"multimeter"}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"command","arguments":{"id":"multimeter","command":"*IDN?"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"command","arguments":{"id":"multimeter","command":"CONF:VOLT:DC 10"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"command","arguments":{"id":"multimeter","command":"MEAS:VOLT:DC?"}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"command","arguments":{"id":"multimeter","command":"CONF:VOLT:AC 10"}}}
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"command","arguments":{"id":"multimeter","command":"CALC:AVER:STAT ON"}}}
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"command","arguments":{"id":"multimeter","command":"MEAS:VOLT:AC?"}}}
{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"state","arguments":{"id":"multimeter"}}}
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"reset","arguments":{"id":"multimeter"}}}
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"unload","arguments":{"id":"multimeter"}}}
EOF
}

send_flow | deno run --no-config --allow-net=127.0.0.1:8000,localhost:8000 "$CLI_PATH" --url "$URL"
