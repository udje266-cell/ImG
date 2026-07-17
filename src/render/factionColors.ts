/**
 * Couleur emblématique de chaque faction (dieu), partagée par le rendu des
 * villages (bannières) et des habitants (gemme d'allégeance) — un même code
 * couleur : on reconnaît d'un coup d'œil à quel dieu appartient un village ET
 * chacun de ses habitants.
 *
 * La faction 0 — le JOUEUR — arbore l'or divin (comme la Foi) ; les dieux-IA
 * rivaux prennent des teintes franches et distinctes. Une âme non encore
 * ralliée (-1) reste d'un gris neutre.
 */
export const FACTION_COLORS = [0xf2c14e, 0xc0392b, 0x2a9d8f, 0x8e44ad, 0xe67e22, 0x2980b9];
/** Gris neutre d'une âme sans allégeance (faction -1). */
export const UNALIGNED_COLOR = 0x9aa0a8;

export function factionColor(faction: number): number {
  if (faction < 0) return UNALIGNED_COLOR;
  return FACTION_COLORS[faction % FACTION_COLORS.length]!;
}
