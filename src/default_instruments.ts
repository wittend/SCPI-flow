/**
 * Default embedded instruments metadata and seeding logic.
 */

export const DEFAULT_INSTRUMENT_FILES: string[] = [
  // oscilloscope
  "instruments/oscilloscope/instrument.json",
  "instruments/oscilloscope/index.html",
  "instruments/oscilloscope/assets/icons/oscilloscope.svg",
  "instruments/oscilloscope/plugin.ts",
  "instruments/oscilloscope/plugin_http.ts",
  "instruments/oscilloscope/scpi_bridge.ts",
  "instruments/oscilloscope/python_mcp/scpi_bridge.py",
  "instruments/oscilloscope/src/cli.ts",
  "instruments/oscilloscope/src/measurements.ts",
  "instruments/oscilloscope/src/oscilloscope.ts",
  "instruments/oscilloscope/src/scpi_engine.ts",
  "instruments/oscilloscope/src/signal_generator.ts",
  "instruments/oscilloscope/deno.json",

  // multimeter
  "instruments/multimeter/instrument.json",
  "instruments/multimeter/index.html",
  "instruments/multimeter/plugin-ui/index.html",
  "instruments/multimeter/assets/icons/multimeter.svg",
  "instruments/multimeter/plugin.ts",
  "instruments/multimeter/plugin_http.ts",
  "instruments/multimeter/scpi_bridge.ts",
  "instruments/multimeter/src/cli.ts",
  "instruments/multimeter/src/multimeter.ts",
  "instruments/multimeter/src/scpi_engine.ts",
  "instruments/multimeter/deno.json",

  // signal-generator
  "instruments/signal-generator/instrument.json",
  "instruments/signal-generator/index.html",
  "instruments/signal-generator/assets/icons/generator.svg",
  "instruments/signal-generator/plugin.ts",
  "instruments/signal-generator/plugin_http.ts",
  "instruments/signal-generator/src/signal_generator.ts",
  "instruments/signal-generator/deno.json",
];

export async function ensureDefaultInstruments(
  dataDir: string,
  options?: { force?: boolean },
): Promise<void> {
  const rootUrl = new URL("../", import.meta.url);
  for (const relPath of DEFAULT_INSTRUMENT_FILES) {
    const targetPath = `${dataDir}/${relPath}`;
    if (!options?.force) {
      try {
        await Deno.stat(targetPath);
        continue;
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          // Continue if already exists or stat failed
        }
      }
    }
    try {
      const sourceUrl = new URL(relPath, rootUrl);
      const data = await Deno.readFile(sourceUrl);
      const lastSlash = targetPath.lastIndexOf("/");
      if (lastSlash > 0) {
        await Deno.mkdir(targetPath.slice(0, lastSlash), { recursive: true });
      }
      await Deno.writeFile(targetPath, data);
    } catch {
      // Non-fatal if source file cannot be read in current execution environment
    }
  }
}
