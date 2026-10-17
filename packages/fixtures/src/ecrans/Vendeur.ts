import { ecran } from "../ecran";
import { jourDecale } from "../horloge";
import { ALPHA, ALPHA_DLA_YDE, BETA, BETA_DLA_YDE, NADEGE, departDe } from "../monde";

/** Les deux départs proposés sont ceux de demain matin (mercredi 6 janvier), pas ceux d'aujourd'hui. */
const alpha0830Demain = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_YDE,
  hhmm: "08:30",
  classe: "classique",
  jour: jourDecale(1),
});
const beta0800Demain = departDe({
  cie: BETA,
  ligne: BETA_DLA_YDE,
  hhmm: "08:00",
  classe: "vip",
  jour: jourDecale(1),
});

/** 41 · Vendeur ambulant : Nadège (V-0412, Ndokoti) vend des billets à ses voisins, 100 F de commission. */
export const Vendeur = ecran({
  planche: "Vendeur",
  donnees: {
    titre: "Vendeur AfriMove",
    detail: `${NADEGE.nom} · quartier Ndokoti · agréée par Alpha et Bêta`,
    numero: "n° V-0412",
    vente: {
      titre: "Vendre à un voisin · 3 touches",
      commission: "commission 100 F / billet",
      trajet: "Douala → Yaoundé",
      quand: "demain",
      departs: [
        {
          _departId: alpha0830Demain.id,
          heure: "08:30",
          compagnie: "Alpha Voyages · 18 places",
          detail: "le voisin paie cash, je paie MoMo, il reçoit le SMS",
          prix: 4000,
        },
        {
          _departId: beta0800Demain.id,
          heure: "08:00",
          compagnie: "Bêta Express VIP · 9 places",
          detail: "commission 150 F",
          prix: 7500,
        },
      ],
    },
    bilan: [
      { libelle: "Ce mois", valeur: 83, detail: "billets vendus" },
      { libelle: "Gagné", valeur: 9350, detail: "versé le lundi" },
      { libelle: "Clients", valeur: 41, detail: "dont 12 réguliers" },
    ],
    clients: {
      titre: "Mes clients · revendre en 1 touche",
      liste: [
        {
          nom: "Mme Ebogo",
          detail: "· Yaoundé chaque vendredi · 6 70 …",
          action: "vendredi 08:30 ?",
        },
        {
          nom: "Pasteur Nkou",
          detail: "· Bafoussam · 6 94 …",
          action: "dernier : 28 déc.",
        },
      ],
    },
    regle:
      "Le billet est au nom du voisin, pas au tien. Tu ne gardes jamais d'argent : le voisin paie, tu paies l'agence par MoMo dans la minute, la commission arrive le lundi.",
    action: "Vendre un billet à un voisin",
  },
  entites: { departs: [alpha0830Demain, beta0800Demain] },
});
