import { SceneRenderer } from "../render/SceneRenderer";
import { PLAYER_FACTION } from "../sim/agents/AgentSystem";
import { POWER_CATALOG } from "../sim/powers/catalog";
import { loadSimulation, serializeSimulation, type AnySaveData } from "../sim/save/save";
import { sailToNextIsland, Simulation } from "../sim/world/Simulation";
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
function startGame(params: URLSearchParams): void {
  document.getElementById("home")?.remove(); // masque le menu d'accueil s'il était affiché
  const seed = Number.parseInt(params.get("seed") ?? "1337", 10) || 1337;

  const sim = restoreOrCreate(params, seed);

  // Debug : ?tick=<n> cale l'horloge (utile pour figer une heure — captures).
  const tickParam = params.get("tick");
  if (tickParam) sim.clock.tick = Math.max(0, Number.parseInt(tickParam, 10) || 0);

  const canvas = document.getElementById("game") as HTMLCanvasElement;

  const renderer = new SceneRenderer(canvas, sim, { lowSpec: detectLowSpec() });
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
  sim.bus.on("era:advanced", ({ name, politics }) => {
    hud.flash(`Nouvelle ère : ${name} — ${politics} 🏛️`);
  });
  sim.bus.on("war:declared", ({ attacker, defender }) => {
    hud.flash(`⚔️ Guerre ! Le village ${attacker + 1} attaque le village ${defender + 1}`);
  });
  sim.bus.on("war:raid", ({ victor, casualties }) => {
    if (casualties > 0) hud.flash(`Raid : ${casualties} mort${casualties > 1 ? "s" : ""} — le village ${victor + 1} l'emporte`);
  });
  // Annexion : un village entier change de dieu — victoire éclatante ou revers.
  sim.bus.on("war:annexed", ({ village, faction }) => {
    if (faction === PLAYER_FACTION) hud.flash(`🏴 Le village ${village + 1} passe sous ta bannière !`);
    else hud.flash(`🏴 Un dieu rival annexe le village ${village + 1}…`);
  });
  sim.bus.on("trade:established", ({ a, b }) => {
    hud.flash(`🤝 Route commerciale : village ${a + 1} ⇄ village ${b + 1}`);
  });
  // Voyage : le navire est prêt → propose d'embarquer vers une nouvelle île.
  // Embarquer revient à repartir d'un monde neuf en gardant sa progression.
  sim.bus.on("voyage:shipReady", () => {
    hud.flash("⛵ Le navire est prêt ! Cingle vers une nouvelle île.");
    showEmbarkButton(() => {
      const next = sailToNextIsland(sim, () => performance.now());
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(serializeSimulation(next)));
      const url = new URL(window.location.href);
      url.searchParams.set("load", "1");
      window.location.href = url.toString();
    });
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
      sim.clock.tick = 120; // démarre en plein jour : on voit tout de suite les Deux Premiers
      hud.flash("Au commencement : un homme et une femme. Guide-les. 🌍");
      // Rappel du cœur du jeu : le peuple ne bâtit que sur du plat.
      window.setTimeout(() => hud.flash("Aplanis la terre : ton peuple ne bâtit que sur du plat. ⛰️→▦"), 3200);
    }
    renderer.enableInhabitants(sim); // villageois procéduraux (tenue par ère)
    void renderer.enableSettlements();
    if (sim.fauna.count === 0) sim.fauna.populate(80, 12); // herbivores, prédateurs
    void renderer.enableFauna(sim, ["models/animals/Horse.glb", "models/animals/Fox.glb"]);

    // Caméra : on démarre CENTRÉ sur son peuple. Un monde neuf → gros plan sur
    // les Deux Premiers (sinon deux silhouettes de 0,8 u sont invisibles de loin) ;
    // une partie reprise → vue rapprochée sur le barycentre de la population.
    const snap = sim.agents.snapshot();
    if (snap.count > 0) {
      let mx = 0;
      let mz = 0;
      for (let i = 0; i < snap.count; i++) {
        mx += snap.x[i]!;
        mz += snap.y[i]!;
      }
      // Vise la mi-hauteur des silhouettes (y≈0.5) pour les caler au centre de l'écran.
      renderer.rig.target.set(mx / snap.count, freshWorld ? 0.5 : 0, mz / snap.count);
      renderer.rig.distance = freshWorld ? 16 : 70;
      // Angle plus rasant à la Genèse : les Deux Premiers paraissent plus grands
      // (vue de trois-quarts plutôt que plongée verticale).
      if (freshWorld) renderer.rig.pitch = 0.62;
      renderer.rig.update();
    }
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

/**
 * Affiche un bouton « Prendre la mer » bien visible quand le navire est prêt.
 * Idempotent : ne crée le bouton qu'une fois.
 */
function showEmbarkButton(onEmbark: () => void): void {
  if (document.getElementById("btn-embark")) return;
  const btn = document.createElement("button");
  btn.id = "btn-embark";
  btn.textContent = "⛵ Prendre la mer";
  Object.assign(btn.style, {
    position: "fixed",
    top: "84px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "50",
    padding: "12px 22px",
    fontSize: "16px",
    fontWeight: "700",
    color: "#0f1319",
    background: "linear-gradient(180deg,#7fc3e8,#4f83ad)",
    border: "1px solid #a9d8f0",
    borderRadius: "999px",
    boxShadow: "0 4px 18px rgba(0,0,0,.45)",
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "⛵ Appareillage…";
    onEmbark();
  });
  document.body.appendChild(btn);
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

/**
 * Appareil modeste (mobile / GPU faible) → rendu allégé (pas de bloom ni MSAA,
 * ombres et résolution réduites). Vrai dès qu'un signe de mobilité apparaît :
 * pointeur grossier (tactile), user-agent mobile, peu de cœurs ou peu de RAM.
 */
function detectLowSpec(): boolean {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  const lowMem = ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  return coarse || mobileUA || fewCores || lowMem;
}

/**
 * Menu d'accueil : titre + « Nouvelle partie » / « Continuer » (activé si une
 * sauvegarde existe). Le jeu ne démarre qu'au choix du joueur (plus de partie
 * qui s'ouvre brutalement sans écran d'accueil).
 */
function showHomeMenu(onNew: () => void, onContinue: () => void): void {
  const home = document.getElementById("home");
  const btnNew = document.getElementById("home-new");
  const btnContinue = document.getElementById("home-continue") as HTMLButtonElement | null;
  if (!home || !btnNew || !btnContinue) {
    onNew(); // repli : pas de menu dans le DOM → on démarre directement
    return;
  }
  home.style.display = "flex";
  if (window.localStorage.getItem(SAVE_KEY) === null) btnContinue.setAttribute("disabled", "");
  btnNew.addEventListener("click", onNew);
  btnContinue.addEventListener("click", onContinue);
}

/**
 * Point d'entrée. Les modes techniques (tests e2e `?debug`, reprise directe
 * `?load`, `?showcase`) démarrent sans menu ; un lancement normal ouvre l'écran
 * d'accueil et attend le choix du joueur.
 */
function boot(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.has("showcase") || params.has("debug") || params.has("load")) {
    startGame(params);
    return;
  }
  showHomeMenu(
    () => startGame(params),
    () => {
      // « Continuer » : recharge en mode reprise (le menu est alors court-circuité).
      const url = new URL(window.location.href);
      url.searchParams.set("load", "1");
      window.location.href = url.toString();
    },
  );
}

boot();
