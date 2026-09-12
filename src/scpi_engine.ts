/**
 * SCPI Engine for the simulated oscilloscope.
 * Implements IEEE 488.2 common commands, status reporting registers,
 * error queue FIFO, Siglent SDS1000X-compatible subsystem commands,
 * measurement queries, signal generator manipulation, and waveform data transfers.
 */

import {
  CursorType,
  GridType,
  OscilloscopeSimulation,
} from "./oscilloscope.ts";

export interface ScpiError {
  code: number;
  message: string;
}

export class ScpiEngine {
  public scope: OscilloscopeSimulation;

  // Status Registers (IEEE 488.2)
  private _stb: number = 0; // Status Byte Register
  private _esr: number = 0; // Standard Event Status Register
  private _ese: number = 0; // Event Status Enable Register
  private _sre: number = 0; // Service Request Enable Register
  private _opc: boolean = false;

  // Error Queue FIFO (max 32 entries)
  private _errorQueue: ScpiError[] = [];
  private static readonly MAX_QUEUE_SIZE = 32;

  // Identification string
  public idn: string = "Siglent Technologies,SDS1202X-E,SDS1202X-SIM,2.0.1.1";

  constructor(scope?: OscilloscopeSimulation) {
    this.scope = scope || new OscilloscopeSimulation();
  }

  // --- Status & Error Management ---

  pushError(code: number, message: string): void {
    if (this._errorQueue.length < ScpiEngine.MAX_QUEUE_SIZE) {
      this._errorQueue.push({ code, message });
    }
    // Set Execution Error (bit 4) or Command Error (bit 5) or Device-Dependent (bit 3)
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

  popError(): ScpiError {
    const err = this._errorQueue.shift();
    this.updateStb();
    if (err) return err;
    return { code: 0, message: "No error" };
  }

  clearErrors(): void {
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

    // MAV is Bit 4 (Message Available)
    // Error queue available: Bit 2 or standard error flags
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

  get stb(): number {
    this.updateStb();
    return this._stb;
  }

  get esr(): number {
    return this._esr;
  }

  get ese(): number {
    return this._ese;
  }

  get sre(): number {
    return this._sre;
  }

  // --- Command Execution & Parsing ---

  /**
   * Executes a SCPI command or semicolon-separated compound command string.
   * Returns response string for queries, or null/empty if no queries in command.
   */
  execute(commandString: string): string | null {
    if (!commandString || typeof commandString !== "string") {
      this.pushError(-100, "Command error: empty command");
      return null;
    }

    const trimmed = commandString.trim();
    if (trimmed.length === 0) return null;

    // Split compound commands by semicolon (ignoring semicolons in quotes)
    const statements = this.splitCompoundStatements(trimmed);
    const responses: string[] = [];

    for (const statement of statements) {
      const resp = this.executeSingle(statement.trim());
      if (resp !== null && resp !== undefined) {
        responses.push(resp);
      }
    }

    return responses.length > 0 ? responses.join(";") : null;
  }

  /**
   * Directly executes query and returns string.
   */
  query(queryString: string): string {
    const resp = this.execute(queryString);
    return resp !== null ? resp : "";
  }

  /**
   * Directly executes command.
   */
  write(commandString: string): void {
    this.execute(commandString);
  }

  private splitCompoundStatements(cmd: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";

    for (let i = 0; i < cmd.length; i++) {
      const char = cmd[i];
      if ((char === '"' || char === "'") && (i === 0 || cmd[i - 1] !== "\\")) {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (quoteChar === char) {
          inQuote = false;
        }
      }

      if (char === ";" && !inQuote) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim().length > 0) {
      result.push(current);
    }
    return result;
  }

  private executeSingle(command: string): string | null {
    if (!command) return null;

    // Parse header and arguments
    // E.g. "C1:VDIV 2.0" -> header: "C1:VDIV", args: "2.0"
    // E.g. "*IDN?" -> header: "*IDN?", args: ""
    let header = command;
    let argsStr = "";

    const firstSpace = command.indexOf(" ");
    if (firstSpace !== -1) {
      header = command.substring(0, firstSpace).trim();
      argsStr = command.substring(firstSpace + 1).trim();
    }

    const _isQuery = header.endsWith("?");
    const cleanHeader = header.toUpperCase();

    // 1. IEEE 488.2 Common Commands
    if (cleanHeader.startsWith("*")) {
      return this.handleCommonCommand(cleanHeader, argsStr);
    }

    // 2. System Subsystem
    if (cleanHeader.startsWith("SYST") || cleanHeader.startsWith("SYSTEM")) {
      return this.handleSystemCommand(cleanHeader, argsStr);
    }

    // 3. Siglent / Standard Channel 1 commands (C1:... / CHAN1:... / CHANNEL1:...)
    if (
      cleanHeader.startsWith("C1:") || cleanHeader.startsWith("CHAN1:") ||
      cleanHeader.startsWith("CHANNEL1:")
    ) {
      return this.handleChannelCommand(1, cleanHeader, argsStr);
    }

    // 4. Siglent / Standard Channel 2 commands (C2:... / CHAN2:... / CHANNEL2:...)
    if (
      cleanHeader.startsWith("C2:") || cleanHeader.startsWith("CHAN2:") ||
      cleanHeader.startsWith("CHANNEL2:")
    ) {
      return this.handleChannelCommand(2, cleanHeader, argsStr);
    }

    // 5. Timebase / Horizontal commands (TDIV, TRDL, TIM:..., TIMEBASE:...)
    if (
      cleanHeader === "TDIV" ||
      cleanHeader === "TDIV?" ||
      cleanHeader === "TRDL" ||
      cleanHeader === "TRDL?" ||
      cleanHeader.startsWith("TIM:") ||
      cleanHeader.startsWith("TIMEBASE:")
    ) {
      return this.handleTimebaseCommand(cleanHeader, argsStr);
    }

    // 6. Trigger Subsystem (TRIG:..., TRIGGER:..., TRSE, ARM, STOP, RUN)
    if (
      cleanHeader.startsWith("TRIG") ||
      cleanHeader.startsWith("TRIGGER") ||
      cleanHeader === "TRSE" ||
      cleanHeader === "TRSE?" ||
      cleanHeader === "ARM" ||
      cleanHeader === "STOP" ||
      cleanHeader === "RUN"
    ) {
      return this.handleTriggerCommand(cleanHeader, argsStr);
    }

    // 7. Measurement Subsystem (MEAS:..., MEASURE:...)
    if (cleanHeader.startsWith("MEAS") || cleanHeader.startsWith("MEASURE")) {
      return this.handleMeasurementCommand(cleanHeader, argsStr);
    }

    // 8. Cursor Subsystem (CURS:..., CURSOR:...)
    if (cleanHeader.startsWith("CURS") || cleanHeader.startsWith("CURSOR")) {
      return this.handleCursorCommand(cleanHeader, argsStr);
    }

    // 9. Display Subsystem (DISP:..., DISPLAY:...)
    if (cleanHeader.startsWith("DISP") || cleanHeader.startsWith("DISPLAY")) {
      return this.handleDisplayCommand(cleanHeader, argsStr);
    }

    // 10. Waveform Data (WAV:..., WAVEFORM:...)
    if (cleanHeader.startsWith("WAV") || cleanHeader.startsWith("WAVEFORM")) {
      return this.handleWaveformCommand(cleanHeader, argsStr);
    }

    // Unknown command
    this.pushError(-113, `Undefined header: ${header}`);
    return null;
  }

  // --- Subsystem Handlers ---

  private handleCommonCommand(header: string, args: string): string | null {
    switch (header) {
      case "*IDN?":
        return this.idn;

      case "*RST":
        this.scope.reset();
        this._esr = 0;
        this._opc = false;
        this.updateStb();
        return null;

      case "*CLS":
        this._esr = 0;
        this.clearErrors();
        return null;

      case "*STB?":
        return this.stb.toString();

      case "*ESR?": {
        const val = this._esr;
        this._esr = 0; // Reading ESR clears it
        this.updateStb();
        return val.toString();
      }

      case "*ESE": {
        const val = parseInt(args, 10);
        if (!isNaN(val)) {
          this._ese = val & 0xFF;
          this.updateStb();
        } else {
          this.pushError(-109, "Missing parameter for *ESE");
        }
        return null;
      }

      case "*ESE?":
        return this._ese.toString();

      case "*SRE": {
        const val = parseInt(args, 10);
        if (!isNaN(val)) {
          this._sre = val & 0xFF;
          this.updateStb();
        } else {
          this.pushError(-109, "Missing parameter for *SRE");
        }
        return null;
      }

      case "*SRE?":
        return this._sre.toString();

      case "*OPC":
        this._opc = true;
        this._esr |= 0x01; // Set OPC bit
        this.updateStb();
        return null;

      case "*OPC?":
        return "1";

      case "*WAI":
        // Wait-to-continue: already synchronous
        return null;

      default:
        this.pushError(-113, `Undefined common command: ${header}`);
        return null;
    }
  }

  private handleSystemCommand(header: string, _args: string): string | null {
    if (
      header === "SYST:ERR?" || header === "SYSTEM:ERROR?" ||
      header === "SYST:ERR:NEXT?"
    ) {
      const err = this.popError();
      return `${err.code},"${err.message}"`;
    }

    if (header === "SYST:ERR:COUN?" || header === "SYSTEM:ERROR:COUNT?") {
      return this._errorQueue.length.toString();
    }

    if (header === "SYST:VERS?" || header === "SYSTEM:VERSION?") {
      return "1999.0";
    }

    if (header === "SYST:STAT?" || header === "SYSTEM:STATUS?") {
      return JSON.stringify({
        stb: this.stb,
        esr: this.esr,
        errorCount: this._errorQueue.length,
        running: this.scope.isRunning,
      });
    }

    this.pushError(-113, `Undefined system command: ${header}`);
    return null;
  }

  private handleChannelCommand(
    channelId: 1 | 2,
    header: string,
    args: string,
  ): string | null {
    const ch = channelId === 1 ? this.scope.ch1 : this.scope.ch2;
    // Strip prefix (e.g. "C1:", "CHAN1:", "CHANNEL1:")
    const sub = header.replace(/^(C[12]|CHAN[12]|CHANNEL[12]):/, "");

    // Vertical Scale / Volts per Div
    if (sub === "VDIV" || sub === "SCAL" || sub === "SCALE") {
      const val = parseFloat(args);
      if (!isNaN(val) && val > 0) {
        ch.voltDiv = val;
      } else {
        this.pushError(-222, "Data out of range for VDIV");
      }
      return null;
    }
    if (sub === "VDIV?" || sub === "SCAL?" || sub === "SCALE?") {
      return ch.voltDiv.toString();
    }

    // Vertical Offset
    if (sub === "OFST" || sub === "OFFSET" || sub === "OFFS") {
      const val = parseFloat(args);
      if (!isNaN(val)) {
        ch.offset = val;
      } else {
        this.pushError(-222, "Data out of range for OFST");
      }
      return null;
    }
    if (sub === "OFST?" || sub === "OFFSET?" || sub === "OFFS?") {
      return ch.offset.toString();
    }

    // Channel Trace Display (Enable/Disable)
    if (
      sub === "TRA" || sub === "DISP" || sub === "DISPLAY" || sub === "STATE"
    ) {
      const upper = args.toUpperCase();
      if (upper === "ON" || upper === "1" || upper === "YES") {
        ch.enabled = true;
      } else if (upper === "OFF" || upper === "0" || upper === "NO") {
        ch.enabled = false;
      } else {
        this.pushError(-224, "Illegal parameter value for TRA");
      }
      return null;
    }
    if (
      sub === "TRA?" || sub === "DISP?" || sub === "DISPLAY?" ||
      sub === "STATE?"
    ) {
      return ch.enabled ? "ON" : "OFF";
    }

    // Coupling (DC, AC, GND)
    if (sub === "COUP" || sub === "COUPLING") {
      const upper = args.toUpperCase();
      if (upper === "A1M" || upper === "AC") ch.coupling = "AC";
      else if (upper === "D1M" || upper === "DC") ch.coupling = "DC";
      else if (upper === "GND") ch.coupling = "GND";
      else this.pushError(-224, `Illegal coupling mode: ${args}`);
      return null;
    }
    if (sub === "COUP?" || sub === "COUPLING?") {
      return ch.coupling;
    }

    // Invert
    if (sub === "INVS" || sub === "INV" || sub === "INVERT") {
      const upper = args.toUpperCase();
      ch.inverted = upper === "ON" || upper === "1";
      return null;
    }
    if (sub === "INVS?" || sub === "INV?" || sub === "INVERT?") {
      return ch.inverted ? "ON" : "OFF";
    }

    // Probe attenuation
    if (sub === "PROB" || sub === "PROBE") {
      const val = parseFloat(args);
      if (!isNaN(val) && val > 0) ch.probe = val;
      return null;
    }
    if (sub === "PROB?" || sub === "PROBE?") {
      return ch.probe.toString();
    }

    // Vertical Zoom & Pan
    if (sub === "ZOOM") {
      const val = parseFloat(args);
      if (!isNaN(val) && val > 0) ch.zoom = val;
      return null;
    }
    if (sub === "ZOOM?") {
      return ch.zoom.toString();
    }
    if (sub === "PAN") {
      const val = parseFloat(args);
      if (!isNaN(val)) ch.pan = val;
      return null;
    }
    if (sub === "PAN?") {
      return ch.pan.toString();
    }

    // Siglent Parameter Value Query: C1:PAVA? <param>
    if (sub === "PAVA?") {
      const param = args.toUpperCase().trim();
      const measurements = this.scope.getMeasurements(channelId);
      switch (param) {
        case "PKPK":
        case "VPP":
          return `${ch.name}:PAVA PKPK,${measurements.vpp}V`;
        case "MAX":
        case "VMAX":
          return `${ch.name}:PAVA MAX,${measurements.vmax}V`;
        case "MIN":
        case "VMIN":
          return `${ch.name}:PAVA MIN,${measurements.vmin}V`;
        case "RMS":
        case "VRMS":
          return `${ch.name}:PAVA RMS,${measurements.vrms}V`;
        case "MEAN":
        case "VAVG":
          return `${ch.name}:PAVA MEAN,${measurements.vavg}V`;
        case "AMPL":
        case "VAMP":
          return `${ch.name}:PAVA AMPL,${measurements.vamp}V`;
        case "TOP":
        case "VTOP":
          return `${ch.name}:PAVA TOP,${measurements.vtop}V`;
        case "BASE":
        case "VBASE":
          return `${ch.name}:PAVA BASE,${measurements.vbase}V`;
        case "FREQ":
          return `${ch.name}:PAVA FREQ,${measurements.frequency}Hz`;
        case "PER":
        case "PERIOD":
          return `${ch.name}:PAVA PER,${measurements.period}S`;
        case "RISE":
          return `${ch.name}:PAVA RISE,${measurements.riseTime}S`;
        case "FALL":
          return `${ch.name}:PAVA FALL,${measurements.fallTime}S`;
        case "DUTY":
          return `${ch.name}:PAVA DUTY,${
            (measurements.dutyCycle * 100).toFixed(2)
          }%`;
        case "ALL":
          return JSON.stringify(measurements);
        default:
          this.pushError(-224, `Unknown measurement parameter: ${param}`);
          return null;
      }
    }

    // Waveform query: C1:WF? [DAT2|ALL]
    if (sub === "WF?" || sub === "WAVEFORM?") {
      const frame = this.scope.acquire();
      const chData = channelId === 1 ? frame.ch1.data : frame.ch2.data;
      if (!chData) return "NO DATA";
      const sampleList = Array.from(chData.voltage).map((v) => v.toFixed(4))
        .join(",");
      return `${ch.name}:WF DAT2,#9${
        sampleList.length.toString().padStart(9, "0")
      }${sampleList}`;
    }

    // Signal Generator Manipulation for Channel input (WAVE:...)
    if (sub.startsWith("WAVE:")) {
      return this.handleWaveformGenCommand(
        ch.generator,
        sub.substring(5),
        args,
      );
    }

    this.pushError(-113, `Undefined channel command: ${header}`);
    return null;
  }

  private handleWaveformGenCommand(
    gen: OscilloscopeSimulation["ch1"]["generator"],
    sub: string,
    args: string,
  ): string | null {
    if (sub === "TYPE") {
      try {
        gen.setType(args);
      } catch (e) {
        this.pushError(-224, (e as Error).message);
      }
      return null;
    }
    if (sub === "TYPE?") {
      return gen.type.toUpperCase();
    }

    if (sub === "FREQ" || sub === "FREQUENCY") {
      const val = parseFloat(args);
      if (!isNaN(val) && val >= 0) gen.setFrequency(val);
      else this.pushError(-222, "Invalid frequency value");
      return null;
    }
    if (sub === "FREQ?" || sub === "FREQUENCY?") {
      return gen.frequency.toString();
    }

    if (sub === "AMP" || sub === "AMPLITUDE") {
      const val = parseFloat(args);
      if (!isNaN(val) && val >= 0) gen.setAmplitude(val);
      else this.pushError(-222, "Invalid amplitude value");
      return null;
    }
    if (sub === "AMP?" || sub === "AMPLITUDE?") {
      return gen.amplitude.toString();
    }

    if (sub === "PHASE") {
      const val = parseFloat(args);
      if (!isNaN(val)) gen.setPhase(val);
      else this.pushError(-222, "Invalid phase value");
      return null;
    }
    if (sub === "PHASE?") {
      return gen.phase.toString();
    }

    if (sub === "OFST" || sub === "OFFSET") {
      const val = parseFloat(args);
      if (!isNaN(val)) gen.setOffset(val);
      else this.pushError(-222, "Invalid offset value");
      return null;
    }
    if (sub === "OFST?" || sub === "OFFSET?") {
      return gen.offset.toString();
    }

    if (sub === "DUTY" || sub === "DUTYCYCLE") {
      const val = parseFloat(args);
      if (!isNaN(val) && val >= 0 && val <= 1) gen.setDutyCycle(val);
      else this.pushError(-222, "Invalid duty cycle (0.0 - 1.0)");
      return null;
    }
    if (sub === "DUTY?" || sub === "DUTYCYCLE?") {
      return gen.dutyCycle.toString();
    }

    if (sub === "SCAL" || sub === "SCALE") {
      const val = parseFloat(args);
      if (!isNaN(val)) gen.setScale(val);
      else this.pushError(-222, "Invalid scale value");
      return null;
    }
    if (sub === "SCAL?" || sub === "SCALE?") {
      return gen.scale.toString();
    }

    this.pushError(-113, `Undefined waveform generator command: WAVE:${sub}`);
    return null;
  }

  private handleTimebaseCommand(header: string, args: string): string | null {
    if (
      header === "TDIV" || header === "TIM:SCAL" || header === "TIMEBASE:SCALE"
    ) {
      const val = parseFloat(args);
      if (!isNaN(val) && val > 0) this.scope.timeDiv = val;
      else this.pushError(-222, "Invalid timebase scale");
      return null;
    }
    if (
      header === "TDIV?" || header === "TIM:SCAL?" ||
      header === "TIMEBASE:SCALE?"
    ) {
      return this.scope.timeDiv.toString();
    }

    if (
      header === "TRDL" || header === "TIM:OFFS" || header === "TIMEBASE:OFFSET"
    ) {
      const val = parseFloat(args);
      if (!isNaN(val)) this.scope.timeOffset = val;
      else this.pushError(-222, "Invalid timebase offset");
      return null;
    }
    if (
      header === "TRDL?" || header === "TIM:OFFS?" ||
      header === "TIMEBASE:OFFSET?"
    ) {
      return this.scope.timeOffset.toString();
    }

    if (header === "TIM:ZOOM" || header === "TIMEBASE:ZOOM") {
      const val = parseFloat(args);
      if (!isNaN(val) && val > 0) this.scope.timeZoom = val;
      return null;
    }
    if (header === "TIM:ZOOM?" || header === "TIMEBASE:ZOOM?") {
      return this.scope.timeZoom.toString();
    }

    if (header === "TIM:PAN" || header === "TIMEBASE:PAN") {
      const val = parseFloat(args);
      if (!isNaN(val)) this.scope.timePan = val;
      return null;
    }
    if (header === "TIM:PAN?" || header === "TIMEBASE:PAN?") {
      return this.scope.timePan.toString();
    }

    this.pushError(-113, `Undefined timebase command: ${header}`);
    return null;
  }

  private handleTriggerCommand(header: string, args: string): string | null {
    if (header === "ARM" || header === "TRIG:ARM") {
      this.scope.single();
      return null;
    }
    if (header === "RUN" || header === "TRIG:RUN") {
      this.scope.run();
      return null;
    }
    if (header === "STOP" || header === "TRIG:STOP") {
      this.scope.stop();
      return null;
    }

    if (
      header === "TRIG:MODE" || header === "TRIGGER:MODE" || header === "TRSE"
    ) {
      const upper = args.toUpperCase();
      if (upper.includes("AUTO")) this.scope.triggerMode = "AUTO";
      else if (upper.includes("NORM")) this.scope.triggerMode = "NORM";
      else if (upper.includes("SING")) this.scope.triggerMode = "SINGLE";
      else this.pushError(-224, `Invalid trigger mode: ${args}`);
      return null;
    }
    if (
      header === "TRIG:MODE?" || header === "TRIGGER:MODE?" ||
      header === "TRSE?"
    ) {
      return this.scope.triggerMode;
    }

    if (
      header === "TRIG:SOUR" || header === "TRIG:EDGE:SOUR" ||
      header === "TRIGGER:SOURCE"
    ) {
      const upper = args.toUpperCase();
      if (upper === "C1" || upper === "CH1") this.scope.triggerSource = "CH1";
      else if (upper === "C2" || upper === "CH2") {
        this.scope.triggerSource = "CH2";
      } else if (upper === "EXT") this.scope.triggerSource = "EXT";
      else this.pushError(-224, `Invalid trigger source: ${args}`);
      return null;
    }
    if (
      header === "TRIG:SOUR?" || header === "TRIG:EDGE:SOUR?" ||
      header === "TRIGGER:SOURCE?"
    ) {
      return this.scope.triggerSource;
    }

    if (
      header === "TRIG:SLOP" || header === "TRIG:EDGE:SLOP" ||
      header === "TRIGGER:SLOPE"
    ) {
      const upper = args.toUpperCase();
      if (upper === "POS" || upper === "RISING") {
        this.scope.triggerSlope = "POS";
      } else if (upper === "NEG" || upper === "FALLING") {
        this.scope.triggerSlope = "NEG";
      } else this.pushError(-224, `Invalid trigger slope: ${args}`);
      return null;
    }
    if (
      header === "TRIG:SLOP?" || header === "TRIG:EDGE:SLOP?" ||
      header === "TRIGGER:SLOPE?"
    ) {
      return this.scope.triggerSlope;
    }

    if (
      header === "TRIG:LEV" || header === "TRIG:EDGE:LEV" ||
      header === "TRIGGER:LEVEL"
    ) {
      const val = parseFloat(args);
      if (!isNaN(val)) this.scope.triggerLevel = val;
      else this.pushError(-222, "Invalid trigger level");
      return null;
    }
    if (
      header === "TRIG:LEV?" || header === "TRIG:EDGE:LEV?" ||
      header === "TRIGGER:LEVEL?"
    ) {
      return this.scope.triggerLevel.toString();
    }

    if (header === "TRIG:STAT?" || header === "TRIGGER:STATUS?") {
      return this.scope.triggerStatus;
    }

    this.pushError(-113, `Undefined trigger command: ${header}`);
    return null;
  }

  private handleMeasurementCommand(
    header: string,
    args: string,
  ): string | null {
    let channelId: 1 | 2 = 1;
    const upperArgs = args.toUpperCase().trim();
    if (
      upperArgs.includes("2") || upperArgs.includes("C2") ||
      upperArgs.includes("CHAN2")
    ) {
      channelId = 2;
    }

    const measurements = this.scope.getMeasurements(channelId);

    if (header === "MEAS:VPP?" || header === "MEASURE:VPP?") {
      return measurements.vpp.toString();
    }
    if (header === "MEAS:VMAX?" || header === "MEASURE:VMAX?") {
      return measurements.vmax.toString();
    }
    if (header === "MEAS:VMIN?" || header === "MEASURE:VMIN?") {
      return measurements.vmin.toString();
    }
    if (header === "MEAS:VRMS?" || header === "MEASURE:VRMS?") {
      return measurements.vrms.toString();
    }
    if (header === "MEAS:VAVG?" || header === "MEASURE:VAVG?") {
      return measurements.vavg.toString();
    }
    if (header === "MEAS:VAMP?" || header === "MEASURE:VAMP?") {
      return measurements.vamp.toString();
    }
    if (header === "MEAS:FREQ?" || header === "MEASURE:FREQUENCY?") {
      return measurements.frequency.toString();
    }
    if (header === "MEAS:PER?" || header === "MEASURE:PERIOD?") {
      return measurements.period.toString();
    }
    if (header === "MEAS:RISE?" || header === "MEASURE:RISETIME?") {
      return measurements.riseTime.toString();
    }
    if (header === "MEAS:FALL?" || header === "MEASURE:FALLTIME?") {
      return measurements.fallTime.toString();
    }
    if (header === "MEAS:DUTY?" || header === "MEASURE:DUTYCYCLE?") {
      return (measurements.dutyCycle * 100).toFixed(2);
    }
    if (header === "MEAS:ALL?" || header === "MEASURE:ALL?") {
      return JSON.stringify(measurements);
    }

    this.pushError(-113, `Undefined measurement command: ${header}`);
    return null;
  }

  private handleCursorCommand(header: string, args: string): string | null {
    if (header === "CURS:TYPE" || header === "CURSOR:TYPE") {
      const upper = args.toUpperCase();
      if (
        upper === "OFF" || upper === "MANUAL" || upper === "TRACK" ||
        upper === "AUTO"
      ) {
        this.scope.cursorType = upper as CursorType;
      } else {
        this.pushError(-224, `Invalid cursor type: ${args}`);
      }
      return null;
    }
    if (header === "CURS:TYPE?" || header === "CURSOR:TYPE?") {
      return this.scope.cursorType;
    }

    if (header === "CURS:X1") {
      const val = parseFloat(args);
      if (!isNaN(val)) this.scope.cursorX1 = val;
      return null;
    }
    if (header === "CURS:X1?") return this.scope.cursorX1.toString();

    if (header === "CURS:X2") {
      const val = parseFloat(args);
      if (!isNaN(val)) this.scope.cursorX2 = val;
      return null;
    }
    if (header === "CURS:X2?") return this.scope.cursorX2.toString();

    if (header === "CURS:Y1") {
      const val = parseFloat(args);
      if (!isNaN(val)) this.scope.cursorY1 = val;
      return null;
    }
    if (header === "CURS:Y1?") return this.scope.cursorY1.toString();

    if (header === "CURS:Y2") {
      const val = parseFloat(args);
      if (!isNaN(val)) this.scope.cursorY2 = val;
      return null;
    }
    if (header === "CURS:Y2?") return this.scope.cursorY2.toString();

    if (header === "CURS:XDEL?") {
      return Math.abs(this.scope.cursorX2 - this.scope.cursorX1).toString();
    }
    if (header === "CURS:YDEL?") {
      return Math.abs(this.scope.cursorY2 - this.scope.cursorY1).toString();
    }
    if (header === "CURS:FREQ?") {
      const dx = Math.abs(this.scope.cursorX2 - this.scope.cursorX1);
      return (dx > 0 ? 1 / dx : 0).toString();
    }

    this.pushError(-113, `Undefined cursor command: ${header}`);
    return null;
  }

  private handleDisplayCommand(header: string, args: string): string | null {
    if (header === "DISP:GRID" || header === "DISPLAY:GRID") {
      const upper = args.toUpperCase();
      if (upper === "FULL" || upper === "HALF" || upper === "OFF") {
        this.scope.grid = upper as GridType;
      } else this.pushError(-224, `Invalid grid mode: ${args}`);
      return null;
    }
    if (header === "DISP:GRID?" || header === "DISPLAY:GRID?") {
      return this.scope.grid;
    }

    if (header === "DISP:CROSSHAIR" || header === "DISPLAY:CROSSHAIR") {
      this.scope.crosshair = args.toUpperCase() === "ON" || args === "1";
      return null;
    }
    if (header === "DISP:CROSSHAIR?" || header === "DISPLAY:CROSSHAIR?") {
      return this.scope.crosshair ? "ON" : "OFF";
    }

    if (header === "DISP:RULER" || header === "DISPLAY:RULER") {
      this.scope.ruler = args.toUpperCase() === "ON" || args === "1";
      return null;
    }
    if (header === "DISP:RULER?" || header === "DISPLAY:RULER?") {
      return this.scope.ruler ? "ON" : "OFF";
    }

    if (header === "DISP:LEGEND" || header === "DISPLAY:LEGEND") {
      this.scope.legend = args.toUpperCase() === "ON" || args === "1";
      return null;
    }
    if (header === "DISP:LEGEND?" || header === "DISPLAY:LEGEND?") {
      return this.scope.legend ? "ON" : "OFF";
    }

    if (header === "DISP:TITLE" || header === "DISPLAY:TITLE") {
      this.scope.title = args.replace(/^["']|["']$/g, "");
      return null;
    }
    if (header === "DISP:TITLE?" || header === "DISPLAY:TITLE?") {
      return `"${this.scope.title}"`;
    }

    if (header === "DISP:COLORSCALE" || header === "DISPLAY:COLORSCALE") {
      this.scope.colorScale = args.toUpperCase() === "ON" || args === "1";
      return null;
    }
    if (header === "DISP:COLORSCALE?" || header === "DISPLAY:COLORSCALE?") {
      return this.scope.colorScale ? "ON" : "OFF";
    }

    if (header === "DISP:COLORLEGEND" || header === "DISPLAY:COLORLEGEND") {
      this.scope.colorLegend = args.toUpperCase() === "ON" || args === "1";
      return null;
    }
    if (header === "DISP:COLORLEGEND?" || header === "DISPLAY:COLORLEGEND?") {
      return this.scope.colorLegend ? "ON" : "OFF";
    }

    this.pushError(-113, `Undefined display command: ${header}`);
    return null;
  }

  private handleWaveformCommand(header: string, args: string): string | null {
    let channelId: 1 | 2 = 1;
    if (
      args.toUpperCase().includes("CHAN2") || args.toUpperCase().includes("C2")
    ) {
      channelId = 2;
    }

    if (header === "WAV:DATA?" || header === "WAVEFORM:DATA?") {
      const frame = this.scope.acquire();
      const chData = channelId === 1 ? frame.ch1.data : frame.ch2.data;
      if (!chData) return "NO DATA";
      return Array.from(chData.voltage).map((v) => v.toFixed(4)).join(",");
    }

    if (header === "WAV:PRE?" || header === "WAVEFORM:PREAMBLE?") {
      return JSON.stringify({
        format: "ASCII",
        type: "RAW",
        points: this.scope.points,
        xIncrement: (this.scope.timeDiv * this.scope.horizontalDivs) /
          this.scope.points,
        xOrigin: this.scope.timeOffset,
        yIncrement:
          (channelId === 1 ? this.scope.ch1.voltDiv : this.scope.ch2.voltDiv) /
          25,
        yOrigin: channelId === 1
          ? this.scope.ch1.offset
          : this.scope.ch2.offset,
      });
    }

    this.pushError(-113, `Undefined waveform command: ${header}`);
    return null;
  }
}
