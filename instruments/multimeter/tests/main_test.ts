import { assertEquals } from "@std/assert";
import { handler } from "../main.ts";

Deno.test("HTTP API - GET /api/dmm/reading", async () => {
  const req = new Request("http://localhost:8000/api/dmm/reading");
  const res = await handler(req);
  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.function, "VOLT:DC");
  assertEquals(typeof data.reading.value, "number");
});

Deno.test("HTTP API - POST /api/dmm/command", async () => {
  const req = new Request("http://localhost:8000/api/dmm/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: "*IDN?" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.response.includes("SDM3045X"), true);
});

Deno.test("HTTP API - POST /api/dmm/input", async () => {
  const req = new Request("http://localhost:8000/api/dmm/input", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dcVoltage: 9.876 }),
  });
  const res = await handler(req);
  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.input.dcVoltage, 9.876);
});

Deno.test("HTTP API - POST /api/dmm/frontpanel", async () => {
  const req = new Request("http://localhost:8000/api/dmm/frontpanel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ button: "ACV" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.function, "VOLT:AC");
});

Deno.test("HTTP API - SCPI Bridge API", async () => {
  // Resources
  const reqRes = new Request("http://localhost:8000/api/scpi/resources");
  const resRes = await handler(reqRes);
  assertEquals(resRes.status, 200);

  // Query
  const reqQuery = new Request("http://localhost:8000/api/scpi/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resource: "SIM::MULTIMETER::SDM3045X",
      query: "*IDN?",
    }),
  });
  const resQuery = await handler(reqQuery);
  assertEquals(resQuery.status, 200);
  const dataQuery = await resQuery.json();
  assertEquals(dataQuery.response.includes("SDM3045X"), true);
});
