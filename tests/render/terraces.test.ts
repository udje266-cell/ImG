import { describe, expect, it } from "vitest";
import { landLayer, LAYER_STEP, waterBand } from "../../src/render/terraces";

const SEA = 0.5;

describe("terraces (Godus-style height quantisation)", () => {
  it("the first land layer starts right above sea level", () => {
    expect(landLayer(SEA, SEA)).toBe(0);
    expect(landLayer(SEA + LAYER_STEP * 0.99, SEA)).toBe(0);
    expect(landLayer(SEA + LAYER_STEP, SEA)).toBe(1);
  });

  it("is monotonic: higher ground never yields a lower layer", () => {
    let previous = -1;
    for (let h = SEA; h <= 1; h += LAYER_STEP / 4) {
      const layer = landLayer(h, SEA);
      expect(layer).toBeGreaterThanOrEqual(previous);
      previous = layer;
    }
  });

  it("never returns a negative layer, even for heights at/below sea level", () => {
    expect(landLayer(SEA - 0.1, SEA)).toBe(0);
  });

  it("splits water into three flat depth bands", () => {
    expect(waterBand(SEA - 0.01, SEA)).toBe("shallow");
    expect(waterBand(SEA - 0.05, SEA)).toBe("mid");
    expect(waterBand(SEA - 0.2, SEA)).toBe("deep");
  });
});
