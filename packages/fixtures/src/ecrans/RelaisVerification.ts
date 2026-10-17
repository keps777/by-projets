import { ecran } from "../ecran";
import { AGENT_PAUL_K } from "../monde";

/** 22d · Vérification de la fiche (dossier R-BAF-0215) : un agent passe jeudi, activation ensuite (étape 2 / 3). */
export const RelaisVerification = ecran({
  planche: "RelaisVerification",
  maintenant: "10:13",
  donnees: {
    titre: "Fiche envoyée",
    detail: "Étape 2 / 3 · vérification · dossier R-BAF-0215",
    suivi: {
      titre: "Suivi · en direct",
      etapes: [
        {
          fait: true,
          etape: "Fiche reçue",
          detail: "· aujourd’hui 10:12 · SMS de confirmation envoyé",
        },
        {
          fait: true,
          etape: "Position et horaires validés",
          detail: "· la boutique est bien sur un trajet de convoyeur (ligne Douala → Bafoussam)",
        },
        {
          fait: false,
          _personneId: AGENT_PAUL_K.id,
          etape: "Agent AfriMove · visite ou appel vidéo",
          detail: `· ${AGENT_PAUL_K.nom} · jeudi entre 9 h et 12 h · il vérifie la façade, l’abri, et te forme (10 min)`,
        },
        {
          fait: false,
          etape: "Activation",
          detail: "· code relais, kit (affiche QR + 50 étiquettes), app en mode relais",
        },
        {
          fait: false,
          etape: "Premier colis",
          detail: "· le convoyeur te prévient la veille · tu scannes · 200 F",
        },
      ],
    },
    code: {
      libelle: "Ton code relais · réservé",
      valeur: "R-BAF-0215",
      etat: "actif après la visite",
    },
    demo: {
      libelle: "En attendant",
      titre: "Essayer l'app relais · démo",
      detail: "recevoir · remettre · payé lundi →",
    },
    jeudi: {
      titre: "Étape 3 · à quoi ressemble jeudi",
      texte:
        "Paul scanne ta fiche, colle l'affiche QR à ta vitrine, te montre les 2 gestes (scanner à la réception, code + pièce à la remise) et active ton compte devant toi. Dès le soir, les voyageurs qui envoient un colis à Tamdja voient « Boutique Chez Thérèse » dans la liste des relais.",
    },
    mention:
      "Tu peux modifier ta fiche, déplacer la visite ou retirer ta demande à tout moment. Rien n'est facturé.",
    actions: {
      modifier: "Modifier ma fiche",
      retour: { libelle: "Retour à mon espace", detail: "je te préviens par SMS jeudi" },
    },
  },
  visuel: { etape: 2, etapes: 3 },
});
