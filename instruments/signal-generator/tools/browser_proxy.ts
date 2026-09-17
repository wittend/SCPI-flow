/** Development-only iframe/proxy harness; the plugin itself never imports this file. */
import manifest from "../instrument.json" with { type: "json" };
import { handler } from "../plugin.ts";
const prefix = `/plugins/${manifest.id}/`;
Deno.serve({ hostname: "127.0.0.1", port: Number(Deno.args[0] ?? 8100) }, (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith(prefix)) {
    url.pathname = "/" + url.pathname.slice(prefix.length);
    return handler(new Request(url, req));
  }
  return new Response(
    `<!DOCTYPE html><html><head><title>Plugin iframe check</title></head>
    <body style="margin:0"><iframe title="${manifest.name}" sandbox="allow-scripts allow-same-origin"
    src="${prefix}${manifest.frontend}" style="border:0;width:100vw;height:100vh"></iframe></body></html>`,
    { headers: { "content-type": "text/html" } },
  );
});
