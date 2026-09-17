/** Dependency-free loopback plugin transport and static-file boundary. */
export type Schema = {
  type: string;
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
};

export function validate(value: unknown, schema: Schema, path = "config"): void {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${path} must be an object`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) {
        throw new Error(`Unknown property: ${path}.${key}`);
      }
      validate(child, schema.properties![key], `${path}.${key}`);
    }
  } else if (schema.type === "number" || schema.type === "integer") {
    if (
      typeof value !== "number" || !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isInteger(value))
    ) {
      throw new Error(`${path} must be a finite ${schema.type}`);
    }
    if (
      (schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum) ||
      (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
    ) {
      throw new Error(`${path} is out of range`);
    }
  } else {
    const valid = schema.type === "string"
      ? typeof value === "string"
      : schema.type === "boolean"
      ? typeof value === "boolean"
      : false;
    if (!valid) throw new Error(`${path} must be ${schema.type}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new Error(`${path} must be one of ${schema.enum.join(", ")}`);
  }
}

export const json = (value: unknown, status = 200) =>
  new Response(
    JSON.stringify(value, (_key, item) =>
      ArrayBuffer.isView(item) ? Array.from(item as Float64Array) : item),
    {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    },
  );

export interface Instrument {
  id: string;
  configuration: Schema;
  state(): unknown;
  configure(config: Record<string, unknown>): void;
  command(command: string): string | null;
  reset(): void;
  legacy?(req: Request, path: string): Promise<Response | undefined>;
}

export function createHandler(instrument: Instrument, root: URL) {
  const methods: Record<string, string> = {
    "/health": "GET",
    "/state": "GET",
    "/configure": "POST",
    "/command": "POST",
    "/reset": "POST",
  };
  return async (req: Request): Promise<Response> => {
    try {
      const path = new URL(req.url).pathname;
      if (methods[path] && req.method !== methods[path]) {
        return new Response(null, { status: 405, headers: { allow: methods[path] } });
      }
      switch (path) {
        case "/health":
          return json({ status: "ok", id: instrument.id });
        case "/state":
          return json(instrument.state());
        case "/configure": {
          const config = await req.json();
          validate(config, instrument.configuration);
          instrument.configure(config);
          return json(instrument.state());
        }
        case "/command": {
          const body = await req.json();
          validate(body, { type: "object", properties: { command: { type: "string" } } });
          if (typeof body.command !== "string" || !body.command.trim()) {
            throw new Error("command must be a nonempty string");
          }
          return json({ response: instrument.command(body.command) ?? "" });
        }
        case "/reset":
          instrument.reset();
          return json(instrument.state());
      }
      if (path.startsWith("/api/")) {
        return await instrument.legacy?.(req, path) ?? json({ error: "Not found" }, 404);
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      }
      const decoded = decodeURIComponent(path);
      const segments = decoded.split("/");
      if (
        segments.some((part) => part === ".." || part.startsWith(".")) ||
        decoded.includes("\\") || decoded.includes("\0")
      ) return json({ error: "Not found" }, 404);
      const file = decoded === "/" ? "index.html" : decoded.slice(1);
      if (
        !(file === "index.html" || file === "instrument.json" ||
          file.startsWith("assets/") || file.startsWith("plugin-ui/"))
      ) {
        return json({ error: "Not found" }, 404);
      }
      try {
        const rootPath = await Deno.realPath(root);
        const target = await Deno.realPath(new URL(file, root));
        if (!target.startsWith(rootPath + "/")) return json({ error: "Not found" }, 404);
        const bytes = await Deno.readFile(target);
        const extension = file.split(".").pop()!;
        const types: Record<string, string> = {
          html: "text/html; charset=utf-8",
          css: "text/css",
          js: "text/javascript",
          json: "application/json",
          svg: "image/svg+xml",
          png: "image/png",
          jpg: "image/jpeg",
          woff2: "font/woff2",
        };
        return new Response(req.method === "HEAD" ? null : bytes, {
          headers: {
            "content-type": types[extension] ?? "application/octet-stream",
            "x-content-type-options": "nosniff",
          },
        });
      } catch (error) {
        if (
          error instanceof Deno.errors.NotFound || error instanceof Deno.errors.PermissionDenied ||
          error instanceof Deno.errors.IsADirectory
        ) return json({ error: "Not found" }, 404);
        throw error;
      }
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  };
}

export function start(handler: (req: Request) => Response | Promise<Response>) {
  const index = Deno.args.indexOf("--port");
  const port = Number(index < 0 ? 0 : Deno.args[index + 1] || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
  return Deno.serve({
    hostname: "127.0.0.1",
    port,
    onListen: ({ port }) => console.log(JSON.stringify({ port })),
  }, handler);
}
