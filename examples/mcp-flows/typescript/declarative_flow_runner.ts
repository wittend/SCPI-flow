/**
 * Generic Declarative Flow Runner for SCPI-flow MCP JSON Definitions.
 *
 * Reads a JSON flow definition containing setup, steps, and teardown
 * actions, executes them sequentially using the MCP client, and logs results.
 */

import { ScpiFlowMcpClient } from "./mcp_client.ts";

export interface FlowAction {
  tool: string;
  args?: Record<string, unknown>;
  capture?: string;
}

export interface FlowStep {
  name: string;
  actions: FlowAction[];
}

export interface FlowDefinition {
  name: string;
  description?: string;
  version?: string;
  instruments?: string[];
  setup?: FlowAction[];
  steps: FlowStep[];
  teardown?: FlowAction[];
}

export class DeclarativeFlowRunner {
  private captures: Map<string, unknown> = new Map();

  constructor(private client: ScpiFlowMcpClient) {}

  async executeFlow(flow: FlowDefinition): Promise<Map<string, unknown>> {
    console.log(`\n======================================================`);
    console.log(`Executing Flow: ${flow.name}`);
    if (flow.description) console.log(`Description:    ${flow.description}`);
    console.log(`======================================================`);

    // 1. Setup Phase
    if (flow.setup && flow.setup.length > 0) {
      console.log("\n--- [Phase 1/3] Setup ---");
      for (const action of flow.setup) {
        await this.executeAction(action);
      }
    }

    // 2. Steps Phase
    console.log("\n--- [Phase 2/3] Executing Steps ---");
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      console.log(`\nStep ${i + 1}/${flow.steps.length}: ${step.name}`);
      for (const action of step.actions) {
        await this.executeAction(action);
      }
    }

    // 3. Teardown Phase
    if (flow.teardown && flow.teardown.length > 0) {
      console.log("\n--- [Phase 3/3] Teardown ---");
      for (const action of flow.teardown) {
        try {
          await this.executeAction(action);
        } catch (err) {
          console.warn(`Teardown warning:`, err);
        }
      }
    }

    console.log("\n======================================================");
    console.log("Flow Execution Completed Successfully!");
    console.log("Captured Data Telemetry:");
    for (const [key, val] of this.captures.entries()) {
      console.log(`  - ${key}: ${JSON.stringify(val)}`);
    }
    console.log("======================================================\n");

    return this.captures;
  }

  private async executeAction(action: FlowAction): Promise<unknown> {
    const args = action.args ?? {};
    console.log(`  > Tool: ${action.tool} | Args: ${JSON.stringify(args)}`);

    const result = await this.client.callTool(action.tool, args);

    if (action.capture) {
      this.captures.set(action.capture, result);
      console.log(
        `    [Captured '${action.capture}']: ${JSON.stringify(result)}`,
      );
    } else if (result !== null && result !== undefined) {
      console.log(`    [Result]: ${JSON.stringify(result)}`);
    }

    return result;
  }
}

if (import.meta.main) {
  const flowPath = Deno.args[0] ||
    new URL("../flows/frequency_response_sweep.json", import.meta.url).pathname;

  console.log(`Loading flow from: ${flowPath}`);
  const flowContent = await Deno.readTextFile(flowPath);
  const flow: FlowDefinition = JSON.parse(flowContent);

  const client = new ScpiFlowMcpClient();
  try {
    await client.connect();
    const runner = new DeclarativeFlowRunner(client);
    await runner.executeFlow(flow);
  } catch (error) {
    console.error("Flow execution failed:", error);
    Deno.exitCode = 1;
  } finally {
    await client.close();
  }
}
