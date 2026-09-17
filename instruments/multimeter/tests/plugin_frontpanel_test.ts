import { assertEquals } from "@std/assert";
import { createPlugin } from "../plugin.ts";

Deno.test("multimeter plugin preserves front-panel buttons, command and legacy input API", async () => {
  const handler = createPlugin();
  const post = (path: string, body: unknown) =>
    handler(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  const state = async () => (await handler(new Request("http://localhost/state"))).json();
  for (const button of ["4W", "DUAL", "MATH_STATS", "DISP_HIST"]) {
    assertEquals((await post("/api/dmm/frontpanel", { button })).status, 200);
  }
  const reading = await state();
  assertEquals(reading.function, "FRES");
  assertEquals(reading.dualEnabled, true);
  assertEquals(reading.statisticsEnabled, true);
  assertEquals(reading.displayMode, "HISTOGRAM");
  assertEquals((await post("/api/dmm/input", { resistance: 222, noiseLevel: 0 })).status, 200);
  assertEquals((await state()).input.resistance, 222);
  const idn = await (await post("/api/dmm/command", { command: "*IDN?" })).json();
  assertEquals(idn.success, true);
  assertEquals(typeof idn.response, "string");
  const invalid = await post("/configure", { function: "TEMP", limits: { low: 5, high: 1 } });
  assertEquals(invalid.status, 400);
  assertEquals((await state()).function, "FRES");
  assertEquals((await post("/api/dmm/frontpanel", { button: "UNSUPPORTED" })).status, 400);
  assertEquals((await post("/api/dmm/reset", {})).status, 200);
  assertEquals((await state()).function, "VOLT:DC");
});
