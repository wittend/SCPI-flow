/**
 * Interactive Terminal CLI for the Siglent SDM3045X Digital Multimeter.
 * Provides rich ANSI front panel rendering, real-time measurement updates,
 * keyboard shortcuts, and interactive SCPI shell.
 */

import { MultimeterSimulation } from "./multimeter.ts";
import { ScpiEngine } from "./scpi_engine.ts";

export class MultimeterCli {
  public meter: MultimeterSimulation;
  public scpi: ScpiEngine;
  private running: boolean = true;
  private timer: number | ReturnType<typeof setInterval> | null = null;
  private refreshInterval: number = 250; // ms

  constructor(meter?: MultimeterSimulation) {
    this.meter = meter || new MultimeterSimulation();
    this.scpi = new ScpiEngine(this.meter);
  }

  public renderFrontPanel(): string {
    const reading = this.meter.lastReading;
    const fn = this.meter.function;
    const range = this.meter.autoRange ? "AUTO" : `${this.meter.range}`;
    const speed = this.meter.speed;
    const dual = this.meter.dualEnabled ? "[DUAL ON]" : "[DUAL OFF]";
    const math = this.meter.nullEnabled
      ? "[NULL]"
      : this.meter.statisticsEnabled
      ? "[STATS]"
      : this.meter.limits.enabled
      ? `[LIMIT: ${this.meter.limits.status}]`
      : this.meter.mathFunction !== "NONE"
      ? `[${this.meter.mathFunction}]`
      : "[MATH OFF]";
    const beep = this.meter.beeping ? " 🔊 BEEP!" : "";

    const lines: string[] = [];
    lines.push("╔══════════════════════════════════════════════════════════════════════════╗");
    lines.push("║                      SIGLENT SDM3045X Multimeter                         ║");
    lines.push("╠══════════════════════════════════════════════════════════════════════════╣");
    lines.push(
      `║  FN: ${fn.padEnd(10)}  RNG: ${range.padEnd(8)}  SPD: ${speed.padEnd(5)}  ${
        dual.padEnd(11)
      }  ${math.padEnd(12)} ║`,
    );
    lines.push("╠══════════════════════════════════════════════════════════════════════════╣");

    // Primary Digital Readout
    lines.push("║                                                                          ║");
    const displayVal = `   ${reading.formatted}${beep}`;
    lines.push(`║ \x1b[1;36m${displayVal.padEnd(72)}\x1b[0m ║`);
    lines.push("║                                                                          ║");

    // Secondary Readout (Dual Display)
    if (this.meter.dualEnabled && reading.secondaryFormatted) {
      const secLine = `   [2nd: ${this.meter.secondaryFunction}]  ${reading.secondaryFormatted}`;
      lines.push(`║ \x1b[1;33m${secLine.padEnd(72)}\x1b[0m ║`);
    } else {
      lines.push("║                                                                          ║");
    }

    lines.push("╠══════════════════════════════════════════════════════════════════════════╣");

    // Sub-view rendering based on display mode
    if (this.meter.displayMode === "BAR") {
      const bar = this.renderBarMeter(reading.value);
      lines.push(`║  BAR: [${bar}]  ║`);
    } else if (this.meter.statisticsEnabled) {
      const s = this.meter.stats;
      lines.push(
        `║  Avg: ${s.average.toFixed(4)} | Min: ${s.min.toFixed(4)} | Max: ${
          s.max.toFixed(4)
        } | Samples: ${s.count}`.padEnd(75) + "║",
      );
    } else if (this.meter.limits.enabled) {
      const l = this.meter.limits;
      lines.push(
        `║  Limit Low: ${l.low} | High: ${l.high} | Status: ${l.status} (Pass: ${l.passCount}, Fail: ${
          l.highCount + l.lowCount
        })`.padEnd(75) + "║",
      );
    } else {
      lines.push(
        "║  View: [1]DCV [2]ACV [3]DCI [4]ACI [5]RES [6]CAP [7]CONT [8]DIOD [9]FREQ [0]TEMP║",
      );
    }

    lines.push("╠══════════════════════════════════════════════════════════════════════════╣");
    lines.push("║ Controls: [A]uto [U]p [J]Down [S]peed [D]ual [M]ath [V]iew [T]rig [C]md [Q]uit║");
    lines.push("╚══════════════════════════════════════════════════════════════════════════╝");

    return lines.join("\n");
  }

  private renderBarMeter(val: number): string {
    const width = 58;
    const max = this.meter.range;
    const pct = Math.max(0, Math.min(1, Math.abs(val) / (max || 1)));
    const filled = Math.round(pct * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  }

  public async runInteractive(): Promise<void> {
    if (!Deno.stdin.isTerminal()) {
      console.log(this.renderFrontPanel());
      return;
    }

    Deno.stdin.setRaw(true);
    console.clear();

    const renderLoop = () => {
      this.meter.takeReading();
      console.clear();
      console.log(this.renderFrontPanel());
    };

    renderLoop();
    this.timer = setInterval(renderLoop, this.refreshInterval);

    const buf = new Uint8Array(8);
    while (this.running) {
      const n = await Deno.stdin.read(buf);
      if (n === null) break;

      const key = new TextDecoder().decode(buf.subarray(0, n));

      if (key === "q" || key === "\u0003") {
        // Quit (q or Ctrl+C)
        this.running = false;
        break;
      } else if (key === "1") {
        this.meter.function = "VOLT:DC";
      } else if (key === "2") {
        this.meter.function = "VOLT:AC";
      } else if (key === "3") {
        this.meter.function = "CURR:DC";
      } else if (key === "4") {
        this.meter.function = "CURR:AC";
      } else if (key === "5") {
        this.meter.function = this.meter.function === "RES" ? "FRES" : "RES";
      } else if (key === "6") {
        this.meter.function = "CAP";
      } else if (key === "7") {
        this.meter.function = "CONT";
      } else if (key === "8") {
        this.meter.function = "DIOD";
      } else if (key === "9") {
        this.meter.function = this.meter.function === "FREQ" ? "PER" : "FREQ";
      } else if (key === "0") {
        this.meter.function = "TEMP";
      } else if (key === "a" || key === "A") {
        this.meter.autoRange = !this.meter.autoRange;
      } else if (key === "u" || key === "U" || key === "+") {
        this.meter.rangeUp();
      } else if (key === "j" || key === "J" || key === "-") {
        this.meter.rangeDown();
      } else if (key === "s" || key === "S") {
        if (this.meter.speed === "SLOW") this.meter.speed = "MED";
        else if (this.meter.speed === "MED") this.meter.speed = "FAST";
        else this.meter.speed = "SLOW";
      } else if (key === "d" || key === "D") {
        this.meter.dualEnabled = !this.meter.dualEnabled;
      } else if (key === "m" || key === "M") {
        if (
          !this.meter.statisticsEnabled && !this.meter.limits.enabled && !this.meter.nullEnabled
        ) {
          this.meter.statisticsEnabled = true;
        } else if (this.meter.statisticsEnabled) {
          this.meter.statisticsEnabled = false;
          this.meter.limits.enabled = true;
        } else if (this.meter.limits.enabled) {
          this.meter.limits.enabled = false;
          this.meter.nullEnabled = true;
        } else {
          this.meter.nullEnabled = false;
        }
      } else if (key === "v" || key === "V") {
        if (this.meter.displayMode === "NUMBER") this.meter.displayMode = "BAR";
        else if (this.meter.displayMode === "BAR") this.meter.displayMode = "TREND";
        else if (this.meter.displayMode === "TREND") this.meter.displayMode = "HISTOGRAM";
        else this.meter.displayMode = "NUMBER";
      } else if (key === "t" || key === "T") {
        this.meter.takeReading();
      } else if (key === "r" || key === "R") {
        this.meter.isRunning = !this.meter.isRunning;
      } else if (key === "c" || key === "C") {
        // Switch to SCPI prompt mode
        if (this.timer) clearInterval(this.timer);
        Deno.stdin.setRaw(false);
        console.clear();
        console.log("=== SCPI Interactive Terminal (type 'exit' to return) ===");
        const buf = new Uint8Array(1024);
        while (true) {
          await Deno.stdout.write(new TextEncoder().encode("SCPI> "));
          const readCount = await Deno.stdin.read(buf);
          if (readCount === null) break;
          const line = new TextDecoder().decode(buf.subarray(0, readCount)).trim();
          if (line === "exit" || line === "quit") break;
          if (line) {
            const resp = this.scpi.execute(line);
            if (resp !== null) {
              console.log(resp);
            }
          }
        }
        Deno.stdin.setRaw(true);
        this.timer = setInterval(renderLoop, this.refreshInterval);
      }
    }

    if (this.timer) clearInterval(this.timer);
    Deno.stdin.setRaw(false);
    console.clear();
  }
}

if (import.meta.main) {
  const cli = new MultimeterCli();
  await cli.runInteractive();
}
