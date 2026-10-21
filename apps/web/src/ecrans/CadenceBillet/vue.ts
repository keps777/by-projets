import type { agence as c } from "@afrimove/contrats";
import { PARAM_BILLET, type VenteFaite } from "../Cadence/vente";

export { PARAM_BILLET };

/** Tout ce que montre l'écran « Vendu », que les données viennent de la vente qui vient d'avoir lieu ou d'une relecture. */
export interface VueVendu {
  billet: c.BilletImprimable;
  /** Durée de la vente en millisecondes (« 1,8 s »). */
  dureeMs: number;
  paiement: { mode: c.ModePaiementAgence; recu: number; rendu: number };
  placesRestantes: number;
  recap: {
    plageSansTrou: boolean;
    siegeBloque: number;
    imprime: boolean;
    caisseCash: number;
    sms: "envoye" | "pas_de_numero";
    /** Numéro du SMS, quand on le connaît (vente qui vient d'avoir lieu). */
    telephone: string | null;
    synchro: "faite" | "au_retour_du_reseau";
  };
  suivant: { siege: number; prix: number };
}

/** Relecture du billet par `useCadenceBillet` (rechargement de la page, retour depuis une autre planche). */
export function vueDepuisLecture(lecture: c.CadenceBillet): VueVendu {
  return {
    billet: lecture.billet,
    dureeMs: lecture.vente.dureeMs,
    paiement: {
      mode: lecture.vente.paiement.mode,
      recu: lecture.vente.paiement.recu,
      rendu: lecture.vente.paiement.rendu,
    },
    placesRestantes: lecture.vente.placesRestantes,
    recap: { ...lecture.recapitulatif, telephone: null },
    suivant: lecture.suivant,
  };
}

/**
 * La vente qui vient d'avoir lieu sur cet appareil : disponible tout de suite, même hors ligne (le billet n'est pas
 * encore chez le serveur). Le numéro vient de la plage de l'appareil, donc sans trou.
 */
export function vueDepuisVente(vente: VenteFaite): VueVendu {
  const { billet } = vente;
  return {
    billet,
    dureeMs: vente.dureeMs,
    paiement: vente.paiement,
    placesRestantes: vente.placesRestantes,
    recap: {
      plageSansTrou: true,
      siegeBloque: billet.siege ?? vente.suivant.siege - 1,
      imprime: vente.imprime,
      caisseCash: vente.paiement.mode === "cash" ? billet.prix : 0,
      sms: vente.telephone === null ? "pas_de_numero" : "envoye",
      telephone: vente.telephone,
      synchro: vente.synchro,
    },
    suivant: vente.suivant,
  };
}

/** L'état de navigation posé par l'écran « Cadence » : `{ vente }`, ou null s'il n'a pas la bonne forme. */
export function venteDeLEtat(etat: unknown): VenteFaite | null {
  if (typeof etat !== "object" || etat === null || !("vente" in etat)) return null;
  const vente = (etat as { vente: unknown }).vente;
  if (typeof vente !== "object" || vente === null) return null;
  const candidat = vente as Partial<VenteFaite>;
  return typeof candidat.billet?.billetId === "string" &&
    typeof candidat.suivant?.siege === "number" &&
    typeof candidat.paiement?.mode === "string"
    ? (candidat as VenteFaite)
    : null;
}
