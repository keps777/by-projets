import { creerClientMock } from "@afrimove/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, sourcesRoutes } from "@/app";
import { construireRoutes } from "@/coquille/arbre-routes";
import { CanalMemoire } from "@/kiosque/canal";
import { memoriserEnrolement } from "./stockage";

const ENROLEMENT = {
  appareilId: "appareil-dla-g1-ab12cd34",
  secret: "apd_secret-de-l-appareil",
  compagnieId: "c-1",
  gareId: "g-1",
  libelle: "Guichet 1",
  agence: "DEM",
  gare: "DLA",
  genre: "guichet" as const,
  rang: 1,
  plage: { debut: 1, fin: 999 },
};

function monter(http: boolean, canal: CanalMemoire) {
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes), {
    initialEntries: ["/bienvenue"],
  });
  render(
    <App
      http={http}
      canalKiosque={canal}
      routeur={routeur}
      clientApi={creerClientMock({ latenceMs: 0 })}
      parametres={{
        demo: false,
        conception: false,
        horloge: null,
        scenario: null,
        modulesMasques: [],
      }}
      session={null}
    />,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("App et effacement à distance", () => {
  it("remplace toute l'application par l'écran de verrouillage quand le serveur ordonne l'effacement", async () => {
    memoriserEnrolement(ENROLEMENT);
    const canal = new CanalMemoire();
    canal.emettre({
      id: "cmd-1",
      type: "effacer",
      emiseA: "2026-10-20T08:00:00Z",
      secretAcquittement: "secret-d-acquittement",
    });
    monter(true, canal);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Appareil effacé" }),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(canal.acquittements).toHaveLength(1));
    expect(localStorage.getItem("afrimove.appareil.enrole")).toBeNull();
  });

  it("ne surveille rien en démonstration, même avec un téléphone enrôlé", async () => {
    memoriserEnrolement(ENROLEMENT);
    const canal = new CanalMemoire();
    monter(false, canal);
    await screen.findByRole("heading", { level: 1 });
    expect(canal.consultations).toBe(0);
  });
});
