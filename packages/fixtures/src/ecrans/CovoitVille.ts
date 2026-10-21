import { ecran } from "../ecran";

/** 6b · Covoiturage en ville, côté passager : Akwa → Bonabéri, maintenant. */
export const CovoitVille = ecran({
  planche: "CovoitVille",
  donnees: {
    titre: "Covoiturage",
    ville: "Douala · détectée ▾",
    onglets: {
      entreVilles: "Entre villes",
      enVille: "En ville · Douala",
      aide: "glisse pour changer",
    },
    role: { passager: "Je suis passager", conducteur: "Je conduis" },
    itineraire: {
      departLibelle: "Départ",
      depart: "Akwa, marché central · ma position",
      arriveeLibelle: "Arrivée",
      arrivee: "Bonabéri, Ancien Dalip",
      detail: "9 km · maintenant",
    },
    maintenant: {
      titre: "Partent maintenant · 3",
      sens: "dans ta direction",
      offres: [
        {
          initiales: "CL",
          qui: "Clarisse · dans 3 min",
          reputation: "· vérifiée · 4,9 ★",
          detail: "Hyundai · 3 places · passe par Bonanjo · 25 min",
          prix: 700,
        },
        {
          initiales: "JM",
          qui: "Jean-Marc · 08:00",
          reputation: "· régulier · 4,8 ★",
          detail: "chaque matin · Toyota · 2 places · dépose au pont",
          prix: 600,
        },
        {
          initiales: "PA",
          qui: "Paul · moto-taxi · 5 min",
          reputation: "· casque fourni",
          detail: "vient te chercher · 18 min · bagage à main seulement",
          prix: 500,
        },
      ],
    },
    trajetDuMatin: {
      titre: "Mon trajet du matin · Akwa → Bonabéri · 07:00",
      actif: true,
      explication:
        "Chaque jour ouvré, l'app te propose à 06:40 les voitures qui partent. Jean-Marc t'a déjà pris 12 fois.",
    },
    securite:
      "Prix fixés à l'avance, jamais négociés dans la voiture. Position partagée avec un proche pendant le trajet.",
  },
});
