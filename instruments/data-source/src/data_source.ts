import { MqttClient, type MqttMessage } from "./mqtt_client.ts";

export type SourceMode = "file" | "websocket" | "mqtt";
export type DataFormat = "jsonl" | "json" | "raw" | "scpi";

export interface DataSourceConfig {
  mode: SourceMode;
  filePath: string;
  cadenceHz: number; // lines/sec for JSONL playback
  loop: boolean;
  wsUrl: string;
  mqttBroker: string;
  mqttPort: number;
  mqttTopic: string;
  mqttUseWs: boolean;
  mqttPollIntervalMs: number;
  format: DataFormat;
  active: boolean;
}

export interface DataSourceState {
  config: DataSourceConfig;
  status: "idle" | "running" | "connected" | "error";
  error: string | null;
  itemsEmitted: number;
  bytesEmitted: number;
  lastItem: unknown | null;
  lastTimestamp: string | null;
  fileTotalLines: number;
  fileCurrentLine: number;
  connectedClients: number;
}

export class DataSourceEngine {
  private config: DataSourceConfig = {
    mode: "file",
    filePath: "",
    cadenceHz: 1,
    loop: false,
    wsUrl: "",
    mqttBroker: "127.0.0.1",
    mqttPort: 1883,
    mqttTopic: "sensors/data",
    mqttUseWs: false,
    mqttPollIntervalMs: 1000,
    format: "jsonl",
    active: false,
  };

  private status: "idle" | "running" | "connected" | "error" = "idle";
  private error: string | null = null;
  private itemsEmitted = 0;
  private bytesEmitted = 0;
  private lastItem: unknown | null = null;
  private lastTimestamp: string | null = null;
  private fileTotalLines = 0;
  private fileCurrentLine = 0;
  private listeners: Array<(data: unknown, raw: string) => void> = [];

  // Internal runners
  private timerId: number | ReturnType<typeof setInterval> | null = null;
  private fileLines: string[] = [];
  private ws: WebSocket | null = null;
  private mqtt: MqttClient | null = null;

  constructor(initialConfig?: Partial<DataSourceConfig>) {
    if (initialConfig) {
      this.configure(initialConfig);
    }
  }

  addListener(listener: (data: unknown, raw: string) => void) {
    this.listeners.push(listener);
  }

  removeListener(listener: (data: unknown, raw: string) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  getState(): DataSourceState {
    return {
      config: { ...this.config },
      status: this.status,
      error: this.error,
      itemsEmitted: this.itemsEmitted,
      bytesEmitted: this.bytesEmitted,
      lastItem: this.lastItem,
      lastTimestamp: this.lastTimestamp,
      fileTotalLines: this.fileTotalLines,
      fileCurrentLine: this.fileCurrentLine,
      connectedClients: this.ws
        ? (this.ws.readyState === WebSocket.OPEN ? 1 : 0)
        : (this.mqtt?.isConnected() ? 1 : 0),
    };
  }

  async configure(newConfig: Partial<DataSourceConfig>): Promise<void> {
    const prevMode = this.config.mode;
    const prevActive = this.config.active;
    const prevFile = this.config.filePath;

    Object.assign(this.config, newConfig);

    if (this.config.cadenceHz <= 0) {
      this.config.cadenceHz = 1;
    }

    if (this.config.active) {
      if (
        !prevActive || prevMode !== this.config.mode ||
        prevFile !== this.config.filePath
      ) {
        await this.start();
      } else if (this.config.mode === "file" && this.timerId !== null) {
        // Adjust file cadence
        this.restartFileTimer();
      }
    } else {
      await this.stop();
    }
  }

  async start(): Promise<void> {
    await this.stop();
    this.error = null;
    this.config.active = true;

    try {
      if (this.config.mode === "file") {
        await this.startFileSource();
      } else if (this.config.mode === "websocket") {
        await this.startWebSocketSource();
      } else if (this.config.mode === "mqtt") {
        await this.startMqttSource();
      }
    } catch (err) {
      this.status = "error";
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  async stop(): Promise<void> {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    if (this.mqtt) {
      try {
        await this.mqtt.disconnect();
      } catch {
        // Ignore
      }
      this.mqtt = null;
    }
    this.config.active = false;
    this.status = "idle";
  }

  async reset(): Promise<void> {
    await this.stop();
    this.itemsEmitted = 0;
    this.bytesEmitted = 0;
    this.lastItem = null;
    this.lastTimestamp = null;
    this.fileTotalLines = 0;
    this.fileCurrentLine = 0;
    this.fileLines = [];
    this.error = null;
  }

  private async startFileSource(): Promise<void> {
    if (!this.config.filePath) {
      this.status = "idle";
      return;
    }
    const content = await Deno.readTextFile(this.config.filePath);
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    this.fileLines = lines;
    this.fileTotalLines = lines.length;
    this.fileCurrentLine = 0;
    this.status = "running";

    this.restartFileTimer();
  }

  private restartFileTimer() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    const intervalMs = Math.max(
      10,
      Math.round(1000 / (this.config.cadenceHz || 1)),
    );
    this.timerId = setInterval(() => {
      this.tickFileSource();
    }, intervalMs);
  }

  private tickFileSource() {
    if (this.fileLines.length === 0) {
      this.status = "idle";
      return;
    }
    if (this.fileCurrentLine >= this.fileLines.length) {
      if (this.config.loop) {
        this.fileCurrentLine = 0;
      } else {
        this.stop();
        return;
      }
    }

    const rawLine = this.fileLines[this.fileCurrentLine];
    this.fileCurrentLine++;
    this.emitData(rawLine);
  }

  private startWebSocketSource(): Promise<void> {
    if (!this.config.wsUrl) {
      this.status = "idle";
      return Promise.resolve();
    }
    const ws = new WebSocket(this.config.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.status = "connected";
      this.error = null;
    };

    ws.onmessage = (event) => {
      const raw = typeof event.data === "string"
        ? event.data
        : new TextDecoder().decode(event.data);
      this.emitData(raw);
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
    return Promise.resolve();
  }

  private async startMqttSource(): Promise<void> {
    const mqtt = new MqttClient();
    this.mqtt = mqtt;

    mqtt.onMessage((msg: MqttMessage) => {
      this.emitData(msg.payload, { topic: msg.topic, retain: msg.retain });
    });

    if (this.config.mqttUseWs) {
      const url = `ws://${this.config.mqttBroker}:${this.config.mqttPort}`;
      await mqtt.connectWs(url);
    } else {
      await mqtt.connectTcp(this.config.mqttBroker, this.config.mqttPort);
    }

    await mqtt.subscribe(this.config.mqttTopic || "#");
    this.status = "connected";
  }

  private emitData(raw: string, meta?: Record<string, unknown>) {
    let parsed: unknown = raw;
    if (this.config.format === "json" || this.config.format === "jsonl") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { raw, parseError: true };
      }
    }

    const item = meta ? { payload: parsed, ...meta } : parsed;
    this.lastItem = item;
    this.lastTimestamp = new Date().toISOString();
    this.itemsEmitted++;
    this.bytesEmitted += new TextEncoder().encode(raw).length;

    for (const listener of this.listeners) {
      try {
        listener(item, raw);
      } catch {
        // Ignore listener error
      }
    }
  }

  executeScpi(command: string): string | null {
    const trimmed = command.trim();
    const upper = trimmed.toUpperCase();

    if (upper === "*IDN?") {
      return "SCPI-FLOW,DATA-SOURCE,1.0.0,SRC001";
    }
    if (upper === "*RST") {
      this.reset();
      return "OK";
    }
    if (upper === ":STATUS?" || upper === "STATUS?") {
      return this.status.toUpperCase();
    }
    if (upper === ":COUNT?" || upper === "DATA:COUNT?") {
      return String(this.itemsEmitted);
    }
    if (upper === ":FETCH?" || upper === "DATA:FETCH?" || upper === "READ?") {
      return this.lastItem !== null ? JSON.stringify(this.lastItem) : "EMPTY";
    }
    if (upper === ":START" || upper === "INIT") {
      this.start();
      return "OK";
    }
    if (upper === ":STOP" || upper === "ABORT") {
      this.stop();
      return "OK";
    }
    if (upper.startsWith(":RATE ") || upper.startsWith("CONF:RATE ")) {
      const val = parseFloat(trimmed.split(" ")[1]);
      if (!Number.isNaN(val) && val > 0) {
        this.configure({ cadenceHz: val });
        return "OK";
      }
      return "ERR: INVALID_RATE";
    }
    if (upper.startsWith(":FILE ") || upper.startsWith("CONF:FILE ")) {
      const path = trimmed.slice(trimmed.indexOf(" ") + 1).trim();
      this.configure({ filePath: path, mode: "file" });
      return "OK";
    }
    return `ERR: UNKNOWN_COMMAND (${command})`;
  }
}
