import {
  containedFile,
  type InstrumentManifest,
  isObject,
  validateConfiguration,
  validateManifest,
} from "./plugin_manifest.ts";

interface CatalogEntry {
  path: string;
  id?: string;
  legacyGuid?: string;
}

interface Runtime {
  entry: CatalogEntry;
  root?: string;
  manifest?: InstrumentManifest;
  status:
    | "unloaded"
    | "loading"
    | "loaded"
    | "unloading"
    | "failed"
    | "unavailable";
  error?: string;
  child?: Deno.ChildProcess;
  port?: number;
  output?: Promise<void>;
  exit?: Promise<Deno.CommandStatus>;
  queue: Promise<unknown>;
}

export interface InstrumentInfo {
  id: string;
  path: string;
  legacyGuid?: string;
  status: Runtime["status"];
  error?: string;
  manifest?: InstrumentManifest;
}

export class PluginRegistry {
  private catalogPath: string;
  private records = new Map<string, Runtime>();
  private catalogQueue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(catalogPath: string) {
    this.catalogPath = catalogPath;
  }

  async initialize(): Promise<void> {
    this.catalogPath = await Deno.realPath(this.catalogPath);
    const catalog = JSON.parse(await Deno.readTextFile(this.catalogPath));
    if (
      !isObject(catalog) || catalog.schemaVersion !== 1 ||
      !Array.isArray(catalog.instruments)
    ) throw new Error("Invalid instrument catalog");
    for (const entry of catalog.instruments) {
      if (
        !isObject(entry) || typeof entry.path !== "string" ||
        (entry.id !== undefined && typeof entry.id !== "string") ||
        (entry.legacyGuid !== undefined && typeof entry.legacyGuid !== "string")
      ) throw new Error("Invalid catalog entry");
      const runtime: Runtime = {
        entry: entry as unknown as CatalogEntry,
        status: "unloaded",
        queue: Promise.resolve(),
      };
      try {
        await this.readManifest(runtime);
      } catch (error) {
        runtime.status = "unavailable";
        runtime.error = (error as Error).message;
      }
      const id = runtime.manifest?.id ?? runtime.entry.id ??
        `unavailable-${this.records.size}`;
      if (this.records.has(id)) {
        throw new Error(`Duplicate instrument id: ${id}`);
      }
      this.records.set(id, runtime);
    }
  }

  private async readManifest(runtime: Runtime): Promise<void> {
    const base = this.catalogPath.slice(0, this.catalogPath.lastIndexOf("/"));
    const path = await Deno.realPath(
      runtime.entry.path.startsWith("/")
        ? runtime.entry.path
        : `${base}/${runtime.entry.path}`,
    );
    const root = path.slice(0, path.lastIndexOf("/"));
    const manifest = validateManifest(
      JSON.parse(await Deno.readTextFile(path)),
    );
    if (runtime.entry.id && runtime.entry.id !== manifest.id) {
      throw new Error("Manifest id differs from catalog id");
    }
    for (
      const asset of [manifest.entrypoint, manifest.frontend, manifest.icon]
    ) await containedFile(root, asset);
    runtime.manifest = manifest;
    runtime.root = root;
    runtime.entry.id = manifest.id;
  }

  list(): InstrumentInfo[] {
    return [...this.records].map(([id, runtime]) => ({
      id,
      path: runtime.entry.path,
      legacyGuid: runtime.entry.legacyGuid,
      status: runtime.status,
      error: runtime.error,
      manifest: runtime.manifest
        ? structuredClone(runtime.manifest)
        : undefined,
    }));
  }

  private record(id: string): Runtime {
    const runtime = this.records.get(id);
    if (!runtime) throw new Error(`Unknown instrument: ${id}`);
    return runtime;
  }

  private serial<T>(runtime: Runtime, action: () => Promise<T>): Promise<T> {
    const result = runtime.queue.then(action);
    runtime.queue = result.catch(() => {});
    return result;
  }

  private catalogSerial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.catalogQueue.then(action);
    this.catalogQueue = result.catch(() => {});
    return result;
  }

  private async persist(): Promise<void> {
    const temporary = `${this.catalogPath}.${crypto.randomUUID()}.tmp`;
    try {
      await Deno.writeTextFile(
        temporary,
        JSON.stringify(
          {
            schemaVersion: 1,
            instruments: [...this.records.values()].map((item) => item.entry),
          },
          null,
          2,
        ) + "\n",
      );
      await Deno.rename(temporary, this.catalogPath);
    } finally {
      await Deno.remove(temporary).catch(() => {});
    }
  }

  register(path: string): Promise<InstrumentInfo> {
    return this.catalogSerial(async () => {
      if (this.closed) throw new Error("Registry is closed");
      const absolute = await Deno.realPath(path);
      const runtime: Runtime = {
        entry: { path: absolute },
        status: "unloaded",
        queue: Promise.resolve(),
      };
      await this.readManifest(runtime);
      const id = runtime.manifest!.id;
      if (this.records.has(id)) {
        throw new Error(`Instrument already registered: ${id}`);
      }
      this.records.set(id, runtime);
      try {
        await this.persist();
      } catch (error) {
        this.records.delete(id);
        throw error;
      }
      return this.list().find((item) => item.id === id)!;
    });
  }

  remove(id: string): Promise<void> {
    return this.catalogSerial(async () => {
      const runtime = this.record(id);
      await this.serial(runtime, async () => {
        await this.stop(runtime);
        this.records.delete(id);
        try {
          await this.persist();
        } catch (error) {
          this.records.set(id, runtime);
          throw error;
        }
      });
    });
  }

  load(id: string): Promise<InstrumentInfo> {
    const runtime = this.record(id);
    return this.serial(runtime, async () => {
      if (this.closed || this.records.get(id) !== runtime) {
        throw new Error("Registry is closed or instrument removed");
      }
      if (runtime.status === "loaded") {
        return this.list().find((item) => item.id === id)!;
      }
      await this.stop(runtime);
      runtime.status = "loading";
      runtime.error = undefined;
      try {
        await this.readManifest(runtime);
        const entrypoint = await containedFile(
          runtime.root!,
          runtime.manifest!.entrypoint,
        );
        const child = new Deno.Command(Deno.execPath(), {
          args: [
            "run",
            "--no-prompt",
            "--cached-only",
            `--allow-read=${runtime.root}`,
            "--allow-net=127.0.0.1",
            entrypoint,
            "--port",
            "0",
          ],
          cwd: runtime.root,
          stdin: "null",
          stdout: "piped",
          stderr: "inherit",
        }).spawn();
        runtime.child = child;
        runtime.exit = child.status.then((status) => {
          if (runtime.child === child && runtime.status !== "unloading") {
            runtime.status = "failed";
            runtime.error = `Instrument process exited (${status.code})`;
            runtime.port = undefined;
          }
          return status;
        });
        let ready!: (port: number) => void;
        let fail!: (error: Error) => void;
        const readiness = new Promise<number>((resolve, reject) => {
          ready = resolve;
          fail = reject;
        });
        runtime.output = (async () => {
          let pending = "";
          let announced = false;
          try {
            for await (
              const chunk of child.stdout.pipeThrough(new TextDecoderStream())
            ) {
              if (announced) continue;
              pending += chunk;
              if (pending.length > 65536) {
                throw new Error("Invalid readiness message");
              }
              const newline = pending.indexOf("\n");
              if (newline < 0) continue;
              const message = JSON.parse(pending.slice(0, newline));
              if (
                !Number.isInteger(message.port) || message.port < 1 ||
                message.port > 65535
              ) throw new Error("Invalid instrument port");
              announced = true;
              ready(message.port);
            }
            if (!announced) {
              fail(new Error("Instrument exited before readiness"));
            }
          } catch (error) {
            fail(error as Error);
          }
        })();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          runtime.port = await Promise.race([
            readiness,
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error("Instrument startup timed out")),
                10000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
        const response = await fetch(
          `http://127.0.0.1:${runtime.port}/health`,
          { signal: AbortSignal.timeout(3000), redirect: "error" },
        );
        await response.body?.cancel();
        if (!response.ok || runtime.status !== "loading") {
          throw new Error("Instrument health check failed");
        }
        runtime.status = "loaded";
        return this.list().find((item) => item.id === id)!;
      } catch (error) {
        await this.stop(runtime);
        runtime.status = "failed";
        runtime.error = (error as Error).message;
        throw error;
      }
    });
  }

  private async stop(runtime: Runtime): Promise<void> {
    runtime.status = "unloading";
    if (runtime.child) {
      try {
        runtime.child.kill("SIGTERM");
      } catch { /* Already exited. */ }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          runtime.exit,
          new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              try {
                runtime.child?.kill("SIGKILL");
              } catch { /* Already exited. */ }
              resolve();
            }, 1500);
          }),
        ]);
        await runtime.exit;
        await runtime.output;
      } finally {
        clearTimeout(timer);
      }
    }
    runtime.child = undefined;
    runtime.port = undefined;
    runtime.status = runtime.manifest ? "unloaded" : "unavailable";
  }

  unload(id: string): Promise<void> {
    const runtime = this.record(id);
    return this.serial(runtime, () => this.stop(runtime));
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.catalogQueue;
    await Promise.all(
      [...this.records.values()].map((runtime) =>
        this.serial(runtime, () => this.stop(runtime))
      ),
    );
  }

  async icon(id: string): Promise<Uint8Array> {
    const runtime = this.record(id);
    if (!runtime.manifest || !runtime.root) {
      throw new Error("Instrument unavailable");
    }
    return await Deno.readFile(
      await containedFile(runtime.root, runtime.manifest.icon),
    );
  }

  async proxy(id: string, path: string, request: Request): Promise<Response> {
    const runtime = this.record(id);
    if (runtime.status !== "loaded" || !runtime.port) {
      throw new Error(`Instrument not loaded: ${id}`);
    }
    const destination = new URL(`http://127.0.0.1:${runtime.port}`);
    destination.pathname = path || `/${runtime.manifest!.frontend}`;
    destination.search = new URL(request.url).search;
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const response = await fetch(destination, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    const resultHeaders = new Headers({
      "content-type": response.headers.get("content-type") ??
        "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    return new Response(response.body, {
      status: response.status,
      headers: resultHeaders,
    });
  }

  private async invoke(
    id: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await this.proxy(
      id,
      path,
      new Request("http://localhost/", {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        isObject(result) && typeof result.error === "string"
          ? result.error
          : `Instrument request failed (${response.status})`,
      );
    }
    return result;
  }

  state(id: string): Promise<unknown> {
    return this.invoke(id, "/state");
  }
  command(id: string, command: string): Promise<unknown> {
    if (
      typeof command !== "string" || !command.trim() || command.length > 65536
    ) return Promise.reject(new Error("Invalid command"));
    return this.invoke(id, "/command", { command });
  }
  async configure(id: string, configuration: unknown): Promise<unknown> {
    const runtime = this.record(id);
    if (!runtime.manifest) throw new Error("Instrument unavailable");
    validateConfiguration(runtime.manifest.configuration, configuration);
    return await this.invoke(id, "/configure", configuration);
  }
  reset(id: string): Promise<unknown> {
    return this.invoke(id, "/reset", {});
  }
}
