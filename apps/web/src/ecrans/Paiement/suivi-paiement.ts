import { voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { useMaintenant } from "@/coquille/horloge";
import { delaiDepasse, issuePaiement, type EtatPaiement } from "./calculs";

/** Un paiement demandé et pas encore confirmé. */
export interface PaiementEnAttente {
  paiementId: string;
  commandeId: string;
  /** Fin du blocage de la commande (15 min) : au-delà, l'attente est close même sans nouvelle du serveur. */
  expireA: string;
  /** Statut donné par la réponse au paiement (un refus immédiat y figure déjà). */
  statutInitial: contrats.StatutPaiement;
  /** Consigne donnée par le serveur avec la réponse (« Confirme le paiement sur ton téléphone… »). */
  consigne?: string;
}

export interface SuiviPaiement {
  etat: EtatPaiement;
  /** Billet émis, quand le paiement a réussi. */
  billetId: string | undefined;
  /** Dernière consigne du serveur (cause d'un échec ou d'un délai dépassé, ou quoi faire pour confirmer). */
  consigne: string | undefined;
}

/**
 * Suit un paiement : le temps réel (MoMo push) donne l'issue et le billet dès la confirmation, la relève toutes les
 * 3 s prend le relais si le flux est coupé (alors le billet vient de la commande, relue jusqu'à ce qu'elle le porte).
 */
export function useSuiviPaiement(attente: PaiementEnAttente | null): SuiviPaiement {
  const actif = attente !== null;
  const maintenant = useMaintenant(5000);
  const paiementId = attente?.paiementId ?? "";
  const direct = voyageur.useStatutPaiementEnDirect({ paiementId }, actif);
  const releve = voyageur.useStatutPaiement({ paiementId }, { enabled: actif });
  // `dernier` garde le message d'une tentative précédente tant que la nouvelle n'a rien reçu.
  const message = direct.dernier?.paiementId === paiementId ? direct.dernier : undefined;

  const etat = attente
    ? issuePaiement(
        [attente.statutInitial, message?.statut, releve.data?.statut],
        delaiDepasse(attente.expireA, maintenant),
      )
    : "attente";
  const billetDuFlux = message?.billetIds[0];
  const commande = voyageur.useCommande(
    { commandeId: attente?.commandeId ?? "" },
    {
      enabled: actif,
      refetchInterval: (requete) =>
        etat === "reussi" && billetDuFlux === undefined && !requete.state.data?.billetIds[0]
          ? 1500
          : false,
    },
  );
  return {
    etat,
    billetId: billetDuFlux ?? commande.data?.billetIds[0],
    consigne: consigneDe(etat, attente, releve.data),
  };
}

/**
 * La consigne qui va avec l'issue : en attente, celle de la réponse au paiement (« Confirme sur ton téléphone… ») ;
 * après un échec, celle que le serveur a écrite pour ce statut (la cause), jamais celle d'un autre.
 */
function consigneDe(
  etat: EtatPaiement,
  attente: PaiementEnAttente | null,
  releve: contrats.Paiement | undefined,
): string | undefined {
  if (etat === "attente") return attente?.consigne ?? releve?.consigne;
  if (releve?.statut === etat) return releve.consigne;
  if (attente?.statutInitial === etat) return attente.consigne;
  return undefined;
}
