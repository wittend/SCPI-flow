# SCPI-flow External MCP Flows

This directory contains complete, runnable examples demonstrating **External
Model Context Protocol (MCP) Flows** for the SCPI-flow instrument automation
suite.

## Overview

SCPI-flow provides a standard **Model Context Protocol (MCP)** interface over
standard I/O (`src/mcp_cli.ts`) and HTTP (`/api/instruments/*`). This allows
external Large Language Models (LLMs), AI coding agents, Python/TypeScript
scripts, and CI/CD automated test runners to orchestrate virtual and hardware
instruments seamlessly.

```
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
```

## Available Examples

### 1. TypeScript / Deno Flows (`typescript/`)

- **`automated_test_flow.ts`**: Complete programmatic MCP flow that spawns
  `src/mcp_cli.ts`, performs MCP handshake (`initialize`), discovers tools,
  configures a Signal Generator, measures with an Oscilloscope and Multimeter,
  verifies signal integrity, and produces a structured test report.
- **`declarative_flow_runner.ts`**: A flexible workflow engine that reads
  declarative JSON flow definitions (`flows/*.json`) and executes them
  step-by-step against the MCP server with assertion verification.
- **`interactive_agent_flow.ts`**: Demonstrates an AI-agent loop that inspects
  instrument state, diagnoses configuration anomalies, and applies corrective
  SCPI commands dynamically.

### 2. Python Flows (`python/`)

- **`mcp_client.py`**: Lightweight, dependency-free Python 3 client implementing
  the JSON-RPC 2.0 / MCP stdio protocol for SCPI-flow.
- **`automated_sweep_flow.py`**: End-to-end Python test flow executing a
  multi-point frequency and amplitude sweep, collecting measurement telemetry
  from oscilloscope and multimeter channels.

### 3. Unix Shell & JSON-RPC Pipelines (`bash/`)

- **`automated_dmm_flow.sh`**: Pure Bash script piping raw JSON-RPC 2.0 requests
  to `src/mcp_cli.ts` using `jq` for parsing.
- **`quick_health_check.sh`**: Rapid instrument discovery, loading, identity
  verification (`*IDN?`), and state inspection.

### 4. Declarative Flow Definitions (`flows/`)

- **`frequency_response_sweep.json`**: Declarative flow definition specifying
  instrument setup, frequency sweep steps, expected measurement thresholds, and
  teardown.
- **`multi_instrument_coordination.json`**: Coordinated multi-instrument
  functional verification sequence.
- **`dmm_voltage_characterization.json`**: DMM range switching and limit testing
  workflow.

---

## Quick Start

### Running TypeScript Flows

To run the automated multi-instrument flow with Deno:

```bash
# Start the SCPI-flow shell in the background (or run directly with mcp_cli)
deno run --allow-all examples/mcp-flows/typescript/automated_test_flow.ts
```

To run a declarative JSON flow:

```bash
deno run --allow-all examples/mcp-flows/typescript/declarative_flow_runner.ts examples/mcp-flows/flows/frequency_response_sweep.json
```

### Running Python Flows

```bash
python3 examples/mcp-flows/python/automated_sweep_flow.py
```

### Running Shell Flows

```bash
bash examples/mcp-flows/bash/quick_health_check.sh
bash examples/mcp-flows/bash/automated_dmm_flow.sh
```

---

## MCP Tools Reference

The external flow communicates using the following MCP tools:

| Tool Name   | Parameters                          | Description                                           |
| ----------- | ----------------------------------- | ----------------------------------------------------- |
| `list`      | _none_                              | Discovers all registered instruments and their status |
| `register`  | `path: string`                      | Registers a new instrument manifest file              |
| `load`      | `id: string`                        | Spawns and initializes an instrument process          |
| `unload`    | `id: string`                        | Gracefully stops an instrument process                |
| `state`     | `id: string`                        | Reads current telemetry and state from an instrument  |
| `configure` | `id: string, configuration: object` | Applies JSON configuration properties                 |
| `command`   | `id: string, command: string`       | Sends raw SCPI command string to instrument           |
| `reset`     | `id: string`                        | Resets instrument registers and settings to defaults  |
