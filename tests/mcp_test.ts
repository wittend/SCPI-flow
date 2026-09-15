import {
  createMcpHandler,
  type McpHandler,
  type McpReply,
  type McpResponse,
} from "../src/mcp.ts";
import {
  createHttpInstrumentCall,
  parseMcpUrl,
  runMcpStdio,
} from "../src/mcp_cli.ts";

// Keep this suite runnable with --no-config and no dependency cache.
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

function reply(value: McpResponse | null): McpReply {
  assert(value !== null && !Array.isArray(value));
  assertEquals(value.jsonrpc, "2.0");
  assert(Object.hasOwn(value, "result") !== Object.hasOwn(value, "error"));
  return value;
}

function result(value: McpResponse | null): Record<string, unknown> {
  const response = reply(value);
  assert(response.result !== undefined, JSON.stringify(response));
  return response.result;
}

function request(method: string, params?: unknown, id: string | number = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    ...(params === undefined ? {} : { params }),
  };
}

function initialize(protocolVersion = "2025-06-18") {
  return request("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "offline-test", version: "1.0.0" },
  });
}

const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };

async function ready(handler: McpHandler, version = "2025-06-18") {
  result(await handler(initialize(version)));
  assertEquals(await handler(initialized), null);
}

const toolCases: [string, Record<string, unknown>][] = [
  ["list", {}],
  ["register", { path: "obj/µ instrument.json" }],
  ["load", { id: "scope" }],
  ["unload", { id: "scope" }],
  ["state", { id: "scope" }],
  ["configure", { id: "scope", configuration: { volts: 2, channels: [1, 2] } }],
  ["command", { id: "scope", command: "*IDN?\nµ 🔬" }],
  ["reset", { id: "scope" }],
];

Deno.test("MCP negotiates supported versions and falls back to the latest supported", async () => {
  for (
    const version of ["2025-06-18", "2025-03-26", "2024-11-05", "2099-01-01"]
  ) {
    const handler = createMcpHandler(() => Promise.resolve(null));
    const response = reply(await handler(initialize(version)));
    assertEquals(response.id, 1);
    assertEquals(response.result, {
      protocolVersion: version === "2099-01-01" ? "2025-06-18" : version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "SCPI-flow", version: "1.0.0" },
    });
    assertEquals(await handler(initialized), null);
    assertEquals(result(await handler(request("ping"))), {});
    assert(Array.isArray(result(await handler(request("tools/list"))).tools));
  }
});

Deno.test("MCP requires a valid initialize request and initialized notification", async () => {
  let calls = 0;
  const handler = createMcpHandler(() => Promise.resolve(++calls));
  assertEquals(result(await handler(request("ping", undefined, 0))), {});
  assertEquals(await handler(initialized), null);
  for (
    const params of [
      undefined,
      {},
      {
        protocolVersion: 42,
        capabilities: {},
        clientInfo: { name: "a", version: "b" },
      },
      { protocolVersion: "2025-06-18", capabilities: [], clientInfo: {} },
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "a" },
      },
    ]
  ) {
    assertEquals(
      reply(await handler(request("initialize", params))).error?.code,
      -32602,
    );
  }
  assertEquals(await handler({ ...initialize(), id: undefined }), {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32600, message: "Invalid Request" },
  });
  assertEquals(
    await handler({
      jsonrpc: "2.0",
      method: "initialize",
      params: initialize().params,
    }),
    null,
  );
  assertEquals(reply(await handler(request("tools/list"))).error?.code, -32002);
  result(await handler(initialize()));
  assertEquals(
    reply(await handler(request("tools/call", { name: "list" }))).error?.code,
    -32002,
  );
  assertEquals(
    reply(await handler(request("notifications/initialized"))).error?.code,
    -32601,
  );
  assertEquals(await handler({ ...initialized, params: [] }), null);
  assertEquals(reply(await handler(request("tools/list"))).error?.code, -32002);
  assertEquals(await handler(initialized), null);
  assertEquals(reply(await handler(initialize())).error?.code, -32600);
  result(await handler(request("tools/list")));
  assertEquals(calls, 0);
});

Deno.test("MCP notifications never reply or invoke instrument operations", async () => {
  let calls = 0;
  const handler = createMcpHandler(() => Promise.resolve(++calls));
  await ready(handler);
  for (
    const method of [
      "ping",
      "tools/list",
      "tools/call",
      "unknown",
      "notifications/cancelled",
      "notifications/initialized",
    ]
  ) {
    for (
      const params of [{ name: "reset", arguments: { id: "scope" } }, null, []]
    ) {
      assertEquals(await handler({ jsonrpc: "2.0", method, params }), null);
    }
  }
  assertEquals(await handler({ jsonrpc: "2.0", id: 9, result: {} }), null);
  assertEquals(
    await handler({
      jsonrpc: "2.0",
      id: 9,
      error: { code: -32601, message: "Unknown" },
    }),
    null,
  );
  assertEquals(calls, 0);
});

Deno.test("MCP tool discovery matches strict schemas and dispatches all eight operations", async () => {
  const calls: unknown[] = [];
  const handler = createMcpHandler((operation, args) => {
    calls.push([operation, args]);
    return Promise.resolve({ operation, args });
  });
  await ready(handler);
  const discovered = result(await handler(request("tools/list", { _meta: {} })))
    .tools as Record<string, unknown>[];
  assertEquals(
    discovered.map((tool) => tool.name),
    toolCases.map(([name]) => name),
  );
  for (const [index, [name, args]] of toolCases.entries()) {
    const tool = discovered[index];
    assert(typeof tool.description === "string" && tool.description.length > 0);
    assertEquals(tool.inputSchema, {
      type: "object",
      properties: Object.fromEntries(
        Object.keys(args).map((key) => [
          key,
          key === "configuration"
            ? { type: "object" }
            : { type: "string", minLength: 1 },
        ]),
      ),
      required: Object.keys(args),
      additionalProperties: false,
    });
    const response = reply(
      await handler(
        request("tools/call", {
          name,
          arguments: args,
          _meta: { progressToken: "p" },
        }, name),
      ),
    );
    assertEquals(response.id, name);
    assertEquals(response.result, {
      content: [{
        type: "text",
        text: JSON.stringify({ operation: name, args }),
      }],
    });
  }
  assertEquals(calls, toolCases);
  result(await handler(request("tools/call", { name: "list" })));
  assertEquals(calls.at(-1), ["list", {}]);
  assertEquals(
    reply(await handler(request("tools/list", { cursor: "invalid" }))).error
      ?.code,
    -32602,
  );
});

Deno.test("MCP rejects invalid and extra tool fields without invoking backend", async () => {
  let calls = 0;
  const handler = createMcpHandler(() => Promise.resolve(++calls));
  await ready(handler);
  for (const [name, args] of toolCases) {
    const invalid: unknown[] = [null, [], "args", 1, {
      ...args,
      unexpected: true,
    }];
    for (const field of Object.keys(args)) {
      const missing = { ...args };
      delete missing[field];
      invalid.push(missing);
      for (
        const value of [
          null,
          [],
          123,
          false,
          ...(field === "configuration" ? ["string"] : ["", {}]),
        ]
      ) {
        invalid.push({ ...args, [field]: value });
      }
    }
    for (const arguments_ of invalid) {
      const response = reply(
        await handler(request("tools/call", { name, arguments: arguments_ })),
      );
      assertEquals(response.error?.code, -32602);
    }
  }
  for (
    const params of [
      {},
      { name: 2 },
      { name: "missing" },
      { name: "toString" },
      { name: "list", extra: true },
      { name: "list", _meta: [] },
      { name: "register" },
      { name: "configure", arguments: { id: "scope" } },
      { name: "reset", arguments: Object.create({ id: "inherited" }) },
      { name: "list", arguments: JSON.parse('{"__proto__":{}}') },
    ]
  ) {
    assertEquals(
      reply(await handler(request("tools/call", params))).error?.code,
      -32602,
    );
  }
  assertEquals(calls, 0);
});

Deno.test("MCP wraps tool execution errors as text content, not JSON-RPC errors", async () => {
  for (const cause of [new Error("Instrument offline"), "Failure"]) {
    const handler = createMcpHandler(() => Promise.reject(cause));
    await ready(handler);
    assertEquals(
      result(await handler(request("tools/call", { name: "list" }))),
      {
        isError: true,
        content: [{
          type: "text",
          text: JSON.stringify({
            error: cause instanceof Error ? cause.message : cause,
          }),
        }],
      },
    );
    assertEquals(result(await handler(request("ping"))), {});
  }
  for (const value of [null, undefined, false, 0, "µ 🔬", [1, 2]]) {
    const handler = createMcpHandler(() => Promise.resolve(value));
    await ready(handler);
    assertEquals(
      result(await handler(request("tools/call", { name: "list" }))),
      {
        content: [{ type: "text", text: JSON.stringify(value ?? null) }],
      },
    );
  }
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const value of [circular, 1n, () => undefined]) {
    const handler = createMcpHandler(() => Promise.resolve(value));
    await ready(handler);
    assertEquals(
      result(await handler(request("tools/call", { name: "list" }))).isError,
      true,
    );
  }
});

Deno.test("MCP invalid requests and methods return standard JSON-RPC errors", async () => {
  const handler = createMcpHandler(() => Promise.resolve(null));
  await ready(handler);
  for (
    const message of [
      null,
      true,
      1,
      "ping",
      {},
      [],
      [request("ping")],
      { id: 1, method: "ping" },
      { jsonrpc: "1.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 1 },
      { jsonrpc: "2.0", id: 1, method: 3 },
      { ...request("ping"), id: null },
      { ...request("ping"), id: [] },
      { ...request("ping"), id: 1.5 },
      { ...request("ping"), result: {} },
      { jsonrpc: "2.0", id: 1, result: {}, error: { code: 1, message: "bad" } },
    ]
  ) assertEquals(reply(await handler(message)).error?.code, -32600);
  for (const params of [null, [], true, 3, "bad"]) {
    const response = reply(
      await handler(request("ping", params, "bad-params")),
    );
    assertEquals(response.id, "bad-params");
    assertEquals(response.error?.code, -32602);
  }
  assertEquals(
    reply(await handler(request("resources/list"))).error?.code,
    -32601,
  );
  assertEquals(reply(await handler(request("ping", undefined, ""))).id, "");
});

Deno.test("MCP March 2025 receives batches, June 2025 rejects them", async () => {
  const handler = createMcpHandler(() => Promise.resolve(null));
  await ready(handler, "2025-03-26");
  const responses = await handler([
    request("ping", undefined, 10),
    initialized,
    request("tools/call", { name: "list" }, 11),
    null,
  ]);
  assert(Array.isArray(responses));
  assertEquals(responses.length, 3);
  assertEquals(responses[0], { jsonrpc: "2.0", id: 10, result: {} });
  assertEquals(responses[1].id, 11);
  assertEquals(responses[2].error?.code, -32600);
  assertEquals(
    await handler([initialized, { jsonrpc: "2.0", method: "unknown" }]),
    null,
  );
  assertEquals(reply(await handler([])).error?.code, -32600);
  const other = createMcpHandler(() => Promise.resolve(null));
  await ready(other);
  assertEquals(reply(await other([request("ping")])).error?.code, -32600);
});

async function transport(
  chunks: Uint8Array[],
  handler: McpHandler,
): Promise<McpReply[]> {
  const output: Uint8Array[] = [];
  await runMcpStdio(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    new WritableStream({
      write(chunk) {
        output.push(chunk);
      },
    }),
    handler,
  );
  const text = await new Blob(output.map((chunk) => new Uint8Array(chunk)))
    .text();
  assert(!text || text.endsWith("\n"));
  return text ? text.trimEnd().split("\n").map((line) => JSON.parse(line)) : [];
}

Deno.test("MCP stdio handles split UTF-8, CRLF, multiple frames, parse recovery and EOF", async () => {
  const messages = [
    initialize(),
    initialized,
    request("tools/call", {
      name: "command",
      arguments: { id: "µ 🔬", command: "line1\nline2" },
    }, "µ 🔬"),
    request("ping", undefined, 9),
  ];
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    messages.map((message) => JSON.stringify(message)).join("\r\n") +
      "\n{bad}\n\n" + JSON.stringify(request("ping", undefined, 10)),
  );
  for (
    const chunks of [
      [bytes],
      Array.from(bytes, (byte) => Uint8Array.of(byte)),
      [bytes.slice(0, 20), bytes.slice(20)],
    ]
  ) {
    const calls: unknown[] = [];
    const responses = await transport(
      chunks,
      createMcpHandler((operation, args) => {
        calls.push([operation, args]);
        return Promise.resolve(args);
      }),
    );
    assertEquals(calls, [["command", { id: "µ 🔬", command: "line1\nline2" }]]);
    assertEquals(responses.map((response) => response.id), [
      1,
      "µ 🔬",
      9,
      null,
      null,
      10,
    ]);
    assertEquals(result(responses[1]).content, [{
      type: "text",
      text: JSON.stringify({ id: "µ 🔬", command: "line1\nline2" }),
    }]);
    assertEquals(responses[3].error?.code, -32700);
    assertEquals(responses[4].error?.code, -32700);
  }
  assertEquals(
    await transport([], createMcpHandler(() => Promise.resolve(null))),
    [],
  );
});

Deno.test("MCP URL configuration allows loopback only and rejects unsafe options", () => {
  assertEquals(parseMcpUrl([]).href, "http://127.0.0.1:8000/");
  for (
    const url of [
      "http://127.0.0.1:1234",
      "http://127.1.2.3",
      "https://[::1]:1234",
      "http://localhost:8001",
    ]
  ) {
    assertEquals(
      parseMcpUrl(["--url", url]).href,
      parseMcpUrl([`--url=${url}`]).href,
    );
  }
  assertEquals(
    parseMcpUrl(["--url", "http://localhost:8001"]).hostname,
    "127.0.0.1",
  );
  for (
    const args of [
      ["--wat"],
      ["--url"],
      ["--url", "http://127.0.0.1", "extra"],
      ...[
        "https://example.com",
        "http://192.168.1.1",
        "http://0.0.0.0",
        "http://[::]",
        "http://127.0.0.1.example.com",
        "ftp://127.0.0.1",
        "http://user:pass@localhost",
        "http://localhost/api",
        "http://localhost/?x=1",
        "http://localhost/#fragment",
        "invalid",
        "",
      ].map((url) => ["--url", url]),
    ]
  ) {
    let threw = false;
    try {
      parseMcpUrl(args);
    } catch {
      threw = true;
    }
    assert(threw, `Accepted unsafe arguments: ${args}`);
  }
});

Deno.test("MCP HTTP bridge uses all shell routes and reports HTTP, redirect and JSON errors", async () => {
  const received: unknown[] = [];
  let status = 200;
  let responseBody = JSON.stringify({ ok: true, label: "µ" });
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (req) => {
      const body = await req.text();
      received.push({
        method: req.method,
        path: new URL(req.url).pathname,
        body: body ? JSON.parse(body) : null,
      });
      return new Response(status === 204 ? null : responseBody, {
        status,
        headers: status === 302 ? { Location: "http://192.0.2.1/" } : {},
      });
    },
  );
  try {
    const call = createHttpInstrumentCall(
      `http://127.0.0.1:${server.addr.port}`,
    );
    const handler = createMcpHandler(call);
    await ready(handler);
    const expected: unknown[] = [];
    for (const [name, original] of toolCases) {
      const args = "id" in original
        ? { ...original, id: "scope /?#µ" }
        : original;
      assertEquals(
        result(await handler(request("tools/call", { name, arguments: args })))
          .content,
        [{ type: "text", text: responseBody }],
      );
      expected.push({
        method: ["list", "state"].includes(name) ? "GET" : "POST",
        path: name === "list"
          ? "/api/instruments"
          : name === "register"
          ? "/api/instruments/register"
          : `/api/instruments/${encodeURIComponent("scope /?#µ")}/${name}`,
        body: name === "register"
          ? { path: args.path }
          : name === "configure"
          ? { configuration: args.configuration }
          : name === "command"
          ? { command: args.command }
          : null,
      });
    }
    assertEquals(received, expected);
    for (const code of [400, 404, 500, 302]) {
      status = code;
      const response = result(
        await handler(request("tools/call", { name: "list" })),
      );
      assertEquals(response.isError, true);
      assert(Array.isArray(response.content));
      assert(typeof response.content[0].text === "string");
      assert(typeof JSON.parse(response.content[0].text).error === "string");
    }
    status = 200;
    responseBody = "not json";
    assertEquals(
      result(await handler(request("tools/call", { name: "list" }))).isError,
      true,
    );
    status = 204;
    assertEquals(await call("reset", { id: "scope" }), null);
    const count = received.length;
    for (const id of [".", ".."]) {
      assertEquals(
        result(
          await handler(
            request("tools/call", { name: "reset", arguments: { id } }),
          ),
        ).isError,
        true,
      );
    }
    assertEquals(received.length, count);
    await server.shutdown();
    assertEquals(
      result(await handler(request("tools/call", { name: "list" }))).isError,
      true,
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test("MCP CLI runs offline as an actual stdio subprocess and reserves stderr for diagnostics", async () => {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    () => Response.json([{ id: "scope" }]),
  );
  const script = new URL("../src/mcp_cli.ts", import.meta.url).pathname;
  try {
    const child = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--no-lock",
        `--allow-net=127.0.0.1:${server.addr.port}`,
        script,
        "--url",
        `http://127.0.0.1:${server.addr.port}`,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const writer = child.stdin.getWriter();
    await writer.write(
      new TextEncoder().encode(
        [initialize(), initialized, request("tools/call", { name: "list" }, 2)]
          .map((message) => JSON.stringify(message)).join("\n") + "\n",
      ),
    );
    await writer.close();
    const output = await child.output();
    assertEquals(output.code, 0);
    assertEquals(new TextDecoder().decode(output.stderr), "");
    const responses = new TextDecoder().decode(output.stdout).trimEnd().split(
      "\n",
    ).map((line) => JSON.parse(line));
    assertEquals(responses.length, 2);
    assertEquals(result(responses[1]).content, [{
      type: "text",
      text: '[{"id":"scope"}]',
    }]);
    const invalid = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--no-lock",
        script,
        "--url",
        "https://example.com",
      ],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(invalid.code, 1);
    assertEquals(invalid.stdout.length, 0);
    assert(new TextDecoder().decode(invalid.stderr).includes("loopback"));
  } finally {
    await server.shutdown();
  }
});
