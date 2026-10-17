import { numeroBillet, rendu } from "@afrimove/domain";
import { MONDE } from "@afrimove/fixtures";
import type { agence as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/index";
import {
  ECRITURES,
  OP_CHAUFFEUR_FEUILLE,
  OP_CONTROLE_INOPINE,
  OP_CONVOYEUR_ETAT,
} from "../operations";
import type { InstallateurPlanche } from "./types";
import { capturer, groupe, iso, lire, montant, personne } from "./utilitaires";

function busDe(immatriculation: string): c.BusRef {
  const bus = lire(
    MONDE.bus.find((b) => b.immatriculation === immatriculation),
    `le bus ${immatriculation}`,
  );
  return { id: bus.id, immatriculation: bus.immatriculation };
}

function verifierCash(paiement: c.PaiementAgence, du: number): void {
  if (paiement.mode !== "cash") return;
  try {
    if (rendu(paiement.recu, du) !== paiement.rendu) throw new RangeError("Rendu incorrect");
  } catch (e) {
    throw new ErreurHttp(
      422,
      e instanceof Error ? e.message : "Paiement invalide",
      "PAIEMENT_INVALIDE",
    );
  }
}

/* ------------------------------------------------------------------ Convoyeur */

/** Planche « Convoyeur » : `useConvoyeurEtat`, vente en route, scans, colis, incident. */
export const installerConvoyeur: InstallateurPlanche<"Convoyeur"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const depart0 = lire(ecran.entites.departs?.[0], "le départ du convoyeur");
  const nom = capturer(/^Convoyeur · (.+)$/, d.titre, "le convoyeur");
  const trajet = capturer(/^Bus (.+) · (.+) → (.+) · parti (\d{2}:\d{2})$/, d.trajet, "le trajet");
  const [aBord, libres, enRoute] = d.compteurs;
  const reservees = capturer(
    /^(\d+) réservées (.+)$/,
    lire(libres?.detail, "libres"),
    "les places réservées",
  );
  const ventes = capturer(/vendus · ([\d\s]+)$/, lire(enRoute?.detail, "en route"), "les ventes");
  const venteTrajet = capturer(/^(.+) → (.+)$/, d.vente.trajet, "le trajet de la vente");
  const siege = capturer(/^siège (\d+)/, d.vente.siege, "le siège à vendre");
  const saisie = capturer(/^(.+?) · (.+)$/, d.vente.voyageur, "le voyageur saisi");
  const decharger = capturer(/Colis à décharger · (\d+)/, lire(d.actions[1], "actions"), "colis");
  const liste = capturer(/: (\d+) à bord/, d.pied.liste, "la liste nominative");

  const etat: c.ConvoyeurEtat = {
    convoyeur: personne(groupe(nom, 1)),
    bus: busDe(groupe(trajet, 1)),
    departId: depart0.id,
    trajet: {
      origine: groupe(trajet, 2),
      destination: groupe(trajet, 3),
      partiA: iso(groupe(trajet, 4)),
    },
    reseau: d.reseau === "HORS LIGNE" ? "hors_ligne" : "en_ligne",
    compteurs: {
      scannesABord: lire(aBord?.valeur, "à bord"),
      sieges: {
        libres: lire(libres?.valeur, "libres"),
        reservees: Number(groupe(reservees, 1)),
        arretReservees: groupe(reservees, 2),
      },
      ventesEnRoute: {
        nombre: lire(enRoute?.valeur, "en route"),
        montant: montant(groupe(ventes, 1)),
      },
    },
    vente: {
      arretMontee: groupe(venteTrajet, 1),
      destination: groupe(venteTrajet, 2),
      places: d.vente.places,
      siege: Number(groupe(siege, 1)),
      prix: d.vente.cash.montant,
      modes: ["cash", "momo"],
      saisie: { nom: groupe(saisie, 1), telephone: groupe(saisie, 2) },
    },
    colisADecharger: Number(groupe(decharger, 1)),
    listeNominative: { aBord: Number(groupe(liste, 1)) },
  };

  poseur.lecture(OP_CONVOYEUR_ETAT, () => etat);

  poseur.ecriture(ECRITURES.routeBilletVendu, (evenement) => {
    const v = evenement.donnees;
    if (v.departId !== etat.departId) throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    if (etat.compteurs.sieges.libres <= 0) {
      throw new ErreurHttp(409, "Plus de place libre", "DEPART_COMPLET");
    }
    verifierCash(v.paiement, v.prix);
    etat.compteurs.sieges.libres -= 1;
    etat.compteurs.ventesEnRoute = {
      nombre: etat.compteurs.ventesEnRoute.nombre + 1,
      montant: etat.compteurs.ventesEnRoute.montant + v.prix,
    };
    etat.vente = { ...etat.vente, siege: v.siege + 1, saisie: { nom: "", telephone: null } };
    return {
      billet: {
        billetId: v.billetId,
        numero: numeroBillet({
          agence: "ALP",
          gare: "DLA",
          at: evenement.at,
          sequence: evenement.numeroPlage,
        }),
        siege: v.siege,
        prix: v.prix,
        smsEnvoye: v.passager.telephone !== null,
      },
      ventesEnRoute: etat.compteurs.ventesEnRoute,
    };
  });

  poseur.ecriture(ECRITURES.routeScanne, (evenement) => {
    if (evenement.donnees.departId !== etat.departId) {
      throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    }
    etat.compteurs.scannesABord += 1;
    etat.listeNominative.aBord += 1;
    return { scannesABord: etat.compteurs.scannesABord };
  });

  poseur.ecriture(ECRITURES.routeColisDecharges, (evenement) => {
    const nombre = evenement.donnees.colisIds.length;
    if (nombre > etat.colisADecharger) {
      throw new ErreurHttp(409, "Plus de colis à décharger que prévu", "COLIS_EN_TROP");
    }
    etat.colisADecharger -= nombre;
    return { colisRestants: etat.colisADecharger };
  });

  poseur.ecriture(ECRITURES.chauffeurIncident, () => ({
    voyageursPrevenus: etat.compteurs.scannesABord,
    garePrevenue: true,
  }));
};

/* ------------------------------------------------------------------ Chauffeur */

const CATEGORIES: readonly [string, c.CategorieDepense][] = [
  ["Carburant", "carburant"],
  ["Péage", "peage"],
];

function categorieDe(libelle: string): c.CategorieDepense {
  return CATEGORIES.find(([debut]) => libelle.startsWith(debut))?.[1] ?? "autre";
}

/** Planche « Chauffeur » : `useChauffeurFeuille`, dépenses, incident, retard, arrivée à l'arrêt. */
export const installerChauffeur: InstallateurPlanche<"Chauffeur"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const depart0 = lire(ecran.entites.departs?.[0], "le départ du chauffeur");
  const nom = capturer(/^Chauffeur · (.+)$/, d.titre, "le chauffeur");
  const feuille = capturer(/^(.+) · feuille de route du /, d.feuille, "la feuille de route");
  const trajet = capturer(/^(.+) → (.+)$/, d.trajet.trajet, "le trajet");
  const detail = capturer(
    /^parti (\d{2}:\d{2}) · (\d+) à bord · (\d+) colis · prochain arrêt (.+) (\d{2}:\d{2})$/,
    d.trajet.detail,
    "le détail du trajet",
  );
  const limite = capturer(/limite (\d+)$/, d.trajet.limite, "la limite de vitesse");
  const retard = capturer(/Retard · (\d+) min/, lire(d.incidents[1], "retard").titre, "le retard");
  const paie = capturer(/paie le (\S+)/, d.semaine.sousTitre, "le jour de paie");
  const stat = (libelle: string): number | string =>
    lire(
      d.semaine.stats.find((s) => s.libelle === libelle),
      libelle,
    ).valeur;

  const lignes: c.DepenseTrajet[] = d.depenses.lignes.flatMap((l, i) =>
    typeof l.montant === "number"
      ? [
          {
            depenseId: `depense-${ecran.planche.toLowerCase()}-${i + 1}`,
            categorie: categorieDe(l.libelle),
            libelle: l.libelle,
            montant: l.montant,
            justificatif: (l.justificatif ?? "").includes("✓"),
          },
        ]
      : [],
  );

  const etat: c.ChauffeurFeuille = {
    chauffeur: personne(groupe(nom, 1)),
    bus: busDe(groupe(feuille, 1)),
    jour: ecran.horloge.slice(0, 10),
    gps: d.gps === "GPS",
    trajet: {
      departId: depart0.id,
      origine: groupe(trajet, 1),
      destination: groupe(trajet, 2),
      partiA: iso(groupe(detail, 1)),
      aBord: Number(groupe(detail, 2)),
      colis: Number(groupe(detail, 3)),
      prochainArret: { nom: groupe(detail, 4), heure: iso(groupe(detail, 5)) },
      vitesseKmh: d.trajet.vitesse,
      limiteKmh: Number(groupe(limite, 1)),
    },
    depenses: {
      lignes,
      total: lignes.reduce((somme, l) => somme + l.montant, 0),
      categories: ["carburant", "peage", "autre"],
    },
    incidents: { retardParDefautMinutes: Number(groupe(retard, 1)) },
    semaine: {
      trajets: Number(stat("trajets")),
      km: Number(stat("km")),
      excesVitesse: Number(stat("excès vitesse")),
      aRecevoir: montant(String(stat("à recevoir"))),
      paieLe: groupe(paie, 1) as c.ChauffeurFeuille["semaine"]["paieLe"],
    },
  };

  poseur.lecture(OP_CHAUFFEUR_FEUILLE, () => etat);

  poseur.ecriture(ECRITURES.chauffeurDepense, (evenement) => {
    const v = evenement.donnees;
    if (v.departId !== etat.trajet.departId) {
      throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    }
    const depense: c.DepenseTrajet = {
      depenseId: v.depenseId,
      categorie: v.categorie,
      libelle: v.libelle,
      montant: v.montant,
      justificatif: true,
    };
    etat.depenses.lignes.push(depense);
    etat.depenses.total += v.montant;
    return { depense, totalDepenses: etat.depenses.total };
  });

  const prevenir = () => ({ voyageursPrevenus: etat.trajet.aBord, garePrevenue: true });
  poseur.ecriture(ECRITURES.chauffeurIncident, prevenir);
  poseur.ecriture(ECRITURES.chauffeurRetard, prevenir);
  poseur.ecriture(ECRITURES.chauffeurArriveeArret, (evenement) => {
    if (evenement.donnees.arret !== etat.trajet.prochainArret.nom) {
      throw new ErreurHttp(409, "Ce n'est pas le prochain arrêt", "ARRET_INATTENDU");
    }
    return {};
  });
};

/* ------------------------------------------------------------------ Controleur */

/** Planche « Controleur » : `useControleInopine`, constat par siège, régularisation, clôture. */
export const installerControleur: InstallateurPlanche<"Controleur"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const depart0 = lire(ecran.entites.departs?.[0], "le départ contrôlé");
  const entete = capturer(/^(.+) · contrôleuse \S+ · bus (.+) à (.+)$/, d.detail, "le contrôleur");
  const [liste, comptes, ecart] = d.compteurs;
  const sansBillet0 = capturer(/^Siège (\d+) ·/, d.sansBillet.titre, "le siège sans billet");
  const lieuHeure = capturer(
    /^(.+) · (\d{2}:\d{2})$/,
    d.sansBillet.lieuHeure,
    "le lieu et l'heure",
  );
  const declare = capturer(/payé ([\d\s]+) F au convoyeur/, d.sansBillet.explication, "montant");
  const { total, sansBillet, libres } = ecran.visuel.sieges as {
    total: number;
    sansBillet: number[];
    libres: number[];
  };

  const sieges: c.ControleInopine["sieges"] = Array.from({ length: total }, (_, i) => ({
    numero: i + 1,
    constat: sansBillet.includes(i + 1)
      ? "sans_billet"
      : libres.includes(i + 1)
        ? "libre"
        : "scanne",
  }));

  const etat: c.ControleInopine = {
    controleId: `controle-${groupe(lieuHeure, 1).toLowerCase()}-${groupe(lieuHeure, 2).replace(":", "")}`,
    controleur: personne(groupe(entete, 1)),
    bus: busDe(groupe(entete, 2)),
    departId: depart0.id,
    lieu: groupe(entete, 3),
    at: iso(groupe(lieuHeure, 2)),
    comptes: {
      liste: Number(lire(liste?.valeur, "liste")),
      tetes: Number(lire(comptes?.valeur, "comptés")),
      ecart: montant(String(lire(ecart?.valeur, "écart")).replace("+", "")),
    },
    sieges,
    sansBillet: {
      siege: Number(groupe(sansBillet0, 1)),
      lieu: groupe(lieuHeure, 1),
      at: iso(groupe(lieuHeure, 2)),
      montantDeclare: montant(groupe(declare, 1)),
      venteEnRouteTrouvee: !d.sansBillet.explication.includes("Aucune vente en route"),
    },
  };
  let clos = false;

  const resume = (envoye = false): c.ResultatControle["controle"] => ({
    controleId: etat.controleId,
    comptes: { ...etat.comptes },
    clos,
    envoyeAuPatron: envoye,
  });
  const verifier = (controleId: string): void => {
    if (controleId !== etat.controleId) {
      throw new ErreurHttp(404, "Contrôle inconnu", "CONTROLE_INCONNU");
    }
    if (clos) throw new ErreurHttp(409, "Contrôle déjà clos", "CONTROLE_CLOS");
  };

  poseur.lecture(OP_CONTROLE_INOPINE, () => etat);

  poseur.ecriture(ECRITURES.controleSiegeVerifie, (evenement) => {
    const v = evenement.donnees;
    verifier(v.controleId);
    const siege = etat.sieges.find((s) => s.numero === v.siege);
    if (!siege) throw new ErreurHttp(404, "Siège inconnu", "SIEGE_INCONNU");
    siege.constat = v.constat;
    return { controle: resume() };
  });

  poseur.ecriture(ECRITURES.controleRegularise, (evenement) => {
    const v = evenement.donnees;
    verifier(v.controleId);
    if (!etat.sansBillet || etat.sansBillet.siege !== v.siege) {
      throw new ErreurHttp(409, "Aucun voyageur sans billet à ce siège", "SANS_BILLET_ABSENT");
    }
    verifierCash(v.paiement, v.prix);
    const siege = etat.sieges.find((s) => s.numero === v.siege);
    if (siege) siege.constat = "scanne";
    etat.sansBillet = null;
    etat.comptes.liste += 1;
    etat.comptes.ecart = etat.comptes.tetes - etat.comptes.liste;
    return {
      controle: resume(),
      billet: {
        billetId: v.billetId,
        numero: numeroBillet({
          agence: "ALP",
          gare: "DLA",
          at: evenement.at,
          sequence: evenement.numeroPlage,
        }),
        prix: v.prix,
      },
    };
  });

  poseur.ecriture(ECRITURES.controleConvoyeurSignale, (evenement) => {
    verifier(evenement.donnees.controleId);
    return { controle: resume() };
  });

  poseur.ecriture(ECRITURES.controleCloture, (evenement) => {
    verifier(evenement.donnees.controleId);
    clos = true;
    return { controle: resume(true) };
  });
};
