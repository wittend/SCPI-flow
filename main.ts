import { startShell } from "./src/shell_server.ts";

export { createHandler } from "./src/shell_server.ts";
export { PluginRegistry } from "./src/plugin_registry.ts";

if (import.meta.main) await startShell();
