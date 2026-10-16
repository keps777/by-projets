import { ecran } from "../ecran";
import { DEPART_ALPHA_0830, DEPART_BETA_0800, DEPART_OMEGA_0930, COLIS_MAMAN } from "../monde";

/** 1 · Accueil voyageur : les départs en direct, une touche vers tout. */
export const Main = ecran({
  planche: "Main",
  donnees: {
    marque: "AfriMove",
    salutation: "Bonjour Aïcha",
    direct: "DIRECT · 07:38",
    mode: { entreVilles: "Entre villes", memeVille: "Dans la même ville" },
    trajet: {
      departLibelle: "Départ",
      arriveeLibelle: "Arrivée",
      depart: { code: "DLA", ville: "Douala" },
      arrivee: { code: "YDE", ville: "Yaoundé" },
      position: "Tu es à Douala · Akwa → Yaoundé Mvan",
      jour: "Auj. ▾",
    },
    filtre: { resume: "Toutes classes · 5 compagnies", preferees: "2 préférées" },
    liste: {
      titre: "Départs · places réelles",
      onglets: ["Tout", "Bus", "Covoit"],
      ongletActif: "Tout",
      departs: [
        {
          _departId: DEPART_BETA_0800.id,
          heure: "08:00",
          compagnie: "Bêta Express",
          classe: "VIP",
          places: "9 places",
          prix: 7500,
        },
        {
          _departId: DEPART_ALPHA_0830.id,
          heure: "08:30",
          compagnie: "Alpha Voyages",
          classe: "Classique",
          places: "18 places",
          prix: 4000,
        },
        {
          _departId: DEPART_OMEGA_0930.id,
          heure: "09:30",
          compagnie: "Oméga Transports",
          classe: "Classique",
          places: "plus que 3",
          prix: 3800,
        },
      ],
      covoit: {
        heure: "08:45",
        titre: "Covoiturage",
        conducteur: "Samuel · vérifié",
        detail: "Bonapriso · 2 places · Toyota",
        prix: 5000,
      },
      reseau: "14 bus et 6 covoiturages aujourd'hui · voir tout",
    },
    raccourcis: {
      services: ["Envoyer un colis", "Payer pour un proche", "Groupe · bus entier"],
      autres: ["Moto vers la gare", "Monter en route", "Sans internet"],
    },
    notificationColis: {
      _colisId: COLIS_MAMAN.id,
      titre: "Ton colis pour Maman est arrivé à Bafoussam",
      detail: "Code de retrait envoyé · voir la photo",
    },
    navigation: ["Voyager", "Colis", "Covoit", "Moi"],
  },
  entites: { departs: [DEPART_BETA_0800, DEPART_ALPHA_0830, DEPART_OMEGA_0930] },
});
