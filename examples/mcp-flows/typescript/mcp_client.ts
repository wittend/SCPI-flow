/**
 * Lightweight TypeScript Client for SCPI-flow MCP Interface.
 *
 * Supports communication via stdio subprocess or direct HTTP bridge.
 */

export interface McpClientOptions {
  /** Path to mcp_cli.ts or command to execute */
  mcpCliPath?: string;
  /** SCPI-flow shell URL (defaults to http://127.0.0.1:8000) */
  shellUrl?: string;
  /** Protocol version to negotiate */
  protocolVersion?: string;
}

export interface InstrumentManifest {
  id: string;
  name: string;
  version: string;
  category?: string;
  description?: string;
  loaded?: boolean;
}

export class ScpiFlowMcpClient {
  private process: Deno.ChildProcess | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
    }
  >();
  private readBuffer = "";
  private closed = false;

  constructor(private options: McpClientOptions = {}) {}

  /**
   * Spawns the MCP CLI process over stdio and performs MCP handshake.
   */
  async connect(): Promise<void> {
    const cliPath = this.options.mcpCliPath ??
      new URL("../../../src/mcp_cli.ts", import.meta.url).pathname;
    const shellUrl = this.options.shellUrl ?? "http://127.0.0.1:8000";

    const command = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--allow-net=127.0.0.1:8000,localhost:8000",
        cliPath,
        "--url",
        shellUrl,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "inherit",
    });

    this.process = command.spawn();
    this.writer = this.process.stdin.getWriter();
    this.reader = this.process.stdout.getReader();

    this.startReadLoop();

    // 1. Send initialize request
    const initResult = await this.sendRequest("initialize", {
      protocolVersion: this.options.protocolVersion ?? "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "scpi-flow-external-mcp-flow",
        version: "1.0.0",
      },
    });

    // 2. Send initialized notification
    await this.sendNotification("notifications/initialized", {});

    return initResult as void;
  }

  private async startReadLoop(): Promise<void> {
    if (!this.reader) return;
    const decoder = new TextDecoder();

    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read();
        if (done) break;

        this.readBuffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = this.readBuffer.indexOf("\n")) !== -1) {
          const line = this.readBuffer.slice(0, newline).trim();
          this.readBuffer = this.readBuffer.slice(newline + 1);

          if (line) {
            this.handleMessage(line);
          }
        }
      }
    } catch (err) {
      if (!this.closed) {
        console.error("MCP client read loop error:", err);
      }
    }
  }

  private handleMessage(jsonLine: string): void {
    try {
      const msg = JSON.parse(jsonLine);
      if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
        const { resolve, reject } = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);

        if (msg.error) {
          reject(
            new Error(`MCP Error ${msg.error.code}: ${msg.error.message}`),
          );
        } else {
          resolve(msg.result);
        }
      }
    } catch (e) {
      console.error("Failed to parse MCP response:", jsonLine, e);
    }
  }

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.writer) throw new Error("MCP client is not connected");
    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    }) + "\n";

    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });

    await this.writer.write(new TextEncoder().encode(payload));
    return promise;
  }

  private async sendNotification(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.writer) throw new Error("MCP client is not connected");
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method,
      ...(params ? { params } : {}),
    }) + "\n";

    await this.writer.write(new TextEncoder().encode(payload));
  }

  /** Call an MCP tool on the SCPI-flow server */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const response = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    }) as {
      content?: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    if (response?.content && response.content.length > 0) {
      const text = response.content[0].text;
      const parsed = text ? JSON.parse(text) : null;
      if (response.isError) {
        const errorMsg = parsed?.error || text || "Tool execution failed";
        throw new Error(`Tool ${name} failed: ${errorMsg}`);
      }
      return parsed;
    }
    return null;
  }

  /** List all registered instruments */
  async list(): Promise<unknown> {
    return await this.callTool("list");
  }

  /** Register an instrument from local manifest */
  async register(path: string): Promise<unknown> {
    return await this.callTool("register", { path });
  }

  /** Load and spawn an instrument process by ID */
  async load(id: string): Promise<unknown> {
    return await this.callTool("load", { id });
  }

  /** Unload an instrument */
  async unload(id: string): Promise<unknown> {
    return await this.callTool("unload", { id });
  }

  /** Read instrument state and telemetry */
  async state(id: string): Promise<unknown> {
    return await this.callTool("state", { id });
  }

  /** Configure instrument parameters */
  async configure(
    id: string,
    configuration: Record<string, unknown>,
  ): Promise<unknown> {
    return await this.callTool("configure", { id, configuration });
  }

  /** Send a raw SCPI command string */
  async command(id: string, commandStr: string): Promise<unknown> {
    return await this.callTool("command", { id, command: commandStr });
  }

  /** Reset instrument to default configuration */
  async reset(id: string): Promise<unknown> {
    return await this.callTool("reset", { id });
  }

  /** Gracefully close MCP client and subprocess */
  async close(): Promise<void> {
    this.closed = true;
    if (this.writer) {
      try {
        await this.writer.close();
      } catch {
        // ignore
      }
    }
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // ignore
      }
    }
  }
}
