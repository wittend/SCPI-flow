import { assertAlmostEquals, assertEquals } from "@std/assert";
import { OscilloscopeSimulation } from "../src/oscilloscope.ts";

Deno.test("OscilloscopeSimulation - dual channel initialization and properties", () => {
  const scope = new OscilloscopeSimulation();
  assertEquals(scope.ch1.id, 1);
  assertEquals(scope.ch1.name, "CH1");
  assertEquals(scope.ch1.enabled, true);
  assertEquals(scope.ch1.voltDiv, 1.0);
  assertEquals(scope.ch1.coupling, "DC");

  assertEquals(scope.ch2.id, 2);
  assertEquals(scope.ch2.name, "CH2");
  assertEquals(scope.ch2.enabled, true);
  assertEquals(scope.ch2.voltDiv, 1.0);
});

Deno.test("OscilloscopeSimulation - channel coupling GND and AC", () => {
  const scope = new OscilloscopeSimulation();
  scope.ch1.generator.setAmplitude(2.0);
  scope.ch1.generator.setOffset(1.0);

  // DC coupling includes offset
  const sampleDC = scope.ch1.sample(0);
  assertAlmostEquals(sampleDC, 1.0, 1e-4);

  // GND coupling returns 0
  scope.ch1.coupling = "GND";
  assertEquals(scope.ch1.sample(0), 0);

  // AC coupling subtracts DC offset
  scope.ch1.coupling = "AC";
  assertAlmostEquals(scope.ch1.sample(0), 0.0, 1e-4);
});

Deno.test("OscilloscopeSimulation - vertical zoom, pan, and inversion", () => {
  const scope = new OscilloscopeSimulation();
  scope.ch1.generator.setAmplitude(1.0);
  scope.ch1.generator.setOffset(0.0);
  scope.ch1.inverted = true;
  assertAlmostEquals(scope.ch1.sample(0.00025), -1.0, 1e-4); // Inverted peak

  scope.ch1.inverted = false;
  scope.ch1.zoom = 2.0;
  assertAlmostEquals(scope.ch1.sample(0.00025), 2.0, 1e-4); // 2x vertical zoom

  scope.ch1.pan = 0.5;
  assertAlmostEquals(scope.ch1.sample(0.00025), (1.0 + 0.5) * 2.0, 1e-4); // pan + zoom
});

Deno.test("OscilloscopeSimulation - acquire frame generation", () => {
  const scope = new OscilloscopeSimulation();
  const frame = scope.acquire(0.0);

  assertEquals(frame.timestamp, 0.0);
  assertEquals(frame.timebase.divisions, 14);
  assertEquals(frame.timebase.points, 1000);
  assertEquals(frame.ch1.enabled, true);
  assertEquals(frame.ch1.data !== null, true);
  assertEquals(frame.ch1.data!.voltage.length, 1000);
  assertEquals(frame.ch2.data !== null, true);
  assertEquals(frame.trigger.status, "Auto");
});

Deno.test("OscilloscopeSimulation - state transitions (run, stop, single, reset)", () => {
  const scope = new OscilloscopeSimulation();
  scope.stop();
  assertEquals(scope.isRunning, false);
  assertEquals(scope.triggerStatus, "Stop");

  scope.run();
  assertEquals(scope.isRunning, true);
  assertEquals(scope.triggerStatus, "Auto");

  scope.single();
  assertEquals(scope.triggerMode, "SINGLE");
  assertEquals(scope.triggerStatus, "Armed");

  scope.reset();
  assertEquals(scope.triggerMode, "AUTO");
  assertEquals(scope.isRunning, true);
});

Deno.test("OscilloscopeSimulation - getMeasurements", () => {
  const scope = new OscilloscopeSimulation();
  scope.ch1.generator.setFrequency(1000);
  scope.ch1.generator.setAmplitude(1.0);

  const m1 = scope.getMeasurements(1);
  assertAlmostEquals(m1.vpp, 2.0, 0.1);
  assertAlmostEquals(m1.frequency, 1000, 50);

  const m2 = scope.getMeasurements(2);
  assertAlmostEquals(m2.vpp, 2.0, 0.1);
});
