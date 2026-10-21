import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { agence as c } from "@afrimove/contrats";
import type { ConflitLocal } from "../base";
import type {
  DefinitionEvenementQuelconque,
  EtatSync,
  EvenementEnregistre,
  ResultatSynchro,
} from "../moteur";
import { useMoteurSync } from "./contexte";

/* ------------------------------------------------------------------ indicateur */

/** Ce que montre la pastille de l'en-tête de toutes les apps agence. */
export interface IndicateurSync {
  /** Texte de la pastille. */
  libelle: "SYNC" | "HORS LIGNE";
  /**
   * `sync` : tout est parti ; `en_attente` : en ligne, des événements partent ; `hors_ligne` :
   * des ventes s'accumulent sur l'appareil ; `bloque` : plus de 12 h hors ligne, vente impossible.
   */
  tonalite: "sync" | "en_attente" | "hors_ligne" | "bloque";
  /** Phrase lisible pour l'accessibilité et les infobulles. */
  description: string;
  evenementsEnAttente: number;
  derniereSyncA: string | null;
  etat: EtatSync;
}

function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

export function decrireEtat(etat: EtatSync): IndicateurSync {
  const attente = etat.evenementsEnAttente;
  let tonalite: IndicateurSync["tonalite"];
  let description: string;
  if (etat.retire) {
    tonalite = "bloque";
    description = "Appareil remplacé par un téléphone de secours : plus aucune vente";
  } else if (etat.bloque) {
    tonalite = "bloque";
    description = "Bloqué : hors ligne depuis plus de 12 h. Appelez votre superviseur";
  } else if (etat.etat === "hors_ligne") {
    tonalite = "hors_ligne";
    description =
      attente > 0
        ? `Hors ligne · ${pluriel(attente, "événement enregistré", "événements enregistrés")} sur ce téléphone`
        : "Hors ligne · vous pouvez continuer à vendre";
  } else if (etat.etat === "en_attente") {
    tonalite = "en_attente";
    description = `Synchronisation · ${pluriel(attente, "événement à envoyer", "événements à envoyer")}`;
  } else {
    tonalite = "sync";
    description = "Synchronisé";
  }
  return {
    libelle: etat.libelle,
    tonalite,
    description,
    evenementsEnAttente: attente,
    derniereSyncA: etat.derniereSyncA,
    etat,
  };
}

/** L'état complet du moteur, mis à jour à chaque changement. */
export function useEtatSync(): EtatSync {
  const moteur = useMoteurSync();
  const etat = useSyncExternalStore(
    useCallback((rappel) => moteur.abonner(rappel), [moteur]),
    () => moteur.instantane(),
    () => moteur.instantane(),
  );
  if (!etat) throw new Error("useEtatSync : moteur pas encore ouvert");
  return etat;
}

/** Pastille SYNC / HORS LIGNE, à brancher dans l'en-tête de chaque app agence. */
export function useIndicateurSync(): IndicateurSync {
  return decrireEtat(useEtatSync());
}

/* ------------------------------------------------------------------ synchroniser */

export function useSynchroniser(): {
  synchroniser: () => Promise<ResultatSynchro>;
  enCours: boolean;
} {
  const moteur = useMoteurSync();
  const etat = useEtatSync();
  const synchroniser = useCallback(() => moteur.synchroniser(), [moteur]);
  return { synchroniser, enCours: etat.synchronisationEnCours };
}

/* ------------------------------------------------------------------ enregistrer */

export interface MutationEvenement<E extends DefinitionEvenementQuelconque> {
  /** Enregistre l'événement ; les erreurs sont dans `error` (jamais levées). */
  mutate(donnees: c.DonneesDe<E>): void;
  /** Idem, en promesse : se résout quand l'événement est durable sur l'appareil. */
  mutateAsync(donnees: c.DonneesDe<E>): Promise<EvenementEnregistre<E>>;
  isPending: boolean;
  error: Error | null;
  data: EvenementEnregistre<E> | undefined;
  reset(): void;
}

/**
 * Hook d'écriture hors ligne : `mutate(donnees)` crée l'événement (UUID, numéro de la plage, heure),
 * l'écrit sur l'appareil, puis l'envoie dès que le réseau le permet. Même forme que les hooks
 * d'écriture de `@afrimove/api-client` (`mutate`, `mutateAsync`, `isPending`, `error`).
 *
 * `data.numero` est le numéro à imprimer : il est connu **avant** tout aller-retour réseau.
 */
export function useEnregistrerEvenement<E extends DefinitionEvenementQuelconque>(
  definition: E,
): MutationEvenement<E> {
  const moteur = useMoteurSync();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<EvenementEnregistre<E> | undefined>(undefined);
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const mutateAsync = useCallback(
    async (donnees: c.DonneesDe<E>) => {
      if (monte.current) {
        setPending(true);
        setError(null);
      }
      try {
        const resultat = await moteur.enregistrer(definition, donnees);
        if (monte.current) setData(resultat);
        return resultat;
      } catch (e) {
        const erreur = e instanceof Error ? e : new Error(String(e));
        if (monte.current) setError(erreur);
        throw erreur;
      } finally {
        if (monte.current) setPending(false);
      }
    },
    [moteur, definition],
  );
  const mutate = useCallback(
    (donnees: c.DonneesDe<E>) => {
      mutateAsync(donnees).catch(() => undefined);
    },
    [mutateAsync],
  );
  const reset = useCallback(() => {
    setError(null);
    setData(undefined);
  }, []);
  return { mutate, mutateAsync, isPending, error, data, reset };
}

/* ------------------------------------------------------------------ blocage */

export interface BlocageAppareil {
  bloque: boolean;
  /** Remplacé par un téléphone de secours : aucun PIN ne le débloque. */
  retire: boolean;
  horsLigneMinutes: number;
  bloqueDepuis: string;
  debloqueJusqua: string | null;
  /** Débloque sur place avec le PIN d'un superviseur (aucun réseau nécessaire). */
  debloquer(superviseurId: string, pin: string): Promise<{ debloqueJusqua: string }>;
}

/** Écran « appareil bloqué » et débloquage par PIN superviseur. */
export function useBlocageAppareil(): BlocageAppareil {
  const moteur = useMoteurSync();
  const etat = useEtatSync();
  const debloquer = useCallback(
    (superviseurId: string, pin: string) => moteur.debloquerAvecPin(superviseurId, pin),
    [moteur],
  );
  return {
    bloque: etat.bloque,
    retire: etat.retire,
    horsLigneMinutes: etat.horsLigneMinutes,
    bloqueDepuis: etat.bloqueDepuis,
    debloqueJusqua: etat.debloqueJusqua,
    debloquer,
  };
}

/* ------------------------------------------------------------------ conflits et sièges */

export interface ConflitsAppareil {
  /** Billets passés « à replacer », du plus récent au plus ancien. */
  conflits: ConflitLocal[];
  nonVus: number;
  marquerVus(evenementIds?: string[]): Promise<void>;
}

/** Alerte « à replacer » : un autre guichet avait pris ce siège en premier. */
export function useConflits(): ConflitsAppareil {
  const moteur = useMoteurSync();
  const etat = useEtatSync();
  const [conflits, setConflits] = useState<ConflitLocal[]>([]);
  useEffect(() => {
    let actif = true;
    void moteur.conflits().then((liste) => {
      if (actif) setConflits([...liste].sort((a, b) => b.detecteA.localeCompare(a.detecteA)));
    });
    return () => {
      actif = false;
    };
  }, [moteur, etat.conflitsNonVus]);
  const marquerVus = useCallback((ids?: string[]) => moteur.marquerConflitsVus(ids), [moteur]);
  return { conflits, nonVus: etat.conflitsNonVus, marquerVus };
}

/**
 * Sièges que ce guichet peut vendre hors ligne sur un départ (sa part, moins ce qu'il a déjà
 * vendu). `null` tant que la part n'est pas connue ; se met à jour à chaque changement de la file.
 */
export function useSiegesHorsLigne(departId: string): number[] | null {
  const moteur = useMoteurSync();
  const etat = useEtatSync();
  const [sieges, setSieges] = useState<number[] | null>(null);
  useEffect(() => {
    let actif = true;
    void moteur.siegesVendablesHorsLigne(departId).then((s) => {
      if (actif) setSieges(s);
    });
    return () => {
      actif = false;
    };
  }, [moteur, departId, etat.evenementsEnAttente, etat.derniereSyncA]);
  return sieges;
}
