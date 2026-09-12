SCPI Command Reference
======================

The simulated instrument supports IEEE 488.2 standard common commands, error reporting, and Siglent SDS1000X subsystem commands.

IEEE 488.2 Common Commands
--------------------------

.. list-table::
   :header-rows: 1

   * - Command
     - Type
     - Description
   * - ``*IDN?``
     - Query
     - Identification query (Returns manufacturer, model, serial, firmware).
   * - ``*RST``
     - Command
     - Reset instrument to default state.
   * - ``*CLS``
     - Command
     - Clear status registers (ESR) and clear error queue.
   * - ``*STB?``
     - Query
     - Read Status Byte register.
   * - ``*ESR?``
     - Query
     - Read and clear Standard Event Status Register.
   * - ``*ESE <val>`` / ``*ESE?``
     - Cmd/Query
     - Set/query Event Status Enable register.
   * - ``*SRE <val>`` / ``*SRE?``
     - Cmd/Query
     - Set/query Service Request Enable register.
   * - ``*OPC`` / ``*OPC?``
     - Cmd/Query
     - Operation complete command / query (returns "1").
   * - ``*WAI``
     - Command
     - Wait to continue.

System Subsystem
----------------

* ``SYST:ERR?``: Pop and return next error from FIFO error queue (e.g. ``0,"No error"`` or ``-113,"Undefined header"``).
* ``SYST:ERR:COUN?``: Return number of errors in queue.
* ``SYST:VERS?``: Return SCPI version (``1999.0``).
* ``SYST:STAT?``: Return system status summary JSON.

Channel / Vertical Subsystem
----------------------------

Commands apply to Channel 1 (``C1:`` or ``CHAN1:``) and Channel 2 (``C2:`` or ``CHAN2:``):

* ``C1:VDIV <volts>`` / ``C1:VDIV?``: Set or query Volts/div.
* ``C1:OFST <volts>`` / ``C1:OFST?``: Set or query vertical offset.
* ``C1:TRA <ON|OFF>`` / ``C1:TRA?``: Enable or disable channel trace.
* ``C1:COUP <DC|AC|GND>`` / ``C1:COUP?``: Set input coupling.
* ``C1:INVS <ON|OFF>`` / ``C1:INVS?``: Set waveform inversion.
* ``C1:PROB <val>`` / ``C1:PROB?``: Set probe attenuation (1, 10, etc.).
* ``C1:ZOOM <val>`` / ``C1:PAN <val>``: Set vertical zoom and pan.
* ``C1:PAVA? <PARAM>``: Query specific measurement parameter (``PKPK``, ``MAX``, ``MIN``, ``RMS``, ``MEAN``, ``FREQ``, ``PER``, ``RISE``, ``FALL``, ``DUTY``, ``ALL``).
* ``C1:WF? DAT2``: Query raw waveform sample data block.

Signal Generator Manipulation Subsystem
---------------------------------------

* ``C1:WAVE:TYPE <SINE|SQUARE|TRIANGLE|SAWTOOTH|DC|NOISE>`` / ``C1:WAVE:TYPE?``
* ``C1:WAVE:FREQ <Hz>`` / ``C1:WAVE:FREQ?``
* ``C1:WAVE:AMP <Volts>`` / ``C1:WAVE:AMP?``
* ``C1:WAVE:PHASE <degrees>`` / ``C1:WAVE:PHASE?``
* ``C1:WAVE:OFST <Volts>`` / ``C1:WAVE:OFST?``
* ``C1:WAVE:DUTY <0.0-1.0>`` / ``C1:WAVE:DUTY?``
* ``C1:WAVE:SCAL <val>`` / ``C1:WAVE:SCAL?``

Timebase & Trigger Subsystems
-----------------------------

* ``TDIV <seconds>`` / ``TDIV?``: Set time per division.
* ``TRDL <seconds>`` / ``TRDL?``: Set timebase delay / offset.
* ``TRIG:SOUR <CH1|CH2|EXT>`` / ``TRIG:SOUR?``: Set trigger source.
* ``TRIG:MODE <AUTO|NORM|SINGLE>`` / ``TRIG:MODE?``: Set trigger sweep mode.
* ``TRIG:SLOP <POS|NEG>`` / ``TRIG:SLOP?``: Set trigger edge slope.
* ``TRIG:LEV <volts>`` / ``TRIG:LEV?``: Set trigger level in Volts.
* ``RUN``, ``STOP``, ``ARM``: Trigger run control commands.

Measurements Subsystem
----------------------

* ``MEAS:VPP? [C1|C2]``
* ``MEAS:VMAX? [C1|C2]``
* ``MEAS:VMIN? [C1|C2]``
* ``MEAS:VRMS? [C1|C2]``
* ``MEAS:VAVG? [C1|C2]``
* ``MEAS:FREQ? [C1|C2]``
* ``MEAS:PER? [C1|C2]``
* ``MEAS:ALL? [C1|C2]``: Returns JSON of all measurements.
