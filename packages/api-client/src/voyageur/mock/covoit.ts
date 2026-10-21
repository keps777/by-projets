import { BLOCAGE_SIEGE_MINUTES, devisCovoit } from "@afrimove/domain";
import type { voyageur as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer } from "../../infra/scenarios";
import type { ImplementationMock } from "../../infra/scenarios";
import {
  OP_DEFINIR_TRAJET_REGULIER,
  OP_FORMULAIRE_PUBLICATION,
  OP_MES_TRAJETS_COVOIT,
  OP_PROPOSER_A_DEMANDE,
  OP_PUBLIER_TRAJET,
  OP_RECHERCHER_COVOIT,
  OP_RESERVER_COVOIT,
  OP_TRAJET_REGULIER,
} from "../operationsServices";
import { OP_RECHERCHER_VILLE } from "../operations";
import { offreVille } from "./departs";
import {
  donneesDe,
  dureeEnMinutes,
  entier,
  isoA,
  jourDe,
  plusMinutes,
  prochainJourSemaine,
  slug,
} from "./outils";
import type { EcranSource } from "./outils";

const compteur = (prefixe: string): (() => string) => {
  let n = 0;
  return () => `${prefixe}-${++n}`;
};

const noteDe = (texte: string): number | undefined => {
  const m = /(\d),(\d) ★/.exec(texte);
  return m ? Number(`${m[1]}.${m[2]}`) : undefined;
};

/** Le conducteur des planches de covoiturage interurbain : Samuel E. (monde commun, `pers-samuel-e`). */
const ID_SAMUEL = "pers-samuel-e";

/* ------------------------------------------------------------------ Covoit : passager */

export function mockCovoit(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Covoit");
  const jour = jourDe(source.maintenant);

  const offres: c.OffreCovoit[] = d.offres.map((o, i) => {
    const complet = o.depart !== undefined;
    const parts = o.vehicule.split(" · ");
    const commence = /^\d{2}:\d{2}$/.test(parts[0] ?? "");
    const heure = o.heure ?? parts[0] ?? "00:00";
    const sansHeure = commence ? parts.slice(1) : parts;
    const [lieu, vehicule] = commence ? [sansHeure[0], sansHeure[1]] : [undefined, sansHeure[0]];
    const places = parts.find((x) => /place/.test(x)) ?? "0 place";
    const departA = isoA(jour, heure);
    const nom = o.conducteur;
    const trajets = /(\d+) trajets/.exec(o.reputation)?.[1];
    const lieuDepart = o.depart ? o.depart.replace(/^Départ\s+/, "").split(" · ")[0] : lieu;
    const duree = / · (\d+ h(?: \d+)?)$/.exec(o.depart ?? "")?.[1];
    const arrivee = /Arrivée (.+?) vers (\d{2}:\d{2})/.exec(o.arrivee ?? "");
    const arrets = /(\d+) arrêts? possibles?/.exec(o.arrivee ?? "")?.[1];
    const note = noteDe(o.reputation);
    return {
      id: `covoit-${slug(nom)}-${heure.replace(":", "")}`,
      conducteur: {
        id: i === 0 ? ID_SAMUEL : `conducteur-${slug(nom)}`,
        nom,
        initiales: o.initiales,
        verifie: /vérifi/.test(o.reputation),
        ...(note !== undefined ? { note } : {}),
        ...(trajets ? { trajets: Number(trajets) } : {}),
      },
      vehicule: vehicule ?? "",
      ...(complet ? { immatriculation: parts[1] } : {}),
      clim: parts.includes("clim"),
      femmesBienvenues: /femmes bienvenues/.test(o.vehicule),
      grandBagage: /grand bagage/.test(o.vehicule),
      placesLibres: entier(places),
      prixParPlace: o.prix,
      departA,
      ...(lieuDepart ? { lieuDepart } : { lieuDepart: "" }),
      ...(duree ? { dureeMinutes: dureeEnMinutes(duree) } : {}),
      ...(arrivee
        ? { arriveeEstimee: isoA(jour, arrivee[2] ?? "00:00"), lieuArrivee: arrivee[1] }
        : {}),
      ...(arrets ? { arretsPossibles: Number(arrets) } : {}),
      ...(o.garantie ? { garantie: o.garantie } : {}),
    };
  });

  const idCommande = compteur("cmd-covoit");
  return [
    implementer(
      OP_RECHERCHER_COVOIT,
      (p): c.ResultatRechercheCovoit => ({
        maintenant: source.maintenant,
        ville: d.ville,
        depart: d.trajet.depart,
        arrivee: d.trajet.arrivee,
        offres: offres.filter(
          (o) =>
            (!p.filtres?.includes("clim") || o.clim) &&
            (!p.filtres?.includes("femmes") || o.femmesBienvenues) &&
            (!p.filtres?.includes("grand_bagage") || o.grandBagage) &&
            (p.prixMax === undefined || o.prixParPlace <= p.prixMax),
        ),
        note: d.note,
      }),
    ),
    implementer(OP_RESERVER_COVOIT, (p, ctx): c.Commande => {
      const offre = offres.find((o) => o.id === p.offreId);
      if (!offre) throw new ErreurHttp(404, "Offre de covoiturage inconnue", "offre_inconnue");
      if (p.places > offre.placesLibres) {
        throw new ErreurHttp(409, "Pas assez de places", "places_insuffisantes");
      }
      const devis = devisCovoit(offre.prixParPlace, p.places);
      const maintenant = ctx.horloge.iso();
      return {
        id: idCommande(),
        type: "covoiturage",
        libelle: `Covoiturage ${offre.conducteur.nom.replace(/ [A-Z]\.$/, "")} · ${d.trajet.depart} → ${d.trajet.arrivee} · ${offre.departA.slice(11, 16)}`,
        lignes: devis.lignes,
        total: devis.total,
        statut: "en_attente_paiement",
        creeeA: maintenant,
        expireA: plusMinutes(maintenant, BLOCAGE_SIEGE_MINUTES),
        billetIds: [],
      };
    }),
  ];
}

/* ------------------------------------------------------------------ CovoitVille : passager en ville */

export function mockCovoitVille(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "CovoitVille");
  const offres: c.OffreVille[] = d.maintenant.offres.map((o, i) => {
    const parts = o.qui.split(" · ");
    const base = offreVille(source, i, {
      delai: parts[parts.length - 1] ?? "0 min",
      type: parts.length > 2 ? (parts[1] ?? "") : "covoiturage",
      qui: parts[0] ?? o.qui,
      detail: o.detail,
      reputation: o.reputation,
    });
    return { ...base, prix: o.prix };
  });

  let regulier: c.TrajetRegulier = {
    libelle: d.trajetDuMatin.titre,
    departA: /(\d{2}:\d{2})$/.exec(d.trajetDuMatin.titre)?.[1] ?? "07:00",
    actif: d.trajetDuMatin.actif,
    explication: d.trajetDuMatin.explication,
  };
  const resultat: c.ResultatRechercheVille = {
    maintenant: source.maintenant,
    ville: { nom: d.ville.split(" · ")[0] ?? d.ville, detectee: /détectée/.test(d.ville) },
    itineraire: {
      depart: d.itineraire.depart.replace(/ · ma position$/, ""),
      arrivee: d.itineraire.arrivee,
      departSurMaPosition: /ma position/.test(d.itineraire.depart),
      distanceKm: entier(d.itineraire.detail),
    },
    quand: "maintenant",
    offres,
    trajetDuMatin: regulier,
  };
  return [
    implementer(OP_RECHERCHER_VILLE, (p) => ({
      ...resultat,
      trajetDuMatin: regulier,
      offres:
        p.types && p.types.length > 0 ? offres.filter((o) => p.types?.includes(o.type)) : offres,
    })),
    implementer(OP_TRAJET_REGULIER, () => regulier),
    implementer(OP_DEFINIR_TRAJET_REGULIER, (p) => {
      regulier = { ...regulier, actif: p.actif };
      return regulier;
    }),
  ];
}

/* ------------------------------------------------------------------ CovoitConducteur : mes trajets */

/** « sam. » + « 08:30 » → ISO du prochain samedi à 08:30. */
function departDuJour(jourSemaine: string, hhmm: string, maintenant: string): string {
  return isoA(prochainJourSemaine(jourSemaine, maintenant) ?? jourDe(maintenant), hhmm);
}

export function mockCovoitConducteur(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "CovoitConducteur");
  const nom = d.conducteur.split(" · ")[0] ?? "";
  const conducteur: c.ConducteurCovoit = {
    id: ID_SAMUEL,
    nom,
    initiales: nom.slice(0, 2).toUpperCase(),
    verifie: /vérifi/.test(d.conducteur),
    ...(noteDe(d.conducteur) !== undefined ? { note: noteDe(d.conducteur) } : {}),
    trajets: Number(d.resume[1]?.valeur ?? 0),
  };

  const publies: c.TrajetPublie[] = d.publies.trajets.map((t, i) => {
    const [route = "", placesTexte = ""] = t.trajet.split(" · ");
    const [depart = "", arrivee = ""] = route.split(" → ");
    const reservee = entier(t.reservation ?? t.detail);
    const paiement = /· ([^·]+?) · payée (\d[\d\s]*)/.exec(t.detail);
    const visible = /visible par (\d+)/.exec(t.detail)?.[1];
    return {
      id: `trajet-${i + 1}`,
      departA: departDuJour(t.jour, t.heure, source.maintenant),
      depart,
      arrivee,
      places: entier(placesTexte),
      placesReservees: reservee,
      ...(paiement ? { prixParPlace: entier(paiement[2] ?? "0") } : {}),
      reservations: paiement
        ? [{ passager: paiement[1] ?? "", places: 1, montantPaye: entier(paiement[2] ?? "0") }]
        : [],
      ...(visible ? { visiblePar: Number(visible) } : {}),
    };
  });

  let demandes: c.DemandePassager[] = d.demandes.liste.map((x, i) => {
    const [route = "", quand = "", places = "1 place"] = x.detail.replace(/^·\s*/, "").split(" · ");
    const [depart = "", arrivee = ""] = route.split(" → ");
    const heure = /(\d{2}:\d{2})/.exec(x.action)?.[1] ?? "00:00";
    const note = x.note ? noteDe(x.note) : undefined;
    return {
      id: `demande-${i + 1}`,
      passager: x.passager,
      ...(note !== undefined ? { note } : {}),
      depart,
      arrivee,
      quand,
      places: entier(places),
      trajetPropose: publies.find((t) => t.departA.slice(11, 16) === heure)?.id ?? "",
      heurePropose: heure,
    };
  });

  const fraisParPlace = entier(/garde (\d[\d\s]*) F par place/.exec(d.paiement)?.[1] ?? "0");
  const gain = d.resume[0]?.valeur;
  const lesPublies = [...publies];
  const idTrajet = compteur("trajet-publie");

  return [
    implementer(
      OP_MES_TRAJETS_COVOIT,
      (): c.MesTrajetsCovoit => ({
        conducteur,
        resume: {
          gainSemaine: typeof gain === "number" ? gain : 0,
          trajets: Number(d.resume[1]?.valeur ?? 0),
          annulations: entier(d.resume[1]?.detail ?? "0"),
          piecesOk: d.resume[2]?.valeur === "OK",
        },
        publies: lesPublies,
        demandes,
        fraisParPlace,
      }),
    ),
    implementer(OP_PUBLIER_TRAJET, (p): c.TrajetPublie => {
      const trajet: c.TrajetPublie = {
        id: idTrajet(),
        departA: p.departA,
        depart: p.depart.ville,
        arrivee: p.arrivee.ville,
        places: p.places,
        placesReservees: 0,
        prixParPlace: p.prixParPlace,
        reservations: [],
      };
      lesPublies.push(trajet);
      return trajet;
    }),
    implementer(OP_PROPOSER_A_DEMANDE, (p): c.ResultatProposition => {
      if (!demandes.some((x) => x.id === p.demandeId)) {
        throw new ErreurHttp(404, "Demande inconnue", "demande_inconnue");
      }
      demandes = demandes.filter((x) => x.id !== p.demandeId);
      return { demandeId: p.demandeId, trajetId: p.trajetId, envoyee: true };
    }),
  ];
}

/* ------------------------------------------------------------------ Conducteur : proposer mon trajet */

export function mockConducteur(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Conducteur");
  const [nom = "", , vehicule = "", immatriculation = ""] = d.conducteur.split(" · ");
  const [jourSemaine = "", hhmm = "00:00"] = d.trajet.quand.split(" · ");
  const conseil = /(\d[\d\s]*) à (\d[\d\s]*)/.exec(d.conseil);
  const trajets = entier(/Tes (\d+) trajets/.exec(d.reputation.titre)?.[1] ?? "0");
  const note = noteDe(d.reputation.titre) ?? 0;
  const idTrajet = compteur("trajet-publie");

  const formulaire: c.FormulairePublication = {
    conducteur: {
      id: ID_SAMUEL,
      nom,
      initiales: nom.slice(0, 2).toUpperCase(),
      verifie: /vérifi/.test(d.conducteur),
      note,
      trajets,
    },
    vehicule,
    immatriculation,
    depart: { ville: d.trajet.depart, point: d.champs.depart.valeur },
    arrivee: { ville: d.trajet.arrivee, point: d.champs.arrivee.valeur },
    departA: departDuJour(jourSemaine, hhmm, source.maintenant),
    places: { choix: [...d.places.choix], choisi: d.places.choisi },
    prixParPlace: d.prix.valeur,
    prixConseille: { min: entier(conseil?.[1] ?? "0"), max: entier(conseil?.[2] ?? "0") },
    fraisParPlace: entier(/garde (\d[\d\s]*) F par place/.exec(d.reputation.paiement)?.[1] ?? "0"),
    options: d.options.map((o) => ({
      code: slug(o.libelle.replace(/✓/g, "")),
      libelle: o.libelle.replace(/\s*✓$/, ""),
      actif: o.actif,
    })),
    reputation: {
      trajets,
      note,
      piecesVerifiees: d.reputation.detail
        .replace(/ vérifiés?$/, "")
        .split(/,\s*/)
        .filter(Boolean),
    },
  };

  return [
    implementer(OP_FORMULAIRE_PUBLICATION, () => formulaire),
    implementer(
      OP_PUBLIER_TRAJET,
      (p): c.TrajetPublie => ({
        id: idTrajet(),
        departA: p.departA,
        depart: p.depart.ville,
        arrivee: p.arrivee.ville,
        places: p.places,
        placesReservees: 0,
        prixParPlace: p.prixParPlace,
        reservations: [],
      }),
    ),
  ];
}
