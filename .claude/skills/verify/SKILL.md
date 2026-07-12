---
name: verify
description: Build, launch and drive ImG (browser god game) to verify changes end-to-end.
---

# Vérifier ImG

Jeu navigateur (Vite + TypeScript, Canvas 2D). La surface est la page web.

## Build & lancement

```bash
npm ci                                   # si node_modules absent
npm run build                            # typecheck strict + bundle dist/
npx vite preview --port 4173 --strictPort &   # sert dist/ sur http://localhost:4173
```

`?seed=<n>` dans l'URL régénère un monde donné (défaut 1337, déterministe).

## Piloter sous Chromium headless

Chromium préinstallé : `executablePath: "/opt/pw-browsers/chromium"` avec
`playwright-core` (à installer hors du repo, ex. dans le scratchpad — ne pas
l'ajouter aux devDependencies du jeu).

Flux qui couvrent le MVP :
- **Rendu** : goto, attendre ~1.5 s, screenshot — continents/biomes visibles, HUD `#hud` affiche `Foi : N / M`.
- **Terraforming** : `mouse.down()` + petits `mouse.move` ~100 ms d'intervalle (l'UI throttle à 1 intent/90 ms) → relief surélevé ; avec `Shift` → creuse (l'eau apparaît sous le niveau de la mer). La Foi du HUD doit baisser pendant la sculpture.
- **Caméra** : molette = zoom (`mouse.wheel(0, -400)`), drag bouton droit = pan.
- **Temps** : `Digit3` = ×16 (1 jour ≈ 1,5 s), la 2e ligne du HUD avance ; `Space` = pause, la ligne se fige et la sculpture ne s'applique plus (les ticks sont gelés — comportement attendu).
- **Jour/nuit** : comparer la luminosité entre ~01:00 (sombre) et ~12:00 (claire).

## Pièges connus

- Les tests unitaires ne couvrent QUE `core`/`sim` — le rendu ne se vérifie qu'en pilotant le navigateur.
- `page.on("console")` + `pageerror` : la page doit rester sans erreur console.
- La sim est déterministe mais la Foi régénère (4/tick) : comparer des valeurs de Foi exactes nécessite la pause.
