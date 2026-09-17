import { assertAlmostEquals, assertEquals } from "@std/assert";
import { MultimeterSimulation } from "../src/multimeter.ts";

Deno.test("Multimeter - Default State and Reset", () => {
  const meter = new MultimeterSimulation();
  assertEquals(meter.function, "VOLT:DC");
  assertEquals(meter.autoRange, true);
  assertEquals(meter.speed, "SLOW");
  assertEquals(meter.dualEnabled, false);
  assertEquals(meter.mathFunction, "NONE");

  meter.function = "RES";
  meter.speed = "FAST";
  meter.reset();
  assertEquals(meter.function, "VOLT:DC");
  assertEquals(meter.speed, "SLOW");
});

Deno.test("Multimeter - DC Voltage and Range Selection", () => {
  const meter = new MultimeterSimulation();
  meter.function = "VOLT:DC";
  meter.input.dcVoltage = 5.0;
  meter.input.noiseLevel = 0;

  const reading = meter.takeReading();
  assertAlmostEquals(reading.value, 5.0, 0.01);
  assertEquals(reading.unit, "V");

  meter.setRange(0.6);
  assertEquals(meter.range, 0.6);
  assertEquals(meter.autoRange, false);

  meter.rangeUp();
  assertEquals(meter.range, 6.0);

  meter.rangeDown();
  assertEquals(meter.range, 0.6);
});

Deno.test("Multimeter - AC Voltage and RMS Reading", () => {
  const meter = new MultimeterSimulation();
  meter.function = "VOLT:AC";
  meter.input.acVoltage = 120.0;
  meter.input.noiseLevel = 0;

  const reading = meter.takeReading();
  assertAlmostEquals(reading.value, 120.0, 0.01);
  assertEquals(reading.unit, "V");
});

Deno.test("Multimeter - Current (DC and AC)", () => {
  const meter = new MultimeterSimulation();
  meter.input.dcCurrent = 0.5;
  meter.input.acCurrent = 2.0;
  meter.input.noiseLevel = 0;

  meter.function = "CURR:DC";
  let r = meter.takeReading();
  assertAlmostEquals(r.value, 0.5, 0.01);
  assertEquals(r.unit, "mA");

  meter.function = "CURR:AC";
  r = meter.takeReading();
  assertAlmostEquals(r.value, 2.0, 0.01);
  assertEquals(r.unit, "A");
});

Deno.test("Multimeter - 2-Wire vs 4-Wire Resistance", () => {
  const meter = new MultimeterSimulation();
  meter.input.resistance = 100.0;
  meter.input.leadResistance = 0.5;
  meter.input.noiseLevel = 0;

  meter.function = "RES"; // 2-Wire includes lead resistance
  let r = meter.takeReading();
  assertAlmostEquals(r.value, 100.5, 0.01);

  meter.function = "FRES"; // 4-Wire eliminates lead resistance
  r = meter.takeReading();
  assertAlmostEquals(r.value, 100.0, 0.01);
});

Deno.test("Multimeter - Continuity and Diode Beeper", () => {
  const meter = new MultimeterSimulation();
  meter.input.noiseLevel = 0;

  meter.function = "CONT";
  meter.input.resistance = 5.0; // below 10 ohm threshold -> beeps
  meter.takeReading();
  assertEquals(meter.beeping, true);

  meter.input.resistance = 50.0; // above threshold -> no beep
  meter.takeReading();
  assertEquals(meter.beeping, false);

  meter.function = "DIOD";
  meter.input.diodeForwardVoltage = 0.65; // forward silicon diode -> beeps
  meter.takeReading();
  assertEquals(meter.beeping, true);

  meter.input.diodeForwardVoltage = 3.5; // open/high drop -> no beep
  meter.takeReading();
  assertEquals(meter.beeping, false);
});

Deno.test("Multimeter - Frequency, Period and Capacitance", () => {
  const meter = new MultimeterSimulation();
  meter.input.frequency = 5000.0;
  meter.input.capacitance = 1e-6; // 1 uF
  meter.input.noiseLevel = 0;

  meter.function = "FREQ";
  let r = meter.takeReading();
  assertAlmostEquals(r.value, 5000.0, 0.1);

  meter.function = "PER";
  r = meter.takeReading();
  assertAlmostEquals(r.value, 0.0002, 0.00001);

  meter.function = "CAP";
  r = meter.takeReading();
  assertAlmostEquals(r.value, 1e-6, 1e-8);
});

Deno.test("Multimeter - Dual Display Mode", () => {
  const meter = new MultimeterSimulation();
  meter.function = "VOLT:DC";
  meter.secondaryFunction = "VOLT:AC";
  meter.dualEnabled = true;
  meter.input.dcVoltage = 5.0;
  meter.input.acVoltage = 0.05;
  meter.input.noiseLevel = 0;

  const r = meter.takeReading();
  assertAlmostEquals(r.value, 5.0, 0.01);
  assertEquals(r.secondaryValue !== undefined, true);
  assertAlmostEquals(r.secondaryValue!, 0.05, 0.01);
});

Deno.test("Multimeter - Math Null / Relative", () => {
  const meter = new MultimeterSimulation();
  meter.function = "VOLT:DC";
  meter.input.dcVoltage = 5.0;
  meter.input.noiseLevel = 0;

  meter.nullEnabled = true;
  meter.nullValue = 1.0;

  const r = meter.takeReading();
  assertAlmostEquals(r.value, 4.0, 0.01);
});

Deno.test("Multimeter - Statistics Calculation", () => {
  const meter = new MultimeterSimulation();
  meter.clearStatistics();
  meter.addSampleToStatistics(10.0);
  meter.addSampleToStatistics(20.0);
  meter.addSampleToStatistics(30.0);

  assertEquals(meter.stats.count, 3);
  assertEquals(meter.stats.min, 10.0);
  assertEquals(meter.stats.max, 30.0);
  assertAlmostEquals(meter.stats.average, 20.0, 0.001);
  assertEquals(meter.stats.span, 20.0);
  assertAlmostEquals(meter.stats.stdDev, 10.0, 0.001);
});

Deno.test("Multimeter - Limit Testing", () => {
  const meter = new MultimeterSimulation();
  meter.limits.enabled = true;
  meter.limits.low = 2.0;
  meter.limits.high = 4.0;

  meter.evaluateLimits(3.0);
  assertEquals(meter.limits.status, "PASS");
  assertEquals(meter.limits.passCount, 1);

  meter.evaluateLimits(1.5);
  assertEquals(meter.limits.status, "LOW");
  assertEquals(meter.limits.lowCount, 1);

  meter.evaluateLimits(5.0);
  assertEquals(meter.limits.status, "HIGH");
  assertEquals(meter.limits.highCount, 1);
});
