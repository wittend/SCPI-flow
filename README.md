# SCPI-flow

An instrument-independent Deno workspace for discovering and managing local
instrument plug-ins. SCPI-flow owns the dataflow canvas, project files, catalog,
process lifecycle, and standard MCP interface—not instrument simulation code.

## Repository layout

The repository is organized as a Deno workspace containing the host shell and
subordinate standard instruments:

```text
SCPI-flow/
├── deno.json                  # Root workspace configuration
├── instruments.json           # Default catalog pointing to subordinate instruments
├── src/                       # Shell, manifest schema, and MCP adapter
├── web/                       # Data flow canvas UI and assets
└── instruments/               # Subordinate standard instrument plug-ins
    ├── oscilloscope/          # Oscilloscope engine, front panel and assets
    ├── multimeter/            # Multimeter engine, front panel and assets
    └── signal-generator/      # Signal generator engine, front panel and assets
```

Each instrument publishes `instrument.json` and runs in its own Deno process.
`instruments.json` contains configurable manifest paths, not compiled-in
instrument classes. Add any number of compatible internal or external instrument
types without editing the shell. Missing or custom third-party instruments
appear as unavailable if unresolvable, but do not stop the shell. An empty
catalog is supported.

## Run

Requires Deno stable 2.4 or newer. No external runtime dependencies or hosted
assets are required by the shell.

```bash
deno task start
# Development reload:
deno task dev
# Optional custom catalog and port:
deno run --allow-all main.ts --catalog ./instruments.json --port 8000
```

Open **http://127.0.0.1:8000**. No instruments are started automatically.

- The **Data Flow Canvas** is always the leftmost and initial tab.
- Use **Load** to start an instrument and open its own front-panel tab.
- Drag an instrument from the catalog, or choose **Add to canvas**, to load it
  and place a node. Double-click a node to open its instrument.
- Click an output connector, then a compatible input, to draw a connection.
  Double-click a wire to remove it; Escape cancels an unfinished connection.
- **Unload** terminates the instrument process and removes its tab, retaining
  its canvas nodes. Loading again starts a fresh instance.
- **Details** shows the manifest and its configuration schema. A loaded
  instrument can receive a JSON configuration through this dialog or commands
  through its tab.
- Register another trusted local `instrument.json` using the catalog form.
  Removal unregisters and unloads it without deleting repository files or
  diagram nodes.
- Save/load diagrams by name. Legacy GUID-based diagrams are migrated using the
  catalog's `legacyGuid` metadata. Unknown instruments remain visible
  placeholders.
- **Reset instruments** returns to the canvas without clearing the diagram.

There is one process/state per registered instrument ID. Multiple diagram nodes
with that ID refer to the same instrument. Connections remain diagram metadata,
not a signal-routing execution engine. Saving a project saves the layout and
connections, not a running instrument's internal state. Loading a diagram does
not execute plug-ins until explicitly requested.

## Standard MCP

Start the shell first. Configure an MCP client to launch this stdio adapter:

```json
{
  "mcpServers": {
    "scpi-flow": {
      "command": "deno",
      "args": [
        "run",
        "--no-config",
        "--no-lock",
        "--allow-net=127.0.0.1:8000",
        "/absolute/path/to/SCPI-flow/src/mcp_cli.ts",
        "--url",
        "http://127.0.0.1:8000"
      ]
    }
  }
}
```

The adapter implements standard MCP initialization, tool discovery and
invocation over stdio. Tools are `list`, `register`, `load`, `unload`, `state`,
`configure`, `command`, and `reset`. MCP and UI operations reach the **same
shell-managed processes**. The shell's HTTP API is not an MCP HTTP transport
endpoint.

## Plug-in contract

See `.docs/source/plugins.rst` and `instrument.schema.json` for the versioned
manifest, supported configuration-schema subset, process protocol, API, and
migration notes. All instrument-specific assets and behavior belong to their own
repositories. Front panels use relative URLs so the shell can proxy them under
`/plugins/<id>/`.

## Security and offline use

Install **trusted local plug-ins only**. Registration does not execute code;
Load starts a process with repository-read and loopback-network permissions,
without write, environment, subprocess, or unrestricted network grants. Process
separation limits accidental failures; it is not an untrusted-code sandbox.
Front panels run at the shell origin and must also be trusted. Review instrument
code before loading.

The development shell uses broad permissions because it manages local
repositories and subprocesses. It binds to loopback and rejects cross-origin
browser requests and non-local hosts. Do not expose this unauthenticated
management server directly to a network. Remote deployment requires a separate
authenticated boundary.

Plug-ins must vendor their dependencies and assets; the loader uses
`--cached-only` and never installs or downloads code. The supplied instrument
adapters are locally self-contained. Shell tests use vendored Deno
standard-library assertions.

## Validation

```bash
deno task test
deno fmt --check
deno lint
# Run end-to-end integration checks with standard instruments:
deno task test:instruments
```

Running `deno test` executes unit and integration tests across the root
workspace and all subordinate instruments. Optional integration checks launch
all catalog instruments, inspect their front panels, send commands, and unload
them.

## License

GPL-3.0-or-later. See `LICENSE`.
