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
    button(
      "Capabilities / Configure",
      () => showDetails(catalog.find((item) => item.id === info.id)),
    ),
    button("Reset instrument", async () => {
      await api(`/api/instruments/${info.id}/reset`, "POST", {});
      switchView("flow");
      notify(`${info.manifest.name} reset`);
    }),
    button("Unload", () => unload(info.id)),
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
  toolbar.append(command, button("Send", send));
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
        button("Add to canvas", () => addNode(info.id)),
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

$("tab-flow").onclick = () => switchView("flow");
$("refresh").onclick = action(refresh);
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
  if (event.key === "Escape") connectionStart = null;
});
switchView("flow");
refresh().catch((error) => notify(error.message, true));
setInterval(
  () => refresh().catch((error) => notify(error.message, true)),
  3000,
);
