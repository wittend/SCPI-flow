import { assert, assertEquals } from "@std/assert";
import { DataSourceEngine } from "../instruments/data-source/src/data_source.ts";
import { RawDataSinkEngine } from "../instruments/raw-data-sink/src/raw_data_sink.ts";
import { FormattedDataSinkEngine } from "../instruments/formatted-data-sink/src/formatted_data_sink.ts";
import { createPlugin as createSourcePlugin } from "../instruments/data-source/plugin.ts";
import { createPlugin as createRawSinkPlugin } from "../instruments/raw-data-sink/plugin.ts";
import { createPlugin as createFormattedSinkPlugin } from "../instruments/formatted-data-sink/plugin.ts";

Deno.test("data-source engine reads JSONL file with configurable rate", async () => {
  const dir = await Deno.makeTempDir({
    dir: "tests",
    prefix: ".source-test-",
  });
  const sampleFile = `${dir}/test.jsonl`;
  const records = [
    JSON.stringify({ index: 1, voltage: 3.3 }),
    JSON.stringify({ index: 2, voltage: 5.0 }),
    JSON.stringify({ index: 3, voltage: 12.0 }),
  ];
  await Deno.writeTextFile(sampleFile, records.join("\n"));

  try {
    const engine = new DataSourceEngine({
      mode: "file",
      filePath: sampleFile,
      cadenceHz: 100, // fast for testing
      loop: false,
      format: "jsonl",
    });

    const received: unknown[] = [];
    engine.addListener((data) => {
      received.push(data);
    });

    await engine.start();
    // Wait for playback ticks
    await new Promise((resolve) => setTimeout(resolve, 80));
    await engine.stop();

    assertEquals(received.length, 3);
    assertEquals((received[0] as { voltage: number }).voltage, 3.3);
    assertEquals((received[1] as { voltage: number }).voltage, 5.0);
    assertEquals((received[2] as { voltage: number }).voltage, 12.0);

    const state = engine.getState();
    assertEquals(state.itemsEmitted, 3);
    assertEquals(state.fileTotalLines, 3);

    // SCPI interface check
    assertEquals(
      engine.executeScpi("*IDN?"),
      "SCPI-FLOW,DATA-SOURCE,1.0.0,SRC001",
    );
    assertEquals(engine.executeScpi("DATA:COUNT?"), "3");
    assert(engine.executeScpi("READ?")?.includes("12"));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("data-source engine receives messages from WebSocket server", async () => {
  let serverWs: WebSocket | null = null;
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1" }, (req) => {
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      serverWs = socket;
      return response;
    }
    return new Response("Not WS", { status: 400 });
  });

  const port = server.addr.port;
  const engine = new DataSourceEngine({
    mode: "websocket",
    wsUrl: `ws://127.0.0.1:${port}`,
    format: "json",
  });

  try {
    const received: unknown[] = [];
    engine.addListener((data) => {
      received.push(data);
    });

    await engine.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert(serverWs !== null);
    (serverWs as WebSocket).send(JSON.stringify({ reading: 42.5, unit: "V" }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    assertEquals(received.length, 1);
    assertEquals((received[0] as { reading: number }).reading, 42.5);
    assertEquals(engine.getState().itemsEmitted, 1);

    await engine.stop();
  } finally {
    await server.shutdown();
  }
});

Deno.test("raw-data-sink engine writes payloads to file and WebSocket", async () => {
  const dir = await Deno.makeTempDir({
    dir: "tests",
    prefix: ".raw-sink-test-",
  });
  const outFile = `${dir}/raw.bin`;

  const engine = new RawDataSinkEngine({
    mode: "file",
    filePath: outFile,
    fileWriteMode: "append",
    active: true,
  });

  try {
    await engine.write("CHUNK1\n");
    await engine.write("CHUNK2\n");
    await engine.stop();

    const text = await Deno.readTextFile(outFile);
    assertEquals(text, "CHUNK1\nCHUNK2\n");
    assertEquals(engine.getState().itemsReceived, 2);
    assertEquals(
      engine.executeScpi("*IDN?"),
      "SCPI-FLOW,RAW-DATA-SINK,1.0.0,SNK001",
    );
    assertEquals(engine.executeScpi(":COUNT?"), "2");

    // Overwrite mode test
    await engine.configure({ fileWriteMode: "overwrite", active: true });
    await engine.write("OVERWRITTEN\n");
    await engine.stop();
    const overwritten = await Deno.readTextFile(outFile);
    assertEquals(overwritten, "OVERWRITTEN\n");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("formatted-data-sink engine writes JSON and JSONL records with timestamps", async () => {
  const dir = await Deno.makeTempDir({
    dir: "tests",
    prefix: ".fmt-sink-test-",
  });
  const jsonlFile = `${dir}/output.jsonl`;
  const jsonFile = `${dir}/output.json`;

  try {
    // 1. Test JSONL mode
    const jsonlSink = new FormattedDataSinkEngine({
      mode: "file",
      format: "jsonl",
      filePath: jsonlFile,
      includeTimestamp: true,
      active: true,
    });

    await jsonlSink.write({ sensor: "temp", value: 23.4 });
    await jsonlSink.write({ sensor: "humidity", value: 55.1 });
    await jsonlSink.stop();

    const jsonlContent = await Deno.readTextFile(jsonlFile);
    const lines = jsonlContent.trim().split("\n").map((l) => JSON.parse(l));
    assertEquals(lines.length, 2);
    assertEquals(lines[0].sensor, "temp");
    assertEquals(lines[0].value, 23.4);
    assert(typeof lines[0].timestamp === "string");
    assertEquals(lines[1].sensor, "humidity");

    // 2. Test JSON Array mode
    const jsonSink = new FormattedDataSinkEngine({
      mode: "file",
      format: "json",
      filePath: jsonFile,
      prettyJson: true,
      includeTimestamp: false,
      active: true,
    });

    await jsonSink.write({ channel: 1, freq: 1000 });
    await jsonSink.write({ channel: 2, freq: 2000 });
    await jsonSink.stop();

    const jsonContent = await Deno.readTextFile(jsonFile);
    const parsed = JSON.parse(jsonContent);
    assertEquals(parsed.length, 2);
    assertEquals(parsed[0].freq, 1000);
    assertEquals(parsed[1].freq, 2000);

    assertEquals(
      jsonSink.executeScpi("*IDN?"),
      "SCPI-FLOW,FORMATTED-DATA-SINK,1.0.0,FSNK001",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("instruments HTTP endpoints and state verification", async () => {
  const srcHandler = createSourcePlugin();
  const rawHandler = createRawSinkPlugin();
  const fmtHandler = createFormattedSinkPlugin();

  // 1. Source plugin health and state
  const srcHealth = await srcHandler(new Request("http://localhost/health"));
  assertEquals(srcHealth.status, 200);
  assertEquals((await srcHealth.json()).id, "data-source");

  const srcState = await srcHandler(new Request("http://localhost/state"));
  assertEquals(srcState.status, 200);
  assertEquals((await srcState.json()).config.mode, "file");

  const srcIndex = await srcHandler(new Request("http://localhost/index.html"));
  assertEquals(srcIndex.status, 200);
  assert((await srcIndex.text()).includes("Data Source Control"));

  // 2. Raw sink plugin health and state
  const rawHealth = await rawHandler(new Request("http://localhost/health"));
  assertEquals(rawHealth.status, 200);
  assertEquals((await rawHealth.json()).id, "raw-data-sink");

  const rawIndex = await rawHandler(new Request("http://localhost/index.html"));
  assertEquals(rawIndex.status, 200);
  assert((await rawIndex.text()).includes("Raw Data Sink Control"));

  // 3. Formatted sink plugin health and state
  const fmtHealth = await fmtHandler(new Request("http://localhost/health"));
  assertEquals(fmtHealth.status, 200);
  assertEquals((await fmtHealth.json()).id, "formatted-data-sink");

  const fmtIndex = await fmtHandler(new Request("http://localhost/index.html"));
  assertEquals(fmtIndex.status, 200);
  assert((await fmtIndex.text()).includes("Formatted Data Sink Control"));
});
