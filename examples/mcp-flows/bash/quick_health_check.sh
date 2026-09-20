#!/usr/bin/env bash
#
# Quick Instrument Health Check via SCPI-flow MCP JSON-RPC Stdio.
#
set -euo pipefail

CLI_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/src/mcp_cli.ts"
URL="${1:-http://127.0.0.1:8000}"

echo "=== SCPI-flow Quick Health Check over MCP stdio ==="

# Pipe JSON-RPC commands into mcp_cli.ts
{
  # 1. Handshake: initialize
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"bash-mcp-health","version":"1.0.0"}}}'

  # 2. Handshake: initialized
  echo '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

  # 3. List tools
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

  # 4. List instruments
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list","arguments":{}}}'

  # 5. Load Multimeter
  echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"load","arguments":{"id":"multimeter"}}}'

  # 6. Query Multimeter IDN
  echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"command","arguments":{"id":"multimeter","command":"*IDN?"}}}'

  # 7. Unload Multimeter
  echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"unload","arguments":{"id":"multimeter"}}}'
} | deno run --no-config --allow-net=127.0.0.1:8000,localhost:8000 "$CLI_PATH" --url "$URL"
