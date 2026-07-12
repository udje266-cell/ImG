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

**Le rendu est 3D WebGL (Three.js)** : lancer Chromium avec
`args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"]`
sinon le contexte WebGL échoue en headless. Attendre ~2,5 s après goto
(compilation shaders + build du maillage).

Flux qui couvrent le MVP :
- **Rendu** : screenshot — continents low poly en terrasses, eau translucide, HUD `#hud` affiche `Foi : N / M`.
- **Terraforming** : `mouse.down()` + petits `mouse.move` ~105 ms d'intervalle (l'UI throttle à 1 intent/90 ms) → dôme en terrasses ; cliquer `#tool-lower` (chemin mobile) puis maintenir → creuse. La Foi du HUD doit baisser pendant la sculpture.
- **Caméra** : molette = zoom, `KeyQ`/`KeyE` = rotation (l'angle de vue change), drag droit = pan.
- **Temps** : `Digit3` = ×16 (1 jour ≈ 1,5 s), la 2e ligne du HUD avance ; `Space` = pause, la ligne se fige et la sculpture ne s'applique plus (ticks gelés — attendu).
- **Jour/nuit** : le soleil/ciel suivent l'heure — comparer midi (clair) et ~19:00 (crépuscule orangé sombre).

## Pièges connus

- Les tests unitaires ne couvrent QUE `core`/`sim` — le rendu ne se vérifie qu'en pilotant le navigateur.
- `page.on("console")` + `pageerror` : la page doit rester sans erreur console.
- La sim est déterministe mais la Foi régénère (4/tick) : comparer des valeurs de Foi exactes nécessite la pause.
