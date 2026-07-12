import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture tests (docs/TDD.md §2.1, §6): the layering and determinism
 * rules are enforced by CI, not by convention.
 */
const SRC = fileURLToPath(new URL("../src", import.meta.url));

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectTsFiles(full));
    else if (entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

function sources(layer: string): Array<{ file: string; content: string }> {
  return collectTsFiles(join(SRC, layer)).map((file) => ({
    file: file.slice(SRC.length + 1),
    content: readFileSync(file, "utf8"),
  }));
}

describe("architecture: layer dependencies flow one way only", () => {
  it("core imports nothing from sim, render, ui or app", () => {
    for (const { file, content } of sources("core")) {
      expect(content, file).not.toMatch(/from\s+["'][^"']*\/(sim|render|ui|app)\//);
    }
  });

  it("sim imports nothing from render, ui or app", () => {
    for (const { file, content } of sources("sim")) {
      expect(content, file).not.toMatch(/from\s+["'][^"']*\/(render|ui|app)\//);
    }
  });

  it("render imports nothing from ui or app", () => {
    for (const { file, content } of sources("render")) {
      expect(content, file).not.toMatch(/from\s+["'][^"']*\/(ui|app)\//);
    }
  });

  it("ui imports nothing from app", () => {
    for (const { file, content } of sources("ui")) {
      expect(content, file).not.toMatch(/from\s+["'][^"']*\/app\//);
    }
  });
});

describe("architecture: simulation purity and determinism", () => {
  it("core and sim never call Math.random or Date.now", () => {
    for (const layer of ["core", "sim"]) {
      for (const { file, content } of sources(layer)) {
        // Match calls only, so documentation may still mention the names.
        expect(content, file).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(/);
      }
    }
  });

  it("core and sim never touch browser APIs", () => {
    for (const layer of ["core", "sim"]) {
      for (const { file, content } of sources(layer)) {
        expect(content, file).not.toMatch(/\b(window|document|navigator|requestAnimationFrame|performance)\./);
        expect(content, file).not.toMatch(/HTMLCanvasElement|CanvasRenderingContext2D/);
      }
    }
  });
});
