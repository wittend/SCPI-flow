Architecture
============

SCPI-flow is designed with a modular architecture enabling offline simulation, network hosting, and hardware integration.

Component Breakdown
-------------------

1. **Signal Generation Engine (`src/signal_generator.ts`)**:
   Provides accurate mathematical synthesis of Sine, Square, Triangle, Sawtooth, DC, and Noise waveforms with parameter manipulation.

2. **Measurement Engine (`src/measurements.ts`)**:
   Computes statistical voltage parameters (Peak-to-Peak, RMS, Mean, High/Low state plateaus) and timing parameters (Frequency, Period, Rise/Fall time, Duty Cycle).

3. **Oscilloscope Core (`src/oscilloscope.ts`)**:
   Simulates dual analog channels, timebase delay/scaling, trigger conditions, cursor calculations, and screen display properties.

4. **SCPI Engine (`src/scpi_engine.ts`)**:
   A standards-compliant IEEE 488.2 and Siglent command parser maintaining status registers (*STB, *ESR), FIFO error queues, and subsystem command execution.

5. **CLI Application (`src/cli.ts`)**:
   Terminal-based interface featuring ANSI color ASCII waveform display, measurement tables, and an interactive SCPI REPL.

6. **Web Interface (`index.html`)**:
   Single-page application featuring a high-performance Canvas digital oscilloscope interface alongside the GNU Radio Companion style data flow workspace.

7. **SCPI Bridge (`scpi_bridge.ts`)**:
   MCP-compatible communication bridge routing commands to the local simulated instrument or external physical instruments via PyVisa.
