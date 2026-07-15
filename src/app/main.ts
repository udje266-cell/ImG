import { SceneRenderer } from "../render/SceneRenderer";
import { POWER_CATALOG } from "../sim/powers/catalog";
import { loadSimulation, serializeSimulation, type AnySaveData } from "../sim/save/save";
import { Simulation } from "../sim/world/Simulation";
import { Grimoire } from "../ui/Grimoire";
import { Hud } from "../ui/Hud";
import { InputController, type GamePersistence } from "../ui/InputController";
import { PerfOverlay } from "../ui/PerfOverlay";
import { GameLoop } from "./GameLoop";

const SAVE_KEY = "img:save";

/**
 * Composition root: the only place where sim, render, ui and the loop are
 * wired together. `?seed=<n>` régénère un monde ; `?load=1` reprend la
 * sauvegarde locale ; `?showcase=1` ouvre l'asset viewer.
 */
function boot(): void {
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get("seed") ?? "1337", 10) || 1337;

  const sim = restoreOrCreate(params, seed);

  // Debug : ?tick=<n> cale l'horloge (utile pour figer une heure — captures).
  const tickParam = params.get("tick");
  if (tickParam) sim.clock.tick = Math.max(0, Number.parseInt(tickParam, 10) || 0);

  const canvas = document.getElementById("game") as HTMLCanvasElement;

  const renderer = new SceneRenderer(canvas, sim);
  const hud = new Hud();
  const perf = new PerfOverlay(document.getElementById("perf")!, sim);
  document.getElementById("btn-settings")?.addEventListener("click", () => perf.toggle());
  const loop = new GameLoop(sim, () => {
    renderer.render(sim);
    hud.update(sim, { paused: loop.paused, speed: loop.speed });
    perf.update();
  });

  const persistence: GamePersistence = {
    save: () => {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(serializeSimulation(sim)));
      hud.flash("Partie sauvegardée");
      (document.getElementById("btn-load") as HTMLButtonElement | null)?.removeAttribute("disabled");
    },
    load: () => {
      if (!window.localStorage.getItem(SAVE_KEY)) return;
      const url = new URL(window.location.href);
      url.searchParams.set("load", "1");
      window.location.href = url.toString();
    },
    hasSave: () => window.localStorage.getItem(SAVE_KEY) !== null,
  };

  const input = new InputController(canvas, renderer, sim, loop, persistence);
  input.attach();

  // Grimoire : onglet dédié qui pilote la sélection du pouvoir actif.
  const grimoire = new Grimoire(sim, (meta) => input.setActivePower(meta));

  sim.bus.on("progression:powerUnlocked", ({ power }) => {
    const meta = POWER_CATALOG.find((m) => m.power === power);
    if (meta) hud.flash(`Pouvoir débloqué : ${meta.name} ${meta.icon}`);
    grimoire.open(); // révèle le nouveau pouvoir dans le grimoire
  });

  // Religions : le style de règne du joueur façonne les cultes (phase 6).
  sim.bus.on("settlements:founded", () => {
    hud.flash("Ta lignée fonde son premier village 🏡");
  });
  sim.bus.on("religion:priestOrdained", ({ village, doctrine }) => {
    hud.flash(`Un prêtre s'élève au village ${village + 1} — culte de la ${doctrine} 🙏`);
  });
  sim.bus.on("religion:templeRaised", ({ village, doctrine }) => {
    hud.flash(`Le village ${village + 1} érige un temple à la ${doctrine} 🏛️`);
  });

  // Forêts + nuages 3D + habitants (hors showcase, qui a sa propre mise en scène).
  if (!params.has("showcase")) {
    void renderer.enableForest(sim, "models/props/tree.glb");
    void renderer.enableCloudModel("models/props/cloud.glb");
    const freshWorld = sim.agents.count === 0;
    // Genèse : le monde commence avec les Deux Premiers — un homme et une
    // femme. Guidés par la divinité, ils prospéreront ; leur descendance
    // fondera le premier village (puis les suivants), et ainsi de suite.
    if (freshWorld) {
      sim.genesis();
      hud.flash("Au commencement : un homme et une femme. Guide-les. 🌍");
    }
    void renderer.enableInhabitants(sim, [
      "models/characters/prehistoric-man.glb",
      "models/characters/prehistoric-woman.glb",
    ]);
    renderer.enableSettlements();
    if (sim.fauna.count === 0) sim.fauna.populate(80, 12); // herbivores, prédateurs
    void renderer.enableFauna(sim, ["models/animals/Horse.glb", "models/animals/Fox.glb"]);
  }

  // Mode validation des modèles 3D : ?showcase=1 pose personnages et animaux
  // du catalogue sur la terre la plus proche du centre, en plein midi.
  if (params.has("showcase")) {
    sim.clock.tick = 120; // midi — scène bien éclairée
    loop.paused = true; // lumière stable pour juger les modèles (les idles tournent quand même)
    void renderer.enableShowcase(sim).then((spot) => {
      renderer.rig.target.set(spot.x, 0, spot.y);
      renderer.rig.distance = 22;
    });
  }

  // Hook de debug (?debug) : inspection depuis la console ou les tests e2e.
  if (params.has("debug")) {
    (window as unknown as { __img: unknown }).__img = { sim, renderer, loop };
  }

  window.addEventListener("resize", () => renderer.resize());
  renderer.resize();
  loop.start();
}

/** `?load=1` + sauvegarde locale valide → reprise ; sinon monde neuf. */
function restoreOrCreate(params: URLSearchParams, seed: number): Simulation {
  const now = (): number => performance.now();
  if (params.has("load")) {
    const stored = window.localStorage.getItem(SAVE_KEY);
    if (stored) {
      try {
        return loadSimulation(JSON.parse(stored) as AnySaveData, { now });
      } catch (error) {
        console.error("Sauvegarde illisible — nouveau monde généré.", error);
      }
    }
  }
  return new Simulation({ seed, now });
}

boot();
