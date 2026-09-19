import { assert, assertEquals, assertRejects } from "@std/assert";
import { PluginRegistry } from "../src/plugin_registry.ts";
import { validateManifest } from "../src/plugin_manifest.ts";

const manifest = {
  schemaVersion: 1,
  id: "test-meter",
  version: "1.0.0",
  name: "Test Meter",
  description: "An independent test instrument",
  entrypoint: "plugin.ts",
  frontend: "index.html",
  icon: "icon.svg",
  capabilities: ["measurement"],
  sources: [{ id: "reading", name: "Reading", type: "data" }],
  sinks: [],
  configuration: {
    type: "object",
    properties: { value: { type: "number", minimum: 0, maximum: 10 } },
    additionalProperties: false,
  },
};

async function fixture() {
  const root = await Deno.makeTempDir({ dir: "tests", prefix: ".plugin-" });
  await Deno.writeTextFile(`${root}/instrument.json`, JSON.stringify(manifest));
  await Deno.writeTextFile(`${root}/index.html`, "<h1>Test meter</h1>");
  await Deno.writeTextFile(`${root}/icon.svg`, "<svg/>");
  await Deno.writeTextFile(
    `${root}/plugin.ts`,
    `
let value = 1;
Deno.serve({hostname: "127.0.0.1", port: 0,
  onListen: ({port}) => console.log(JSON.stringify({port}))}, async req => {
  const path = new URL(req.url).pathname;
  if (path === "/configure") value = (await req.json()).value;
  if (path === "/reset") value = 1;
  if (path === "/command") {
    const {command} = await req.json();
    if (command === "crash") Deno.exit(2);
    return Response.json({response: String(value)});
  }
  return Response.json({value});
});
`,
  );
  const catalog = `${root}/catalog.json`;
  await Deno.writeTextFile(
    catalog,
    JSON.stringify({
      schemaVersion: 1,
      instruments: [{ path: "instrument.json", legacyGuid: "old-guid" }],
    }),
  );
  const registry = new PluginRegistry(catalog);
  await registry.initialize();
  return { root, registry };
}

Deno.test("manifest rejects unsafe paths, unknown versions and duplicate ports", () => {
  assertEquals(validateManifest(manifest).id, "test-meter");
  for (
    const bad of [
      { ...manifest, schemaVersion: 2 },
      { ...manifest, entrypoint: "../outside.ts" },
      { ...manifest, frontend: "https://example.com/ui" },
      { ...manifest, icon: "/absolute.svg" },
      { ...manifest, id: "../bad" },
      { ...manifest, sources: [manifest.sources[0], manifest.sources[0]] },
      {
        ...manifest,
        configuration: { type: "object", properties: { n: { typo: 1 } } },
      },
    ]
  ) {
    let rejected = false;
    try {
      validateManifest(bad);
    } catch {
      rejected = true;
    }
    assertEquals(rejected, true, JSON.stringify(bad));
  }
});

Deno.test("registry loads only on demand and isolates process lifecycle", async () => {
  const { root, registry } = await fixture();
  try {
    assertEquals(registry.list()[0].status, "unloaded");
    assertEquals(registry.list()[0].legacyGuid, "old-guid");
    await assertRejects(
      () => registry.state("test-meter"),
      Error,
      "not loaded",
    );
    await Promise.all([
      registry.load("test-meter"),
      registry.load("test-meter"),
    ]);
    assertEquals(registry.list()[0].status, "loaded");
    assertEquals(await registry.state("test-meter"), { value: 1 });
    await registry.configure("test-meter", { value: 7 });
    assertEquals(await registry.command("test-meter", "READ?"), {
      response: "7",
    });
    await assertRejects(() => registry.configure("test-meter", { value: 11 }));
    await assertRejects(() => registry.configure("test-meter", { unknown: 1 }));
    assertEquals(await registry.state("test-meter"), { value: 7 });
    await registry.reset("test-meter");
    assertEquals(await registry.state("test-meter"), { value: 1 });
    await registry.unload("test-meter");
    await registry.unload("test-meter");
    assertEquals(registry.list()[0].status, "unloaded");
    await registry.load("test-meter");
    assertEquals(await registry.state("test-meter"), { value: 1 });
    await assertRejects(() => registry.command("test-meter", "crash"));
    await registry.unload("test-meter");
    await registry.load("test-meter");
    assertEquals(await registry.state("test-meter"), { value: 1 });
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("catalog registration persists, rejects duplicates and survives missing plug-ins", async () => {
  const { root, registry } = await fixture();
  try {
    await assertRejects(
      () => registry.register(`${root}/instrument.json`),
      Error,
      "already registered",
    );
    await registry.remove("test-meter");
    assertEquals(registry.list().length, 0);
    await registry.register(`${root}/instrument.json`);
    assertEquals(registry.list()[0].id, "test-meter");
    const restored = new PluginRegistry(`${root}/catalog.json`);
    await restored.initialize();
    assertEquals(restored.list()[0].status, "unloaded");
    await Deno.remove(`${root}/instrument.json`);
    const missing = new PluginRegistry(`${root}/catalog.json`);
    await missing.initialize();
    assertEquals(missing.list()[0].status, "unavailable");
    await assertRejects(() => missing.load("test-meter"));
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("failed startup is reported without blocking other lifecycle operations", async () => {
  const { root, registry } = await fixture();
  try {
    await Deno.writeTextFile(
      `${root}/plugin.ts`,
      'console.log("not a readiness message");',
    );
    await assertRejects(() => registry.load("test-meter"));
    assertEquals(registry.list()[0].status, "failed");
    await registry.unload("test-meter");
    assertEquals(registry.list()[0].status, "unloaded");
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("manifest assets cannot escape the instrument repository through symlinks", async () => {
  const { root, registry } = await fixture();
  try {
    await Deno.remove(`${root}/icon.svg`);
    await Deno.symlink(await Deno.realPath("deno.json"), `${root}/icon.svg`);
    await assertRejects(() => registry.icon("test-meter"), Error, "escapes");
    await assertRejects(() => registry.load("test-meter"), Error, "escapes");
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("registry resolves relative manifest paths against dataDir and candidate locations", async () => {
  const root = await Deno.makeTempDir({
    dir: "tests",
    prefix: ".plugin-data-",
  });
  const dataDir = `${root}/data`;
  const configDir = `${root}/config`;
  const instDir = `${dataDir}/instruments/test-meter`;
  await Deno.mkdir(instDir, { recursive: true });
  await Deno.mkdir(configDir, { recursive: true });

  await Deno.writeTextFile(
    `${instDir}/instrument.json`,
    JSON.stringify(manifest),
  );
  await Deno.writeTextFile(`${instDir}/index.html`, "<h1>Test meter</h1>");
  await Deno.writeTextFile(`${instDir}/icon.svg`, "<svg/>");
  await Deno.writeTextFile(`${instDir}/plugin.ts`, "Deno.serve({port: 0});");

  const catalogPath = `${configDir}/instruments.json`;
  await Deno.writeTextFile(
    catalogPath,
    JSON.stringify({
      schemaVersion: 1,
      instruments: [
        {
          id: "test-meter",
          path: "./instruments/test-meter/instrument.json",
        },
      ],
    }),
  );

  const registry = new PluginRegistry(catalogPath, { dataDir });
  try {
    await registry.initialize();
    const list = registry.list();
    assertEquals(list.length, 1);
    assertEquals(list[0].id, "test-meter");
    assertEquals(list[0].status, "unloaded");
    assertEquals(list[0].manifest?.name, "Test Meter");
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("registry seeds default instruments into empty dataDir on initialize", async () => {
  const root = await Deno.makeTempDir({
    dir: "tests",
    prefix: ".plugin-seed-",
  });
  const dataDir = `${root}/data`;
  const catalogPath = `${root}/config/instruments.json`;

  const registry = new PluginRegistry(catalogPath, { dataDir });
  try {
    await registry.initialize();
    const list = registry.list();
    assertEquals(list.length, 3);
    const ids = list.map((item) => item.id).sort();
    assertEquals(ids, ["multimeter", "oscilloscope", "signal-generator"]);
    for (const item of list) {
      assertEquals(item.status, "unloaded");
      assert(item.manifest !== undefined);
      assert(item.manifest.name.length > 0);
    }
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});
