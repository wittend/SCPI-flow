import { assertAlmostEquals, assertEquals } from "@std/assert";
import { MultimeterSimulation } from "../src/multimeter.ts";
import { ScpiEngine } from "../src/scpi_engine.ts";

Deno.test("SCPI Engine - IEEE 488.2 Common Commands", () => {
  const meter = new MultimeterSimulation();
  const scpi = new ScpiEngine(meter);

  assertEquals(scpi.query("*IDN?"), "Siglent Technologies,SDM3045X,SDM3045X-SIM,1.01.01.23R2");
  assertEquals(scpi.query("*OPC?"), "1");

  scpi.execute("*CLS");
  assertEquals(scpi.stb, 0);

  scpi.execute("*ESE 32");
  assertEquals(scpi.query("*ESE?"), "32");

  scpi.execute("*SRE 64");
  assertEquals(scpi.query("*SRE?"), "64");
});

Deno.test("SCPI Engine - CONFigure and MEASure Subsystems", () => {
  const meter = new MultimeterSimulation();
  meter.input.dcVoltage = 3.3;
  meter.input.acVoltage = 12.0;
  meter.input.resistance = 5000.0;
  meter.input.leadResistance = 0.0;
  meter.input.noiseLevel = 0;
  const scpi = new ScpiEngine(meter);

  scpi.execute("CONF:VOLT:DC 6.0");
  assertEquals(meter.function, "VOLT:DC");

  const measVolt = parseFloat(scpi.query("MEAS:VOLT:DC? 6.0"));
  assertAlmostEquals(measVolt, 3.3, 0.01);

  const measRes = parseFloat(scpi.query("MEAS:RES? 6000"));
  assertAlmostEquals(measRes, 5000.0, 1.0);
  assertEquals(meter.function, "RES");

  const measAc = parseFloat(scpi.query("MEAS:VOLT:AC?"));
  assertAlmostEquals(measAc, 12.0, 0.01);
  assertEquals(meter.function, "VOLT:AC");
});

Deno.test("SCPI Engine - SENSe Subsystem Configuration", () => {
  const meter = new MultimeterSimulation();
  const scpi = new ScpiEngine(meter);

  scpi.execute('SENS:FUNC "CURR:DC"');
  assertEquals(meter.function, "CURR:DC");
  assertEquals(scpi.query("SENS:FUNC?"), '"CURR:DC"');

  scpi.execute("SENS:VOLT:DC:RANG 60.0");
  assertEquals(meter.range, 60.0);
  assertEquals(scpi.query("SENS:VOLT:DC:RANG:AUTO?"), "0");

  scpi.execute("SENS:VOLT:DC:NPLC 10");
  assertEquals(meter.nplc, 10);
  assertEquals(scpi.query("SENS:VOLT:DC:NPLC?"), "10");

  scpi.execute("SENS:VOLT:DC:IMP 10G");
  assertEquals(meter.inputImpedance, "10G");
  assertEquals(scpi.query("SENS:VOLT:DC:IMP?"), "10G");

  scpi.execute("SENS:CONT:THR:VAL 25");
  assertEquals(meter.continuityThreshold, 25);
  assertEquals(scpi.query("SENS:CONT:THR:VAL?"), "25");
});

Deno.test("SCPI Engine - CALCulate Subsystem (Statistics & Limits & Null)", () => {
  const meter = new MultimeterSimulation();
  meter.input.dcVoltage = 5.0;
  meter.input.noiseLevel = 0;
  const scpi = new ScpiEngine(meter);

  // Statistics
  scpi.execute("CALC:AVER:STAT ON");
  assertEquals(meter.statisticsEnabled, true);

  meter.takeReading();
  meter.takeReading();
  const allStats = scpi.query("CALC:AVER:ALL?");
  assertEquals(allStats.includes("5.00000000e+00") || allStats.includes("5.00000000E+00"), true);

  // Limits
  scpi.execute("CALC:LIM:LOW 1.0");
  scpi.execute("CALC:LIM:UPP 10.0");
  scpi.execute("CALC:LIM:STAT ON");
  assertEquals(meter.limits.enabled, true);

  // Null
  scpi.execute("CALC:NULL:VAL 2.0");
  scpi.execute("CALC:NULL:STAT ON");
  assertEquals(meter.nullEnabled, true);
  assertEquals(meter.nullValue, 2.0);

  const readVal = parseFloat(scpi.query("READ?"));
  assertAlmostEquals(readVal, 3.0, 0.01); // 5.0 - 2.0 = 3.0
});

Deno.test("SCPI Engine - Trigger and Fetch", () => {
  const meter = new MultimeterSimulation();
  meter.input.dcVoltage = 2.5;
  meter.input.noiseLevel = 0;
  const scpi = new ScpiEngine(meter);

  scpi.execute("TRIG:SOUR BUS");
  assertEquals(scpi.query("TRIG:SOUR?"), "BUS");

  scpi.execute("TRIG:COUN 5");
  assertEquals(scpi.query("TRIG:COUN?"), "5");

  scpi.execute("SAMP:COUN 2");
  assertEquals(scpi.query("SAMP:COUN?"), "2");

  const r = parseFloat(scpi.query("READ?"));
  assertAlmostEquals(r, 2.5, 0.01);

  const f = parseFloat(scpi.query("FETC?"));
  assertAlmostEquals(f, 2.5, 0.01);
});

Deno.test("SCPI Engine - Error Reporting & Queue", () => {
  const meter = new MultimeterSimulation();
  const scpi = new ScpiEngine(meter);

  assertEquals(scpi.query("SYST:ERR?"), '0,"No error"');

  // Trigger command error
  scpi.execute("INVALID:UNKNOWN:HEADER");
  const err = scpi.query("SYST:ERR?");
  assertEquals(err.startsWith("-113"), true);

  // Queue should be empty now
  assertEquals(scpi.query("SYST:ERR?"), '0,"No error"');
});
