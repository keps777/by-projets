import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanalMemoire, type CommandeAppareil } from "@/kiosque/canal";
import type { EnvEffacement } from "@/kiosque/effacement";
import { CLE_APPAREIL_ID, ecrireRepere } from "@/kiosque/etat";
import { KiosqueHttp, appareilASurveiller } from "./kiosque-http";
import { memoriserEnrolement } from "./stockage";

const ORDRE: CommandeAppareil = {
  id: "cmd-1",
  type: "effacer",
  emiseA: "2026-10-20T08:00:00Z",
  secretAcquittement: "secret-d-acquittement",
};

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

const env = (): EnvEffacement => ({ localStorage: globalThis.localStorage });

function Application() {
  return <h1>Caisse du guichet</h1>;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("KiosqueHttp", () => {
  it("laisse l'application telle quelle en démonstration (mode mock)", () => {
    memoriserEnrolement(ENROLEMENT);
    const canal = new CanalMemoire();
    render(
      <KiosqueHttp actif={false} urlBase="/api" canal={canal}>
        <Application />
      </KiosqueHttp>,
    );
    expect(screen.getByRole("heading", { name: "Caisse du guichet" })).toBeInTheDocument();
    expect(canal.consultations).toBe(0);
  });

  it("n'a rien à surveiller tant que le téléphone n'est pas enrôlé", () => {
    const canal = new CanalMemoire();
    render(
      <KiosqueHttp actif urlBase="/api" canal={canal}>
        <Application />
      </KiosqueHttp>,
    );
    expect(screen.getByRole("heading", { name: "Caisse du guichet" })).toBeInTheDocument();
    expect(canal.consultations).toBe(0);
  });

  it("surveille les ordres d'un téléphone enrôlé et le verrouille à l'ordre d'effacement", async () => {
    memoriserEnrolement(ENROLEMENT);
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    render(
      <KiosqueHttp actif urlBase="/api" canal={canal} reglages={{ kiosque: false, env: env() }}>
        <Application />
      </KiosqueHttp>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Appareil effacé" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Caisse du guichet" })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(canal.acquittements).toHaveLength(1));
    // L'effacement a vidé le stockage (secret de l'appareil compris) mais gardé l'identifiant.
    expect(localStorage.getItem("afrimove.appareil.enrole")).toBeNull();
    expect(localStorage.getItem(CLE_APPAREIL_ID)).toBe(ENROLEMENT.appareilId);
    // L'écran de verrouillage ne retombe pas sur l'application une fois le stockage vide.
    expect(screen.getByRole("heading", { level: 1, name: "Appareil effacé" })).toBeInTheDocument();
  });

  it("verrouille dès le démarrage un téléphone effacé, même sans enrôlement ni secret", () => {
    localStorage.setItem(CLE_APPAREIL_ID, ENROLEMENT.appareilId);
    ecrireRepere({ phase: "efface", commande: ORDRE, acquitte: true });
    expect(appareilASurveiller()).toBe(ENROLEMENT.appareilId);
    render(
      <KiosqueHttp actif urlBase="/api" canal={new CanalMemoire()} reglages={{ kiosque: false }}>
        <Application />
      </KiosqueHttp>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Appareil effacé" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Caisse du guichet" })).not.toBeInTheDocument();
  });

  it("se met à surveiller le téléphone dès qu'il vient d'être enrôlé", async () => {
    const canal = new CanalMemoire();
    render(
      <KiosqueHttp actif urlBase="/api" canal={canal} reglages={{ kiosque: false, env: env() }}>
        <Application />
      </KiosqueHttp>,
    );
    expect(canal.consultations).toBe(0);
    act(() => {
      memoriserEnrolement(ENROLEMENT);
    });
    await vi.waitFor(() => expect(canal.consultations).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: "Caisse du guichet" })).toBeInTheDocument();
  });

  it("interroge l'API avec le secret de l'appareil, puis accuse réception avec le secret de l'ordre", async () => {
    memoriserEnrolement(ENROLEMENT);
    const appels: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        appels.push({ url, init });
        if (url.endsWith("/commande")) {
          return new Response(JSON.stringify({ commande: ORDRE }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ enregistre: true }), { status: 200 });
      }),
    );
    render(
      <KiosqueHttp actif urlBase="http://api.test" reglages={{ kiosque: false, env: env() }}>
        <Application />
      </KiosqueHttp>,
    );
    await screen.findByRole("heading", { level: 1, name: "Appareil effacé" });
    await vi.waitFor(() => expect(appels.length).toBeGreaterThanOrEqual(2));
    expect(appels[0]?.url).toBe(`http://api.test/appareils/${ENROLEMENT.appareilId}/commande`);
    expect(appels[0]?.init.headers).toMatchObject({
      Authorization: `Bearer ${ENROLEMENT.secret}`,
    });
    const accuse = appels.find((a) => a.url.endsWith("/acquittement"));
    expect(accuse?.url).toBe(
      `http://api.test/appareils/${ENROLEMENT.appareilId}/commandes/${ORDRE.id}/acquittement`,
    );
    expect(accuse?.init.headers).toMatchObject({
      Authorization: `Bearer ${ORDRE.secretAcquittement}`,
    });
  });
});
