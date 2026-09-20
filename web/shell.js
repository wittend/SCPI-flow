let catalog = [];
let project = { schemaVersion: 1, objects: [], connections: [] };
let connectionStart = null;
let activeView = "flow";
let refreshing = Promise.resolve();
const frames = new Map();
const $ = (id) => document.getElementById(id);

function notify(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

async function api(path, method = "GET", data) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? `Request failed (${response.status})`);
  }
  return result;
}

function action(callback) {
  return async (event) => {
    try {
      await callback(event);
    } catch (error) {
      notify(error.message, true);
    }
  };
}

function button(text, callback) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  element.onclick = action(callback);
  return element;
}

function iconButton(svgHtml, title, callback) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "tool-btn";
  element.title = title;
  element.setAttribute("aria-label", title);
  element.innerHTML = svgHtml;
  element.onclick = action(callback);
  return element;
}

function switchView(id) {
  activeView = id;
  document.querySelectorAll(".view-panel").forEach((panel) =>
    panel.classList.toggle("active", panel.id === `view-${id}`)
  );
  document.querySelectorAll(".tab-btn").forEach((tab) => {
    tab.classList.toggle("active", tab.id === `tab-${id}`);
    tab.setAttribute("aria-selected", String(tab.id === `tab-${id}`));
  });
}

function showDetails(info) {
  $("details-title").textContent = info.manifest?.name ?? info.id;
  $("manifest-details").textContent = JSON.stringify(
    info.manifest ?? { error: info.error },
    null,
    2,
  );
  $("configuration").value = "{}";
  $("apply-config").disabled = info.status !== "loaded";
  $("apply-config").onclick = action(async () => {
    const configuration = JSON.parse($("configuration").value);
    await api(`/api/instruments/${info.id}/configure`, "POST", {
      configuration,
    });
    notify(`${info.manifest.name} configured`);
    $("details").close();
  });
  $("details").showModal();
}

function addTab(info) {
  if (frames.has(info.id)) return;
  const tab = button(info.manifest.name, () => switchView(info.id));
  tab.className = "tab-btn";
  tab.id = `tab-${info.id}`;
  tab.setAttribute("role", "tab");
  $("tabs").append(tab);
  const panel = document.createElement("section");
  panel.className = "view-panel";
  panel.id = `view-${info.id}`;
  const toolbar = document.createElement("div");
  toolbar.className = "instrument-toolbar";
  toolbar.append(
    iconButton(
      `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.5"></circle><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"></path></svg>`,
      "Capabilities and configuration",
      () => showDetails(catalog.find((item) => item.id === info.id)),
    ),
    iconButton(
      `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 1 1.5 3.8"></path><path d="M2.5 12V8H6.5"></path></svg>`,
      "Reset instrument",
      async () => {
        await api(`/api/instruments/${info.id}/reset`, "POST", {});
        switchView("flow");
        notify(`${info.manifest.name} reset`);
      },
    ),
    iconButton(
      `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13h10"></path><path d="M8 3v7"></path><path d="m5 6 3-3 3 3"></path></svg>`,
      "Unload instrument",
      () => unload(info.id),
    ),
  );
  const command = document.createElement("input");
  command.placeholder = "Instrument command, e.g. *IDN?";
  command.setAttribute("aria-label", `${info.manifest.name} command`);
  const send = async () => {
    const result = await api(`/api/instruments/${info.id}/command`, "POST", {
      command: command.value,
    });
    notify(
      typeof result.response === "string"
        ? result.response || "OK"
        : JSON.stringify(result),
    );
  };
  command.onkeydown = action(async (event) => {
    if (event.key === "Enter") await send();
  });
  toolbar.append(
    command,
    iconButton(
      `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8 10-5-4 5 4 5-10-5z"></path></svg>`,
      "Send command (Enter)",
      send,
    ),
  );
  const frame = document.createElement("iframe");
  frame.title = info.manifest.name;
  frame.src = `/plugins/${info.id}/${info.manifest.frontend}`;
  panel.append(toolbar, frame);
  $("panels").append(panel);
  frames.set(info.id, { tab, panel });
}

async function refresh() {
  const update = refreshing.then(async () => {
    catalog = await api("/api/instruments");
    const list = $("palette");
    list.replaceChildren();
    for (const info of catalog) {
      const card = document.createElement("div");
      card.className = "instrument";
      card.draggable = Boolean(info.manifest);
      card.ondragstart = (event) =>
        event.dataTransfer.setData("text/plain", info.id);
      const heading = document.createElement("div");
      heading.className = "instrument-heading";
      if (info.manifest) {
        const icon = document.createElement("img");
        icon.src = `/api/instruments/${info.id}/icon`;
        icon.alt = "";
        heading.append(icon);
      }
      const name = document.createElement("strong");
      name.textContent = info.manifest?.name ?? info.id;
      heading.append(name);
      const state = document.createElement("p");
      state.className = "muted";
      state.textContent = `${info.status}${
        info.manifest ? ` · v${info.manifest.version}` : ""
      }${info.error ? ` — ${info.error}` : ""}`;
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(
        button(
          info.status === "loaded" ? "Open" : "Load",
          () => load(info.id, true),
        ),
        button("Add", () => addNode(info.id)),
        button("Details", () => showDetails(info)),
      );
      if (info.status === "loaded") {
        actions.append(button("Unload", () => unload(info.id)));
      }
      actions.append(button("Remove", async () => {
        if (
          !confirm(
            `Remove ${name.textContent} from the catalog? Repository files and canvas nodes are kept.`,
          )
        ) return;
        await api(`/api/instruments/${info.id}`, "DELETE", {});
        await refresh();
      }));
      card.append(heading, state, actions);
      list.append(card);
      if (info.status === "loaded") addTab(info);
    }
    for (const [id, elements] of frames) {
      if (!catalog.some((info) => info.id === id && info.status === "loaded")) {
        elements.tab.remove();
        elements.panel.remove();
        frames.delete(id);
        if (activeView === id) switchView("flow");
      }
    }
    if (!catalog.length) {
      list.textContent =
        "No instruments registered. Add a local instrument.json above.";
    }
    switchView(activeView);
    renderCanvas();
  });
  refreshing = update.catch(() => {});
  await update;
}

async function load(id, open = false) {
  notify(`Loading ${id}…`);
  await api(`/api/instruments/${id}/load`, "POST", {});
  await refresh();
  if (open) switchView(id);
  notify(`${id} loaded`);
}

async function unload(id) {
  await api(`/api/instruments/${id}/unload`, "POST", {});
  await refresh();
  notify(`${id} unloaded; canvas layout retained`);
}

async function addNode(
  id,
  x = 100 + project.objects.length * 30,
  y = 100 + project.objects.length * 30,
) {
  const info = catalog.find((item) => item.id === id);
  if (!info?.manifest) {
    throw new Error("Instrument unavailable; register its manifest first");
  }
  await load(id);
  project.objects.push({
    id: crypto.randomUUID(),
    instrumentId: id,
    name: info.manifest.name,
    x: Math.max(10, x),
    y: Math.max(10, y),
  });
  renderCanvas();
  switchView("flow");
}

function ports(node, direction) {
  return catalog.find((item) => item.id === node.instrumentId)?.manifest
    ?.[direction] ?? [];
}

function height(node) {
  return Math.max(
    110,
    Math.max(ports(node, "sources").length, ports(node, "sinks").length) * 20 +
      20,
  );
}
function portY(node, index, direction) {
  return height(node) / 2 +
    (index - (ports(node, direction).length - 1) / 2) * 20;
}

function drawConnections() {
  const svg = $("connections");
  svg.querySelectorAll("path").forEach((path) => path.remove());
  for (const connection of project.connections) {
    const from = project.objects.find((node) => node.id === connection.from);
    const to = project.objects.find((node) => node.id === connection.to);
    if (!from || !to) continue;
    const a = ports(from, "sources").findIndex((port) =>
      port.id === connection.fromPort
    );
    const b = ports(to, "sinks").findIndex((port) =>
      port.id === connection.toPort
    );
    const x1 = from.x + 180,
      y1 = from.y + (a < 0 ? height(from) / 2 : portY(from, a, "sources"));
    const x2 = to.x,
      y2 = to.y + (b < 0 ? height(to) / 2 : portY(to, b, "sinks"));
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      `M ${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}`,
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#38bdf8");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("marker-end", "url(#arrow)");
    path.ondblclick = () => {
      project.connections = project.connections.filter((item) =>
        item !== connection
      );
      drawConnections();
    };
    svg.append(path);
  }
}

let dragging = false;
function renderCanvas() {
  if (dragging) return;
  $("workspace").querySelectorAll(".workspace-object").forEach((element) =>
    element.remove()
  );
  for (const node of project.objects) {
    const info = catalog.find((item) => item.id === node.instrumentId);
    const element = document.createElement("div");
    element.className = `workspace-object${
      info?.status === "loaded" ? "" : " unavailable"
    }`;
    element.style.cssText = `left:${node.x}px;top:${node.y}px;height:${
      height(node)
    }px`;
    element.ondblclick = action(() => load(node.instrumentId, true));
    const remove = button("×", () => {
      project.objects = project.objects.filter((item) => item !== node);
      project.connections = project.connections.filter((item) =>
        item.from !== node.id && item.to !== node.id
      );
      renderCanvas();
    });
    remove.className = "remove-node";
    remove.setAttribute("aria-label", `Remove ${node.name} from canvas`);
    element.append(remove);
    if (info?.manifest) {
      const image = document.createElement("img");
      image.src = `/api/instruments/${info.id}/icon`;
      image.alt = "";
      image.draggable = false;
      element.append(image);
    }
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = node.name;
    element.append(name);
    for (const direction of ["sources", "sinks"]) {
      ports(node, direction).forEach((port, index) => {
        const connector = button("", () => {
          if (direction === "sources") {
            connectionStart = {
              from: node.id,
              fromPort: port.id,
              type: port.type,
            };
            notify(`Connect ${port.name} to a compatible input`);
          } else if (connectionStart) {
            if (connectionStart.type !== port.type) {
              throw new Error("Connector types do not match");
            }
            const connection = {
              from: connectionStart.from,
              fromPort: connectionStart.fromPort,
              to: node.id,
              toPort: port.id,
            };
            if (
              !project.connections.some((item) =>
                JSON.stringify(item) === JSON.stringify(connection)
              )
            ) project.connections.push(connection);
            connectionStart = null;
            drawConnections();
            notify("Connection added to diagram");
          }
        });
        connector.className = `connector ${
          direction === "sources" ? "source" : "sink"
        }`;
        connector.style.top = `${portY(node, index, direction)}px`;
        connector.title = `${port.name} (${port.type})`;
        connector.setAttribute(
          "aria-label",
          `${node.name}: ${connector.title}`,
        );
        element.append(connector);
      });
    }
    element.onpointerdown = (event) => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      dragging = true;
      const startX = event.clientX - node.x, startY = event.clientY - node.y;
      element.setPointerCapture(event.pointerId);
      element.onpointermove = (move) => {
        node.x = Math.max(10, Math.min(2010, move.clientX - startX));
        node.y = Math.max(10, Math.min(1470, move.clientY - startY));
        element.style.left = `${node.x}px`;
        element.style.top = `${node.y}px`;
        drawConnections();
      };
      const finish = () => {
        dragging = false;
        element.onpointermove = null;
      };
      element.onpointerup = finish;
      element.onpointercancel = finish;
    };
    $("workspace").append(element);
  }
  drawConnections();
}

function saveRecentManifest(path) {
  if (!path) return;
  try {
    const list = JSON.parse(
      localStorage.getItem("scpi-flow-recent-manifests") || "[]",
    );
    const updated = [path, ...list.filter((item) => item !== path)].slice(
      0,
      10,
    );
    localStorage.setItem(
      "scpi-flow-recent-manifests",
      JSON.stringify(updated),
    );
    populateRecentManifests();
  } catch {
    // Ignore storage errors
  }
}

function populateRecentManifests() {
  try {
    const datalist = $("recent-manifests");
    if (!datalist) return;
    datalist.replaceChildren();
    const list = JSON.parse(
      localStorage.getItem("scpi-flow-recent-manifests") || "[]",
    );
    for (const item of list) {
      const option = document.createElement("option");
      option.value = item;
      datalist.append(option);
    }
  } catch {
    // Ignore storage errors
  }
}

let browserParentDir = null;
let browserSelectedPath = null;

async function loadBrowserDir(dir = "") {
  const fileList = $("browser-file-list");
  fileList.textContent = "Loading directory…";
  browserSelectedPath = null;
  $("browser-select-btn").disabled = true;
  $("browser-selected-info").textContent = "Select an instrument.json file";
  try {
    const query = dir ? `?dir=${encodeURIComponent(dir)}` : "";
    const result = await api(`/api/fs/browse${query}`);
    browserParentDir = result.parent;
    $("browser-current-path").value = result.current;
    $("browser-up-btn").disabled = !result.parent;
    fileList.replaceChildren();

    if (!result.entries.length) {
      fileList.textContent = "Empty directory";
      return;
    }

    for (const entry of result.entries) {
      const row = document.createElement("div");
      row.className = `browser-row${entry.isManifest ? " manifest" : ""}`;
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = entry.isDirectory
        ? "📁"
        : entry.isManifest
        ? "📜"
        : "📄";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = entry.name;
      row.append(icon, name);

      if (entry.isManifest) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "manifest";
        row.append(badge);
      }

      row.onclick = () => {
        fileList.querySelectorAll(".browser-row").forEach((r) =>
          r.classList.remove("selected")
        );
        row.classList.add("selected");
        if (entry.isManifest || entry.name.endsWith(".json")) {
          browserSelectedPath = entry.path;
          $("browser-select-btn").disabled = false;
          $("browser-selected-info").textContent = entry.path;
        } else if (entry.isDirectory) {
          browserSelectedPath = null;
          $("browser-select-btn").disabled = true;
          $("browser-selected-info").textContent =
            "Double-click folder to open";
        } else {
          browserSelectedPath = null;
          $("browser-select-btn").disabled = true;
          $("browser-selected-info").textContent =
            "Select an instrument.json file";
        }
      };

      row.ondblclick = action(async () => {
        if (entry.isDirectory) {
          await loadBrowserDir(entry.path);
        } else if (entry.isManifest || entry.name.endsWith(".json")) {
          $("manifest-path").value = entry.path;
          $("file-browser").close();
          $("manifest-path").focus();
        }
      });

      fileList.append(row);
    }
  } catch (error) {
    fileList.textContent = `Failed to load: ${error.message}`;
  }
}

function openFileBrowser() {
  $("file-browser").showModal();
  const currentVal = $("manifest-path").value.trim();
  const startDir = currentVal
    ? currentVal.slice(0, currentVal.lastIndexOf("/"))
    : "";
  loadBrowserDir(startDir).catch((err) => notify(err.message, true));
}

async function discoverPlugins() {
  notify("Scanning for instrument plug-ins…");
  try {
    const result = await api("/api/instruments/discover");
    const section = $("discovered-section");
    const list = $("discovered-list");
    list.replaceChildren();

    const unregistered = (result.discovered || []).filter((item) =>
      !item.registered
    );
    if (!unregistered.length) {
      section.style.display = "none";
      notify("No new unregistered plug-ins found in workspace");
      return;
    }

    for (const item of unregistered) {
      const row = document.createElement("div");
      row.className = "discovered-item";
      const info = document.createElement("div");
      info.className = "discovered-info";
      const title = document.createElement("strong");
      title.textContent = `${item.name} (v${item.version})`;
      const pathEl = document.createElement("span");
      pathEl.textContent = item.path;
      info.append(title, pathEl);

      const regBtn = button("+ Register", async () => {
        if (
          !confirm(
            `Register ${item.name} (${item.path})? Only load trusted repositories.`,
          )
        ) return;
        await api("/api/instruments/register", "POST", { path: item.path });
        saveRecentManifest(item.path);
        await refresh();
        await discoverPlugins();
        notify(`${item.name} registered`);
      });

      row.append(info, regBtn);
      list.append(row);
    }
    section.style.display = "block";
    notify(`Found ${unregistered.length} available plug-in(s)`);
  } catch (error) {
    notify(`Discovery failed: ${error.message}`, true);
  }
}

function toggleSidebar(forceState) {
  const isCollapsed = typeof forceState === "boolean"
    ? forceState
    : !document.body.classList.contains("sidebar-collapsed");
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);
  $("toggle-sidebar").textContent = isCollapsed ? "▶ Sidebar" : "◀ Sidebar";
  $("toggle-sidebar").setAttribute(
    "aria-expanded",
    String(!isCollapsed),
  );
  localStorage.setItem("scpi-flow-sidebar-collapsed", String(isCollapsed));
  drawConnections();
}

function toggleMaximize(forceState) {
  const isMaximized = typeof forceState === "boolean"
    ? forceState
    : !document.body.classList.contains("canvas-maximized");
  document.body.classList.toggle("canvas-maximized", isMaximized);
  if (isMaximized) {
    switchView("flow");
  }
  drawConnections();
}

$("tab-flow").onclick = () => switchView("flow");
$("refresh").onclick = action(refresh);
$("toggle-sidebar").onclick = () => toggleSidebar();
$("hide-sidebar-btn").onclick = () => toggleSidebar(true);
$("maximize-canvas").onclick = () => toggleMaximize(true);
$("restore-canvas").onclick = () => toggleMaximize(false);
$("browse-btn").onclick = openFileBrowser;
$("discover-btn").onclick = action(discoverPlugins);
$("close-discovered-btn").onclick = () => {
  $("discovered-section").style.display = "none";
};
$("browser-up-btn").onclick = action(async () => {
  if (browserParentDir) await loadBrowserDir(browserParentDir);
});
$("shortcut-workspace").onclick = action(() => loadBrowserDir("."));
$("shortcut-instruments").onclick = action(() =>
  loadBrowserDir("./instruments")
);
$("shortcut-parent").onclick = action(() => loadBrowserDir(".."));
$("browser-select-btn").onclick = () => {
  if (browserSelectedPath) {
    $("manifest-path").value = browserSelectedPath;
    $("file-browser").close();
    $("manifest-path").focus();
  }
};
$("close-file-browser").onclick = () => $("file-browser").close();
$("browser-cancel-btn").onclick = () => $("file-browser").close();

$("theme").onclick = () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "scpi-flow-theme",
    document.body.classList.contains("light") ? "light" : "dark",
  );
};
document.body.classList.toggle(
  "light",
  localStorage.getItem("scpi-flow-theme") === "light",
);
$("close-details").onclick = () => $("details").close();
$("register-form").onsubmit = action(async (event) => {
  event.preventDefault();
  const path = $("manifest-path").value.trim();
  if (!path) return;
  if (
    !confirm(
      "Register this local plug-in? Loading it executes code with repository-read and loopback-network permissions. Only use trusted repositories.",
    )
  ) return;
  await api("/api/instruments/register", "POST", { path });
  saveRecentManifest(path);
  $("manifest-path").value = "";
  await refresh();
  notify("Instrument registered; load it when needed");
});
$("workspace").ondragover = (event) => event.preventDefault();
$("workspace").ondrop = action(async (event) => {
  event.preventDefault();
  const rect = $("workspace").getBoundingClientRect();
  await addNode(
    event.dataTransfer.getData("text/plain"),
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
});
$("new-project").onclick = () => {
  if (
    project.objects.length &&
    !confirm("Clear this diagram? Loaded instruments will remain available.")
  ) return;
  project = { schemaVersion: 1, objects: [], connections: [] };
  connectionStart = null;
  renderCanvas();
  switchView("flow");
};
$("save-project").onclick = action(async () => {
  const name = prompt("Project name", "experiment");
  if (!name) return;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) {
    throw new Error(
      "Use letters, numbers, hyphens and underscores for project names",
    );
  }
  await api(`/api/projects/${name}`, "POST", project);
  notify(`Saved ${name}`);
});
$("load-project").onclick = action(async () => {
  const name = prompt("Project name", "experiment");
  if (!name) return;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) {
    throw new Error("Invalid project name");
  }
  const loaded = await api(`/api/projects/${name}`);
  project = loaded;
  connectionStart = null;
  renderCanvas();
  switchView("flow");
  notify(`Loaded ${name}. Double-click an instrument to start it.`);
});
$("reset-workspace").onclick = action(async () => {
  const results = await Promise.allSettled(
    catalog.filter((info) => info.status === "loaded").map((info) =>
      api(`/api/instruments/${info.id}/reset`, "POST", {})
    ),
  );
  switchView("flow");
  const failed = results.filter((result) => result.status === "rejected");
  notify(
    failed.length
      ? `${failed.length} instrument reset(s) failed`
      : "Instruments reset; canvas retained",
    Boolean(failed.length),
  );
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if ($("file-browser")?.open) {
      $("file-browser").close();
    } else if ($("details")?.open) {
      $("details").close();
    } else if (document.body.classList.contains("canvas-maximized")) {
      toggleMaximize(false);
    } else {
      connectionStart = null;
    }
  } else if (
    (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b"
  ) {
    event.preventDefault();
    toggleSidebar();
  }
});
globalThis.addEventListener("resize", () => drawConnections());
if (globalThis.ResizeObserver) {
  new ResizeObserver(() => drawConnections()).observe($("flow-scroll"));
}

if (localStorage.getItem("scpi-flow-sidebar-collapsed") === "true") {
  toggleSidebar(true);
}
populateRecentManifests();
switchView("flow");
refresh().catch((error) => notify(error.message, true));
setInterval(
  () => refresh().catch((error) => notify(error.message, true)),
  3000,
);
