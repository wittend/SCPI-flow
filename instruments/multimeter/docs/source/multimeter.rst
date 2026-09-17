Multimeter Simulation Model
===========================

Measurement Functions & Ranges
------------------------------

The simulator accurately reproduces the measurement ranges and specifications of the Siglent SDM3045X:

.. list-table:: Supported Functions & Ranges
   :widths: 25 35 40
   :header-rows: 1

   * - Function
     - Ranges
     - Characteristics
   * - **DC Voltage (`VOLT:DC`)**
     - 600 mV, 6 V, 60 V, 600 V, 1000 V
     - 10 MΩ / 10 GΩ input impedance, auto-ranging
   * - **AC Voltage (`VOLT:AC`)**
     - 600 mV, 6 V, 60 V, 600 V, 750 V
     - True RMS AC coupling, 20 Hz - 100 kHz bandwidth
   * - **DC Current (`CURR:DC`)**
     - 600 µA, 6 mA, 60 mA, 600 mA, 6 A, 10 A
     - Low burden voltage, fast protection fuse
   * - **AC Current (`CURR:AC`)**
     - 60 mA, 600 mA, 6 A, 10 A
     - True RMS measurement
   * - **2-Wire Resistance (`RES`)**
     - 600 Ω, 6 kΩ, 60 kΩ, 600 kΩ, 6 MΩ, 60 MΩ, 100 MΩ
     - Includes lead resistance compensation
   * - **4-Wire Resistance (`FRES`)**
     - 600 Ω, 6 kΩ, 60 kΩ, 600 kΩ, 6 MΩ, 60 MΩ, 100 MΩ
     - Kelvin 4-wire sensing eliminates test lead resistance
   * - **Capacitance (`CAP`)**
     - 2 nF, 20 nF, 200 nF, 2 µF, 20 µF, 200 µF, 2 mF, 20 mF, 100 mF
     - Wide range capacitance measurement
   * - **Continuity (`CONT`)**
     - Fixed 2000 Ω range
     - Adjustable beeper threshold (0 - 2000 Ω, default 10 Ω)
   * - **Diode Test (`DIOD`)**
     - 0 to 4.0 V
     - 1 mA test current with forward conduction audio beeper
   * - **Frequency / Period (`FREQ`/`PER`)**
     - 20 Hz to 1 MHz / 1 µs to 0.05 s
     - Reciprocal counting technique
   * - **Temperature (`TEMP`)**
     - -200 °C to +850 °C
     - RTD (PT100, PT1000) & Thermocouple support (°C, °F, K)

Dual Display Combinations
-------------------------

- **DCV**: Primary DCV + Secondary ACV
- **ACV**: Primary ACV + Secondary Frequency / Period / dB / dBm
- **DCI**: Primary DCI + Secondary ACI
- **ACI**: Primary ACI + Secondary Frequency / Period
- **FREQ**: Primary Frequency + Secondary Period
- **RES**: Primary Resistance + Secondary Temperature
