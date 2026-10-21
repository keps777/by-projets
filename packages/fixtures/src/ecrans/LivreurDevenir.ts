import { repartitionLivraison } from "@afrimove/domain";
import { ecran } from "../ecran";
import { ERIC_T } from "../monde";

const course = repartitionLivraison(1000).livreur;

/** 23b · Devenir livreur : 700 F la course, 86 livreurs dans 12 villes, ses particularités à choisir. */
export const LivreurDevenir = ecran({
  planche: "LivreurDevenir",
  donnees: {
    titre: "Deviens livreur",
    detail: "Programme ouvert · moto, vélo ou à pied · tu choisis tes heures",
    badge: `${course} F / COURSE`,
    chiffres: [
      { libelle: "La course", valeur: `${course} F`, detail: "≈ 4 km · payé le soir" },
      {
        _personneId: ERIC_T.id,
        libelle: ERIC_T.nom,
        valeur: "31 k",
        detail: "la semaine · 41 courses",
      },
      { libelle: "Livreurs", valeur: 86, detail: "dans 12 villes" },
    ],
    particularites: {
      titre: "Tes particularités · on te propose les bonnes courses",
      deplacement: {
        libelle: "Je me déplace",
        choix: ["Moto", "Vélo", "À pied", "Tricycle · gros colis"],
      },
      zone: {
        libelle: "Ma zone",
        choix: [
          "Bafoussam · Tamdja, Djeleng, centre",
          "Bafoussam · toute la ville",
          "Douala · Akwa, Bonanjo",
          "Yaoundé · Mvan, Biyem-Assi",
        ],
        valeur: "Bafoussam · Tamdja, Djeleng, centre",
      },
      heures: {
        libelle: "Mes heures",
        choix: ["Soirs 17 h – 21 h", "Toute la journée", "Matins 6 h – 12 h", "Week-ends"],
        valeur: "Soirs 17 h – 21 h",
      },
      charge: {
        libelle: "Je porte jusqu’à",
        choix: ["10 kg · colis courants", "3 kg · petits colis", "30 kg · gros colis (tricycle)"],
        valeur: "10 kg · colis courants",
      },
      momo: { libelle: "MoMo pour être payé", valeur: "6 75 •• •• 09 · MTN" },
    },
    pieces: [
      { titre: "CNI", detail: "déjà vérifiée" },
      { titre: "Permis A", detail: "photo · si moto" },
      { titre: "Assurance moto", detail: "photo · si moto" },
    ],
    regles: {
      titre: "Les 3 règles · tu les signes",
      texte:
        "1. Jamais de remise sans le code. 2. Jamais de code demandé par téléphone. 3. Photo du colis remis, à chaque fois. Le colis est assuré jusqu'à 50 000 F dès que tu scannes.",
    },
    mention:
      "Pas d'exclusivité : tu acceptes ou passes chaque course. 30 s pour répondre, puis elle va au suivant.",
    actions: {
      plusTard: "Plus tard",
      inscrire: { libelle: "Je m'inscris", detail: "pièces · 10 min de formation · 1re course" },
    },
  },
  visuel: { deplacementChoisi: "Moto" },
});
