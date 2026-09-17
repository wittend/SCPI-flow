Introduction
============

SCPI-flow is a Deno-based standalone application for controlling and monitoring experimental instruments.
It features a graphical workspace similar to GNU Radio Companion, allowing users to drag and drop
objects from a palette onto a canvas to create data flow diagrams.

Key Features:
-------------

* Graphical workspace with drag-and-drop objects.
* SCPI communication via a custom MCP interface wrapping pyVisa.
* Support for multiple instruments in an experimental setup.
* Light and Dark mode interface.
* Project saving and loading.

Usage Guide
===========

Getting Started
---------------

1. Start the application using Deno:
   ``deno run --allow-all main.ts``
2. Open your browser to ``http://localhost:8000``.

Workspace Operations
--------------------

* **Adding Objects**: Drag items from the Palette on the left onto the Workspace.
* **Moving Objects**: Click and drag objects within the workspace to reposition them.
* **Connecting Objects**: Click a source connector (right side) and then a sink connector (left side) to create a data flow connection.
* **Saving Projects**: Use the "Save" button in the toolbar to name and save your current configuration.
* **Loading Projects**: Use the "Save As" (Load) button to retrieve a previously saved project.

SCPI Communication
------------------

The application uses a Python bridge to communicate with instruments. Ensure that ``pyvisa`` and a suitable VISA backend are installed on your system.

Architecture
============

SCPI-flow is built with a decoupled architecture between the frontend workspace and the backend instrument control.

Frontend
--------

* **Single Page Application**: Built with HTML5, CSS3, and Vanilla JavaScript.
* **Workspace Engine**: Handles object rendering, dragging, and SVG-based connectivity.
* **API Client**: Communicates with the Deno server for object definitions and project storage.

Backend
-------

* **Deno Server**: Serves static files and provides a RESTful API.
* **SCPI Bridge**: A Python-based bridge that wraps ``pyVisa``.
* **MCP Interface**: A custom interface that manages the lifecycle and communication with the SCPI bridge.

Data Formats
------------

* **Palette Objects**: ``palette_objects.json`` catalog.
* **Object Definitions**: GUID-based JSON files in ``obj/``.
* **Project Files**: JSON-based project state in ``projects/``.
