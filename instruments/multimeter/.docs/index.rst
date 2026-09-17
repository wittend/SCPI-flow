Multimeter HTTP plugin
======================

This is additive plugin documentation; the original standalone application,
front panel, CLI and documentation remain unchanged.

Run ``deno task plugin`` with Deno 2.4+ and open
``http://127.0.0.1:8001/plugin-ui/index.html``. The v1 instrument manifest id is
``multimeter``. The plugin imports only its own existing standalone simulation
and SCPI engine, not the copied legacy test implementation.

Integration
-----------

Launch from the repository::

   deno run --cached-only --no-prompt --allow-read=. --allow-net=127.0.0.1 plugin.ts --port 0

Read the JSON port announcement. The common API exposes ``GET /health``,
``GET /state``, ``POST /configure``, ``POST /command`` and ``POST /reset``.
The configuration schema in ``instrument.json`` defines supported settings.
Commands accept a JSON ``command`` string and return a ``response`` string;
SCPI errors retain the existing ``SYST:ERR?`` queue behavior. Partial settings
are validated before mutation, including nested input and limit settings.

The preserved front panel uses ``../api/dmm/...`` so it works at
``/plugins/multimeter/plugin-ui/index.html``. Legacy reading, input, configuration,
command, front-panel button and reset endpoints are retained. Source files are
not publicly served. There is no physical instrument I/O or inter-process signal
transport in this adapter.

Testing and preservation
------------------------

Run ``deno test --cached-only --allow-all``. The original standalone tests remain
in place. New tests cover the HTTP plugin and restricted process lifecycle. The
older shell implementation and its tests live under ``tests/flow-legacy/`` only;
they do not replace or alter the existing standalone implementation. Dependencies
are vendored for offline testing and legacy standalone startup.