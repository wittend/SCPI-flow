/**
 * MCP Interface for SCPI communication via Python Bridge (pyVisa)
 */

export class ScpiBridge {
  private process: Deno.ChildProcess | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  async start() {
    const command = new Deno.Command("python3", {
      args: ["python_mcp/scpi_bridge.py"],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    this.process = command.spawn();
    this.reader = this.process.stdout.getReader();
    this.writer = this.process.stdin.getWriter();

    // Log stderr for debugging
    (async () => {
      const errReader = this.process!.stderr.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await errReader.read();
        if (done) break;
        console.error("SCPI Bridge Error:", decoder.decode(value));
      }
    })();
  }

  async sendCommand(payload: any): Promise<any> {
    if (!this.writer || !this.reader) {
      throw new Error("Bridge not started");
    }

    try {
      const message = JSON.stringify(payload) + "\n";
      await this.writer.write(this.encoder.encode(message));

      const { value } = await this.reader.read();
      if (!value) {
        return { status: "error", message: "No response from bridge (is pyvisa installed?)" };
      }

      const response = this.decoder.decode(value);
      return JSON.parse(response);
    } catch (e) {
      return { status: "error", message: (e as Error).message };
    }
  }

  async listResources() {
    return this.sendCommand({ command: "list_resources" });
  }

  async query(resource: string, query: string) {
    return this.sendCommand({ command: "query", resource, query });
  }

  async write(resource: string, write: string) {
    return this.sendCommand({ command: "write", resource, write });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
