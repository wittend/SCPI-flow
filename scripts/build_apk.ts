#!/usr/bin/env -S deno run --allow-all
/**
 * Alpine Linux APK packaging script for SCPI-flow (x86_64).
 * Assembles the .apk package structure (control .PKGINFO + data filesystem)
 * and builds the APK package.
 */

import { parseArgs } from "@std/cli";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const flags = parseArgs(Deno.args, {
  string: ["version", "release", "output-dir", "binary"],
  boolean: ["compile", "help"],
  alias: {
    v: "version",
    r: "release",
    o: "output-dir",
    b: "binary",
    c: "compile",
    h: "help",
  },
  default: {
    release: "1",
    "output-dir": "./dist/bin",
    binary: "./dist/bin/scpi-flow",
    compile: false,
  },
});

if (flags.help) {
  console.log(`Usage: deno run --allow-all scripts/build_apk.ts [options]

Options:
  -v, --version <semver>      Package version (default: parsed from CHANGELOG.md)
  -r, --release <string>      Package release number (default: 1)
  -b, --binary <path>         Path to compiled scpi-flow binary
  -o, --output-dir <path>     Directory where the .apk package will be written (default: ./dist/bin)
  -c, --compile               Compile the binary first before packaging
  -h, --help                  Show this help message
`);
  Deno.exit(0);
}

async function getDirSizeBytes(dir: string): Promise<number> {
  let totalBytes = 0;
  for await (const entry of Deno.readDir(dir)) {
    const entryPath = join(dir, entry.name);
    const stat = await Deno.lstat(entryPath);
    if (stat.isDirectory) {
      totalBytes += await getDirSizeBytes(entryPath);
    } else if (stat.isFile) {
      totalBytes += stat.size;
    }
  }
  return totalBytes;
}

// 1. Determine version
function getVersion(): string {
  if (flags.version) return flags.version;

  // Try parsing from deno.json if present
  try {
    const denoJsonText = Deno.readTextFileSync("deno.json");
    const parsed = JSON.parse(denoJsonText);
    if (parsed.version && typeof parsed.version === "string") {
      return parsed.version;
    }
  } catch {
    // Ignore
  }

  // Parse latest release version from CHANGELOG.md
  try {
    const changelog = Deno.readTextFileSync("CHANGELOG.md");
    const match = changelog.match(/##\s+\[([0-9]+\.[0-9]+\.[0-9]+[^\]]*)\]/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {
    // Ignore
  }

  return "0.8.0";
}

const rawVersion = getVersion();
// Alpine versions must follow standard naming without trailing pre-release dashes if possible
const version = rawVersion.replace(/-/g, ".");
const release = flags.release;
console.log(
  `Building Alpine APK package for SCPI-flow version: ${version}-r${release}`,
);

// 2. Compile if requested or if binary doesn't exist
const binaryPath = flags.binary;
let binaryExists = false;
try {
  const stat = await Deno.stat(binaryPath);
  binaryExists = stat.isFile;
} catch {
  binaryExists = false;
}

if (flags.compile || !binaryExists) {
  console.log("Compiling binary using 'deno task compile'...");
  const cmd = new Deno.Command("deno", {
    args: ["task", "compile"],
    stdout: "inherit",
    stderr: "inherit",
  });
  const output = await cmd.output();
  if (!output.success) {
    console.error("Compilation failed");
    Deno.exit(1);
  }
}

// Ensure the binary exists now
const binStat = await Deno.stat(binaryPath);
if (!binStat.isFile) {
  console.error(`Binary not found at ${binaryPath}`);
  Deno.exit(1);
}

// 3. Prepare staging directories
const packageName = "scpi-flow";
const arch = "x86_64";
const apkFileName = `${packageName}-${version}-r${release}.apk`;
const stagingDir = await Deno.makeTempDir({ prefix: "scpi-flow-apk-" });

try {
  const controlDir = join(stagingDir, "control");
  const dataDir = join(stagingDir, "data");

  const usrBinDir = join(dataDir, "usr", "bin");
  const usrShareAppsDir = join(dataDir, "usr", "share", "applications");
  const usrShareIconsDir = join(
    dataDir,
    "usr",
    "share",
    "icons",
    "hicolor",
    "scalable",
    "apps",
  );
  const usrSharePixmapsDir = join(dataDir, "usr", "share", "pixmaps");
  const usrShareDocDir = join(dataDir, "usr", "share", "doc", packageName);
  const usrShareLicensesDir = join(
    dataDir,
    "usr",
    "share",
    "licenses",
    packageName,
  );

  await ensureDir(controlDir);
  await ensureDir(usrBinDir);
  await ensureDir(usrShareAppsDir);
  await ensureDir(usrShareIconsDir);
  await ensureDir(usrSharePixmapsDir);
  await ensureDir(usrShareDocDir);
  await ensureDir(usrShareLicensesDir);

  // Copy binary
  const destBinary = join(usrBinDir, "scpi-flow");
  await Deno.copyFile(binaryPath, destBinary);
  await Deno.chmod(destBinary, 0o755);

  // Determine icon source
  const iconSrc = "instruments/oscilloscope/assets/icons/oscilloscope.svg";
  const iconDestScalable = join(usrShareIconsDir, "scpi-flow.svg");
  const iconDestPixmaps = join(usrSharePixmapsDir, "scpi-flow.svg");

  if (await Deno.stat(iconSrc).then(() => true).catch(() => false)) {
    await Deno.copyFile(iconSrc, iconDestScalable);
    await Deno.copyFile(iconSrc, iconDestPixmaps);
    await Deno.chmod(iconDestScalable, 0o644);
    await Deno.chmod(iconDestPixmaps, 0o644);
  }

  // Create .desktop file
  const desktopContent = `[Desktop Entry]
Name=SCPI-flow
Comment=Instrument-independent visual dataflow workspace and SCPI instrument controller
Exec=/usr/bin/scpi-flow %U
Icon=scpi-flow
Terminal=false
Type=Application
Categories=Development;Electronics;Engineering;Science;
Keywords=SCPI;instrument;oscilloscope;multimeter;signal-generator;test;measurement;
StartupNotify=true
`;
  await Deno.writeTextFile(
    join(usrShareAppsDir, "scpi-flow.desktop"),
    desktopContent,
  );
  await Deno.chmod(join(usrShareAppsDir, "scpi-flow.desktop"), 0o644);

  // Copy license & changelog
  if (await Deno.stat("LICENSE").then(() => true).catch(() => false)) {
    await Deno.copyFile("LICENSE", join(usrShareLicensesDir, "LICENSE"));
    await Deno.chmod(join(usrShareLicensesDir, "LICENSE"), 0o644);
  }
  if (await Deno.stat("CHANGELOG.md").then(() => true).catch(() => false)) {
    await Deno.copyFile(
      "CHANGELOG.md",
      join(usrShareDocDir, "CHANGELOG.md"),
    );
    await Deno.chmod(join(usrShareDocDir, "CHANGELOG.md"), 0o644);
  }

  // Calculate installed size in bytes
  const installedSizeBytes = await getDirSizeBytes(dataDir);
  const buildDate = Math.floor(Date.now() / 1000);

  // Generate .PKGINFO
  const pkgInfoContent = `# Generated by build_apk.ts
pkgname = ${packageName}
pkgver = ${version}-r${release}
pkgdesc = Instrument-independent visual dataflow workspace and SCPI instrument controller
url = https://github.com/scpi-flow/scpi-flow
builddate = ${buildDate}
packager = SCPI-flow Team <info@scpi-flow.local>
size = ${installedSizeBytes}
arch = ${arch}
origin = ${packageName}
maintainer = SCPI-flow Team <info@scpi-flow.local>
license = GPL-3.0-or-later
depend = gcompat
`;

  const pkgInfoPath = join(controlDir, ".PKGINFO");
  await Deno.writeTextFile(pkgInfoPath, pkgInfoContent);
  await Deno.chmod(pkgInfoPath, 0o644);

  // Also create APKBUILD recipe file for reference/building with abuild
  const apkbuildContent = `# Contributor: SCPI-flow Team <info@scpi-flow.local>
# Maintainer: SCPI-flow Team <info@scpi-flow.local>
pkgname="${packageName}"
pkgver="${version}"
pkgrel=${release}
pkgdesc="Instrument-independent visual dataflow workspace and SCPI instrument controller"
url="https://github.com/scpi-flow/scpi-flow"
arch="${arch}"
license="GPL-3.0-or-later"
depends="gcompat"
options="!strip"

package() {
	mkdir -p "$pkgdir"/usr/bin \\
		"$pkgdir"/usr/share/applications \\
		"$pkgdir"/usr/share/icons/hicolor/scalable/apps \\
		"$pkgdir"/usr/share/pixmaps \\
		"$pkgdir"/usr/share/doc/"$pkgname" \\
		"$pkgdir"/usr/share/licenses/"$pkgname"

	install -m755 "$srcdir"/scpi-flow "$pkgdir"/usr/bin/scpi-flow
	install -m644 "$srcdir"/scpi-flow.desktop "$pkgdir"/usr/share/applications/scpi-flow.desktop
	install -m644 "$srcdir"/scpi-flow.svg "$pkgdir"/usr/share/icons/hicolor/scalable/apps/scpi-flow.svg
	install -m644 "$srcdir"/scpi-flow.svg "$pkgdir"/usr/share/pixmaps/scpi-flow.svg
	install -m644 "$srcdir"/CHANGELOG.md "$pkgdir"/usr/share/doc/"$pkgname"/CHANGELOG.md
	install -m644 "$srcdir"/LICENSE "$pkgdir"/usr/share/licenses/"$pkgname"/LICENSE
}
`;

  // 4. Archive control and data streams
  const controlTarGz = join(stagingDir, "control.tar.gz");
  const dataTarGz = join(stagingDir, "data.tar.gz");

  // Create control.tar.gz
  const controlTarCmd = new Deno.Command("tar", {
    args: [
      "--numeric-owner",
      "--owner=0",
      "--group=0",
      "-czf",
      controlTarGz,
      "-C",
      controlDir,
      ".PKGINFO",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const controlResult = await controlTarCmd.output();
  if (!controlResult.success) {
    const errorText = new TextDecoder().decode(controlResult.stderr);
    console.error(`Failed to create control archive: ${errorText}`);
    Deno.exit(1);
  }

  // Create data.tar.gz
  const dataTarCmd = new Deno.Command("tar", {
    args: [
      "--numeric-owner",
      "--owner=0",
      "--group=0",
      "-czf",
      dataTarGz,
      "-C",
      dataDir,
      "usr",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const dataResult = await dataTarCmd.output();
  if (!dataResult.success) {
    const errorText = new TextDecoder().decode(dataResult.stderr);
    console.error(`Failed to create data archive: ${errorText}`);
    Deno.exit(1);
  }

  // 5. Output directory & concatenate streams into .apk
  const outDir = flags["output-dir"];
  await ensureDir(outDir);
  const finalApkPath = join(outDir, apkFileName);
  const finalApkbuildPath = join(outDir, "APKBUILD");

  console.log(`Packing Alpine APK into ${finalApkPath}...`);
  const controlBytes = await Deno.readFile(controlTarGz);
  const dataBytes = await Deno.readFile(dataTarGz);
  const combined = new Uint8Array(controlBytes.length + dataBytes.length);
  combined.set(controlBytes, 0);
  combined.set(dataBytes, controlBytes.length);

  await Deno.writeFile(finalApkPath, combined);
  await Deno.writeTextFile(finalApkbuildPath, apkbuildContent);

  // Calculate and write SHA-256 digest file
  const apkData = await Deno.readFile(finalApkPath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", apkData);
  const sha256Hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const sha256Path = `${finalApkPath}.sha256`;
  await Deno.writeTextFile(sha256Path, `${sha256Hex}  ${apkFileName}\n`);

  console.log(`Successfully generated Alpine APK package: ${finalApkPath}`);
  console.log(`SHA-256 Digest (${apkFileName}): ${sha256Hex}`);
} finally {
  // Clean up temporary directory
  try {
    await Deno.remove(stagingDir, { recursive: true });
  } catch {
    // Ignore cleanup error
  }
}
