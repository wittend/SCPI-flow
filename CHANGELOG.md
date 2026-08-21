# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-08-20

### Added
- Comprehensive Sphinx documentation in `.docs/` covering Introduction, Usage, and Architecture.
- Fully functional Menubar with dropdowns for File, Edit, Tools, and Help.
- Integrated theme switching and project management into the menu system.
- Improved UI styling for menus and workspace elements.

## [0.4.0] - 2026-08-20

### Added
- SCPI Bridge: Python-based bridge using `pyVisa` for instrument communication.
- MCP-inspired Interface: Deno service to manage long-running Python process for SCPI commands.
- SCPI API Endpoints: `/api/scpi/resources` and `/api/scpi/query` for instrument discovery and control.
- Vendored SCPI logic: Initial setup for Python-based instrument wrapping.

## [0.3.0] - 2026-08-20

### Added
- Workspace connectivity: source and sink connectors for objects.
- Data flow visualization: Bezier lines with arrowheads connecting objects.
- Enhanced project persistence: save and load including object connections.
- UI improvements: markers for flow direction and improved object styling.

## [0.2.0] - 2026-08-20

### Added
- API endpoints for object definitions (`/api/obj/:guid`) and project management (`/api/projects/:name`).
- Interactive workspace in `index.html` with drag-and-drop support from the palette.
- Object rendering and movement within the workspace.
- Project "Save" and "Load" functionality via frontend prompt and backend API.
- Integration tests for new API endpoints in `main_test.ts`.

## [0.1.0] - 2026-08-19

### Added
- Core repository files (LICENSE, README, CHANGELOG, .gitignore, .junie/guidelines.md).
- Initial project directory structure (`obj/`, `projects/`, `assets/`, `.docs/`).
- `palette_objects.json` for object catalog.
- Basic Deno server in `main.ts` with static file serving and `/api/palette` endpoint.
- Initial SPA frontend in `index.html` with Menu, Toolbar, Palette, and Status Bar.
- Unit tests for API and static file serving in `main_test.ts`.
- Sphinx documentation configuration in `.docs/`.
