/**
 * Siglent SDM3045X Digital Multimeter Simulation Engine.
 * 4½ digit (60,000 counts) dual-display digital multimeter simulation
 * supporting all standard measurement functions, auto-ranging, math operations,
 * statistics, triggering, reading buffers, and realistic signal generation.
 */

export type MeasurementFunction =
  | "VOLT:DC"
  | "VOLT:AC"
  | "CURR:DC"
  | "CURR:AC"
  | "RES"
  | "FRES"
  | "CAP"
  | "CONT"
  | "DIOD"
  | "FREQ"
  | "PER"
  | "TEMP";

export type SpeedRate = "SLOW" | "MED" | "FAST";
export type DisplayMode = "NUMBER" | "BAR" | "TREND" | "HISTOGRAM";
export type MathFunction = "NONE" | "NULL" | "STATS" | "LIMIT" | "DB" | "DBM";
export type TriggerSource = "IMM" | "EXT" | "BUS";
export type TemperatureUnit = "C" | "F" | "K";
export type TransducerType = "RTD" | "THER";

export interface SimulatedInput {
  // Voltage & Frequency source
  dcVoltage: number; // Volts DC
  acVoltage: number; // Volts RMS
  frequency: number; // Hz
  waveType: "SINE" | "SQUARE" | "TRIANGLE" | "NOISE";

  // Current source
  dcCurrent: number; // Amperes DC
  acCurrent: number; // Amperes RMS

  // Passive component sources
  resistance: number; // Ohms
  leadResistance: number; // Ohms (for 2W vs 4W testing)
  capacitance: number; // Farads
  diodeForwardVoltage: number; // Volts (forward drop)
  diodeReverseResistance: number; // Ohms (reverse resistance)

  // Environmental
  temperature: number; // Celsius

  // Noise & Jitter
  noiseLevel: number; // Relative noise amplitude (0.0 to 1.0)
}

export interface Statistics {
  min: number;
  max: number;
  average: number;
  span: number;
  stdDev: number;
  count: number;
}

export interface LimitStatus {
  enabled: boolean;
  low: number;
  high: number;
  status: "PASS" | "FAIL" | "HIGH" | "LOW" | "NONE";
  passCount: number;
  highCount: number;
  lowCount: number;
}

export interface HistogramData {
  enabled: boolean;
  autoRange: boolean;
  binCount: number;
  lower: number;
  upper: number;
  bins: number[];
  sampleCount: number;
}

export interface TrendPoint {
  timestamp: number;
  value: number;
}

export interface ReadingResult {
  value: number;
  formatted: string;
  unit: string;
  isOverload: boolean;
  timestamp: number;
  secondaryValue?: number;
  secondaryFormatted?: string;
  secondaryUnit?: string;
}

export class MultimeterSimulation {
  // Power state
  public isPowered: boolean = true;
  public beeperEnabled: boolean = true;
  public beeping: boolean = false;

  // Active Function & Secondary Function
  public function: MeasurementFunction = "VOLT:DC";
  public dualEnabled: boolean = false;
  public secondaryFunction: MeasurementFunction = "VOLT:AC";

  // Display Mode
  public displayMode: DisplayMode = "NUMBER";

  // Ranging
  public autoRange: boolean = true;
  public currentRangeIndex: number = 1; // Index in range list
  public static readonly RANGES: Record<MeasurementFunction, number[]> = {
    "VOLT:DC": [0.6, 6.0, 60.0, 600.0, 1000.0],
    "VOLT:AC": [0.6, 6.0, 60.0, 600.0, 750.0],
    "CURR:DC": [0.0006, 0.006, 0.06, 0.6, 6.0, 10.0],
    "CURR:AC": [0.06, 0.6, 6.0, 10.0],
    "RES": [600, 6000, 60000, 600000, 6000000, 60000000, 100000000],
    "FRES": [600, 6000, 60000, 600000, 6000000, 60000000, 100000000],
    "CAP": [2e-9, 20e-9, 200e-9, 2e-6, 20e-6, 200e-6, 2e-3, 20e-3, 100e-3],
    "CONT": [2000],
    "DIOD": [4.0],
    "FREQ": [750.0], // Input voltage range
    "PER": [750.0],
    "TEMP": [1000.0],
  };

  // Measurement Settings
  public speed: SpeedRate = "SLOW";
  public nplc: number = 10;
  public filterEnabled: boolean = false;
  public autoZero: boolean = true;
  public inputImpedance: "10M" | "10G" = "10M";
  public continuityThreshold: number = 10; // Ohms threshold for beeper (default 10)
  public continuityVolume: "LOW" | "MIDDLE" | "HIGH" = "MIDDLE";
  public temperatureUnit: TemperatureUnit = "C";
  public transducerType: TransducerType = "RTD";
  public transducerName: string = "PT100";
  public acBandwidth: number = 20; // 20 Hz or 200 Hz

  // Math Settings
  public mathFunction: MathFunction = "NONE";
  public nullEnabled: boolean = false;
  public nullValue: number = 0;
  public nullAuto: boolean = true;

  // dB & dBm Settings
  public dbReference: number = 1.0; // Volts
  public dbmReference: number = 600; // Ohms (default 600)
  public dbReferenceAuto: boolean = false;

  // Statistics
  public statisticsEnabled: boolean = false;
  private _statSamples: number[] = [];
  public stats: Statistics = {
    min: 0,
    max: 0,
    average: 0,
    span: 0,
    stdDev: 0,
    count: 0,
  };

  // Limits
  public limits: LimitStatus = {
    enabled: false,
    low: 0.0,
    high: 5.0,
    status: "NONE",
    passCount: 0,
    highCount: 0,
    lowCount: 0,
  };

  // Histogram
  public histogram: HistogramData = {
    enabled: false,
    autoRange: true,
    binCount: 10,
    lower: 0,
    upper: 10,
    bins: new Array(10).fill(0),
    sampleCount: 0,
  };

  // Trend Chart Buffer
  public trendHistory: TrendPoint[] = [];
  private static readonly MAX_TREND_POINTS = 300;

  // Triggering & Buffer
  public triggerSource: TriggerSource = "IMM";
  public triggerCount: number = 1;
  public sampleCount: number = 1;
  public triggerDelay: number = 0; // seconds
  public triggerDelayAuto: boolean = true;
  public triggerSlope: "POS" | "NEG" = "POS";
  public isRunning: boolean = true; // Run / Stop state

  // Reading Buffer
  public readingBuffer: number[] = [];
  private static readonly MAX_BUFFER_SIZE = 10000;
  public lastReading: ReadingResult = {
    value: 0,
    formatted: "+0.0000 VDC",
    unit: "V",
    isOverload: false,
    timestamp: Date.now(),
  };

  // Simulated Input State
  public input: SimulatedInput = {
    dcVoltage: 3.3000,
    acVoltage: 0.0100,
    frequency: 1000.0,
    waveType: "SINE",
    dcCurrent: 0.0500,
    acCurrent: 0.0050,
    resistance: 1000.0,
    leadResistance: 0.15,
    capacitance: 10e-6, // 10 uF
    diodeForwardVoltage: 0.650,
    diodeReverseResistance: 1e8,
    temperature: 25.0,
    noiseLevel: 0.001,
  };

  constructor() {
    this.reset();
  }

  /**
   * Reset multimeter to default factory state (*RST / SYSTem:PRESet).
   */
  public reset(): void {
    this.function = "VOLT:DC";
    this.dualEnabled = false;
    this.secondaryFunction = "VOLT:AC";
    this.displayMode = "NUMBER";
    this.autoRange = true;
    this.currentRangeIndex = 1; // 6V range
    this.speed = "SLOW";
    this.nplc = 10;
    this.filterEnabled = false;
    this.autoZero = true;
    this.inputImpedance = "10M";
    this.continuityThreshold = 10;
    this.temperatureUnit = "C";
    this.transducerType = "RTD";
    this.transducerName = "PT100";
    this.mathFunction = "NONE";
    this.nullEnabled = false;
    this.nullValue = 0;
    this.nullAuto = true;
    this.dbReference = 1.0;
    this.dbmReference = 600;
    this.statisticsEnabled = false;
    this.clearStatistics();
    this.limits.enabled = false;
    this.limits.status = "NONE";
    this.limits.passCount = 0;
    this.limits.highCount = 0;
    this.limits.lowCount = 0;
    this.histogram.enabled = false;
    this.clearHistogram();
    this.trendHistory = [];
    this.triggerSource = "IMM";
    this.triggerCount = 1;
    this.sampleCount = 1;
    this.triggerDelay = 0;
    this.triggerDelayAuto = true;
    this.isRunning = true;
    this.beeping = false;
    this.readingBuffer = [];
  }

  // --- Range Management ---

  public getAvailableRanges(fn: MeasurementFunction = this.function): number[] {
    return MultimeterSimulation.RANGES[fn] || [1.0];
  }

  public get range(): number {
    const ranges = this.getAvailableRanges();
    return ranges[Math.min(this.currentRangeIndex, ranges.length - 1)];
  }

  public setRange(val: number | "AUTO" | "MIN" | "MAX" | "DEF"): void {
    if (val === "AUTO") {
      this.autoRange = true;
      return;
    }
    this.autoRange = false;
    const ranges = this.getAvailableRanges();
    if (val === "MIN") {
      this.currentRangeIndex = 0;
    } else if (val === "MAX") {
      this.currentRangeIndex = ranges.length - 1;
    } else if (val === "DEF") {
      this.currentRangeIndex = Math.min(1, ranges.length - 1);
    } else if (typeof val === "number") {
      let closestIdx = 0;
      for (let i = 0; i < ranges.length; i++) {
        if (ranges[i] >= val * 0.999) {
          closestIdx = i;
          break;
        }
        closestIdx = i;
      }
      this.currentRangeIndex = closestIdx;
    }
  }

  public rangeUp(): void {
    const ranges = this.getAvailableRanges();
    if (this.currentRangeIndex < ranges.length - 1) {
      this.currentRangeIndex++;
      this.autoRange = false;
    }
  }

  public rangeDown(): void {
    if (this.currentRangeIndex > 0) {
      this.currentRangeIndex--;
      this.autoRange = false;
    }
  }

  // --- Measurement Calculation ---

  /**
   * Evaluates the raw simulated physics for a given measurement function.
   */
  private computeRawValue(
    fn: MeasurementFunction,
  ): { val: number; isOverload: boolean } {
    let baseVal = 0;
    const noise = (Math.random() - 0.5) * 2 * this.input.noiseLevel;

    switch (fn) {
      case "VOLT:DC": {
        baseVal = this.input.dcVoltage +
          noise * 0.005 * Math.abs(this.input.dcVoltage || 1);
        break;
      }
      case "VOLT:AC": {
        baseVal = this.input.acVoltage +
          Math.abs(noise * 0.002 * Math.abs(this.input.acVoltage || 1));
        break;
      }
      case "CURR:DC": {
        baseVal = this.input.dcCurrent +
          noise * 0.005 * Math.abs(this.input.dcCurrent || 0.01);
        break;
      }
      case "CURR:AC": {
        baseVal = this.input.acCurrent +
          Math.abs(noise * 0.002 * Math.abs(this.input.acCurrent || 0.01));
        break;
      }
      case "RES": {
        // 2-Wire includes lead resistance
        baseVal = this.input.resistance + this.input.leadResistance +
          noise * 0.001 * this.input.resistance;
        break;
      }
      case "FRES": {
        // 4-Wire eliminates lead resistance
        baseVal = this.input.resistance +
          noise * 0.0005 * this.input.resistance;
        break;
      }
      case "CAP": {
        baseVal = this.input.capacitance +
          noise * 0.005 * this.input.capacitance;
        break;
      }
      case "CONT": {
        baseVal = this.input.resistance;
        break;
      }
      case "DIOD": {
        baseVal = this.input.diodeForwardVoltage + noise * 0.001;
        break;
      }
      case "FREQ": {
        baseVal = this.input.frequency + noise * 0.0001 * this.input.frequency;
        break;
      }
      case "PER": {
        baseVal = this.input.frequency > 0 ? (1 / this.input.frequency) : 9.9e37;
        break;
      }
      case "TEMP": {
        const tempC = this.input.temperature + noise * 0.02;
        if (this.temperatureUnit === "F") {
          baseVal = (tempC * 9) / 5 + 32;
        } else if (this.temperatureUnit === "K") {
          baseVal = tempC + 273.15;
        } else {
          baseVal = tempC;
        }
        break;
      }
    }

    // Auto-range selection if enabled
    if (this.autoRange && fn === this.function) {
      const ranges = this.getAvailableRanges(fn);
      let selectedIdx = 0;
      for (let i = 0; i < ranges.length; i++) {
        if (Math.abs(baseVal) <= ranges[i] * 1.05) {
          selectedIdx = i;
          break;
        }
        selectedIdx = i;
      }
      this.currentRangeIndex = selectedIdx;
    }

    // Check overload against active range
    const maxRange = this.getAvailableRanges(fn)[
      Math.min(this.currentRangeIndex, this.getAvailableRanges(fn).length - 1)
    ];

    let isOverload = false;
    if (fn === "CONT") {
      isOverload = baseVal > 2000;
    } else if (fn === "DIOD") {
      isOverload = baseVal > 4.0;
    } else if (fn !== "TEMP" && fn !== "FREQ" && fn !== "PER") {
      // 10% over-range capability, beyond which it's overload
      if (Math.abs(baseVal) > maxRange * 1.1) {
        isOverload = true;
        baseVal = baseVal >= 0 ? 9.90000000e+37 : -9.90000000e+37;
      }
    }

    return { val: baseVal, isOverload };
  }

  /**
   * Formats a numeric measurement value with correct precision (4 1/2 digits: 60,000 counts)
   * and engineering units according to current function and range.
   */
  public formatValue(
    value: number,
    fn: MeasurementFunction = this.function,
    isOverload: boolean = false,
  ): {
    formatted: string;
    unit: string;
  } {
    if (isOverload || Math.abs(value) >= 9e37) {
      return { formatted: "9.90000000E+37", unit: this.getUnit(fn) };
    }

    const unit = this.getUnit(fn);
    const sign = value >= 0 ? "+" : "-";
    const absVal = Math.abs(value);

    switch (fn) {
      case "VOLT:DC": {
        const rng = this.range;
        if (rng <= 0.6) {
          return {
            formatted: `${sign}${(absVal * 1000).toFixed(2)} mVDC`,
            unit: "mV",
          };
        } else if (rng <= 6.0) {
          return { formatted: `${sign}${absVal.toFixed(4)} VDC`, unit: "V" };
        } else if (rng <= 60.0) {
          return { formatted: `${sign}${absVal.toFixed(3)} VDC`, unit: "V" };
        } else if (rng <= 600.0) {
          return { formatted: `${sign}${absVal.toFixed(2)} VDC`, unit: "V" };
        } else {
          return { formatted: `${sign}${absVal.toFixed(1)} VDC`, unit: "V" };
        }
      }
      case "VOLT:AC": {
        const rng = this.range;
        if (rng <= 0.6) {
          return {
            formatted: `${(absVal * 1000).toFixed(2)} mVAC`,
            unit: "mV",
          };
        } else if (rng <= 6.0) {
          return { formatted: `${absVal.toFixed(4)} VAC`, unit: "V" };
        } else if (rng <= 60.0) {
          return { formatted: `${absVal.toFixed(3)} VAC`, unit: "V" };
        } else if (rng <= 600.0) {
          return { formatted: `${absVal.toFixed(2)} VAC`, unit: "V" };
        } else {
          return { formatted: `${absVal.toFixed(1)} VAC`, unit: "V" };
        }
      }
      case "CURR:DC": {
        const rng = this.range;
        if (rng <= 0.0006) {
          return {
            formatted: `${sign}${(absVal * 1e6).toFixed(2)} uADC`,
            unit: "uA",
          };
        } else if (rng <= 0.006) {
          return {
            formatted: `${sign}${(absVal * 1000).toFixed(4)} mADC`,
            unit: "mA",
          };
        } else if (rng <= 0.06) {
          return {
            formatted: `${sign}${(absVal * 1000).toFixed(3)} mADC`,
            unit: "mA",
          };
        } else if (rng <= 0.6) {
          return {
            formatted: `${sign}${(absVal * 1000).toFixed(2)} mADC`,
            unit: "mA",
          };
        } else if (rng <= 6.0) {
          return { formatted: `${sign}${absVal.toFixed(4)} ADC`, unit: "A" };
        } else {
          return { formatted: `${sign}${absVal.toFixed(3)} ADC`, unit: "A" };
        }
      }
      case "CURR:AC": {
        const rng = this.range;
        if (rng <= 0.06) {
          return {
            formatted: `${(absVal * 1000).toFixed(3)} mAAC`,
            unit: "mA",
          };
        } else if (rng <= 0.6) {
          return {
            formatted: `${(absVal * 1000).toFixed(2)} mAAC`,
            unit: "mA",
          };
        } else if (rng <= 6.0) {
          return { formatted: `${absVal.toFixed(4)} AAC`, unit: "A" };
        } else {
          return { formatted: `${absVal.toFixed(3)} AAC`, unit: "A" };
        }
      }
      case "RES":
      case "FRES": {
        const suffix = fn === "RES" ? "Ω" : "4W Ω";
        if (absVal < 1000) {
          return { formatted: `${absVal.toFixed(2)} ${suffix}`, unit: "Ω" };
        } else if (absVal < 1e6) {
          return {
            formatted: `${(absVal / 1e3).toFixed(4)} k${suffix}`,
            unit: "kΩ",
          };
        } else {
          return {
            formatted: `${(absVal / 1e6).toFixed(4)} M${suffix}`,
            unit: "MΩ",
          };
        }
      }
      case "CAP": {
        if (absVal < 1e-6) {
          return { formatted: `${(absVal * 1e9).toFixed(3)} nF`, unit: "nF" };
        } else if (absVal < 1e-3) {
          return { formatted: `${(absVal * 1e6).toFixed(3)} uF`, unit: "uF" };
        } else {
          return { formatted: `${(absVal * 1e3).toFixed(3)} mF`, unit: "mF" };
        }
      }
      case "CONT": {
        if (absVal >= 2000) {
          return { formatted: "OPEN", unit: "Ω" };
        }
        return { formatted: `${absVal.toFixed(1)} Ω`, unit: "Ω" };
      }
      case "DIOD": {
        if (absVal >= 4.0) {
          return { formatted: "OPEN", unit: "V" };
        }
        return { formatted: `${absVal.toFixed(4)} V`, unit: "V" };
      }
      case "FREQ": {
        if (absVal < 1000) {
          return { formatted: `${absVal.toFixed(3)} Hz`, unit: "Hz" };
        } else if (absVal < 1e6) {
          return {
            formatted: `${(absVal / 1000).toFixed(4)} kHz`,
            unit: "kHz",
          };
        } else {
          return { formatted: `${(absVal / 1e6).toFixed(5)} MHz`, unit: "MHz" };
        }
      }
      case "PER": {
        if (absVal < 1e-3) {
          return { formatted: `${(absVal * 1e6).toFixed(2)} us`, unit: "us" };
        } else if (absVal < 1) {
          return { formatted: `${(absVal * 1000).toFixed(3)} ms`, unit: "ms" };
        } else {
          return { formatted: `${absVal.toFixed(4)} s`, unit: "s" };
        }
      }
      case "TEMP": {
        const u = this.temperatureUnit === "C" ? "°C" : this.temperatureUnit === "F" ? "°F" : "K";
        return { formatted: `${sign}${absVal.toFixed(1)} ${u}`, unit: u };
      }
    }

    return { formatted: value.toExponential(7), unit };
  }

  public getUnit(fn: MeasurementFunction = this.function): string {
    switch (fn) {
      case "VOLT:DC":
      case "VOLT:AC":
      case "DIOD":
        return "V";
      case "CURR:DC":
      case "CURR:AC":
        return "A";
      case "RES":
      case "FRES":
      case "CONT":
        return "Ω";
      case "CAP":
        return "F";
      case "FREQ":
        return "Hz";
      case "PER":
        return "s";
      case "TEMP":
        return this.temperatureUnit === "C" ? "°C" : this.temperatureUnit === "F" ? "°F" : "K";
    }
  }

  /**
   * Takes a single measurement reading cycle, processes math, limits, stats, and stores in buffer.
   */
  public takeReading(): ReadingResult {
    if (!this.isPowered) {
      return {
        value: 0,
        formatted: "POWER OFF",
        unit: "",
        isOverload: false,
        timestamp: Date.now(),
      };
    }

    const { val: rawVal, isOverload } = this.computeRawValue(this.function);
    let finalVal = rawVal;

    // Apply Null / Relative Math
    if (this.nullEnabled && !isOverload) {
      finalVal = rawVal - this.nullValue;
    }

    // Apply dB / dBm Math
    if (
      this.mathFunction === "DB" && !isOverload &&
      this.function.startsWith("VOLT")
    ) {
      const ref = this.dbReference || 1.0;
      finalVal = 20 * Math.log10(Math.max(1e-12, Math.abs(rawVal)) / ref);
    } else if (
      this.mathFunction === "DBM" && !isOverload &&
      this.function.startsWith("VOLT")
    ) {
      const rRef = this.dbmReference || 600;
      const powerMw = (Math.pow(rawVal, 2) / rRef) * 1000;
      finalVal = 10 * Math.log10(Math.max(1e-12, powerMw));
    }

    // Process Continuity Beeper
    if (this.function === "CONT") {
      this.beeping = rawVal <= this.continuityThreshold && this.beeperEnabled;
    } else if (this.function === "DIOD") {
      this.beeping = rawVal >= 0.1 && rawVal <= 0.8 && this.beeperEnabled;
    } else {
      this.beeping = false;
    }

    // Format Primary Reading
    const formattedResult = this.formatValue(
      finalVal,
      this.function,
      isOverload,
    );

    // Process Secondary Reading if Dual Display enabled
    let secondaryValue: number | undefined;
    let secondaryFormatted: string | undefined;
    let secondaryUnit: string | undefined;

    if (this.dualEnabled) {
      const sec = this.computeRawValue(this.secondaryFunction);
      secondaryValue = sec.val;
      const secFmt = this.formatValue(
        sec.val,
        this.secondaryFunction,
        sec.isOverload,
      );
      secondaryFormatted = secFmt.formatted;
      secondaryUnit = secFmt.unit;
    }

    const result: ReadingResult = {
      value: finalVal,
      formatted: formattedResult.formatted,
      unit: formattedResult.unit,
      isOverload,
      timestamp: Date.now(),
      secondaryValue,
      secondaryFormatted,
      secondaryUnit,
    };

    this.lastReading = result;

    // Update Statistics if enabled
    if (this.statisticsEnabled && !isOverload) {
      this.addSampleToStatistics(finalVal);
    }

    // Update Limits if enabled
    if (this.limits.enabled && !isOverload) {
      this.evaluateLimits(finalVal);
    }

    // Update Histogram if enabled
    if (this.histogram.enabled && !isOverload) {
      this.addSampleToHistogram(finalVal);
    }

    // Update Trend History
    if (!isOverload) {
      this.trendHistory.push({ timestamp: result.timestamp, value: finalVal });
      if (this.trendHistory.length > MultimeterSimulation.MAX_TREND_POINTS) {
        this.trendHistory.shift();
      }
    }

    // Append to internal SCPI reading buffer
    this.readingBuffer.push(finalVal);
    if (this.readingBuffer.length > MultimeterSimulation.MAX_BUFFER_SIZE) {
      this.readingBuffer.shift();
    }

    return result;
  }

  // --- Statistics Management ---

  public addSampleToStatistics(val: number): void {
    this._statSamples.push(val);
    const n = this._statSamples.length;

    if (n === 1) {
      this.stats.min = val;
      this.stats.max = val;
      this.stats.average = val;
      this.stats.span = 0;
      this.stats.stdDev = 0;
      this.stats.count = 1;
      return;
    }

    this.stats.count = n;
    this.stats.min = Math.min(this.stats.min, val);
    this.stats.max = Math.max(this.stats.max, val);
    this.stats.span = this.stats.max - this.stats.min;

    const sum = this._statSamples.reduce((a, b) => a + b, 0);
    this.stats.average = sum / n;

    const variance = this._statSamples.reduce(
      (acc, v) => acc + Math.pow(v - this.stats.average, 2),
      0,
    ) / (n - 1);
    this.stats.stdDev = Math.sqrt(variance);
  }

  public clearStatistics(): void {
    this._statSamples = [];
    this.stats = {
      min: 0,
      max: 0,
      average: 0,
      span: 0,
      stdDev: 0,
      count: 0,
    };
  }

  // --- Limit Testing ---

  public evaluateLimits(val: number): void {
    if (val < this.limits.low) {
      this.limits.status = "LOW";
      this.limits.lowCount++;
    } else if (val > this.limits.high) {
      this.limits.status = "HIGH";
      this.limits.highCount++;
    } else {
      this.limits.status = "PASS";
      this.limits.passCount++;
    }
  }

  // --- Histogram ---

  public clearHistogram(): void {
    this.histogram.bins = new Array(this.histogram.binCount).fill(0);
    this.histogram.sampleCount = 0;
  }

  public addSampleToHistogram(val: number): void {
    this.histogram.sampleCount++;
    if (this.histogram.autoRange) {
      if (this.histogram.sampleCount === 1) {
        this.histogram.lower = val * 0.95;
        this.histogram.upper = val * 1.05 + 1e-6;
      } else {
        if (val < this.histogram.lower) this.histogram.lower = val;
        if (val > this.histogram.upper) this.histogram.upper = val;
      }
    }

    const span = Math.max(1e-9, this.histogram.upper - this.histogram.lower);
    const binIdx = Math.floor(
      ((val - this.histogram.lower) / span) * this.histogram.binCount,
    );
    const clampedIdx = Math.max(
      0,
      Math.min(this.histogram.binCount - 1, binIdx),
    );
    this.histogram.bins[clampedIdx] = (this.histogram.bins[clampedIdx] || 0) +
      1;
  }
}
