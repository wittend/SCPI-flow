# SCPI-flow & Oscilloscope Simulation

A Deno-based graphical environment and standalone visual simulation of a
two-input digital oscilloscope (Siglent SDS1000X-U style) for controlling and
monitoring experimental instruments using SCPI.

[![Read the Docs](https://img.shields.io/badge/docs-read--the--docs-blue)](https://scpi-flow.readthedocs.io/)

**Date of Last Modification:** 2026-09-12

## Overview

SCPI-flow provides an extensible graphical workspace, similar to GNU Radio
Companion, along with a high-fidelity visual simulation of a two-input digital
storage oscilloscope. It supports both standalone local (offline) and
network-hosted operation, with full support for CLI and Web GUI interfaces.

## Key Features

- **Visual Two-Channel Oscilloscope Simulation:**
  - Siglent SDS1000X-U inspired digital storage oscilloscope interface.
  - Dual channel signals (CH1 in Yellow, CH2 in Cyan).
  - High-precision vertical and horizontal grid (8x14 divisions) with minor
    subdivision reticles.
  - Vertical and horizontal scale indicators (Volts/div, Time/div).
  - Ground reference level markers (`1⏚`, `2⏚`), trigger marker (`▶T`), and
    horizontal delay indicator.
  - Vertical and horizontal zoom and pan controls.
  - Interactive vertical and horizontal cursors (X1, X2, Y1, Y2) with ΔX, 1/ΔX
    (frequency), and ΔY readouts.
  - Center crosshair and calibrated axis graduations/rulers.
  - Top status bar legend (channel coupling, scale, trigger source/mode/level,
    sample rate).
  - Amplitude intensity color scale and color legend.

- **Simulated Signal Generator:**
  - Independent signal synthesizers for inputs.
  - Waveform types: **Sine**, **Square** (with adjustable duty cycle),
    **Triangle**, **Sawtooth**, **DC**, and **Noise**.
  - Dynamic parameter manipulation: Frequency, Amplitude, Phase, DC Offset,
    Scale multiplier.

- **Automated Measurements:**
  - Voltage metrics: Vpp (Peak-to-Peak), Vmax, Vmin, Vrms (True RMS), Vavg
    (Mean), Vamp (Top - Base).
  - Timing metrics: Frequency, Period, 10-90% Rise Time, 90-10% Fall Time, Duty
    Cycle.

- **SCPI Command Interface:**
  - Full IEEE 488.2 common commands (`*IDN?`, `*RST`, `*CLS`, `*STB?`, `*ESR?`,
    `*ESE`, `*SRE`, `*OPC?`, `*WAI`).
  - SCPI status byte and event register reporting.
  - Standard FIFO error queue reporting (`SYST:ERR?`, `SYST:ERR:COUN?`).
  - Siglent SDS-compatible channel, timebase, trigger, cursor, and display
    subsystem commands.
  - Automated measurement queries (`C1:PAVA? <param>`, `MEAS:VPP?`,
    `MEAS:ALL?`).
  - Raw waveform data block transfers (`C1:WF? DAT2`, `WAV:DATA?`).

- **CLI & GUI Applications:**
  - **Web GUI:** Interactive single-page application with Canvas oscilloscope
    display and data flow workspace.
  - **Interactive CLI:** Terminal-based REPL with ANSI-color ASCII waveform
    rendering, measurement tables, and SCPI console.
  - **Script/Batch CLI:** Command-line execution of SCPI queries and exports.

- **Data Flow Workspace:**
  - Drag-and-drop instrument palette (`Oscilloscope`, `Signal Generator`).
  - Bezier connector lines with arrowheads indicating data flow.
  - Save and load project diagrams (`projects/*_prj.json`).

## Documentation

Full documentation is available on
[Read the Docs](https://scpi-flow.readthedocs.io/) and in the `docs/` and
`.docs/` folders.

## Getting Started

### Prerequisites

- [Deno](https://deno.com/) (Stable 2.4+)

### Running the Web GUI Application

```bash
deno task start
# or: deno run --allow-all main.ts
```

Open `http://localhost:8000` in your web browser.

### Running the Interactive CLI Application

```bash
deno task cli
# or: deno run --allow-all src/cli.ts
```

CLI Options:

```bash
# Execute SCPI command string directly
deno run --allow-all src/cli.ts --exec "*IDN?; C1:VDIV 2.0; MEAS:VPP? C1"

# Render ASCII oscilloscope screen in terminal
deno run --allow-all src/cli.ts --plot

# Print automated measurements table
deno run --allow-all src/cli.ts --meas
```

## Running Unit Tests

```bash
deno test --allow-all
```

## License

This project is licensed under the GPL-3.0-or-later License - see the
[LICENSE](LICENSE) file for details.
