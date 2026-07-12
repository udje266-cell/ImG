import { AnimationMixer, Box3, Group, Vector3 } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelDef } from "./modelCatalog";

/**
 * Chargement des modèles glTF (docs/TDD.md §4.5) : normalisation d'échelle
 * via bounding box (les sources ont des unités arbitraires), ancrage au sol,
 * et sélection d'un clip d'animation d'idle. Le glTF parsé est mis en cache
 * par URL ; chaque `load` retourne une instance indépendante.
 *
 * NOTE perf : cette voie (SkinnedMesh + AnimationMixer) convient aux scènes
 * de quelques dizaines d'individus. La phase Habitants (milliers d'agents)
 * passera par de l'instanciation — voir ROADMAP phase 4.
 */
export interface LoadedModel {
  root: Group;
  mixer: AnimationMixer | null;
  /** Offset Y pour poser les pieds du modèle sur le sol. */
  groundOffset: number;
}

export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<GLTF>>();

  async load(def: ModelDef): Promise<LoadedModel> {
    let pending = this.cache.get(def.url);
    if (!pending) {
      pending = this.loader.loadAsync(def.url);
      this.cache.set(def.url, pending);
    }
    const gltf = await pending;

    // Une instance par appel : pour des modèles skinnés utilisés une fois
    // chacun (showcase), recharger la scène du cache suffit ; l'instanciation
    // de masse viendra avec la phase Habitants.
    const root = gltf.scene;

    const box = new Box3().setFromObject(root);
    const size = new Vector3();
    box.getSize(size);
    const scale = def.targetHeight / (size.y || 1);
    root.scale.setScalar(scale);
    const groundOffset = -box.min.y * scale;

    let mixer: AnimationMixer | null = null;
    if (gltf.animations.length > 0) {
      mixer = new AnimationMixer(root);
      const hint = def.clipHint?.toLowerCase();
      let clip = gltf.animations[0]!;
      if (hint) {
        clip = gltf.animations.find((c) => c.name.toLowerCase().includes(hint)) ?? clip;
      }
      mixer.clipAction(clip)?.play();
    }

    return { root, mixer, groundOffset };
  }
}
