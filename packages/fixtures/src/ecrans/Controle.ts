import { ecran } from "../ecran";
import { SESSION_JOSEPH } from "../monde";
import {
  DEPART_ALPHA_1430,
  DEPART_ALPHA_BAF_1500,
  DEPART_ALPHA_1600,
  DEPART_ALPHA_1630,
} from "../partage/caisse";

/** 42 · Salle de contrôle (web, 1280 px) à 14:05 : le direct des trois gares d'Alpha Voyages. */
export const Controle = ecran({
  planche: "Controle",
  maintenant: "14:05",
  donnees: {
    titre: "Salle de contrôle · Alpha Voyages",
    sousTitre: "3 gares · 14 bus · mardi 5 janvier 2027",
    vues: ["Direct", "Analyses", "Comptable", "Réglages", "Modules"],
    statut: "EN DIRECT · 14:05 · 3 / 3 gares synchronisées",
    chiffres: [
      { libelle: "Recette du jour", valeur: "2,61 M", detail: "+ 8 % vs mardi dernier" },
      { libelle: "Billets", valeur: 612, detail: "dont 37 en ligne · 11 en route" },
      { libelle: "Colis", valeur: 188, detail: "6 en correspondance · 0 litige" },
      { libelle: "Remplissage", valeur: "86 %", detail: "22 départs · 2 fusionnés" },
      { libelle: "Écarts de caisse", valeur: -1000, detail: "1 caisse sur 9 · à valider" },
    ],
    carte: {
      titre: "Bus en route · 9",
      aide: "position GPS · 30 s",
      libelle: "Carte des bus en route entre Douala, Yaoundé et Bafoussam",
      villes: ["Douala · 3 guichets", "Yaoundé · 2 guichets", "Bafoussam", "Bamenda · via Oméga"],
      alerte: "LT 207 AB · arrêt 12 min · panne ?",
      legende: "● Yaoundé ● Bafoussam ● retour ● alerte",
    },
    gares: {
      titre: "Gares · maintenant",
      aide: "1 clic ouvre la gare",
      colonnes: [
        "Gare",
        "Billets",
        "Colis",
        "Cash attendu",
        "Écart",
        "Prochain départ",
        "Superviseur",
      ],
      lignes: [
        {
          gare: "Douala Akwa",
          billets: 291,
          colis: 98,
          cashAttendu: 1_412_500,
          ecart: -1000,
          prochain: { heure: "14:30", detail: "Yaoundé · 38/40" },
          superviseur: "Essono · en ligne",
        },
        {
          gare: "Yaoundé Mvan",
          billets: 208,
          colis: 61,
          cashAttendu: 902_000,
          ecart: 0,
          prochain: { heure: "14:00", detail: "Douala · 40/40 · plein" },
          superviseur: "Tchinda · en ligne",
        },
        {
          gare: "Bafoussam",
          billets: 113,
          colis: 29,
          cashAttendu: 431_000,
          ecart: 0,
          prochain: { heure: "15:00", detail: "Douala · 19/40" },
          superviseur: "Fosso · hors ligne 4 min",
        },
      ],
    },
    atraiter: {
      titre: "À traiter · 4",
      aide: "1 clic",
      liste: [
        {
          texte: "Clôture guichet 2 Akwa · écart − 1 000 · attend le PIN d'Essono",
          quand: "14:00",
        },
        {
          texte: "LT 207 AB arrêté 12 min après Edéa · 36 à bord · chauffeur Nana injoignable",
          quand: "13:53",
        },
        {
          texte: "6 colis Oméga en correspondance à Bafoussam · scan « reçu » manquant",
          quand: "13:40",
        },
        {
          texte: "L'assistant propose de décaler le 10:00 à 09:15 · + 1,5 M / mois",
          quand: "12:10",
        },
      ],
    },
    ventesParHeure: {
      titre: "Ventes par heure",
      aide: "aujourd'hui",
      axe: ["05 h", "09 h", "13 h", "17 h · prévu"],
      lecture: "Le pic de 06 h à 08 h fait 42 % de la journée. Prévision de clôture : 4,4 M.",
    },
    rapport: {
      titre: "Rapport du soir",
      texte:
        "Part à 21:00 sur WhatsApp à M. Kamga et aux 3 superviseurs. Toutes les caisses doivent être validées avant. Il en reste 1.",
      lien: "Voir le rapport d'hier",
    },
  },
  visuel: {
    // 12 barres : 05 h → 13 h réalisées (hauteurs en %), 14 h → 17 h prévues (gris).
    ventesParHeure: [70, 100, 88, 62, 48, 40, 44, 52, 58, 30, 26, 18],
  },
  entites: {
    departs: [DEPART_ALPHA_1430, DEPART_ALPHA_BAF_1500, DEPART_ALPHA_1600, DEPART_ALPHA_1630],
    sessions: [SESSION_JOSEPH],
  },
});
