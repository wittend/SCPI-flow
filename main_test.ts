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

Deno.test("Static file serving works for index.html", async () => {
  const req = new Request("http://localhost:8000/index.html");
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type")?.includes("text/html"), true);
  await resp.text(); // Consume body to close file handle properly
});
