import { ecran } from "../ecran";
import { DECEMBRE } from "../partage/comptable";

/** 33 · Comptable : rapprochement MoMo de décembre, exports à colonnes fixes, envoi au cabinet. */
export const Comptable = ecran({
  planche: "Comptable",
  donnees: {
    titre: "Comptable",
    periode: `${DECEMBRE.mois} · ${DECEMBRE.cloture}`,
    mois: ["Décembre", "Novembre", "Octobre"],
    rapprochement: {
      titre: "Rapprochement MoMo · décembre",
      taux: "99,8 % rapproché",
      ventes: {
        libelle: "Ventes MoMo enregistrées",
        nombre: DECEMBRE.momo.ventes,
        montant: DECEMBRE.momo.enregistre,
      },
      recu: { libelle: "Reçu sur le compte marchand", montant: DECEMBRE.momo.recu },
      ecart: {
        libelle: `${DECEMBRE.momo.transactions} transactions sans correspondance`,
        montant: DECEMBRE.momo.sansCorrespondance,
      },
      lien: "Voir les 4 lignes · références opérateur",
    },
    exports: {
      titre: "Exports · colonnes fixes",
      aide: "aperçu · télécharger",
      liste: [
        {
          nom: "Journal des ventes",
          detail: "une ligne par billet et par colis · 31 404 lignes",
          action: "Aperçu",
          telecharger: "⤓",
        },
        {
          nom: "Journal de caisse",
          detail: "une ligne par session · écarts · validations PIN",
          action: "Aperçu",
          telecharger: "⤓",
        },
        {
          nom: "Annulations et remboursements",
          detail: "motif · qui a validé · 142 lignes",
          action: "Aperçu",
          telecharger: "⤓",
        },
        {
          nom: "Écritures SYSCOHADA",
          detail: "ventes, caisse, banque, TVA · prêt pour le cabinet",
          action: "Aperçu",
          telecharger: "⤓",
        },
        {
          nom: "Factures AfriMove",
          detail: "4 factures hebdo · 75 F / billet · 150 F / colis · payées",
          action: "Aperçu",
          telecharger: "à jour",
        },
      ],
    },
    cabinet: {
      titre: "Envoi automatique au cabinet",
      detail: "cabinet@… · le 2 de chaque mois · 3 derniers envois reçus",
    },
    cloture: "Clôturer décembre · tout envoyer",
  },
  visuel: { envoiAutomatique: true },
});
