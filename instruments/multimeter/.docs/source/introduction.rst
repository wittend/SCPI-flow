Introduction
============

**SCPI-mmeter** is a Deno-based visual and programmatic simulation of an SCPI-capable Digital Multimeter modeled after the **Siglent SDM3045X** 4½ digit (60,000 counts) dual-display benchtop multimeter.

Key Features
------------

- **Pure TypeScript Deno Simulation Engine**: Emulates high-precision ADC measurement cycles with simulated physical inputs and noise models.
- **Full Measurement Functions**:
  - DC Voltage (600 mV to 1000 V)
  - AC Voltage True RMS (600 mV to 750 V)
  - DC Current (600 µA to 10 A)
  - AC Current True RMS (60 mA to 10 A)
  - 2-Wire & 4-Wire Resistance (600 Ω to 100 MΩ)
  - Capacitance (2 nF to 100 mF)
  - Continuity with audio beeper threshold (0 to 2000 Ω)
  - Diode test with forward conduction beeper (0 to 4 V)
  - Frequency (20 Hz to 1 MHz) and Period (1 µs to 0.05 s)
  - Temperature (RTD and Thermocouple in °C, °F, K)
- **Dual Display Support**: Primary + Secondary simultaneous measurement display.
- **Math Capabilities**: Null / Relative offset, Statistics (Min, Max, Average, Span, StdDev, Count), Limit Testing (Pass/Fail/High/Low), and dB / dBm scaling.
- **Multiple Display Modes**: 4½-digit Numeric Display, Analog Bar Meter, Live Trend Time-Series Chart, and Real-time Histogram.
- **Rich Interfaces**:
  - **Web GUI**: Authentic Siglent SDM3045X front panel with interactive controls, softkeys, banana jacks, circuit source generator, and live SCPI console.
  - **Interactive Terminal CLI**: Real-time ANSI front panel and SCPI interactive shell.
  - **SCPI & MCP Protocol Bridge**: Full IEEE 488.2 and Siglent SCPI command subsystem support.
