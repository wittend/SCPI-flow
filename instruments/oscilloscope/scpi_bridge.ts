/**
 * MCP Interface for SCPI communication with built-in pure TypeScript
 * Oscilloscope simulation engine and optional Python Bridge (pyVisa).
 */

import { ScpiEngine } from "./src/scpi_engine.ts";
import { OscilloscopeSimulation } from "./src/oscilloscope.ts";

export interface BridgeResponse {
  status: string;
  resources?: string[];
  response?: string;
  message?: string;
}

export class ScpiBridge {
  private process: Deno.ChildProcess | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  public engine: ScpiEngine;
  private usePython = false;

  constructor(scope?: OscilloscopeSimulation) {
    this.engine = new ScpiEngine(scope);
  }

  start(tryPython = false): Promise<void> {
    if (!tryPython) {
      return Promise.resolve();
    }

    try {
      const command = new Deno.Command("python3", {
        args: ["python_mcp/scpi_bridge.py"],
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });

      this.process = command.spawn();
      this.reader = this.process.stdout.getReader();
      this.writer = this.process.stdin.getWriter();
      this.usePython = true;

      // Handle stderr asynchronously
      (async () => {
        if (!this.process) return;
        try {
          const errReader = this.process.stderr.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { value, done } = await errReader.read();
            if (done) break;
            const text = decoder.decode(value);
            if (
              text.includes("ModuleNotFoundError") || text.includes("Error")
            ) {
              this.usePython = false;
            }
          }
        } catch {
          this.usePython = false;
        }
      })();
    } catch {
      this.usePython = false;
    }

    return Promise.resolve();
  }

  async sendCommand(payload: {
    command: string;
    resource?: string;
    query?: string;
    write?: string;
  }): Promise<BridgeResponse> {
    const resource = payload.resource || "SIM::OSCILLOSCOPE::SDS1000X";

    // Route simulated resources to pure TypeScript SCPI engine
    if (
      resource.startsWith("SIM::") || !this.usePython || !this.writer ||
      !this.reader
    ) {
      if (payload.command === "list_resources") {
        return {
          status: "success",
          resources: [
            "SIM::OSCILLOSCOPE::SDS1000X",
            "SIM::SIGNAL_GENERATOR::CH1",
            "SIM::SIGNAL_GENERATOR::CH2",
          ],
        };
      }

      if (payload.command === "query" && payload.query) {
        const response = this.engine.query(payload.query);
        return { status: "success", response };
      }

      if (payload.command === "write" && payload.write) {
        this.engine.write(payload.write);
        return { status: "success" };
      }

      return {
        status: "error",
        message: `Unknown command: ${payload.command}`,
      };
    }

    // Otherwise route to Python pyVisa bridge
    try {
      const message = JSON.stringify(payload) + "\n";
      await this.writer.write(this.encoder.encode(message));

      const { value } = await this.reader.read();
      if (!value) {
        return { status: "error", message: "No response from Python bridge" };
      }

      const response = this.decoder.decode(value);
      return JSON.parse(response);
    } catch (e) {
      return { status: "error", message: (e as Error).message };
    }
  }

  listResources(): Promise<BridgeResponse> {
    return this.sendCommand({ command: "list_resources" });
  }

  query(resource: string, query: string): Promise<BridgeResponse> {
    return this.sendCommand({ command: "query", resource, query });
  }

  write(resource: string, write: string): Promise<BridgeResponse> {
    return this.sendCommand({ command: "write", resource, write });
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore kill errors
      }
      this.process = null;
      this.reader = null;
      this.writer = null;
      this.usePython = false;
    }
  }
}
