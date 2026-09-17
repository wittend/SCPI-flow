import { assertAlmostEquals, assertEquals } from "@std/assert";
import { ScpiEngine } from "../src/scpi_engine.ts";

Deno.test("ScpiEngine - IEEE 488.2 Common Commands (*IDN?, *RST, *CLS, *OPC?, *STB?, *ESR?)", () => {
  const scpi = new ScpiEngine();
  // *IDN?
  assertEquals(scpi.execute("*IDN?"), scpi.idn);

  // *OPC?
  assertEquals(scpi.execute("*OPC?"), "1");

  // *STB?
  assertEquals(scpi.execute("*STB?"), "0");

  // Push error and check STB/ESR
  scpi.pushError(-100, "Syntax error");
  assertEquals(scpi.esr, 0x20); // CME
  assertEquals(scpi.stb, 0x04); // Error queue not empty

  // *CLS clears errors and status
  scpi.execute("*CLS");
  assertEquals(scpi.esr, 0);
  assertEquals(scpi.stb, 0);
  assertEquals(scpi.execute("SYST:ERR?"), '0,"No error"');
});

Deno.test("ScpiEngine - Error queue reporting (SYST:ERR?, SYST:ERR:COUN?)", () => {
  const scpi = new ScpiEngine();
  scpi.execute("UNKNOWN:COMMAND");
  assertEquals(scpi.execute("SYST:ERR:COUN?"), "1");

  const err = scpi.execute("SYST:ERR?");
  assertEquals(err?.startsWith("-113,"), true);
  assertEquals(scpi.execute("SYST:ERR?"), '0,"No error"');
});

Deno.test("ScpiEngine - Channel 1 and 2 vertical commands (C1:VDIV, C1:OFST, C1:TRA, C1:COUP)", () => {
  const scpi = new ScpiEngine();
  scpi.execute("C1:VDIV 2.5");
  assertEquals(scpi.execute("C1:VDIV?"), "2.5");
  assertEquals(scpi.scope.ch1.voltDiv, 2.5);

  scpi.execute("C1:OFST -1.2");
  assertEquals(scpi.execute("C1:OFST?"), "-1.2");
  assertEquals(scpi.scope.ch1.offset, -1.2);

  scpi.execute("C1:TRA OFF");
  assertEquals(scpi.execute("C1:TRA?"), "OFF");
  assertEquals(scpi.scope.ch1.enabled, false);

  scpi.execute("C1:COUP AC");
  assertEquals(scpi.execute("C1:COUP?"), "AC");
  assertEquals(scpi.scope.ch1.coupling, "AC");

  // Channel 2
  scpi.execute("C2:VDIV 0.5");
  assertEquals(scpi.execute("C2:VDIV?"), "0.5");
  assertEquals(scpi.scope.ch2.voltDiv, 0.5);
});

Deno.test("ScpiEngine - Timebase and Trigger commands (TDIV, TRDL, TRIG:...)", () => {
  const scpi = new ScpiEngine();
  scpi.execute("TDIV 0.002");
  assertEquals(scpi.execute("TDIV?"), "0.002");

  scpi.execute("TRDL 0.0005");
  assertEquals(scpi.execute("TRDL?"), "0.0005");

  scpi.execute("TRIG:SOUR C2");
  assertEquals(scpi.execute("TRIG:SOUR?"), "CH2");

  scpi.execute("TRIG:MODE NORM");
  assertEquals(scpi.execute("TRIG:MODE?"), "NORM");

  scpi.execute("TRIG:SLOP NEG");
  assertEquals(scpi.execute("TRIG:SLOP?"), "NEG");

  scpi.execute("TRIG:LEV 1.5");
  assertEquals(scpi.execute("TRIG:LEV?"), "1.5");
});

Deno.test("ScpiEngine - Signal Generator manipulation (C1:WAVE:..., C2:WAVE:...)", () => {
  const scpi = new ScpiEngine();
  scpi.execute("C1:WAVE:TYPE SQUARE");
  assertEquals(scpi.execute("C1:WAVE:TYPE?"), "SQUARE");
  assertEquals(scpi.scope.ch1.generator.type, "square");

  scpi.execute("C1:WAVE:FREQ 5000");
  assertEquals(scpi.execute("C1:WAVE:FREQ?"), "5000");
  assertEquals(scpi.scope.ch1.generator.frequency, 5000);

  scpi.execute("C1:WAVE:AMP 3.5");
  assertEquals(scpi.execute("C1:WAVE:AMP?"), "3.5");

  scpi.execute("C1:WAVE:OFST 1.0");
  assertEquals(scpi.execute("C1:WAVE:OFST?"), "1");

  scpi.execute("C1:WAVE:DUTY 0.75");
  assertEquals(scpi.execute("C1:WAVE:DUTY?"), "0.75");
});

Deno.test("ScpiEngine - Measurement queries (C1:PAVA?, MEAS:VPP?, MEAS:ALL?)", () => {
  const scpi = new ScpiEngine();
  scpi.execute("C1:WAVE:TYPE SINE; C1:WAVE:FREQ 1000; C1:WAVE:AMP 2.0");

  const pavaVpp = scpi.execute("C1:PAVA? PKPK");
  assertEquals(pavaVpp?.includes("CH1:PAVA PKPK,"), true);

  const measVpp = scpi.execute("MEAS:VPP? C1");
  const val = parseFloat(measVpp || "0");
  assertAlmostEquals(val, 4.0, 0.2);

  const measAll = scpi.execute("MEAS:ALL? C1");
  const parsed = JSON.parse(measAll || "{}");
  assertEquals(parsed.vpp !== undefined, true);
  assertEquals(parsed.frequency !== undefined, true);
});

Deno.test("ScpiEngine - Cursors and Display commands", () => {
  const scpi = new ScpiEngine();
  scpi.execute("CURS:TYPE MANUAL");
  assertEquals(scpi.execute("CURS:TYPE?"), "MANUAL");

  scpi.execute("CURS:X1 -0.001; CURS:X2 0.001");
  assertEquals(scpi.execute("CURS:XDEL?"), "0.002");
  assertEquals(scpi.execute("CURS:FREQ?"), "500");

  scpi.execute("DISP:GRID HALF");
  assertEquals(scpi.execute("DISP:GRID?"), "HALF");

  scpi.execute('DISP:TITLE "Test SDS1000X"');
  assertEquals(scpi.execute("DISP:TITLE?"), '"Test SDS1000X"');
});

Deno.test("ScpiEngine - Waveform data query (C1:WF?, WAV:DATA?)", () => {
  const scpi = new ScpiEngine();
  const wf = scpi.execute("C1:WF? DAT2");
  assertEquals(wf?.startsWith("CH1:WF DAT2,#9"), true);

  const wavData = scpi.execute("WAV:DATA? CHAN1");
  assertEquals(wavData?.includes(","), true);
});
