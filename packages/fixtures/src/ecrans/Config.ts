import { ecran } from "../ecran";
import { ALPHA_DLA_BAF, ALPHA_DLA_YDE, ALPHA_YDE_BAF } from "../monde";
import { EFFECTIFS, GUICHETIERS, TOTAL_EQUIPE } from "../partage/equipe";

/** 34 · Réglages du patron : lignes et tarifs, équipe, règles de l'agence. */
export const Config = ecran({
  planche: "Config",
  donnees: {
    titre: "Réglages",
    sousTitre: "Lignes, tarifs, équipe, règles · tout se change ici",
    modules: "Modules",
    lignes: {
      titre: "Lignes et tarifs",
      ajouter: "+ ligne",
      liste: [
        {
          _ligneId: ALPHA_DLA_YDE.id,
          nom: "Douala → Yaoundé",
          detail: "8 départs · classique 4 000 · VIP 5 500 · bagage 1 000",
          action: "10:00 → 09:15 proposé",
        },
        {
          _ligneId: ALPHA_DLA_BAF.id,
          nom: "Douala → Bafoussam",
          detail: "5 départs · 3 500 · arrêts Bafang, Mbouda",
          action: "modifier",
        },
        {
          _ligneId: ALPHA_YDE_BAF.id,
          nom: "Yaoundé → Bafoussam",
          detail: "3 départs · 4 500 · prix en route au prorata",
          action: "modifier",
        },
      ],
    },
    equipe: {
      titre: `Équipe · ${TOTAL_EQUIPE} personnes`,
      ajouter: "+ personne",
      effectifs: EFFECTIFS.map((e) => ({ nombre: e.nombre, role: e.role })),
      guichetiers: GUICHETIERS.map((g) => ({
        _personneId: g._personneId,
        initiales: g.initiales,
        nom: g.nom,
        lieu: g.lieu,
        detail: g.detail,
        action: g.action,
      })),
      pied: "9 guichetiers · 3 visibles · glisser",
      liste: "Voir la liste",
    },
    regles: {
      titre: "Règles",
      annulation: {
        avant: "Annulation gratuite jusqu'à",
        delai: "1 h",
        apres: "avant · puis selon classe",
      },
      tolerance: { libelle: "Tolérance d'écart de caisse ·", montant: "1 000 F" },
      cadence: "Numéro de téléphone obligatoire en mode cadence",
      fraisService: "Frais de service voyageur (250 F) pris en charge par l'agence",
      comptesMomo: "Comptes MoMo de l'agence · MTN ···· 02 · OM ···· 77",
      modifier: "modifier",
    },
    pied: "Chaque changement est daté, signé, et visible dans le rapport du soir.",
  },
  visuel: {
    roleActif: "guichetiers",
    interrupteurs: { cadenceNumeroObligatoire: false, fraisServiceAgence: false },
  },
});
