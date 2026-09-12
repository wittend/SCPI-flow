## Deno scpi-flow requirements

#### 2025-11-03

- Runtime: Deno stable or canary? Any required minimum version?

Stable, 2.4+.

- HTTP framework: built-in Deno.serve, Oak, Fresh, or none?

Deno.serve.

- Permissions model: strict (--allow-net for specific hosts, etc.) or broad
  during dev?

Broad during dev.

- Testing expectations: unit only, or also integration/e2e?

Unit testing.

- Lint/format: use deno lint/deno fmt defaults or custom rules?

Custom rules.

- Env/secrets: .env usage, and any secrets management preferences?

Nothing at this time.

I want to build a standalone application that follows the pattern of GNU Radio
Companion and similar applications that present an extensible list of objects in
a palette that can be dragged and dropped onto a canvas or workspace.

The entire interface should have a menu, a toolbar, and a status bar. It must be
realizable to fit the screen, minimizeable, or hidden.

The toolbar should have buttons for "New", "Save", "Save As". The menubar should
have conventional drop-downs for "File", "Edit", "Tools", and "Help". The
applicaation will support a light/Dark mode choice from the menubar.

The palette will present objects made available in a file named
palette_objects.json. This file will contain minimal descriptions of objects
including the object's guid, a unique hash of the object's definition file to
maintain integrity, the name to be displayed under the object in the palette and
on the workspace, and an ordinal number that indicates where the palette entry
is located in the palette. There should also be a reference to an .svg file that
will appear on the palette button's surface for selection.

The objects themselves will be defined in individual <_>_obj.json where <_>
represents a same guid that references it in the palette_objects.json file. All
of these object definition files should be stored in a directory "./obj"
relative to the project's root.

Internally, the object files will contain JSON objects that list the object's
source connectors, sink connectors, and snippets of executable Javascript code
that may define actions performed on the sink and source entry when data is
processed.

The overall interface will be able to open and save, and close files located in
the directory "./projects" (relative to the project root). Project files will be
named <*>_prj.json and the names will be unique. These files will contain JSON
format lists of the objects in the workspace, their relative position within the
workspace and their source and sink targets (targets may be multiple).

Upon loading a particular *_prj.json file, the system will close any previously
open project file, clear the workspace canvas, Load the new file, and position
its objects according their stored locations and connect any source and sink
connectors using narrow bezier lines with small arrowheads showing data flow
direction. This representation should reflect the state at the time it was last
saved.
