import { assertEquals } from "@std/assert";

Deno.test("manifest preserves compatible analog diagram connectors", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../instrument.json", import.meta.url)),
  );
  assertEquals(manifest.sources.map((port: { name: string }) => port.name), ["Out 1", "Out 2"]);
  assertEquals(manifest.sinks, [{ id: "mod-in", name: "Mod In", type: "analog" }]);
  assertEquals(manifest.sources.every((port: { type: string }) => port.type === "analog"), true);
});
