SCPI Command Reference
======================

The **SCPI-mmeter** simulator provides a complete implementation of IEEE 488.2 common commands and Siglent SDM3045X SCPI subsystem commands.

IEEE 488.2 Common Commands
--------------------------

- `*IDN?`: Identification query returns instrument manufacturer, model, serial, and firmware version.
- `*RST`: Reset instrument to factory defaults.
- `*CLS`: Clear event registers and error queue.
- `*OPC`: Set Operation Complete bit.
- `*OPC?`: Query Operation Complete (returns `1`).
- `*STB?`: Query Status Byte register.
- `*ESR?`: Query Standard Event Status register.
- `*ESE <val>` / `*ESE?`: Set/Query Event Status Enable register.
- `*SRE <val>` / `*SRE?`: Set/Query Service Request Enable register.
- `*TRG`: Execute trigger.

CONFigure Subsystem
-------------------

- `CONFigure[:VOLTage]:{DC|AC} [{<range>|AUTO|MIN|MAX|DEF}]`
- `CONFigure:CURRent:{DC|AC} [{<range>|AUTO|MIN|MAX|DEF}]`
- `CONFigure:{RESistance|FRESistance} [{<range>|AUTO|MIN|MAX|DEF}]`
- `CONFigure:{FREQuency|PERiod}`
- `CONFigure:CAPacitance [{<range>|AUTO|MIN|MAX|DEF}]`
- `CONFigure:CONTinuity`
- `CONFigure:DIODe`
- `CONFigure:TEMPerature [{RTD|THER}[,{<type>|DEF}]]`
- `CONFigure?`

MEASure Subsystem
-----------------

- `MEASure[:VOLTage]:{DC|AC}? [{<range>|AUTO|MIN|MAX|DEF}]`
- `MEASure:CURRent:{DC|AC}? [{<range>|AUTO|MIN|MAX|DEF}]`
- `MEASure:{RESistance|FRESistance}? [{<range>|AUTO|MIN|MAX|DEF}]`
- `MEASure:{FREQuency|PERiod}?`
- `MEASure:CAPacitance? [{<range>|AUTO|MIN|MAX|DEF}]`
- `MEASure:CONTinuity?`
- `MEASure:DIODe?`
- `MEASure:TEMPerature? [{RTD|THER}[,{<type>|DEF}]]`

CALCulate Subsystem
-------------------

- `CALCulate:AVERage[:STATe] {ON|1|OFF|0}`: Enable/disable statistics.
- `CALCulate:AVERage:ALL?`: Query all statistics (Average, Max, Min, Span, StdDev, Count).
- `CALCulate:AVERage:MINimum?`, `MAXimum?`, `AVERage?`, `COUNt?`, `PTPeak?`, `SDEViation?`
- `CALCulate:LIMit[:STATe] {ON|1|OFF|0}`: Enable/disable limit testing.
- `CALCulate:LIMit:{LOWer|UPPer}[:DATA] {<val>|MIN|MAX|DEF}`: Set limit thresholds.
- `CALCulate:SCALe:FUNCtion {DB|DBM}`: Select dB or dBm math mode.
- `CALCulate:SCALe:DBM:REFerence {<val>|MIN|MAX|DEF}`: Set reference resistance (e.g. 50, 600 Ω).
- `CALCulate:NULL[:STATe] {ON|1|OFF|0}`: Enable/disable Null relative mode.
- `CALCulate:NULL:VALue {<val>|MIN|MAX|DEF}`: Set Null offset value.
- `CALCulate:TRANsform:HISTogram[:STATe] {ON|1|OFF|0}`: Enable/disable histogram.
- `CALCulate:TRANsform:HISTogram:POINts {<val>|MIN|MAX|DEF}`: Set histogram bin count.

DATA & Trigger Subsystems
-------------------------

- `READ?`: Initiates trigger and returns measurement.
- `FETCh?`: Retrieves last acquired measurement.
- `DATA:LAST?`: Returns last measurement in buffer.
- `DATA:POINts?`: Returns count of readings in buffer.
- `DATA:DATA?`: Returns all buffered readings.
- `DATA:REMove? <count>`: Removes and returns specified number of readings.
- `TRIGger:SOURce {IMMediate|EXTernal|BUS}`
- `TRIGger:COUNt {<count>|MIN|MAX|DEF|INFinity}`
- `SAMPle:COUNt {<count>|MIN|MAX|DEF}`

SYSTem Subsystem
----------------

- `SYSTem:ERRor?`: Returns next error code and message from FIFO (`+0,"No error"`).
- `SYSTem:ERRor:COUNt?`: Returns number of pending errors.
- `SYSTem:VERSion?`: Returns SCPI version (`1999.0`).
- `SYSTem:PRESet`: Restores default settings.
- `SYSTem:BEEPer:STATe {ON|1|OFF|0}`: Enable/disable audio beeper.
- `SYSTem:BEEPer[:IMMediate]`: Emits an immediate beep sound.
