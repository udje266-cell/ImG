import { POWER_CATALOG, type PowerMeta, SCHOOLS } from "../sim/powers/catalog";
import { SPARK_COSTS } from "../sim/powers/SparkSystem";
import type { Simulation } from "../sim/world/Simulation";

/**
 * Grimoire des pouvoirs (onglet dédié — cahier des charges §7, docs/GDD.md §5).
 * Vue seule : liste tout le catalogue groupé par école, avec l'état de chaque
 * pouvoir (disponible / verrouillé à un seuil de Dévotion / à venir). La
 * sélection d'un pouvoir disponible remonte via `onSelect` (l'`InputController`
 * en fait le pouvoir actif). Se rafraîchit à chaque déblocage.
 */
export class Grimoire {
  private readonly panel: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly body: HTMLElement;
  private readonly openBtn: HTMLElement | null;
  private readonly label: HTMLElement | null;
  private selectedKey = "raise";

  constructor(
    private readonly sim: Simulation,
    private readonly onSelect: (meta: PowerMeta) => void,
  ) {
    this.panel = document.getElementById("grimoire")!;
    this.backdrop = document.getElementById("grimoire-backdrop")!;
    this.body = document.getElementById("grimoire-body")!;
    this.openBtn = document.getElementById("btn-grimoire");
    this.label = document.getElementById("grimoire-label");

    this.openBtn?.addEventListener("click", () => this.toggle());
    document.getElementById("grimoire-close")?.addEventListener("click", () => this.close());
    this.backdrop.addEventListener("click", () => this.close());
    // Boutons rapides Élever / Abaisser : même circuit de sélection.
    document.getElementById("tool-raise")?.addEventListener("click", () => this.select("raise"));
    document.getElementById("tool-lower")?.addEventListener("click", () => this.select("lower"));

    this.sim.bus.on("progression:powerUnlocked", () => this.render());
    this.render();
  }

  private available(meta: PowerMeta): boolean {
    return meta.power !== null && this.sim.progression.isUnlocked(meta.power);
  }

  /** Tente de sélectionner un pouvoir ; ignore s'il est verrouillé/à venir. */
  select(key: string): void {
    const meta = POWER_CATALOG.find((m) => m.key === key);
    if (!meta || !this.available(meta)) return;
    this.selectedKey = key;
    this.onSelect(meta);
    this.refreshActiveStates();
    if (this.panel.classList.contains("open")) this.close();
  }

  /** Met à jour les surbrillances (chips + boutons rapides + libellé). */
  private refreshActiveStates(): void {
    for (const el of Array.from(this.body.querySelectorAll<HTMLElement>(".spell"))) {
      el.classList.toggle("active", el.dataset.key === this.selectedKey);
    }
    document.getElementById("tool-raise")?.classList.toggle("active", this.selectedKey === "raise");
    document.getElementById("tool-lower")?.classList.toggle("active", this.selectedKey === "lower");
    const meta = POWER_CATALOG.find((m) => m.key === this.selectedKey);
    if (this.label && meta) this.label.textContent = meta.name;
  }

  /** (Re)construit la liste des pouvoirs groupés par école. */
  private render(): void {
    this.body.replaceChildren();
    for (const school of SCHOOLS) {
      const spells = POWER_CATALOG.filter((m) => m.school === school.id);
      if (spells.length === 0) continue;

      const section = document.createElement("div");
      section.className = "school";
      const h3 = document.createElement("h3");
      h3.textContent = `${school.icon} ${school.label}`;
      section.appendChild(h3);

      const grid = document.createElement("div");
      grid.className = "spellgrid";
      for (const meta of spells) grid.appendChild(this.spellChip(meta));
      section.appendChild(grid);
      this.body.appendChild(section);
    }
    this.refreshActiveStates();
  }

  private spellChip(meta: PowerMeta): HTMLElement {
    const chip = document.createElement("button");
    chip.className = "spell";
    chip.dataset.key = meta.key;

    let stateText: string;
    const spark = meta.power ? (SPARK_COSTS[meta.power] ?? 0) : 0;
    const sparkTag = spark > 0 ? ` · ⚡${spark}` : "";
    if (meta.power === null) {
      chip.classList.add("soon");
      stateText = "À venir";
    } else if (this.available(meta)) {
      chip.classList.add("available");
      stateText = `Disponible${sparkTag}`;
      chip.addEventListener("click", () => this.select(meta.key));
    } else {
      chip.classList.add("locked");
      stateText = `🔒 Dévotion ${meta.unlock}${sparkTag}`;
    }

    chip.innerHTML =
      `<span class="top"><span class="ico">${meta.icon}</span>${meta.name}</span>` +
      `<span class="desc">${meta.desc}</span>` +
      `<span class="state">${stateText}</span>`;
    return chip;
  }

  open(): void {
    this.render();
    this.panel.classList.add("open");
    this.backdrop.classList.add("open");
    this.panel.setAttribute("aria-hidden", "false");
  }

  close(): void {
    this.panel.classList.remove("open");
    this.backdrop.classList.remove("open");
    this.panel.setAttribute("aria-hidden", "true");
  }

  toggle(): void {
    if (this.panel.classList.contains("open")) this.close();
    else this.open();
  }
}
