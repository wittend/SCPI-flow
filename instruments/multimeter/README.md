# SCPI-mmeter: Siglent SDM3045X Digital Multimeter Simulator

**SCPI-mmeter** is a standalone, offline-capable digital multimeter simulator built with
[Deno](https://deno.land/). It models the **Siglent SDM3045X** 4½ digit (60,000 counts) dual-display
benchtop digital multimeter, providing both an interactive web GUI, a terminal CLI interface, and an
SCPI command processor.

[![Documentation Status](https://readthedocs.org/projects/scpi-mmeter/badge/?version=latest)](https://scpi-mmeter.readthedocs.io/en/latest/)

- **Documentation**:
  [https://scpi-mmeter.readthedocs.io/en/latest/](https://scpi-mmeter.readthedocs.io/en/latest/)
- **Date of Last Modification**: 2026-09-14

---

## Features

- **Accurate Siglent SDM3045X Simulation**:
  - 4½ digit (60,000 counts) high-resolution measurement simulation.
  - Full functions: DCV, ACV (True RMS), DCI, ACI (True RMS), 2-Wire & 4-Wire Resistance (RES/FRES),
    Capacitance (CAP), Continuity (CONT with audio beeper), Diode test (DIOD with forward conduction
    audio beeper), Frequency & Period (FREQ/PER), and Temperature (TEMP with RTD/Thermocouple
    support).
- **Dual Display Support**: Simultaneous primary and secondary readouts (e.g., DCV + ACV, ACV +
  Frequency, Resistance + Temperature).
- **Math & Statistics Operations**:
  - Null (Relative) offset subtraction.
  - Real-time statistics: Min, Max, Average, Peak-to-Peak span, Standard Deviation, Sample count.
  - Limit Testing: Low/High pass-fail testing and count metrics.
  - dB and dBm power conversion with configurable reference resistance.
- **Multiple Display Modes**:
  - High-contrast 4½-digit numeric display.
  - Analog Bar Meter with scale limits.
  - Live Trend time-series strip chart.
  - Real-time sample Histogram distribution.
- **Rich Interfaces**:
  - **Interactive Web GUI**: Realistic Siglent front panel with color TFT-LCD screen, softkeys,
    functional buttons, banana jack terminals, physical circuit input generator, and live SCPI
    console.
  - **Terminal CLI**: Rich ANSI front-panel rendering and interactive SCPI shell (`deno task cli`).
  - **SCPI Engine**: IEEE 488.2 common commands (`*IDN?`, `*RST`, `*CLS`, `*OPC?`, `*STB?`, `*ESR?`,
    `*ESE`, `*SRE`, `*TRG`) and Siglent SDM command subsystems (`CONFigure`, `MEASure`, `SENSe`,
    `CALCulate`, `DATA`, `TRIGger`, `SAMPle`, `SYSTem`, `DISPlay`).
  - **MCP Control**: Fully controllable by AI agents and automation tools via the SCPI-flow Model
    Context Protocol (MCP) interface as well as direct SCPI bridge integration.

---

## MCP Interface Control

When running inside the SCPI-flow workspace or launched as an instrument plugin, the multimeter can
be discovered, configured, and controlled via standard Model Context Protocol (MCP) tools:

- **`load` / `unload`**: Start or stop the multimeter process (`{"id": "multimeter"}`).
- **`state`**: Read real-time measurement value, active function (DCV, ACV, RES, etc.), range, math
  statistics, and limits.
- **`configure`**: Update multimeter settings matching `instrument.json` schema (e.g.
  `{"id": "multimeter", "configuration": {"function": "VOLT:DC", "range": "10V"}}`).
- **`command`**: Execute raw SCPI queries and commands:
  - `{"id": "multimeter", "command": "*IDN?"}` -> Returns instrument model and firmware
    identification.
  - `{"id": "multimeter", "command": "CONF:VOLT:DC 10"}` -> Configures DC voltage 10V range.
  - `{"id": "multimeter", "command": "MEAS:VOLT:DC?"}` -> Reads simulated DC voltage measurement.
  - `{"id": "multimeter", "command": "MEAS:RES?"}` -> Measures resistance.
- **`reset`**: Perform an instrument reset (`{"id": "multimeter"}`).

---

## Getting Started

### Independent HTTP plugin

The existing standalone `main.ts`, `index.html`, `src/` implementation, CLI and original tests are
preserved. The additive `plugin.ts` entrypoint uses that same multimeter/SCPI engine without the
legacy bridge or any external runtime imports:

```sh
deno task plugin
```

Open `http://127.0.0.1:8001/plugin-ui/index.html`. This is a copy of the dedicated standalone front
panel with only its four API fetch URLs made proxy-relative. The original standalone page remains
unchanged. The manifest id is `multimeter`, frontend `plugin-ui/index.html`, and icon
`assets/icons/multimeter.svg`.

To launch under a parent plugin registry, from this repository:

```sh
deno run --cached-only --no-prompt --allow-read="$PWD" --allow-net=127.0.0.1 plugin.ts --port 0
```

The first stdout line is `{"port":<assigned-port>}`. The process owns independent in-memory state
and needs no shell or sibling repository. It implements `GET /health`, `GET /state`,
`POST /configure` (partial validated configuration), `POST /command` (`{"command":"*IDN?"}` →
`{"response":"..."}`), and `POST /reset`. Use `instrument.json` for available settings, enums and
numeric bounds. Example: `{"function":"RES","input":{"resistance":1234,"noiseLevel":0}}`. Invalid
configurations are rejected before mutation with HTTP 400; limits must also satisfy low ≤ high.
Supported SCPI commands retain the existing engine's semantics and error queue (`SYST:ERR?`); HTTP
success is not proof of SCPI success.

Legacy `/api/dmm/reading`, `/api/dmm/frontpanel`, `/api/dmm/command`, `/api/dmm/config`,
`/api/dmm/input` and `/api/dmm/reset` routes are retained. Static serving is allowlisted and
path-safe. Nested frontend requests resolve correctly at `/plugins/multimeter/plugin-ui/index.html`
using `../api/...`. Connector metadata describes simulated input/readings; no physical instruments
or automatic inter-process waveform wiring are implemented by this adapter.

`deno test --cached-only --allow-all` runs the original standalone tests, new plugin
lifecycle/configuration/static tests, and the copied SCPI-flow multimeter tests. The older copied
engine is quarantined under `tests/flow-legacy/` and is **not** imported by the plugin; the richer
existing standalone engine is authoritative. All test and legacy-server dependencies are vendored
for offline use. See `docs/index.rst` for plugin documentation; the existing documentation is
retained.

### Prerequisites

- [Deno](https://deno.land/) 2.0+ (Tested on Deno 2.4+)

### Running the Web GUI

Start the local HTTP server:

```bash
deno task start
```

Then open `http://localhost:8000` in your browser.

### Running the Terminal CLI

Run the interactive ANSI terminal interface:

```bash
deno task cli
```

#### Key Bindings in CLI

- `1` - `0`: Select function (`1`: DCV, `2`: ACV, `3`: DCI, `4`: ACI, `5`: RES/FRES, `6`: CAP, `7`:
  CONT, `8`: DIOD, `9`: FREQ/PER, `0`: TEMP)
- `A`: Toggle Auto Range
- `U` / `+`: Range Up
- `J` / `-`: Range Down
- `S`: Cycle measurement speed (Slow / Med / Fast)
- `D`: Toggle Dual Display
- `M`: Toggle Math modes (Stats, Limits, Null)
- `V`: Cycle display view (Number, Bar, Trend, Histogram)
- `T`: Trigger single measurement
- `C`: Enter interactive SCPI prompt
- `Q`: Quit

### Running Automated Tests

Run the complete unit test suite:

```bash
deno test --allow-all
```

---

## SCPI Command Examples

```
*IDN?                              -> "Siglent Technologies,SDM3045X,SDM3045X-SIM,1.01.01.23R2"
CONF:VOLT:DC 6.0                   -> Configure DC Voltage 6V range
MEAS:VOLT:DC?                      -> +3.30000000E+00
MEAS:VOLT:AC?                      -> +1.20040000E+02
MEAS:RES?                          -> +1.00020000E+03
CALC:AVER:STAT ON                  -> Enable statistics calculation
CALC:AVER:ALL?                     -> +3.30000000E+00,+3.30010000E+00,+3.29990000E+00,...
SYST:ERR?                          -> 0,"No error"
```

---

## License

MIT License.
