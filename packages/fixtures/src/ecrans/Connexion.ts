import { ecran } from "../ecran";

/** 0b · Connexion : numéro + code SMS, WhatsApp, USSD. */
export const Connexion = ecran({
  planche: "Connexion",
  donnees: {
    etape1: "Étape 1 sur 2 · 30 secondes",
    titre: { ligne1: "Ton numéro,", ligne2: "c'est ton compte." },
    explication:
      "Pas de mot de passe. Un code arrive par SMS, et ton billet aussi. Le même numéro marche sur un téléphone simple avec *123#.",
    telephone: { indicatif: "+237", numero: "6 91 22 10 08" },
    etape2: { titre: "Étape 2 · code reçu par SMS", renvoi: "renvoyer dans 0:42" },
    code: ["4", "8", "2", "_"],
    aideCode:
      "Le code se remplit tout seul quand le SMS arrive. Personne d'AfriMove ne te le demandera jamais.",
    actions: { continuer: "Continuer", whatsapp: "Par WhatsApp", ussd: "Sans internet · *123#" },
    mentions:
      "En continuant, tu acceptes les conditions d'utilisation et la politique de données. Tes données ne sont jamais vendues.",
  },
});
