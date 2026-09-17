import { assertEquals } from "@std/assert";
import { OscilloscopeCli } from "../src/cli.ts";

Deno.test("OscilloscopeCli - renderAsciiDisplay output", () => {
  const cli = new OscilloscopeCli();
  const display = cli.renderAsciiDisplay(60, 14);
  assertEquals(typeof display, "string");
  assertEquals(display.includes("Siglent SDS1000X-U"), true);
  assertEquals(display.includes("CH1:"), true);
  assertEquals(display.includes("CH2:"), true);
  assertEquals(display.includes("TB:"), true);
});

Deno.test("OscilloscopeCli - renderMeasurements table", () => {
  const cli = new OscilloscopeCli();
  const table = cli.renderMeasurements();
  assertEquals(table.includes("MEASUREMENTS"), true);
  assertEquals(table.includes("Vpp (Peak-Peak)"), true);
  assertEquals(table.includes("Channel 1"), true);
  assertEquals(table.includes("Channel 2"), true);
});

Deno.test("OscilloscopeCli - SCPI execution via CLI engine", () => {
  const cli = new OscilloscopeCli();
  const idn = cli.scpi.execute("*IDN?");
  assertEquals(idn?.includes("Siglent"), true);

  cli.scpi.execute("C1:VDIV 2.0");
  assertEquals(cli.scope.ch1.voltDiv, 2.0);
});
