/**
 * Décime un modèle glTF/glb lourd (typiquement une génération Tripo/IA à
 * plusieurs millions de triangles) en asset game-ready léger, sans perte de
 * style visible. Weld + simplification quadrique (meshoptimizer) + prune.
 *
 * Usage :
 *   node tools/decimate-model.mjs <entrée.glb> <sortie.glb> [ratio]
 *   npm run assets:decimate -- <entrée.glb> <sortie.glb> [ratio]
 *
 * `ratio` = fraction de triangles conservée (défaut 0.02). Un arbre de 2 M
 * triangles à 0.0015 tombe à ~3 000 tris, indiscernable de l'original.
 *
 * Voir docs/ASSETS.md pour le workflow complet.
 */
import { statSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const [, , input, output, ratioArg, errorArg] = process.argv;
if (!input || !output) {
  console.error("Usage: node tools/decimate-model.mjs <input.glb> <output.glb> [ratio] [error]");
  process.exit(1);
}
const ratio = Number(ratioArg ?? "0.02");
// `error` = déviation max tolérée (fraction de la taille du modèle). Plus haut
// = plus agressif. 0.01 par défaut ; ~0.1+ pour un LOD lointain très léger.
const maxError = Number(errorArg ?? "0.01");

function triangleCount(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += idx ? idx.getCount() / 3 : prim.getAttribute("POSITION").getCount() / 3;
    }
  }
  return Math.round(tris);
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const before = triangleCount(doc);

await doc.transform(
  dedup(),
  weld({ tolerance: maxError > 0.05 ? 0.001 : 0.0001 }),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: maxError, lockBorder: false }),
  prune(),
);

const after = triangleCount(doc);
await io.write(output, doc);
const sizeMB = (statSync(output).size / 1e6).toFixed(2);
const srcMB = (statSync(input).size / 1e6).toFixed(1);
console.log(
  `${input.split("/").pop()} → ${output.split("/").pop()}\n` +
    `  triangles : ${before.toLocaleString()} → ${after.toLocaleString()} (${((after / before) * 100).toFixed(1)} %)\n` +
    `  taille    : ${srcMB} Mo → ${sizeMB} Mo`,
);
