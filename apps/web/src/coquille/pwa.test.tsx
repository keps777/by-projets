import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "@/i18n/fr.json";
import { creerI18n } from "@/i18n";
import { BandeauMiseAJour } from "./bandeau-mise-a-jour";
import { effacerMiseAJour, signalerMiseAJourPrete } from "./mise-a-jour";
import { enregistrerServiceWorker } from "./pwa";

const faux = vi.hoisted(() => ({
  ecouteurs: new Map<string, () => void>(),
  register: vi.fn(() => Promise.resolve(undefined)),
  messageSkipWaiting: vi.fn(),
}));

vi.mock("workbox-window", () => ({
  Workbox: class {
    addEventListener(type: string, ecouteur: () => void) {
      faux.ecouteurs.set(type, ecouteur);
    }
    register = faux.register;
    messageSkipWaiting = faux.messageSkipWaiting;
  },
}));

const racineWeb = process.cwd();
const lireFichier = (chemin: string) => readFileSync(resolve(racineWeb, chemin), "utf8");

describe("manifeste PWA", () => {
  const manifeste = JSON.parse(lireFichier("public/manifest.webmanifest")) as {
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    scope: string;
    lang: string;
    background_color: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  };

  it("rend l'application installable : nom, mode autonome, adresse de départ, couleurs Nuit", () => {
    expect(manifeste.name).toBe("AfriMove");
    expect(manifeste.short_name).toBe("AfriMove");
    expect(manifeste.display).toBe("standalone");
    expect(manifeste.start_url).toBe("/");
    expect(manifeste.scope).toBe("/");
    expect(manifeste.lang).toBe("fr");
    expect(manifeste.background_color.toLowerCase()).toBe("#0b1019");
    expect(manifeste.theme_color.toLowerCase()).toBe("#0b1019");
  });

  it("a des icônes 192 et 512 px, dont une « maskable », et les fichiers existent", () => {
    const tailles = manifeste.icons.map((icone) => icone.sizes);
    expect(tailles).toContain("192x192");
    expect(tailles).toContain("512x512");
    expect(manifeste.icons.some((icone) => icone.purpose === "maskable")).toBe(true);
    for (const icone of manifeste.icons) {
      expect(
        existsSync(resolve(racineWeb, "public", icone.src.replace(/^\//, ""))),
        icone.src,
      ).toBe(true);
    }
  });

  it("est relié depuis index.html, avec la couleur de thème", () => {
    const html = lireFichier("index.html");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('<meta name="theme-color" content="#0B1019"');
    expect(html).toContain('<html lang="fr">');
  });
});

describe("service worker (src/sw.ts)", () => {
  const source = lireFichier("src/sw.ts");

  it("précharge la coquille, route les navigations vers index.html et met en cache polices et icônes", () => {
    expect(source).toContain("self.__WB_MANIFEST");
    expect(source).toContain("precacheAndRoute");
    expect(source).toContain('createHandlerBoundToURL("/index.html")');
    expect(source).toContain('request.destination === "font"');
    expect(source).toContain('request.destination === "image"');
  });

  it("attend le message SKIP_WAITING avant de prendre la main (bandeau « nouvelle version prête »)", () => {
    expect(source).toContain("SKIP_WAITING");
    expect(source).not.toMatch(/^\s*self\.skipWaiting\(\)/m);
  });

  it("précharge aussi les polices et les icônes (vite-plugin-pwa)", () => {
    const config = lireFichier("vite.config.ts");
    expect(config).toContain("woff2");
    expect(config).toContain("png");
    expect(config).toContain('registerType: "prompt"');
  });
});

function avecI18n(ui: React.ReactNode) {
  return <I18nextProvider i18n={creerI18n("fr")}>{ui}</I18nextProvider>;
}

describe("bandeau « nouvelle version prête »", () => {
  afterEach(() => act(() => effacerMiseAJour()));

  it("est caché tant qu'aucune version n'attend", () => {
    render(avecI18n(<BandeauMiseAJour />));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("apparaît quand une version attend et l'active d'un appui", async () => {
    const activer = vi.fn();
    render(avecI18n(<BandeauMiseAJour />));
    act(() => signalerMiseAJourPrete(activer));
    expect(await screen.findByRole("status")).toHaveTextContent(fr.coquille.miseAJour.message);
    await userEvent.click(screen.getByRole("button", { name: fr.coquille.miseAJour.action }));
    expect(activer).toHaveBeenCalledTimes(1);
  });
});

describe("enregistrement du service worker", () => {
  it("ne fait rien en développement ni sans support du navigateur", () => {
    expect(enregistrerServiceWorker({ actif: false })).toBeNull();
  });

  it("signale « nouvelle version prête » quand une version attend, puis l'active et recharge", async () => {
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    const recharger = vi.fn();
    expect(enregistrerServiceWorker({ actif: true, recharger })).not.toBeNull();
    expect(faux.register).toHaveBeenCalledTimes(1);

    render(avecI18n(<BandeauMiseAJour />));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => faux.ecouteurs.get("waiting")?.());
    expect(await screen.findByRole("status")).toHaveTextContent(fr.coquille.miseAJour.message);

    await userEvent.click(screen.getByRole("button", { name: fr.coquille.miseAJour.action }));
    expect(faux.messageSkipWaiting).toHaveBeenCalledTimes(1);
    expect(recharger).not.toHaveBeenCalled();
    faux.ecouteurs.get("controlling")?.();
    expect(recharger).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(navigator, "serviceWorker");
  });
});
