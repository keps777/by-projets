import { repartitionRelais } from "@afrimove/domain";
import { ecran } from "../ecran";
import { MAMA_FOTSO } from "../monde";

const { relais } = repartitionRelais();
const COLIS_SEMAINE = 42;

/** 22b · Devenir point de relais (app voyageur) : 200 F par colis remis, 214 relais actifs dans 12 villes. */
export const RelaisDevenir = ecran({
  planche: "RelaisDevenir",
  donnees: {
    titre: "Deviens point de relais",
    detail: "Programme ouvert à toute boutique · Bafoussam et 11 villes",
    badge: `${relais} F / COLIS`,
    promesse: {
      accroche:
        "Ta boutique garde les colis des voyageurs. Tu gagnes à chaque remise, et des clients entrent.",
      deroule:
        "Le bus arrive à la gare, le convoyeur dépose chez toi les colis du quartier. Le destinataire vient avec son code et sa pièce, tu scannes, c'est remis. Payé chaque lundi par MoMo.",
    },
    chiffres: [
      { libelle: "Par colis", valeur: `${relais} F`, detail: "remis · 100 F si repris" },
      {
        _personneId: MAMA_FOTSO.id,
        libelle: MAMA_FOTSO.nom,
        valeur: relais * COLIS_SEMAINE,
        detail: `la semaine dernière · ${COLIS_SEMAINE} colis`,
      },
      { libelle: "Relais actifs", valeur: 214, detail: "dans 12 villes" },
    ],
    prerequis: {
      titre: "Il te faut",
      liste: [
        "✓ Une boutique ouverte ≥ 6 j / 7",
        "✓ Ce téléphone (même app)",
        "✓ Ta CNI ou ton récépissé",
        "✓ Un numéro MoMo pour être payé",
        "✓ 1 m² à l'abri, fermé la nuit",
        "✓ 10 min de formation vidéo",
      ],
    },
    etapes: {
      titre: "Comment ça se passe",
      liste: [
        {
          rang: 1,
          titre: "Tu remplis la fiche · 3 min",
          detail: "nom, position, horaires, photo de la façade, pièce",
        },
        {
          rang: 2,
          titre: "Un agent AfriMove passe sous 72 h",
          detail: "ou appel vidéo · il vérifie et te forme en 10 min",
        },
        {
          rang: 3,
          titre: "Tu reçois ton kit et ton premier colis",
          detail: "affiche QR, étiquettes, code relais R-… · l’app passe en mode relais",
        },
      ],
    },
    mention:
      "Pas d'exclusivité, pas de caution. Tu peux faire une pause (vacances) ou arrêter quand tu veux depuis l'app.",
    actions: {
      plusTard: "Plus tard",
      inscrire: { libelle: "Je m'inscris · 3 min", detail: "fiche · agent sous 72 h · kit" },
    },
  },
});
