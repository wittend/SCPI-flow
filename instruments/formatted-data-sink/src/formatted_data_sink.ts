import { MqttClient } from "../../data-source/src/mqtt_client.ts";

export type FormattedSinkMode = "file" | "mqtt" | "both";
export type FormattedDataFormat = "json" | "jsonl";
export type FileWriteMode = "append" | "overwrite";

export interface FormattedDataSinkConfig {
  mode: FormattedSinkMode;
  format: FormattedDataFormat;
  filePath: string;
  fileWriteMode: FileWriteMode;
  prettyJson: boolean;
  mqttBroker: string;
  mqttPort: number;
  mqttTopic: string;
  mqttUseWs: boolean;
  mqttRetain: boolean;
  includeTimestamp: boolean;
  active: boolean;
}

export interface FormattedDataSinkState {
  config: FormattedDataSinkConfig;
  status: "idle" | "ready" | "connected" | "error";
  error: string | null;
  itemsReceived: number;
  bytesWritten: number;
  lastItem: unknown | null;
  lastTimestamp: string | null;
}

export class FormattedDataSinkEngine {
  private config: FormattedDataSinkConfig = {
    mode: "file",
    format: "jsonl",
    filePath: "",
    fileWriteMode: "append",
    prettyJson: false,
    mqttBroker: "127.0.0.1",
    mqttPort: 1883,
    mqttTopic: "sensors/data",
    mqttUseWs: false,
    mqttRetain: false,
    includeTimestamp: true,
    active: false,
  };

  private status: "idle" | "ready" | "connected" | "error" = "idle";
  private error: string | null = null;
  private itemsReceived = 0;
  private bytesWritten = 0;
  private lastItem: unknown | null = null;
  private lastTimestamp: string | null = null;
  private fileHandle: Deno.FsFile | null = null;
  private jsonArrayBuffer: unknown[] = [];
  private mqtt: MqttClient | null = null;

  constructor(initialConfig?: Partial<FormattedDataSinkConfig>) {
    if (initialConfig) {
      this.configure(initialConfig);
    }
  }

  getState(): FormattedDataSinkState {
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

  async configure(newConfig: Partial<FormattedDataSinkConfig>): Promise<void> {
    const prevMode = this.config.mode;
    const prevActive = this.config.active;
    const prevFile = this.config.filePath;
    const prevFormat = this.config.format;
    const prevBroker = this.config.mqttBroker;

    Object.assign(this.config, newConfig);

    if (this.config.active) {
      if (
        !prevActive || prevMode !== this.config.mode ||
        prevFile !== this.config.filePath ||
        prevFormat !== this.config.format ||
        prevBroker !== this.config.mqttBroker
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
      if (this.config.mode === "file" || this.config.mode === "both") {
        if (this.config.filePath) {
          if (
            this.config.format === "json" &&
            this.config.fileWriteMode === "overwrite"
          ) {
            this.jsonArrayBuffer = [];
          }
          const openOptions: Deno.OpenOptions = {
            write: true,
            create: true,
            ...(this.config.fileWriteMode === "append" &&
                this.config.format === "jsonl"
              ? { append: true }
              : { truncate: true }),
          };
          this.fileHandle = await Deno.open(this.config.filePath, openOptions);
        }
      }

      if (this.config.mode === "mqtt" || this.config.mode === "both") {
        const mqtt = new MqttClient();
        this.mqtt = mqtt;
        if (this.config.mqttUseWs) {
          const url = `ws://${this.config.mqttBroker}:${this.config.mqttPort}`;
          await mqtt.connectWs(url);
        } else {
          await mqtt.connectTcp(this.config.mqttBroker, this.config.mqttPort);
        }
      }

      this.status = this.mqtt?.isConnected() ? "connected" : "ready";
    } catch (err) {
      this.status = "error";
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  async write(data: unknown): Promise<void> {
    let payloadObj: Record<string, unknown> | unknown = data;
    if (typeof data === "string") {
      try {
        payloadObj = JSON.parse(data);
      } catch {
        payloadObj = { data };
      }
    }

    if (
      this.config.includeTimestamp && payloadObj &&
      typeof payloadObj === "object" && !Array.isArray(payloadObj)
    ) {
      if (!("timestamp" in payloadObj)) {
        payloadObj = { timestamp: new Date().toISOString(), ...payloadObj };
      }
    }

    this.lastItem = payloadObj;
    this.lastTimestamp = new Date().toISOString();
    this.itemsReceived++;

    // 1. File write
    if (this.config.mode === "file" || this.config.mode === "both") {
      if (!this.fileHandle && this.config.filePath) {
        await this.start();
      }
      if (this.fileHandle) {
        if (this.config.format === "jsonl") {
          const line = JSON.stringify(payloadObj) + "\n";
          const bytes = new TextEncoder().encode(line);
          await this.fileHandle.write(bytes);
          await this.fileHandle.sync();
          this.bytesWritten += bytes.length;
        } else {
          // JSON array mode
          this.jsonArrayBuffer.push(payloadObj);
          const fullJson = this.config.prettyJson
            ? JSON.stringify(this.jsonArrayBuffer, null, 2)
            : JSON.stringify(this.jsonArrayBuffer);
          const bytes = new TextEncoder().encode(fullJson);
          if (this.config.filePath) {
            await Deno.writeTextFile(this.config.filePath, fullJson);
            this.bytesWritten = bytes.length;
          }
        }
      }
    }

    // 2. MQTT publish
    if (this.config.mode === "mqtt" || this.config.mode === "both") {
      if (this.mqtt && this.mqtt.isConnected()) {
        const messageStr = JSON.stringify(payloadObj);
        await this.mqtt.publish(
          this.config.mqttTopic,
          messageStr,
          this.config.mqttRetain,
        );
        if (this.config.mode === "mqtt") {
          this.bytesWritten += new TextEncoder().encode(messageStr).length;
        }
      }
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
    this.jsonArrayBuffer = [];
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
    if (this.mqtt) {
      try {
        await this.mqtt.disconnect();
      } catch {
        // Ignore
      }
      this.mqtt = null;
    }
  }

  executeScpi(command: string): string | null {
    const trimmed = command.trim();
    const upper = trimmed.toUpperCase();

    if (upper === "*IDN?") {
      return "SCPI-FLOW,FORMATTED-DATA-SINK,1.0.0,FSNK001";
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
      this.configure({ filePath: path, active: true });
      return "OK";
    }
    return `ERR: UNKNOWN_COMMAND (${command})`;
  }
}
