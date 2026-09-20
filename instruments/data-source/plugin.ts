import manifest from "./instrument.json" with { type: "json" };
import { DataSourceConfig, DataSourceEngine } from "./src/data_source.ts";
import {
  createHandler,
  type Instrument,
  type Schema,
  start,
} from "./plugin_http.ts";

export function createPlugin() {
  const engine = new DataSourceEngine();

  const instrument: Instrument = {
    id: manifest.id,
    configuration: manifest.configuration as unknown as Schema,
    state() {
      return engine.getState();
    },
    async configure(config) {
      await engine.configure(config as unknown as Partial<DataSourceConfig>);
    },
    command(command) {
      return engine.executeScpi(command);
    },
    async reset() {
      await engine.reset();
    },
  };

  return createHandler(instrument, new URL("./", import.meta.url));
}

export const handler = createPlugin();
if (import.meta.main) start(handler);
