#!/usr/bin/env python3
"""
Lightweight Python 3 Client for SCPI-flow MCP Interface over Stdio.

Handles JSON-RPC 2.0 frames, MCP session initialization, and typed tool calls.
"""

import json
import os
import subprocess
import sys
from typing import Any, Dict, List, Optional


class ScpiFlowMcpClient:
    """Python MCP client for orchestrating SCPI-flow instruments."""

    def __init__(self, mcp_cli_path: Optional[str] = None, shell_url: str = "http://127.0.0.1:8000"):
        if mcp_cli_path is None:
            # Default relative to this script
            current_dir = os.path.dirname(os.path.abspath(__file__))
            self.mcp_cli_path = os.path.abspath(os.path.join(current_dir, "../../../src/mcp_cli.ts"))
        else:
            self.mcp_cli_path = mcp_cli_path
        self.shell_url = shell_url
        self.process: Optional[subprocess.Popen] = None
        self._next_id = 1

    def connect(self) -> None:
        """Start the mcp_cli.ts process and perform MCP handshake."""
        cmd = [
            "deno",
            "run",
            "--no-config",
            "--allow-net=127.0.0.1:8000,localhost:8000",
            self.mcp_cli_path,
            "--url",
            self.shell_url,
        ]
        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=sys.stderr,
            text=True,
            bufsize=1,
        )

        # 1. Initialize
        init_req = {
            "jsonrpc": "2.0",
            "id": self._next_id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "python-mcp-flow", "version": "1.0.0"},
            },
        }
        self._next_id += 1
        resp = self._send_request(init_req)
        if "error" in resp:
            raise RuntimeError(f"MCP Initialize failed: {resp['error']}")

        # 2. Initialized notification
        init_notif = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
        self._send_notification(init_notif)

    def _send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.process or not self.process.stdin or not self.process.stdout:
            raise RuntimeError("MCP client is not connected")
        line = json.dumps(payload) + "\n"
        self.process.stdin.write(line)
        self.process.stdin.flush()

        out_line = self.process.stdout.readline()
        if not out_line:
            raise EOFError("MCP process closed stdout unexpectedly")
        return json.loads(out_line)

    def _send_notification(self, payload: Dict[str, Any]) -> None:
        if not self.process or not self.process.stdin:
            raise RuntimeError("MCP client is not connected")
        line = json.dumps(payload) + "\n"
        self.process.stdin.write(line)
        self.process.stdin.flush()

    def call_tool(self, name: str, arguments: Optional[dict] = None) -> Any:
        """Call an MCP tool on SCPI-flow and parse result content."""
        req_id = self._next_id
        self._next_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments or {},
            },
        }
        resp = self._send_request(payload)
        if "error" in resp:
            raise RuntimeError(f"MCP JSON-RPC Error: {resp['error']}")

        result = resp.get("result", {})
        if result.get("isError"):
            content = result.get("content", [{}])[0].get("text", "Unknown tool error")
            raise RuntimeError(f"MCP Tool error: {content}")

        content_list = result.get("content", [])
        if content_list:
            text = content_list[0].get("text", "")
            return json.loads(text) if text else None
        return None

    def list(self) -> Any:
        return self.call_tool("list")

    def register(self, path: str) -> Any:
        return self.call_tool("register", {"path": path})

    def load(self, instrument_id: str) -> Any:
        return self.call_tool("load", {"id": instrument_id})

    def unload(self, instrument_id: str) -> Any:
        return self.call_tool("unload", {"id": instrument_id})

    def state(self, instrument_id: str) -> Any:
        return self.call_tool("state", {"id": instrument_id})

    def configure(self, instrument_id: str, configuration: Dict[str, Any]) -> Any:
        return self.call_tool("configure", {"id": instrument_id, "configuration": configuration})

    def command(self, instrument_id: str, command_str: str) -> Any:
        return self.call_tool("command", {"id": instrument_id, "command": command_str})

    def reset(self, instrument_id: str) -> Any:
        return self.call_tool("reset", {"id": instrument_id})

    def close(self) -> None:
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                if self.process:
                    self.process.kill()
            self.process = None


if __name__ == "__main__":
    client = ScpiFlowMcpClient()
    try:
        client.connect()
        print("Connected to SCPI-flow MCP server.")
        print("Instruments:", client.list())
    finally:
        client.close()
