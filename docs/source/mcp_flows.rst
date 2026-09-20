External MCP Flows & Automation
================================

SCPI-flow provides a standard Model Context Protocol (MCP) interface enabling Large Language Models (LLMs), AI coding agents, external automation runners, Python scripts, and test benches to discover, configure, and orchestrate virtual and hardware instruments over JSON-RPC 2.0 stdio or HTTP.

Architecture
------------

.. code-block:: text

   +----------------------------------------------------------------------+
   |                     External MCP Automation Client                   |
   |  (TypeScript Runner / Python Automation / AI Agent / Shell Pipeline) |
   +----------------------------------------------------------------------+
                                      │
                  JSON-RPC 2.0 over Stdio (or HTTP REST)
                                      ▼
   +----------------------------------------------------------------------+
   |                       SCPI-flow MCP Server Adapter                   |
   |                            (src/mcp_cli.ts)                          |
   |   Tools: list, register, load, unload, state, configure, command, reset|
   +----------------------------------------------------------------------+
                                      │
                            Shell / Instrument API
                                      ▼
   +---------------------+  +---------------------+  +---------------------+
   |  Signal Generator   |  |     Oscilloscope    |  |  Digital Multimeter |
   | (Sine, Square, etc) |  | (Waveform, Trigger) |  | (DCV, ACV, RES, etc)|
   +---------------------+  +---------------------+  +---------------------+

Available Examples
------------------

The repository includes a comprehensive set of example external MCP flows located in ``examples/mcp-flows/``:

1. **TypeScript / Deno Flows** (``examples/mcp-flows/typescript/``)
   * ``automated_test_flow.ts``: Programmatic multi-instrument automated sweep flow. Connects over stdio, initializes MCP session, loads instruments, executes frequency sweep, queries telemetry, and asserts pass/fail conditions.
   * ``declarative_flow_runner.ts``: Generic workflow engine that parses declarative JSON flow specifications and executes them step-by-step against MCP tools.
   * ``interactive_agent_flow.ts``: Autonomous AI agent control loop that inspects oscilloscope telemetry, diagnoses signal clipping, and applies corrective vertical scaling automatically.
   * ``mcp_client.ts``: Reusable, typed TypeScript MCP client for SCPI-flow.

2. **Python Flows** (``examples/mcp-flows/python/``)
   * ``mcp_client.py``: Dependency-free Python 3 MCP client implementing the JSON-RPC 2.0 handshake and tool execution protocol.
   * ``automated_sweep_flow.py``: Automated frequency sweep script querying oscilloscope measurements (``MEAS:ALL?``) and logging telemetry.

3. **Unix Shell Pipelines** (``examples/mcp-flows/bash/``)
   * ``quick_health_check.sh``: Rapid instrument discovery, loading, identification (``*IDN?``), and teardown.
   * ``automated_dmm_flow.sh``: Automated multimeter measurement sequence piping JSON-RPC lines into ``mcp_cli.ts``.

4. **Declarative Flow Schemas** (``examples/mcp-flows/flows/``)
   * ``frequency_response_sweep.json``: Frequency response characterization workflow.
   * ``multi_instrument_coordination.json``: Multi-instrument coordination testing waveform generation, triggering, and DMM readings.
   * ``dmm_voltage_characterization.json``: DMM function switching, statistics calculation, and resistance measurement.

Running the Examples
--------------------

TypeScript Automated Test Flow:

.. code-block:: bash

   deno run --allow-all examples/mcp-flows/typescript/automated_test_flow.ts

Declarative JSON Flow Runner:

.. code-block:: bash

   deno run --allow-all examples/mcp-flows/typescript/declarative_flow_runner.ts \
       examples/mcp-flows/flows/frequency_response_sweep.json

Python Automation Flow:

.. code-block:: bash

   python3 examples/mcp-flows/python/automated_sweep_flow.py

Shell Health Check:

.. code-block:: bash

   bash examples/mcp-flows/bash/quick_health_check.sh
