import manifest from "./instrument.json" with { type: "json" };
import { SignalGenerator } from "./src/signal_generator.ts";
import { createHandler, type Instrument, json, start, validate } from "./plugin_http.ts";

export function createPlugin() {
  let generator = new SignalGenerator();
  let outputEnabled = true;
  const errors: string[] = [];
  const instrument: Instrument = {
    id: manifest.id,
    configuration: manifest.configuration,
    state: () => ({ ...generator.toJSON(), outputEnabled }),
    configure(config) {
      const { outputEnabled: enabled, ...settings } = config;
      const next = SignalGenerator.fromJSON({ ...generator.toJSON(), ...settings });
      generator = next;
      if (enabled !== undefined) outputEnabled = enabled as boolean;
    },
    reset() {
      generator = new SignalGenerator();
      outputEnabled = true;
      errors.length = 0;
    },
    command(command) {
      const text = command.trim().replace(/^:/, "").toUpperCase();
      if (text === "*IDN?") return "SCPI Instruments,Signal Generator Simulator,SG-SIM,1.0.0";
      if (text === "*RST") {
        instrument.reset();
        return "";
      }
      if (text === "*CLS") {
        errors.length = 0;
        return "";
      }
      if (text === "*OPC?") return "1";
      if (text === "SYST:ERR?" || text === "SYSTEM:ERROR?") return errors.shift() ?? '0,"No error"';
      if (text === "C1:BSWV?") {
        return `WVTP,${generator.type.toUpperCase()},FRQ,${generator.frequency}HZ,AMP,${
          generator.amplitude * 2
        }V,OFST,${generator.offset}V,PHSE,${generator.phase},DUTY,${generator.dutyCycle * 100}`;
      }
      if (text === "OUTP?" || text === "OUTPUT?" || text === "C1:OUTP?") {
        return outputEnabled ? "ON" : "OFF";
      }
      const output = text.match(/^(?:C1:OUTP|OUTP|OUTPUT) (ON|OFF|1|0)$/);
      if (output) {
        outputEnabled = output[1] === "ON" || output[1] === "1";
        return "";
      }
      const parameter = text.match(
        /^(FREQ(?:UENCY)?|VOLT(?:AGE)?(?::OFFS(?:ET)?)?|PHAS(?:E)?|FUNC(?:TION)?)(\?|\s+(.+))$/,
      );
      if (parameter) {
        const key = parameter[1].startsWith("FREQ")
          ? "frequency"
          : parameter[1].includes(":OFFS")
          ? "offset"
          : parameter[1].startsWith("VOLT")
          ? "amplitude"
          : parameter[1].startsWith("PHAS")
          ? "phase"
          : "type";
        if (parameter[2] === "?") return String(generator.toJSON()[key]);
        const aliases: Record<string, string> = {
          SIN: "sine",
          SQU: "square",
          TRI: "triangle",
          RAMP: "sawtooth",
          NOIS: "noise",
        };
        const value = key === "type"
          ? aliases[parameter[3]] ?? parameter[3].toLowerCase()
          : Number(parameter[3]);
        const config = { [key]: value };
        try {
          validate(config, manifest.configuration);
          instrument.configure(config);
          return "";
        } catch (error) {
          errors.push('-222,"Data out of range"');
          throw error;
        }
      }
      errors.push('-113,"Undefined header"');
      throw new Error(`Unsupported command: ${command}`);
    },
    async legacy(req, path) {
      if (path === "/api/gen/state") {
        if (req.method === "GET") return json(instrument.state());
        if (req.method === "POST") {
          const config = await req.json();
          validate(config, manifest.configuration);
          instrument.configure(config);
          return json({ success: true, ...instrument.state() as object });
        }
      }
      if (path === "/api/gen/preview" && req.method === "GET") {
        const duration = 2 / Math.max(1, generator.frequency);
        const buffer = generator.generateBuffer(0, duration, 400);
        if (!outputEnabled) buffer.voltage.fill(0);
        return json({ ...buffer, ...instrument.state() as object });
      }
    },
  };
  return createHandler(instrument, new URL("./", import.meta.url));
}

export const handler = createPlugin();
if (import.meta.main) start(handler);
