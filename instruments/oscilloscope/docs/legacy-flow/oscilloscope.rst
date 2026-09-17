Two-Channel Oscilloscope Simulation
====================================

The visual oscilloscope simulator is modeled after modern digital storage oscilloscopes (such as the Siglent SDS1000X-U series).

Visual Display Elements
-----------------------

* **Dual Signals**: Displays Channel 1 (Yellow, ``#f5c518``) and Channel 2 (Cyan, ``#00d2ff``).
* **Grid**: 8 vertical divisions by 14 horizontal divisions with major grid lines and minor subdivisions. Configurable to Full, Crosshair only, or Off.
* **Vertical and Horizontal Scales**:
  * Vertical: 100mV/div to 10V/div per channel.
  * Horizontal: 100µs/div to 10ms/div timebase.
* **Vertical and Horizontal Offsets**:
  * Ground level indicators (``1⏚``, ``2⏚``) marking the 0V reference.
  * Trigger level marker (``▶T``) on the right edge.
  * Timebase trigger delay marker.
* **Vertical and Horizontal Zoom**: Independent zoom multipliers for channel voltage and horizontal timebase.
* **Vertical and Horizontal Pan**: Voltage and time panning offsets.
* **Cursors**: Draggable/configurable X1, X2 (time) and Y1, Y2 (voltage) cursor lines with real-time ΔX, 1/ΔX (frequency), and ΔY readouts.
* **Crosshair**: Center reticle with graduated minor tick marks.
* **Rulers**: Voltage graduations along vertical axis and time values along horizontal axis.
* **Legend**: Top status bar with channel coupling, scale, timebase, trigger source, and status.
* **Color Scale & Legend**: Real-time signal amplitude and intensity color grading bar.

Simulated Signal Generator
--------------------------

Each channel contains an independent signal generator capable of synthesizing:

* **Sine Wave**: Continuous sinusoidal function.
* **Square Wave**: Pulse waveform with adjustable duty cycle (0.0 to 1.0).
* **Triangle Wave**: Linear ramp up and down.
* **Sawtooth Wave**: Linear ramp with sharp fall.
* **DC Level**: Constant DC voltage offset.
* **Noise**: Uniform random noise generator.

Parameters:
* Frequency (Hz)
* Amplitude (Peak Volts)
* Phase (Degrees)
* DC Offset (Volts)
* Scale Multiplier

Automated Measurements
----------------------

Calculated in real-time on acquired waveform buffers:

* **Vpp**: Peak-to-Peak voltage (Vmax - Vmin)
* **Vmax / Vmin**: Maximum and minimum voltage levels
* **Vrms**: True Root-Mean-Square voltage
* **Vavg**: Average (mean) voltage
* **Vamp**: Top level minus Base level
* **Frequency**: Signal frequency via zero/mid-threshold crossings
* **Period**: Signal period in seconds
* **Rise Time**: 10% to 90% transition time
* **Fall Time**: 90% to 10% transition time
* **Duty Cycle**: Positive pulse width to period ratio
