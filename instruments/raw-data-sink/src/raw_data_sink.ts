export type RawSinkMode = "file" | "websocket";
export type FileWriteMode = "append" | "overwrite";

export interface RawDataSinkConfig {
  mode: RawSinkMode;
  filePath: string;
  fileWriteMode: FileWriteMode;
  wsUrl: string;
  autoFlush: boolean;
  active: boolean;
}

export interface RawDataSinkState {
  config: RawDataSinkConfig;
  status: "idle" | "ready" | "connected" | "error";
  error: string | null;
  itemsReceived: number;
  bytesWritten: number;
  lastItem: string | null;
  lastTimestamp: string | null;
}

export class RawDataSinkEngine {
  private config: RawDataSinkConfig = {
    mode: "file",
    filePath: "",
    fileWriteMode: "append",
    wsUrl: "",
    autoFlush: true,
    active: false,
  };

  private status: "idle" | "ready" | "connected" | "error" = "idle";
  private error: string | null = null;
  private itemsReceived = 0;
  private bytesWritten = 0;
  private lastItem: string | null = null;
  private lastTimestamp: string | null = null;
  private ws: WebSocket | null = null;
  private fileHandle: Deno.FsFile | null = null;

  constructor(initialConfig?: Partial<RawDataSinkConfig>) {
    if (initialConfig) {
      this.configure(initialConfig);
    }
  }

  getState(): RawDataSinkState {
    return {
      config: { ...this.config },
      status: this.status,
      error: this.error,
      itemsReceived: this.itemsReceived,
      bytesWritten: this.bytesWritten,
      lastItem: this.lastItem,
      lastTimestamp: this.lastTimestamp,
    };
  }

  async configure(newConfig: Partial<RawDataSinkConfig>): Promise<void> {
    const prevMode = this.config.mode;
    const prevActive = this.config.active;
    const prevFile = this.config.filePath;
    const prevWs = this.config.wsUrl;

    Object.assign(this.config, newConfig);

    if (this.config.active) {
      if (
        !prevActive || prevMode !== this.config.mode ||
        prevFile !== this.config.filePath || prevWs !== this.config.wsUrl
      ) {
        await this.start();
      }
    } else {
      await this.stop();
    }
  }

  async start(): Promise<void> {
    await this.closeResources();
    this.error = null;
    this.config.active = true;

    try {
      if (this.config.mode === "file") {
        if (!this.config.filePath) {
          this.status = "idle";
          return;
        }
        const openOptions: Deno.OpenOptions = {
          write: true,
          create: true,
          ...(this.config.fileWriteMode === "append"
            ? { append: true }
            : { truncate: true }),
        };
        this.fileHandle = await Deno.open(this.config.filePath, openOptions);
        this.status = "ready";
      } else if (this.config.mode === "websocket") {
        if (!this.config.wsUrl) {
          this.status = "idle";
          return;
        }
        const ws = new WebSocket(this.config.wsUrl);
        this.ws = ws;
        ws.onopen = () => {
          this.status = "connected";
          this.error = null;
        };
        ws.onerror = (e) => {
          this.status = "error";
          this.error = `WebSocket error: ${e}`;
        };
        ws.onclose = () => {
          if (this.config.active && this.status !== "error") {
            this.status = "idle";
          }
        };
      }
    } catch (err) {
      this.status = "error";
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  async write(data: string | Uint8Array): Promise<void> {
    const rawStr = typeof data === "string"
      ? data
      : new TextDecoder().decode(data);
    const rawBytes = typeof data === "string"
      ? new TextEncoder().encode(data)
      : data;

    this.lastItem = rawStr.length > 500 ? rawStr.slice(0, 500) + "..." : rawStr;
    this.lastTimestamp = new Date().toISOString();
    this.itemsReceived++;

    try {
      if (this.config.mode === "file") {
        if (!this.fileHandle && this.config.filePath) {
          await this.start();
        }
        if (this.fileHandle) {
          await this.fileHandle.write(rawBytes);
          if (this.config.autoFlush) {
            await this.fileHandle.sync();
          }
          this.bytesWritten += rawBytes.length;
        }
      } else if (this.config.mode === "websocket") {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(data);
          this.bytesWritten += rawBytes.length;
        } else {
          throw new Error("WebSocket sink not connected");
        }
      }
    } catch (err) {
      this.status = "error";
      this.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.config.active = false;
    await this.closeResources();
    this.status = "idle";
  }

  async reset(): Promise<void> {
    await this.stop();
    this.itemsReceived = 0;
    this.bytesWritten = 0;
    this.lastItem = null;
    this.lastTimestamp = null;
    this.error = null;
  }

  private async closeResources() {
    if (this.fileHandle) {
      try {
        await this.fileHandle.sync();
        this.fileHandle.close();
      } catch {
        // Ignore
      }
      this.fileHandle = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  executeScpi(command: string): string | null {
    const trimmed = command.trim();
    const upper = trimmed.toUpperCase();

    if (upper === "*IDN?") {
      return "SCPI-FLOW,RAW-DATA-SINK,1.0.0,SNK001";
    }
    if (upper === "*RST") {
      this.reset();
      return "OK";
    }
    if (upper === ":STATUS?" || upper === "STATUS?") {
      return this.status.toUpperCase();
    }
    if (upper === ":COUNT?" || upper === "DATA:COUNT?") {
      return String(this.itemsReceived);
    }
    if (upper === ":BYTES?" || upper === "DATA:BYTES?") {
      return String(this.bytesWritten);
    }
    if (upper.startsWith(":WRITE ") || upper.startsWith("DATA:WRITE ")) {
      const payload = trimmed.slice(trimmed.indexOf(" ") + 1);
      this.write(payload).catch(() => {});
      return "OK";
    }
    if (upper.startsWith(":FILE ") || upper.startsWith("CONF:FILE ")) {
      const path = trimmed.slice(trimmed.indexOf(" ") + 1).trim();
      this.configure({ filePath: path, mode: "file", active: true });
      return "OK";
    }
    return `ERR: UNKNOWN_COMMAND (${command})`;
  }
}
