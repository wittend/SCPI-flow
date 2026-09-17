Architecture
============

The architecture of **SCPI-mmeter** is designed around a modular, decoupled engine that separates physical circuit simulation, state management, SCPI command decoding, and user presentation.

Component Diagram
-----------------

- **Core Multimeter Simulation (`src/multimeter.ts`)**:
  - Implements the mathematical and physical models of measurement functions.
  - Manages auto-ranging, NPLC integration times, moving average filters, dual display channels, statistics buffers, limit evaluations, and reading FIFO buffers.
- **SCPI Parser Engine (`src/scpi_engine.ts`)**:
  - Standard IEEE 488.2 mandatory registers: Status Byte (STB), Event Status Register (ESR), Event Status Enable (ESE), Service Request Enable (SRE).
  - Error Queue FIFO (32 entries) with standard SCPI error codes.
  - Subsystems: `CONFigure`, `MEASure`, `SENSe`, `CALCulate`, `DATA`, `TRIGger`, `SAMPle`, `SYSTem`, and `DISPlay`.
- **SCPI & MCP Bridge (`scpi_bridge.ts`)**:
  - Routes requests between client interfaces and the internal TypeScript simulation engine or an optional external Python PyVISA daemon.
- **HTTP & WebSocket Server (`main.ts`)**:
  - Built on `Deno.serve` and `@std/http/file-server`.
  - Exposes RESTful endpoints (`/api/dmm/*`, `/api/scpi/*`) and serves the offline GUI.
- **Interactive Terminal CLI (`src/cli.ts`)**:
  - Full-screen ANSI terminal renderer with interactive key bindings and command prompt.
