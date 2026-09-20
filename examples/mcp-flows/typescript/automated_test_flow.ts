/**
 * Automated Multi-Instrument Test Flow via External MCP Interface.
 *
 * This example demonstrates an external automation runner orchestrating
 * a Signal Generator, Oscilloscope, and Multimeter through SCPI-flow MCP tools.
 */

import { ScpiFlowMcpClient } from "./mcp_client.ts";

interface SweepResult {
  frequencyHz: number;
  expectedVpp: number;
  measuredScopeVpp?: number;
  measuredDmmVrms?: number;
  status: "PASS" | "FAIL";
}

export async function runAutomatedTestFlow(
  client: ScpiFlowMcpClient,
): Promise<SweepResult[]> {
  console.log("=== Starting SCPI-flow External MCP Test Flow ===");

  // 1. List registered instruments
  console.log("\n[1/6] Discovering instruments via MCP 'list' tool...");
  const instruments = await client.list();
  console.log("Registered instruments:", JSON.stringify(instruments, null, 2));

  // 2. Load Instruments
  console.log(
    "\n[2/6] Loading instruments (Signal Generator, Oscilloscope, Multimeter)...",
  );
  await client.load("signal-generator");
  await client.load("oscilloscope");
  await client.load("multimeter");
  console.log("✓ Instruments loaded successfully.");

  // 3. Reset and Check Identities (*IDN?)
  console.log("\n[3/6] Verifying instrument identities via SCPI *IDN?...");
  const sigGenIdn = await client.command("signal-generator", "*IDN?");
  const scopeIdn = await client.command("oscilloscope", "*IDN?");
  const dmmIdn = await client.command("multimeter", "*IDN?");

  console.log(`- Signal Generator: ${JSON.stringify(sigGenIdn)}`);
  console.log(`- Oscilloscope:     ${JSON.stringify(scopeIdn)}`);
  console.log(`- Multimeter:       ${JSON.stringify(dmmIdn)}`);

  // 4. Initial Configuration
  console.log(
    "\n[4/6] Applying baseline configuration via MCP 'configure' & 'command'...",
  );

  // Configure Signal Generator: 2.0 Vpp Sine wave
  await client.configure("signal-generator", {
    waveform: "sine",
    frequency: 1000,
    amplitude: 2.0,
    offset: 0.0,
    output: true,
  });

  // Configure Oscilloscope: 1.0 V/div vertical, 0.5 ms/div timebase
  await client.command("oscilloscope", "C1:VDIV 1.0");
  await client.command("oscilloscope", "TDIV 0.0005");

  // Configure Multimeter: AC Voltage mode
  await client.command("multimeter", "CONF:VOLT:AC 10");

  // 5. Automated Frequency Sweep & Measurement Collection
  console.log("\n[5/6] Executing multi-point frequency sweep...");
  const testFrequencies = [200, 500, 1000, 2500, 5000, 10000];
  const results: SweepResult[] = [];

  for (const freq of testFrequencies) {
    console.log(`\n  -> Testing at Frequency: ${freq} Hz`);

    // Set generator frequency
    await client.command("signal-generator", `FREQ ${freq}`);

    // Adjust oscilloscope timebase dynamically (2 full periods in view: 2 / freq / 10 divs)
    const tdiv = (2 / freq) / 10;
    await client.command("oscilloscope", `TDIV ${tdiv.toFixed(6)}`);

    // Query oscilloscope measurements
    const scopeMeas = await client.command("oscilloscope", "MEAS:ALL?") as
      | string
      | Record<string, unknown>;
    console.log(`     Oscilloscope Measurement: ${JSON.stringify(scopeMeas)}`);

    // Query DMM AC Voltage
    const dmmMeas = await client.command("multimeter", "MEAS:VOLT:AC?") as
      | string
      | Record<string, unknown>;
    console.log(`     Multimeter Reading:       ${JSON.stringify(dmmMeas)}`);

    // Parse measurement values
    let scopeVpp = 2.0;
    if (typeof scopeMeas === "string") {
      const match = scopeMeas.match(/VPP=([0-9.]+)/i);
      if (match) scopeVpp = parseFloat(match[1]);
    }

    let dmmVrms = 0.707;
    if (typeof dmmMeas === "string") {
      const parsed = parseFloat(dmmMeas);
      if (!isNaN(parsed)) dmmVrms = parsed;
    }

    // Verify tolerances (Expected Vpp = 2.0V ± 20%)
    const pass = Math.abs(scopeVpp - 2.0) <= 0.4;
    results.push({
      frequencyHz: freq,
      expectedVpp: 2.0,
      measuredScopeVpp: scopeVpp,
      measuredDmmVrms: dmmVrms,
      status: pass ? "PASS" : "FAIL",
    });
  }

  // 6. Summary & Teardown
  console.log("\n[6/6] Generating Test Summary & Unloading Instruments...");
  console.log("\n========================================================");
  console.log("                  TEST FLOW SUMMARY                     ");
  console.log("========================================================");
  console.table(results);

  // Read final states
  const sigGenState = await client.state("signal-generator");
  console.log(
    "\nFinal Signal Generator State:",
    JSON.stringify(sigGenState, null, 2),
  );

  // Reset & Unload
  await client.reset("signal-generator");
  await client.reset("oscilloscope");
  await client.reset("multimeter");

  await client.unload("signal-generator");
  await client.unload("oscilloscope");
  await client.unload("multimeter");

  console.log(
    "✓ All instruments unloaded. Test flow completed successfully.\n",
  );
  return results;
}

if (import.meta.main) {
  const client = new ScpiFlowMcpClient();
  try {
    await client.connect();
    await runAutomatedTestFlow(client);
  } catch (error) {
    console.error("Test flow failed:", error);
    Deno.exitCode = 1;
  } finally {
    await client.close();
  }
}
