import { screen } from "@testing-library/react";
import { BadgeTouche } from "@afrimove/ui";
import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { horlogeFigee, creerHorloge, horlogeSysteme, useHorloge } from "./horloge";
import { lireParametresDemo, modeDemoActif, useScenario } from "./parametres";
import { CLES, lire } from "./stockage";
import { rendreApp } from "@/test/rendre";

describe("mode démo", () => {
  it("est actif en dev, coupé en production, forçable par VITE_MODE_DEMO", () => {
    expect(modeDemoActif({})).toBe(true);
    expect(modeDemoActif({ VITE_APP_ENV: "dev" })).toBe(true);
    expect(modeDemoActif({ VITE_APP_ENV: "production" })).toBe(false);
    expect(modeDemoActif({ VITE_APP_ENV: "production", VITE_MODE_DEMO: "1" })).toBe(true);
    expect(modeDemoActif({ VITE_APP_ENV: "dev", VITE_MODE_DEMO: "0" })).toBe(false);
  });
});

describe("flag conception (?conception=1)", () => {
  it("s'active par l'URL et se mémorise pour la suite", () => {
    const parametres = lireParametresDemo("?conception=1", true);
    expect(parametres.conception).toBe(true);
    expect(lire(CLES.conception)).toBe("1");
    expect(lireParametresDemo("", true).conception).toBe(true);
  });

  it("s'éteint avec ?conception=0", () => {
    lireParametresDemo("?conception=1", true);
    expect(lireParametresDemo("?conception=0", true).conception).toBe(false);
    expect(lire(CLES.conception)).toBeNull();
    expect(lireParametresDemo("", true).conception).toBe(false);
  });

  it("est ignoré hors mode démo : un voyageur ne voit jamais « TOUCHE n »", () => {
    const parametres = lireParametresDemo(
      "?conception=1&horloge=2027-01-05T07:38:00%2B01:00",
      false,
    );
    expect(parametres).toMatchObject({ conception: false, horloge: null, scenario: null });
    expect(lire(CLES.conception)).toBeNull();
  });

  it("affiche le badge TOUCHE quand il est actif, et pas sinon", () => {
    const routes: RouteObject[] = [{ path: "/", element: <BadgeTouche n={2} sur={3} /> }];
    rendreApp({ routes, conception: true });
    expect(screen.getByText("TOUCHE 2 / 3")).toBeInTheDocument();
  });

  it("ne l'affiche pas par défaut", () => {
    const routes: RouteObject[] = [{ path: "/", element: <BadgeTouche n={2} /> }];
    rendreApp({ routes });
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
  });
});

describe("paramètres du banc : scénario, horloge, modules masqués", () => {
  it("lit scenario, horloge et modules-masques", () => {
    expect(
      lireParametresDemo(
        "?scenario=Main&conception=1&horloge=2027-01-05T07:38:00%2B01:00&modules-masques=covoit, ussd",
        true,
      ),
    ).toEqual({
      demo: true,
      conception: true,
      horloge: "2027-01-05T07:38:00+01:00",
      scenario: "Main",
      modulesMasques: ["covoit", "ussd"],
    });
  });

  it("expose le scénario aux écrans", () => {
    function Scenario() {
      return <p>scénario : {useScenario() ?? "aucun"}</p>;
    }
    const routes: RouteObject[] = [{ path: "/", element: <Scenario /> }];
    rendreApp({ routes, scenario: "Main" });
    expect(screen.getByText("scénario : Main")).toBeInTheDocument();
  });
});

describe("horloge injectable", () => {
  it("fige l'instant avec une date ISO", () => {
    const horloge = creerHorloge("2027-01-05T07:38:00+01:00");
    expect(horloge.maintenant().toISOString()).toBe("2027-01-05T06:38:00.000Z");
    expect(horloge.maintenant().getTime()).toBe(horloge.maintenant().getTime());
  });

  it("retombe sur l'heure du système sans paramètre ou avec une valeur illisible", () => {
    expect(creerHorloge(null)).toBe(horlogeSysteme);
    expect(creerHorloge("pas une date")).toBe(horlogeSysteme);
    expect(Math.abs(horlogeSysteme.maintenant().getTime() - Date.now())).toBeLessThan(1000);
  });

  it("est celle que lisent les écrans (paramètre `horloge` de l'application)", () => {
    function Heure() {
      const maintenant = useHorloge().maintenant();
      return <p>{maintenant.toISOString()}</p>;
    }
    const routes: RouteObject[] = [{ path: "/", element: <Heure /> }];
    rendreApp({ routes, horloge: horlogeFigee("2027-01-05T07:38:00+01:00") });
    expect(screen.getByText("2027-01-05T06:38:00.000Z")).toBeInTheDocument();
  });
});
