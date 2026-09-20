import { assertEquals, assertMatch } from "@std/assert";
import { join } from "@std/path";

Deno.test("scripts/build_apk.ts builds a valid Alpine APK package", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "scpi-flow-test-apk-" });

  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-all",
        "scripts/build_apk.ts",
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

    const apkFile = join(tmpDir, "scpi-flow-1.2.3-r2.apk");
    const stat = await Deno.stat(apkFile);
    assertEquals(stat.isFile, true);

    // Verify .PKGINFO inside control archive
    const pkgInfoCmd = new Deno.Command("tar", {
      args: ["-zxf", apkFile, ".PKGINFO", "-O"],
      stdout: "piped",
      stderr: "piped",
    });
    const pkgInfoResult = await pkgInfoCmd.output();
    assertEquals(pkgInfoResult.success, true);
    const pkgInfoText = new TextDecoder().decode(pkgInfoResult.stdout);
    assertMatch(pkgInfoText, /pkgname\s*=\s*scpi-flow/);
    assertMatch(pkgInfoText, /pkgver\s*=\s*1\.2\.3-r2/);
    assertMatch(pkgInfoText, /arch\s*=\s*x86_64/);
    assertMatch(pkgInfoText, /license\s*=\s*GPL-3\.0-or-later/);
    assertMatch(pkgInfoText, /depend\s*=\s*gcompat/);

    // Verify APKBUILD file
    const apkbuildFile = join(tmpDir, "APKBUILD");
    const apkbuildStat = await Deno.stat(apkbuildFile);
    assertEquals(apkbuildStat.isFile, true);
    const apkbuildText = await Deno.readTextFile(apkbuildFile);
    assertMatch(apkbuildText, /pkgname="scpi-flow"/);
    assertMatch(apkbuildText, /pkgver="1\.2\.3"/);
    assertMatch(apkbuildText, /pkgrel=2/);
    assertMatch(apkbuildText, /depends="gcompat"/);

    // Verify payload contents using decompressing pipeline
    const listCmd = new Deno.Command("sh", {
      args: ["-c", `gzip -dc "${apkFile}" | tar -i -tvf -`],
      stdout: "piped",
      stderr: "piped",
    });
    const listResult = await listCmd.output();
    assertEquals(listResult.success, true);
    const listOutput = new TextDecoder().decode(listResult.stdout);
    assertMatch(listOutput, /\.PKGINFO/);
    assertMatch(listOutput, /usr\/bin\/scpi-flow/);
    assertMatch(listOutput, /usr\/share\/applications\/scpi-flow\.desktop/);
    assertMatch(
      listOutput,
      /usr\/share\/icons\/hicolor\/scalable\/apps\/scpi-flow\.svg/,
    );
    assertMatch(listOutput, /usr\/share\/pixmaps\/scpi-flow\.svg/);
    assertMatch(listOutput, /usr\/share\/licenses\/scpi-flow\/LICENSE/);
    assertMatch(listOutput, /usr\/share\/doc\/scpi-flow\/CHANGELOG\.md/);
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // Ignore cleanup error
    }
  }
});
