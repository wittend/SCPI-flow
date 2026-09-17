import manifest from "./instrument.json" with { type: "json" };
import { ScpiEngine } from "./src/scpi_engine.ts";
import { SignalGenerator } from "./src/signal_generator.ts";
import { createHandler, type Instrument, json, start } from "./plugin_http.ts";

export function createPlugin() {
  let engine = new ScpiEngine();
  const instrument: Instrument = {
    id: manifest.id,
    configuration: manifest.configuration,
    state: () => ({ ...engine.scope.acquire(), isRunning: engine.scope.isRunning }),
    configure(config) {
      const { ch1, ch2, ...settings } = config;
      Object.assign(engine.scope, settings);
      for (const [channel, value] of [[engine.scope.ch1, ch1], [engine.scope.ch2, ch2]] as const) {
        if (!value) continue;
        const { generator, ...channelSettings } = value as Record<string, unknown>;
        Object.assign(channel, channelSettings);
        if (generator) {
          channel.generator = SignalGenerator.fromJSON({
            ...channel.generator.toJSON(),
            ...(generator as Record<string, unknown>),
          });
        }
      }
      if (config.isRunning === true) engine.scope.run();
      if (config.isRunning === false) engine.scope.stop();
    },
    command: (command) => engine.execute(command),
    reset() {
      engine = new ScpiEngine();
    },
    async legacy(req, path) {
      if (path === "/api/scope/frame" && req.method === "GET") return json(instrument.state());
      if (path === "/api/scope/measurements" && req.method === "GET") {
        return json({ ch1: engine.scope.getMeasurements(1), ch2: engine.scope.getMeasurements(2) });
      }
      if (path === "/api/scope/command" && req.method === "POST") {
        const response = await handler(new Request(new URL("/command", req.url), req));
        const data = await response.json();
        return json({ success: response.ok, ...data }, response.status);
      }
    },
  };
  const handler = createHandler(instrument, new URL("./", import.meta.url));
  return handler;
}

export const handler = createPlugin();
if (import.meta.main) start(handler);
