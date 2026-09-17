import { serveDir } from "@std/http/file-server";
import { ScpiBridge } from "./scpi_bridge.ts";
import { MultimeterCli } from "./src/cli.ts";

export const scpi = new ScpiBridge();
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
    // 1. Live Multimeter Reading
    if (url.pathname === "/api/dmm/reading" && req.method === "GET") {
      const reading = scpi.engine.meter.takeReading();
      return new Response(
        JSON.stringify({
          reading,
          function: scpi.engine.meter.function,
          range: scpi.engine.meter.range,
          autoRange: scpi.engine.meter.autoRange,
          speed: scpi.engine.meter.speed,
          dualEnabled: scpi.engine.meter.dualEnabled,
          secondaryFunction: scpi.engine.meter.secondaryFunction,
          displayMode: scpi.engine.meter.displayMode,
          mathFunction: scpi.engine.meter.mathFunction,
          nullEnabled: scpi.engine.meter.nullEnabled,
          nullValue: scpi.engine.meter.nullValue,
          statisticsEnabled: scpi.engine.meter.statisticsEnabled,
          stats: scpi.engine.meter.stats,
          limits: scpi.engine.meter.limits,
          histogram: scpi.engine.meter.histogram,
          beeping: scpi.engine.meter.beeping,
          isPowered: scpi.engine.meter.isPowered,
          isRunning: scpi.engine.meter.isRunning,
          triggerSource: scpi.engine.meter.triggerSource,
          input: scpi.engine.meter.input,
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    // 2. SCPI Command Execution
    if (url.pathname === "/api/dmm/command" && req.method === "POST") {
      try {
        const { command } = await req.json();
        const response = scpi.engine.execute(command);
        return new Response(JSON.stringify({ success: true, response }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // 3. Update Simulated Physical Inputs
    if (url.pathname === "/api/dmm/input" && req.method === "POST") {
      try {
        const data = await req.json();
        Object.assign(scpi.engine.meter.input, data);
        return new Response(JSON.stringify({ success: true, input: scpi.engine.meter.input }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // 4. Front Panel Button Press
    if (url.pathname === "/api/dmm/frontpanel" && req.method === "POST") {
      try {
        const { button } = await req.json();
        const m = scpi.engine.meter;
        switch (button) {
          case "DCV":
            m.function = "VOLT:DC";
            break;
          case "ACV":
            m.function = "VOLT:AC";
            break;
          case "DCI":
            m.function = "CURR:DC";
            break;
          case "ACI":
            m.function = "CURR:AC";
            break;
          case "2W":
            m.function = "RES";
            break;
          case "4W":
            m.function = "FRES";
            break;
          case "CAP":
            m.function = "CAP";
            break;
          case "CONT":
            m.function = "CONT";
            break;
          case "DIOD":
            m.function = "DIOD";
            break;
          case "FREQ":
            m.function = "FREQ";
            break;
          case "PER":
            m.function = "PER";
            break;
          case "TEMP":
            m.function = "TEMP";
            break;
          case "DUAL":
            m.dualEnabled = !m.dualEnabled;
            break;
          case "RANGE_UP":
            m.rangeUp();
            break;
          case "RANGE_DOWN":
            m.rangeDown();
            break;
          case "AUTO_RANGE":
            m.autoRange = !m.autoRange;
            break;
          case "SPEED":
            if (m.speed === "SLOW") m.speed = "MED";
            else if (m.speed === "MED") m.speed = "FAST";
            else m.speed = "SLOW";
            break;
          case "MATH_STATS":
            m.statisticsEnabled = !m.statisticsEnabled;
            break;
          case "MATH_LIMIT":
            m.limits.enabled = !m.limits.enabled;
            break;
          case "MATH_NULL":
            m.nullEnabled = !m.nullEnabled;
            if (m.nullEnabled) m.nullValue = m.takeReading().value;
            break;
          case "MATH_DB":
            m.mathFunction = m.mathFunction === "DB" ? "NONE" : "DB";
            break;
          case "MATH_DBM":
            m.mathFunction = m.mathFunction === "DBM" ? "NONE" : "DBM";
            break;
          case "DISP_NUMBER":
            m.displayMode = "NUMBER";
            break;
          case "DISP_BAR":
            m.displayMode = "BAR";
            break;
          case "DISP_TREND":
            m.displayMode = "TREND";
            break;
          case "DISP_HIST":
            m.displayMode = "HISTOGRAM";
            break;
          case "TRIG_SINGLE":
            m.takeReading();
            break;
          case "RUN_STOP":
            m.isRunning = !m.isRunning;
            break;
          case "RESET":
            m.reset();
            break;
          case "POWER":
            m.isPowered = !m.isPowered;
            break;
        }
        return new Response(JSON.stringify({ success: true, function: m.function }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // 5. SCPI Bridge Endpoints
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
    const cli = new MultimeterCli(scpi.engine.meter);
    await cli.runInteractive();
  } else {
    Deno.serve({ port: 8000 }, handler);
  }
}
