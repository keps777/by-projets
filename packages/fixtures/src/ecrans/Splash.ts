import { ecran } from "../ecran";

/** 0a · Première ouverture : logo à volets, jingle de 10 s, choix de la langue. */
export const Splash = ecran({
  planche: "Splash",
  donnees: {
    lieuEtHeure: "Douala · 07:38",
    langues: ["FR", "EN", "Pidgin"],
    langueActive: "FR",
    marque: "AfriMove",
    signature: "A · comme Avance",
    slogan: { ligne1: "Où que tu sois,", ligne2: "on te trouve." },
    jingle: {
      titre: "Jingle AfriMove · 10 s",
      paroles: "« Où que tu sois, on te trouve : Afri… Move ! »",
    },
    actions: { principale: "Commencer · 30 secondes", secondaire: "J'ai déjà un compte" },
    pied: "Billets, colis et covoiturage · 5 compagnies partenaires · marche aussi sans internet",
  },
});
