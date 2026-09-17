Signal generator plugin
=======================

Run ``deno task start`` with Deno 2.4+ and open
``http://127.0.0.1:8002/index.html``. The v1 manifest uses id
``signal-generator``. The backend, frontend and vendored tests are self-contained.

Integration
-----------

From the repository, launch::

   deno run --cached-only --no-prompt --allow-read=. --allow-net=127.0.0.1 plugin.ts --port 0

The first stdout line contains the assigned port. Common routes are
``GET /health``, ``GET /state``, ``POST /configure``, ``POST /command`` and
``POST /reset``. The dedicated UI retains ``api/gen/state`` and
``api/gen/preview`` and works at ``/plugins/signal-generator/index.html``.

Units and commands
------------------

Amplitude and ``VOLT`` use peak volts, phase uses degrees, and duty cycle is a
fraction between zero and one. ``C1:BSWV?`` reports AMP in Vpp. The preview uses
actual backend samples and respects output disable. Frequency, amplitude, offset,
phase, function and output commands are supported along with IDN, reset, clear,
operation-complete and error queries. The README enumerates the entire command
subset. No claim of full SDG2042X compatibility, compound commands, hardware I/O
or automatic inter-process signal transport is made.

Validation and provenance
-------------------------

Run ``deno test --cached-only --allow-all``. Core waveform implementation/tests and
the generator-only frontend were copied from the shell without deleting originals.
New tests verify actual process startup under restricted permissions, lifecycle,
configuration rejection, static safety and command-controlled waveform output.