import { voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { useEffect, useRef, useState } from "react";

/** Pause avant de créer la commande : un tap de plus sur un proche ou un départ ne crée pas une commande de trop. */
export const DELAI_CREATION_MS = 150;

type Demande = contrats.CreerCommande;
type Commande = contrats.Commande;

interface Etat {
  cle: string;
  commande?: Commande;
  echec?: true;
}

export interface CommandeProche {
  /** Commande créée pour la sélection courante (avec sa conversion en devise), sinon `undefined`. */
  commande: Commande | undefined;
  /** La création de la commande de la sélection courante a échoué. */
  echec: boolean;
  /** La commande à payer : celle qui existe, celle qui se crée, sinon une nouvelle. */
  obtenir: () => Promise<Commande>;
  /** Oublie la commande courante (paiement échoué ou expiré) : la suivante repart de zéro. */
  renouveler: () => void;
}

/**
 * La commande du billet payé pour un proche. La conversion en devise (« ≈ 12,90 $ CA ») n'existe que sur la
 * commande : on la crée dès que la sélection est complète (départ, siège, proche), et on en crée une nouvelle à
 * chaque changement ; les précédentes expirent seules (blocage de 15 minutes).
 */
export function useCommandeProche(demande: Demande | null): CommandeProche {
  const creer = voyageur.useCreerCommande();
  const creerRef = useRef(creer.mutateAsync);
  creerRef.current = creer.mutateAsync;

  const [version, setVersion] = useState(0);
  const cle = demande === null ? null : `${version}|${JSON.stringify(demande)}`;
  const demandeRef = useRef(demande);
  demandeRef.current = demande;

  const [etat, setEtat] = useState<Etat | null>(null);
  const enCours = useRef<{ cle: string; promesse: Promise<Commande> } | null>(null);

  function lancer(pour: string, corps: Demande): Promise<Commande> {
    const promesse = creerRef.current(corps);
    enCours.current = { cle: pour, promesse };
    return promesse;
  }

  useEffect(() => {
    if (cle === null) return;
    let annule = false;
    const minuterie = setTimeout(() => {
      const corps = demandeRef.current;
      // Un paiement lancé pendant la pause a déjà créé la commande de cette sélection.
      if (corps === null || enCours.current?.cle === cle) return;
      lancer(cle, corps).then(
        (commande) => {
          if (!annule) setEtat({ cle, commande });
        },
        () => {
          if (!annule) setEtat({ cle, echec: true });
        },
      );
    }, DELAI_CREATION_MS);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [cle]);

  const courant = etat !== null && etat.cle === cle ? etat : null;

  return {
    commande: courant?.commande,
    echec: courant?.echec === true,
    obtenir: async () => {
      if (courant?.commande) return courant.commande;
      if (cle === null || demande === null) throw new Error("Sélection incomplète");
      const deja = enCours.current;
      if (deja !== null && deja.cle === cle && courant?.echec !== true) return deja.promesse;
      const commande = await lancer(cle, demande);
      setEtat({ cle, commande });
      return commande;
    },
    renouveler: () => {
      enCours.current = null;
      setEtat(null);
      setVersion((v) => v + 1);
    },
  };
}
