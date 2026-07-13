import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "../../src/render/modelCatalog";

const PUBLIC = fileURLToPath(new URL("../../public", import.meta.url));

describe("MODEL_CATALOG", () => {
  it("has unique ids", () => {
    const ids = MODEL_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses relative urls (required by the base './' mobile build)", () => {
    for (const def of MODEL_CATALOG) {
      expect(def.url, def.id).toMatch(/^models\//);
    }
  });

  it("every referenced file exists in public/", () => {
    for (const def of MODEL_CATALOG) {
      expect(existsSync(join(PUBLIC, def.url)), `${def.id}: ${def.url}`).toBe(true);
    }
  });

  it("target heights are sane (creatures <= 3 tiles, props <= 12)", () => {
    for (const def of MODEL_CATALOG) {
      expect(def.targetHeight, def.id).toBeGreaterThan(0);
      const max = def.category === "prop" ? 12 : 3;
      expect(def.targetHeight, def.id).toBeLessThanOrEqual(max);
    }
  });

  it("contains characters, animals and props", () => {
    const categories = new Set(MODEL_CATALOG.map((d) => d.category));
    expect(categories.has("character")).toBe(true);
    expect(categories.has("animal")).toBe(true);
    expect(categories.has("prop")).toBe(true);
  });
});
