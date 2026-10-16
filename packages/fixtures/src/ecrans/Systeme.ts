import { ecran } from "../ecran";

/** 44 · Système graphique v3 : polices, couleurs, composants, les 5 règles et ce que la v3 contient. */
export const Systeme = ecran({
  planche: "Systeme",
  donnees: {
    entete: {
      surtitre: "Système graphique v3 · ce qui change par rapport à la v2",
      titre: "Même nuit de gare, trois nouvelles voix",
    },
    logo: { libelle: "Logo AfriMove piste E", nom: "AfriMove", devise: "A · comme Avance" },
    polices: [
      {
        nom: "Titres · Bricolage Grotesque 800",
        exemple: "Où vas-tu aujourd'hui ?",
        exemple2: "Bêta Express · VIP · 7 500",
        note: "Remplace Unbounded. Plus chaleureuse, plus lisible en gros sur un écran bas de gamme, et son « a » à queue rappelle les lettres peintes sur les bus.",
      },
      {
        nom: "Texte · Instrument Sans 400 à 700",
        exemple: "Le billet est nominatif. Il comporte un QR code et un code à 4 chiffres.",
        exemple2:
          "Présente-toi au quai 20 minutes avant, avec ta pièce. Un billet déjà scanné est refusé. L'argent du billet va à la compagnie, jamais à AfriMove.",
        note: "Remplace Manrope. Compacte, très nette à 12 et 13 px, donc plus de contenu lisible sur un écran de 390 px sans fatigue.",
      },
      {
        nom: "Chiffres et codes · Geist Mono 500 / 700",
        exemple: "7341",
        exemple2: "08:00 · 482 913 · ALP-DLA-270105-0142",
        note: "Remplace JetBrains Mono. Les chiffres sont larges et bien distincts (1, 7, 0), ce qu'on lit en criant un code au quai ou au téléphone.",
      },
    ],
    couleurs: {
      titre: "Couleurs · inchangées depuis la v2",
      palette: [
        { nom: "Nuit", hex: "#0B1019" },
        { nom: "Surface", hex: "#141B28" },
        { nom: "Surface 2", hex: "#1B2435" },
        { nom: "Trait", hex: "#273247" },
        { nom: "Craie", hex: "#F4F0E8" },
        { nom: "Craie 2", hex: "#B5BDCB" },
        { nom: "Orange · action", hex: "#FF6A1F" },
        { nom: "Ambre · le A", hex: "#FFB547" },
        { nom: "Vert · validé", hex: "#43E39B" },
        { nom: "Rouge · alerte", hex: "#FF5C5C" },
        { nom: "Bleu · info", hex: "#6FA8FF" },
        { nom: "Profond", hex: "#050810" },
      ],
    },
    composants: {
      titre: "Composants · les mêmes sur les 68 écrans",
      actionPrincipale: {
        libelle: "Action principale",
        detail: "toujours en bas, sous le pouce",
        prix: "7 500 F",
      },
      ligneDepart: { heure: "08:00", libelle: "Ligne de départ", places: "9 places", prix: 7500 },
      pastilles: ["DIRECT", "TOUCHE 2", "Payé", "INOPINÉ"],
      sieges: {
        numeros: [1, 3, 7],
        legende: "sièges : pris · libre · toi",
        interrupteur: "interrupteur",
      },
      suivi: { libelle: "Étape en cours · suivi", heure: "10:05" },
      volets: { lettres: ["D", "L", "A"], libelle: "volets de destination, comme sur le logo" },
    },
    regles: {
      titre: "Les 5 règles de la v3",
      liste: [
        {
          titre: "Trois touches maximum",
          texte:
            "pour chaque grande fonction, comptées depuis l'accueil de son rôle. Le compteur « TOUCHE 2 / 3 » est sur l'écran pendant la conception, retiré en production.",
        },
        {
          titre: "Un écran = une décision.",
          texte:
            "Siège et paiement sont sur le même écran. Photo et destinataire aussi. On ne fait jamais défiler pour trouver le bouton.",
        },
        {
          titre: "L'action principale est en bas, en orange,",
          texte: "avec le prix dedans. Les actions secondaires sont des cartes, jamais des menus.",
        },
        {
          titre: "Tout ce qui est en direct pulse en vert",
          texte:
            ": le bus, la synchro, le livreur. Ce qui attend est ambre. Ce qui bloque est rouge.",
        },
        {
          titre: "Tout est livré, tout est masquable.",
          texte:
            "Un module éteint ne laisse pas de bouton grisé. Les 12 modules ont leur interrupteur dans Modules.",
        },
      ],
    },
    contenu: {
      titre: "Ce que la v3 contient",
      lignes: [
        { libelle: "Première ouverture", valeur: "3 écrans" },
        { libelle: "Voyageur", valeur: "26 écrans" },
        { libelle: "Agence (guichet, quai, bus, caisse)", valeur: "12 écrans" },
        { libelle: "Patron et supervision", valeur: "20 écrans" },
        { libelle: "Partenaires", valeur: "4 apps" },
        { libelle: "Salle de contrôle web", valeur: "1 page" },
        { libelle: "Modules livrés le 5 janvier 2027", valeur: "12 / 12" },
        { libelle: "Jingle dans l'écran d'ouverture", valeur: "10 s" },
      ],
      conclusion:
        "Toutes les idées v1 et v2 sont là : covoiturage ville et interurbain, USSD, groupe et cagnotte, proches à l'étranger, relais, livreurs, inter-agences, financement, crédit matériel, paie des équipages, vendeurs ambulants, contrôle inopiné, assistant, salle de contrôle. Ce qui a disparu, c'est la profondeur des menus.",
    },
  },
});
