import { prixProrata } from "@afrimove/domain";
import { ecran } from "../ecran";
import { nombre } from "../format";
import { ALPHA_DLA_BAF } from "../monde";
import { DEPARTS_DLA_BAF, TOUS_DEPARTS_DLA_BAF } from "../partage/ligneDlaBaf";

const [origine, bafang, mbouda] = ALPHA_DLA_BAF.arrets;

/** Prix en route au prorata des kilomètres depuis Douala : 2 000 pour Bafang, 2 800 pour Mbouda. */
const prorata = (versArretId: string): number =>
  prixProrata({
    arrets: ALPHA_DLA_BAF.arrets,
    depuisArretId: origine!.id,
    versArretId,
    prixTrajetComplet: ALPHA_DLA_BAF.tarifs.classique,
  });

/** 34b · Modifier la ligne Douala → Bafoussam (brouillon) : le 10:00 devient 09:15, un départ du mardi 17:00. */
export const ConfigLigne = ecran({
  planche: "ConfigLigne",
  donnees: {
    titre: "Douala → Bafoussam",
    detail: "Ligne · 5 départs · 2 arrêts · prix, sièges, règles",
    badge: "BROUILLON",
    departs: {
      titre: "Départs",
      ajouter: "+ départ",
      liste: [
        {
          _departId: DEPARTS_DLA_BAF.d0600.id,
          heure: "06:00",
          libelle: "Heure du départ de 06:00",
          detail: "classique · LT 118 AB · 40 pl.",
          prix: ALPHA_DLA_BAF.tarifs.classique,
          actif: true,
        },
        {
          _departId: DEPARTS_DLA_BAF.d0815.id,
          heure: "08:15",
          libelle: "Heure du départ de 08:15",
          detail: "classique · soute colis",
          prix: ALPHA_DLA_BAF.tarifs.classique,
          actif: true,
        },
        {
          _departId: DEPARTS_DLA_BAF.d1000.id,
          heure: "09:15",
          libelle: "Heure du départ, modifiée",
          detail: "était 10:00 · proposé par l'assistant",
          prix: ALPHA_DLA_BAF.tarifs.classique,
          actif: true,
        },
        {
          _departId: DEPARTS_DLA_BAF.d1300.id,
          heure: "13:00",
          libelle: "Heure du départ de 13:00",
          detail: "classique",
          prix: ALPHA_DLA_BAF.tarifs.classique,
          actif: true,
        },
        {
          heure: "17:00",
          libelle: "Nouveau départ du mardi",
          detail: "nouveau · mardi seulement · marché",
          prix: ALPHA_DLA_BAF.tarifs.classique,
          actif: true,
        },
      ],
    },
    tarifs: {
      titre: "Tarifs",
      classique: {
        libelle: "Classique",
        libelleChamp: "Prix classique",
        valeur: nombre(ALPHA_DLA_BAF.tarifs.classique),
      },
      vip: { libelle: "VIP", libelleChamp: "Prix VIP", valeur: nombre(ALPHA_DLA_BAF.tarifs.vip) },
      bagage: {
        libelle: "Bagage sup.",
        libelleChamp: "Prix du bagage",
        valeur: nombre(ALPHA_DLA_BAF.tarifs.bagage),
      },
    },
    arrets: {
      titre: "Arrêts en route",
      liste: [
        { nom: "Bafang", detail: `· prorata ${nombre(prorata(bafang!.id))} · montée OK` },
        { nom: "Mbouda", detail: `· prorata ${nombre(prorata(mbouda!.id))} · montée OK` },
      ],
      ajouter: "+ arrêt",
    },
    plan: {
      libelle: "Plan de sièges ·",
      resume: "40 places",
      detail: ", 2+2, 11 rangées",
      modifier: "Modifier",
    },
    interrupteurs: [
      { libelle: "Vente en ligne · sièges visibles dans l'app voyageur", actif: true },
      { libelle: "Fusion automatique si deux départs sont sous 40 %", actif: false },
    ],
    actions: {
      annuler: "Annuler",
      publier: {
        libelle: "Publier dès lundi",
        detail: "2 changements · guichets et app à jour · tracé",
      },
    },
  },
  entites: { departs: TOUS_DEPARTS_DLA_BAF },
});
