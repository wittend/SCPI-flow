/**
 * SCPI Engine for the Siglent SDM3045X Digital Multimeter Simulation.
 * Implements IEEE 488.2 Common Commands, status registers, error queue,
 * CONFigure, MEASure, SENSe, CALCulate, DATA, TRIGger, SAMPle, SYSTem,
 * and DISPlay subsystems.
 */

import { MeasurementFunction, MultimeterSimulation, TemperatureUnit } from "./multimeter.ts";

export interface ScpiError {
  code: number;
  message: string;
}

export function formatScpiNumber(val: number): string {
  if (isNaN(val)) return "+0.00000000E+00";
  if (Math.abs(val) >= 9e37) {
    return val >= 0 ? "+9.90000000E+37" : "-9.90000000E+37";
  }
  const expStr = val.toExponential(8); // e.g. "5.00000000e+0" or "-1.23456789e-3"
  const parts = expStr.split("e");
  let mantissa = parts[0];
  const sign = mantissa.startsWith("-") ? "" : "+";
  mantissa = sign + mantissa;

  const exp = parseInt(parts[1], 10);
  const expSign = exp >= 0 ? "+" : "-";
  const absExp = Math.abs(exp).toString().padStart(2, "0");

  return `${mantissa}E${expSign}${absExp}`;
}

export class ScpiEngine {
  public meter: MultimeterSimulation;

  // Status Registers (IEEE 488.2)
  private _stb: number = 0; // Status Byte Register
  private _esr: number = 0; // Standard Event Status Register
  private _ese: number = 0; // Event Status Enable Register
  private _sre: number = 0; // Service Request Enable Register
  private _opc: boolean = false;

  // Error Queue FIFO (max 32 entries)
  private _errorQueue: ScpiError[] = [];
  private static readonly MAX_QUEUE_SIZE = 32;

  // Identification string for SDM3045X
  public idn: string = "Siglent Technologies,SDM3045X,SDM3045X-SIM,1.01.01.23R2";

  constructor(meter?: MultimeterSimulation) {
    this.meter = meter || new MultimeterSimulation();
  }

  // --- Status & Error Management ---

  public pushError(code: number, message: string): void {
    if (this._errorQueue.length < ScpiEngine.MAX_QUEUE_SIZE) {
      this._errorQueue.push({ code, message });
    }
    // Set standard ESR bit
    if (code <= -100 && code > -200) {
      this._esr |= 0x20; // CME (Command Error)
    } else if (code <= -200 && code > -300) {
      this._esr |= 0x10; // EXE (Execution Error)
    } else if (code <= -300 && code > -400) {
      this._esr |= 0x08; // DDE (Device-Dependent Error)
    } else if (code <= -400) {
      this._esr |= 0x04; // QYE (Query Error)
    }
    this.updateStb();
  }

  public popError(): ScpiError {
    const err = this._errorQueue.shift();
    this.updateStb();
    if (err) return err;
    return { code: 0, message: "No error" };
  }

  public clearErrors(): void {
    this._errorQueue = [];
    this.updateStb();
  }

  private updateStb(): void {
    // ESB is Bit 5: set if any enabled ESR bit is 1
    if ((this._esr & this._ese) !== 0) {
      this._stb |= 0x20;
    } else {
      this._stb &= ~0x20;
    }

    // Error queue available: Bit 2
    if (this._errorQueue.length > 0) {
      this._stb |= 0x04;
    } else {
      this._stb &= ~0x04;
    }

    // MSS is Bit 6: Master Summary Status
    if ((this._stb & this._sre & 0xBF) !== 0) {
      this._stb |= 0x40;
    } else {
      this._stb &= ~0x40;
    }
  }

  public get stb(): number {
    this.updateStb();
    return this._stb;
  }

  public get esr(): number {
    return this._esr;
  }

  public get ese(): number {
    return this._ese;
  }

  public get sre(): number {
    return this._sre;
  }

  // --- Execution & Query Dispatcher ---

  public execute(commandLine: string): string | null {
    const trimmed = commandLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return null;
    }

    // Split multiple commands separated by semicolon
    const commands = trimmed.split(";");
    const responses: string[] = [];

    for (const cmd of commands) {
      const resp = this.executeSingle(cmd.trim());
      if (resp !== null) {
        responses.push(resp);
      }
    }

    if (responses.length > 0) {
      return responses.join(";");
    }
    return null;
  }

  public query(commandLine: string): string {
    const res = this.execute(commandLine);
    return res !== null ? res : "";
  }

  public write(commandLine: string): void {
    this.execute(commandLine);
  }

  private executeSingle(cmd: string): string | null {
    if (!cmd) return null;

    // Separate command header from parameters
    let header = cmd;
    let params = "";
    const spaceIdx = cmd.indexOf(" ");
    if (spaceIdx !== -1) {
      header = cmd.substring(0, spaceIdx).trim();
      params = cmd.substring(spaceIdx + 1).trim();
    }

    const upperHeader = header.toUpperCase();

    // 1. IEEE 488.2 Common Commands
    if (upperHeader.startsWith("*")) {
      return this.handleCommonCommand(upperHeader, params);
    }

    // 2. High-Level Trigger & Fetch Commands
    if (upperHeader === "READ?") {
      const reading = this.meter.takeReading();
      return formatScpiNumber(reading.value);
    }

    if (upperHeader === "FETC?" || upperHeader === "FETCH?") {
      if (this.meter.readingBuffer.length > 0) {
        return formatScpiNumber(this.meter.readingBuffer[this.meter.readingBuffer.length - 1]);
      }
      const reading = this.meter.takeReading();
      return formatScpiNumber(reading.value);
    }

    if (upperHeader === "R?") {
      const count = params ? parseInt(params, 10) : 1;
      const readings: number[] = [];
      for (let i = 0; i < count; i++) {
        readings.push(this.meter.takeReading().value);
      }
      return readings.map((v) => formatScpiNumber(v)).join(",");
    }

    if (
      upperHeader === "INIT" || upperHeader === "INIT:IMM" || upperHeader === "INITIATE:IMMEDIATE"
    ) {
      this.meter.isRunning = true;
      this.meter.takeReading();
      return null;
    }

    if (upperHeader === "ABOR" || upperHeader === "ABORT") {
      this.meter.isRunning = false;
      return null;
    }

    // 3. CONFigure Subsystem
    if (upperHeader.startsWith("CONF") || upperHeader.startsWith("CONFIGURE")) {
      return this.handleConfigure(upperHeader, params);
    }

    // 4. MEASure Subsystem
    if (upperHeader.startsWith("MEAS") || upperHeader.startsWith("MEASURE")) {
      return this.handleMeasure(upperHeader, params);
    }

    // 5. SENSe Subsystem
    if (
      upperHeader.startsWith("SENS") || upperHeader.startsWith("SENSE") ||
      upperHeader.startsWith("VOLT") || upperHeader.startsWith("CURR") ||
      upperHeader.startsWith("RES") || upperHeader.startsWith("FRES") ||
      upperHeader.startsWith("FREQ") || upperHeader.startsWith("PER") ||
      upperHeader.startsWith("CAP") || upperHeader.startsWith("CONT") ||
      upperHeader.startsWith("DIOD") || upperHeader.startsWith("TEMP") ||
      upperHeader.startsWith("FUNC")
    ) {
      return this.handleSense(upperHeader, params);
    }

    // 6. CALCulate Subsystem
    if (upperHeader.startsWith("CALC") || upperHeader.startsWith("CALCULATE")) {
      return this.handleCalculate(upperHeader, params);
    }

    // 7. DATA Subsystem
    if (upperHeader.startsWith("DATA")) {
      return this.handleData(upperHeader, params);
    }

    // 8. TRIGger & SAMPle Subsystems
    if (
      upperHeader.startsWith("TRIG") || upperHeader.startsWith("TRIGGER") ||
      upperHeader.startsWith("SAMP") || upperHeader.startsWith("SAMPLE")
    ) {
      return this.handleTriggerAndSample(upperHeader, params);
    }

    // 9. SYSTem Subsystem
    if (upperHeader.startsWith("SYST") || upperHeader.startsWith("SYSTEM")) {
      return this.handleSystem(upperHeader, params);
    }

    // 10. DISPlay Subsystem
    if (upperHeader.startsWith("DISP") || upperHeader.startsWith("DISPLAY")) {
      return this.handleDisplay(upperHeader, params);
    }

    // 11. UNIT Subsystem
    if (upperHeader === "UNIT:TEMP" || upperHeader === "UNIT:TEMPERATURE") {
      const p = params.toUpperCase().trim();
      if (p === "C" || p === "F" || p === "K") {
        this.meter.temperatureUnit = p as TemperatureUnit;
      }
      return null;
    }
    if (upperHeader === "UNIT:TEMP?" || upperHeader === "UNIT:TEMPERATURE?") {
      return this.meter.temperatureUnit;
    }

    this.pushError(-113, `Undefined header: ${header}`);
    return null;
  }

  // --- IEEE 488.2 Common Commands Handler ---

  private handleCommonCommand(header: string, params: string): string | null {
    switch (header) {
      case "*IDN?":
        return this.idn;
      case "*RST":
        this.meter.reset();
        return null;
      case "*CLS":
        this._esr = 0;
        this.clearErrors();
        return null;
      case "*OPC":
        this._opc = true;
        this._esr |= 0x01; // Set OPC bit
        this.updateStb();
        return null;
      case "*OPC?":
        return "1";
      case "*STB?":
        return this.stb.toString();
      case "*ESR?": {
        const val = this._esr;
        this._esr = 0;
        this.updateStb();
        return val.toString();
      }
      case "*ESE": {
        const val = parseInt(params, 10);
        if (!isNaN(val)) {
          this._ese = val & 0xFF;
          this.updateStb();
        }
        return null;
      }
      case "*ESE?":
        return this._ese.toString();
      case "*SRE": {
        const val = parseInt(params, 10);
        if (!isNaN(val)) {
          this._sre = val & 0xFF;
          this.updateStb();
        }
        return null;
      }
      case "*SRE?":
        return this._sre.toString();
      case "*TRG":
        this.meter.takeReading();
        return null;
      case "*WAI":
        return null;
      default:
        this.pushError(-113, `Unknown common command: ${header}`);
        return null;
    }
  }

  // --- CONFigure Subsystem ---

  private handleConfigure(header: string, params: string): string | null {
    if (header === "CONF?" || header === "CONFIGURE?") {
      return `"${this.meter.function} ${this.meter.range}"`;
    }

    // Function mapping
    if (header.includes("VOLT") || header === "CONF" || header === "CONFIGURE") {
      if (header.includes("AC")) {
        this.meter.function = "VOLT:AC";
      } else {
        this.meter.function = "VOLT:DC";
      }
    } else if (header.includes("CURR")) {
      if (header.includes("AC")) {
        this.meter.function = "CURR:AC";
      } else {
        this.meter.function = "CURR:DC";
      }
    } else if (header.includes("FRES")) {
      this.meter.function = "FRES";
    } else if (header.includes("RES")) {
      this.meter.function = "RES";
    } else if (header.includes("FREQ")) {
      this.meter.function = "FREQ";
    } else if (header.includes("PER")) {
      this.meter.function = "PER";
    } else if (header.includes("CAP")) {
      this.meter.function = "CAP";
    } else if (header.includes("CONT")) {
      this.meter.function = "CONT";
    } else if (header.includes("DIOD")) {
      this.meter.function = "DIOD";
    } else if (header.includes("TEMP")) {
      this.meter.function = "TEMP";
    }

    // Handle range parameter if provided
    if (params) {
      const p = params.toUpperCase().trim();
      if (p === "AUTO" || p === "DEF" || p === "MIN" || p === "MAX") {
        this.meter.setRange(p);
      } else {
        const num = parseFloat(p);
        if (!isNaN(num)) {
          this.meter.setRange(num);
        }
      }
    } else {
      this.meter.autoRange = true;
    }

    return null;
  }

  // --- MEASure Subsystem ---

  private handleMeasure(header: string, params: string): string | null {
    this.handleConfigure(header.replace("MEAS", "CONF").replace("?", ""), params);
    const reading = this.meter.takeReading();
    return formatScpiNumber(reading.value);
  }

  // --- SENSe Subsystem ---

  private handleSense(header: string, params: string): string | null {
    // Strip leading [SENSE:] or [SENS:]
    let h = header;
    if (h.startsWith("SENS:") || h.startsWith("SENSE:")) {
      h = h.substring(h.indexOf(":") + 1);
    }

    // If command explicitly references a function prefix (e.g. VOLT:DC:..., CURR:AC:..., RES:...)
    if (h.startsWith("VOLT:DC") || h.startsWith("VOLTAGE:DC")) {
      this.meter.function = "VOLT:DC";
    } else if (h.startsWith("VOLT:AC") || h.startsWith("VOLTAGE:AC")) {
      this.meter.function = "VOLT:AC";
    } else if (h.startsWith("CURR:DC") || h.startsWith("CURRENT:DC")) {
      this.meter.function = "CURR:DC";
    } else if (h.startsWith("CURR:AC") || h.startsWith("CURRENT:AC")) {
      this.meter.function = "CURR:AC";
    } else if (h.startsWith("FRES")) {
      this.meter.function = "FRES";
    } else if (h.startsWith("RES")) {
      this.meter.function = "RES";
    } else if (h.startsWith("FREQ")) {
      this.meter.function = "FREQ";
    } else if (h.startsWith("PER")) {
      this.meter.function = "PER";
    } else if (h.startsWith("CAP")) {
      this.meter.function = "CAP";
    } else if (h.startsWith("CONT")) {
      this.meter.function = "CONT";
    } else if (h.startsWith("DIOD")) {
      this.meter.function = "DIOD";
    } else if (h.startsWith("TEMP")) {
      this.meter.function = "TEMP";
    }

    // FUNCtion
    if (h === "FUNC" || h === "FUNCTION" || h === "FUNC:ON" || h === "FUNCTION:ON") {
      const clean = params.replace(/['"]/g, "").toUpperCase().trim();
      if (this.isMeasurementFunction(clean)) {
        this.meter.function = clean as MeasurementFunction;
      }
      return null;
    }
    if (h === "FUNC?" || h === "FUNCTION?") {
      return `"${this.meter.function}"`;
    }

    // Range queries and sets: VOLT:DC:RANG, CURR:AC:RANG, RES:RANG, etc.
    if (h.includes("RANG") || h.includes("RANGE")) {
      if (h.endsWith("?")) {
        if (h.includes("AUTO?")) {
          return this.meter.autoRange ? "1" : "0";
        }
        return formatScpiNumber(this.meter.range);
      } else {
        if (h.includes("AUTO")) {
          const p = params.toUpperCase().trim();
          this.meter.autoRange = p === "ON" || p === "1" || p === "ONCE";
        } else {
          const p = params.toUpperCase().trim();
          if (p === "AUTO" || p === "MIN" || p === "MAX" || p === "DEF") {
            this.meter.setRange(p);
          } else {
            const num = parseFloat(p);
            if (!isNaN(num)) this.meter.setRange(num);
          }
        }
        return null;
      }
    }

    // NPLC: e.g. VOLT:DC:NPLC 10
    if (h.includes("NPLC")) {
      if (h.endsWith("?")) {
        return this.meter.nplc.toString();
      } else {
        const num = parseFloat(params);
        if (!isNaN(num)) {
          this.meter.nplc = num;
          if (num >= 10) this.meter.speed = "SLOW";
          else if (num >= 1) this.meter.speed = "MED";
          else this.meter.speed = "FAST";
        }
        return null;
      }
    }

    // NULL / Relative
    if (h.includes("NULL")) {
      if (h.includes("VAL")) {
        if (h.endsWith("?")) {
          return formatScpiNumber(this.meter.nullValue);
        } else {
          const num = parseFloat(params);
          if (!isNaN(num)) {
            this.meter.nullValue = num;
            this.meter.nullAuto = false;
          }
          return null;
        }
      }
      if (h.endsWith("?")) {
        return this.meter.nullEnabled ? "1" : "0";
      } else {
        const p = params.toUpperCase().trim();
        this.meter.nullEnabled = p === "ON" || p === "1";
        if (this.meter.nullEnabled && this.meter.nullAuto) {
          this.meter.nullValue = this.meter.takeReading().value;
        }
        return null;
      }
    }

    // Input impedance: VOLT:DC:IMP
    if (h.includes("IMP") || h.includes("IMPEDANCE")) {
      if (h.endsWith("?")) {
        return this.meter.inputImpedance;
      } else {
        const p = params.toUpperCase().trim();
        if (p.includes("10G")) this.meter.inputImpedance = "10G";
        else this.meter.inputImpedance = "10M";
        return null;
      }
    }

    // Continuity threshold: CONT:THR:VAL
    if (h.includes("CONT") && (h.includes("THR") || h.includes("THRESHOLD"))) {
      if (h.endsWith("?")) {
        return this.meter.continuityThreshold.toString();
      } else {
        const num = parseFloat(params);
        if (!isNaN(num)) this.meter.continuityThreshold = num;
        return null;
      }
    }

    // Temperature transducer
    if (h.includes("TEMP")) {
      if (h.includes("TRAN?") || h.includes("TRANSDUCER?")) {
        return `"${this.meter.transducerType},${this.meter.transducerName}"`;
      }
      if (h.includes("UNIT")) {
        if (h.endsWith("?")) return this.meter.temperatureUnit;
        const p = params.toUpperCase().trim();
        if (p === "C" || p === "F" || p === "K") {
          this.meter.temperatureUnit = p as TemperatureUnit;
        }
        return null;
      }
    }

    return null;
  }

  // --- CALCulate Subsystem ---

  private handleCalculate(header: string, params: string): string | null {
    const h = header.replace(/^(CALC:|CALCULATE:)/, "");

    if (h === "CLE" || h === "CLEAR" || h === "CLE:IMM" || h === "CLEAR:IMMEDIATE") {
      this.meter.clearStatistics();
      this.meter.clearHistogram();
      return null;
    }

    // CALCulate:AVERage (Statistics)
    if (h.startsWith("AVER") || h.startsWith("AVERAGE")) {
      if (h === "AVER:ALL?" || h === "AVERAGE:ALL?") {
        const s = this.meter.stats;
        return `${formatScpiNumber(s.average)},${formatScpiNumber(s.max)},${
          formatScpiNumber(s.min)
        },${formatScpiNumber(s.span)},${formatScpiNumber(s.stdDev)},${s.count}`;
      }
      if (h === "AVER:MIN?" || h === "AVERAGE:MINIMUM?") {
        return formatScpiNumber(this.meter.stats.min);
      }
      if (h === "AVER:MAX?" || h === "AVERAGE:MAXIMUM?") {
        return formatScpiNumber(this.meter.stats.max);
      }
      if (h === "AVER:AVER?" || h === "AVERAGE:AVERAGE?") {
        return formatScpiNumber(this.meter.stats.average);
      }
      if (h === "AVER:COUN?" || h === "AVERAGE:COUNT?") return this.meter.stats.count.toString();
      if (h === "AVER:PTP?" || h === "AVERAGE:PTPEAK?") {
        return formatScpiNumber(this.meter.stats.span);
      }
      if (h === "AVER:SDEV?" || h === "AVERAGE:SDEVIATION?") {
        return formatScpiNumber(this.meter.stats.stdDev);
      }
      if (h === "AVER:CLE" || h === "AVERAGE:CLEAR") {
        this.meter.clearStatistics();
        return null;
      }
      if (h.endsWith("?")) {
        return this.meter.statisticsEnabled ? "1" : "0";
      } else {
        const p = params.toUpperCase().trim();
        this.meter.statisticsEnabled = p === "ON" || p === "1";
        return null;
      }
    }

    // CALCulate:LIMit
    if (h.startsWith("LIM") || h.startsWith("LIMIT")) {
      if (h.includes("LOW")) {
        if (h.endsWith("?")) return formatScpiNumber(this.meter.limits.low);
        const num = parseFloat(params);
        if (!isNaN(num)) this.meter.limits.low = num;
        return null;
      }
      if (h.includes("UPP") || h.includes("HIGH")) {
        if (h.endsWith("?")) return formatScpiNumber(this.meter.limits.high);
        const num = parseFloat(params);
        if (!isNaN(num)) this.meter.limits.high = num;
        return null;
      }
      if (h === "LIM:CLE" || h === "LIMIT:CLEAR") {
        this.meter.limits.passCount = 0;
        this.meter.limits.highCount = 0;
        this.meter.limits.lowCount = 0;
        this.meter.limits.status = "NONE";
        return null;
      }
      if (h.endsWith("?")) {
        return this.meter.limits.enabled ? "1" : "0";
      } else {
        const p = params.toUpperCase().trim();
        this.meter.limits.enabled = p === "ON" || p === "1";
        return null;
      }
    }

    // CALCulate:SCALe (dB / dBm)
    if (h.startsWith("SCAL") || h.startsWith("SCALE")) {
      if (h.includes("FUNC")) {
        if (h.endsWith("?")) return this.meter.mathFunction;
        const p = params.toUpperCase().trim();
        if (p === "DB" || p === "DBM") {
          this.meter.mathFunction = p;
        }
        return null;
      }
      if (h.includes("DB:REF")) {
        if (h.endsWith("?")) return this.meter.dbReference.toString();
        const num = parseFloat(params);
        if (!isNaN(num)) this.meter.dbReference = num;
        return null;
      }
      if (h.includes("DBM:REF")) {
        if (h.endsWith("?")) return this.meter.dbmReference.toString();
        const num = parseFloat(params);
        if (!isNaN(num)) this.meter.dbmReference = num;
        return null;
      }
      if (h.endsWith("?")) {
        return (this.meter.mathFunction === "DB" || this.meter.mathFunction === "DBM") ? "1" : "0";
      } else {
        const p = params.toUpperCase().trim();
        if (p === "ON" || p === "1") {
          if (this.meter.mathFunction !== "DB" && this.meter.mathFunction !== "DBM") {
            this.meter.mathFunction = "DB";
          }
        } else {
          this.meter.mathFunction = "NONE";
        }
        return null;
      }
    }

    // CALCulate:NULL
    if (h.startsWith("NULL")) {
      if (h.includes("VAL")) {
        if (h.endsWith("?")) return formatScpiNumber(this.meter.nullValue);
        const num = parseFloat(params);
        if (!isNaN(num)) this.meter.nullValue = num;
        return null;
      }
      if (h.endsWith("?")) return this.meter.nullEnabled ? "1" : "0";
      const p = params.toUpperCase().trim();
      this.meter.nullEnabled = p === "ON" || p === "1";
      return null;
    }

    // CALCulate:TRANsform:HISTogram
    if (h.startsWith("TRAN:HIST") || h.startsWith("TRANSFORM:HISTOGRAM")) {
      if (h.includes("COUN?")) return this.meter.histogram.sampleCount.toString();
      if (h.includes("POIN") || h.includes("POINTS")) {
        if (h.endsWith("?")) return this.meter.histogram.binCount.toString();
        const num = parseInt(params, 10);
        if (!isNaN(num) && num > 0) {
          this.meter.histogram.binCount = num;
          this.meter.clearHistogram();
        }
        return null;
      }
      if (h.includes("CLE") || h.includes("CLEAR")) {
        this.meter.clearHistogram();
        return null;
      }
      if (h.endsWith("?")) return this.meter.histogram.enabled ? "1" : "0";
      const p = params.toUpperCase().trim();
      this.meter.histogram.enabled = p === "ON" || p === "1";
      return null;
    }

    return null;
  }

  // --- DATA Subsystem ---

  private handleData(header: string, params: string): string | null {
    if (header === "DATA:LAST?" || header === "DATA:LAST") {
      return formatScpiNumber(this.meter.lastReading.value);
    }
    if (header === "DATA:POIN?" || header === "DATA:POINTS?" || header === "DATA:POINTS") {
      return this.meter.readingBuffer.length.toString();
    }
    if (header === "DATA:DATA?" || header === "DATA?") {
      return this.meter.readingBuffer.map((v) => formatScpiNumber(v)).join(",");
    }
    if (header.startsWith("DATA:REM?") || header.startsWith("DATA:REMOVE?")) {
      const count = parseInt(params, 10) || 1;
      const removed = this.meter.readingBuffer.splice(0, count);
      return removed.map((v) => formatScpiNumber(v)).join(",");
    }
    return null;
  }

  // --- TRIGger & SAMPle Subsystems ---

  private handleTriggerAndSample(header: string, params: string): string | null {
    if (header === "TRIG:SOUR" || header === "TRIGGER:SOURCE") {
      const p = params.toUpperCase().trim();
      if (p.startsWith("IMM")) this.meter.triggerSource = "IMM";
      else if (p.startsWith("EXT")) this.meter.triggerSource = "EXT";
      else if (p.startsWith("BUS")) this.meter.triggerSource = "BUS";
      return null;
    }
    if (header === "TRIG:SOUR?" || header === "TRIGGER:SOURCE?") {
      return this.meter.triggerSource === "IMM" ? "IMM" : this.meter.triggerSource;
    }
    if (header === "TRIG:COUN" || header === "TRIGGER:COUNT") {
      const num = parseInt(params, 10);
      if (!isNaN(num)) this.meter.triggerCount = num;
      return null;
    }
    if (header === "TRIG:COUN?" || header === "TRIGGER:COUNT?") {
      return this.meter.triggerCount.toString();
    }
    if (header === "TRIG:DEL" || header === "TRIGGER:DELAY") {
      const num = parseFloat(params);
      if (!isNaN(num)) this.meter.triggerDelay = num;
      return null;
    }
    if (header === "TRIG:DEL?" || header === "TRIGGER:DELAY?") {
      return this.meter.triggerDelay.toString();
    }
    if (header === "SAMP:COUN" || header === "SAMPLE:COUNT") {
      const num = parseInt(params, 10);
      if (!isNaN(num)) this.meter.sampleCount = num;
      return null;
    }
    if (header === "SAMP:COUN?" || header === "SAMPLE:COUNT?") {
      return this.meter.sampleCount.toString();
    }
    return null;
  }

  // --- SYSTem Subsystem ---

  private handleSystem(header: string, params: string): string | null {
    if (header === "SYST:ERR?" || header === "SYSTEM:ERROR?") {
      const err = this.popError();
      return `${err.code},"${err.message}"`;
    }
    if (header === "SYST:ERR:COUN?" || header === "SYSTEM:ERROR:COUNT?") {
      return this._errorQueue.length.toString();
    }
    if (header === "SYST:VERS?" || header === "SYSTEM:VERSION?") {
      return "1999.0";
    }
    if (header === "SYST:PRES" || header === "SYSTEM:PRESET") {
      this.meter.reset();
      return null;
    }
    if (header === "SYST:BEEP" || header === "SYSTEM:BEEPER" || header === "SYST:BEEP:IMM") {
      this.meter.beeping = true;
      return null;
    }
    if (header === "SYST:BEEP:STAT" || header === "SYSTEM:BEEPER:STATE") {
      const p = params.toUpperCase().trim();
      this.meter.beeperEnabled = p === "ON" || p === "1";
      return null;
    }
    if (header === "SYST:BEEP:STAT?" || header === "SYSTEM:BEEPER:STATE?") {
      return this.meter.beeperEnabled ? "1" : "0";
    }
    return null;
  }

  // --- DISPlay Subsystem ---

  private handleDisplay(header: string, params: string): string | null {
    if (header === "DISP:MODE" || header === "DISPLAY:MODE") {
      const p = params.toUpperCase().trim();
      if (p.startsWith("NUM")) this.meter.displayMode = "NUMBER";
      else if (p.startsWith("BAR")) this.meter.displayMode = "BAR";
      else if (p.startsWith("TREN")) this.meter.displayMode = "TREND";
      else if (p.startsWith("HIST")) this.meter.displayMode = "HISTOGRAM";
      return null;
    }
    if (header === "DISP:MODE?" || header === "DISPLAY:MODE?") {
      return this.meter.displayMode;
    }
    if (
      header === "DISP:DUAL" || header === "DISPLAY:DUAL" || header === "DISP:DUAL:STAT" ||
      header === "DISPLAY:DUAL:STATE"
    ) {
      const p = params.toUpperCase().trim();
      this.meter.dualEnabled = p === "ON" || p === "1";
      return null;
    }
    if (
      header === "DISP:DUAL?" || header === "DISPLAY:DUAL?" || header === "DISP:DUAL:STAT?" ||
      header === "DISPLAY:DUAL:STATE?"
    ) {
      return this.meter.dualEnabled ? "1" : "0";
    }
    if (header === "DISP:DUAL:FUNC" || header === "DISPLAY:DUAL:FUNCTION") {
      const clean = params.replace(/['"]/g, "").toUpperCase().trim();
      if (this.isMeasurementFunction(clean)) {
        this.meter.secondaryFunction = clean as MeasurementFunction;
      }
      return null;
    }
    if (header === "DISP:DUAL:FUNC?" || header === "DISPLAY:DUAL:FUNCTION?") {
      return `"${this.meter.secondaryFunction}"`;
    }
    return null;
  }

  private isMeasurementFunction(fn: string): boolean {
    const valid: MeasurementFunction[] = [
      "VOLT:DC",
      "VOLT:AC",
      "CURR:DC",
      "CURR:AC",
      "RES",
      "FRES",
      "CAP",
      "CONT",
      "DIOD",
      "FREQ",
      "PER",
      "TEMP",
    ];
    return valid.includes(fn as MeasurementFunction);
  }
}
