import { versIsoDouala } from "../billetterie/temps";
import type { LigneReversement, Paiement, Remboursement, StatutPaiement } from "./modeles";
import { TEXTES } from "./regles";

/** Canal de diffusion temps réel du statut d'un paiement (`DiffusionTempsReel` de la billetterie). */
export const canalStatutPaiement = (paiementId: string): string => `paiement:${paiementId}`;

/**
 * Le statut que voit le client. L'argent peut être reçu (`reussi` côté serveur) sans que la
 * commande soit honorée :
 *  - billets pas encore émis : le client attend encore (`en_attente_confirmation`) ;
 *  - sièges repris, commande annulée, doublon : pas de billet, le paiement est remboursé, donc `echoue`.
 */
export function statutVu(p: Paiement): StatutPaiement {
  if (p.statut !== "reussi") return p.statut;
  if (p.confirmation === "a_faire") return "en_attente";
  if (["sieges_perdus", "commande_annulee", "doublon"].includes(p.confirmation)) return "echoue";
  return "reussi";
}

/** Le contrat parle de `en_attente_confirmation` ; le serveur dit `en_attente`. */
export const statutContrat = (s: StatutPaiement): string =>
  s === "en_attente" ? "en_attente_confirmation" : s;

function consigne(p: Paiement): string | undefined {
  const statut = statutVu(p);
  if (statut === "en_attente") {
    return p.moyen === "mtn_momo" || p.moyen === "orange_money" || p.moyen === "carte"
      ? TEXTES.consigne[p.moyen]
      : undefined;
  }
  if (statut === "reussi") return undefined;
  if (p.confirmation === "sieges_perdus") return TEXTES.consigne.sieges_perdus;
  if (p.confirmation === "commande_annulee") return TEXTES.consigne.commande_annulee;
  if (p.confirmation === "doublon") return TEXTES.consigne.doublon;
  return statut === "expire" ? TEXTES.consigne.expire : TEXTES.consigne.echoue;
}

/** Un paiement de commande tel que le contrat `Paiement` (voyageur) le décrit. */
export function vuePaiement(p: Paiement) {
  const texte = consigne(p);
  return {
    id: p.id,
    commandeId: p.commandeId ?? "",
    moyen: p.moyen,
    statut: statutContrat(statutVu(p)),
    montant: p.montant,
    ...(texte !== undefined ? { consigne: texte } : {}),
    ...(statutVu(p) === "en_attente" && p.urlAuthentification !== null
      ? { urlAuthentification: p.urlAuthentification }
      : {}),
    creeA: versIsoDouala(p.creeA),
  };
}

/** Un push demandé au guichet : la référence de l'opérateur sert à la vente. */
export function vueGuichet(p: Paiement) {
  const texte = consigne(p);
  return {
    id: p.id,
    moyen: p.moyen,
    statut: statutContrat(p.statut),
    montant: p.montant,
    referenceOperateur: p.statut === "reussi" ? p.referenceOperateur : null,
    ...(texte !== undefined ? { consigne: texte } : {}),
    creeA: versIsoDouala(p.creeA),
  };
}

/** Une ligne du rapprochement : les références de l'opérateur et la répartition, sans numéro complet. */
export function vueReference(p: Paiement, rembourse: number) {
  return {
    id: p.id,
    origine: p.origine,
    commandeId: p.commandeId,
    compagnieId: p.compagnieId,
    moyen: p.moyen,
    operateur: p.operateur,
    statut: p.statut,
    confirmation: p.confirmation,
    montant: p.montant,
    devise: p.devise,
    repartition: p.repartition.map((l: LigneReversement) => ({
      beneficiaire: l.beneficiaire,
      montant: l.montant,
    })),
    rembourse,
    fournisseur: p.fournisseur,
    idFournisseur: p.idFournisseur,
    referenceOperateur: p.referenceOperateur,
    telephoneMasque: p.telephoneMasque,
    cause: p.cause,
    creeA: versIsoDouala(p.creeA),
    termineA: p.termineA ? versIsoDouala(p.termineA) : null,
  };
}

/** Un remboursement tel que l'administration le voit. */
export function vueRemboursement(r: Remboursement) {
  return {
    id: r.id,
    paiementId: r.paiementId,
    cause: r.cause,
    montant: r.montant,
    lignes: r.lignes,
    statut: r.statut,
    referenceOperateur: r.referenceOperateur,
    tentatives: r.tentatives,
    derniereErreur: r.derniereErreur,
    creeA: versIsoDouala(r.creeA),
    termineA: r.termineA ? versIsoDouala(r.termineA) : null,
  };
}

/** Message du canal temps réel (`MessageStatutPaiement` du contrat). */
export function messageStatut(p: Paiement, instant: Date) {
  return {
    paiementId: p.id,
    commandeId: p.commandeId ?? "",
    statut: statutContrat(statutVu(p)),
    billetIds: p.billetIds,
    instant: versIsoDouala(instant),
  };
}
