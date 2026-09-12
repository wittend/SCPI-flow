/**
 * CLI Application for SCPI-flow Oscilloscope Simulation.
 * Allows terminal-based interactive SCPI control, ASCII waveform visualization,
 * signal generator manipulation, and automated measurements.
 */

import { OscilloscopeSimulation } from "./oscilloscope.ts";
import { ScpiEngine } from "./scpi_engine.ts";

export class OscilloscopeCli {
  public scope: OscilloscopeSimulation;
  public scpi: ScpiEngine;

  constructor(scope?: OscilloscopeSimulation) {
    this.scope = scope || new OscilloscopeSimulation();
    this.scpi = new ScpiEngine(this.scope);
  }

  /**
   * Renders an ANSI-colored ASCII visual oscilloscope display in the terminal.
   */
  renderAsciiDisplay(width = 70, height = 18): string {
    const frame = this.scope.acquire();
    const lines: string[] = [];

    const yellow = "\x1b[33m";
    const cyan = "\x1b[36m";
    const dim = "\x1b[90m";
    const reset = "\x1b[0m";
    const bold = "\x1b[1m";
    const green = "\x1b[32m";

    // Header Title
    lines.push(`${bold}┌─ ${this.scope.title} ─┐${reset}`);
    lines.push(
      `${dim}│${reset} ${yellow}CH1: ${frame.ch1.voltDiv}V/div (${
        frame.ch1.enabled ? "ON" : "OFF"
      })${reset}  ` +
        `${cyan}CH2: ${frame.ch2.voltDiv}V/div (${
          frame.ch2.enabled ? "ON" : "OFF"
        })${reset}  ` +
        `${green}TB: ${
          (frame.timebase.timeDiv * 1000).toFixed(2)
        }ms/div${reset}  ` +
        `${dim}Trig: ${frame.trigger.source} (${frame.trigger.status})${reset}`,
    );
    lines.push(`${dim}├${"─".repeat(width - 2)}┤${reset}`);

    // Create 2D grid
    const grid: string[][] = Array.from(
      { length: height },
      () => Array(width - 4).fill(" "),
    );

    const gridW = width - 4;
    const gridH = height;

    // Draw grid background dots/crosses
    for (let r = 0; r < gridH; r++) {
      for (let c = 0; c < gridW; c++) {
        if (r === Math.floor(gridH / 2) && c === Math.floor(gridW / 2)) {
          grid[r][c] = "+";
        } else if (r === Math.floor(gridH / 2)) {
          grid[r][c] = "-";
        } else if (c === Math.floor(gridW / 2)) {
          grid[r][c] = "|";
        } else if (r % 4 === 0 && c % 6 === 0) {
          grid[r][c] = ".";
        }
      }
    }

    // Plot CH1 (Yellow)
    if (frame.ch1.data && frame.ch1.enabled) {
      const vArr = frame.ch1.data.voltage;
      const vDiv = frame.ch1.voltDiv;
      const vOffset = frame.ch1.offset;
      const totalV = vDiv * 8; // 8 vertical divisions

      for (let c = 0; c < gridW; c++) {
        const sampleIdx = Math.floor((c / gridW) * vArr.length);
        const v = vArr[sampleIdx];
        const norm = (v - vOffset) / totalV; // -0.5 to 0.5 centered
        const row = Math.floor(gridH / 2 - norm * gridH);
        if (row >= 0 && row < gridH) {
          grid[row][c] = `${yellow}●${reset}`;
        }
      }
    }

    // Plot CH2 (Cyan)
    if (frame.ch2.data && frame.ch2.enabled) {
      const vArr = frame.ch2.data.voltage;
      const vDiv = frame.ch2.voltDiv;
      const vOffset = frame.ch2.offset;
      const totalV = vDiv * 8;

      for (let c = 0; c < gridW; c++) {
        const sampleIdx = Math.floor((c / gridW) * vArr.length);
        const v = vArr[sampleIdx];
        const norm = (v - vOffset) / totalV;
        const row = Math.floor(gridH / 2 - norm * gridH);
        if (row >= 0 && row < gridH) {
          grid[row][c] = `${cyan}▲${reset}`;
        }
      }
    }

    // Convert grid to strings
    for (let r = 0; r < gridH; r++) {
      const rowStr = grid[r].map((ch) =>
        ch.includes("\x1b") ? ch : `${dim}${ch}${reset}`
      ).join("");
      lines.push(`${dim}│${reset} ${rowStr} ${dim}│${reset}`);
    }

    lines.push(`${dim}├${"─".repeat(width - 2)}┤${reset}`);

    // Measurements summary line
    const m1 = this.scope.getMeasurements(1);
    const m2 = this.scope.getMeasurements(2);
    lines.push(
      `${yellow}CH1 Vpp:${m1.vpp.toFixed(2)}V Freq:${
        m1.frequency.toFixed(1)
      }Hz${reset} | ` +
        `${cyan}CH2 Vpp:${m2.vpp.toFixed(2)}V Freq:${
          m2.frequency.toFixed(1)
        }Hz${reset}`,
    );
    lines.push(`${dim}└${"─".repeat(width - 2)}┘${reset}`);

    return lines.join("\n");
  }

  /**
   * Returns measurement table string.
   */
  renderMeasurements(): string {
    const m1 = this.scope.getMeasurements(1);
    const m2 = this.scope.getMeasurements(2);

    return [
      "==================== MEASUREMENTS ====================",
      `Parameter       | Channel 1 (Yellow)     | Channel 2 (Cyan)`,
      "----------------+------------------------+--------------------",
      `Vpp (Peak-Peak) | ${m1.vpp.toFixed(3)} V                | ${
        m2.vpp.toFixed(3)
      } V`,
      `Vmax (Maximum)  | ${m1.vmax.toFixed(3)} V                | ${
        m2.vmax.toFixed(3)
      } V`,
      `Vmin (Minimum)  | ${m1.vmin.toFixed(3)} V                | ${
        m2.vmin.toFixed(3)
      } V`,
      `Vrms (RMS)      | ${m1.vrms.toFixed(3)} V                | ${
        m2.vrms.toFixed(3)
      } V`,
      `Vavg (Mean)     | ${m1.vavg.toFixed(3)} V                | ${
        m2.vavg.toFixed(3)
      } V`,
      `Frequency       | ${m1.frequency.toFixed(2)} Hz             | ${
        m2.frequency.toFixed(2)
      } Hz`,
      `Period          | ${(m1.period * 1000).toFixed(3)} ms            | ${
        (m2.period * 1000).toFixed(3)
      } ms`,
      `Duty Cycle      | ${
        (m1.dutyCycle * 100).toFixed(1)
      } %                 | ${(m2.dutyCycle * 100).toFixed(1)} %`,
      "======================================================",
    ].join("\n");
  }

  /**
   * Interactive REPL mode.
   */
  async runInteractive(): Promise<void> {
    console.log("\n=======================================================");
    console.log("   SCPI-flow Digital Oscilloscope Simulation CLI");
    console.log("   Type SCPI commands (e.g. *IDN?, C1:VDIV 2, MEAS:ALL?)");
    console.log("   Type 'draw', 'meas', 'status', 'help', or 'exit'");
    console.log("=======================================================\n");

    const buf = new Uint8Array(1024);
    const decoder = new TextDecoder();

    while (true) {
      await Deno.stdout.write(new TextEncoder().encode("SCPI> "));
      const n = await Deno.stdin.read(buf);
      if (n === null) break;

      const input = decoder.decode(buf.subarray(0, n)).trim();
      if (!input) continue;

      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        console.log("Exiting SCPI CLI.");
        break;
      }

      if (
        input.toLowerCase() === "draw" || input.toLowerCase() === "plot" ||
        input.toLowerCase() === "scope"
      ) {
        console.log(this.renderAsciiDisplay());
        continue;
      }

      if (input.toLowerCase() === "meas" || input.toLowerCase() === "measure") {
        console.log(this.renderMeasurements());
        continue;
      }

      if (input.toLowerCase() === "status") {
        console.log(
          `STB: ${this.scpi.stb} (0b${
            this.scpi.stb.toString(2).padStart(8, "0")
          })`,
        );
        console.log(
          `ESR: ${this.scpi.esr} (0b${
            this.scpi.esr.toString(2).padStart(8, "0")
          })`,
        );
        console.log(`System Error: ${this.scpi.query("SYST:ERR?")}`);
        continue;
      }

      if (input.toLowerCase() === "help") {
        console.log([
          "Available CLI commands:",
          "  draw / plot       - Render terminal oscilloscope display",
          "  meas / measure    - Show measurements table",
          "  status            - Show STB/ESR and error status",
          "  help              - Show this help",
          "  exit / quit       - Exit REPL",
          "",
          "Example SCPI commands:",
          "  *IDN?             - Identification query",
          "  *RST              - Reset instrument",
          "  C1:VDIV 2.0       - Set Channel 1 scale to 2V/div",
          "  C1:WAVE:TYPE SINE - Set Channel 1 waveform to Sine",
          "  C1:WAVE:FREQ 2500 - Set Channel 1 frequency to 2.5kHz",
          "  C2:WAVE:TYPE SQUARE - Set Channel 2 to Square wave",
          "  MEAS:ALL?         - Query all measurements JSON",
          "  SYST:ERR?         - Query SCPI error queue",
        ].join("\n"));
        continue;
      }

      // Execute SCPI command
      const resp = this.scpi.execute(input);
      if (resp !== null) {
        console.log(resp);
      }
    }
  }
}

if (import.meta.main) {
  const args = Deno.args;
  const cli = new OscilloscopeCli();

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: deno run --allow-all src/cli.ts [options]");
    console.log("Options:");
    console.log(
      "  --exec <cmd>   Execute SCPI command string and print result",
    );
    console.log("  --plot         Display ASCII oscilloscope waveform");
    console.log("  --meas         Print measurement table");
    console.log("  --help, -h     Show this help");
    Deno.exit(0);
  }

  const execIdx = args.indexOf("--exec");
  if (execIdx !== -1 && args[execIdx + 1]) {
    const cmd = args[execIdx + 1];
    const resp = cli.scpi.execute(cmd);
    if (resp !== null) console.log(resp);
    Deno.exit(0);
  }

  if (args.includes("--plot")) {
    console.log(cli.renderAsciiDisplay());
    Deno.exit(0);
  }

  if (args.includes("--meas")) {
    console.log(cli.renderMeasurements());
    Deno.exit(0);
  }

  // Otherwise start interactive REPL
  await cli.runInteractive();
}
