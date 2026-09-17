import manifest from "./instrument.json" with { type: "json" };
import { ScpiEngine } from "./src/scpi_engine.ts";
import { type MeasurementFunction, type MultimeterSimulation } from "./src/multimeter.ts";
import { createHandler, type Instrument, json, start, validate } from "./plugin_http.ts";

function pressButton(m: MultimeterSimulation, button: string) {
  const functions: Record<string, MeasurementFunction> = {
    DCV: "VOLT:DC",
    ACV: "VOLT:AC",
    DCI: "CURR:DC",
    ACI: "CURR:AC",
    "2W": "RES",
    "4W": "FRES",
    CAP: "CAP",
    CONT: "CONT",
    DIOD: "DIOD",
    FREQ: "FREQ",
    PER: "PER",
    TEMP: "TEMP",
  };
  if (Object.hasOwn(functions, button)) {
    m.function = functions[button];
    return;
  }
  switch (button) {
    case "DUAL":
      m.dualEnabled = !m.dualEnabled;
      break;
    case "RANGE_UP":
      m.rangeUp();
      break;
    case "RANGE_DOWN":
      m.rangeDown();
      break;
    case "AUTO_RANGE":
      m.autoRange = !m.autoRange;
      break;
    case "SPEED":
      m.speed = m.speed === "SLOW" ? "MED" : m.speed === "MED" ? "FAST" : "SLOW";
      break;
    case "MATH_STATS":
      m.statisticsEnabled = !m.statisticsEnabled;
      break;
    case "MATH_LIMIT":
      m.limits.enabled = !m.limits.enabled;
      break;
    case "MATH_NULL":
      m.nullEnabled = !m.nullEnabled;
      if (m.nullEnabled) m.nullValue = m.takeReading().value;
      break;
    case "MATH_DB":
      m.mathFunction = m.mathFunction === "DB" ? "NONE" : "DB";
      break;
    case "MATH_DBM":
      m.mathFunction = m.mathFunction === "DBM" ? "NONE" : "DBM";
      break;
    case "DISP_NUMBER":
      m.displayMode = "NUMBER";
      break;
    case "DISP_BAR":
      m.displayMode = "BAR";
      break;
    case "DISP_TREND":
      m.displayMode = "TREND";
      break;
    case "DISP_HIST":
      m.displayMode = "HISTOGRAM";
      break;
    case "TRIG_SINGLE":
      m.takeReading();
      break;
    case "RUN_STOP":
      m.isRunning = !m.isRunning;
      break;
    case "RESET":
      m.reset();
      break;
    case "POWER":
      m.isPowered = !m.isPowered;
      break;
    default:
      throw new Error(`Unknown front-panel button: ${button}`);
  }
}

export function createPlugin() {
  let engine = new ScpiEngine();
  const instrument: Instrument = {
    id: manifest.id,
    configuration: manifest.configuration,
    state() {
      const m = engine.meter;
      const reading = m.takeReading();
      return {
        reading,
        function: m.function,
        range: m.range,
        autoRange: m.autoRange,
        speed: m.speed,
        dualEnabled: m.dualEnabled,
        secondaryFunction: m.secondaryFunction,
        displayMode: m.displayMode,
        mathFunction: m.mathFunction,
        nullEnabled: m.nullEnabled,
        nullValue: m.nullValue,
        statisticsEnabled: m.statisticsEnabled,
        stats: m.stats,
        limits: m.limits,
        histogram: m.histogram,
        trendHistory: m.trendHistory,
        beeping: m.beeping,
        isPowered: m.isPowered,
        isRunning: m.isRunning,
        triggerSource: m.triggerSource,
        input: m.input,
      };
    },
    configure(config) {
      const { input, limits, range, autoRange, ...settings } = config;
      if (limits) {
        const next = { ...engine.meter.limits, ...limits as object };
        if (next.low > next.high) throw new Error("limits.low must not exceed limits.high");
      }
      Object.assign(engine.meter, settings);
      if (range !== undefined) engine.meter.setRange(range as number);
      if (autoRange !== undefined) engine.meter.autoRange = autoRange as boolean;
      if (input) Object.assign(engine.meter.input, input);
      if (limits) Object.assign(engine.meter.limits, limits);
    },
    command: (command) => engine.execute(command),
    reset() {
      engine = new ScpiEngine();
    },
    async legacy(req, path) {
      if (path === "/api/dmm/reading" && req.method === "GET") return json(instrument.state());
      if (path === "/api/dmm/command" && req.method === "POST") {
        const response = await handler(new Request(new URL("/command", req.url), req));
        return json({ success: response.ok, ...await response.json() }, response.status);
      }
      if ((path === "/api/dmm/config" || path === "/api/dmm/input") && req.method === "POST") {
        const body = await req.json();
        const config = path.endsWith("/input") ? { input: body } : body;
        validate(config, manifest.configuration);
        instrument.configure(config);
        return json({ success: true, input: engine.meter.input });
      }
      if (path === "/api/dmm/reset" && req.method === "POST") {
        instrument.reset();
        return json({ success: true });
      }
      if (path === "/api/dmm/frontpanel" && req.method === "POST") {
        const body = await req.json();
        validate(body, { type: "object", properties: { button: { type: "string" } } });
        if (typeof body.button !== "string") throw new Error("button is required");
        pressButton(engine.meter, body.button);
        return json({ success: true, function: engine.meter.function });
      }
    },
  };
  const baseHandler = createHandler(instrument, new URL("./", import.meta.url));
  const handler = (req: Request) => {
    if (new URL(req.url).pathname === "/" || new URL(req.url).pathname === "/index.html") {
      return new Response(null, { status: 302, headers: { location: "plugin-ui/index.html" } });
    }
    return baseHandler(req);
  };
  return handler;
}

export const handler = createPlugin();
if (import.meta.main) start(handler);
