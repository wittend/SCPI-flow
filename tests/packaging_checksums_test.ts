import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import {
  calculateSha256,
  generateChecksumsForDir,
} from "../scripts/generate_checksums.ts";

Deno.test("packaging - calculateSha256 produces valid 64-char hex string", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "sha256-test-" });
  try {
    const testFile = join(tempDir, "sample.bin");
    await Deno.writeTextFile(testFile, "hello scpi-flow");
    const hash = await calculateSha256(testFile);
    assertEquals(hash.length, 64);
    assertEquals(
      hash,
      "bb544e481500a96b50b1ae72ee8deb5a4afff4033973c09d56283aa0e4206cda",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("packaging - generateChecksumsForDir generates individual .sha256 files and SHA256SUMS", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "checksums-dir-test-" });
  try {
    const pkg1 = join(tempDir, "scpi-flow_0.0.1-alpha_amd64.deb");
    const pkg2 = join(tempDir, "scpi-flow-0.0.1.alpha-1.x86_64.rpm");
    const pkg3 = join(tempDir, "scpi-flow-0.0.1.alpha-r1.apk");

    await Deno.writeTextFile(pkg1, "fake deb content");
    await Deno.writeTextFile(pkg2, "fake rpm content");
    await Deno.writeTextFile(pkg3, "fake apk content");

    const map = await generateChecksumsForDir(tempDir);
    assertEquals(map.size, 3);
    assertExists(map.get("scpi-flow_0.0.1-alpha_amd64.deb"));
    assertExists(map.get("scpi-flow-0.0.1.alpha-1.x86_64.rpm"));
    assertExists(map.get("scpi-flow-0.0.1.alpha-r1.apk"));

    // Verify .sha256 files exist
    const debShaText = await Deno.readTextFile(`${pkg1}.sha256`);
    assertEquals(
      debShaText.trim(),
      `${
        map.get("scpi-flow_0.0.1-alpha_amd64.deb")
      }  scpi-flow_0.0.1-alpha_amd64.deb`,
    );

    const sumsText = await Deno.readTextFile(join(tempDir, "SHA256SUMS"));
    const lines = sumsText.trim().split("\n");
    assertEquals(lines.length, 3);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
