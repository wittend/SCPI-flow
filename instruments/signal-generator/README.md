# SCPI Signal Generator

An independent, offline Deno 2.4+ waveform simulator. Its dedicated front panel preserves the
waveform selector, sliders and numeric controls, frequency shortcuts, audio/clock/RF/sensor/noise
presets, canvas preview, output switch, theme selector and command console. There is no shell canvas
or other instrument panel.

## Run

```sh
deno task start
```

Open `http://127.0.0.1:8002/index.html`. For an ephemeral plugin process, run from this repository:

```sh
deno run --cached-only --no-prompt --allow-read="$PWD" --allow-net=127.0.0.1 plugin.ts --port 0
```

The first stdout line is `{"port":<assigned-port>}`. The manifest id is `signal-generator`, frontend
is `index.html`, icon is `assets/icons/generator.svg`. No Python, VISA, shell modules or other
repository is required. Each process owns independent in-memory state; restarting it resets the
instrument.

## API and configuration

- `GET /health` reports `status: "ok"` and the instrument id.
- `GET /state` returns type, frequency, peak amplitude, offset, phase, duty cycle, scale and
  output-enabled status.
- `POST /configure` accepts a partial configuration object and returns state. The manifest is the
  configuration reference. Validation is recursive and occurs before mutation; invalid
  fields/types/enums/bounds return HTTP 400.
- `POST /command` accepts `{"command":"FREQ 2000"}` and returns `{"response":""}` for a setter, or a
  string response for a query.
- `POST /reset` restores all defaults and clears the command error queue.
- Legacy frontend endpoints: `GET/POST /api/gen/state` and `GET /api/gen/preview`. Preview returns
  400 time/voltage samples over two cycles for frequencies of at least 1 Hz (two seconds below 1
  Hz). Output-off samples are zero. DC, scale, phase, duty cycle and offset use the actual backend
  engine.

Example:
`{"type":"square","frequency":1000,"amplitude":1.65,"offset":1.65,"dutyCycle":0.5,"outputEnabled":true}`.
Amplitude is **peak volts**, not Vpp; phase is degrees and duty cycle is a fraction from 0 to 1. The
UI labels and backend preview agree with these units. All fetch URLs are relative and work at
`/plugins/signal-generator/index.html`. The static server does not expose source/configuration code
and blocks traversal and out-of-root symlinks. The manifest and public assets remain accessible.

## Explicit command subset

This is **not** a full SDG2042X SCPI emulator. Supported commands are:

- `*IDN?`, `*RST`, `*CLS`, `*OPC?`, `SYST:ERR?` / `SYSTEM:ERROR?`.
- `FREQ` / `FREQUENCY`, `VOLT` / `VOLTAGE`, `VOLT:OFFS` / `VOLTAGE:OFFSET`, `PHAS` / `PHASE`, `FUNC`
  / `FUNCTION`, as numeric/type setters or `?` queries. `VOLT` uses the simulator's peak-amplitude
  units. Numeric arguments are plain numbers without engineering-unit suffixes. Waveform names are
  sine, square, triangle, sawtooth, noise, dc; aliases SIN, SQU, TRI, RAMP and NOIS are accepted.
- `OUTP`, `OUTPUT`, `C1:OUTP` with ON/OFF/1/0, and `?` queries.
- `C1:BSWV?` reports the waveform parameters; its AMP field is Vpp.

Commands are case-insensitive. Unsupported commands return HTTP 400 and queue `-113`; invalid
numeric values queue `-222`. No compound commands, arbitrary waveform upload, hardware communication
or automatic inter-process signal wiring is implemented. Connector metadata describes the waveform
output only.

## Tests and provenance

```sh
deno test --cached-only --allow-all
deno check plugin.ts
deno run --allow-read=. --allow-net=127.0.0.1 tools/browser_proxy.ts 8101
```

The optional last command provides a local iframe/proxy check, not a runtime dependency. Core
waveform tests were copied from SCPI-flow alongside `src/signal_generator.ts`, the generator icon
and MIT license. Its shared page's generator-only markup/styles/scripts became `index.html`;
unrelated panels and shell logic were removed. No originals were deleted. The output switch and
command console now control the backend instead of only local browser state. Contract, negative
configuration, process lifecycle and command tests are added. Assertions are vendored for offline
tests. Sphinx entry point: `.docs/index.rst`.
