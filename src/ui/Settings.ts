import type { QualityChoice } from "../render/quality";
import type { PerfOverlay } from "./PerfOverlay";

/**
 * Panneau de réglages (ouvert par ⚙️) : choix de la **qualité graphique**
 * (Auto / Basse / Moyenne / Haute) et bascule de l'affichage des perfs (FPS).
 * Changer la qualité déclenche `onQuality` (l'app sauvegarde puis recharge —
 * l'anticrénelage est figé à la création du contexte WebGL).
 */
export class Settings {
  private readonly panel: HTMLElement;
  private readonly backdrop: HTMLElement;

  constructor(current: QualityChoice, onQuality: (choice: QualityChoice) => void, perf: PerfOverlay) {
    this.panel = document.getElementById("settings")!;
    this.backdrop = document.getElementById("settings-backdrop")!;

    document.getElementById("btn-settings")?.addEventListener("click", () => this.toggle());
    document.getElementById("settings-close")?.addEventListener("click", () => this.close());
    this.backdrop.addEventListener("click", () => this.close());

    // Sélecteur de qualité : surligne le choix courant, applique au clic.
    for (const btn of Array.from(this.panel.querySelectorAll<HTMLButtonElement>("#quality-seg button"))) {
      btn.classList.toggle("active", btn.dataset.q === current);
      btn.addEventListener("click", () => {
        if (btn.dataset.q === current) {
          this.close(); // déjà ce palier : rien à recharger
          return;
        }
        onQuality(btn.dataset.q as QualityChoice);
      });
    }

    // Affichage des perfs (FPS) — même bascule que la touche P.
    document.getElementById("perf-toggle")?.addEventListener("click", () => {
      perf.toggle();
      this.close();
    });
  }

  private open(): void {
    this.panel.classList.add("open");
    this.backdrop.classList.add("open");
    this.panel.setAttribute("aria-hidden", "false");
  }

  close(): void {
    this.panel.classList.remove("open");
    this.backdrop.classList.remove("open");
    this.panel.setAttribute("aria-hidden", "true");
  }

  private toggle(): void {
    if (this.panel.classList.contains("open")) this.close();
    else this.open();
  }
}
