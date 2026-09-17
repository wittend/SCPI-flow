import { assertEquals } from "@std/assert";
import { MultimeterSimulation } from "../src/multimeter.ts";
import { MultimeterCli } from "../src/cli.ts";

Deno.test("CLI - Front Panel Rendering", () => {
  const meter = new MultimeterSimulation();
  const cli = new MultimeterCli(meter);

  const panel = cli.renderFrontPanel();
  assertEquals(panel.includes("SIGLENT SDM3045X"), true);
  assertEquals(panel.includes("VOLT:DC"), true);
  assertEquals(panel.includes("AUTO"), true);

  meter.dualEnabled = true;
  meter.takeReading();
  const dualPanel = cli.renderFrontPanel();
  assertEquals(dualPanel.includes("DUAL ON"), true);
});
