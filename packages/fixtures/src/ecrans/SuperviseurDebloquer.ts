import { analyserSequences, plageGuichet, statutAppareil } from "@afrimove/domain";
import { ecran } from "../ecran";
import { heure } from "../horloge";
import { APPAREIL_GU3_DLA } from "../monde";

const MAINTENANT = heure("14:00");

/** Le domaine retrouve les 12 h 40 de la planche : 01:20 → 14:00, au-delà de 12 h, donc bloqué. */
const statut = statutAppareil({
  maintenant: MAINTENANT,
  derniereSyncA: APPAREIL_GU3_DLA.derniereSyncA,
});

/** Les 26 ventes du téléphone GU3 : 2001 à 2026 dans la plage du guichet 3 (2001–2999), sans trou. */
const ventesEnAttente = Array.from({ length: 26 }, (_, i) => 2001 + i);
const analyse = analyserSequences(ventesEnAttente, plageGuichet(3));

/** 28e · Le téléphone du guichet 3 est hors ligne depuis 12 h 40 : le superviseur le débloque avec son PIN. */
export const SuperviseurDebloquer = ecran({
  planche: "SuperviseurDebloquer",
  maintenant: "14:00",
  donnees: {
    titre: "Appareil bloqué",
    detail: "Guichet 3 · téléphone GU3-DLA · hors ligne depuis 12 h 40",
    badge: "BLOQUÉ",
    regle: {
      libelle: "La règle : hors ligne plus de 12 h, le guichet ne vend plus sans ton PIN.",
      detail:
        "Dernière synchronisation hier 01:20. Depuis, 26 ventes et 4 colis sont enregistrés sur le téléphone seulement. Rien n'est perdu, mais le serveur, le patron et les sièges en ligne ne les voient pas encore.",
    },
    enAttente: [
      { libelle: "En attente", valeur: ventesEnAttente.length, detail: "ventes · 4 colis" },
      { libelle: "Cash dessus", valeur: "104 k", detail: "non rapproché" },
      {
        libelle: "Plage",
        valeur: analyse.trous.length === 0 ? "OK" : "trous",
        detail: `${ventesEnAttente[0]}–${ventesEnAttente[ventesEnAttente.length - 1]} sans trou`,
      },
    ],
    pourquoi: {
      titre: "Pourquoi · vérifié par l'app",
      lignes: [
        {
          marque: "!",
          debut: "Routeur 4G de la gare",
          gras: "éteint depuis 01:20",
          suite: "· les guichets 1 et 2 passent par leur SIM",
        },
        { marque: "!", debut: "SIM data du téléphone GU3 :", gras: "crédit épuisé" },
        { debut: "Téléphone sain · batterie 64 % · application à jour" },
      ],
    },
    queFaire: {
      titre: "Que faire · dans l'ordre",
      options: [
        {
          rang: 1,
          titre: "Synchroniser via mon téléphone",
          detail: "partage de connexion · 26 ventes envoyées en 20 s",
          etiquette: "recommandé",
          choisi: true,
        },
        {
          rang: 2,
          titre: "Débloquer 4 h de plus avec mon PIN",
          detail: "si le réseau ne revient pas · tracé, patron prévenu",
        },
        {
          rang: 3,
          titre: "Basculer sur le téléphone de secours",
          detail: "dans le tiroir · Pauline se connecte avec son PIN",
        },
      ],
    },
    rappel: "Recharger la SIM de GU3 et rallumer le routeur : rappel envoyé à l'agent support.",
    actions: {
      plusTard: "Plus tard",
      synchroniser: { libelle: "Synchroniser · mon PIN", detail: "puis le guichet 3 revend" },
    },
    _statutDomaine: statut,
  },
  entites: { appareils: [APPAREIL_GU3_DLA] },
});
