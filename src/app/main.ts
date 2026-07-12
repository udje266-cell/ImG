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

  window.addEventListener("resize", () => renderer.resize());
  renderer.resize();
  loop.start();
}

boot();
