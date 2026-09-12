/**
 * Oscilloscope Measurement Engine.
 * Calculates automated voltage and timing measurements from sampled waveform buffers.
 */

export interface MeasurementResults {
  vpp: number; // Peak-to-Peak Voltage (V)
  vmax: number; // Maximum Voltage (V)
  vmin: number; // Minimum Voltage (V)
  vrms: number; // Root-Mean-Square Voltage (V)
  vavg: number; // Average / Mean Voltage (V)
  vamp: number; // Amplitude (Vtop - Vbase) (V)
  vtop: number; // Top / High State Voltage (V)
  vbase: number; // Base / Low State Voltage (V)
  frequency: number; // Frequency (Hz)
  period: number; // Period (s)
  riseTime: number; // 10% to 90% Rise Time (s)
  fallTime: number; // 90% to 10% Fall Time (s)
  dutyCycle: number; // Duty Cycle (0.0 to 1.0)
  posWidth: number; // Positive Pulse Width (s)
  negWidth: number; // Negative Pulse Width (s)
}

export class MeasurementEngine {
  /**
   * Maximum Voltage in buffer.
   */
  static calculateVmax(voltages: Float64Array | number[]): number {
    if (voltages.length === 0) return 0;
    let max = voltages[0];
    for (let i = 1; i < voltages.length; i++) {
      if (voltages[i] > max) max = voltages[i];
    }
    return max;
  }

  /**
   * Minimum Voltage in buffer.
   */
  static calculateVmin(voltages: Float64Array | number[]): number {
    if (voltages.length === 0) return 0;
    let min = voltages[0];
    for (let i = 1; i < voltages.length; i++) {
      if (voltages[i] < min) min = voltages[i];
    }
    return min;
  }

  /**
   * Peak-to-Peak Voltage (Vmax - Vmin).
   */
  static calculateVpp(voltages: Float64Array | number[]): number {
    if (voltages.length === 0) return 0;
    return this.calculateVmax(voltages) - this.calculateVmin(voltages);
  }

  /**
   * Average (mean) DC Voltage.
   */
  static calculateVavg(voltages: Float64Array | number[]): number {
    if (voltages.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < voltages.length; i++) {
      sum += voltages[i];
    }
    return sum / voltages.length;
  }

  /**
   * Root-Mean-Square (RMS) Voltage.
   */
  static calculateVrms(voltages: Float64Array | number[]): number {
    if (voltages.length === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < voltages.length; i++) {
      sumSq += voltages[i] * voltages[i];
    }
    return Math.sqrt(sumSq / voltages.length);
  }

  /**
   * Calculates Top and Base voltages using a histogram approximation.
   */
  static calculateTopBase(
    voltages: Float64Array | number[],
  ): { vtop: number; vbase: number; vamp: number } {
    if (voltages.length === 0) return { vtop: 0, vbase: 0, vamp: 0 };
    const min = this.calculateVmin(voltages);
    const max = this.calculateVmax(voltages);
    if (max === min) {
      return { vtop: max, vbase: min, vamp: 0 };
    }

    const bins = 50;
    const histogram = new Uint32Array(bins);
    const binWidth = (max - min) / bins;

    for (let i = 0; i < voltages.length; i++) {
      let idx = Math.floor((voltages[i] - min) / binWidth);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      histogram[idx]++;
    }

    // Lower half peak for vbase
    let baseBin = 0;
    let maxBaseCount = 0;
    const midBin = Math.floor(bins / 2);
    for (let i = 0; i < midBin; i++) {
      if (histogram[i] > maxBaseCount) {
        maxBaseCount = histogram[i];
        baseBin = i;
      }
    }

    // Upper half peak for vtop
    let topBin = midBin;
    let maxTopCount = 0;
    for (let i = midBin; i < bins; i++) {
      if (histogram[i] > maxTopCount) {
        maxTopCount = histogram[i];
        topBin = i;
      }
    }

    const vbase = maxBaseCount > 0 ? min + (baseBin + 0.5) * binWidth : min;
    const vtop = maxTopCount > 0 ? min + (topBin + 0.5) * binWidth : max;
    const vamp = Math.max(0, vtop - vbase);

    return { vtop, vbase, vamp };
  }

  /**
   * Calculates signal Period and Frequency via zero-crossing / mid-threshold crossings.
   */
  static calculateTiming(
    time: Float64Array | number[],
    voltages: Float64Array | number[],
  ): {
    period: number;
    frequency: number;
    dutyCycle: number;
    posWidth: number;
    negWidth: number;
  } {
    const len = voltages.length;
    if (len < 4) {
      return {
        period: 0,
        frequency: 0,
        dutyCycle: 0,
        posWidth: 0,
        negWidth: 0,
      };
    }

    const mid = this.calculateVavg(voltages);
    const crossings: { time: number; direction: "rising" | "falling" }[] = [];

    for (let i = 1; i < len; i++) {
      const v0 = voltages[i - 1];
      const v1 = voltages[i];
      const t0 = time[i - 1];
      const t1 = time[i];

      if (v0 <= mid && v1 > mid) {
        // Interpolate rising crossing
        const tCross = t0 + ((mid - v0) / (v1 - v0)) * (t1 - t0);
        crossings.push({ time: tCross, direction: "rising" });
      } else if (v0 >= mid && v1 < mid) {
        // Interpolate falling crossing
        const tCross = t0 + ((mid - v0) / (v1 - v0)) * (t1 - t0);
        crossings.push({ time: tCross, direction: "falling" });
      }
    }

    // Need at least 2 consecutive rising or falling crossings to determine period
    let periodSum = 0;
    let periodCount = 0;
    let posWidthSum = 0;
    let posWidthCount = 0;
    let negWidthSum = 0;
    let negWidthCount = 0;

    for (let i = 0; i < crossings.length - 1; i++) {
      const cCurrent = crossings[i];
      const cNext = crossings[i + 1];

      if (cCurrent.direction === "rising" && cNext.direction === "falling") {
        posWidthSum += cNext.time - cCurrent.time;
        posWidthCount++;
      } else if (
        cCurrent.direction === "falling" && cNext.direction === "rising"
      ) {
        negWidthSum += cNext.time - cCurrent.time;
        negWidthCount++;
      }

      // Find next crossing of the same direction
      for (let j = i + 1; j < crossings.length; j++) {
        if (crossings[j].direction === cCurrent.direction) {
          periodSum += crossings[j].time - cCurrent.time;
          periodCount++;
          break;
        }
      }
    }

    const period = periodCount > 0 ? periodSum / periodCount : 0;
    const frequency = period > 0 ? 1 / period : 0;
    const posWidth = posWidthCount > 0
      ? posWidthSum / posWidthCount
      : (period > 0 ? period * 0.5 : 0);
    const negWidth = negWidthCount > 0
      ? negWidthSum / negWidthCount
      : (period > 0 ? period * 0.5 : 0);
    const dutyCycle = period > 0
      ? Math.min(1.0, Math.max(0.0, posWidth / period))
      : 0.5;

    return { period, frequency, dutyCycle, posWidth, negWidth };
  }

  /**
   * Calculates 10% to 90% rise time and 90% to 10% fall time.
   */
  static calculateRiseFallTime(
    time: Float64Array | number[],
    voltages: Float64Array | number[],
  ): { riseTime: number; fallTime: number } {
    const len = voltages.length;
    if (len < 4) return { riseTime: 0, fallTime: 0 };

    const min = this.calculateVmin(voltages);
    const max = this.calculateVmax(voltages);
    const v10 = min + 0.1 * (max - min);
    const v90 = min + 0.9 * (max - min);

    let riseSum = 0;
    let riseCount = 0;
    let fallSum = 0;
    let fallCount = 0;

    let t10: number | null = null;
    let t90: number | null = null;

    for (let i = 1; i < len; i++) {
      const vPrev = voltages[i - 1];
      const vCurr = voltages[i];
      const tPrev = time[i - 1];
      const tCurr = time[i];

      // Rising edge
      if (vPrev <= v10 && vCurr > v10) {
        t10 = tPrev + ((v10 - vPrev) / (vCurr - vPrev)) * (tCurr - tPrev);
      }
      if (t10 !== null && vPrev <= v90 && vCurr >= v90) {
        const t90Edge = tPrev +
          ((v90 - vPrev) / (vCurr - vPrev)) * (tCurr - tPrev);
        if (t90Edge > t10) {
          riseSum += t90Edge - t10;
          riseCount++;
        }
        t10 = null;
      }

      // Falling edge
      if (vPrev >= v90 && vCurr < v90) {
        t90 = tPrev + ((v90 - vPrev) / (vCurr - vPrev)) * (tCurr - tPrev);
      }
      if (t90 !== null && vPrev >= v10 && vCurr <= v10) {
        const t10Edge = tPrev +
          ((v10 - vPrev) / (vCurr - vPrev)) * (tCurr - tPrev);
        if (t10Edge > t90) {
          fallSum += t10Edge - t90;
          fallCount++;
        }
        t90 = null;
      }
    }

    const riseTime = riseCount > 0 ? riseSum / riseCount : 0;
    const fallTime = fallCount > 0 ? fallSum / fallCount : 0;

    return { riseTime, fallTime };
  }

  /**
   * Computes all measurements for the waveform.
   */
  static calculateAll(
    time: Float64Array | number[],
    voltages: Float64Array | number[],
  ): MeasurementResults {
    const vmax = this.calculateVmax(voltages);
    const vmin = this.calculateVmin(voltages);
    const vpp = vmax - vmin;
    const vavg = this.calculateVavg(voltages);
    const vrms = this.calculateVrms(voltages);
    const { vtop, vbase, vamp } = this.calculateTopBase(voltages);
    const { period, frequency, dutyCycle, posWidth, negWidth } = this
      .calculateTiming(time, voltages);
    const { riseTime, fallTime } = this.calculateRiseFallTime(time, voltages);

    return {
      vpp,
      vmax,
      vmin,
      vrms,
      vavg,
      vamp,
      vtop,
      vbase,
      frequency,
      period,
      riseTime,
      fallTime,
      dutyCycle,
      posWidth,
      negWidth,
    };
  }
}
