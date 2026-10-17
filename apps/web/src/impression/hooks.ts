import type {
  DonneesBillet,
  DonneesEtiquette,
  InstantaneImpression,
  ResultatDemande,
  TravailImpression,
} from "@afrimove/impression";
import { useCallback, useSyncExternalStore } from "react";
import { useServiceImpression } from "./contexte";

/** Tout l'état de l'impression : disponibilité du navigateur, liaison avec l'imprimante, file. */
export function useEtatImpression(): InstantaneImpression {
  const service = useServiceImpression();
  const abonner = useCallback((ecouteur: () => void) => service.abonner(ecouteur), [service]);
  const lire = useCallback(() => service.instantane(), [service]);
  return useSyncExternalStore(abonner, lire, lire);
}

export interface Imprimante {
  /** Web Bluetooth existe sur ce navigateur ? Faux sur Safari iOS : l'impression Bluetooth n'y est pas possible. */
  disponible: boolean;
  /** « imprimante OK » : prête à recevoir. */
  ok: boolean;
  etat: InstantaneImpression["liaison"]["etat"];
  /** Nom de l'imprimante appairée, quand le navigateur le donne. */
  nom: string | null;
  erreur: string | null;
  /** Ouvre le sélecteur Bluetooth. À appeler depuis une touche. */
  appairer: () => Promise<void>;
  oublier: () => Promise<void>;
}

/** L'imprimante de cet appareil : état et appairage. */
export function useImprimante(): Imprimante {
  const service = useServiceImpression();
  const { disponible, liaison } = useEtatImpression();
  return {
    disponible,
    ok: liaison.etat === "ok",
    etat: liaison.etat,
    nom: liaison.imprimante?.nom ?? null,
    erreur: liaison.erreur,
    appairer: () => service.appairer(),
    oublier: () => service.oublier(),
  };
}

export interface FileEnCours {
  travaux: readonly TravailImpression[];
  /** Travaux qui attendent l'imprimante (ils repartent seuls à son retour). */
  enAttente: readonly TravailImpression[];
  /** Documents déjà imprimés, les plus récents en dernier : de quoi réimprimer. */
  imprimes: readonly TravailImpression[];
  /** Travail en cours d'envoi, s'il y en a un. */
  enCours: string | null;
  /** Relance tout de suite, sans attendre la prochaine tentative automatique. */
  relancer: () => Promise<void>;
  reimprimer: (id: string) => Promise<ResultatDemande>;
  abandonner: (id: string) => Promise<void>;
}

/** La file d'impression : ce qui attend, ce qui est sorti, réimpression. */
export function useFileImpression(): FileEnCours {
  const service = useServiceImpression();
  const { file } = useEtatImpression();
  return {
    travaux: file.travaux,
    enAttente: file.travaux.filter((t) => t.statut === "en_attente"),
    imprimes: file.travaux.filter((t) => t.statut === "imprime"),
    enCours: file.enCours,
    relancer: () => service.file.traiter(),
    reimprimer: (id) => service.reimprimer(id),
    abandonner: (id) => service.file.abandonner(id),
  };
}

export interface Imprimeur {
  /** Met le billet en file et l'imprime ; se résout à la fin de la première tentative. */
  imprimerBillet: (donnees: DonneesBillet) => Promise<ResultatDemande>;
  imprimerEtiquette: (donnees: DonneesEtiquette) => Promise<ResultatDemande>;
}

/** Les deux gabarits : billet et étiquette colis. */
export function useImprimeur(): Imprimeur {
  const service = useServiceImpression();
  return {
    imprimerBillet: (donnees) => service.imprimerBillet(donnees),
    imprimerEtiquette: (donnees) => service.imprimerEtiquette(donnees),
  };
}
