# Packaging Android (Capacitor)

Le jeu est une web-app Three.js embarquée dans une WebView native via
**Capacitor** (ADR 0002, cahier des charges §11 — Android d'abord).
Le projet natif vit dans `android/` (versionné) ; les assets web y sont
copiés depuis `dist/` par `cap sync` (non versionnés, régénérés à chaque build).

- **appId** : `com.imggame.img` · **appName** : `ImG` (voir `capacitor.config.ts`)
- iOS suivra le même chemin (`npx cap add ios`) une fois la version Android stabilisée.

## Prérequis (une seule fois, sur ta machine)

1. **JDK 17+** (celui d'Android Studio convient).
2. **Android Studio** (recommandé) — installe le SDK automatiquement,
   ou juste le **SDK en ligne de commande** avec `ANDROID_HOME` pointé dessus.

> ⚠️ L'APK ne peut pas être compilé dans l'environnement de développement
> distant (politique réseau : `dl.google.com` — SDK/plugins Android — bloqué).
> Deux options : **GitHub Actions** (zéro installation, recommandé) ou en local.

## Option zéro installation : GitHub Actions (recommandé)

Le dépôt embarque `.github/workflows/android.yml` : GitHub compile l'APK dans
son cloud (SDK Android préinstallé, tests inclus).

1. Sur GitHub → onglet **Actions** → workflow **« Android APK »** → **Run workflow**
   (il se lance aussi automatiquement à chaque push sur `main`).
2. À la fin du run (~5 min), ouvre le run → section **Artifacts** →
   télécharge **`ImG-debug-apk`** → dézippe → `app-debug.apk`.
3. Copie l'APK sur le téléphone et installe-le (autoriser les sources inconnues).

## Produire l'APK (debug, installable immédiatement)

```bash
npm install          # une fois
npm run android:apk  # build web + sync + gradle assembleDebug
```

L'APK sort dans `android/app/build/outputs/apk/debug/app-debug.apk`.
Copie-le sur le téléphone (ou `adb install -r <apk>`) et lance **ImG**.

## Alternative : Android Studio

```bash
npm run android:sync   # build web + copie dans android/
npm run android:open   # ouvre le projet dans Android Studio
```

Puis **Run ▶** sur un appareil branché (USB, débogage activé) ou un émulateur.

## Cycle de développement

À chaque modification du jeu web :

```bash
npm run android:sync   # reconstruit dist/ et resynchronise android/
```

(Gradle/Android Studio reprennent le nouveau contenu au prochain run.)

## Version release (Play Store) — plus tard

`cd android && ./gradlew bundleRelease` produit un `.aab`, à signer avec une
clé de release (keystore à générer et garder secrète). À documenter au moment
de la publication (icônes adaptatives, splash, versionCode, signature).

## Notes techniques

- WebGL est accéléré matériellement dans la WebView Android (Chrome ≥ 90) —
  le rendu sera **bien plus net que les captures SwiftShader** de développement.
- `backgroundColor: #0b0e14` évite le flash blanc au lancement.
- Les contrôles tactiles (1 doigt = sculpter, 2 doigts = caméra/zoom) sont
  déjà en place (`InputController`, cahier des charges §11).
