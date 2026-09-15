import { PluginRegistry } from "../src/plugin_registry.ts";
import { createHandler } from "../src/shell_server.ts";
import { createMcpHandler } from "../src/mcp.ts";

const registry = new PluginRegistry(
  new URL("../instruments.json", import.meta.url).pathname,
);
await registry.initialize();
const handler = createHandler(registry);
try {
  const catalog = registry.list();
  if (!catalog.length) {
    throw new Error("Integration check requires registered instruments");
  }
  for (const info of catalog) {
    if (!info.manifest || info.status !== "unloaded") {
      throw new Error(`Unavailable instrument: ${info.id}: ${info.error}`);
    }
    await registry.load(info.id);
    const result = await registry.command(info.id, "*IDN?") as {
      response: string;
    };
    if (typeof result.response !== "string" || !result.response.length) {
      throw new Error(`Missing identity: ${info.id}`);
    }
    await registry.state(info.id);
    await registry.configure(info.id, {});
    const page = await handler(
      new Request(
        `http://localhost/plugins/${info.id}/${info.manifest.frontend}`,
      ),
    );
    if (!page.ok || !(await page.text()).includes("<html")) {
      throw new Error(`Missing front panel: ${info.id}`);
    }
    if (!(await registry.icon(info.id)).byteLength) {
      throw new Error(`Missing icon: ${info.id}`);
    }
    await registry.reset(info.id);
    console.log(
      `PASS ${info.id}: process, identity, state, configuration, front panel, icon, reset`,
    );
  }
  const mcp = createMcpHandler(async (operation, args) => {
    if (operation === "list") return registry.list();
    if (operation === "command") {
      return await registry.command(String(args.id), String(args.command));
    }
    throw new Error(`Unexpected integration operation: ${operation}`);
  });
  await mcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "integration-check", version: "1.0.0" },
    },
  });
  await mcp({ jsonrpc: "2.0", method: "notifications/initialized" });
  const identity = await mcp({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "command",
      arguments: { id: catalog[0].id, command: "*IDN?" },
    },
  });
  if (
    JSON.stringify(identity).includes('"isError":true') ||
    !JSON.stringify(identity).includes("response")
  ) throw new Error("MCP did not reach the loaded instrument");
  for (const info of catalog) await registry.unload(info.id);
  if (registry.list().some((info) => info.status !== "unloaded")) {
    throw new Error("Instrument failed to unload");
  }
  console.log("PASS shared MCP instrument state and complete process cleanup");
} finally {
  await registry.close();
}
