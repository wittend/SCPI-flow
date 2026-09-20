Data Sources & Sinks
====================

SCPI-flow provides three built-in input and output instruments designed for stream processing, automated ingestion, remote broker telemetry, and file logging:

- **Data Source (`data-source`)**: Origin instrument that streams or receives data from local JSONL files, WebSocket stream servers, or MQTT brokers.
- **Raw Data Sink (`raw-data-sink`)**: Destination instrument that writes unparsed binary/string streams to local files or transmits them across a WebSocket connection.
- **Formatted Data Sink (`formatted-data-sink`)**: Structured record consumer that writes formatted JSON or JSONL records to disk (with optional ISO timestamps) and publishes structured messages to MQTT broker topics.

All sources and sinks expose comprehensive configuration parameters via graphical tabs, JSON manifests, and SCPI commands.

---

Data Source (`data-source`)
---------------------------

The Data Source instrument functions as a multi-protocol asynchronous data origin.

Supported Modes
~~~~~~~~~~~~~~~

1. **Local File Ingestion (`mode: "file"`)**
   - Ingests newline-delimited JSON (`.jsonl`) or text data line-by-line from a local file.
   - **Cadence Control (`cadenceHz`)**: Configurable rate in lines per second (default 1.0 line/sec).
   - **Looping (`loop`)**: Option to continuously loop playback upon reaching the end of the file.

2. **WebSocket Client (`mode: "websocket"`)**
   - Connects to an asynchronous WebSocket endpoint (`wsUrl`, e.g. ``ws://127.0.0.1:9001``).
   - Dispatches incoming messages to downstream canvas connectors and telemetry monitors in real time.

3. **MQTT Broker Subscription & Polling (`mode: "mqtt"`)**
   - Connects to an MQTT 3.1.1 broker over native TCP (port 1883) or WebSocket transport (`mqttUseWs`).
   - Subscribes to custom topic filters (`mqttTopic`, e.g. ``sensors/#``).
   - Receives asynchronous broker notifications and messages upon publish events.

Configuration Options
~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 25 15 60

   * - Option
     - Type
     - Description
   * - ``mode``
     - string
     - Origin protocol: ``"file"``, ``"websocket"``, or ``"mqtt"``.
   * - ``filePath``
     - string
     - Path to local JSONL / data file.
   * - ``cadenceHz``
     - number
     - Playback cadence in lines/second (default: ``1``).
   * - ``loop``
     - boolean
     - Whether to loop file playback indefinitely.
   * - ``wsUrl``
     - string
     - Target WebSocket stream URL.
   * - ``mqttBroker``
     - string
     - MQTT Broker host address or IP.
   * - ``mqttPort``
     - integer
     - MQTT Broker port (default ``1883``).
   * - ``mqttTopic``
     - string
     - MQTT topic filter to subscribe to.
   * - ``mqttUseWs``
     - boolean
     - Use WebSocket transport for MQTT broker connection.
   * - ``format``
     - string
     - Format parser: ``"jsonl"``, ``"json"``, ``"raw"``, or ``"scpi"``.
   * - ``active``
     - boolean
     - Ingestion enable / active state.

---

Raw Data Sink (`raw-data-sink`)
-------------------------------

The Raw Data Sink consumes streaming bytes or text payloads from canvas flows and outputs them directly to disk or a remote WebSocket receiver without altering data format.

Configuration Options
~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 25 15 60

   * - Option
     - Type
     - Description
   * - ``mode``
     - string
     - Sink mode: ``"file"`` or ``"websocket"``.
   * - ``filePath``
     - string
     - Destination file path.
   * - ``fileWriteMode``
     - string
     - Write strategy: ``"append"`` or ``"overwrite"``.
   * - ``wsUrl``
     - string
     - Target destination WebSocket URL for streaming.
   * - ``autoFlush``
     - boolean
     - Automatically sync buffers to disk after each write (default: ``true``).
   * - ``active``
     - boolean
     - Sink active listener state.

---

Formatted Data Sink (`formatted-data-sink`)
-------------------------------------------

The Formatted Data Sink is designed for structured measurements and telemetry logs. It can output to local files (JSON array or JSONL) and simultaneously publish formatted messages to an MQTT broker.

Configuration Options
~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 25 15 60

   * - Option
     - Type
     - Description
   * - ``mode``
     - string
     - Target destination: ``"file"``, ``"mqtt"``, or ``"both"``.
   * - ``format``
     - string
     - File format: ``"jsonl"`` (line-delimited) or ``"json"`` (JSON array).
   * - ``filePath``
     - string
     - Destination file path.
   * - ``fileWriteMode``
     - string
     - Write strategy: ``"append"`` or ``"overwrite"``.
   * - ``prettyJson``
     - boolean
     - Pretty-print output with 2-space indentation.
   * - ``mqttBroker``
     - string
     - MQTT Broker host address or IP.
   * - ``mqttPort``
     - integer
     - MQTT Broker port (default ``1883``).
   * - ``mqttTopic``
     - string
     - Target MQTT publishing topic (e.g. ``telemetry/experiment``).
   * - ``mqttUseWs``
     - boolean
     - Connect to MQTT broker via WebSocket.
   * - ``mqttRetain``
     - boolean
     - Retain message flag on MQTT broker.
   * - ``includeTimestamp``
     - boolean
     - Inject ISO-8601 UTC timestamp if missing (default: ``true``).
   * - ``active``
     - boolean
     - Sink active listener state.

---

Programmatic & Declarative Flow Example
---------------------------------------

Below is an example declarative flow snippet (``examples/mcp-flows/flows/data_source_sink_flow.json``) loading the instruments and streaming telemetry:

.. code-block:: json

   {
     "name": "Data Source & Sink Ingestion Flow",
     "instruments": ["data-source", "formatted-data-sink", "raw-data-sink"],
     "setup": [
       {
         "tool": "load",
         "args": { "id": "data-source" }
       },
       {
         "tool": "configure",
         "args": {
           "id": "data-source",
           "configuration": {
             "mode": "file",
             "filePath": "measurements.jsonl",
             "cadenceHz": 5,
             "format": "jsonl",
             "loop": true,
             "active": true
           }
         }
       },
       {
         "tool": "configure",
         "args": {
           "id": "formatted-data-sink",
           "configuration": {
             "mode": "file",
             "format": "jsonl",
             "filePath": "output_log.jsonl",
             "includeTimestamp": true,
             "active": true
           }
         }
       }
     ]
   }
