/**
 * Génère des textures de remplacement (BaseColor + Normal) pour le terrain,
 * en attendant les vraies fournies par le propriétaire du projet. Mêmes
 * chemins → déposer les vrais PNG les remplace sans toucher au code.
 *
 * Usage : node tools/gen-placeholder-textures.mjs
 */
import { crc32, deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIZE = 128;
const ROOT = fileURLToPath(new URL("../public/textures/terrain", import.meta.url));

/** Encode des données RGBA (Uint8Array, SIZE*SIZE*4) en PNG. */
function encodePng(rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Chaque scanline préfixée d'un octet de filtre 0.
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const off = y * (SIZE * 4 + 1);
    raw[off] = 0;
    rgba.copy?.(raw, off + 1, y * SIZE * 4, (y + 1) * SIZE * 4) ??
      raw.set(rgba.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), off + 1);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// Bruit déterministe reproductible.
function noise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 255) / 255;
}

function baseColor(base, variation, streak, seed) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, seed) - 0.5;
      const s = noise(Math.floor(x / 6), Math.floor(y / 3), seed + 7) < streak ? -18 : 0;
      const o = (y * SIZE + x) * 4;
      rgba[o] = Math.max(0, Math.min(255, base[0] + n * variation + s));
      rgba[o + 1] = Math.max(0, Math.min(255, base[1] + n * variation + s));
      rgba[o + 2] = Math.max(0, Math.min(255, base[2] + n * variation + s * 0.5));
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function normalMap(strength, seed) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Dérivées du bruit → perturbation des normales (base plate 128,128,255).
      const dx = (noise(x + 1, y, seed) - noise(x - 1, y, seed)) * strength;
      const dy = (noise(x, y + 1, seed) - noise(x, y - 1, seed)) * strength;
      const o = (y * SIZE + x) * 4;
      rgba[o] = Math.max(0, Math.min(255, 128 - dx * 127));
      rgba[o + 1] = Math.max(0, Math.min(255, 128 - dy * 127));
      rgba[o + 2] = 255;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

const MATERIALS = [
  { dir: "Grass", base: [96, 168, 58], variation: 46, streak: 0.35, strength: 1.4, seed: 11 },
  { dir: "Sand", base: [230, 212, 156], variation: 30, streak: 0.1, strength: 0.8, seed: 23 },
  { dir: "Rock", base: [138, 128, 118], variation: 54, streak: 0.45, strength: 2.2, seed: 37 },
  { dir: "Dirt", base: [120, 86, 56], variation: 40, streak: 0.3, strength: 1.6, seed: 53 },
];

for (const m of MATERIALS) {
  const dir = `${ROOT}/${m.dir}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${m.dir}_BaseColor.png`, encodePng(baseColor(m.base, m.variation, m.streak, m.seed)));
  writeFileSync(`${dir}/${m.dir}_Normal.png`, encodePng(normalMap(m.strength, m.seed + 100)));
  console.log(`  ${m.dir}: BaseColor + Normal (placeholders)`);
}
console.log(`Placeholders générés dans ${ROOT}`);
