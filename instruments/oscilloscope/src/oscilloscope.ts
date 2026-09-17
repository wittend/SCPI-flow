/**
 * Two-channel Digital Oscilloscope Simulation Engine (Siglent SDS1000X style).
 */

import { SignalGenerator, WaveformType } from "./signal_generator.ts";
import { MeasurementEngine, MeasurementResults } from "./measurements.ts";

export type Coupling = "DC" | "AC" | "GND";
export type TriggerMode = "AUTO" | "NORM" | "SINGLE";
export type TriggerSource = "CH1" | "CH2" | "EXT";
export type TriggerSlope = "POS" | "NEG";
export type CursorType = "OFF" | "MANUAL" | "TRACK" | "AUTO";
export type GridType = "FULL" | "HALF" | "OFF";

export interface ChannelState {
  id: 1 | 2;
  name: string;
  enabled: boolean;
  coupling: Coupling;
  voltDiv: number; // Volts per division
  offset: number; // Vertical offset in Volts
  probe: number; // Probe attenuation factor (e.g. 1, 10)
  inverted: boolean;
  zoom: number; // Vertical zoom multiplier
  pan: number; // Vertical pan in Volts
  color: string;
  generator: ReturnType<SignalGenerator["toJSON"]>;
}

export interface TimebaseState {
  timeDiv: number; // Seconds per division
  offset: number; // Horizontal offset / delay in seconds
  zoom: number; // Horizontal zoom multiplier
  pan: number; // Horizontal pan in seconds
  sampleRate: number; // Samples per second
  points: number; // Number of sample points per acquisition
  divisions: number; // Horizontal divisions on screen
}

export interface TriggerState {
  source: TriggerSource;
  mode: TriggerMode;
  slope: TriggerSlope;
  level: number; // Trigger level in Volts
  status: "Armed" | "Ready" | "Triggered" | "Auto" | "Stop";
}

export interface CursorState {
  type: CursorType;
  source: TriggerSource;
  x1: number; // Time position 1
  x2: number; // Time position 2
  y1: number; // Voltage position 1
  y2: number; // Voltage position 2
}

export interface DisplayState {
  grid: GridType;
  gridVerticalDivs: number; // Standard 8 vertical divs
  gridHorizontalDivs: number; // Standard 14 horizontal divs
  crosshair: boolean;
  ruler: boolean;
  legend: boolean;
  title: string;
  colorScale: boolean;
  colorLegend: boolean;
}

export interface ChannelData {
  time: Float64Array;
  voltage: Float64Array;
  measurements: MeasurementResults;
}

export interface OscilloscopeFrame {
  timestamp: number;
  timebase: TimebaseState;
  trigger: TriggerState;
  cursors: CursorState & {
    deltaX: number;
    frequency: number;
    deltaY: number;
  };
  display: DisplayState;
  ch1: ChannelState & { data: ChannelData | null };
  ch2: ChannelState & { data: ChannelData | null };
}

export class OscilloscopeChannel {
  public readonly id: 1 | 2;
  public readonly name: string;
  public enabled: boolean = true;
  public coupling: Coupling = "DC";
  public voltDiv: number = 1.0; // 1 V/div
  public offset: number = 0.0; // 0 V
  public probe: number = 1.0; // 1X
  public inverted: boolean = false;
  public zoom: number = 1.0; // 1.0x vertical zoom
  public pan: number = 0.0; // 0 V vertical pan
  public color: string;
  public generator: SignalGenerator;

  constructor(
    id: 1 | 2,
    color: string,
    defaultWaveform: WaveformType = "sine",
    defaultFreq = 1000,
  ) {
    this.id = id;
    this.name = `CH${id}`;
    this.color = color;
    this.generator = new SignalGenerator({
      type: defaultWaveform,
      frequency: defaultFreq,
      amplitude: 1.0,
      phase: id === 2 ? 90 : 0,
      offset: 0.0,
    });
  }

  sample(t: number): number {
    if (!this.enabled || this.coupling === "GND") {
      return 0.0;
    }

    let raw = this.generator.sample(t) * this.probe;

    if (this.coupling === "AC") {
      // Remove DC offset
      raw -= this.generator.offset * this.probe;
    }

    if (this.inverted) {
      raw = -raw;
    }

    // Apply vertical zoom and pan
    return (raw + this.pan) * this.zoom;
  }

  toJSON(): ChannelState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      coupling: this.coupling,
      voltDiv: this.voltDiv,
      offset: this.offset,
      probe: this.probe,
      inverted: this.inverted,
      zoom: this.zoom,
      pan: this.pan,
      color: this.color,
      generator: this.generator.toJSON(),
    };
  }

  reset(): void {
    this.enabled = true;
    this.coupling = "DC";
    this.voltDiv = 1.0;
    this.offset = 0.0;
    this.probe = 1.0;
    this.inverted = false;
    this.zoom = 1.0;
    this.pan = 0.0;
    this.generator.reset();
    if (this.id === 2) {
      this.generator.setPhase(90);
    }
  }
}

export class OscilloscopeSimulation {
  public ch1: OscilloscopeChannel;
  public ch2: OscilloscopeChannel;

  // Timebase
  public timeDiv: number = 0.0005; // 500 us/div
  public timeOffset: number = 0.0; // Horizontal delay
  public timeZoom: number = 1.0; // Horizontal zoom
  public timePan: number = 0.0; // Horizontal pan (s)
  public sampleRate: number = 1_000_000; // 1 MSa/s
  public points: number = 1000; // 1000 points per sweep
  public horizontalDivs: number = 14; // 14 divisions across screen
  public verticalDivs: number = 8; // 8 divisions vertically

  // Trigger
  public triggerSource: TriggerSource = "CH1";
  public triggerMode: TriggerMode = "AUTO";
  public triggerSlope: TriggerSlope = "POS";
  public triggerLevel: number = 0.0; // 0 V
  public triggerStatus: "Armed" | "Ready" | "Triggered" | "Auto" | "Stop" = "Auto";

  // Cursors
  public cursorType: CursorType = "OFF";
  public cursorSource: TriggerSource = "CH1";
  public cursorX1: number = -0.001;
  public cursorX2: number = 0.001;
  public cursorY1: number = 1.0;
  public cursorY2: number = -1.0;

  // Display
  public grid: GridType = "FULL";
  public crosshair: boolean = true;
  public ruler: boolean = true;
  public legend: boolean = true;
  public title: string = "Siglent SDS1000X-U Digital Oscilloscope Simulation";
  public colorScale: boolean = true;
  public colorLegend: boolean = true;

  // Run state
  public isRunning: boolean = true;
  private _lastTime: number = 0;

  constructor() {
    this.ch1 = new OscilloscopeChannel(1, "#f5c518", "sine", 1000); // Yellow (CH1)
    this.ch2 = new OscilloscopeChannel(2, "#00d2ff", "square", 2000); // Cyan (CH2)
  }

  run(): void {
    this.isRunning = true;
    this.triggerStatus = this.triggerMode === "AUTO" ? "Auto" : "Ready";
  }

  stop(): void {
    this.isRunning = false;
    this.triggerStatus = "Stop";
  }

  single(): void {
    this.triggerMode = "SINGLE";
    this.isRunning = true;
    this.triggerStatus = "Armed";
  }

  /**
   * Acquire a frame of data for both channels.
   */
  acquire(currentTime?: number): OscilloscopeFrame {
    const now = currentTime !== undefined ? currentTime : (this._lastTime += 0.01);

    // Total time span displayed on screen
    const effectiveTimeDiv = this.timeDiv / this.timeZoom;
    const totalTimeSpan = effectiveTimeDiv * this.horizontalDivs;
    const startTime = now + this.timeOffset + this.timePan - totalTimeSpan / 2;

    const timeArray = new Float64Array(this.points);
    const dt = this.points > 1 ? totalTimeSpan / (this.points - 1) : 0;

    for (let i = 0; i < this.points; i++) {
      timeArray[i] = startTime + i * dt;
    }

    // Acquire CH1 data
    let ch1Data: ChannelData | null = null;
    if (this.ch1.enabled) {
      const vArray = new Float64Array(this.points);
      for (let i = 0; i < this.points; i++) {
        vArray[i] = this.ch1.sample(timeArray[i]);
      }
      ch1Data = {
        time: timeArray,
        voltage: vArray,
        measurements: MeasurementEngine.calculateAll(timeArray, vArray),
      };
    }

    // Acquire CH2 data
    let ch2Data: ChannelData | null = null;
    if (this.ch2.enabled) {
      const vArray = new Float64Array(this.points);
      for (let i = 0; i < this.points; i++) {
        vArray[i] = this.ch2.sample(timeArray[i]);
      }
      ch2Data = {
        time: timeArray,
        voltage: vArray,
        measurements: MeasurementEngine.calculateAll(timeArray, vArray),
      };
    }

    // Trigger state evaluation
    if (this.isRunning) {
      this.triggerStatus = this.triggerMode === "AUTO" ? "Auto" : "Triggered";
    }

    const deltaX = Math.abs(this.cursorX2 - this.cursorX1);
    const freq = deltaX > 0 ? 1 / deltaX : 0;
    const deltaY = Math.abs(this.cursorY2 - this.cursorY1);

    return {
      timestamp: now,
      timebase: {
        timeDiv: this.timeDiv,
        offset: this.timeOffset,
        zoom: this.timeZoom,
        pan: this.timePan,
        sampleRate: this.sampleRate,
        points: this.points,
        divisions: this.horizontalDivs,
      },
      trigger: {
        source: this.triggerSource,
        mode: this.triggerMode,
        slope: this.triggerSlope,
        level: this.triggerLevel,
        status: this.triggerStatus,
      },
      cursors: {
        type: this.cursorType,
        source: this.cursorSource,
        x1: this.cursorX1,
        x2: this.cursorX2,
        y1: this.cursorY1,
        y2: this.cursorY2,
        deltaX,
        frequency: freq,
        deltaY,
      },
      display: {
        grid: this.grid,
        gridVerticalDivs: this.verticalDivs,
        gridHorizontalDivs: this.horizontalDivs,
        crosshair: this.crosshair,
        ruler: this.ruler,
        legend: this.legend,
        title: this.title,
        colorScale: this.colorScale,
        colorLegend: this.colorLegend,
      },
      ch1: {
        ...this.ch1.toJSON(),
        data: ch1Data,
      },
      ch2: {
        ...this.ch2.toJSON(),
        data: ch2Data,
      },
    };
  }

  getMeasurements(channelId: 1 | 2): MeasurementResults {
    const frame = this.acquire(this._lastTime);
    const chData = channelId === 1 ? frame.ch1.data : frame.ch2.data;
    if (!chData) {
      return {
        vpp: 0,
        vmax: 0,
        vmin: 0,
        vrms: 0,
        vavg: 0,
        vamp: 0,
        vtop: 0,
        vbase: 0,
        frequency: 0,
        period: 0,
        riseTime: 0,
        fallTime: 0,
        dutyCycle: 0,
        posWidth: 0,
        negWidth: 0,
      };
    }
    return chData.measurements;
  }

  reset(): void {
    this.ch1.reset();
    this.ch2.reset();
    this.timeDiv = 0.0005;
    this.timeOffset = 0.0;
    this.timeZoom = 1.0;
    this.timePan = 0.0;
    this.sampleRate = 1_000_000;
    this.points = 1000;
    this.triggerSource = "CH1";
    this.triggerMode = "AUTO";
    this.triggerSlope = "POS";
    this.triggerLevel = 0.0;
    this.triggerStatus = "Auto";
    this.cursorType = "OFF";
    this.cursorSource = "CH1";
    this.cursorX1 = -0.001;
    this.cursorX2 = 0.001;
    this.cursorY1 = 1.0;
    this.cursorY2 = -1.0;
    this.grid = "FULL";
    this.crosshair = true;
    this.ruler = true;
    this.legend = true;
    this.title = "Siglent SDS1000X-U Digital Oscilloscope Simulation";
    this.colorScale = true;
    this.colorLegend = true;
    this.isRunning = true;
    this._lastTime = 0;
  }
}
