import { assertEquals, assertMatch } from "@std/assert";
import { join } from "@std/path";

Deno.test("scripts/build_rpm.ts builds a valid RPM package", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "scpi-flow-test-rpm-" });

  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-all",
        "scripts/build_rpm.ts",
        "--version",
        "1.2.3",
        "--release",
        "2",
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

    const rpmFile = join(tmpDir, "scpi-flow-1.2.3-2.x86_64.rpm");
    const stat = await Deno.stat(rpmFile);
    assertEquals(stat.isFile, true);

    // Verify info with rpm -qip
    const infoCmd = new Deno.Command("rpm", {
      args: ["-qip", rpmFile],
      stdout: "piped",
      stderr: "piped",
    });
    const infoResult = await infoCmd.output();
    assertEquals(infoResult.success, true);
    const infoOutput = new TextDecoder().decode(infoResult.stdout);
    assertMatch(infoOutput, /Name\s*:\s*scpi-flow/);
    assertMatch(infoOutput, /Version\s*:\s*1\.2\.3/);
    assertMatch(infoOutput, /Release\s*:\s*2/);
    assertMatch(infoOutput, /Architecture\s*:\s*x86_64/);

    // Verify contents with rpm -qlp
    const contentsCmd = new Deno.Command("rpm", {
      args: ["-qlp", rpmFile],
      stdout: "piped",
      stderr: "piped",
    });
    const contentsResult = await contentsCmd.output();
    assertEquals(contentsResult.success, true);
    const contentsOutput = new TextDecoder().decode(contentsResult.stdout);
    assertMatch(contentsOutput, /\/usr\/bin\/scpi-flow/);
    assertMatch(
      contentsOutput,
      /\/usr\/share\/applications\/scpi-flow\.desktop/,
    );
    assertMatch(
      contentsOutput,
      /\/usr\/share\/icons\/hicolor\/scalable\/apps\/scpi-flow\.svg/,
    );
    assertMatch(contentsOutput, /\/usr\/share\/pixmaps\/scpi-flow\.svg/);
    assertMatch(contentsOutput, /\/usr\/share\/licenses\/scpi-flow\/LICENSE/);
    assertMatch(contentsOutput, /\/usr\/share\/doc\/scpi-flow\/CHANGELOG\.md/);
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // Ignore cleanup error
    }
  }
});
