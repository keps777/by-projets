import { describe, expect, it } from "vitest";
import politique from "./android-enterprise/politique-guichet.json";
import { detecterModeKiosque } from "./mode";

/**
 * La politique Android Enterprise ne peut pas être appliquée à un appareil dans les tests : ces vérifications
 * gardent seulement la cohérence du fichier (ce qu'il doit imposer, et son accord avec le code de l'application).
 */
const chrome = politique.applications.find((a) => a.packageName === "com.android.chrome");

describe("politique Android Enterprise du guichet", () => {
  it("fait de Chrome l'application kiosque, verrouillée en tâche unique", () => {
    expect(chrome).toBeDefined();
    expect(chrome?.installType).toBe("KIOSK");
    expect(chrome?.lockTaskAllowed).toBe(true);
    expect(politique.kioskCustomLauncherEnabled).toBe(true);
  });

  it("coupe la navigation système, la barre d'état et les réglages", () => {
    expect(politique.kioskCustomization).toMatchObject({
      systemNavigation: "NAVIGATION_DISABLED",
      statusBar: "NOTIFICATIONS_AND_SYSTEM_INFO_DISABLED",
      deviceSettings: "SETTINGS_ACCESS_BLOCKED",
    });
  });

  it("empêche de contourner l'effacement à distance (réinitialisation, mode sans échec, débogage, USB)", () => {
    expect(politique.factoryResetDisabled).toBe(true);
    expect(politique.safeBootDisabled).toBe(true);
    expect(politique.debuggingFeaturesAllowed).toBe(false);
    expect(politique.usbFileTransferDisabled).toBe(true);
    expect(politique.addUserDisabled).toBe(true);
    expect(politique.advancedSecurityOverrides.untrustedAppsPolicy).toBe("DISALLOW_INSTALL");
  });

  it("limite Chrome à l'application et à son API : tout le reste est bloqué", () => {
    const config = chrome?.managedConfiguration;
    expect(config?.URLBlocklist).toEqual(["*"]);
    expect(config?.URLAllowlist).toHaveLength(2);
    expect(config?.IncognitoModeAvailability).toBe(1);
    expect(config?.DeveloperToolsAvailability).toBe(2);
    expect(config?.FullscreenAllowed).toBe(true);
  });

  it("ouvre une adresse autorisée, que l'application reconnaît comme un kiosque", () => {
    const config = chrome?.managedConfiguration;
    const accueil = new URL(config?.HomepageLocation ?? "");
    expect(config?.URLAllowlist).toContain(accueil.origin);
    expect(config?.RestoreOnStartupURLs).toEqual([config?.HomepageLocation]);
    expect(detecterModeKiosque({ location: { search: accueil.search } }).actif).toBe(true);
  });
});
