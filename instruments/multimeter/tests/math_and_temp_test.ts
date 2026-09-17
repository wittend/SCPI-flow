import { assertAlmostEquals, assertEquals } from "@std/assert";
import { MultimeterSimulation } from "../src/multimeter.ts";
import { ScpiEngine } from "../src/scpi_engine.ts";

Deno.test("Multimeter - dB and dBm Calculations", () => {
  const meter = new MultimeterSimulation();
  meter.function = "VOLT:AC";
  meter.input.acVoltage = 1.0;
  meter.input.noiseLevel = 0;

  // dB relative to 1.0V: 20 * log10(1/1) = 0 dB
  meter.mathFunction = "DB";
  meter.dbReference = 1.0;
  let r = meter.takeReading();
  assertAlmostEquals(r.value, 0.0, 0.01);

  // 10V relative to 1.0V: 20 * log10(10/1) = 20 dB
  meter.input.acVoltage = 10.0;
  r = meter.takeReading();
  assertAlmostEquals(r.value, 20.0, 0.01);

  // dBm relative to 600 ohm:
  // 1V RMS into 600 ohm -> (1^2 / 600) * 1000 = 1.6667 mW -> 10 * log10(1.6667) = 2.2185 dBm
  meter.mathFunction = "DBM";
  meter.dbmReference = 600;
  meter.input.acVoltage = 1.0;
  r = meter.takeReading();
  assertAlmostEquals(r.value, 2.2185, 0.01);

  // SCPI verification
  const scpi = new ScpiEngine(meter);
  scpi.execute("CALC:SCAL:FUNC DBM");
  assertEquals(scpi.query("CALC:SCAL:FUNC?"), "DBM");
  scpi.execute("CALC:SCAL:DBM:REF 50");
  assertEquals(scpi.query("CALC:SCAL:DBM:REF?"), "50");
});

Deno.test("Multimeter - Temperature Units (Celsius, Fahrenheit, Kelvin)", () => {
  const meter = new MultimeterSimulation();
  meter.function = "TEMP";
  meter.input.temperature = 25.0; // 25 C
  meter.input.noiseLevel = 0;

  meter.temperatureUnit = "C";
  let r = meter.takeReading();
  assertAlmostEquals(r.value, 25.0, 0.1);
  assertEquals(r.unit, "°C");

  meter.temperatureUnit = "F";
  r = meter.takeReading();
  // 25 * 9/5 + 32 = 77 F
  assertAlmostEquals(r.value, 77.0, 0.1);
  assertEquals(r.unit, "°F");

  meter.temperatureUnit = "K";
  r = meter.takeReading();
  // 25 + 273.15 = 298.15 K
  assertAlmostEquals(r.value, 298.15, 0.1);
  assertEquals(r.unit, "K");

  // SCPI verification
  const scpi = new ScpiEngine(meter);
  scpi.execute("UNIT:TEMP F");
  assertEquals(scpi.query("UNIT:TEMP?"), "F");
  assertEquals(meter.temperatureUnit, "F");
});

Deno.test("Multimeter - Histogram Sample Processing", () => {
  const meter = new MultimeterSimulation();
  meter.histogram.enabled = true;
  meter.histogram.autoRange = false;
  meter.histogram.lower = 0;
  meter.histogram.upper = 10;
  meter.histogram.binCount = 5;
  meter.clearHistogram();

  meter.addSampleToHistogram(1.0); // bin 0 (0-2)
  meter.addSampleToHistogram(3.0); // bin 1 (2-4)
  meter.addSampleToHistogram(5.0); // bin 2 (4-6)
  meter.addSampleToHistogram(7.0); // bin 3 (6-8)
  meter.addSampleToHistogram(9.0); // bin 4 (8-10)

  assertEquals(meter.histogram.sampleCount, 5);
  assertEquals(meter.histogram.bins, [1, 1, 1, 1, 1]);

  const scpi = new ScpiEngine(meter);
  assertEquals(scpi.query("CALC:TRAN:HIST:COUN?"), "5");
  assertEquals(scpi.query("CALC:TRAN:HIST:POIN?"), "5");
});
