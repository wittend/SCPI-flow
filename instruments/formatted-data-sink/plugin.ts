import manifest from "./instrument.json" with { type: "json" };
import {
  FormattedDataSinkConfig,
  FormattedDataSinkEngine,
} from "./src/formatted_data_sink.ts";
import {
  createHandler,
  type Instrument,
  json,
  type Schema,
  start,
} from "./plugin_http.ts";

export function createPlugin() {
  const engine = new FormattedDataSinkEngine();

  const instrument: Instrument = {
    id: manifest.id,
    configuration: manifest.configuration as unknown as Schema,
    state() {
      return engine.getState();
    },
    async configure(config) {
      await engine.configure(
        config as unknown as Partial<FormattedDataSinkConfig>,
      );
    },
    command(command) {
      return engine.executeScpi(command);
    },
    async reset() {
      await engine.reset();
    },
    async legacy(req, path) {
      if (path === "/api/formatted-sink/write" && req.method === "POST") {
        const body = await req.json();
        const payload = body.data !== undefined ? body.data : body;
        await engine.write(payload);
        return json({ success: true, count: engine.getState().itemsReceived });
      }
    },
  };

  return createHandler(instrument, new URL("./", import.meta.url));
}

export const handler = createPlugin();
if (import.meta.main) start(handler);
