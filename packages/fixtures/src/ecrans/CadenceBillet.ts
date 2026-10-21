import { ecran } from "../ecran";
import { partageCadence } from "../partage/cadence";

const { depart, billet0232 } = partageCadence;

/** 20b · Cadence, la suite : le billet 0232 imprimé (siège 19, cash 4 000, rendu 1 000), sans nom. */
export const CadenceBillet = ecran({
  planche: "CadenceBillet",
  maintenant: "05:14:52",
  donnees: {
    retour: "CADENCE · 05:14:52",
    vendu: {
      libelle: "Vendu · 1,8 s",
      detail: "billet 0232 · siège 19 · cash 4 000 · rendu 1 000",
      restent: 16,
    },
    billet: {
      _billetId: billet0232.id,
      compagnie: "ALPHA VOYAGES",
      trajet: "DLA → YDE",
      depart: "05:30 · 05.01.27",
      siege: "SIÈGE 19 · CLASSIQUE",
      nom: "NOM : à compléter au quai",
      piece: "PIÈCE : ____ (4 chiffres)",
      code: "9 0 4 7",
      numero: billet0232.numero,
      pied: "Au quai 20 min avant · afrimove.cm",
    },
    fait: {
      titre: "En 2 secondes, l'app a fait",
      lignes: [
        { etape: "Numéroté", detail: "0232, sans trou dans ma plage" },
        { etape: "Siège 19", detail: "bloqué sur le plan du bus" },
        { etape: "Imprimé", detail: "· QR + code 9047" },
        { etape: "Caisse", detail: "+4 000 cash, rendu 1 000" },
        { etape: "SMS", detail: ": pas de numéro ·", action: "+ numéro", suite: "pour l'envoyer" },
        { etape: "Synchro", detail: "au retour du réseau · hors ligne OK" },
      ],
    },
    manque: {
      titre: "Ce qu'il manque encore",
      aide: "complété au quai, à la montée",
      texte:
        "Le nom et les 4 chiffres de la pièce. Le convoyeur scanne le QR ou tape 9047, le client montre sa pièce, le billet devient nominatif. Tant que ce n'est pas fait, le billet apparaît « cadence, sans nom » dans la liste du départ et dans le rapport du soir.",
    },
    actions: ["+ numéro · envoyer le SMS", "Annuler · PIN superviseur"],
    pied: {
      suite: "Voir la suite au quai",
      suivant: { libelle: "Billet suivant", detail: "siège 20 · 4 000" },
    },
  },
  entites: { departs: [depart], billets: [billet0232] },
});
