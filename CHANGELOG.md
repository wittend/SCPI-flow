# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added three new built-in default instruments for data streaming, ingestion,
  and output:
  - **Data Source (`data-source`)**: Origin instrument supporting JSONL file
    playback with cadence control, asynchronous WebSocket client streams, and
    MQTT 3.1.1 broker subscriptions and notifications.
  - **Raw Data Sink (`raw-data-sink`)**: Data destination instrument for
    streaming raw payloads to WebSocket endpoints or continuous file
    appending/writing.
  - **Formatted Data Sink (`formatted-data-sink`)**: Structured telemetry sink
    writing formatted JSON/JSONL records to disk (with automated timestamping
    and indentation options) and publishing messages to MQTT topics.
- Added comprehensive documentation in Sphinx
  (`docs/source/data_sources_sinks.rst`) and declarative MCP example flow
  (`examples/mcp-flows/flows/data_source_sink_flow.json`).
- Added unit and integration test coverage in
  `tests/data_source_sink_instruments_test.ts`.

- Added dedicated Sphinx documentation page for Installation & Platform Setup
  (`docs/source/installation.rst`) covering system requirements,
  platform-specific installation instructions (.deb, .rpm, .apk, generic binary,
  macOS, Windows), package dependencies, OS directory conventions, and source
  build tasks.
- Added dedicated Sphinx documentation page for MCP Integration Strategies &
  Examples (`docs/source/mcp_strategies.rst`) with complete, runnable code
  examples for Python MCP stdio clients, curl REST commands, JavaScript /
  TypeScript clients, and agentic workflows for PI and Hermes AI agents.
- Added complete examples and test runner suite for External Model Context
  Protocol (MCP) flows in `examples/mcp-flows/`:
  - TypeScript programmatic automation flow (`automated_test_flow.ts`), generic
    declarative flow runner (`declarative_flow_runner.ts`), and interactive AI
    agent loop (`interactive_agent_flow.ts`).
  - Declarative JSON flow definitions for frequency response sweep,
    multi-instrument coordination, and DMM characterization (`flows/*.json`).
  - Lightweight Python 3 MCP stdio client (`mcp_client.py`) and automated sweep
    flow (`automated_sweep_flow.py`).
  - Unix Shell and JSON-RPC pipelines (`quick_health_check.sh` and
    `automated_dmm_flow.sh`).
  - Sphinx documentation for External MCP Flows (`docs/source/mcp_flows.rst`).
  - Test suite in `tests/examples_mcp_flow_test.ts` verifying external MCP
    handshake and workflow execution.
- Added ReadTheDocs configuration (`.readthedocs.yaml`) and Sphinx documentation
  requirements (`docs/requirements.txt`) with Furo theme support for automated
  documentation builds.

- Added Alpine Linux APK (.apk) packaging workflow and tooling
  (`scripts/build_apk.ts`, `deno task package:apk`, and `APKBUILD` template) to
  package the standalone x86_64 compiled Linux binary into an installable `.apk`
  package for Alpine Linux with desktop integration (.desktop file, icons, doc,
  and package metadata) and `gcompat` runtime dependency declaration.
- Added RPM (.rpm) packaging workflow and tooling (`scripts/build_rpm.ts` and
  `deno task package:rpm`) to package the standalone x86_64 compiled Linux
  binary into an installable `.rpm` package for Red Hat, Fedora, and RPM-based
  distributions with desktop integration (.desktop file, icons, doc, and package
  metadata).
- Added Debian (.deb) packaging workflow and tooling (`scripts/build_deb.ts`,
  `deno task package:deb`, and `deno task package:linux:amd86`) to package the
  standalone amd64 compiled Linux binary into an installable `.deb` package with
  desktop integration (.desktop file, icons, doc, and package metadata).
- Embedded default subordinate instruments (`oscilloscope`, `multimeter`,
  `signal-generator`) directly in standalone compiled binaries with automatic
  first-run extraction to persistent user data directory
  (`~/.local/share/SCPI-flow/instruments/`).
- Added system browser auto-launching on server startup in interactive terminal
  sessions, with support for `--open`, `--no-open`, and `--headless` flags.
- Added OS-predictable directories following standard operating system
  conventions (XDG Base Directory Specification on Linux, Application Support on
  macOS, and AppData on Windows). Runtime paths resolve configuration
  (`~/.config/SCPI-flow/instruments.json`), persistent user data
  (`~/.local/share/SCPI-flow/projects/`), and instance state
  (`~/.local/state/SCPI-flow/$APP_INSTANCE/`).
- Added multi-root candidate path resolution for plugin manifests across catalog
  directory, persistent data directory
  (`~/.local/share/SCPI-flow/instruments/`), executable binary parent
  directories, and working directory.
- Added standalone compiled binary support for plugin child process spawning via
  Deno runner detection.
- Added CLI overrides (`--project-dir`, `--state-dir`, `--instance`) and
  environment variables (`SCPI_FLOW_PROJECTS`, `SCPI_FLOW_STATE`,
  `APP_INSTANCE`, `SCPI_FLOW_CATALOG`).

### Changed

- Tightened presentation chrome for the workspace UI and Instrument catalog:
  - Reduced font size across the Instrument catalog window by ~10% and tightened
    padding and margins proportionally.
  - Renamed the catalog button label from "Add to canvas" to "Add".
  - Replaced button text across toolbars (top header, instrument tab toolbars,
    and floating restore button) with icon-only SVG buttons displaying
    descriptive hover tooltips.
  - Reduced header toolbar height by ~10% for improved screen real estate.
  - Formatted the bottom footer into a single-line status window with ellipsis
    overflow for error and status reporting, hidden in maximize mode.
- Consolidated project documentation into a single standard `docs/` directory
  (eliminating `.docs/` and wrapper shims) for streamlined Sphinx and Read The
  Docs builds.
- Reorganized SCPI-flow into an instrument-independent shell. Oscilloscope,
  multimeter and signal-generator implementations, front panels, icons and tests
  are owned by separate sibling repositories.
- Replaced eager simulator construction and the fixed palette with a
  configurable catalog, versioned JSON manifests, validation, and on-demand
  child processes.
- Added dynamic instrument tabs and UI registration, load, unload,
  configuration, command and reset controls; retained the leftmost/default Data
  Flow Canvas.
- Added a standard MCP stdio adapter sharing the shell's loaded instrument
  state.
- Preserved legacy diagram loading through catalog-based GUID migration. Removed
  instrument-specific root HTTP routes in favor of generic and proxied APIs.
- Restricted shell HTTP binding to loopback and public-file serving to an
  allowlist.
- Documented plug-in development, offline operation, migration and trust
  boundaries.

## [0.8.0] - 2026-09-14

### Added

- Added dedicated workspace view tabs for all simulated instruments: **Digital
  Multimeter View** (`tab-dmm` / `view-dmm`) and **Signal Generator View**
  (`tab-gen` / `view-gen`) alongside Oscilloscope View and Data Flow Canvas.
- Implemented interactive front-panel simulation for the Siglent SDM3045X
  Digital Multimeter with TFT-LCD readout, secondary math/frequency display,
  range bar meter, live trend history graph, function selectors, 5-terminal jack
  status diagram, circuit input injector, and SCPI command console.
- Implemented interactive front-panel simulation for the Siglent SDG Signal
  Generator with synthesized waveform display canvas, wave type selectors,
  parameter controls, quick presets, and SCPI command console.
- Added backend REST endpoints in `main.ts` for Digital Multimeter
  (`/api/dmm/reading`, `/api/dmm/config`, `/api/dmm/input`, `/api/dmm/reset`)
  and Signal Generator (`/api/gen/state`, `/api/gen/preview`).
- Added double-click navigation on canvas nodes to open corresponding instrument
  view tabs directly.

### Changed

- Redesigned the Digital Multimeter palette icon (`assets/icons/multimeter.svg`)
  to a high-resolution 100x100 vector graphic with the 5 front-panel input
  banana terminals (Sense HI, Sense LO, Input HI, Input LO, 10A Current)
  vertically centered on the icon.
- Enhanced canvas node connector layout algorithm in `index.html`
  (`getConnectorOffset`) to automatically and symmetrically center all input and
  output connectors vertically on workspace nodes (including the 5 multimeter
  inputs).

## [0.7.0] - 2026-09-14

### Changed

- Updated workspace layout and navigation so the Data Flow Canvas is the
  leftmost tab and default active view upon initial page load and reset.
- Updated `newProject()`, `loadProject()`, and `resetScope()` to switch directly
  to the Data Flow Canvas workspace.
- Replaced basic placeholder Oscilloscope palette icon
  (`assets/icons/oscilloscope.svg`) with a detailed, high-resolution vector icon
  matching the multimeter and signal generator styling (chassis, dual-channel
  waveforms, knobs, and BNC connectors).

## [0.6.0] - 2026-09-12

### Added

- Visual Two-Input Oscilloscope Simulation (Siglent SDS1000X-U style):
  - Canvas waveform renderer with dual-signal support (CH1 yellow, CH2 cyan).
  - 8x14 division grid with minor subdivisions, center crosshair, and calibrated
    axis rulers.
  - Interactive horizontal and vertical cursors with ΔX, 1/ΔX (frequency), and
    ΔY readouts.
  - Channel scales (Volts/div), offsets (ground markers 1⏚, 2⏚), zoom, pan, and
    inversion.
  - Timebase delay, scale, horizontal zoom, pan, and trigger level marker (▶T).
  - Color intensity grading scale and color legend.
- Signal Generator Synthesizer (`src/signal_generator.ts`):
  - Sine, Square (adjustable duty cycle), Triangle, Sawtooth, DC, and Noise
    waveforms.
  - Dynamic manipulation of frequency, amplitude, phase, DC offset, and scale.
- Automated Measurement Engine (`src/measurements.ts`):
  - Vpp, Vmax, Vmin, Vrms, Vavg, Vamp, Vtop, Vbase, Frequency, Period, Rise
    Time, Fall Time, Duty Cycle.
- SCPI Engine & Processor (`src/scpi_engine.ts`):
  - Full IEEE 488.2 Common commands (`*IDN?`, `*RST`, `*CLS`, `*STB?`, `*ESR?`,
    `*ESE`, `*SRE`, `*OPC?`, `*WAI`).
  - SCPI status byte and event register reporting.
  - FIFO error queue reporting (`SYST:ERR?`, `SYST:ERR:COUN?`).
  - Siglent SDS1000X-compatible channel, timebase, trigger, cursor, and display
    subsystem commands.
  - Real-time automated measurement queries (`C1:PAVA? <param>`, `MEAS:VPP?`,
    `MEAS:ALL?`).
  - Waveform data transfers (`C1:WF? DAT2`, `WAV:DATA?`).
- CLI Application (`src/cli.ts`):
  - Terminal interactive REPL, ANSI color ASCII waveform display, measurements
    table, and batch execution.
- EditorConfig (`.editorconfig`) and updated `.gitignore`.
- Unit tests covering all methods across signal generation, measurements, scope
  core, SCPI engine, CLI, and API routes.

## [0.5.0] - 2026-08-20

### Added

- Comprehensive Sphinx documentation in `.docs/` covering Introduction, Usage,
  and Architecture.
- Fully functional Menubar with dropdowns for File, Edit, Tools, and Help.
- Integrated theme switching and project management into the menu system.
- Improved UI styling for menus and workspace elements.

## [0.4.0] - 2026-08-20

### Added

- SCPI Bridge: Python-based bridge using `pyVisa` for instrument communication.
- MCP-inspired Interface: Deno service to manage long-running Python process for
  SCPI commands.
- SCPI API Endpoints: `/api/scpi/resources` and `/api/scpi/query` for instrument
  discovery and control.
- Vendored SCPI logic: Initial setup for Python-based instrument wrapping.

## [0.3.0] - 2026-08-20

### Added

- Workspace connectivity: source and sink connectors for objects.
- Data flow visualization: Bezier lines with arrowheads connecting objects.
- Enhanced project persistence: save and load including object connections.
- UI improvements: markers for flow direction and improved object styling.

## [0.2.0] - 2026-08-20

### Added

- API endpoints for object definitions (`/api/obj/:guid`) and project management
  (`/api/projects/:name`).
- Interactive workspace in `index.html` with drag-and-drop support from the
  palette.
- Object rendering and movement within the workspace.
- Project "Save" and "Load" functionality via frontend prompt and backend API.
- Integration tests for new API endpoints in `main_test.ts`.

## [0.1.0] - 2026-08-19

### Added

- Core repository files (LICENSE, README, CHANGELOG, .gitignore,
  .junie/guidelines.md).
- Initial project directory structure (`obj/`, `projects/`, `assets/`,
  `.docs/`).
- `palette_objects.json` for object catalog.
- Basic Deno server in `main.ts` with static file serving and `/api/palette`
  endpoint.
- Initial SPA frontend in `index.html` with Menu, Toolbar, Palette, and Status
  Bar.
- Unit tests for API and static file serving in `main_test.ts`.
- Sphinx documentation configuration in `.docs/`.
