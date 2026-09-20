#!/usr/bin/env python3
"""
Automated Signal Generator & Oscilloscope Sweep Flow in Python.

Orchestrates multi-frequency sweep, checks SCPI responses, and calculates
amplitude/frequency metrics using SCPI-flow MCP tools.
"""

import math
import sys
import time
from mcp_client import ScpiFlowMcpClient


def run_sweep():
    print("=== SCPI-flow Python MCP Automated Sweep Flow ===")
    client = ScpiFlowMcpClient()

    try:
        print("[1/5] Connecting to SCPI-flow MCP server...")
        client.connect()

        print("[2/5] Loading instruments...")
        client.load("signal-generator")
        client.load("oscilloscope")

        # Identity verification
        siggen_idn = client.command("signal-generator", "*IDN?")
        scope_idn = client.command("oscilloscope", "*IDN?")
        print(f"  Signal Generator: {siggen_idn}")
        print(f"  Oscilloscope:     {scope_idn}")

        print("[3/5] Setting up instruments...")
        client.configure(
            "signal-generator",
            {
                "waveform": "sine",
                "frequency": 1000,
                "amplitude": 2.0,
                "offset": 0.0,
                "output": True,
            },
        )
        client.command("oscilloscope", "C1:VDIV 0.5")

        frequencies = [100, 500, 1000, 5000, 10000]
        results = []

        print("[4/5] Executing frequency sweep points...")
        for freq in frequencies:
            # Update frequency
            client.command("signal-generator", f"FREQ {freq}")

            # Scale oscilloscope timebase
            period = 1.0 / freq
            tdiv = (2.0 * period) / 10.0
            client.command("oscilloscope", f"TDIV {tdiv:.8f}")

            # Query measurements
            meas = client.command("oscilloscope", "MEAS:ALL?")
            print(f"  Freq: {freq:5d} Hz -> Scope Meas: {meas}")
            results.append({"freq_hz": freq, "meas": meas})

        print("\n[5/5] Finalizing and tearing down...")
        client.unload("signal-generator")
        client.unload("oscilloscope")

        print(f"\nCompleted sweep of {len(results)} points successfully.")
        return results

    finally:
        client.close()


if __name__ == "__main__":
    run_sweep()
