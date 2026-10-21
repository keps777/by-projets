import { readdirSync, readFileSync, existsSync } from "node:fs";
import { couleurs } from "@afrimove/design";
import { describe, expect, it } from "vitest";
import config from "../../capacitor.config";
import { SCHEMA_APPLICATION } from "./liens";

/**
 * Cohérence de l'emballage Capacitor (AM-184). Ces contrôles tiennent lieu de compilation native, impossible ici :
 * ils relisent les fichiers d'android/ et d'ios/ et vérifient ce qu'une erreur ferait refuser par les boutiques
 * (identifiant qui diverge, icône iOS avec transparence, clé de signature dans le dépôt, build natif pas synchronisé).
 */

// Les tests de ce paquet tournent depuis apps/web (comme src/coquille/onglets.test.tsx).
const RACINE = `${process.cwd()}/`;
const lire = (chemin: string) => readFileSync(`${RACINE}${chemin}`, "utf8");
const json = <T>(chemin: string) => JSON.parse(lire(chemin)) as T;

const ANDROID = "android/app/src/main";
const IOS = "ios/App/App";

/** En-tête d'un PNG : dimensions, profondeur et type de couleur (2 = RVB, 6 = RVBA, 3 = palette). */
function enteteDePng(chemin: string) {
  const octets = readFileSync(`${RACINE}${chemin}`);
  expect(octets.subarray(0, 8).toString("hex"), `${chemin} : signature PNG`).toBe(
    "89504e470d0a1a0a",
  );
  return {
    largeur: octets.readUInt32BE(16),
    hauteur: octets.readUInt32BE(20),
    typeCouleur: octets[25],
  };
}

describe("identité de l'application", () => {
  const appId = config.appId ?? "";

  it("le même identifiant partout : Capacitor, Gradle, Android, Xcode et schéma de lien", () => {
    expect(appId).toBe("com.afrimove.app");
    expect(SCHEMA_APPLICATION).toBe(appId);

    const gradle = lire("android/app/build.gradle");
    expect(gradle).toContain(`namespace = "${appId}"`);
    expect(gradle).toContain(`applicationId "${appId}"`);
    expect(lire(`${ANDROID}/res/values/strings.xml`)).toContain(
      `<string name="custom_url_scheme">${appId}</string>`,
    );
    expect(
      existsSync(`${RACINE}${ANDROID}/java/${appId.replaceAll(".", "/")}/MainActivity.java`),
    ).toBe(true);

    const projetXcode = lire("ios/App/App.xcodeproj/project.pbxproj");
    const identifiants = [...projetXcode.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(
      (m) => m[1],
    );
    expect(identifiants.length).toBeGreaterThan(0);
    expect(new Set(identifiants)).toEqual(new Set([appId]));
    expect(lire(`${IOS}/Info.plist`)).toContain(`<string>${appId}</string>`);
  });

  it("le nom affiché est AfriMove sur Android et sur iOS", () => {
    expect(config.appName).toBe("AfriMove");
    expect(lire(`${ANDROID}/res/values/strings.xml`)).toContain(
      '<string name="app_name">AfriMove</string>',
    );
    expect(lire(`${IOS}/Info.plist`)).toMatch(
      /<key>CFBundleDisplayName<\/key>\s*<string>AfriMove<\/string>/,
    );
  });
});

describe("un seul build web", () => {
  it("Capacitor embarque dist/, la sortie de `vite build`, sans variante native", () => {
    expect(config.webDir).toBe("dist");
    expect(lire("vite.config.ts")).not.toMatch(/outDir|build\s*:/);
    // Aucun serveur distant : l'application emballée charge ses fichiers locaux, pas un site.
    expect(config.server?.url).toBeUndefined();
    expect(config.server?.cleartext).toBe(false);
    expect(config.android?.allowMixedContent).toBe(false);
  });

  it("les scripts de publication construisent le web puis synchronisent, sans second build", () => {
    const { scripts } = json<{ scripts: Record<string, string> }>("package.json");
    expect(scripts["cap:sync"]).toBe("vite build && cap sync");
    for (const nom of ["cap:android", "cap:android:debug", "cap:ios"]) {
      expect(scripts[nom], nom).toMatch(/vite build && cap sync (android|ios)/);
    }
    // Les builds de boutique sont en production (mode démo coupé) sauf demande contraire.
    expect(scripts["cap:android"]).toContain("VITE_APP_ENV=${VITE_APP_ENV:-production}");
    expect(scripts["cap:ios"]).toContain("VITE_APP_ENV=${VITE_APP_ENV:-production}");
    expect(scripts["cap:android"]).toContain("./gradlew bundleRelease");
  });
});

describe("couleurs (jetons de design v3)", () => {
  it("fond Nuit identique dans la config, les thèmes natifs et la PWA", () => {
    expect(config.backgroundColor).toBe(couleurs.nuit);
    expect(config.ios?.backgroundColor).toBe(couleurs.nuit);
    expect(config.plugins?.SplashScreen?.backgroundColor).toBe(couleurs.nuit);
    expect(lire(`${ANDROID}/res/values/colors.xml`)).toContain(
      `<color name="nuit">${couleurs.nuit}</color>`,
    );
    expect(lire(`${ANDROID}/res/values/colors.xml`)).toContain(
      `<color name="ambre">${couleurs.ambre}</color>`,
    );
    expect(lire(`${ANDROID}/res/values/ic_launcher_background.xml`)).toContain(couleurs.surface);
    expect(json<{ background_color: string }>("public/manifest.webmanifest").background_color).toBe(
      couleurs.nuit,
    );
  });
});

describe("Android", () => {
  const manifeste = lire(`${ANDROID}/AndroidManifest.xml`);

  it("n'accepte ni trafic en clair ni sauvegarde automatique, et n'expose qu'une activité", () => {
    expect(manifeste).toContain('android:usesCleartextTraffic="false"');
    expect(manifeste).toContain('android:allowBackup="false"');
    expect(manifeste.match(/android:exported="true"/g)).toHaveLength(1);
  });

  it("déclare Internet et les notifications, et seulement cela (pas de Bluetooth sans greffon)", () => {
    const permissions = [...manifeste.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(permissions.sort()).toEqual([
      "android.permission.INTERNET",
      "android.permission.POST_NOTIFICATIONS",
    ]);
  });

  it("ouvre l'application depuis un lien https (hôte réglable) et depuis le schéma propre", () => {
    expect(manifeste).toMatch(
      /<intent-filter android:autoVerify="true">[\s\S]*?android:scheme="https" android:host="\$\{hoteLiens\}"[\s\S]*?<\/intent-filter>/,
    );
    expect(manifeste).toContain('android:scheme="@string/custom_url_scheme"');
    expect(manifeste.match(/android.intent.category.BROWSABLE/g)).toHaveLength(2);
    expect(lire("android/app/build.gradle")).toContain("manifestPlaceholders = [hoteLiens:");
  });

  it("signe l'AAB depuis l'environnement et n'a aucun secret dans le dépôt", () => {
    const gradle = lire("android/app/build.gradle");
    for (const variable of [
      "ANDROID_KEYSTORE_PATH",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
    ]) {
      expect(gradle).toContain(`System.getenv("${variable}")`);
    }
    // Aucun mot de passe écrit en clair.
    expect(gradle).not.toMatch(/(storePassword|keyPassword)\s+["'][^"']/);
    // Un AAB de publication non signé est refusé tant qu'on ne le demande pas explicitement.
    expect(gradle).toContain("afrimove.sansSignature");
    const ignores = lire("android/.gitignore");
    expect(ignores).toContain("*.jks");
    expect(ignores).toContain("*.keystore");
    const suivis = readdirSync(`${RACINE}android`, { recursive: true }).map(String);
    expect(suivis.filter((f) => /\.(jks|keystore)$/.test(f))).toEqual([]);
  });

  it("le code de version vient de la CI (strictement croissant pour le Play Store)", () => {
    const gradle = lire("android/app/build.gradle");
    expect(gradle).toContain('System.getenv("ANDROID_VERSION_CODE")');
    expect(gradle).toContain('System.getenv("ANDROID_VERSION_NAME")');
  });

  it("le thème de lancement utilise le fond Nuit et passe la main au thème de l'application", () => {
    const styles = lire(`${ANDROID}/res/values/styles.xml`);
    expect(styles).toContain('<item name="windowSplashScreenBackground">@color/nuit</item>');
    expect(styles).toContain(
      '<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
    );
    expect(styles).toContain('<item name="android:windowBackground">@color/nuit</item>');
  });

  it("icônes : une par densité, aux bonnes dimensions ; icône adaptative complète", () => {
    const tailles: Record<string, number> = {
      mdpi: 48,
      hdpi: 72,
      xhdpi: 96,
      xxhdpi: 144,
      xxxhdpi: 192,
    };
    for (const [densite, taille] of Object.entries(tailles)) {
      for (const nom of ["ic_launcher", "ic_launcher_round"]) {
        const png = enteteDePng(`${ANDROID}/res/mipmap-${densite}/${nom}.png`);
        expect([png.largeur, png.hauteur], `${densite}/${nom}`).toEqual([taille, taille]);
      }
      // Calques de l'icône adaptative (@capacitor/assets les pose dans un cadre de 108 dp, marge de 16,7 %).
      for (const nom of ["ic_launcher_foreground", "ic_launcher_background"]) {
        const png = enteteDePng(`${ANDROID}/res/mipmap-${densite}/${nom}.png`);
        expect(png.largeur, `${densite}/${nom}`).toBe(png.hauteur);
        expect(png.largeur, `${densite}/${nom}`).toBeGreaterThanOrEqual(taille);
      }
    }
    const adaptative = lire(`${ANDROID}/res/mipmap-anydpi-v26/ic_launcher.xml`);
    expect(adaptative).toContain("@mipmap/ic_launcher_background");
    expect(adaptative).toContain("@mipmap/ic_launcher_foreground");
  });

  it("écran de lancement : image portrait et paysage par densité", () => {
    for (const orientation of ["port", "land"]) {
      for (const densite of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
        const png = enteteDePng(`${ANDROID}/res/drawable-${orientation}-${densite}/splash.png`);
        expect(png.largeur).toBeGreaterThan(0);
        expect(png.typeCouleur).not.toBe(6);
      }
    }
    enteteDePng(`${ANDROID}/res/drawable/splash.png`);
  });
});

describe("iOS", () => {
  it("icône 1024 x 1024 sans transparence (l'App Store refuse un canal alpha)", () => {
    const dossier = `${IOS}/Assets.xcassets/AppIcon.appiconset`;
    const contenu = json<{ images: { filename: string; size: string }[] }>(
      `${dossier}/Contents.json`,
    );
    expect(contenu.images).toHaveLength(1);
    const png = enteteDePng(`${dossier}/${contenu.images[0]?.filename}`);
    expect([png.largeur, png.hauteur]).toEqual([1024, 1024]);
    expect(png.typeCouleur).toBe(2);
  });

  it("écran de lancement : fichiers présents et déclarés, aucun reste du modèle Capacitor", () => {
    const dossier = `${IOS}/Assets.xcassets/Splash.imageset`;
    const contenu = json<{ images: { filename: string }[] }>(`${dossier}/Contents.json`);
    const fichiers = readdirSync(`${RACINE}${dossier}`).filter((f) => f.endsWith(".png"));
    expect(contenu.images.map((i) => i.filename).sort()).toEqual(fichiers.sort());
    for (const fichier of fichiers) {
      const png = enteteDePng(`${dossier}/${fichier}`);
      expect([png.largeur, png.hauteur]).toEqual([2732, 2732]);
    }
    expect(lire(`${IOS}/Base.lproj/LaunchScreen.storyboard`)).toContain('image="Splash"');
  });

  it("Info.plist : application sombre en portrait, chiffrement exempté, lien à schéma propre", () => {
    const plist = lire(`${IOS}/Info.plist`);
    expect(plist).toMatch(/<key>UIUserInterfaceStyle<\/key>\s*<string>Dark<\/string>/);
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    expect(plist).toMatch(
      /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>com\.afrimove\.app<\/string>/,
    );
    const iphone = plist.match(
      /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/,
    );
    expect(iphone?.[1]?.match(/<string>/g)).toHaveLength(1);
    expect(iphone?.[1]).toContain("UIInterfaceOrientationPortrait");
  });
});

describe("greffons natifs", () => {
  const { dependencies } = json<{ dependencies: Record<string, string> }>("package.json");
  const greffons = Object.keys(dependencies)
    .filter((nom) => nom.startsWith("@capacitor/") && nom !== "@capacitor/core")
    .map((nom) => nom.replace("@capacitor/", ""))
    .sort();

  it("seuls l'écran de lancement, les liens/retour et les notifications push sont embarqués", () => {
    expect(greffons).toEqual(["app", "push-notifications", "splash-screen"]);
  });

  it("android/ et ios/ ont été synchronisés avec package.json (cap sync)", () => {
    const gradle = lire("android/app/capacitor.build.gradle");
    const androidGreffons = [...gradle.matchAll(/project\(':capacitor-([a-z-]+)'\)/g)]
      .map((m) => m[1])
      .sort();
    expect(androidGreffons).toEqual(greffons);

    const swift = lire("ios/App/CapApp-SPM/Package.swift");
    const iosGreffons = [...swift.matchAll(/\.product\(name: "Capacitor([A-Za-z]+)", package/g)]
      .map((m) => m[1]?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase())
      .sort();
    expect(iosGreffons).toEqual(greffons);

    // Les chemins de Package.swift (écrits par `cap sync`) visent le magasin de pnpm, versions comprises : après
    // une mise à jour d'un greffon, relancer `pnpm --filter @afrimove/web run cap:sync`.
    const chemins = [...swift.matchAll(/\.package\(name: "[^"]+", path: "([^"]+)"\)/g)].map(
      (m) => m[1] ?? "",
    );
    expect(chemins).toHaveLength(greffons.length);
    for (const chemin of chemins) {
      expect(
        existsSync(`${RACINE}ios/App/CapApp-SPM/${chemin}/Package.swift`),
        `${chemin} introuvable : relancer cap sync`,
      ).toBe(true);
    }
  });

  it("chaque greffon configuré est bien installé", () => {
    const configures = Object.keys(config.plugins ?? {});
    expect(configures).toContain("SplashScreen");
    expect(configures).toContain("PushNotifications");
    expect(greffons).toContain("splash-screen");
    expect(greffons).toContain("push-notifications");
  });

  it("l'écran de lancement ne reste pas collé : masqué par le code, filet de 3 s au plus", () => {
    expect(config.plugins?.SplashScreen?.launchAutoHide).toBe(true);
    expect(config.plugins?.SplashScreen?.launchShowDuration).toBeLessThanOrEqual(3000);
  });
});
