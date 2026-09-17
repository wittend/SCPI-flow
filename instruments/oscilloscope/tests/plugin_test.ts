import { assert, assertEquals, assertMatch } from "@std/assert";
import manifest from "../instrument.json" with { type: "json" };
import { createPlugin } from "../plugin.ts";

const root = new URL("../", import.meta.url);
const configs: Record<string, Record<string, unknown>> = {
  oscilloscope: { timeDiv: 0.002, ch1: { generator: { frequency: 2500 } } },
  multimeter: { function: "RES", input: { resistance: 1234, noiseLevel: 0 } },
  "signal-generator": { frequency: 2500, amplitude: 2, outputEnabled: false },
};
const bad: Record<string, unknown> = {
  oscilloscope: { timeDiv: 0.02, ch1: { generator: { frequency: -1 } } },
  multimeter: { function: "RES", input: { noiseLevel: 2 } },
  "signal-generator": { frequency: 123, dutyCycle: 2 },
};
function request(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return new Request(`http://127.0.0.1${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
  });
}

Deno.test("plugin contract: health, configure, commands, reset and isolated instances", async () => {
  const handler = createPlugin();
  assertEquals((await (await handler(request("/health"))).json()).id, manifest.id);
  const fresh = await (await handler(request("/state"))).json();
  const configured = await handler(request("/configure", configs[manifest.id]));
  assertEquals(configured.status, 200);
  const changed = await configured.json();
  if (manifest.id === "oscilloscope") {
    assertEquals(changed.timebase.timeDiv, 0.002);
    assertEquals(changed.ch1.generator.frequency, 2500);
    assert(Array.isArray(changed.ch1.data.voltage));
  } else if (manifest.id === "multimeter") {
    assertEquals(changed.function, "RES");
    assertEquals(changed.input.resistance, 1234);
  } else {
    assertEquals(changed.frequency, 2500);
    assertEquals(changed.outputEnabled, false);
  }
  const idn = await (await handler(request("/command", { command: "*IDN?" }))).json();
  assert(typeof idn.response === "string" && idn.response.length > 0);
  const second = await (await createPlugin()(request("/state"))).json();
  const reset = await (await handler(request("/reset", {}))).json();
  for (const state of [second, reset]) {
    if (manifest.id === "oscilloscope") assertEquals(state.timebase, fresh.timebase);
    else if (manifest.id === "multimeter") assertEquals(state.function, fresh.function);
    else assertEquals(state, fresh);
  }
});

Deno.test("plugin contract: invalid configurations are rejected without partial mutation", async () => {
  const handler = createPlugin();
  const before = await (await handler(request("/state"))).json();
  for (const body of [null, [], 1, { unknown: true }, bad[manifest.id], { constructor: {} }]) {
    const response = await handler(request("/configure", body));
    assertEquals(response.status, 400);
    assert(typeof (await response.json()).error === "string");
  }
  const malformed = await handler(
    new Request("http://localhost/configure", { method: "POST", body: "{" }),
  );
  assertEquals(malformed.status, 400);
  for (const command of [undefined, 42, "", "   "]) {
    assertEquals((await handler(request("/command", { command }))).status, 400);
  }
  assertEquals((await handler(request("/configure"))).status, 405);
  assertEquals((await handler(request("/health", {}))).status, 405);
  const after = await (await handler(request("/state"))).json();
  if (manifest.id === "oscilloscope") assertEquals(after.timebase, before.timebase);
  else if (manifest.id === "multimeter") assertEquals(after.input, before.input);
  else assertEquals(after, before);
});

Deno.test("plugin frontend: dedicated panel, valid inline scripts and proxy-relative URLs", async () => {
  const handler = createPlugin();
  const response = await handler(request(`/${manifest.frontend}`));
  assertEquals(response.status, 200);
  assertMatch(response.headers.get("content-type")!, /text\/html/);
  const html = await response.text();
  assert(!html.includes('id="workspace"'));
  assert(!html.includes("loadPalette"));
  const others = manifest.id === "oscilloscope"
    ? ["view-gen", "view-dmm"]
    : manifest.id === "multimeter"
    ? ["view-scope", "view-gen"]
    : ["view-scope", "view-dmm"];
  for (const other of others) assert(!html.includes(other));
  const urls = [...html.matchAll(/fetch\(["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
  assert(urls.length > 0);
  for (const url of urls) {
    assert(!url.startsWith("/"));
    const resolved = new URL(url, `http://localhost/plugins/${manifest.id}/${manifest.frontend}`);
    assert(resolved.pathname.startsWith(`/plugins/${manifest.id}/`));
    assert(!/https?:/.test(url));
  }
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]);
  assertEquals((await handler(request(`/${manifest.icon}`))).status, 200);
  for (
    const path of [
      "/plugin.ts",
      "/src/scpi_engine.ts",
      "/.git/config",
      "/assets/%2e%2e%2fplugin.ts",
      "/assets/%5c..%5cplugin.ts",
      "/api/palette",
    ]
  ) {
    assertEquals((await handler(request(path))).status, 404);
  }
});

Deno.test("plugin process: restricted offline startup, port announcement, HTTP and shutdown", async () => {
  const cwd = decodeURIComponent(root.pathname).replace(/\/$/, "");
  const child = new Deno.Command(Deno.execPath(), {
    cwd,
    args: [
      "run",
      "--cached-only",
      "--no-prompt",
      `--allow-read=${cwd}`,
      "--allow-net=127.0.0.1",
      "plugin.ts",
      "--port",
      "0",
    ],
    stdout: "piped",
    stderr: "inherit",
  }).spawn();
  const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  const timer = setTimeout(() => child.kill("SIGTERM"), 10000);
  try {
    let output = "";
    while (!output.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`Process exited before port announcement: ${output}`);
      output += value;
    }
    const { port } = JSON.parse(output.split("\n")[0]);
    assert(Number.isInteger(port) && port > 0);
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/health`);
    assertEquals((await health.json()).id, manifest.id);
    const page = await fetch(`${base}/${manifest.frontend}`);
    assertEquals(page.status, 200);
    await page.arrayBuffer();
    const configured = await fetch(`${base}/configure`, {
      method: "POST",
      body: JSON.stringify(configs[manifest.id]),
    });
    assertEquals(configured.status, 200);
    await configured.arrayBuffer();
    const reset = await fetch(`${base}/reset`, { method: "POST" });
    assertEquals(reset.status, 200);
    await reset.arrayBuffer();
  } finally {
    clearTimeout(timer);
    await reader.cancel();
    try {
      child.kill("SIGTERM");
    } catch { /* Already exited on startup failure. */ }
    await child.status;
  }
});

Deno.test("plugin static server rejects symlinks outside its repository", async () => {
  const name = `plugin-test-${crypto.randomUUID()}.svg`;
  const link = new URL(`assets/${name}`, root);
  await Deno.symlink("/etc/hosts", link);
  try {
    const response = await createPlugin()(request(`/assets/${name}`));
    assertEquals(response.status, 404);
  } finally {
    await Deno.remove(link);
  }
});
