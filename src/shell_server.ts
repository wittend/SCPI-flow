import { PluginRegistry } from "./plugin_registry.ts";
import { isObject } from "./plugin_manifest.ts";
import { normalizeProject } from "./projects.ts";

const root = new URL("../", import.meta.url);
const mime: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
};

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new Error("Expected application/json");
  }
  const text = await request.text();
  if (text.length > 2_000_000) throw new Error("Request too large");
  const value = JSON.parse(text);
  if (!isObject(value)) throw new Error("Expected JSON object");
  return value;
}

export function createHandler(
  registry: PluginRegistry,
  projectDirectory = new URL("projects/", root).pathname,
) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      (origin && origin !== url.origin)
    ) {
      return Response.json({
        error: "Only same-origin local requests are allowed",
      }, { status: 403 });
    }
    try {
      if (url.pathname === "/api/instruments" && request.method === "GET") {
        return Response.json(registry.list());
      }
      if (
        url.pathname === "/api/instruments/register" &&
        request.method === "POST"
      ) {
        const data = await body(request);
        if (typeof data.path !== "string") {
          throw new Error("Manifest path is required");
        }
        return Response.json(await registry.register(data.path), {
          status: 201,
        });
      }
      if (
        url.pathname === "/api/instruments/discover" &&
        request.method === "GET"
      ) {
        const rawDir = url.searchParams.get("dir")?.trim();
        const searchRoots = rawDir ? [rawDir] : [
          new URL("./instruments", root).pathname,
          new URL("../", root).pathname,
        ];

        const registeredList = registry.list();
        const registeredPaths = new Set(
          registeredList.map((inst) => inst.path),
        );
        const registeredIds = new Set(registeredList.map((inst) => inst.id));

        const discovered: Array<{
          path: string;
          id: string;
          name: string;
          version: string;
          description?: string;
          registered: boolean;
        }> = [];
        const seenDirs = new Set<string>();
        const seenManifestPaths = new Set<string>();

        const scanDir = async (dir: string, depth = 0) => {
          if (depth > 3) return;
          try {
            const realDir = await Deno.realPath(dir);
            if (seenDirs.has(realDir)) return;
            seenDirs.add(realDir);

            for await (const entry of Deno.readDir(realDir)) {
              if (
                entry.name.startsWith(".") ||
                entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === "vendor"
              ) {
                continue;
              }
              const fullPath = `${realDir}/${entry.name}`;
              if (entry.isFile && entry.name === "instrument.json") {
                if (seenManifestPaths.has(fullPath)) continue;
                seenManifestPaths.add(fullPath);
                try {
                  const text = await Deno.readTextFile(fullPath);
                  const manifest = JSON.parse(text);
                  if (
                    manifest &&
                    typeof manifest.id === "string" &&
                    typeof manifest.name === "string"
                  ) {
                    const isRegistered = registeredIds.has(manifest.id) ||
                      registeredPaths.has(fullPath);
                    discovered.push({
                      path: fullPath,
                      id: manifest.id,
                      name: manifest.name,
                      version: manifest.version ?? "1.0.0",
                      description: manifest.description,
                      registered: isRegistered,
                    });
                  }
                } catch {
                  // Ignore invalid manifest files
                }
              } else if (entry.isDirectory) {
                await scanDir(fullPath, depth + 1);
              }
            }
          } catch {
            // Ignore unreadable or non-existent directories
          }
        };

        for (const rootPath of searchRoots) {
          await scanDir(rootPath, 0);
        }

        return Response.json({ discovered });
      }
      if (url.pathname === "/api/fs/browse" && request.method === "GET") {
        const rawDir = url.searchParams.get("dir")?.trim();
        const startDir = rawDir ? rawDir : Deno.cwd();
        const current = await Deno.realPath(startDir);
        const stat = await Deno.stat(current);
        if (!stat.isDirectory) {
          throw new Error("Specified path is not a directory");
        }
        const entries = [];
        for await (const entry of Deno.readDir(current)) {
          if (entry.name.startsWith(".") && entry.name !== ".docs") continue;
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          const fullPath = `${current}/${entry.name}`;
          entries.push({
            name: entry.name,
            isDirectory: entry.isDirectory,
            isManifest: entry.isFile && entry.name === "instrument.json",
            path: fullPath,
          });
        }
        entries.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) {
            return a.name.localeCompare(b.name);
          }
          return a.isDirectory ? -1 : 1;
        });
        const parent = current === "/"
          ? null
          : (current.slice(0, current.lastIndexOf("/")) || "/");
        return Response.json({
          current,
          parent,
          entries,
        });
      }
      const instrument = url.pathname.match(
        /^\/api\/instruments\/([a-zA-Z0-9-]+)(?:\/(load|unload|state|configure|command|reset|icon))?$/,
      );
      if (instrument) {
        const [, id, action] = instrument;
        const info = registry.list().find((entry) => entry.id === id);
        if (!info) {
          return Response.json({ error: "Instrument not found" }, {
            status: 404,
          });
        }
        if (request.method === "GET" && action === "icon") {
          const ext = info.manifest?.icon.split(".").pop() ?? "";
          return new Response(
            await registry.icon(id) as Uint8Array<ArrayBuffer>,
            {
              headers: {
                "content-type": mime[ext] ?? "application/octet-stream",
                "x-content-type-options": "nosniff",
                "content-security-policy": "default-src 'none'; sandbox",
              },
            },
          );
        }
        if (request.method === "GET" && action === "state") {
          return Response.json(await registry.state(id));
        }
        if (request.method === "DELETE" && !action) {
          await body(request);
          await registry.remove(id);
          return Response.json({ success: true });
        }
        if (request.method === "POST") {
          const data = await body(request);
          if (action === "load") return Response.json(await registry.load(id));
          if (action === "unload") {
            await registry.unload(id);
            return Response.json({ success: true });
          }
          if (action === "configure") {
            return Response.json(
              await registry.configure(id, data.configuration),
            );
          }
          if (action === "command") {
            if (typeof data.command !== "string") {
              throw new Error("Command is required");
            }
            return Response.json(await registry.command(id, data.command));
          }
          if (action === "reset") {
            return Response.json(await registry.reset(id));
          }
        }
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }
      const plugin = url.pathname.match(/^\/plugins\/([a-zA-Z0-9-]+)\/(.*)$/);
      if (plugin) {
        if (!["GET", "HEAD", "POST"].includes(request.method)) {
          return new Response("Method not allowed", { status: 405 });
        }
        return await registry.proxy(plugin[1], `/${plugin[2]}`, request);
      }
      const project = url.pathname.match(
        /^\/api\/projects\/([a-zA-Z0-9_-]{1,100})$/,
      );
      if (project) {
        const path = `${projectDirectory}/${project[1]}_prj.json`;
        if (request.method === "GET") {
          const value = JSON.parse(await Deno.readTextFile(path));
          return Response.json(normalizeProject(value, registry.list()));
        }
        if (request.method === "POST") {
          const value = normalizeProject(await body(request), registry.list());
          await Deno.mkdir(projectDirectory, { recursive: true });
          const temporary = `${path}.${crypto.randomUUID()}.tmp`;
          try {
            await Deno.writeTextFile(temporary, JSON.stringify(value, null, 2));
            await Deno.rename(temporary, path);
          } finally {
            await Deno.remove(temporary).catch(() => {});
          }
          return Response.json({ success: true });
        }
        return new Response("Method not allowed", { status: 405 });
      }
      const files: Record<string, string> = {
        "/": "index.html",
        "/index.html": "index.html",
        "/web/shell.js": "web/shell.js",
        "/web/shell.css": "web/shell.css",
        "/instrument.schema.json": "instrument.schema.json",
      };
      if (request.method === "GET" && Object.hasOwn(files, url.pathname)) {
        const file = files[url.pathname];
        return new Response(await Deno.readFile(new URL(file, root)), {
          headers: {
            "content-type": mime[file.split(".").pop()!] ?? "text/plain",
            "x-content-type-options": "nosniff",
            "content-security-policy":
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      const message = (error as Error).message;
      const status = error instanceof Deno.errors.NotFound
        ? 404
        : message.includes("not loaded")
        ? 409
        : 400;
      return Response.json({ error: message }, { status });
    }
  };
}

export async function startShell(args = Deno.args): Promise<void> {
  const option = (name: string, fallback: string) =>
    args.includes(name) ? args[args.indexOf(name) + 1] ?? fallback : fallback;
  let catalogDefault = new URL("instruments.json", root).pathname;
  if (!args.includes("--catalog")) {
    const cwdCatalog = `${Deno.cwd()}/instruments.json`;
    try {
      await Deno.stat(cwdCatalog);
      catalogDefault = cwdCatalog;
    } catch {
      // Keep root instruments.json default
    }
  }
  const registry = new PluginRegistry(
    option("--catalog", catalogDefault),
  );
  await registry.initialize();
  const port = Number(option("--port", "8000"));
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Invalid port");
  }
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port,
    onListen: ({ port }) =>
      console.log(`SCPI-flow shell: http://127.0.0.1:${port}`),
  }, createHandler(registry));
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await server.shutdown();
    await registry.close();
  };
  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
  try {
    await server.finished;
  } finally {
    await registry.close();
    Deno.removeSignalListener("SIGINT", shutdown);
    Deno.removeSignalListener("SIGTERM", shutdown);
  }
}
