import { createMcpHandler } from "../src/mcp.ts";
import { ScpiFlowMcpClient } from "../examples/mcp-flows/typescript/mcp_client.ts";
import { runAutomatedTestFlow } from "../examples/mcp-flows/typescript/automated_test_flow.ts";
import {
  DeclarativeFlowRunner,
  type FlowDefinition,
} from "../examples/mcp-flows/typescript/declarative_flow_runner.ts";
import { runAgentDiagnosticLoop } from "../examples/mcp-flows/typescript/interactive_agent_flow.ts";

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

/**
 * Creates a mock MCP client wired directly to in-memory instrument handlers.
 */
async function createMockClient() {
  const instruments: Record<
    string,
    { loaded: boolean; config: Record<string, unknown> }
  > = {
    "signal-generator": { loaded: false, config: {} },
    "oscilloscope": { loaded: false, config: {} },
    "multimeter": { loaded: false, config: {} },
  };

  const handler = createMcpHandler((operation, args) => {
    switch (operation) {
      case "list":
        return Promise.resolve(instruments);
      case "load": {
        const id = String(args.id);
        if (!instruments[id]) {
          return Promise.reject(new Error(`Instrument ${id} not found`));
        }
        instruments[id].loaded = true;
        return Promise.resolve({ loaded: true, id });
      }
      case "unload": {
        const id = String(args.id);
        if (!instruments[id]) {
          return Promise.reject(new Error(`Instrument ${id} not found`));
        }
        instruments[id].loaded = false;
        return Promise.resolve({ loaded: false, id });
      }
      case "state": {
        const id = String(args.id);
        return Promise.resolve({
          id,
          loaded: instruments[id]?.loaded ?? false,
          config: instruments[id]?.config ?? {},
        });
      }
      case "configure": {
        const id = String(args.id);
        instruments[id].config = {
          ...instruments[id].config,
          ...(args.configuration as object),
        };
        return Promise.resolve({ configured: true });
      }
      case "command": {
        const id = String(args.id);
        const cmd = String(args.command);
        if (cmd === "*IDN?") {
          return Promise.resolve(`${id.toUpperCase()} Sim 1.0.0`);
        }
        if (cmd === "MEAS:ALL?") {
          return Promise.resolve(
            "VPP=2.000000;FREQ=1000.000000;VAVG=0.000000;VRMS=0.707106",
          );
        }
        if (cmd.startsWith("MEAS:VOLT:AC?")) {
          return Promise.resolve("0.707106");
        }
        if (cmd.startsWith("MEAS:VOLT:DC?")) {
          return Promise.resolve("1.000000");
        }
        if (cmd.startsWith("CALC:AVER:")) {
          return Promise.resolve("0.707106");
        }
        if (cmd.startsWith("MEAS:RES?")) {
          return Promise.resolve("9999.8");
        }
        return Promise.resolve("OK");
      }
      case "reset": {
        const id = String(args.id);
        if (instruments[id]) instruments[id].config = {};
        return Promise.resolve({ reset: true });
      }
      default:
        return Promise.reject(new Error(`Unknown operation: ${operation}`));
    }
  });

  // Create an ScpiFlowMcpClient with in-memory routing
  const client = new ScpiFlowMcpClient();

  // Override sendRequest to route directly to handler
  (client as unknown as Record<string, unknown>).sendRequest = async (
    method: string,
    params?: unknown,
  ) => {
    const response = await handler({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });
    if (response && !Array.isArray(response) && response.result) {
      return response.result;
    }
    if (response && !Array.isArray(response) && response.error) {
      throw new Error(response.error.message);
    }
    return null;
  };

  (client as unknown as Record<string, unknown>).sendNotification = async (
    method: string,
    params?: unknown,
  ) => {
    await handler({
      jsonrpc: "2.0",
      method,
      params,
    });
  };
  (client as unknown as Record<string, unknown>).close = () =>
    Promise.resolve();

  // Perform handshake
  await (client as unknown as {
    sendRequest: (m: string, p: unknown) => Promise<unknown>;
  }).sendRequest("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  });
  await (client as unknown as {
    sendNotification: (m: string, p: unknown) => Promise<unknown>;
  }).sendNotification("notifications/initialized", {});

  return client;
}

Deno.test("External MCP Flow - Automated Multi-Instrument Test Flow", async () => {
  const client = await createMockClient();
  const results = await runAutomatedTestFlow(client);

  assert(results.length === 6, "Expected 6 frequency sweep points");
  for (const r of results) {
    assertEquals(r.status, "PASS");
    assertEquals(r.expectedVpp, 2.0);
    assertEquals(r.measuredScopeVpp, 2.0);
  }
});

Deno.test("External MCP Flow - Declarative JSON Flow Runner (Frequency Sweep)", async () => {
  const client = await createMockClient();
  const flowUrl = new URL(
    "../examples/mcp-flows/flows/frequency_response_sweep.json",
    import.meta.url,
  );
  const flowContent = await Deno.readTextFile(flowUrl);
  const flow: FlowDefinition = JSON.parse(flowContent);

  const runner = new DeclarativeFlowRunner(client);
  const captures = await runner.executeFlow(flow);

  assert(captures.has("scope_100hz"), "Expected capture scope_100hz");
  assert(captures.has("dmm_100hz"), "Expected capture dmm_100hz");
  assert(captures.has("scope_1khz"), "Expected capture scope_1khz");
  assert(captures.has("dmm_1khz"), "Expected capture dmm_1khz");
  assert(captures.has("scope_10khz"), "Expected capture scope_10khz");
  assert(captures.has("dmm_10khz"), "Expected capture dmm_10khz");
});

Deno.test("External MCP Flow - Declarative JSON Flow Runner (Multi-Instrument Coordination)", async () => {
  const client = await createMockClient();
  const flowUrl = new URL(
    "../examples/mcp-flows/flows/multi_instrument_coordination.json",
    import.meta.url,
  );
  const flowContent = await Deno.readTextFile(flowUrl);
  const flow: FlowDefinition = JSON.parse(flowContent);

  const runner = new DeclarativeFlowRunner(client);
  const captures = await runner.executeFlow(flow);

  assert(captures.has("sine_scope_metrics"));
  assert(captures.has("sine_dmm_acv"));
  assert(captures.has("square_scope_metrics"));
  assert(captures.has("square_dmm_dcv"));
  assert(captures.has("siggen_final_state"));
});

Deno.test("External MCP Flow - Declarative JSON Flow Runner (DMM Characterization)", async () => {
  const client = await createMockClient();
  const flowUrl = new URL(
    "../examples/mcp-flows/flows/dmm_voltage_characterization.json",
    import.meta.url,
  );
  const flowContent = await Deno.readTextFile(flowUrl);
  const flow: FlowDefinition = JSON.parse(flowContent);

  const runner = new DeclarativeFlowRunner(client);
  const captures = await runner.executeFlow(flow);

  assert(captures.has("dcv_reading"));
  assert(captures.has("acv_reading"));
  assert(captures.has("res_reading"));
});

Deno.test("External MCP Flow - Interactive AI Agent Loop", async () => {
  const client = await createMockClient();
  await runAgentDiagnosticLoop(client);
});
