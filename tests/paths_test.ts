import { assertEquals, assertExists } from "@std/assert";
import {
  getOption,
  getOsBasePaths,
  removeInstanceState,
  resolveAppPaths,
  writeInstanceState,
} from "../src/paths.ts";

Deno.test("getOsBasePaths respects Linux XDG environment variables", () => {
  const customEnv = new Map([
    ["HOME", "/home/testuser"],
    ["XDG_CONFIG_HOME", "/custom/config"],
    ["XDG_DATA_HOME", "/custom/data"],
    ["XDG_STATE_HOME", "/custom/state"],
  ]);
  const paths = getOsBasePaths({
    os: "linux",
    env: { get: (k: string) => customEnv.get(k) },
  });
  assertEquals(paths.configDir, "/custom/config/SCPI-flow");
  assertEquals(paths.dataDir, "/custom/data/SCPI-flow");
  assertEquals(paths.stateDir, "/custom/state/SCPI-flow");
});

Deno.test("getOsBasePaths defaults to standard ~/.config, ~/.local/share, and ~/.local/state on Linux", () => {
  const customEnv = new Map([
    ["HOME", "/home/testuser"],
  ]);
  const paths = getOsBasePaths({
    os: "linux",
    env: { get: (k: string) => customEnv.get(k) },
  });
  assertEquals(paths.configDir, "/home/testuser/.config/SCPI-flow");
  assertEquals(paths.dataDir, "/home/testuser/.local/share/SCPI-flow");
  assertEquals(paths.stateDir, "/home/testuser/.local/state/SCPI-flow");
});

Deno.test("getOsBasePaths resolves Darwin and Windows paths", () => {
  const macPaths = getOsBasePaths({
    os: "darwin",
    env: { get: () => "/Users/testuser" },
  });
  assertEquals(
    macPaths.configDir,
    "/Users/testuser/Library/Application Support/SCPI-flow",
  );
  assertEquals(
    macPaths.dataDir,
    "/Users/testuser/Library/Application Support/SCPI-flow",
  );
  assertEquals(
    macPaths.stateDir,
    "/Users/testuser/Library/Application Support/SCPI-flow/state",
  );

  const winEnv = new Map([
    ["APPDATA", "C:\\Users\\testuser\\AppData\\Roaming"],
    ["LOCALAPPDATA", "C:\\Users\\testuser\\AppData\\Local"],
  ]);
  const winPaths = getOsBasePaths({
    os: "windows",
    env: { get: (k: string) => winEnv.get(k) },
  });
  assertEquals(
    winPaths.configDir,
    "C:/Users/testuser/AppData/Roaming/SCPI-flow",
  );
  assertEquals(
    winPaths.dataDir,
    "C:/Users/testuser/AppData/Roaming/SCPI-flow",
  );
  assertEquals(
    winPaths.stateDir,
    "C:/Users/testuser/AppData/Local/SCPI-flow/State",
  );
});

Deno.test("getOption parses long and short CLI options correctly", () => {
  const args = ["--port", "9000", "-i", "lab1", "--flag"];
  assertEquals(getOption(args, ["--port", "-p"]), "9000");
  assertEquals(getOption(args, ["--instance", "-i"]), "lab1");
  assertEquals(getOption(args, ["--missing"], "fallback"), "fallback");
  assertEquals(getOption(args, ["--flag"], "fallback"), "fallback");
});

Deno.test("resolveAppPaths prioritizes CLI flags over env and defaults", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "scpi-flow-test-" });
  try {
    const paths = await resolveAppPaths({
      args: [
        "--catalog",
        `${tempDir}/custom-catalog.json`,
        "--project-dir",
        `${tempDir}/my-projects`,
        "--state-dir",
        `${tempDir}/my-state`,
        "--instance",
        "custom-instance",
      ],
      os: "linux",
      cwd: tempDir,
      env: { get: () => undefined },
    });

    assertEquals(paths.catalogPath, `${tempDir}/custom-catalog.json`);
    assertEquals(paths.projectDirectory, `${tempDir}/my-projects`);
    assertEquals(paths.stateDir, `${tempDir}/my-state`);
    assertEquals(paths.instanceName, "custom-instance");
    assertEquals(
      paths.instanceStateDir,
      `${tempDir}/my-state/custom-instance`,
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveAppPaths prioritizes environment variables over standard XDG paths", async () => {
  const envMap = new Map([
    ["HOME", "/home/testuser"],
    ["SCPI_FLOW_CATALOG", "/env/path/instruments.json"],
    ["SCPI_FLOW_PROJECTS", "/env/path/projects"],
    ["SCPI_FLOW_STATE", "/env/path/state"],
    ["APP_INSTANCE", "env-instance"],
  ]);
  const paths = await resolveAppPaths({
    args: [],
    os: "linux",
    cwd: "/nonexistent-cwd",
    env: { get: (k: string) => envMap.get(k) },
  });

  assertEquals(paths.catalogPath, "/env/path/instruments.json");
  assertEquals(paths.projectDirectory, "/env/path/projects");
  assertEquals(paths.stateDir, "/env/path/state");
  assertEquals(paths.instanceName, "env-instance");
  assertEquals(paths.instanceStateDir, "/env/path/state/env-instance");
});

Deno.test("writeInstanceState and removeInstanceState manage instance metadata file lifecycle", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "scpi-flow-state-" });
  const instanceDir = `${tempDir}/inst-1`;
  try {
    await writeInstanceState(instanceDir, {
      pid: 12345,
      port: 8000,
      url: "http://127.0.0.1:8000",
      catalogPath: `${tempDir}/instruments.json`,
      projectDirectory: `${tempDir}/projects`,
      instanceName: "inst-1",
    });

    const content = JSON.parse(
      await Deno.readTextFile(`${instanceDir}/instance.json`),
    );
    assertEquals(content.pid, 12345);
    assertEquals(content.port, 8000);
    assertEquals(content.url, "http://127.0.0.1:8000");
    assertEquals(content.instanceName, "inst-1");
    assertExists(content.startedAt);

    await removeInstanceState(instanceDir);
    let exists = true;
    try {
      await Deno.stat(`${instanceDir}/instance.json`);
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});
