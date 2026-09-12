# SCPI-flow Project Guidelines

## Project Overview

SCPI-flow is a Deno-based standalone application for controlling and monitoring
experimental instruments. It features a graphical workspace similar to GNU Radio
Companion, allowing users to drag and drop objects from a palette onto a canvas
to create data flow diagrams.

## Technical Stack

- **Runtime:** Deno (Stable 2.4+)
- **HTTP Server:** `Deno.serve`
- **Frontend:** Single-page application (Standalone local and web-hosted)
- **Communication:** SCPI via a custom MCP interface wrapping `pyVisa` (or TS
  equivalent)
- **Styling:** Light/Dark mode support
- **Testing:** Unit tests for all components (`deno test`)
- **Formatting/Linting:** Custom rules via `deno fmt` and `deno lint`

## Project Structure

- `main.ts`: Application entry point
- `obj/`: Directory for object definition files (`<guid>_obj.json`)
- `projects/`: Directory for project files (`<guid>_prj.json`)
- `assets/`: Vendored external resources (icons, fonts, images)
- `.docs/`: Documentation for Sphinx/Furo (Read The Docs)
- `.requirements/`: Project requirements and plans
- `palette_objects.json`: Catalog of available palette objects

## Development Rules

- **Vendoring:** All external resources must be vendored into the project for
  offline use.
- **Testing:** Create unit tests at every step.
- **Permissions:** Use broad permissions during development (`--allow-all`), but
  aim for strict permissions in production.
- **Documentation:** Maintain documentation in `.docs/` for Sphinx.
- **Version Control:** Follow standard GitHub practices. Maintain
  `CHANGELOG.md`.

## Data Formats

- **Palette Objects (`palette_objects.json`):** Contains guid, unique hash,
  display name, ordinal position, and SVG icon reference.
- **Object Definitions (`obj/*_obj.json`):** Contains source/sink connectors and
  snippets of executable JavaScript code.
- **Project Files (`projects/*_prj.json`):** Contains lists of objects, their
  positions, and their connections (Bezier lines with arrowheads).
