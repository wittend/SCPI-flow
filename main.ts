import { serveDir } from "@std/http/file-server";
import { ScpiBridge } from "./scpi_bridge.ts";
import { OscilloscopeCli } from "./src/cli.ts";
import {
  MathFunction,
  MeasurementFunction,
  MultimeterSimulation,
  SpeedRate,
} from "./src/multimeter.ts";
import { SignalGenerator, WaveformType } from "./src/signal_generator.ts";

// Ensure projects directory exists
try {
  await Deno.mkdir("./projects", { recursive: true });
} catch {
  // Directory may already exist
}

export const scpi = new ScpiBridge();
export const multimeter = new MultimeterSimulation();
export const signalGenerator = new SignalGenerator();

try {
  await scpi.start(false);
  console.log("SCPI Bridge started (Simulated & MCP mode)");
} catch (e) {
  console.error("Failed to start SCPI Bridge", e);
}

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // API Routes
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/palette") {
      try {
        const content = await Deno.readTextFile("./palette_objects.json");
        return new Response(content, {
          headers: { "content-type": "application/json" },
        });
      } catch {
        return new Response(
          JSON.stringify({ error: "Failed to load palette" }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          },
        );
      }
    }

    // GET /api/obj/:guid
    const objMatch = url.pathname.match(/^\/api\/obj\/([a-f0-9-]+)$/);
    if (objMatch && req.method === "GET") {
      const guid = objMatch[1];
      try {
        const content = await Deno.readTextFile(`./obj/${guid}_obj.json`);
        return new Response(content, {
          headers: { "content-type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Object not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // Projects API: /api/projects/:name
    const prjMatch = url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
    if (prjMatch) {
      const name = prjMatch[1];
      const filePath = `./projects/${name}_prj.json`;

      if (req.method === "GET") {
        try {
          const content = await Deno.readTextFile(filePath);
          return new Response(content, {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "Project not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
      }

      if (req.method === "POST") {
        try {
          const body = await req.text();
          JSON.parse(body); // Validate JSON
          await Deno.mkdir("./projects", { recursive: true });
          await Deno.writeTextFile(filePath, body);
          return new Response(JSON.stringify({ success: true }), {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(
            JSON.stringify({ error: "Failed to save project" }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          );
        }
      }
    }

    // SCPI API
    if (url.pathname === "/api/scpi/resources") {
      const res = await scpi.listResources();
      return new Response(JSON.stringify(res), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/api/scpi/query" && req.method === "POST") {
      try {
        const { resource, query } = await req.json();
        const res = await scpi.query(resource, query);
        return new Response(JSON.stringify(res), {
          headers: { "content-type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request" }), {
          status: 400,
        });
      }
    }

    if (url.pathname === "/api/scpi/write" && req.method === "POST") {
      try {
        const { resource, write } = await req.json();
        const res = await scpi.write(resource, write);
        return new Response(JSON.stringify(res), {
          headers: { "content-type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request" }), {
          status: 400,
        });
      }
    }

    // Oscilloscope Simulation Direct API
    if (url.pathname === "/api/scope/frame" && req.method === "GET") {
      const frame = scpi.engine.scope.acquire();
      return new Response(
        JSON.stringify(frame, (_key, value) => {
          if (value instanceof Float64Array) {
            return Array.from(value);
          }
          return value;
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/api/scope/measurements" && req.method === "GET") {
      const m1 = scpi.engine.scope.getMeasurements(1);
      const m2 = scpi.engine.scope.getMeasurements(2);
      return new Response(JSON.stringify({ ch1: m1, ch2: m2 }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/api/scope/command" && req.method === "POST") {
      try {
        const { command } = await req.json();
        const response = scpi.engine.execute(command);
        return new Response(JSON.stringify({ success: true, response }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 400,
        });
      }
    }

    // Digital Multimeter Simulation Direct API
    if (url.pathname === "/api/dmm/reading" && req.method === "GET") {
      const reading = multimeter.takeReading();
      return new Response(
        JSON.stringify({
          success: true,
          reading,
          function: multimeter.function,
          rangeString: `${multimeter.range}`,
          autoRange: multimeter.autoRange,
          speed: multimeter.speed,
          dualEnabled: multimeter.dualEnabled,
          secondaryFunction: multimeter.secondaryFunction,
          mathFunction: multimeter.mathFunction,
          stats: multimeter.stats,
          limits: multimeter.limits,
          trend: multimeter.trendHistory.slice(-50),
          input: multimeter.input,
          beeping: multimeter.beeping,
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/api/dmm/config" && req.method === "POST") {
      try {
        const body = await req.json();
        if (body.function) {
          multimeter.function = body.function as MeasurementFunction;
        }
        if (body.autoRange !== undefined) multimeter.autoRange = body.autoRange;
        if (body.rangeIndex !== undefined) {
          multimeter.currentRangeIndex = body.rangeIndex;
        }
        if (body.range !== undefined) {
          multimeter.setRange(body.range);
        }
        if (body.speed) multimeter.speed = body.speed as SpeedRate;
        if (body.dualEnabled !== undefined) {
          multimeter.dualEnabled = body.dualEnabled;
        }
        if (body.secondaryFunction) {
          multimeter.secondaryFunction = body
            .secondaryFunction as MeasurementFunction;
        }
        if (body.mathFunction) {
          multimeter.mathFunction = body.mathFunction as MathFunction;
        }
        if (body.nullValue !== undefined) multimeter.nullValue = body.nullValue;
        if (body.limits) Object.assign(multimeter.limits, body.limits);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (url.pathname === "/api/dmm/input" && req.method === "POST") {
      try {
        const body = await req.json();
        Object.assign(multimeter.input, body);
        return new Response(
          JSON.stringify({ success: true, input: multimeter.input }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (url.pathname === "/api/dmm/reset" && req.method === "POST") {
      multimeter.reset();
      return new Response(JSON.stringify({ success: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Signal Generator Direct API
    if (url.pathname === "/api/gen/state") {
      if (req.method === "GET") {
        return new Response(
          JSON.stringify({
            type: signalGenerator.type,
            frequency: signalGenerator.frequency,
            amplitude: signalGenerator.amplitude,
            offset: signalGenerator.offset,
            phase: signalGenerator.phase,
            dutyCycle: signalGenerator.dutyCycle,
            scale: signalGenerator.scale,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (req.method === "POST") {
        try {
          const body = await req.json();
          if (body.type) signalGenerator.setType(body.type as WaveformType);
          if (body.frequency !== undefined) {
            signalGenerator.setFrequency(body.frequency);
          }
          if (body.amplitude !== undefined) {
            signalGenerator.setAmplitude(body.amplitude);
          }
          if (body.offset !== undefined) {
            signalGenerator.setOffset(body.offset);
          }
          if (body.phase !== undefined) {
            signalGenerator.setPhase(body.phase);
          }
          if (body.dutyCycle !== undefined) {
            signalGenerator.setDutyCycle(body.dutyCycle);
          }
          return new Response(JSON.stringify({ success: true }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      }
    }

    if (url.pathname === "/api/gen/preview" && req.method === "GET") {
      const duration = 2 / Math.max(1, signalGenerator.frequency); // 2 full cycles
      const buf = signalGenerator.generateBuffer(0, duration, 400);
      return new Response(
        JSON.stringify({
          time: Array.from(buf.time),
          voltage: Array.from(buf.voltage),
          type: signalGenerator.type,
          frequency: signalGenerator.frequency,
          amplitude: signalGenerator.amplitude,
          offset: signalGenerator.offset,
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // Serve static files from root
  return serveDir(req, {
    fsRoot: ".",
    showIndex: true,
  });
}

if (import.meta.main) {
  if (Deno.args.includes("--cli")) {
    const cli = new OscilloscopeCli(scpi.engine.scope);
    await cli.runInteractive();
  } else {
    Deno.serve({ port: 8000 }, handler);
  }
}
