import { assertEquals } from "@std/assert";
import { handler } from "./main.ts";

Deno.test("API /api/palette returns palette data", async () => {
  const req = new Request("http://localhost:8000/api/palette");
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  const data = await resp.json();
  assertEquals(Array.isArray(data), true);
  assertEquals(data.length >= 2, true);
  assertEquals(data[0].name, "Oscilloscope");
  assertEquals(data[1].name, "Signal Generator");
});

Deno.test("API /api/obj/:guid returns object definition", async () => {
  const guid = "c7b3b9a1-1234-4567-8901-234567890abc";
  const req = new Request(`http://localhost:8000/api/obj/${guid}`);
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  const data = await resp.json();
  assertEquals(data.code.includes("Oscilloscope"), true);
});

Deno.test("API /api/projects/:name handles GET and POST", async () => {
  const prjName = "test-project-flow";
  const prjData = { objects: [], connections: [] };

  // Test POST (Save)
  const postReq = new Request(`http://localhost:8000/api/projects/${prjName}`, {
    method: "POST",
    body: JSON.stringify(prjData),
    headers: { "content-type": "application/json" },
  });
  const postResp = await handler(postReq);
  assertEquals(postResp.status, 200);
  const postResJson = await postResp.json();
  assertEquals(postResJson.success, true);

  // Test GET (Load)
  const getReq = new Request(`http://localhost:8000/api/projects/${prjName}`);
  const getResp = await handler(getReq);
  assertEquals(getResp.status, 200);
  const getData = await getResp.json();
  assertEquals(getData.objects.length, 0);

  // Cleanup
  try {
    await Deno.remove(`./projects/${prjName}_prj.json`);
  } catch {
    // Ignore if not present
  }
});

Deno.test("API /api/scpi/resources returns simulated and available resources", async () => {
  const req = new Request("http://localhost:8000/api/scpi/resources");
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  const data = await resp.json();
  assertEquals(data.status, "success");
  assertEquals(data.resources.includes("SIM::OSCILLOSCOPE::SDS1000X"), true);
});

Deno.test("API /api/scpi/query and write handles SCPI commands", async () => {
  // Query *IDN?
  const queryReq = new Request("http://localhost:8000/api/scpi/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resource: "SIM::OSCILLOSCOPE::SDS1000X",
      query: "*IDN?",
    }),
  });
  const queryResp = await handler(queryReq);
  assertEquals(queryResp.status, 200);
  const queryData = await queryResp.json();
  assertEquals(queryData.status, "success");
  assertEquals(queryData.response.includes("Siglent"), true);

  // Write C1:VDIV 2.0
  const writeReq = new Request("http://localhost:8000/api/scpi/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resource: "SIM::OSCILLOSCOPE::SDS1000X",
      write: "C1:VDIV 2.0",
    }),
  });
  const writeResp = await handler(writeReq);
  assertEquals(writeResp.status, 200);
});

Deno.test("API /api/scope/frame and /api/scope/measurements return oscilloscope state", async () => {
  const frameReq = new Request("http://localhost:8000/api/scope/frame");
  const frameResp = await handler(frameReq);
  assertEquals(frameResp.status, 200);
  const frameData = await frameResp.json();
  assertEquals(frameData.timebase !== undefined, true);
  assertEquals(frameData.ch1 !== undefined, true);
  assertEquals(frameData.ch2 !== undefined, true);

  const measReq = new Request("http://localhost:8000/api/scope/measurements");
  const measResp = await handler(measReq);
  assertEquals(measResp.status, 200);
  const measData = await measResp.json();
  assertEquals(measData.ch1.vpp !== undefined, true);
  assertEquals(measData.ch2.vpp !== undefined, true);
});

Deno.test("API /api/scope/command executes direct SCPI commands", async () => {
  const cmdReq = new Request("http://localhost:8000/api/scope/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: "*IDN?" }),
  });
  const cmdResp = await handler(cmdReq);
  assertEquals(cmdResp.status, 200);
  const cmdData = await cmdResp.json();
  assertEquals(cmdData.success, true);
  assertEquals(cmdData.response.includes("Siglent"), true);
});

Deno.test("Static file serving works for index.html and presents dataflow tab leftmost and active with all instrument tabs", async () => {
  const req = new Request("http://localhost:8000/index.html");
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type")?.includes("text/html"), true);
  const html = await resp.text();

  // Verify tab order: tab-flow should appear before tab-scope, tab-dmm, tab-gen
  const tabFlowIndex = html.indexOf('id="tab-flow"');
  const tabScopeIndex = html.indexOf('id="tab-scope"');
  const tabDmmIndex = html.indexOf('id="tab-dmm"');
  const tabGenIndex = html.indexOf('id="tab-gen"');

  assertEquals(tabFlowIndex !== -1, true);
  assertEquals(tabScopeIndex !== -1, true);
  assertEquals(tabDmmIndex !== -1, true);
  assertEquals(tabGenIndex !== -1, true);

  assertEquals(tabFlowIndex < tabScopeIndex, true);
  assertEquals(tabScopeIndex < tabDmmIndex, true);
  assertEquals(tabDmmIndex < tabGenIndex, true);

  // Verify view panels exist
  assertEquals(html.includes('id="view-flow" class="view-panel active"'), true);
  assertEquals(html.includes('id="view-scope" class="view-panel"'), true);
  assertEquals(html.includes('id="view-dmm" class="view-panel"'), true);
  assertEquals(html.includes('id="view-gen" class="view-panel"'), true);

  // Verify default active state is Data Flow Canvas
  assertEquals(
    html.includes('class="tab-btn active"\n        id="tab-flow"'),
    true,
  );
});

Deno.test("API /api/dmm/reading and /api/dmm/config return and configure multimeter state", async () => {
  const readReq = new Request("http://localhost:8000/api/dmm/reading");
  const readResp = await handler(readReq);
  assertEquals(readResp.status, 200);
  const readData = await readResp.json();
  assertEquals(readData.success, true);
  assertEquals(readData.reading !== undefined, true);
  assertEquals(readData.function !== undefined, true);

  const confReq = new Request("http://localhost:8000/api/dmm/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function: "RES", speed: "FAST" }),
  });
  const confResp = await handler(confReq);
  assertEquals(confResp.status, 200);
  const confData = await confResp.json();
  assertEquals(confData.success, true);

  const inReq = new Request("http://localhost:8000/api/dmm/input", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resistance: 4700 }),
  });
  const inResp = await handler(inReq);
  assertEquals(inResp.status, 200);
  const inData = await inResp.json();
  assertEquals(inData.success, true);
  assertEquals(inData.input.resistance, 4700);

  const resetReq = new Request("http://localhost:8000/api/dmm/reset", {
    method: "POST",
  });
  const resetResp = await handler(resetReq);
  assertEquals(resetResp.status, 200);
  const resetData = await resetResp.json();
  assertEquals(resetData.success, true);
});

Deno.test("API /api/gen/state and /api/gen/preview control signal generator", async () => {
  const stateReq = new Request("http://localhost:8000/api/gen/state");
  const stateResp = await handler(stateReq);
  assertEquals(stateResp.status, 200);
  const stateData = await stateResp.json();
  assertEquals(stateData.frequency !== undefined, true);
  assertEquals(stateData.amplitude !== undefined, true);

  const setReq = new Request("http://localhost:8000/api/gen/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "triangle", frequency: 2500, amplitude: 3.0 }),
  });
  const setResp = await handler(setReq);
  assertEquals(setResp.status, 200);
  const setData = await setResp.json();
  assertEquals(setData.success, true);

  const prevReq = new Request("http://localhost:8000/api/gen/preview");
  const prevResp = await handler(prevReq);
  assertEquals(prevResp.status, 200);
  const prevData = await prevResp.json();
  assertEquals(prevData.type, "triangle");
  assertEquals(prevData.frequency, 2500);
  assertEquals(Array.isArray(prevData.voltage), true);
  assertEquals(prevData.voltage.length > 0, true);
});
