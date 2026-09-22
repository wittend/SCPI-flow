#!/usr/bin/env -S deno run --allow-all
/**
 * Debian packaging script for SCPI-flow (amd64 Linux).
 * Assembles the .deb package structure and builds it using dpkg-deb.
 */

import { parseArgs } from "@std/cli";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const flags = parseArgs(Deno.args, {
  string: ["version", "output-dir", "binary"],
  boolean: ["compile", "help"],
  alias: {
    v: "version",
    o: "output-dir",
    b: "binary",
    c: "compile",
    h: "help",
  },
  default: {
    "output-dir": "./dist/bin",
    binary: "./dist/bin/scpi-flow",
    compile: false,
  },
});

if (flags.help) {
  console.log(`Usage: deno run --allow-all scripts/build_deb.ts [options]

Options:
  -v, --version <semver>      Package version (default: parsed from CHANGELOG.md)
  -b, --binary <path>         Path to compiled scpi-flow binary
  -o, --output-dir <path>     Directory where the .deb package will be written (default: ./dist/bin)
  -c, --compile               Compile the binary first before packaging
  -h, --help                  Show this help message
`);
  Deno.exit(0);
}

async function getDirSizeKiB(dir: string): Promise<number> {
  let totalBytes = 0;
  for await (const entry of Deno.readDir(dir)) {
    const entryPath = join(dir, entry.name);
    if (entry.name === "DEBIAN") continue;
    const stat = await Deno.lstat(entryPath);
    if (stat.isDirectory) {
      totalBytes += (await getDirSizeKiB(entryPath)) * 1024;
    } else if (stat.isFile) {
      totalBytes += stat.size;
    }
  }
  return Math.ceil(totalBytes / 1024);
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

const version = getVersion();
console.log(`Building Debian package for SCPI-flow version: ${version}`);

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

// 3. Prepare temporary package root directory
const packageName = "scpi-flow";
const arch = "amd64";
const debFileName = `${packageName}_${version}_${arch}.deb`;
const stagingDir = await Deno.makeTempDir({ prefix: "scpi-flow-deb-" });

try {
  const usrBinDir = join(stagingDir, "usr", "bin");
  const usrShareAppsDir = join(stagingDir, "usr", "share", "applications");
  const usrShareIconsDir = join(
    stagingDir,
    "usr",
    "share",
    "icons",
    "hicolor",
    "scalable",
    "apps",
  );
  const usrSharePixmapsDir = join(stagingDir, "usr", "share", "pixmaps");
  const usrShareDocDir = join(stagingDir, "usr", "share", "doc", packageName);
  const debianDir = join(stagingDir, "DEBIAN");

  await ensureDir(usrBinDir);
  await ensureDir(usrShareAppsDir);
  await ensureDir(usrShareIconsDir);
  await ensureDir(usrSharePixmapsDir);
  await ensureDir(usrShareDocDir);
  await ensureDir(debianDir);

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

  // Copy copyright / license & changelog
  if (await Deno.stat("LICENSE").then(() => true).catch(() => false)) {
    await Deno.copyFile("LICENSE", join(usrShareDocDir, "copyright"));
    await Deno.chmod(join(usrShareDocDir, "copyright"), 0o644);
  }
  if (await Deno.stat("CHANGELOG.md").then(() => true).catch(() => false)) {
    await Deno.copyFile(
      "CHANGELOG.md",
      join(usrShareDocDir, "changelog.Debian"),
    );
    await Deno.chmod(join(usrShareDocDir, "changelog.Debian"), 0o644);
  }

  // Calculate installed size in KiB
  const installedSize = await getDirSizeKiB(stagingDir);

  // Create DEBIAN/control
  const controlContent = `Package: ${packageName}
Version: ${version}
Section: electronics
Priority: optional
Architecture: ${arch}
Installed-Size: ${installedSize}
Maintainer: SCPI-flow Team <info@scpi-flow.local>
Homepage: https://github.com/scpi-flow/scpi-flow
Description: Instrument-independent visual dataflow workspace and SCPI controller
 SCPI-flow is a standalone application for controlling and monitoring
 experimental instruments. It features a graphical workspace allowing users
 to drag and drop instruments (oscilloscopes, multimeters, signal generators,
 and custom plug-ins) to create data flow diagrams and automate measurements
 via visual controls or the Model Context Protocol (MCP).
`;

  await Deno.writeTextFile(join(debianDir, "control"), controlContent);
  await Deno.chmod(join(debianDir, "control"), 0o644);

  // 4. Output directory
  const outDir = flags["output-dir"];
  await ensureDir(outDir);
  const finalDebPath = join(outDir, debFileName);

  // 5. Build .deb package using dpkg-deb
  console.log(`Packing .deb into ${finalDebPath}...`);
  const dpkgCmd = new Deno.Command("dpkg-deb", {
    args: ["--build", "--root-owner-group", stagingDir, finalDebPath],
    stdout: "piped",
    stderr: "piped",
  });

  const dpkgResult = await dpkgCmd.output();
  if (!dpkgResult.success) {
    const errorText = new TextDecoder().decode(dpkgResult.stderr);
    console.error(`dpkg-deb failed: ${errorText}`);
    Deno.exit(1);
  }

  // Calculate and write SHA-256 digest file
  const debData = await Deno.readFile(finalDebPath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", debData);
  const sha256Hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const sha256Path = `${finalDebPath}.sha256`;
  await Deno.writeTextFile(sha256Path, `${sha256Hex}  ${debFileName}\n`);

  console.log(`Successfully generated Debian package: ${finalDebPath}`);
  console.log(`SHA-256 Digest (${debFileName}): ${sha256Hex}`);
} finally {
  // Clean up temporary directory
  try {
    await Deno.remove(stagingDir, { recursive: true });
  } catch {
    // Ignore cleanup error
  }
}
