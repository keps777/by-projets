import { ecran } from "../ecran";
import { nombre } from "../format";
import { DECEMBRE, TRANSACTIONS_SANS_CORRESPONDANCE as T } from "../partage/comptable";

const total = T.reduce((somme, t) => somme + t.montant, 0);

/** 33b · Les 4 transactions MoMo de décembre sans billet ni colis (16 000 F), avec la cause probable. */
export const ComptableRapprochement = ecran({
  planche: "ComptableRapprochement",
  donnees: {
    titre: "Sans correspondance",
    detail: `Décembre · ${T.length} transactions sur ${nombre(DECEMBRE.momo.ventes)} · ${nombre(total)} FCFA`,
    part: "0,2 %",
    intro:
      "Le compte marchand a reçu l'argent, mais aucun billet ne porte la référence. Pour chaque ligne, l'app propose la cause la plus probable et l'action.",
    entete: { gauche: "Réf. opérateur · date · numéro", droite: "montant" },
    lignes: [
      {
        reference: T[0].reference,
        quand: "3 déc. 11:42 · 6 77 •• •• 41 · MTN",
        montant: T[0].montant,
        cause:
          "Probable : billet DLA → BAF 10:00 payé 2 fois, 2e paiement 40 s après le 1er (réseau)",
        action: "Rembourser",
      },
      {
        reference: T[1].reference,
        quand: "9 déc. 06:58 · 6 99 •• •• 02 · Orange",
        montant: T[1].montant,
        cause:
          "Probable : paiement arrivé après l'expiration du siège (15 min) · le client a repayé au guichet",
        action: "Rembourser",
      },
      {
        reference: T[2].reference,
        quand: "17 déc. 19:30 · 6 50 •• •• 77 · MTN",
        montant: T[2].montant,
        cause:
          "Probable : colis payé à l'arrivée au relais Bonabéri, scan de dépôt manquant · à rattacher au colis C-ALP-DLA-261217-0141",
        action: "Rattacher",
      },
      {
        reference: T[3].reference,
        quand: "28 déc. 14:05 · 6 94 •• •• 18 · Orange",
        montant: T[3].montant,
        cause:
          "Inconnu : aucun billet, aucun colis, numéro jamais vu · demander la pièce à l'opérateur",
        action: "Demander",
      },
    ],
    total: { libelle: "Total à traiter", montant: total },
    actions: [
      {
        titre: "Remboursement",
        detail: "MoMo vers le même numéro · 1 touche · tracé 7 ans",
      },
      { titre: "Rattacher", detail: "la référence est écrite sur le colis ou le billet" },
      { titre: "Demander", detail: "réclamation opérateur · réponse sous 72 h" },
    ],
    pied: "Rien n'est clôturé tant qu'une ligne reste ouverte. Le cabinet reçoit les 4 décisions avec leurs références.",
    boutons: {
      plusTard: "Plus tard",
      appliquer: {
        libelle: "Appliquer les 4 · mon PIN",
        detail: "2 remboursements · 1 rattachement · 1 réclamation",
      },
    },
  },
});
