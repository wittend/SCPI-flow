Model Context Protocol (MCP) Interface
========================================

SCPI-flow provides a built-in Model Context Protocol (MCP) server adapter that enables Large Language Models (LLMs), AI agents, and external automation tools to discover, load, configure, and control all instruments in the workspace over standard input/output (stdio).

Overview
--------

The MCP stdio server is implemented in ``src/mcp_cli.ts`` and ``src/mcp.ts``. It communicates with the SCPI-flow HTTP shell runtime (running at ``http://127.0.0.1:8000`` by default) and bridges MCP JSON-RPC tool calls directly to the isolated instrument subprocesses.

Supported Protocol Versions:
* ``2025-06-18``
* ``2025-03-26``
* ``2024-11-05``

MCP Client Configuration
------------------------

To connect an MCP client (such as Claude Desktop, Open-WebUI, or custom MCP clients), configure the stdio command:

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
           "/path/to/SCPI-flow/src/mcp_cli.ts",
           "--url",
           "http://127.0.0.1:8000"
         ]
       }
     }
   }

Available MCP Tools
-------------------

The server exposes eight core management and control tools:

1. ``list``: List all registered instruments, their manifest details, and running process status.
2. ``register``: Register an instrument plugin manifest from a local path (``path: "/path/to/instrument.json"``).
3. ``load``: Spawn and initialize an instrument process by ID (``id: "multimeter"``, ``"oscilloscope"``, ``"signal-generator"``, ``"power-supply"``).
4. ``unload``: Gracefully terminate a loaded instrument process.
5. ``state``: Read real-time telemetry, configuration, and state from a loaded instrument.
6. ``configure``: Apply JSON configuration settings to an instrument matching its manifest schema.
7. ``command``: Send a raw SCPI command string to an instrument and receive its response.
8. ``reset``: Reset an instrument's parameters and internal registers to default state.

Controlling Instruments via MCP
-------------------------------

All instruments in the suite adhere to the unified SCPI-flow plugin contract and can be fully controlled using MCP tools:

Digital Multimeter (``id: "multimeter"``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
* **Configure**: Set function (``DCV``, ``ACV``, ``RES``, ``FRES``, etc.) and measurement ranges.
* **Command**:
  * ``*IDN?`` -> Queries instrument identity.
  * ``CONF:VOLT:DC 10`` -> Configures DC voltage 10V range.
  * ``MEAS:VOLT:DC?`` -> Measures and returns DC voltage reading.
  * ``CALC:AVER:STAT ON`` -> Enables statistics calculation.

Oscilloscope (``id: "oscilloscope"``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
* **Configure**: Set timebase, channel vertical scale, generator inputs, and trigger parameters.
* **Command**:
  * ``*IDN?`` -> Queries scope identity.
  * ``C1:VDIV 1.0`` -> Sets Channel 1 vertical scale to 1V/div.
  * ``TDIV 0.001`` -> Sets timebase to 1ms/div.
  * ``MEAS:ALL?`` -> Queries all active channel measurements (Vpp, Vmax, Vmin, Freq, Period).
  * ``WAV:DATA?`` -> Retrieves acquired waveform data points.

Signal Generator (``id: "signal-generator"``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
* **Configure**: Set waveform type, frequency, peak amplitude, offset, and output enable.
* **Command**:
  * ``*IDN?`` -> Queries generator identity.
  * ``FREQ 1000`` -> Sets output frequency to 1 kHz.
  * ``VOLT 2.5`` -> Sets peak output voltage to 2.5V.
  * ``FUNC SINE`` -> Sets waveform shape to sine.
  * ``OUTP ON`` -> Enables waveform output.

Power Supply (``id: "power-supply"``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
* **Configure**: Set voltage setpoints, current limits, OVP/OCP thresholds, and 2W/4W sense mode.
* **Command**:
  * ``*IDN?`` -> Queries power supply identity.
  * ``VOLT 12.0`` -> Sets voltage setpoint to 12.0V.
  * ``CURR 2.0`` -> Sets current limit to 2.0A.
  * ``OUTP ON`` -> Enables DC power output.
  * ``MEAS:VOLT?`` -> Measures actual output voltage.
  * ``MEAS:CURR?`` -> Measures actual output current.
  * ``MEAS:POW?`` -> Measures actual output power.
  * ``OUTP:RESE:PROT`` -> Resets tripped OVP/OCP protections.

External MCP Flow Examples
--------------------------

For complete, runnable flow examples across TypeScript, Python, and Shell, refer to :doc:`mcp_flows` and the ``examples/mcp-flows/`` directory.
