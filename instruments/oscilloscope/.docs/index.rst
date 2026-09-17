Oscilloscope plugin
===================

The application requires Deno 2.4 or newer. Run ``deno task start`` and open
``http://127.0.0.1:8000/index.html``. The instrument manifest is
``instrument.json`` (schema version 1, id ``oscilloscope``).

Integration
-----------

Launch from the repository with::

   deno run --cached-only --no-prompt --allow-read=. --allow-net=127.0.0.1 plugin.ts --port 0

Read the JSON port announcement on stdout. The plugin exposes ``GET /health``,
``GET /state``, ``POST /configure``, ``POST /command`` and ``POST /reset``.
Commands use a JSON ``command`` string and return a JSON ``response`` string.
Partial configuration is validated against the manifest before applying changes.
The frontend retains ``api/scope/frame``, ``api/scope/command`` and
``api/scope/measurements`` relative routes; it works behind the proxy path
``/plugins/oscilloscope/index.html``.

Scope and limitations
---------------------

The detailed two-channel panel and simulated SCPI subset are preserved.
Measurements, trigger and acquisition behavior are simulations, not hardware
guarantees. The waveform generator in ``src/`` is an internal test signal, not
an external process dependency. Connector descriptors do not implement signal
transport. The README documents command examples, configuration units, copied
file ownership and tests. No original shell files were removed by extraction.

Validation
----------

Run ``deno test --cached-only --allow-all``. Core simulation tests were copied;
new tests cover isolated handlers/processes, strict offline process permissions,
configuration rejection, static-file boundaries and relative frontend requests.