Usage Guide
===========

Running the Web Application
---------------------------

Start the Deno HTTP server on port 8000:

.. code-block:: bash

   deno task start

Or during development with file watching:

.. code-block:: bash

   deno task dev

Then open your browser at ``http://localhost:8000``.

Running the Terminal CLI
------------------------

To run the interactive ANSI terminal front panel and SCPI shell:

.. code-block:: bash

   deno task cli

Keyboard Shortcuts in CLI:
- ``1``: DC Voltage (DCV)
- ``2``: AC Voltage (ACV)
- ``3``: DC Current (DCI)
- ``4``: AC Current (ACI)
- ``5``: 2-Wire / 4-Wire Resistance (RES / FRES)
- ``6``: Capacitance (CAP)
- ``7``: Continuity (CONT)
- ``8``: Diode Test (DIOD)
- ``9``: Frequency / Period (FREQ / PER)
- ``0``: Temperature (TEMP)
- ``A``: Toggle Auto Range
- ``U`` / ``+``: Range Up
- ``J`` / ``-``: Range Down
- ``S``: Cycle Speed (Slow / Med / Fast)
- ``D``: Toggle Dual Display
- ``M``: Cycle Math mode (Stats, Limits, Null)
- ``V``: Cycle View (Number, Bar, Trend, Histogram)
- ``T``: Trigger Single measurement
- ``C``: Enter SCPI command prompt
- ``Q``: Quit CLI

Running Unit Tests
------------------

Execute the full automated test suite:

.. code-block:: bash

   deno test --allow-all
