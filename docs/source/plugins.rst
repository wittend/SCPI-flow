Instrument plug-ins
===================

Ownership and discovery
-----------------------

SCPI-flow owns only the shell. Each instrument repository owns its simulation,
commands, configuration, HTTP adapter, front panel, icons, documentation and tests.
The default sibling repositories are ``SCPI-oScope-sim``, ``SCPI-mmeter`` and
``SCPI-signal-generator``. There are no instrument imports in the shell.

``instruments.json`` has ``schemaVersion: 1`` and an ``instruments`` array. Each
entry contains a ``path`` to a manifest (relative to the catalog file or absolute),
an optional expected ``id``, and optional ``legacyGuid`` for old diagrams.
An empty array is valid. Unavailable entries are reported without preventing boot.
Registration through UI/API/MCP persists an absolute manifest path atomically.
Only one shell process should write a given catalog.

Discovery reads manifests, never executable code. Load revalidates the manifest
and starts an instrument. Unload stops its process; reload starts fresh code and
state. A crashed process is marked failed and can be loaded again. There is one
runtime per registered ID, shared by all of its diagram nodes and control clients.

Manifest version 1
------------------

The machine-readable contract is ``instrument.schema.json`` (JSON Schema
2020-12). For example::

   {
     "schemaVersion": 1,
     "id": "example-meter",
     "version": "1.0.0",
     "name": "Example Meter",
     "description": "A local instrument plug-in",
     "entrypoint": "plugin.ts",
     "frontend": "index.html",
     "icon": "assets/icon.svg",
     "capabilities": ["voltage", "scpi"],
     "sources": [{"id": "reading", "name": "Reading", "type": "data"}],
     "sinks": [{"id": "input", "name": "Input", "type": "analog"}],
     "configuration": {
       "type": "object",
       "properties": {"range": {"type": "number", "minimum": 0.1, "maximum": 1000}},
       "additionalProperties": false
     }
   }

IDs are stable lower-case slugs, not display names. Paths must stay inside the
repository: absolute paths, traversal and escaping symlinks are rejected.
Source IDs and sink IDs must each be unique. Capabilities are descriptive tags;
the shell does not interpret instrument-specific command dialects.

Configuration uses a deliberately bounded JSON Schema subset: ``type``, ``title``,
``description``, ``default``, ``enum``, ``minimum``, ``maximum``, ``properties``,
``required``, ``additionalProperties`` (boolean), and ``items``. Supported types
are object, string, number, integer, boolean and array. Unknown keywords are
rejected rather than silently ignored. Schemas are limited to 12 nested levels.
Configuration requests are validated against this schema before forwarding;
instrument adapters must also validate their own UI/API inputs and physical limits.
Configuration is a patch unless the instrument documents otherwise; defaults are
descriptive and are not automatically applied by the shell. Omit ``required`` for
optional patch fields. The adapter owns cross-field constraints and defaults.

Process and HTTP contract
-------------------------

The loader starts Deno in the instrument repository with ``plugin.ts --port 0``
(using the manifest entrypoint), ``--no-prompt``, ``--cached-only``, repository-only
read access and loopback network access. No environment, write or subprocess
permission is granted. Vendor dependencies; do not depend on sibling repositories.

The child binds HTTP to ``127.0.0.1`` and requests an ephemeral port. Its first
stdout line must be JSON ``{"port":12345}``, emitted after listening. Send logs
to stderr. Startup has a ten-second timeout and a three-second health check.
Unload sends SIGTERM, waits up to 1.5 seconds, then uses SIGKILL if necessary.

Required endpoints:

* ``GET /health``: successful response when ready.
* ``GET /state``: JSON instrument state.
* ``POST /configure``: JSON configuration object; respond with JSON.
* ``POST /command``: ``{"command":"*IDN?"}``; return ``{"response":"..."}``.
* ``POST /reset``: reset instrument state; respond with JSON.
* Manifest frontend and asset paths: serve instrument-owned resources.

Additional instrument APIs are permitted. Return non-2xx status and a JSON
``error`` on invalid input. UI fetch and asset references must be relative to the
front panel URL: the shell proxies ``/plugins/<id>/<path>`` to the child. Child
redirects are rejected. There are no shell-specific hardcoded instrument routes.
The shell reads the manifest icon before load, so palette rendering does not
start the instrument.

Shell API and MCP
-----------------

* ``GET /api/instruments`` lists manifests, statuses and discovery errors.
* ``POST /api/instruments/register`` with ``{"path":"/local/instrument.json"}``.
* ``POST /api/instruments/<id>/load``, ``/unload`` and ``/reset`` with ``{}``.
* ``GET /api/instruments/<id>/state``.
* ``POST /api/instruments/<id>/configure`` with ``{"configuration":{...}}``.
* ``POST /api/instruments/<id>/command`` with ``{"command":"..."}``.
* ``DELETE /api/instruments/<id>`` with ``{}`` unregisters without deleting files.
* ``GET /api/instruments/<id>/icon`` returns the instrument-owned icon.

Management bodies use ``Content-Type: application/json``. Failed discovery and
validation are reported to clients, not replaced with simulated successes.

``src/mcp_cli.ts`` implements standard MCP over stdio, forwarding to the already
running shell. Supported protocol versions are 2025-06-18, 2025-03-26 and
2024-11-05. It provides initialization, ping, notifications, tools/list and
tools/call; tools are ``list``, ``register``, ``load``, ``unload``, ``state``,
``configure``, ``command`` and ``reset``. This is a tools-only server, not an MCP
HTTP endpoint. See README for an MCP client configuration example. A client and
the UI share process state, and UI status refreshes every three seconds.

Migration and boundaries
------------------------

The old fixed palette and ``obj/*_obj.json`` files are replaced by manifests.
Old project GUIDs and connector names are mapped using catalog/manifest metadata;
embedded object code is never evaluated. Unknown instruments remain placeholders.
Project files contain diagram layout and connections, not live instrument state.
Opening a saved project does not automatically execute instrument code.

Data Flow Canvas remains the leftmost/default tab. Reset returns to the canvas,
preserving nodes. Instrument tabs exist only while their process is loaded.
Connections remain visual metadata; automatic inter-instrument signal routing is
outside this migration. Instruments implement their own SCPI command dialects.
The former oscilloscope CLI and hardware bridge belong with the instrument, not
the shell; root ``/api/scope``, ``/api/dmm``, ``/api/gen`` and ``/api/scpi`` routes
are replaced by generic APIs or plug-in-prefixed legacy routes.

Trust and deployment
--------------------

Separate processes provide lifecycle and fault isolation, not a hostile-code
sandbox. Only load reviewed local repositories. Front panels run at the shell's
origin and are trusted code too. The development shell uses broad permissions,
binds to loopback, rejects cross-origin browser requests, and only serves approved
public files. Never expose it directly to an untrusted network; remote operation
needs an authenticated boundary. The v1 loader intentionally does not grant
hardware/USB access or arbitrary network access; physical-device adapters require
an explicitly reviewed permission-policy extension.
