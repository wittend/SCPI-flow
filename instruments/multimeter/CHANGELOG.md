# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Additive v1 `multimeter` HTTP plugin, restricted loopback startup, port announcement, lifecycle
  endpoints and recursively validated configuration.
- Dedicated `plugin-ui/index.html` copied from the existing standalone front panel with
  proxy-relative API URLs, plus a plugin icon and safe static serving.
- Contract/lifecycle tests and quarantined SCPI-flow legacy engine/tests; the existing standalone
  source, main entrypoint, frontend and tests remain intact.
- Vendored dependencies and standalone/plugin launch documentation.

## [0.1.0] - 2026-09-14

### Added

- Pure TypeScript simulation engine for the Siglent SDM3045X 4½ digit (60,000 counts) dual-display
  digital multimeter.
- Full measurement function support: DCV, ACV (True RMS), DCI, ACI (True RMS), 2-Wire & 4-Wire
  Resistance, Capacitance, Continuity with audio beeper, Diode test with forward conduction audio
  beeper, Frequency, Period, and Temperature (RTD & Thermocouple).
- Dual display mode allowing simultaneous primary and secondary measurement displays.
- Math processing: Null (Relative), Statistics (Min, Max, Avg, Span, StdDev, Count), Limit Testing
  (Pass/Fail/High/Low), and dB/dBm conversions.
- Display visualization modes: Numeric, Analog Bar Meter, Live Trend time series, and Histogram.
- IEEE 488.2 common commands and SCPI subsystem parser (`CONFigure`, `MEASure`, `SENSe`,
  `CALCulate`, `DATA`, `TRIGger`, `SAMPle`, `SYSTem`, `DISPlay`).
- Interactive web GUI with front panel controls, color TFT-LCD screen, banana terminals, circuit
  generator, and live SCPI console.
- Interactive terminal CLI with ANSI front panel and interactive SCPI prompt.
- Comprehensive automated unit test suite covering all methods, subsystems, and HTTP endpoints.
- Sphinx documentation with Furo theme.
