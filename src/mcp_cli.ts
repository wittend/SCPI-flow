import { createMcpHandler, type McpHandler } from "./mcp.ts";

const defaultUrl = "http://127.0.0.1:8000";

export function parseMcpUrl(args: string[]): URL {
  let value = defaultUrl;
  if (args.length === 2 && args[0] === "--url") {
    value = args[1];
  } else if (args.length === 1 && args[0].startsWith("--url=")) {
    value = args[0].slice("--url=".length);
  } else if (args.length) {
    throw new Error("Usage: mcp_cli.ts [--url http://127.0.0.1:8000]");
  }
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !(url.hostname === "localhost" || url.hostname === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(url.hostname)) ||
    url.username || url.password || url.pathname !== "/" || url.search ||
    url.hash
  ) {
    throw new Error(
      "--url must be a loopback HTTP(S) origin without credentials",
    );
  }
  // Avoid DNS resolution of localhost to a non-loopback address.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url;
}

export function createHttpInstrumentCall(
  baseUrl = defaultUrl,
  request: typeof fetch = fetch,
): (operation: string, args: Record<string, unknown>) => Promise<unknown> {
  const origin = parseMcpUrl(["--url", baseUrl]);
  return async (operation, args) => {
    let path = "/api/instruments";
    let method = "POST";
    let body: Record<string, unknown> | undefined;
    switch (operation) {
      case "list":
        method = "GET";
        break;
      case "register":
        path += "/register";
        body = { path: args.path };
        break;
      case "load":
      case "unload":
      case "reset":
      case "state":
      case "configure":
      case "command":
        if (
          typeof args.id !== "string" || !args.id || args.id === "." ||
          args.id === ".."
        ) {
          throw new Error(
            "Instrument id cannot be represented as an API path segment",
          );
        }
        path += `/${encodeURIComponent(String(args.id))}/${operation}`;
        if (operation === "state") method = "GET";
        if (operation === "configure") {
          body = { configuration: args.configuration };
        }
        if (operation === "command") body = { command: args.command };
        break;
      default:
        throw new Error(`Unknown instrument operation: ${operation}`);
    }
    const response = await request(new URL(path, origin), {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Shell API HTTP ${response.status}: ${text}`);
    }
    return text.length ? JSON.parse(text) : null;
  };
}

/** Newline-delimited UTF-8 JSON; only protocol responses reach output. */
export async function runMcpStdio(
  input: ReadableStream<Uint8Array>,
  output: WritableStream<Uint8Array>,
  handler: McpHandler,
): Promise<void> {
  const writer = output.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let pending = "";
  async function dispatch(line: string) {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      await writer.write(encoder.encode(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }) + "\n",
      ));
      return;
    }
    const response = await handler(message);
    if (response !== null) {
      await writer.write(encoder.encode(JSON.stringify(response) + "\n"));
    }
  }
  try {
    for await (const chunk of input) {
      pending += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        await dispatch(line);
      }
    }
    pending += decoder.decode();
    if (pending.length) await dispatch(pending);
  } finally {
    writer.releaseLock();
  }
}

if (import.meta.main) {
  try {
    const url = parseMcpUrl(Deno.args);
    await runMcpStdio(
      Deno.stdin.readable,
      Deno.stdout.writable,
      createMcpHandler(createHttpInstrumentCall(url.href)),
    );
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    Deno.exitCode = 1;
  }
}
