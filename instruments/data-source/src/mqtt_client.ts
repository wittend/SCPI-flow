/** Lightweight zero-dependency MQTT 3.1.1 client for Deno TCP / WebSocket connections. */

export interface MqttMessage {
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
}

export class MqttClient {
  private conn: Deno.Conn | null = null;
  private ws: WebSocket | null = null;
  private connected = false;
  private onMessageCb: ((msg: MqttMessage) => void) | null = null;
  private readAbort: AbortController | null = null;

  async connectTcp(
    host: string,
    port = 1883,
    clientId = `scpi-flow-${Math.random().toString(36).slice(2, 8)}`,
    username?: string,
    password?: string,
  ): Promise<void> {
    await this.disconnect();
    const conn = await Deno.connect({ hostname: host, port });
    this.conn = conn;
    this.readAbort = new AbortController();

    // Send CONNECT packet (MQTT 3.1.1)
    const connectPacket = this.encodeConnect(clientId, username, password);
    await conn.write(connectPacket);

    // Read CONNACK
    const header = new Uint8Array(4);
    await this.readFull(conn, header);
    if (header[0] !== 0x20 || header[1] !== 0x02 || header[3] !== 0x00) {
      throw new Error(`MQTT connection rejected with code: ${header[3]}`);
    }
    this.connected = true;

    // Start background reader
    this.readLoop(conn, this.readAbort.signal).catch(() => {
      this.connected = false;
    });
  }

  async connectWs(
    url: string,
    clientId = `scpi-flow-${Math.random().toString(36).slice(2, 8)}`,
  ): Promise<void> {
    await this.disconnect();
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url, ["mqttv3.1", "mqtt"]);
        ws.binaryType = "arraybuffer";
        this.ws = ws;

        ws.onopen = () => {
          const packet = this.encodeConnect(clientId);
          ws.send(packet);
        };

        ws.onmessage = (event) => {
          const data = new Uint8Array(event.data as ArrayBuffer);
          if (!this.connected && data[0] === 0x20) {
            if (data[3] === 0x00) {
              this.connected = true;
              resolve();
            } else {
              reject(new Error(`MQTT WS connection rejected: ${data[3]}`));
            }
            return;
          }
          this.parsePacket(data);
        };

        ws.onerror = (e) => {
          if (!this.connected) reject(new Error(`WebSocket error: ${e}`));
        };

        ws.onclose = () => {
          this.connected = false;
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  onMessage(cb: (msg: MqttMessage) => void) {
    this.onMessageCb = cb;
  }

  async subscribe(topic: string, packetId = 1): Promise<void> {
    if (!this.connected) throw new Error("MQTT client not connected");
    const packet = this.encodeSubscribe(topic, packetId);
    if (this.conn) {
      await this.conn.write(packet);
    } else if (this.ws) {
      this.ws.send(packet);
    }
  }

  async publish(topic: string, message: string, retain = false): Promise<void> {
    if (!this.connected) throw new Error("MQTT client not connected");
    const packet = this.encodePublish(topic, message, retain);
    if (this.conn) {
      await this.conn.write(packet);
    } else if (this.ws) {
      this.ws.send(packet);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.readAbort) {
      this.readAbort.abort();
      this.readAbort = null;
    }
    if (this.conn) {
      try {
        await this.conn.write(new Uint8Array([0xe0, 0x00])); // DISCONNECT
        this.conn.close();
      } catch {
        // Ignore
      }
      this.conn = null;
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

  isConnected(): boolean {
    return this.connected;
  }

  private encodeConnect(
    clientId: string,
    username?: string,
    password?: string,
  ): Uint8Array {
    const protoName = new TextEncoder().encode("MQTT");
    const protoLevel = 4; // 3.1.1
    let flags = 0x02; // Clean session
    if (username) flags |= 0x80;
    if (password) flags |= 0x40;

    const keepAlive = 60;
    const clientBytes = new TextEncoder().encode(clientId);
    const userBytes = username ? new TextEncoder().encode(username) : null;
    const passBytes = password ? new TextEncoder().encode(password) : null;

    let payloadLen = 2 + clientBytes.length;
    if (userBytes) payloadLen += 2 + userBytes.length;
    if (passBytes) payloadLen += 2 + passBytes.length;

    const varHeaderLen = 10;
    const remLen = varHeaderLen + payloadLen;

    const buf = new Uint8Array(2 + remLen);
    let offset = 0;
    buf[offset++] = 0x10; // CONNECT
    buf[offset++] = remLen;

    // Protocol Name
    buf[offset++] = 0;
    buf[offset++] = 4;
    buf.set(protoName, offset);
    offset += 4;

    buf[offset++] = protoLevel;
    buf[offset++] = flags;
    buf[offset++] = keepAlive >> 8;
    buf[offset++] = keepAlive & 0xff;

    // Client ID
    buf[offset++] = clientBytes.length >> 8;
    buf[offset++] = clientBytes.length & 0xff;
    buf.set(clientBytes, offset);
    offset += clientBytes.length;

    if (userBytes) {
      buf[offset++] = userBytes.length >> 8;
      buf[offset++] = userBytes.length & 0xff;
      buf.set(userBytes, offset);
      offset += userBytes.length;
    }

    if (passBytes) {
      buf[offset++] = passBytes.length >> 8;
      buf[offset++] = passBytes.length & 0xff;
      buf.set(passBytes, offset);
      offset += passBytes.length;
    }

    return buf;
  }

  private encodeSubscribe(topic: string, packetId: number): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const remLen = 2 + 2 + topicBytes.length + 1;
    const buf = new Uint8Array(2 + remLen);
    let offset = 0;
    buf[offset++] = 0x82; // SUBSCRIBE QoS 1
    buf[offset++] = remLen;

    buf[offset++] = packetId >> 8;
    buf[offset++] = packetId & 0xff;

    buf[offset++] = topicBytes.length >> 8;
    buf[offset++] = topicBytes.length & 0xff;
    buf.set(topicBytes, offset);
    offset += topicBytes.length;

    buf[offset++] = 0x00; // Requested QoS 0
    return buf;
  }

  private encodePublish(
    topic: string,
    message: string,
    retain = false,
  ): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const msgBytes = new TextEncoder().encode(message);
    const remLen = 2 + topicBytes.length + msgBytes.length;

    const header = [0x30 | (retain ? 0x01 : 0x00)]; // PUBLISH QoS 0
    // encode remaining length
    let x = remLen;
    do {
      let encodedByte = x % 128;
      x = Math.floor(x / 128);
      if (x > 0) encodedByte |= 128;
      header.push(encodedByte);
    } while (x > 0);

    const buf = new Uint8Array(header.length + remLen);
    buf.set(header, 0);
    let offset = header.length;

    buf[offset++] = topicBytes.length >> 8;
    buf[offset++] = topicBytes.length & 0xff;
    buf.set(topicBytes, offset);
    offset += topicBytes.length;

    buf.set(msgBytes, offset);
    return buf;
  }

  private async readLoop(conn: Deno.Conn, signal: AbortSignal): Promise<void> {
    const headerBuf = new Uint8Array(2);
    while (!signal.aborted && this.connected) {
      const n = await this.readFull(conn, headerBuf);
      if (n < 2) break;
      const type = headerBuf[0] >> 4;
      let remLen = headerBuf[1] & 0x7f;
      if (headerBuf[1] & 0x80) {
        // Multi-byte length
        let multiplier = 128;
        let b = 0;
        do {
          const single = new Uint8Array(1);
          await this.readFull(conn, single);
          b = single[0];
          remLen += (b & 0x7f) * multiplier;
          multiplier *= 128;
        } while ((b & 0x80) !== 0);
      }

      const body = new Uint8Array(remLen);
      if (remLen > 0) {
        await this.readFull(conn, body);
      }

      if (type === 3) {
        // PUBLISH packet
        let offset = 0;
        const topicLen = (body[offset] << 8) | body[offset + 1];
        offset += 2;
        const topic = new TextDecoder().decode(
          body.subarray(offset, offset + topicLen),
        );
        offset += topicLen;
        const qos = (headerBuf[0] >> 1) & 0x03;
        if (qos > 0) {
          offset += 2; // skip packet id
        }
        const payload = new TextDecoder().decode(body.subarray(offset));
        const retain = (headerBuf[0] & 0x01) === 1;
        this.onMessageCb?.({ topic, payload, qos, retain });
      }
    }
  }

  private parsePacket(data: Uint8Array) {
    if (data.length < 2) return;
    const type = data[0] >> 4;
    if (type === 3) {
      let offset = 1;
      // parse remLen
      let remLen = 0;
      let multiplier = 1;
      let b = 0;
      do {
        b = data[offset++];
        remLen += (b & 0x7f) * multiplier;
        multiplier *= 128;
      } while ((b & 0x80) !== 0 && offset < data.length);

      const topicLen = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      const topic = new TextDecoder().decode(
        data.subarray(offset, offset + topicLen),
      );
      offset += topicLen;
      const qos = (data[0] >> 1) & 0x03;
      if (qos > 0) offset += 2;
      const payload = new TextDecoder().decode(data.subarray(offset));
      const retain = (data[0] & 0x01) === 1;
      this.onMessageCb?.({ topic, payload, qos, retain });
    }
  }

  private async readFull(conn: Deno.Conn, buf: Uint8Array): Promise<number> {
    let offset = 0;
    while (offset < buf.length) {
      const n = await conn.read(buf.subarray(offset));
      if (n === null) return offset;
      offset += n;
    }
    return offset;
  }
}
