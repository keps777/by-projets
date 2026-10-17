import { ecran } from "../ecran";
import { KAMGA_PATRON, SESSION_JOSEPH } from "../monde";

/** 30 · Accueil du patron d'Alpha Voyages à 14:05 : chiffres du jour, assistant, 9 raccourcis, 6 alertes. */
export const Patron = ecran({
  planche: "Patron",
  maintenant: "14:05",
  donnees: {
    compagnie: "Alpha Voyages",
    detail: `${KAMGA_PATRON.nom} · 3 gares · 14 bus`,
    heure: "14:05",
    jour: {
      titre: "Aujourd'hui · en direct",
      comparaison: "vs mardi dernier",
      recette: "2,61 M",
      variation: "+ 8 %",
      chiffres: [
        { valeur: 612, libelle: "billets" },
        { valeur: 188, libelle: "colis" },
        { valeur: "86 %", libelle: "remplissage" },
        { valeur: -1000, libelle: "écart total" },
      ],
    },
    assistant: {
      titre: "L'assistant a 2 choses à te dire",
      detail: "Le 09:30 Oméga te prend 40 clients · Guichet 2 : 3 écarts en 10 jours",
    },
    raccourcis: [
      { titre: "Analyses", detail: "semaine · lignes · bus" },
      { titre: "Mes gares, mes gens", detail: "caisses · quais · 23 pers." },
      { titre: "Rapports", detail: "chaque soir · 21 h" },
      { titre: "Comptable", detail: "exports · rapprochement" },
      { titre: "Financement", detail: "avance · crédit · paie" },
      { titre: "Entre compagnies", detail: "colis en correspondance · Oméga" },
      { titre: "Réglages", detail: "lignes · tarifs · équipe · règles" },
      { titre: "Modules", detail: "activer · masquer · les 12" },
      { titre: "Salle de contrôle", detail: "sur ordinateur · tout en direct" },
    ],
    alertes: {
      titre: "Alertes · 6",
      aide: "1 touche · glisser",
      liste: [
        { texte: "Guichet 2 Akwa · écart − 1 000 · 3e en 10 jours", quand: "14:00" },
        { texte: "6 colis Oméga en correspondance chez toi · à régler lundi", quand: "12:30" },
        { texte: "Guichet 3 Akwa · Pauline N. bloquée · 3 PIN faux", quand: "09:40" },
        { texte: "LT 207 AB · 2e panne en 10 jours · révision conseillée", quand: "hier" },
        { texte: "4 transactions MoMo sans correspondance · 16 000", quand: "hier" },
        { texte: "Avance 6 M · dossier AV-2027-0041 en analyse", quand: "hier" },
      ],
    },
    navigation: ["Aujourd'hui", "Analyses", "Gares", "Réglages"],
  },
  entites: { sessions: [SESSION_JOSEPH] },
});
