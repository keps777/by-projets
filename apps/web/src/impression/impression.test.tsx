import {
  ErreurTransport,
  ServiceImpression,
  StockageMemoire,
  TransportFactice,
  genererBillet,
  type DonneesBillet,
  type Transport,
} from "@afrimove/impression";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  FournisseurImpression,
  IndicateurImprimante,
  creerServiceApplication,
  useFileImpression,
  useImprimeur,
} from "./index";

const billet: DonneesBillet = {
  compagnie: "ALPHA VOYAGES",
  trajet: "DLA → YDE",
  depart: "05:30 · 05.01.27",
  siege: "19",
  classe: "CLASSIQUE",
  nom: null,
  piece: null,
  qr: "AM1:ALP-DLA-270105-0232:9047",
  code: "9047",
  numero: "ALP-DLA-270105-0232",
  pied: "Au quai 20 min avant · afrimove.cm",
};

function monter(transport: Transport, enfants = <IndicateurImprimante />) {
  const service = new ServiceImpression({ transport, stockage: new StockageMemoire() });
  render(<FournisseurImpression service={service}>{enfants}</FournisseurImpression>);
  return service;
}

/** Écran de démonstration : imprime un billet et liste ce qui attend. */
function Guichet() {
  const { imprimerBillet } = useImprimeur();
  const { enAttente, imprimes, reimprimer } = useFileImpression();
  return (
    <div>
      <button type="button" onClick={() => void imprimerBillet(billet)}>
        Imprimer
      </button>
      <button
        type="button"
        onClick={() => void reimprimer(imprimes.at(-1)?.id ?? "")}
        disabled={imprimes.length === 0}
      >
        Copie
      </button>
      <p data-testid="compte">{`${enAttente.length} / ${imprimes.length}`}</p>
    </div>
  );
}

describe("IndicateurImprimante", () => {
  it("dit « imprimante OK » quand l'imprimante est prête", async () => {
    monter(new TransportFactice());
    expect(await screen.findByRole("status")).toHaveTextContent("imprimante OK");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explique que Safari iOS ne sait pas imprimer en Bluetooth, sans touche inutile", () => {
    monter(new TransportFactice({ disponible: false }));
    expect(screen.getByRole("status")).toHaveTextContent("impression indisponible");
    expect(screen.getByText(/Chrome sur Android/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("propose d'appairer, puis passe à « imprimante OK »", async () => {
    monter(new TransportFactice({ appairee: false }));
    expect(screen.getByRole("status")).toHaveTextContent("aucune imprimante");
    await userEvent.click(screen.getByRole("button", { name: "Appairer l'imprimante" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("imprimante OK"));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ne dit rien quand l'agent ferme le sélecteur Bluetooth", async () => {
    const transport = new TransportFactice({ appairee: false });
    transport.appairer = async () => {
      throw new ErreurTransport("annule", "Appairage annulé");
    };
    monter(transport);
    await userEvent.click(screen.getByRole("button", { name: "Appairer l'imprimante" }));
    expect(screen.queryByText("Appairage annulé")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("aucune imprimante");
  });

  it("affiche l'échec d'appairage", async () => {
    const transport = new TransportFactice({ appairee: false });
    transport.appairer = async () => {
      throw new ErreurTransport("protocole", "Aucune caractéristique d'écriture sur cet appareil");
    };
    monter(transport);
    await userEvent.click(screen.getByRole("button", { name: "Appairer l'imprimante" }));
    expect(
      await screen.findByText("Aucune caractéristique d'écriture sur cet appareil"),
    ).toBeInTheDocument();
  });

  it("montre ce qui attend quand l'imprimante est absente, puis se vide à son retour", async () => {
    const transport = new TransportFactice({ branchee: false });
    monter(
      transport,
      <>
        <IndicateurImprimante />
        <Guichet />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "imprimante absente · 1 en attente · relance automatique",
      ),
    );
    expect(screen.getByTestId("compte")).toHaveTextContent("1 / 0");

    act(() => transport.brancher());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("imprimante OK"));
    await waitFor(() => expect(screen.getByTestId("compte")).toHaveTextContent("0 / 1"));
    expect(transport.envoyes).toEqual([genererBillet(billet)]);
  });

  it("propose de relancer quand l'imprimante est en erreur avec des documents en attente", async () => {
    const enErreur = { etat: "erreur", imprimante: null, erreur: "GATT operation failed" } as const;
    class TransportEnErreur extends TransportFactice {
      tentatives = 0;
      override instantane() {
        return enErreur;
      }
      override async envoyer(): Promise<void> {
        this.tentatives += 1;
        throw new ErreurTransport("ecriture", "GATT operation failed");
      }
    }
    const transport = new TransportEnErreur();
    monter(
      transport,
      <>
        <IndicateurImprimante />
        <Guichet />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("imprimante en erreur");
    expect(screen.getByText("GATT operation failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Relancer l'impression" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    const relancer = await screen.findByRole("button", { name: "Relancer l'impression" });
    expect(screen.getByRole("status")).toHaveTextContent("1 en attente");
    await userEvent.click(relancer);
    expect(screen.getByTestId("compte")).toHaveTextContent("1 / 0");
  });
});

describe("hooks d'impression", () => {
  it("imprime un billet puis en réimprime une copie", async () => {
    const transport = new TransportFactice();
    monter(transport, <Guichet />);
    await userEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    await waitFor(() => expect(screen.getByTestId("compte")).toHaveTextContent("0 / 1"));
    await userEvent.click(screen.getByRole("button", { name: "Copie" }));
    await waitFor(() => expect(transport.envoyes).toHaveLength(2));
    expect(transport.envoyes[1]).toEqual(transport.envoyes[0]);
  });
});

describe("creerServiceApplication", () => {
  it("branche l'imprimante simulée avec ?imprimante=factice", () => {
    const service = creerServiceApplication({
      recherche: "?imprimante=factice",
      stockage: new StockageMemoire(),
    });
    expect(service.instantane()).toMatchObject({ disponible: true, liaison: { etat: "ok" } });
  });

  it("annonce « indisponible » dans un navigateur sans Web Bluetooth (Safari iOS, jsdom)", () => {
    const service = creerServiceApplication({ recherche: "", stockage: new StockageMemoire() });
    expect(service.instantane()).toMatchObject({
      disponible: false,
      liaison: { etat: "indisponible" },
    });
  });
});
