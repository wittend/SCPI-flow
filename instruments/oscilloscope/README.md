# SCPI-oScope-sim

A self-contained two-channel oscilloscope simulator and HTTP instrument plugin. Requires Deno 2.4 or
newer. No Python, VISA, shell application, sibling checkout, remote frontend resources, or runtime
package downloads are required.

## Run

From this repository:

```sh
deno task start
```

Open `http://127.0.0.1:8000/index.html`. The dedicated front panel retains channel
waveform/frequency/amplitude/offset controls, coupling and vertical scale, timebase, trigger,
display grid, rulers, cursors, live measurements, run/stop, single acquisition, reset, theme
selection and the SCPI console.

For a parent application to launch an isolated plugin process:

```sh
deno run --cached-only --no-prompt --allow-read="$PWD" --allow-net=127.0.0.1 plugin.ts --port 0
```

The first stdout line is `{"port":<assigned-port>}`. Terminate the process to release the
instrument. Each process has independent in-memory state. The `instrument.json` v1 manifest uses id
`oscilloscope`, frontend `index.html`, and icon `assets/icons/oscilloscope.svg`; it has no
permissions extension.

## HTTP contract

- `GET /health`: `{ "status": "ok", "id": "oscilloscope" }`.
- `GET /state`: acquired frame, channel settings and waveform arrays, measurements, timebase,
  trigger, display/cursors and running status.
- `POST /configure`: partial configuration JSON, validated recursively against the manifest before
  mutation; returns current state. Unknown keys, wrong types, invalid enums and out-of-range numbers
  return HTTP 400.
- `POST /command`: `{ "command": "*IDN?" }` returns `{ "response": "..." }`. Setters return an empty
  response string. The existing engine's SCPI errors are available through `SYST:ERR?`; HTTP success
  does not imply SCPI command success.
- `POST /reset`: restores initial instrument and status-register state.
- Front-panel compatibility: `GET /api/scope/frame`, `GET /api/scope/measurements`,
  `POST /api/scope/command`.

Example configuration:
`{"timeDiv":0.001,"ch1":{"generator":{"type":"square","frequency":2000,"amplitude":2}}}`. Generator
amplitudes are peak volts. Settings are not persisted across restarts. The static server serves only
the frontend, manifest and public assets, rejects traversal, and resolves symlinks before reading.
It does not expose source files. All frontend fetch URLs are relative, including under
`/plugins/oscilloscope/index.html`.

## MCP Interface Control

When loaded in the SCPI-flow workspace, the oscilloscope is fully controllable via Model Context
Protocol (MCP) tools:

- **`load` / `unload`**: Start or terminate the oscilloscope subprocess (`{"id": "oscilloscope"}`).
- **`state`**: Query acquired frame, channel waveforms, trigger status, timebase, and live
  measurements.
- **`configure`**: Update timebase, vertical divisions, channel coupling, and generator parameters
  per `instrument.json`.
- **`command`**: Send raw SCPI commands:
  - `{"id": "oscilloscope", "command": "*IDN?"}` -> Returns identity string.
  - `{"id": "oscilloscope", "command": "C1:VDIV 1.0"}` -> Sets CH1 vertical scale to 1V/div.
  - `{"id": "oscilloscope", "command": "TDIV 0.001"}` -> Sets timebase to 1ms/div.
  - `{"id": "oscilloscope", "command": "MEAS:ALL?"}` -> Returns all active measurements.
  - `{"id": "oscilloscope", "command": "WAV:DATA?"}` -> Returns acquired waveform data points.
- **`reset`**: Reset oscilloscope registers and settings (`{"id": "oscilloscope"}`).

## Commands and limitations

The copied engine implements an SDS1000X-style **subset**, not a certified hardware emulator.
Examples: `*IDN?`, `*RST`, `*CLS`, `*STB?`, `SYST:ERR?`, `C1:VDIV 2`, `C1:WAVE:FREQ 2500`,
`TDIV 0.001`, `TRIG:MODE AUTO`, `MEAS:ALL?`, `WAV:DATA?`. It retains compound-command support and
error queues. Use `src/scpi_engine.ts` and its tests as the precise command reference. Signals are
local synthetic inputs; connector metadata does not itself transport waveforms between processes.
Acquisition timing and triggers retain the original simulation semantics rather than real-time
hardware behavior.

## Development and provenance

```sh
deno test --cached-only --allow-all
deno check plugin.ts
deno task cli --exec '*IDN?'
deno run --allow-read=. --allow-net=127.0.0.1 tools/browser_proxy.ts 8100
```

The last command is an optional local iframe/proxy test harness, not a runtime dependency. Tests
cover the copied core engine plus configuration, lifecycle, restricted offline subprocess startup,
static-file safety and frontend URLs. Test assertions are vendored under `vendor/` for offline
execution.

Copied from SCPI-flow without deleting the originals: `src/oscilloscope.ts`, `src/measurements.ts`,
`src/scpi_engine.ts`, `src/signal_generator.ts`, `src/cli.ts`, their five corresponding
`tests/*_test.ts` files, the oscilloscope icon and MIT license. `index.html` contains only the
extracted scope markup/styles/scripts; the shell, multimeter and generator panels are absent. The
local signal generator module is an internal test-signal dependency, not a second instrument
process.

See `docs/index.rst` for the Sphinx documentation entry point.
