import manifest from "./instrument.json" with { type: "json" };
import { RawDataSinkConfig, RawDataSinkEngine } from "./src/raw_data_sink.ts";
import {
  createHandler,
  type Instrument,
  json,
  type Schema,
  start,
} from "./plugin_http.ts";

export function createPlugin() {
  const engine = new RawDataSinkEngine();

  const instrument: Instrument = {
    id: manifest.id,
    configuration: manifest.configuration as unknown as Schema,
    state() {
      return engine.getState();
    },
    async configure(config) {
      await engine.configure(config as unknown as Partial<RawDataSinkConfig>);
    },
    command(command) {
      return engine.executeScpi(command);
    },
    async reset() {
      await engine.reset();
    },
    async legacy(req, path) {
      if (path === "/api/sink/write" && req.method === "POST") {
        const body = await req.json();
        const payload = typeof body === "string"
          ? body
          : (body.data ?? JSON.stringify(body));
        await engine.write(payload);
        return json({ success: true, count: engine.getState().itemsReceived });
      }
    },
  };

  return createHandler(instrument, new URL("./", import.meta.url));
}

export const handler = createPlugin();
if (import.meta.main) start(handler);
