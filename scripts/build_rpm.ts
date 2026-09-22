#!/usr/bin/env -S deno run --allow-all
/**
 * RPM packaging script for SCPI-flow (x86_64 Linux).
 * Assembles the RPM package structure and builds it using rpmbuild.
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
  console.log(`Usage: deno run --allow-all scripts/build_rpm.ts [options]

Options:
  -v, --version <semver>      Package version (default: parsed from CHANGELOG.md)
  -r, --release <string>      Package release number (default: 1)
  -b, --binary <path>         Path to compiled scpi-flow binary
  -o, --output-dir <path>     Directory where the .rpm package will be written (default: ./dist/bin)
  -c, --compile               Compile the binary first before packaging
  -h, --help                  Show this help message
`);
  Deno.exit(0);
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
// RPM versions cannot contain dashes (must use alphanumeric and dot)
const version = rawVersion.replace(/-/g, ".");
const release = flags.release;
console.log(
  `Building RPM package for SCPI-flow version: ${version}-${release}`,
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

// 3. Prepare temporary RPM build directories
const packageName = "scpi-flow";
const arch = "x86_64";
const rpmFileName = `${packageName}-${version}-${release}.${arch}.rpm`;
const topDir = await Deno.makeTempDir({ prefix: "scpi-flow-rpm-" });

try {
  const buildDir = join(topDir, "BUILD");
  const buildRootDir = join(topDir, "BUILDROOT");
  const rpmsDir = join(topDir, "RPMS");
  const sourcesDir = join(topDir, "SOURCES");
  const specsDir = join(topDir, "SPECS");
  const srpmsDir = join(topDir, "SRPMS");

  await ensureDir(buildDir);
  await ensureDir(buildRootDir);
  await ensureDir(rpmsDir);
  await ensureDir(sourcesDir);
  await ensureDir(specsDir);
  await ensureDir(srpmsDir);

  // Staged install tree under SOURCES or direct copy in spec %install
  const payloadDir = join(topDir, "PAYLOAD");
  const usrBinDir = join(payloadDir, "usr", "bin");
  const usrShareAppsDir = join(payloadDir, "usr", "share", "applications");
  const usrShareIconsDir = join(
    payloadDir,
    "usr",
    "share",
    "icons",
    "hicolor",
    "scalable",
    "apps",
  );
  const usrSharePixmapsDir = join(payloadDir, "usr", "share", "pixmaps");
  const usrShareDocDir = join(payloadDir, "usr", "share", "doc", packageName);
  const usrShareLicensesDir = join(
    payloadDir,
    "usr",
    "share",
    "licenses",
    packageName,
  );

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

  // Generate RPM spec file
  const specContent = `Name:           ${packageName}
Version:        ${version}
Release:        ${release}%{?dist}
Summary:        Instrument-independent visual dataflow workspace and SCPI instrument controller

License:        GPL-3.0-or-later
URL:            https://github.com/scpi-flow/scpi-flow
Group:          Development/Tools

AutoReqProv:    no
%define __strip /bin/true
%define __os_install_post %{nil}
%define _build_id_links none
%define debug_package %{nil}
%define _enable_debug_packages 0

%description
SCPI-flow is a standalone application for controlling and monitoring
experimental instruments. It features a graphical workspace allowing users
to drag and drop instruments (oscilloscopes, multimeters, signal generators,
and custom plug-ins) to create data flow diagrams and automate measurements
via visual controls or the Model Context Protocol (MCP).

%install
mkdir -p %{buildroot}
cp -a ${payloadDir}/* %{buildroot}/

%files
/usr/bin/scpi-flow
/usr/share/applications/scpi-flow.desktop
/usr/share/icons/hicolor/scalable/apps/scpi-flow.svg
/usr/share/pixmaps/scpi-flow.svg
%dir /usr/share/doc/%{name}
/usr/share/doc/%{name}/CHANGELOG.md
%dir /usr/share/licenses/%{name}
/usr/share/licenses/%{name}/LICENSE
`;

  const specPath = join(specsDir, `${packageName}.spec`);
  await Deno.writeTextFile(specPath, specContent);

  // 4. Build RPM package using rpmbuild
  console.log(`Executing rpmbuild...`);
  const rpmbuildCmd = new Deno.Command("rpmbuild", {
    args: [
      "-bb",
      "--define",
      `_topdir ${topDir}`,
      "--define",
      `_tmppath ${topDir}`,
      "--target",
      arch,
      specPath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const rpmbuildResult = await rpmbuildCmd.output();
  if (!rpmbuildResult.success) {
    const errorText = new TextDecoder().decode(rpmbuildResult.stderr);
    console.error(`rpmbuild failed: ${errorText}`);
    Deno.exit(1);
  }

  // Locate generated RPM file
  const generatedRpmPath = join(rpmsDir, arch, rpmFileName);
  const rpmStat = await Deno.stat(generatedRpmPath);
  if (!rpmStat.isFile) {
    console.error(`Expected RPM not found at ${generatedRpmPath}`);
    Deno.exit(1);
  }

  // 5. Copy to output directory
  const outDir = flags["output-dir"];
  await ensureDir(outDir);
  const finalRpmPath = join(outDir, rpmFileName);
  await Deno.copyFile(generatedRpmPath, finalRpmPath);

  // Calculate and write SHA-256 digest file
  const rpmData = await Deno.readFile(finalRpmPath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", rpmData);
  const sha256Hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const sha256Path = `${finalRpmPath}.sha256`;
  await Deno.writeTextFile(sha256Path, `${sha256Hex}  ${rpmFileName}\n`);

  console.log(`Successfully generated RPM package: ${finalRpmPath}`);
  console.log(`SHA-256 Digest (${rpmFileName}): ${sha256Hex}`);
} finally {
  // Clean up temporary directory
  try {
    await Deno.remove(topDir, { recursive: true });
  } catch {
    // Ignore cleanup error
  }
}
