import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuration Capacitor (cahier des charges §11 — Android d'abord).
 * Le jeu est une web-app Three.js : Capacitor l'embarque dans une WebView
 * native. `webDir` pointe sur le build Vite (`npm run build` avant `cap sync`).
 */
const config: CapacitorConfig = {
  appId: "com.imggame.img",
  appName: "ImG",
  webDir: "dist",
  backgroundColor: "#0b0e14",
  android: {
    // WebGL exige l'accélération matérielle (activée par défaut, explicite ici).
    useLegacyBridge: false,
  },
};

export default config;
