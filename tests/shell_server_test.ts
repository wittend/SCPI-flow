import { assert, assertEquals, assertThrows } from "@std/assert";
import { PluginRegistry } from "../src/plugin_registry.ts";
import { createHandler, openBrowser } from "../src/shell_server.ts";
import { normalizeProject } from "../src/projects.ts";

Deno.test("shell runs independently with an empty catalog and restricts public files", async () => {
  const root = await Deno.makeTempDir({ dir: "tests", prefix: ".shell-" });
  await Deno.writeTextFile(
    `${root}/catalog.json`,
    JSON.stringify({ schemaVersion: 1, instruments: [] }),
  );
  const registry = new PluginRegistry(`${root}/catalog.json`);
  await registry.initialize();
  const handler = createHandler(registry, `${root}/projects`);
  try {
    const response = await handler(
      new Request("http://localhost/api/instruments"),
    );
    assertEquals(await response.json(), []);
    for (
      const path of [
        "/main.ts",
        "/instruments.json",
        "/.git/config",
        "/src/plugin_registry.ts",
        "/api/scope/frame",
      ]
    ) {
      const response = await handler(new Request(`http://localhost${path}`));
      assertEquals(response.status, 404);
      await response.body?.cancel();
    }
    const html = await handler(new Request("http://localhost/"));
    assertEquals(html.status, 200);
    const content = await html.text();
    assert(content.includes('id="tab-flow"'));
    assert(content.includes('id="view-flow"'));
    assert(!content.includes('id="tab-scope"'));
    assert(!content.includes('id="tab-dmm"'));
    assert(content.includes('src="/web/shell.js"'));
    const unknown = await handler(
      new Request("http://localhost/api/instruments/unknown/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assertEquals(unknown.status, 404);
    await unknown.body?.cancel();
    const crossOrigin = await handler(
      new Request("http://localhost/api/instruments/register", {
        method: "POST",
        headers: {
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: '{"path":"x"}',
      }),
    );
    assertEquals(crossOrigin.status, 403);
    await crossOrigin.body?.cancel();
    const rebind = await handler(
      new Request("http://untrusted.example/api/instruments"),
    );
    assertEquals(rebind.status, 403);
    await rebind.body?.cancel();
    const invalid = await handler(
      new Request("http://localhost/api/instruments/register", {
        method: "POST",
        body: '{"path":"x"}',
      }),
    );
    assertEquals(invalid.status, 400);
    await invalid.body?.cancel();

    // Test /api/fs/browse
    const browseRes = await handler(
      new Request(
        `http://localhost/api/fs/browse?dir=${encodeURIComponent(root)}`,
      ),
    );
    assertEquals(browseRes.status, 200);
    const browseData = await browseRes.json();
    assert(browseData.current);
    assert(Array.isArray(browseData.entries));

    // Test /api/instruments/discover
    const discoverRes = await handler(
      new Request(
        `http://localhost/api/instruments/discover?dir=${
          encodeURIComponent(root)
        }`,
      ),
    );
    assertEquals(discoverRes.status, 200);
    const discoverData = await discoverRes.json();
    assert(Array.isArray(discoverData.discovered));
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("project API validates, round trips, and preserves unavailable instruments", async () => {
  const root = await Deno.makeTempDir({ dir: "tests", prefix: ".shell-" });
  await Deno.writeTextFile(
    `${root}/catalog.json`,
    JSON.stringify({ schemaVersion: 1, instruments: [] }),
  );
  const registry = new PluginRegistry(`${root}/catalog.json`);
  await registry.initialize();
  const handler = createHandler(registry, `${root}/projects`);
  const project = {
    schemaVersion: 1,
    objects: [{
      id: "node-1",
      instrumentId: "future-device",
      name: "Future Device",
      x: 20,
      y: 30,
    }],
    connections: [],
  };
  try {
    const saved = await handler(
      new Request("http://localhost/api/projects/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(project),
      }),
    );
    assertEquals(saved.status, 200);
    await saved.body?.cancel();
    const restored = await handler(
      new Request("http://localhost/api/projects/test"),
    );
    assertEquals(await restored.json(), project);
    const invalid = await handler(
      new Request("http://localhost/api/projects/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"objects":{},"connections":[]}',
      }),
    );
    assertEquals(invalid.status, 400);
    await invalid.body?.cancel();
    const retained = await handler(
      new Request("http://localhost/api/projects/test"),
    );
    assertEquals(await retained.json(), project);
    const missing = await handler(
      new Request("http://localhost/api/projects/missing"),
    );
    assertEquals(missing.status, 404);
    await missing.body?.cancel();
  } finally {
    await registry.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("legacy project GUIDs migrate using catalog metadata, never embedded code", () => {
  const old = {
    objects: [{
      id: "obj-1",
      guid: "legacy-guid",
      name: "Old",
      x: 1,
      y: 2,
      code: "throw new Error('never execute')",
    }],
    connections: [],
  };
  const migrated = normalizeProject(old, [{
    id: "new-device",
    path: "any",
    legacyGuid: "legacy-guid",
    status: "unavailable",
  }]);
  assertEquals(migrated.objects[0].instrumentId, "new-device");
  assertEquals(Object.hasOwn(migrated.objects[0], "code"), false);
  assertThrows(() =>
    normalizeProject({ ...old, objects: [...old.objects, ...old.objects] }, [])
  );
  assertThrows(() =>
    normalizeProject({
      ...old,
      connections: [{
        from: "missing",
        to: "obj-1",
        fromPort: "x",
        toPort: "y",
      }],
    }, [])
  );
});

Deno.test("openBrowser returns boolean without throwing", async () => {
  const result = await openBrowser("http://127.0.0.1:8000");
  assertEquals(typeof result, "boolean");
});
