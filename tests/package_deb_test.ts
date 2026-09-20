import { assertEquals, assertMatch } from "@std/assert";
import { join } from "@std/path";

Deno.test("scripts/build_deb.ts builds a valid Debian package", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "scpi-flow-test-deb-" });

  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-all",
        "scripts/build_deb.ts",
        "--version",
        "1.2.3",
        "--output-dir",
        tmpDir,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await cmd.output();
    assertEquals(
      result.success,
      true,
      new TextDecoder().decode(result.stderr),
    );

    const debFile = join(tmpDir, "scpi-flow_1.2.3_amd64.deb");
    const stat = await Deno.stat(debFile);
    assertEquals(stat.isFile, true);

    // Verify info with dpkg-deb -I
    const infoCmd = new Deno.Command("dpkg-deb", {
      args: ["-I", debFile],
      stdout: "piped",
      stderr: "piped",
    });
    const infoResult = await infoCmd.output();
    assertEquals(infoResult.success, true);
    const infoOutput = new TextDecoder().decode(infoResult.stdout);
    assertMatch(infoOutput, /Package:\s*scpi-flow/);
    assertMatch(infoOutput, /Version:\s*1\.2\.3/);
    assertMatch(infoOutput, /Architecture:\s*amd64/);

    // Verify contents with dpkg-deb -c
    const contentsCmd = new Deno.Command("dpkg-deb", {
      args: ["-c", debFile],
      stdout: "piped",
      stderr: "piped",
    });
    const contentsResult = await contentsCmd.output();
    assertEquals(contentsResult.success, true);
    const contentsOutput = new TextDecoder().decode(contentsResult.stdout);
    assertMatch(contentsOutput, /\.\/usr\/bin\/scpi-flow/);
    assertMatch(
      contentsOutput,
      /\.\/usr\/share\/applications\/scpi-flow\.desktop/,
    );
    assertMatch(
      contentsOutput,
      /\.\/usr\/share\/icons\/hicolor\/scalable\/apps\/scpi-flow\.svg/,
    );
    assertMatch(contentsOutput, /\.\/usr\/share\/pixmaps\/scpi-flow\.svg/);
    assertMatch(contentsOutput, /\.\/usr\/share\/doc\/scpi-flow\/copyright/);
    assertMatch(
      contentsOutput,
      /\.\/usr\/share\/doc\/scpi-flow\/changelog\.Debian/,
    );
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // Ignore cleanup error
    }
  }
});
