import { assertAlmostEquals, assertEquals } from "@std/assert";
import { MeasurementEngine } from "../src/measurements.ts";
import { SignalGenerator } from "../src/signal_generator.ts";

Deno.test("MeasurementEngine - basic voltage metrics (Vmax, Vmin, Vpp, Vavg, Vrms)", () => {
  const voltages = [1.0, 3.0, -2.0, 4.0, 0.0];
  assertEquals(MeasurementEngine.calculateVmax(voltages), 4.0);
  assertEquals(MeasurementEngine.calculateVmin(voltages), -2.0);
  assertEquals(MeasurementEngine.calculateVpp(voltages), 6.0);
  assertAlmostEquals(MeasurementEngine.calculateVavg(voltages), 1.2, 1e-4);
  assertAlmostEquals(
    MeasurementEngine.calculateVrms(voltages),
    Math.sqrt(30 / 5),
    1e-4,
  );
});

Deno.test("MeasurementEngine - Sine wave automated measurements", () => {
  const gen = new SignalGenerator({
    type: "sine",
    frequency: 1000,
    amplitude: 2.0,
    offset: 0,
  });
  const { time, voltage } = gen.generateBuffer(0, 0.005, 1000); // 5 periods

  const res = MeasurementEngine.calculateAll(time, voltage);
  assertAlmostEquals(res.vmax, 2.0, 0.05);
  assertAlmostEquals(res.vmin, -2.0, 0.05);
  assertAlmostEquals(res.vpp, 4.0, 0.05);
  assertAlmostEquals(res.vavg, 0.0, 0.05);
  // Sine RMS = Peak / sqrt(2) = 2.0 / 1.414 = 1.414V
  assertAlmostEquals(res.vrms, 1.414, 0.05);
  assertAlmostEquals(res.frequency, 1000, 20);
  assertAlmostEquals(res.period, 0.001, 1e-4);
});

Deno.test("MeasurementEngine - Square wave timing and duty cycle", () => {
  const gen = new SignalGenerator({
    type: "square",
    frequency: 500,
    amplitude: 1.0,
    dutyCycle: 0.5,
  });
  const { time, voltage } = gen.generateBuffer(0, 0.01, 2000);

  const res = MeasurementEngine.calculateAll(time, voltage);
  assertAlmostEquals(res.vpp, 2.0, 0.05);
  assertAlmostEquals(res.frequency, 500, 10);
  assertAlmostEquals(res.dutyCycle, 0.5, 0.05);
});

Deno.test("MeasurementEngine - Top, Base and Amplitude", () => {
  const voltages = new Float64Array(100);
  // 50 points at -1.0, 50 points at +2.0
  for (let i = 0; i < 50; i++) voltages[i] = -1.0;
  for (let i = 50; i < 100; i++) voltages[i] = 2.0;

  const { vtop, vbase, vamp } = MeasurementEngine.calculateTopBase(voltages);
  assertAlmostEquals(vtop, 2.0, 0.1);
  assertAlmostEquals(vbase, -1.0, 0.1);
  assertAlmostEquals(vamp, 3.0, 0.2);
});
