import { serveDir } from "jsr:@std/http/file-server";
import { ScpiBridge } from "./scpi_bridge.ts";

const scpi = new ScpiBridge();
try {
  await scpi.start();
  console.log("SCPI Bridge started");
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
        return new Response(content, { headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to load palette" }), { 
          status: 500, 
          headers: { "content-type": "application/json" } 
        });
      }
    }

    // GET /api/obj/:guid
    const objMatch = url.pathname.match(/^\/api\/obj\/([a-f0-9-]+)$/);
    if (objMatch && req.method === "GET") {
      const guid = objMatch[1];
      try {
        const content = await Deno.readTextFile(`./obj/${guid}_obj.json`);
        return new Response(content, { headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Object not found" }), { 
          status: 404, 
          headers: { "content-type": "application/json" } 
        });
      }
    }

    // GET /api/projects/:name
    const prjMatch = url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
    if (prjMatch) {
      const name = prjMatch[1];
      const filePath = `./projects/${name}_prj.json`;
      
      if (req.method === "GET") {
        try {
          const content = await Deno.readTextFile(filePath);
          return new Response(content, { headers: { "content-type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: "Project not found" }), { 
            status: 404, 
            headers: { "content-type": "application/json" } 
          });
        }
      }

      if (req.method === "POST") {
        try {
          const body = await req.text();
          // Basic validation (optional, but good practice)
          JSON.parse(body);
          await Deno.writeTextFile(filePath, body);
          return new Response(JSON.stringify({ success: true }), { headers: { "content-type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: "Failed to save project" }), { 
            status: 500, 
            headers: { "content-type": "application/json" } 
          });
        }
      }
    }

    // SCPI API
    if (url.pathname === "/api/scpi/resources") {
      const res = await scpi.listResources();
      return new Response(JSON.stringify(res), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/scpi/query" && req.method === "POST") {
      try {
        const { resource, query } = await req.json();
        const res = await scpi.query(resource, query);
        return new Response(JSON.stringify(res), { headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), { 
      status: 404, 
      headers: { "content-type": "application/json" } 
    });
  }

  // Serve static files from the root and assets directory
  return serveDir(req, {
    fsRoot: ".",
    showIndex: true,
  });
}

if (import.meta.main) {
  Deno.serve(handler);
}
