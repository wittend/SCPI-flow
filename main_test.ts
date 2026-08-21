import { assertEquals } from "jsr:@std/assert";
import { handler } from "./main.ts";

Deno.test("API /api/palette returns palette data", async () => {
  const req = new Request("http://localhost:8000/api/palette");
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  const data = await resp.json();
  assertEquals(Array.isArray(data), true);
  assertEquals(data[0].name, "Oscilloscope");
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
  const prjName = "test-project";
  const prjData = { objects: [], connections: [] };

  // Test POST (Save)
  const postReq = new Request(`http://localhost:8000/api/projects/${prjName}`, {
    method: "POST",
    body: JSON.stringify(prjData),
    headers: { "content-type": "application/json" }
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
  await Deno.remove(`./projects/${prjName}_prj.json`);
});

Deno.test("SCPI API endpoints exist", async () => {
  const req = new Request("http://localhost:8000/api/scpi/resources");
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

Deno.test("Static file serving works", async () => {
  const req = new Request("http://localhost:8000/index.html");
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type")?.includes("text/html"), true);
});
