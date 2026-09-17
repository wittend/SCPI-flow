/**
 * Signal Generator for simulated oscilloscope inputs.
 * Supports sine, square, triangle, sawtooth, DC, and noise waveforms.
 */

export type WaveformType =
  | "sine"
  | "square"
  | "triangle"
  | "sawtooth"
  | "dc"
  | "noise";

export interface SignalGeneratorOptions {
  type?: WaveformType;
  frequency?: number; // Frequency in Hz
  amplitude?: number; // Peak amplitude in Volts
  phase?: number; // Phase in degrees
  offset?: number; // DC offset in Volts
  dutyCycle?: number; // Duty cycle for square wave (0.0 to 1.0)
  scale?: number; // Amplitude scale multiplier
}

export class SignalGenerator {
  private _type: WaveformType = "sine";
  private _frequency: number = 1000; // 1 kHz default
  private _amplitude: number = 1.0; // 1 V peak default
  private _phase: number = 0; // 0 degrees default
  private _offset: number = 0.0; // 0 V DC offset
  private _dutyCycle: number = 0.5; // 50% duty cycle
  private _scale: number = 1.0; // 1.0 scale

  constructor(options: SignalGeneratorOptions = {}) {
    if (options.type !== undefined) this.setType(options.type);
    if (options.frequency !== undefined) this.setFrequency(options.frequency);
    if (options.amplitude !== undefined) this.setAmplitude(options.amplitude);
    if (options.phase !== undefined) this.setPhase(options.phase);
    if (options.offset !== undefined) this.setOffset(options.offset);
    if (options.dutyCycle !== undefined) this.setDutyCycle(options.dutyCycle);
    if (options.scale !== undefined) this.setScale(options.scale);
  }

  // Getters
  get type(): WaveformType {
    return this._type;
  }

  get frequency(): number {
    return this._frequency;
  }

  get amplitude(): number {
    return this._amplitude;
  }

  get phase(): number {
    return this._phase;
  }

  get offset(): number {
    return this._offset;
  }

  get dutyCycle(): number {
    return this._dutyCycle;
  }

  get scale(): number {
    return this._scale;
  }

  // Setters with validation
  setType(type: WaveformType | string): this {
    const normalized = type.toLowerCase() as WaveformType;
    if (
      ["sine", "square", "triangle", "sawtooth", "dc", "noise"].includes(
        normalized,
      )
    ) {
      this._type = normalized;
    } else {
      throw new Error(`Unsupported waveform type: ${type}`);
    }
    return this;
  }

  setFrequency(freq: number): this {
    if (freq < 0) {
      throw new Error("Frequency must be non-negative");
    }
    this._frequency = freq;
    return this;
  }

  setAmplitude(amp: number): this {
    if (amp < 0) {
      throw new Error("Amplitude must be non-negative");
    }
    this._amplitude = amp;
    return this;
  }

  setPhase(phase: number): this {
    this._phase = phase % 360;
    return this;
  }

  setOffset(offset: number): this {
    this._offset = offset;
    return this;
  }

  setDutyCycle(duty: number): this {
    if (duty < 0 || duty > 1) {
      throw new Error("Duty cycle must be between 0.0 and 1.0");
    }
    this._dutyCycle = duty;
    return this;
  }

  setScale(scale: number): this {
    this._scale = scale;
    return this;
  }

  /**
   * Calculates the instantaneous voltage at time `t` (in seconds).
   */
  sample(t: number): number {
    const phaseRad = (this._phase * Math.PI) / 180;
    const effectiveAmp = this._amplitude * this._scale;

    if (this._type === "dc") {
      return this._offset;
    }

    if (this._type === "noise") {
      const randomVal = (Math.random() * 2 - 1) * effectiveAmp;
      return this._offset + randomVal;
    }

    if (this._frequency === 0) {
      return this._offset;
    }

    const period = 1 / this._frequency;
    const normalizedTime = (t + (phaseRad / (2 * Math.PI * this._frequency))) %
      period;
    const positiveTime = normalizedTime < 0 ? normalizedTime + period : normalizedTime;
    const fraction = positiveTime / period; // 0.0 to 1.0

    let baseVal = 0;
    switch (this._type) {
      case "sine": {
        const angle = 2 * Math.PI * this._frequency * t + phaseRad;
        baseVal = Math.sin(angle);
        break;
      }
      case "square": {
        baseVal = fraction < this._dutyCycle ? 1.0 : -1.0;
        break;
      }
      case "triangle": {
        // Triangle wave: -1 to +1
        if (fraction < 0.25) {
          baseVal = fraction * 4;
        } else if (fraction < 0.75) {
          baseVal = 1 - (fraction - 0.25) * 4;
        } else {
          baseVal = -1 + (fraction - 0.75) * 4;
        }
        break;
      }
      case "sawtooth": {
        // Sawtooth wave: ramps linearly from -1 to +1 over the period
        baseVal = -1.0 + 2.0 * fraction;
        break;
      }
    }

    return this._offset + effectiveAmp * baseVal;
  }

  /**
   * Generates a buffer of time and voltage samples.
   */
  generateBuffer(
    startTime: number,
    timeSpan: number,
    sampleCount: number,
  ): { time: Float64Array; voltage: Float64Array } {
    if (sampleCount <= 0) {
      throw new Error("sampleCount must be positive");
    }
    const time = new Float64Array(sampleCount);
    const voltage = new Float64Array(sampleCount);
    const dt = sampleCount > 1 ? timeSpan / (sampleCount - 1) : 0;

    for (let i = 0; i < sampleCount; i++) {
      const t = startTime + i * dt;
      time[i] = t;
      voltage[i] = this.sample(t);
    }

    return { time, voltage };
  }

  reset(): this {
    this._type = "sine";
    this._frequency = 1000;
    this._amplitude = 1.0;
    this._phase = 0;
    this._offset = 0.0;
    this._dutyCycle = 0.5;
    this._scale = 1.0;
    return this;
  }

  toJSON(): SignalGeneratorOptions {
    return {
      type: this._type,
      frequency: this._frequency,
      amplitude: this._amplitude,
      phase: this._phase,
      offset: this._offset,
      dutyCycle: this._dutyCycle,
      scale: this._scale,
    };
  }

  static fromJSON(data: SignalGeneratorOptions): SignalGenerator {
    return new SignalGenerator(data);
  }
}
