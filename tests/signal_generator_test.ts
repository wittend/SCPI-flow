import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import { SignalGenerator } from "../src/signal_generator.ts";

Deno.test("SignalGenerator - default initialization", () => {
  const gen = new SignalGenerator();
  assertEquals(gen.type, "sine");
  assertEquals(gen.frequency, 1000);
  assertEquals(gen.amplitude, 1.0);
  assertEquals(gen.phase, 0);
  assertEquals(gen.offset, 0.0);
  assertEquals(gen.dutyCycle, 0.5);
  assertEquals(gen.scale, 1.0);
});

Deno.test("SignalGenerator - sine wave sampling", () => {
  const gen = new SignalGenerator({
    type: "sine",
    frequency: 1000,
    amplitude: 2.0,
    phase: 0,
    offset: 1.0,
  });
  // At t = 0, sin(0) = 0 -> offset = 1.0
  assertAlmostEquals(gen.sample(0), 1.0, 1e-4);
  // At t = 1/4000 = 0.00025s (quarter period), sin(pi/2) = 1 -> 1.0 + 2.0 = 3.0
  assertAlmostEquals(gen.sample(0.00025), 3.0, 1e-4);
  // At t = 3/4000 = 0.00075s (three-quarters period), sin(3pi/2) = -1 -> 1.0 - 2.0 = -1.0
  assertAlmostEquals(gen.sample(0.00075), -1.0, 1e-4);
});

Deno.test("SignalGenerator - square wave sampling and duty cycle", () => {
  const gen = new SignalGenerator({
    type: "square",
    frequency: 1000,
    amplitude: 1.0,
    offset: 0,
    dutyCycle: 0.25,
  });
  // 0 to 0.25 of period (1ms) should be high (+1.0)
  assertEquals(gen.sample(0.0001), 1.0);
  // > 0.25 of period should be low (-1.0)
  assertEquals(gen.sample(0.0005), -1.0);
});

Deno.test("SignalGenerator - triangle wave sampling", () => {
  const gen = new SignalGenerator({
    type: "triangle",
    frequency: 1000,
    amplitude: 1.0,
    offset: 0,
  });
  // At t=0 -> 0
  assertAlmostEquals(gen.sample(0), 0.0, 1e-4);
  // At quarter period (0.25ms) -> peak +1.0
  assertAlmostEquals(gen.sample(0.00025), 1.0, 1e-4);
  // At half period (0.5ms) -> 0.0
  assertAlmostEquals(gen.sample(0.0005), 0.0, 1e-4);
  // At 3/4 period (0.75ms) -> -1.0
  assertAlmostEquals(gen.sample(0.00075), -1.0, 1e-4);
});

Deno.test("SignalGenerator - sawtooth wave sampling", () => {
  const gen = new SignalGenerator({
    type: "sawtooth",
    frequency: 1000,
    amplitude: 1.0,
    offset: 0,
  });
  // At t=0 -> -1.0
  assertAlmostEquals(gen.sample(0), -1.0, 1e-4);
  // At t=0.5ms -> 0.0
  assertAlmostEquals(gen.sample(0.0005), 0.0, 1e-4);
  // At t=0.999ms -> almost +1.0
  assertAlmostEquals(gen.sample(0.000999), 1.0, 0.05);
});

Deno.test("SignalGenerator - DC and Noise", () => {
  const dcGen = new SignalGenerator({ type: "dc", offset: 3.3 });
  assertEquals(dcGen.sample(0), 3.3);
  assertEquals(dcGen.sample(10), 3.3);

  const noiseGen = new SignalGenerator({
    type: "noise",
    amplitude: 0.5,
    offset: 2.0,
  });
  const s = noiseGen.sample(0.1);
  assertEquals(s >= 1.5 && s <= 2.5, true);
});

Deno.test("SignalGenerator - parameter setters and validation", () => {
  const gen = new SignalGenerator();
  gen.setType("square");
  assertEquals(gen.type, "square");
  assertThrows(() => gen.setType("invalid_type"));

  gen.setFrequency(5000);
  assertEquals(gen.frequency, 5000);
  assertThrows(() => gen.setFrequency(-10));

  gen.setAmplitude(3.0);
  assertEquals(gen.amplitude, 3.0);
  assertThrows(() => gen.setAmplitude(-1));

  gen.setPhase(450);
  assertEquals(gen.phase, 90);

  gen.setOffset(2.5);
  assertEquals(gen.offset, 2.5);

  gen.setDutyCycle(0.8);
  assertEquals(gen.dutyCycle, 0.8);
  assertThrows(() => gen.setDutyCycle(1.5));

  gen.setScale(2.0);
  assertEquals(gen.scale, 2.0);
});

Deno.test("SignalGenerator - generateBuffer", () => {
  const gen = new SignalGenerator({ frequency: 1000, amplitude: 1.0 });
  const buf = gen.generateBuffer(0, 0.001, 100);
  assertEquals(buf.time.length, 100);
  assertEquals(buf.voltage.length, 100);
  assertEquals(buf.time[0], 0);
  assertAlmostEquals(buf.time[99], 0.001, 1e-5);
  assertThrows(() => gen.generateBuffer(0, 0.001, 0));
});

Deno.test("SignalGenerator - serialization toJSON/fromJSON and reset", () => {
  const gen = new SignalGenerator({
    type: "triangle",
    frequency: 2500,
    amplitude: 4.0,
  });
  const json = gen.toJSON();
  assertEquals(json.type, "triangle");
  assertEquals(json.frequency, 2500);

  const gen2 = SignalGenerator.fromJSON(json);
  assertEquals(gen2.type, "triangle");
  assertEquals(gen2.frequency, 2500);
  assertEquals(gen2.amplitude, 4.0);

  gen2.reset();
  assertEquals(gen2.type, "sine");
  assertEquals(gen2.frequency, 1000);
});
