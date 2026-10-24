// État propre au guichet : tout ce qui n'appartient à aucune entité du monde (reçus, copies imprimées, comptage au quai, coupures…).
import { tranche } from '../../data/store.svelte.ts';
import type { Passager } from '../../domain/types.ts';

export interface EtatGuichet {
  /** Espèces reçues et monnaie rendue, par paiement. */ recus: Record<string, { recu: number; rendu: number }>;
  /** Nombre d'impressions (1 = original, 2 = copie 2…), par paiement ou par colis. */ copies: Record<string, number>;
  /** Lots de billets vendus, le plus récent en dernier : sert à « Annuler la dernière vente ». */ annulables: string[][];
  /** Billets vendus hors ligne, en attente de synchronisation. */ aSynchroniser: string[]; derniereSync: number;
  /** Montées comptées au quai (mode cadence), par départ. */ montes: Record<string, number>;
  /** Expéditeur d'un colis créé au guichet (le colis ne garde que le destinataire). */ expediteurs: Record<string, Passager>;
  /** Suppléments encaissés au dépôt d'un colis plus gros que déclaré. */ supplements: { caisseId: string; colisId: string; montant: number; ts: number }[];
  /** Espèces rendues à un voyageur remboursé au guichet. */ remboursements: { caisseId: string; billetId: string; montant: number; ts: number }[];
  /** Photo (miniature) du bordereau de dépôt, par caisse. */ bordereaux: Record<string, string>;
}
const defaut = (): EtatGuichet => ({ recus: {}, copies: {}, annulables: [], aSynchroniser: [], derniereSync: 0, montes: {}, expediteurs: {}, supplements: [], remboursements: [], bordereaux: {} });
/** Tranche du guichet. Appelée dans un `$derived` avant sa création, elle rend une valeur vide non enregistrée (voir CONTRIBUER §5). */
export const etat = (): EtatGuichet => tranche('guichet', defaut);
