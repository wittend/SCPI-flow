import { assertEquals } from "@std/assert";

Deno.test("manifest preserves five physical terminals and both reading connectors", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../instrument.json", import.meta.url)),
  );
  assertEquals(manifest.sinks.map((port: { name: string }) => port.name), [
    "Input HI",
    "Input LO",
    "Sense HI",
    "Sense LO",
    "Current 10A",
  ]);
  assertEquals(manifest.sinks.every((port: { type: string }) => port.type === "analog"), true);
  assertEquals(manifest.sources.map((port: { name: string }) => port.name), [
    "Reading Out",
    "Secondary Out",
  ]);
});
