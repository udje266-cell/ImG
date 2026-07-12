import { AnimationMixer, Group } from "three";
import type { TerrainGrid } from "../sim/terrain/TerrainGrid";
import { ModelLibrary } from "./ModelLibrary";
import { MODEL_CATALOG } from "./modelCatalog";
import { groundHeightAt } from "./TerrainMesh";

/**
 * Scène de validation du style (`?showcase=1`) : pose tous les modèles du
 * catalogue en arc de cercle sur une zone de terre proche du centre de la
 * carte, animations d'idle jouées. Sert d'asset viewer permanent — on y
 * juge chaque nouveau modèle avant de l'utiliser en jeu.
 */
export class Showcase {
  readonly group = new Group();
  readonly center: { x: number; y: number };

  private readonly mixers: AnimationMixer[] = [];
  private readonly library = new ModelLibrary();

  constructor(private readonly terrain: TerrainGrid) {
    this.center = this.findLandSpot();
  }

  /** Charge et place tous les modèles du catalogue. */
  async populate(): Promise<void> {
    const { x: cx, y: cy } = this.center;
    const radius = 5;
    const count = MODEL_CATALOG.length;
    await Promise.all(
      MODEL_CATALOG.map(async (def, i) => {
        // Arc face à la caméra (le rig regarde vers -Z par défaut du spot).
        const angle = Math.PI * (0.25 + (1.5 * i) / Math.max(1, count - 1));
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        const { root, mixer, groundOffset } = await this.library.load(def);
        const y = groundHeightAt(this.terrain, px, py) + groundOffset + (def.flyHeight ?? 0);
        root.position.set(px, y, py);
        root.lookAt(cx, root.position.y, cy);
        this.group.add(root);
        if (mixer) this.mixers.push(mixer);
      }),
    );
  }

  /** Fait avancer les animations d'idle (dt en secondes). */
  update(dtSeconds: number): void {
    for (const mixer of this.mixers) mixer.update(dtSeconds);
  }

  /**
   * Première zone de terre ferme en spirale depuis le centre de la carte :
   * toutes les cellules dans un rayon de 6 tuiles doivent être émergées.
   */
  private findLandSpot(): { x: number; y: number } {
    const terrain = this.terrain;
    const cx = Math.floor(terrain.width / 2);
    const cy = Math.floor(terrain.height / 2);
    const margin = 8;
    for (let ring = 0; ring < Math.max(terrain.width, terrain.height); ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < margin || y < margin || x >= terrain.width - margin || y >= terrain.height - margin) continue;
          if (this.isOpenLand(x, y, 6)) return { x, y };
        }
      }
    }
    return { x: cx, y: cy }; // carte sans terre : on pose au centre quand même
  }

  private isOpenLand(x: number, y: number, radius: number): boolean {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (this.terrain.isWater(x + dx, y + dy)) return false;
      }
    }
    return true;
  }
}
