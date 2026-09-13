import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = join(projectRoot, "src");

function listTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

const IMPORT_PATTERN = /from\s+"([^"]+)"/g;

function importSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? "");
}

/** 相対importを辿って到達できる外部packageをすべて集める。 */
function reachableExternalPackages(entryPath: string): Set<string> {
  const visited = new Set<string>();
  const externals = new Set<string>();
  const queue = [entryPath];

  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || visited.has(current)) {
      continue;
    }
    visited.add(current);

    for (const specifier of importSpecifiers(current)) {
      if (specifier.startsWith(".")) {
        queue.push(resolve(dirname(current), specifier));
      } else if (!specifier.startsWith("node:")) {
        externals.add(specifier);
      }
    }
  }
  return externals;
}

describe("layering", () => {
  it("keeps every domain module free of Phaser and Box2D, even transitively", () => {
    const offenders = listTypeScriptFiles(join(sourceRoot, "domain"))
      .map((filePath) => ({
        file: relative(projectRoot, filePath),
        packages: [...reachableExternalPackages(filePath)].filter((name) =>
          name.startsWith("phaser")
        )
      }))
      .filter((entry) => entry.packages.length > 0);

    expect(offenders).toEqual([]);
  });

  it("keeps the simulation core independent of the Box2D adapter", () => {
    const coreModules = ["episode-runner.ts", "skeleton-plan.ts", "fixed-step-runner.ts"];
    const offenders = coreModules
      .map((name) => ({
        file: name,
        packages: [...reachableExternalPackages(join(sourceRoot, "simulation", name))].filter(
          (specifier) => specifier.startsWith("phaser")
        )
      }))
      .filter((entry) => entry.packages.length > 0);

    expect(offenders).toEqual([]);
  });

  it("confines Box2D imports to the adapter directory", () => {
    const importers = listTypeScriptFiles(sourceRoot)
      .filter((filePath) =>
        importSpecifiers(filePath).some((specifier) => specifier.startsWith("phaser-box2d"))
      )
      .map((filePath) => relative(projectRoot, filePath));

    for (const importer of importers) {
      expect(
        importer.startsWith("src/simulation/box2d/") ||
          importer === "src/simulation/p0-physics-rig.ts"
      ).toBe(true);
    }
    expect(importers.length).toBeGreaterThan(0);
  });
});
