Usage Guide
===========

Running the Application
-----------------------

SCPI-flow supports both GUI (Web-based) and CLI (Terminal-based) modes.

1. **Web GUI Server**:
   To start the web application and API server:

   .. code-block:: bash

       deno task start
       # or: deno run --allow-all main.ts

   Open your browser to `http://localhost:8000`.

2. **Interactive CLI Application**:
   To launch the interactive terminal oscilloscope and SCPI command REPL:

   .. code-block:: bash

       deno task cli
       # or: deno run --allow-all src/cli.ts

   CLI Commands available:

   * ``draw`` / ``plot``: Render ANSI-colored ASCII oscilloscope screen in terminal.
   * ``meas``: Display automated measurements table.
   * ``status``: Display IEEE 488.2 Status Byte (STB) and Event Status Register (ESR).
   * ``*IDN?``, ``C1:VDIV 2.0``, ``MEAS:ALL?``: Execute any standard SCPI command.
   * ``help``: Display command help.
   * ``exit`` / ``quit``: Exit REPL.

3. **Running CLI in Script/Batch Mode**:

   .. code-block:: bash

       # Execute SCPI command string
       deno run --allow-all src/cli.ts --exec "*IDN?; C1:VDIV 2.5; MEAS:VPP? C1"

       # Print terminal waveform plot
       deno run --allow-all src/cli.ts --plot

       # Print measurements table
       deno run --allow-all src/cli.ts --meas

Running Unit Tests
------------------

Unit tests validate all signal generation math, oscilloscope channels, timebase, triggers, SCPI commands, and API routes:

.. code-block:: bash

    deno test --allow-all
