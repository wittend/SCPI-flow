export type McpReply = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

export type McpResponse = McpReply | McpReply[];
export type McpHandler = (message: unknown) => Promise<McpResponse | null>;

const versions = ["2025-06-18", "2025-03-26", "2024-11-05"];
const operations = [
  ["list", "List registered instruments", []],
  ["register", "Register an instrument definition from a local path", ["path"]],
  ["load", "Load an instrument", ["id"]],
  ["unload", "Unload an instrument", ["id"]],
  ["state", "Read an instrument's state", ["id"]],
  ["configure", "Configure an instrument", ["id", "configuration"]],
  ["command", "Execute an instrument command", ["id", "command"]],
  ["reset", "Reset an instrument", ["id"]],
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string | number {
  return typeof value === "string" ||
    (typeof value === "number" && Number.isInteger(value));
}

function error(id: McpReply["id"], code: number, message: string): McpReply {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function tools() {
  return operations.map(([name, description, fields]) => ({
    name,
    description,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(fields.map((field) => [
        field,
        field === "configuration"
          ? { type: "object" }
          : { type: "string", minLength: 1 },
      ])),
      required: [...fields],
      additionalProperties: false,
    },
  }));
}

/** One handler represents one stdio client session. */
export function createMcpHandler(
  call: (operation: string, args: Record<string, unknown>) => Promise<unknown>,
): McpHandler {
  let phase: "new" | "initializing" | "ready" = "new";
  let protocolVersion = versions[0];

  async function handleOne(message: unknown): Promise<McpReply | null> {
    if (!isObject(message) || message.jsonrpc !== "2.0") {
      return error(null, -32600, "Invalid Request");
    }
    const hasId = Object.hasOwn(message, "id");
    const id = validId(message.id) ? message.id : null;
    if (typeof message.method !== "string") {
      // This server sends no requests, so valid unsolicited responses are ignored.
      if (
        hasId && id !== null &&
        (Object.hasOwn(message, "result") !==
          Object.hasOwn(message, "error")) &&
        (isObject(message.result) ||
          (isObject(message.error) &&
            Number.isInteger(message.error.code) &&
            typeof message.error.message === "string"))
      ) return null;
      return error(id, -32600, "Invalid Request");
    }
    if (!hasId) {
      if (
        message.method === "notifications/initialized" &&
        phase === "initializing" &&
        (!Object.hasOwn(message, "params") || isObject(message.params)) &&
        !Object.hasOwn(message, "result") && !Object.hasOwn(message, "error")
      ) phase = "ready";
      return null;
    }
    if (
      id === null || Object.hasOwn(message, "result") ||
      Object.hasOwn(message, "error")
    ) return error(id, -32600, "Invalid Request");
    if (Object.hasOwn(message, "params") && !isObject(message.params)) {
      return error(id, -32602, "Params must be an object");
    }
    const params = (message.params ?? {}) as Record<string, unknown>;
    if (Object.hasOwn(params, "_meta") && !isObject(params._meta)) {
      return error(id, -32602, "_meta must be an object");
    }
    const success = (result: Record<string, unknown>): McpReply => ({
      jsonrpc: "2.0",
      id,
      result,
    });

    switch (message.method) {
      case "initialize": {
        if (phase !== "new") {
          return error(id, -32600, "Session already initialized");
        }
        if (
          typeof params.protocolVersion !== "string" ||
          !isObject(params.capabilities) || !isObject(params.clientInfo) ||
          typeof params.clientInfo.name !== "string" ||
          typeof params.clientInfo.version !== "string"
        ) return error(id, -32602, "Invalid initialize parameters");
        protocolVersion = versions.includes(params.protocolVersion)
          ? params.protocolVersion
          : versions[0];
        phase = "initializing";
        return success({
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "SCPI-flow", version: "1.0.0" },
        });
      }
      case "ping":
        return success({});
      case "tools/list":
      case "tools/call":
        if (phase !== "ready") {
          return error(id, -32002, "Session is not initialized");
        }
        break;
      default:
        return error(id, -32601, "Method not found");
    }

    if (message.method === "tools/list") {
      if (Object.keys(params).some((key) => key !== "_meta")) {
        return error(id, -32602, "This tool list is not paginated");
      }
      return success({ tools: tools() });
    }
    if (
      typeof params.name !== "string" ||
      Object.keys(params).some((key) =>
        !["name", "arguments", "_meta"].includes(key)
      )
    ) return error(id, -32602, "Invalid tools/call parameters");
    const tool = operations.find(([name]) => name === params.name);
    if (!tool) return error(id, -32602, "Unknown tool");
    const args = Object.hasOwn(params, "arguments") ? params.arguments : {};
    const fields: readonly string[] = tool[2];
    if (
      !isObject(args) ||
      Object.keys(args).some((key) => !fields.includes(key)) ||
      fields.some((field) =>
        !Object.hasOwn(args, field) ||
        (field === "configuration"
          ? !isObject(args[field])
          : typeof args[field] !== "string" || args[field].length === 0)
      )
    ) return error(id, -32602, "Invalid tool arguments");

    try {
      const result = await call(tool[0], args);
      const text = JSON.stringify(result ?? null);
      if (text === undefined) {
        throw new Error("Tool result is not JSON serializable");
      }
      return success({
        content: [{ type: "text", text }],
      });
    } catch (cause) {
      return success({
        isError: true,
        content: [{
          type: "text",
          text: JSON.stringify({
            error: cause instanceof Error ? cause.message : String(cause),
          }),
        }],
      });
    }
  }

  return async (message) => {
    if (!Array.isArray(message)) return await handleOne(message);
    // Receiving batches is mandatory in March 2025, removed in June 2025.
    if (
      protocolVersion !== "2025-03-26" || phase === "new" || !message.length
    ) {
      return error(null, -32600, "Invalid Request");
    }
    const replies: McpReply[] = [];
    for (const item of message) {
      const reply = await handleOne(item);
      if (reply !== null) replies.push(reply);
    }
    return replies.length ? replies : null;
  };
}
