import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Emballage natif (AM-184) de la MÊME application web : Capacitor embarque `dist/` (sortie de `vite build`) dans une
 * coquille Android (AAB pour le Play Store) et iOS (Xcode, App Store). Aucune réécriture, aucun second build web.
 *
 * Valeurs figées par la publication : `appId` ne peut plus changer après la première mise en ligne sur les deux
 * boutiques (voir docs/publication-boutiques.md).
 *
 * Origine de la page dans l'application emballée : `https://localhost` (Android) et `capacitor://localhost` (iOS).
 * L'API (`CORS_ORIGINS`) doit accepter ces deux origines.
 */

/** Couleur « Nuit » des jetons de design : fond de l'application, de l'écran de lancement et des barres système. */
const NUIT = "#0B1019";

const env = process.env;

const config: CapacitorConfig = {
  appId: "com.afrimove.app",
  appName: "AfriMove",
  webDir: "dist",
  backgroundColor: NUIT,
  // Journaux natifs coupés en production ; `CAP_DEBUG=1` les rouvre (et active l'inspection Chrome du WebView).
  loggingBehavior: env.CAP_DEBUG === "1" ? "debug" : "none",
  server: {
    // Schéma https : indispensable aux API qui exigent un contexte sécurisé (service worker, Web Crypto, stockage).
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: env.CAP_DEBUG === "1",
    // La signature de l'AAB est faite par Gradle (android/app/build.gradle, variables ANDROID_KEYSTORE_*), pas par
    // `cap build` : celui-ci signe en SHA-1, algorithme que les JDK récents refusent.
  },
  ios: {
    backgroundColor: NUIT,
    // L'application web n'utilise pas encore `env(safe-area-inset-*)` : le WebView respecte donc lui-même les zones
    // sûres (encoche, barre d'état, indicateur d'accueil) au lieu de passer sous elles.
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      // L'écran de lancement se masque dès que l'application s'affiche (src/natif) ; cette durée n'est qu'un filet.
      launchAutoHide: true,
      launchShowDuration: 3000,
      launchFadeOutDuration: 200,
      backgroundColor: NUIT,
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    SystemBars: {
      // Barres système claires sur fond Nuit. Les marges sont posées par MainActivity (android/), pas par le WebView :
      // l'interface web actuelle ne gère pas les zones sûres.
      insetsHandling: "disable",
      style: "DARK",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
