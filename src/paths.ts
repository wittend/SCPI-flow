export interface AppPaths {
  configDir: string;
  dataDir: string;
  stateDir: string;
  instanceName: string;
  instanceStateDir: string;
  catalogPath: string;
  projectDirectory: string;
}

export interface ResolveOptions {
  args?: string[];
  os?: string;
  cwd?: string;
  env?: {
    get(key: string): string | undefined;
  };
}

export function getOsBasePaths(options?: {
  os?: string;
  env?: { get(key: string): string | undefined };
}): { configDir: string; dataDir: string; stateDir: string } {
  const os = options?.os ?? Deno.build.os;
  const env = options?.env ?? {
    get: (key: string) => Deno.env.get(key),
  };

  const home = env.get("HOME") || env.get("USERPROFILE") || "/tmp";

  if (os === "windows") {
    const appData = env.get("APPDATA") || `${home}/AppData/Roaming`;
    const localAppData = env.get("LOCALAPPDATA") || `${home}/AppData/Local`;
    return {
      configDir: `${appData}/SCPI-flow`.replaceAll("\\", "/"),
      dataDir: `${appData}/SCPI-flow`.replaceAll("\\", "/"),
      stateDir: `${localAppData}/SCPI-flow/State`.replaceAll("\\", "/"),
    };
  }

  if (os === "darwin") {
    const appSupport = `${home}/Library/Application Support/SCPI-flow`;
    return {
      configDir: appSupport,
      dataDir: appSupport,
      stateDir: `${appSupport}/state`,
    };
  }

  // Linux, FreeBSD, OpenBSD, Solaris, etc. (XDG Base Directory Specification)
  const xdgConfig = env.get("XDG_CONFIG_HOME");
  const xdgData = env.get("XDG_DATA_HOME");
  const xdgState = env.get("XDG_STATE_HOME");

  const configBase = xdgConfig && xdgConfig.trim() !== ""
    ? xdgConfig
    : `${home}/.config`;
  const dataBase = xdgData && xdgData.trim() !== ""
    ? xdgData
    : `${home}/.local/share`;
  const stateBase = xdgState && xdgState.trim() !== ""
    ? xdgState
    : `${home}/.local/state`;

  return {
    configDir: `${configBase}/SCPI-flow`,
    dataDir: `${dataBase}/SCPI-flow`,
    stateDir: `${stateBase}/SCPI-flow`,
  };
}

export function getOption(
  args: string[],
  names: string[],
  fallback?: string,
): string | undefined {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith("-")) {
      return args[idx + 1];
    }
  }
  return fallback;
}

export async function resolveAppPaths(
  options?: ResolveOptions,
): Promise<AppPaths> {
  const args = options?.args ?? Deno.args;
  const env = options?.env ?? {
    get: (key: string) => Deno.env.get(key),
  };
  const cwd = (options?.cwd ?? Deno.cwd()).replaceAll("\\", "/");
  const basePaths = getOsBasePaths({ os: options?.os, env });

  const instanceName = getOption(args, ["--instance", "-i"]) ||
    env.get("APP_INSTANCE") ||
    env.get("SCPI_FLOW_INSTANCE") ||
    "default";

  // Catalog resolution
  let catalogPath: string;
  const cliCatalog = getOption(args, ["--catalog"]);
  const envCatalog = env.get("SCPI_FLOW_CATALOG");

  if (cliCatalog) {
    catalogPath = cliCatalog;
  } else if (envCatalog) {
    catalogPath = envCatalog;
  } else {
    // Check if running from dev/repo environment where ./instruments.json exists
    const cwdCatalog = `${cwd}/instruments.json`;
    let cwdHasCatalog = false;
    try {
      const stat = await Deno.stat(cwdCatalog);
      if (stat.isFile) cwdHasCatalog = true;
    } catch {
      // Not present in CWD
    }

    if (cwdHasCatalog) {
      catalogPath = cwdCatalog;
    } else {
      catalogPath = `${basePaths.configDir}/instruments.json`;
    }
  }

  // Project directory resolution
  let projectDirectory: string;
  const cliProjects = getOption(args, ["--project-dir", "--projects"]);
  const envProjects = env.get("SCPI_FLOW_PROJECTS");

  if (cliProjects) {
    projectDirectory = cliProjects;
  } else if (envProjects) {
    projectDirectory = envProjects;
  } else {
    const cwdProjects = `${cwd}/projects`;
    let cwdHasProjects = false;
    try {
      const stat = await Deno.stat(cwdProjects);
      if (stat.isDirectory) cwdHasProjects = true;
    } catch {
      // Not present in CWD
    }

    if (cwdHasProjects) {
      projectDirectory = cwdProjects;
    } else {
      projectDirectory = `${basePaths.dataDir}/projects`;
    }
  }

  // State directory resolution
  const cliStateDir = getOption(args, ["--state-dir"]);
  const envStateDir = env.get("SCPI_FLOW_STATE");
  const stateDir = cliStateDir || envStateDir || basePaths.stateDir;
  const instanceStateDir = `${stateDir}/${instanceName}`;

  return {
    configDir: basePaths.configDir,
    dataDir: basePaths.dataDir,
    stateDir,
    instanceName,
    instanceStateDir,
    catalogPath,
    projectDirectory,
  };
}

export async function writeInstanceState(
  instanceStateDir: string,
  state: {
    pid: number;
    port: number;
    url: string;
    catalogPath: string;
    projectDirectory: string;
    instanceName?: string;
  },
): Promise<void> {
  await Deno.mkdir(instanceStateDir, { recursive: true });
  const file = `${instanceStateDir}/instance.json`;
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const payload = {
    ...state,
    startedAt: new Date().toISOString(),
  };
  try {
    await Deno.writeTextFile(
      temporary,
      JSON.stringify(payload, null, 2) + "\n",
    );
    await Deno.rename(temporary, file);
  } finally {
    await Deno.remove(temporary).catch(() => {});
  }
}

export async function removeInstanceState(
  instanceStateDir: string,
): Promise<void> {
  try {
    await Deno.remove(`${instanceStateDir}/instance.json`);
  } catch {
    // Ignore if not present
  }
}
