# SCPI-flow

A Deno-based graphical environment for controlling and monitoring experimental instruments using SCPI.

[![Read the Docs](https://img.shields.io/badge/docs-read--the--docs-blue)](https://scpi-flow.readthedocs.io/)

**Date of Last Modification:** 2026-08-19

## Overview

SCPI-flow provides an extensible graphical workspace, similar to GNU Radio Companion, where users can create data flow diagrams to interact with instruments. It features a drag-and-drop palette, a bezier-line connection system, and supports both local standalone and web-hosted modes.

## Key Features

- **Extensible Palette:** Define objects in JSON and SVG for easy expansion.
- **Graphical Canvas:** Drag-and-drop objects, connect them with bezier lines, and manage data flow.
- **SCPI Integration:** Built-in support for SCPI communication via a custom MCP interface.
- **Light/Dark Mode:** Full support for interface theme customization.
- **Deno-Powered:** Leveraging Deno's modern runtime and security model.

## Documentation

Full documentation is available on [Read the Docs](https://scpi-flow.readthedocs.io/).

To build the documentation locally:
```bash
cd .docs
# Instructions for Sphinx build
```

## Getting Started

### Prerequisites
- [Deno](https://deno.com/) (Stable 2.4+)
- Python (for `pyVisa` component)

### Installation
1. Clone the repository.
2. Vendor external resources:
   ```bash
   # Add vendoring script command here if applicable
   ```

### Running the Application
```bash
deno task start
```

## Testing
```bash
deno test
```

## License
This project is licensed under the GPL-3.0-or-later License - see the [LICENSE](LICENSE) file for details.
