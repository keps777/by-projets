import type { EtatSync, MoteurSync } from "@afrimove/sync";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEtatPastille } from "@/ecrans/Guichet/etat-synchro";
import { FournisseurHorsLigne } from "./contexte";

/** Un moteur minimal : seul l'état et l'abonnement comptent pour la pastille et le rechargement des lectures. */
function moteurFactice(initial: Partial<EtatSync>) {
  let etat = { enLigne: true, evenementsEnAttente: 0, ...initial } as EtatSync;
  const abonnes = new Set<() => void>();
  const moteur = {
    instantane: () => etat,
    abonner: (rappel: () => void) => {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
  } as unknown as MoteurSync;
  return {
    moteur,
    changer(suite: Partial<EtatSync>) {
      etat = { ...etat, ...suite } as EtatSync;
      for (const rappel of abonnes) rappel();
    },
  };
}

function Pastille({ synchro }: { synchro?: "sync" | "en_attente" | "hors_ligne" }) {
  return <p data-testid="pastille">{useEtatPastille(synchro)}</p>;
}

function monter(moteur: MoteurSync, synchro?: "sync" | "en_attente" | "hors_ligne") {
  const queryClient = new QueryClient();
  const invalider = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <FournisseurHorsLigne moteur={moteur}>
        <Pastille {...(synchro ? { synchro } : {})} />
      </FournisseurHorsLigne>
    </QueryClientProvider>,
  );
  return { invalider };
}

describe("pastille SYNC / HORS LIGNE et moteur hors ligne", () => {
  it("suit l'état réel du moteur en direct, sans attendre l'accueil", () => {
    const banc = moteurFactice({ enLigne: true });
    monter(banc.moteur, "sync");
    expect(screen.getByTestId("pastille").textContent).toBe("sync");
    act(() => banc.changer({ enLigne: false }));
    expect(screen.getByTestId("pastille").textContent).toBe("horsLigne");
    act(() => banc.changer({ enLigne: true }));
    expect(screen.getByTestId("pastille").textContent).toBe("sync");
  });

  it("le moteur prime sur ce que dit l'accueil (serveur injoignable : HORS LIGNE même si l'accueil dit sync)", () => {
    const banc = moteurFactice({ enLigne: false });
    monter(banc.moteur, "sync");
    expect(screen.getByTestId("pastille").textContent).toBe("horsLigne");
  });

  it("recharge les lectures de l'agence quand la file se vide, pas avant", () => {
    const banc = moteurFactice({ enLigne: false, evenementsEnAttente: 2 });
    const { invalider } = monter(banc.moteur);
    act(() => banc.changer({ evenementsEnAttente: 3 }));
    expect(invalider).not.toHaveBeenCalled();
    act(() => banc.changer({ enLigne: true, evenementsEnAttente: 1 }));
    expect(invalider).toHaveBeenCalledTimes(1);
  });
});
