#!/usr/bin/env -S deno run --allow-all
/**
 * Utility script to generate SHA-256 digest files (.sha256) and a unified
 * SHA256SUMS file for all release packages and binaries in dist/bin.
 */

import { parseArgs } from "@std/cli";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const flags = parseArgs(Deno.args, {
  string: ["dir"],
  alias: { d: "dir" },
  default: { dir: "./dist/bin" },
});

export async function calculateSha256(filePath: string): Promise<string> {
  const data = await Deno.readFile(filePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateChecksumsForDir(
  dir: string,
): Promise<Map<string, string>> {
  await ensureDir(dir);
  const checksums = new Map<string, string>();

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile) continue;
    if (
      entry.name.endsWith(".sha256") ||
      entry.name === "SHA256SUMS" ||
      entry.name === "APKBUILD" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }

    const filePath = join(dir, entry.name);
    const hash = await calculateSha256(filePath);
    checksums.set(entry.name, hash);

    // Write individual .sha256 file
    const shaFilePath = `${filePath}.sha256`;
    await Deno.writeTextFile(shaFilePath, `${hash}  ${entry.name}\n`);
    console.log(`Generated SHA-256 for ${entry.name}: ${hash}`);
  }

  // Write consolidated SHA256SUMS
  if (checksums.size > 0) {
    const lines: string[] = [];
    const sortedKeys = Array.from(checksums.keys()).sort();
    for (const name of sortedKeys) {
      lines.push(`${checksums.get(name)}  ${name}`);
    }
    const sumsFile = join(dir, "SHA256SUMS");
    await Deno.writeTextFile(sumsFile, lines.join("\n") + "\n");
    console.log(`Wrote consolidated checksums to ${sumsFile}`);
  }

  return checksums;
}

if (import.meta.main) {
  const targetDir = flags.dir;
  console.log(`Generating SHA-256 digests for artifacts in ${targetDir}...`);
  await generateChecksumsForDir(targetDir);
}
