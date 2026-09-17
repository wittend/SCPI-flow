import { assertEquals } from "@std/assert";

Deno.test("manifest retains legacy measurement and input connector names", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../instrument.json", import.meta.url)),
  );
  assertEquals(manifest.sinks.map((port: { name: string }) => port.name), [
    "CH1",
    "CH2",
    "Trigger",
  ]);
  assertEquals(manifest.sources[0], { id: "measurement", name: "Meas Out", type: "data" });
});
