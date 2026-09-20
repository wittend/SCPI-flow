/**
 * Simulated AI Agent Loop using External MCP Flow.
 *
 * Demonstrates how an AI Assistant or Autonomous Agent interacts with
 * instruments via MCP tools: discovering capabilities, diagnosing
 * waveform distortion / clipping, and applying corrective configurations.
 */

import { ScpiFlowMcpClient } from "./mcp_client.ts";

export async function runAgentDiagnosticLoop(client: ScpiFlowMcpClient) {
  console.log("=== AI Agent Diagnostic & Auto-Calibration Flow ===");

  // Agent Goal: Set up a 5Vpp 10kHz test signal and verify it is not clipped on the scope.

  console.log("\n[Agent]: Discovering available lab instruments...");
  const instrumentList = await client.list();
  console.log(
    "[Agent]: Available instruments discovered:",
    Object.keys(instrumentList as object),
  );

  console.log("\n[Agent]: Loading Signal Generator and Oscilloscope...");
  await client.load("signal-generator");
  await client.load("oscilloscope");

  console.log("\n[Agent]: Applying test signal: Sine wave, 10 kHz, 5.0 Vpp...");
  await client.configure("signal-generator", {
    waveform: "sine",
    frequency: 10000,
    amplitude: 5.0,
    offset: 0.0,
    output: true,
  });

  console.log("\n[Agent]: Inspecting initial oscilloscope scaling...");
  // Oscilloscope vertical scale might initially be too small (0.2 V/div = 1.6V screen range -> clipping)
  await client.command("oscilloscope", "C1:VDIV 0.2");
  await client.command("oscilloscope", "TDIV 0.00005");

  console.log("\n[Agent]: Querying oscilloscope state & measurements...");
  const initialScopeState = await client.state("oscilloscope") as Record<
    string,
    unknown
  >;
  console.log("[Agent]: Initial State:", JSON.stringify(initialScopeState));
  const meas = await client.command("oscilloscope", "MEAS:ALL?") as
    | string
    | Record<string, unknown>;
  console.log("[Agent]: Initial Measurements:", JSON.stringify(meas));

  console.log("\n[Agent Diagnostic]: Analyzing signal vs vertical range...");
  console.log(
    "[Agent Reasoning]: 5.0 Vpp signal requires at least 5.0V / 8 divs = 0.625 V/div to avoid clipping.",
  );
  console.log(
    "[Agent Decision]: Adjusting Channel 1 VDIV to 1.0 V/div and Timebase to 20 µs/div.",
  );

  // Corrective action
  await client.command("oscilloscope", "C1:VDIV 1.0");
  await client.command("oscilloscope", "TDIV 0.00002");

  console.log("\n[Agent]: Re-evaluating measurements after auto-correction...");
  const correctedMeas = await client.command("oscilloscope", "MEAS:ALL?");
  console.log("[Agent]: Verified Measurements:", JSON.stringify(correctedMeas));

  console.log("\n[Agent]: Telemetry verification complete. Tearing down...");
  await client.unload("signal-generator");
  await client.unload("oscilloscope");
  console.log("✓ Agent flow finished successfully.");
}

if (import.meta.main) {
  const client = new ScpiFlowMcpClient();
  try {
    await client.connect();
    await runAgentDiagnosticLoop(client);
  } catch (err) {
    console.error("Agent flow error:", err);
    Deno.exitCode = 1;
  } finally {
    await client.close();
  }
}
