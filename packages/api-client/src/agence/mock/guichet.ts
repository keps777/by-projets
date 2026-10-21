import type { agence as c } from "@afrimove/contrats";
import { OP_GUICHET_ACCUEIL } from "../operations";
import type { InstallateurPlanche } from "./types";
import {
  capturer,
  groupe,
  guichetAlpha,
  idDepartAlpha,
  iso,
  lire,
  montant,
  personne,
} from "./utilitaires";

/** Planche « Guichet » : `useGuichetAccueil`. */
export const installerGuichet: InstallateurPlanche<"Guichet"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const [compagnie, gare] = d.poste.agence.split(" · ");
  const agent = capturer(
    /^Guichet (\d+) · (.+) · caisse ouverte (\d{2}:\d{2})$/,
    d.poste.agent,
    "l'agent du guichet",
  );
  const rang = Number(groupe(agent, 1));
  const billets = lire(d.compteurs[0], "le compteur de billets");
  const colis = lire(d.compteurs[1], "le compteur de colis");
  const enCaisse = lire(d.compteurs[2], "le compteur de caisse");
  const colisACharger = capturer(/^dont (\d+) à charger$/, colis.detail, "les colis à charger");
  const ecart = capturer(/^écart\s+(.+)$/, enCaisse.detail, "l'écart de caisse");
  const quai = capturer(
    /^(\d{2}:\d{2}) (\S+) · (\d+)\/(\d+) scannés$/,
    lire(d.tuiles[2], "la tuile du quai").detail,
    "le quai",
  );
  const cadence = capturer(
    /file de (\d+)$/,
    lire(d.raccourcis[0], "le raccourci cadence"),
    "la file",
  );
  const prochain = capturer(
    /^Prochain départ dans (\d+) min : (\d{2}:\d{2}) (\S+), (\d+) places\. Le (\d{2}:\d{2}) (\S+) ouvre à la vente\.$/,
    d.prochainDepart,
    "le prochain départ",
  );

  const accueil: c.GuichetAccueil = {
    agence: { compagnie: lire(compagnie, "la compagnie"), gare: lire(gare, "la gare") },
    guichet: {
      ...guichetAlpha(rang),
      agent: personne(groupe(agent, 2)),
      caisseOuverteA: iso(groupe(agent, 3)),
    },
    synchro: { etat: "sync", derniereSyncA: ecran.maintenant, evenementsEnAttente: 0 },
    compteurs: {
      billets: Number(billets.valeur),
      colis: Number(colis.valeur),
      colisACharger: Number(groupe(colisACharger, 1)),
      enCaisse: montant(enCaisse.valeur),
      ecart: montant(groupe(ecart, 1)),
    },
    quai: {
      departId: idDepartAlpha(groupe(quai, 1), groupe(quai, 2)),
      heureDepart: iso(groupe(quai, 1)),
      destination: groupe(quai, 2),
      scannes: Number(groupe(quai, 3)),
      capacite: Number(groupe(quai, 4)),
    },
    cadence: { fileAttente: Number(groupe(cadence, 1)) },
    prochainDepart: {
      departId: idDepartAlpha(groupe(prochain, 2), groupe(prochain, 3)),
      heureDepart: iso(groupe(prochain, 2)),
      destination: groupe(prochain, 3),
      placesLibres: Number(groupe(prochain, 4)),
      dansMinutes: Number(groupe(prochain, 1)),
    },
    prochaineOuverture: {
      departId: idDepartAlpha(groupe(prochain, 5), groupe(prochain, 6)),
      heureDepart: iso(groupe(prochain, 5)),
      destination: groupe(prochain, 6),
    },
  };

  poseur.lecture(OP_GUICHET_ACCUEIL, () => accueil);
};
