/**
 * Godus-style terraced terrain: continuous simulation heights are quantised
 * into discrete visual layers, like stacked paper cut-outs. Pure functions,
 * unit-tested — the renderer only consumes them.
 *
 * The step matches TERRAFORM_STRENGTH so one sculpt stroke at the brush
 * centre raises the land by roughly one visible layer.
 */
export const LAYER_STEP = 0.02;

/** 0-based terrace index of a land cell (0 = the layer right above the sea). */
export function landLayer(height: number, seaLevel: number): number {
  return Math.max(0, Math.floor((height - seaLevel) / LAYER_STEP));
}

export type WaterBand = "shallow" | "mid" | "deep";

/** Flat water depth bands (Godus shows stepped water colours, not gradients). */
export function waterBand(height: number, seaLevel: number): WaterBand {
  const depth = seaLevel - height;
  if (depth < 0.04) return "shallow";
  if (depth < 0.12) return "mid";
  return "deep";
}
