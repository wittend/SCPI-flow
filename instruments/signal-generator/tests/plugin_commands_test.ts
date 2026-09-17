import { assert, assertEquals } from "@std/assert";
import { createPlugin } from "../plugin.ts";

Deno.test("generator commands control real backend state, not only the front panel", async () => {
  const handler = createPlugin();
  const command = (command: string) =>
    handler(
      new Request("http://localhost/command", {
        method: "POST",
        body: JSON.stringify({ command }),
      }),
    );
  for (const text of ["FREQ 5000", "VOLT 2", "FUNC SQU", "C1:OUTP OFF"]) {
    assertEquals((await command(text)).status, 200);
  }
  assertEquals((await (await command("FREQ?")).json()).response, "5000");
  const disabled = await (await handler(new Request("http://localhost/api/gen/preview"))).json();
  assertEquals(disabled.type, "square");
  assert(disabled.voltage.every((v: number) => v === 0));
  await command("OUTP ON");
  const enabled = await (await handler(new Request("http://localhost/api/gen/preview"))).json();
  assertEquals(enabled.time.length, 400);
  assertEquals(Math.max(...enabled.voltage), 2);
  assertEquals(Math.min(...enabled.voltage), -2);
  assertEquals((await command("NOT:A:COMMAND")).status, 400);
  assertEquals((await (await command("SYST:ERR?")).json()).response, '-113,"Undefined header"');
  assertEquals((await command("FREQ Infinity")).status, 400);
  assertEquals((await (await command("FREQ?")).json()).response, "5000");
});
