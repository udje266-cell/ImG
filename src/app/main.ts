import { SceneRenderer } from "../render/SceneRenderer";
import { Simulation } from "../sim/world/Simulation";
import { Hud } from "../ui/Hud";
import { InputController } from "../ui/InputController";
import { GameLoop } from "./GameLoop";

/**
 * Composition root: the only place where sim, render, ui and the loop are
 * wired together. Pass `?seed=<n>` in the URL to regenerate a specific world.
 */
function boot(): void {
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get("seed") ?? "1337", 10) || 1337;

  const sim = new Simulation({ seed });

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const hudElement = document.getElementById("hud")!;

  const renderer = new SceneRenderer(canvas, sim);
  const hud = new Hud(hudElement);
  const loop = new GameLoop(sim, () => {
    renderer.render(sim);
    hud.update(sim, { paused: loop.paused, speed: loop.speed });
  });

  const input = new InputController(canvas, renderer, sim.bus, loop);
  input.attach();

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

  window.addEventListener("resize", () => renderer.resize());
  renderer.resize();
  loop.start();
}

boot();
