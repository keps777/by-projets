// @vitest-environment jsdom
import { plageGuichet, versIsoDouala } from "@afrimove/domain";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MoteurSync } from "../moteur";
import { reseauManuel } from "../reseau";
import type { ReseauManuel } from "../reseau";
import { creerVerificateurPin } from "../signature";
import {
  DEBUT_TEST,
  HEURE,
  HorlogeManuelle,
  MINUTE,
  ServeurFactice,
  VENTE,
  donneesVente,
  indexedDbFactice,
} from "../testing";
import { FournisseurSync } from "./contexte";
import {
  useBlocageAppareil,
  useConflits,
  useEnregistrerEvenement,
  useIndicateurSync,
  useSiegesHorsLigne,
} from "./hooks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let horloge: HorlogeManuelle;
let reseau: ReseauManuel;
let serveur: ServeurFactice;
let moteur: MoteurSync;

beforeEach(async () => {
  horloge = new HorlogeManuelle(DEBUT_TEST);
  reseau = reseauManuel(true);
  serveur = new ServeurFactice({ horloge });
  moteur = await MoteurSync.ouvrir({
    appareilId: "appareil-g2",
    auteurId: "pers-joseph",
    agence: "ALP",
    gare: "DLA",
    plage: plageGuichet(2),
    transport: serveur,
    horloge,
    reseau,
    dexie: indexedDbFactice(),
    synchroAutomatique: false,
  });
  await moteur.definirPartsHorsLigne({ d1: [11, 12, 13] });
});
afterEach(async () => {
  cleanup();
  await moteur.arreter();
});

function Pastille() {
  const i = useIndicateurSync();
  return (
    <p data-testid="pastille" data-tonalite={i.tonalite} title={i.description}>
      {i.libelle} {i.evenementsEnAttente}
    </p>
  );
}

describe("indicateur SYNC / HORS LIGNE", () => {
  it("passe de SYNC à HORS LIGNE et revient quand tout est parti", async () => {
    render(
      <FournisseurSync moteur={moteur}>
        <Pastille />
      </FournisseurSync>,
    );
    const pastille = () => screen.getByTestId("pastille");
    expect(pastille().textContent).toBe("SYNC 0");
    expect(pastille().dataset["tonalite"]).toBe("sync");

    await act(async () => {
      reseau.definir(false);
      await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 11));
    });
    await waitFor(() => expect(pastille().textContent).toBe("HORS LIGNE 1"));
    expect(pastille().dataset["tonalite"]).toBe("hors_ligne");
    expect(pastille().title).toContain("1 événement enregistré");

    await act(async () => {
      reseau.definir(true);
      await moteur.synchroniser();
    });
    await waitFor(() => expect(pastille().textContent).toBe("SYNC 0"));
    expect(pastille().title).toBe("Synchronisé");
  });

  it("annonce le blocage après 12 h", async () => {
    render(
      <FournisseurSync moteur={moteur}>
        <Pastille />
      </FournisseurSync>,
    );
    await act(async () => {
      reseau.definir(false);
      horloge.avancer(12 * HEURE + MINUTE);
      await moteur.etat();
    });
    await waitFor(() => expect(screen.getByTestId("pastille").dataset["tonalite"]).toBe("bloque"));
  });
});

describe("useEnregistrerEvenement", () => {
  it("donne le numéro à imprimer avant tout aller-retour réseau", async () => {
    function Vente() {
      const vente = useEnregistrerEvenement(VENTE);
      return (
        <div>
          <button onClick={() => vente.mutate(donneesVente("b1", "d1", 11))}>Vendre</button>
          <button onClick={() => vente.mutate(donneesVente("b2", "d1", 11))}>Revendre</button>
          <p data-testid="numero">{vente.data?.numero ?? "-"}</p>
          <p data-testid="erreur">{vente.error?.name ?? "-"}</p>
        </div>
      );
    }
    render(
      <FournisseurSync moteur={moteur}>
        <Vente />
      </FournisseurSync>,
    );
    await act(async () => {
      reseau.definir(false);
    });
    await act(async () => {
      screen.getByText("Vendre").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("numero").textContent).toBe("ALP-DLA-270105-1001"),
    );
    await act(async () => {
      screen.getByText("Revendre").click();
    });
    await waitFor(() => expect(screen.getByTestId("erreur").textContent).toBe("SiegeDejaVendu"));
    expect(serveur.appels).toBe(0);
  });
});

describe("useBlocageAppareil", () => {
  it("débloque par le PIN d'un superviseur", async () => {
    await moteur.provisionnerVerificateurs([
      await creerVerificateurPin("pers-essomba", "482915", { iterations: 1000 }),
    ]);
    function Ecran() {
      const b = useBlocageAppareil();
      return (
        <div>
          <p data-testid="etat">{b.bloque ? "bloqué" : "libre"}</p>
          <button onClick={() => void b.debloquer("pers-essomba", "482915")}>PIN</button>
        </div>
      );
    }
    render(
      <FournisseurSync moteur={moteur}>
        <Ecran />
      </FournisseurSync>,
    );
    await act(async () => {
      reseau.definir(false);
      horloge.avancer(13 * HEURE);
      await moteur.etat();
    });
    await waitFor(() => expect(screen.getByTestId("etat").textContent).toBe("bloqué"));
    await act(async () => {
      screen.getByText("PIN").click();
    });
    await waitFor(() => expect(screen.getByTestId("etat").textContent).toBe("libre"));
  });
});

describe("useConflits et useSiegesHorsLigne", () => {
  it("montre les billets à replacer et les sièges encore vendables", async () => {
    function Ecran() {
      const { conflits, nonVus, marquerVus } = useConflits();
      const sieges = useSiegesHorsLigne("d1");
      return (
        <div>
          <p data-testid="conflits">{conflits.map((x) => x.billetId).join(",") || "aucun"}</p>
          <p data-testid="nonvus">{nonVus}</p>
          <p data-testid="sieges">{sieges?.join(",") ?? "inconnue"}</p>
          <button onClick={() => void marquerVus()}>Vu</button>
        </div>
      );
    }
    render(
      <FournisseurSync moteur={moteur}>
        <Ecran />
      </FournisseurSync>,
    );
    await waitFor(() => expect(screen.getByTestId("sieges").textContent).toBe("11,12,13"));
    await act(async () => {
      reseau.definir(false);
      await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 12));
    });
    await waitFor(() => expect(screen.getByTestId("sieges").textContent).toBe("11,13"));

    serveur.conflits = [
      {
        evenementId: "e1",
        billetId: "b1",
        departId: "d1",
        siege: 12,
        gagnantBilletId: "g",
        detecteA: versIsoDouala(DEBUT_TEST),
        motif: "siege_deja_pris",
      },
    ];
    await act(async () => {
      reseau.definir(true);
      await moteur.synchroniser();
    });
    await waitFor(() => expect(screen.getByTestId("conflits").textContent).toBe("b1"));
    expect(screen.getByTestId("nonvus").textContent).toBe("1");
    await act(async () => {
      screen.getByText("Vu").click();
    });
    await waitFor(() => expect(screen.getByTestId("nonvus").textContent).toBe("0"));
  });
});
