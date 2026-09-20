MCP Integration Strategies & Examples
=======================================

This guide provides practical code examples and architecture patterns for interacting with SCPI-flow using different integration strategies:

1. **Python via MCP Stdio** (Dependency-free Python 3 JSON-RPC 2.0 client)
2. **REST API via curl** (Direct HTTP tool and instrument control)
3. **JavaScript / TypeScript** (Deno & Node.js stdio and HTTP clients)
4. **Agentic AI Contexts (PI & Hermes Agents)** (LLM function calling, auto-calibration loops, and prompt configurations)

Overview of Integration Modes
-----------------------------

SCPI-flow offers two equivalent interfaces for automation:

* **MCP over Stdio (JSON-RPC 2.0)**: Ideal for AI agent harnesses (Claude Desktop, Open-WebUI, Hermes Agent, Pi Agent) and local CLI test runners. Provided by ``src/mcp_cli.ts``.
* **HTTP REST API**: Ideal for ``curl`` scripts, web dashboards, CI/CD runners, and remote microservices. Provided by the SCPI-flow shell at ``http://127.0.0.1:8000``.

Both interfaces control the exact same live instrument processes running in the workspace.

---

1. Strategy: MCP via Python
---------------------------

The Python MCP client uses the standard library (``subprocess``, ``json``) to launch the MCP stdio adapter, perform the MCP protocol handshake, and execute tool calls.

Python Stdio Client Implementation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: python

   #!/usr/bin/env python3
   """
   Lightweight Python 3 MCP Client for SCPI-flow.
   """
   import json
   import subprocess
   import sys
   from typing import Any, Dict, Optional

   class ScpiFlowClient:
       def __init__(self, mcp_cli_path: str = "src/mcp_cli.ts", url: str = "http://127.0.0.1:8000"):
           self.mcp_cli_path = mcp_cli_path
           self.url = url
           self.process: Optional[subprocess.Popen] = None
           self._req_id = 1

       def connect(self) -> None:
           """Spawn stdio process and complete MCP initialization."""
           self.process = subprocess.Popen(
               ["deno", "run", "--no-config", "--allow-net=127.0.0.1:8000", self.mcp_cli_path, "--url", self.url],
               stdin=subprocess.PIPE,
               stdout=subprocess.PIPE,
               stderr=sys.stderr,
               text=True,
               bufsize=1,
           )
           # 1. Initialize MCP handshake
           init_resp = self._request("initialize", {
               "protocolVersion": "2025-06-18",
               "capabilities": {},
               "clientInfo": {"name": "python-scpi-flow", "version": "1.0.0"}
           })
           # 2. Initialized notification
           self._notify("notifications/initialized")

       def _request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
           req_id = self._req_id
           self._req_id += 1
           payload = {"jsonrpc": "2.0", "id": req_id, "method": method}
           if params is not None:
               payload["params"] = params
           self.process.stdin.write(json.dumps(payload) + "\n")
           self.process.stdin.flush()
           line = self.process.stdout.readline()
           return json.loads(line)

       def _notify(self, method: str, params: Optional[Dict[str, Any]] = None) -> None:
           payload = {"jsonrpc": "2.0", "method": method, "params": params or {}}
           self.process.stdin.write(json.dumps(payload) + "\n")
           self.process.stdin.flush()

       def call_tool(self, name: str, args: Optional[Dict[str, Any]] = None) -> Any:
           resp = self._request("tools/call", {"name": name, "arguments": args or {}})
           if "error" in resp:
               raise RuntimeError(f"MCP error: {resp['error']}")
           res = resp.get("result", {})
           if res.get("isError"):
               raise RuntimeError(f"Tool error: {res.get('content', [{}])[0].get('text')}")
           content = res.get("content", [{}])[0].get("text")
           return json.loads(content) if content else None

       def close(self) -> None:
           if self.process:
               self.process.terminate()
               self.process.wait(timeout=2)
               self.process = None

Example: Automated Signal Sweep in Python
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: python

   # Example usage:
   client = ScpiFlowClient()
   try:
       client.connect()
       print("Catalog:", client.call_tool("list"))

       # Load instruments
       client.call_tool("load", {"id": "signal-generator"})
       client.call_tool("load", {"id": "oscilloscope"})

       # Configure Signal Generator: 5 kHz, 3.0 Vpp Sine
       client.call_tool("configure", {
           "id": "signal-generator",
           "configuration": {
               "waveform": "sine",
               "frequency": 5000,
               "amplitude": 3.0,
               "output": True
           }
       })

       # Adjust Scope Timebase and Vertical Range via SCPI
       client.call_tool("command", {"id": "oscilloscope", "command": "C1:VDIV 1.0"})
       client.call_tool("command", {"id": "oscilloscope", "command": "TDIV 0.0001"})

       # Read scope measurements
       measurements = client.call_tool("command", {"id": "oscilloscope", "command": "MEAS:ALL?"})
       print("Oscilloscope Readings:", measurements)

   finally:
       client.call_tool("unload", {"id": "signal-generator"})
       client.call_tool("unload", {"id": "oscilloscope"})
       client.close()

---

2. Strategy: MCP via curl (HTTP REST)
-------------------------------------

For quick shell testing, CI/CD scripts, or remote integration, the SCPI-flow HTTP shell exposes REST endpoints directly.

1. List Catalog and Active State
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   curl -s -X GET http://127.0.0.1:8000/api/instruments | jq .

2. Load an Instrument
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   # Load Signal Generator
   curl -s -X POST http://127.0.0.1:8000/api/instruments/signal-generator/load | jq .

   # Load Oscilloscope
   curl -s -X POST http://127.0.0.1:8000/api/instruments/oscilloscope/load | jq .

   # Load Multimeter
   curl -s -X POST http://127.0.0.1:8000/api/instruments/multimeter/load | jq .

3. Configure Instrument Parameters
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   # Configure Signal Generator with JSON payload
   curl -s -X POST http://127.0.0.1:8000/api/instruments/signal-generator/configure \
     -H "Content-Type: application/json" \
     -d '{
       "configuration": {
         "waveform": "sine",
         "frequency": 2500,
         "amplitude": 4.0,
         "offset": 0.0,
         "output": true
       }
     }' | jq .

4. Execute Raw SCPI Commands
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   # Query instrument identity (*IDN?)
   curl -s -X POST http://127.0.0.1:8000/api/instruments/oscilloscope/command \
     -H "Content-Type: application/json" \
     -d '{"command": "*IDN?"}'

   # Set Oscilloscope Channel 1 scale
   curl -s -X POST http://127.0.0.1:8000/api/instruments/oscilloscope/command \
     -H "Content-Type: application/json" \
     -d '{"command": "C1:VDIV 1.0"}'

   # Query DMM Voltage measurement
   curl -s -X POST http://127.0.0.1:8000/api/instruments/multimeter/command \
     -H "Content-Type: application/json" \
     -d '{"command": "MEAS:VOLT:DC?"}'

5. Retrieve Real-Time State & Telemetry
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   curl -s -X GET http://127.0.0.1:8000/api/instruments/oscilloscope/state | jq .

6. Unload Instruments
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   curl -s -X POST http://127.0.0.1:8000/api/instruments/signal-generator/unload
   curl -s -X POST http://127.0.0.1:8000/api/instruments/oscilloscope/unload

---

3. Strategy: MCP via JavaScript / TypeScript
--------------------------------------------

Using Deno or Node.js (with ``fetch`` or child process stdio), you can interact programmatically with high typing fidelity.

TypeScript HTTP Client Example
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: typescript

   // client.ts - Run with `deno run --allow-net client.ts` or Node 18+
   export class ScpiFlowHttpClient {
     constructor(private baseUrl: string = "http://127.0.0.1:8000") {}

     private async post(path: string, body?: unknown) {
       const res = await fetch(`${this.baseUrl}${path}`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: body ? JSON.stringify(body) : undefined,
       });
       if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
       return await res.json();
     }

     async list() {
       const res = await fetch(`${this.baseUrl}/api/instruments`);
       return await res.json();
     }

     async load(id: string) {
       return await this.post(`/api/instruments/${id}/load`);
     }

     async unload(id: string) {
       return await this.post(`/api/instruments/${id}/unload`);
     }

     async configure(id: string, configuration: Record<string, unknown>) {
       return await this.post(`/api/instruments/${id}/configure`, { configuration });
     }

     async command(id: string, command: string) {
       return await this.post(`/api/instruments/${id}/command`, { command });
     }

     async state(id: string) {
       const res = await fetch(`${this.baseUrl}/api/instruments/${id}/state`);
       return await res.json();
     }
   }

   // Workflow demonstration:
   async function main() {
     const client = new ScpiFlowHttpClient();
     console.log("Instruments:", await client.list());

     await client.load("multimeter");
     await client.command("multimeter", "CONF:VOLT:DC 10");
     const reading = await client.command("multimeter", "MEAS:VOLT:DC?");
     console.log("DMM Reading:", reading);
     await client.unload("multimeter");
   }

   if (import.meta.main) main();

---

4. Strategy: MCP in Agentic Contexts (PI & Hermes)
--------------------------------------------------

AI coding agents and autonomous diagnostic agents (such as **Pi Agent**, **Nous Hermes**, **Claude Code**, or OpenAI function-calling models) can discover and operate test bench instruments dynamically.

Agent Tool Calling Architecture
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The SCPI-flow MCP server exposes standard tool definitions matching the OpenAI / Hermes tool specifications:

.. code-block:: json

   [
     {
       "type": "function",
       "function": {
         "name": "load",
         "description": "Spawn and initialize an instrument process (e.g. 'oscilloscope', 'signal-generator', 'multimeter')",
         "parameters": {
           "type": "object",
           "properties": {
             "id": { "type": "string", "description": "The instrument ID" }
           },
           "required": ["id"]
         }
       }
     },
     {
       "type": "function",
       "function": {
         "name": "command",
         "description": "Send a raw SCPI command string to an instrument and receive its response",
         "parameters": {
           "type": "object",
           "properties": {
             "id": { "type": "string", "description": "The target instrument ID" },
             "command": { "type": "string", "description": "SCPI command string (e.g. '*IDN?', 'FREQ 1000', 'MEAS:ALL?')" }
           },
           "required": ["id", "command"]
         }
       }
     },
     {
       "type": "function",
       "function": {
         "name": "configure",
         "description": "Apply JSON configuration settings to an instrument",
         "parameters": {
           "type": "object",
           "properties": {
             "id": { "type": "string", "description": "The target instrument ID" },
             "configuration": { "type": "object", "description": "Configuration matching manifest schema" }
           },
           "required": ["id", "configuration"]
         }
       }
     },
     {
       "type": "function",
       "function": {
         "name": "state",
         "description": "Read real-time telemetry and state from an instrument",
         "parameters": {
           "type": "object",
           "properties": {
             "id": { "type": "string", "description": "The target instrument ID" }
           },
           "required": ["id"]
         }
       }
     }
   ]

Configuring Hermes Agent / Pi Agent MCP Stdio Settings
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

In your agent framework configuration (e.g. ``mcp_servers.json`` or agent environment settings):

.. code-block:: json

   {
     "mcpServers": {
       "scpi-flow": {
         "command": "deno",
         "args": [
           "run",
           "--no-config",
           "--no-lock",
           "--allow-net=127.0.0.1:8000",
           "/absolute/path/to/SCPI-flow/src/mcp_cli.ts",
           "--url",
           "http://127.0.0.1:8000"
         ]
       }
     }
   }

Autonomous Diagnostic Agent Example (Python with Hermes / Pi)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Below is a complete autonomous agentic loop demonstrating how an LLM agent uses reasoning steps and tool execution to diagnose clipping and auto-calibrate an oscilloscope:

.. code-block:: python

   #!/usr/bin/env python3
   """
   Agentic Loop with Hermes / Pi Tool Invocation Pattern.
   """
   from examples.mcp_flows.python.mcp_client import ScpiFlowMcpClient

   def run_hermes_agent_flow():
       client = ScpiFlowMcpClient()
       client.connect()
       print("[Hermes Agent]: Initialized MCP bridge to SCPI-flow.")

       try:
           # Step 1: Agent observes available laboratory hardware
           instruments = client.list()
           print(f"[Hermes Agent]: Discovered instruments: {list(instruments.keys())}")

           # Step 2: Agent establishes signal generation setup
           print("[Hermes Agent Plan]: Setup a 10 kHz 6.0 Vpp Sine wave and capture on Scope Channel 1.")
           client.load("signal-generator")
           client.load("oscilloscope")

           client.configure("signal-generator", {
               "waveform": "sine",
               "frequency": 10000,
               "amplitude": 6.0,
               "output": True
           })

           # Step 3: Initial oscilloscope state has small vertical range (0.2 V/div = 1.6V screen)
           client.command("oscilloscope", "C1:VDIV 0.2")
           client.command("oscilloscope", "TDIV 0.00005")

           # Step 4: Query telemetry
           meas = client.command("oscilloscope", "MEAS:ALL?")
           print(f"[Hermes Agent Observation]: Initial measurement: {meas}")

           # Step 5: Autonomous Reasoning & Corrective Action
           # Agent Logic:
           # Peak-to-peak voltage is 6.0V. An 8-division vertical grid requires:
           # Minimum V/div = 6.0V / 8 divs = 0.75 V/div -> round up to 1.0 V/div.
           print("[Hermes Agent Reasoning]: Signal amplitude exceeds display range (clipping detected).")
           print("[Hermes Agent Action]: Setting Channel 1 to 1.0 V/div and Timebase to 20 us/div.")

           client.command("oscilloscope", "C1:VDIV 1.0")
           client.command("oscilloscope", "TDIV 0.00002")

           # Step 6: Verify calibrated output
           calibrated_meas = client.command("oscilloscope", "MEAS:ALL?")
           print(f"[Hermes Agent Verification]: Calibrated measurements: {calibrated_meas}")
           print("✓ Agent goal achieved: Waveform cleanly captured without distortion.")

       finally:
           client.unload("signal-generator")
           client.unload("oscilloscope")
           client.close()

   if __name__ == "__main__":
       run_hermes_agent_flow()

Summary of Best Practices for Agent Integration
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* **Explicit Teardown**: Always call ``unload`` when testing concludes to free subprocess system resources.
* **Format Resilience**: SCPI commands may return raw strings or JSON-wrapped objects depending on the instrument adapter; agents should handle both string parsing and dictionary inspection.
* **Loopback Security**: Ensure the agent and SCPI-flow run on loopback (``127.0.0.1``) to prevent exposing unauthenticated instrument controls to the public network.
