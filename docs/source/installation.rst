Installation & Platform Setup
==============================

This guide covers system requirements, platform-specific installation instructions, package dependencies, and instructions for building SCPI-flow from source across Linux, macOS, and Windows.

System Requirements
-------------------

General Requirements
^^^^^^^^^^^^^^^^^^^^
* **Architecture**: x86_64 / amd64 (standalone binary and Linux packages) or any CPU architecture supported by Deno (x86_64, aarch64 / ARM64 for macOS / Linux / Windows when running from source).
* **Network**: Loopback interface (``127.0.0.1`` / ``localhost``) for HTTP REST API and instrument child process isolation. No internet connection is required during execution (all assets and dependencies are vendored).
* **Web Browser**: Any modern browser (Chromium, Firefox, Safari, Edge) for GUI front-panel and canvas operations.

Runtime Dependencies by Mode
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 25 35 40

   * - Distribution Type
     - Required Dependencies
     - Notes
   * - **Standalone Binary** (Linux)
     - ``glibc`` >= 2.31
     - Fully self-contained. Subordinate standard instruments and UI assets are embedded.
   * - **Alpine Linux Package**
     - ``gcompat``, ``libstdc++``
     - Required to provide glibc compatibility on musl libc.
   * - **From Source / Dev**
     - **Deno** stable 2.4+
     - Used to run, develop, or compile custom builds.
   * - **Python MCP Flows**
     - Python 3.8+ (optional)
     - Optional for running Python automation scripts and test flows.
   * - **Shell MCP Flows**
     - ``curl``, ``jq`` (optional)
     - Optional for shell pipeline automation.

Platform-Specific Installation
------------------------------

1. Debian / Ubuntu / Linux Mint / Pop!_OS
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

For Debian-based distributions, install the official ``.deb`` package:

.. code-block:: bash

   # Download or locate the package
   sudo dpkg -i scpi-flow_0.8.0_amd64.deb

   # Alternatively, using apt to resolve any system dependencies automatically:
   sudo apt-get install ./scpi-flow_0.8.0_amd64.deb

**Package Details:**
* **Executable Binary**: Installed to ``/usr/bin/scpi-flow``
* **Desktop Integration**: Desktop menu launcher installed to ``/usr/share/applications/scpi-flow.desktop``
* **Icons**: Standard hicolor icons installed to ``/usr/share/icons/hicolor/scalable/apps/scpi-flow.svg``
* **Dependencies**: ``libc6 (>= 2.31)``

To start SCPI-flow from terminal:

.. code-block:: bash

   scpi-flow

2. Red Hat / Fedora / CentOS / AlmaLinux / Rocky Linux / openSUSE
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

For RPM-based distributions, install the official ``.rpm`` package:

.. code-block:: bash

   # Using dnf (Fedora / RHEL 8+ / AlmaLinux / Rocky Linux)
   sudo dnf install ./scpi-flow-0.8.0-1.x86_64.rpm

   # Or using rpm directly
   sudo rpm -ivh scpi-flow-0.8.0-1.x86_64.rpm

   # On openSUSE (using zypper)
   sudo zypper install ./scpi-flow-0.8.0-1.x86_64.rpm

**Package Details:**
* **Executable Binary**: Installed to ``/usr/bin/scpi-flow``
* **Desktop Integration**: ``/usr/share/applications/scpi-flow.desktop``
* **Dependencies**: Standard GNU C library (``glibc``).

3. Alpine Linux / postmarketOS
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Alpine Linux uses ``musl libc`` instead of ``glibc``. When installing the ``.apk`` package, install ``gcompat`` to provide the required glibc ABI compatibility layer:

.. code-block:: bash

   # 1. Install gcompat compatibility library
   sudo apk add gcompat libstdc++

   # 2. Install the SCPI-flow APK package
   sudo apk add --allow-untrusted ./scpi-flow-0.8.0-r1.apk

**Package Details:**
* **Executable Binary**: ``/usr/bin/scpi-flow``
* **Package Metadata**: Declares ``gcompat`` runtime dependency in ``.PKGINFO``.

4. Generic Linux / Standalone Executable
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

If you do not want to install system packages, use the standalone compiled executable directly:

.. code-block:: bash

   # Make the binary executable
   chmod +x dist/linux/amd86/scpi-flow

   # Run directly
   ./dist/linux/amd86/scpi-flow

   # Or copy to system PATH
   sudo cp dist/linux/amd86/scpi-flow /usr/local/bin/

5. macOS (Apple Silicon M1/M2/M3/M4 & Intel)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To run SCPI-flow on macOS, use the Deno runtime:

.. code-block:: bash

   # 1. Install Deno via Homebrew (recommended)
   brew install deno

   # Or install Deno via official installer script:
   # curl -fsSL https://deno.land/install.sh | sh

   # 2. Clone the repository
   git clone https://github.com/wittend/SCPI-flow.git
   cd SCPI-flow

   # 3. Start the application
   deno task start

6. Windows (10 / 11 x64)
^^^^^^^^^^^^^^^^^^^^^^^^

To run SCPI-flow on Windows:

.. code-block:: powershell

   # 1. Install Deno via Windows Package Manager (winget)
   winget install DenoLand.Deno

   # Or via PowerShell installer:
   # irm https://deno.land/install.ps1 | iex

   # 2. Clone or download repository
   git clone https://github.com/wittend/SCPI-flow.git
   cd SCPI-flow

   # 3. Start the server
   deno task start

Target Operating System Directories
-----------------------------------

SCPI-flow conforms to OS-standard path specifications for user configurations, saved projects, and runtime state:

.. list-table::
   :header-rows: 1
   :widths: 20 25 25 30

   * - Operating System
     - Config Directory (Catalog)
     - Data Directory (Projects & Instruments)
     - State Directory (Instances)
   * - **Linux** (XDG)
     - ``~/.config/SCPI-flow/``
     - ``~/.local/share/SCPI-flow/``
     - ``~/.local/state/SCPI-flow/$APP_INSTANCE/``
   * - **macOS**
     - ``~/Library/Application Support/SCPI-flow/``
     - ``~/Library/Application Support/SCPI-flow/``
     - ``~/Library/Application Support/SCPI-flow/State/$APP_INSTANCE/``
   * - **Windows**
     - ``%APPDATA%\SCPI-flow\``
     - ``%APPDATA%\SCPI-flow\``
     - ``%LOCALAPPDATA%\SCPI-flow\State\$APP_INSTANCE\``

Building from Source & Packaging
--------------------------------

If you want to build standalone binaries or package distributions from source:

.. code-block:: bash

   # 1. Compile standalone Linux binary with all embedded assets:
   deno task compile:linux:amd86

   # 2. Build Debian (.deb) package:
   deno task package:deb

   # 3. Build RPM (.rpm) package:
   deno task package:rpm

   # 4. Build Alpine (.apk) package:
   deno task package:apk

   # 5. Build all packages at once:
   deno task package:linux:amd86

Command-Line Options & Environment Variables
--------------------------------------------

The executable and Deno runner support several CLI flags and environment variables:

.. list-table::
   :header-rows: 1
   :widths: 30 20 50

   * - CLI Flag
     - Env Variable
     - Description
   * - ``--port <number>``
     - ``PORT``
     - Port for the loopback HTTP server (default: ``8000``).
   * - ``--catalog <path>``
     - ``SCPI_FLOW_CATALOG``
     - Path to custom ``instruments.json`` catalog.
   * - ``--project-dir <path>``
     - ``SCPI_FLOW_PROJECTS``
     - Directory for saved data flow project files.
   * - ``--state-dir <path>``
     - ``SCPI_FLOW_STATE``
     - Directory for runtime instance state and sockets.
   * - ``--instance <id>``
     - ``APP_INSTANCE``
     - Instance identifier for multi-session isolation.
   * - ``--open`` / ``--no-open``
     - N/A
     - Auto-launch default web browser on startup (enabled in interactive sessions).
   * - ``--headless``
     - N/A
     - Run without browser launch (ideal for CI/CD and automated MCP services).
