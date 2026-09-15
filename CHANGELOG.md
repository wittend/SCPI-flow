# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
