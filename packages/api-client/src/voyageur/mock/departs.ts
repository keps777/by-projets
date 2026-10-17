import {
  BLOCAGE_SIEGE_MINUTES,
  decisionAnnulation,
  limiteAnnulationGratuite,
  numeroDepart,
} from "@afrimove/domain";
import type { voyageur as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer, simulerFlux } from "../../infra/scenarios";
import type { ImplementationMock, FluxMock } from "../../infra/scenarios";
import {
  CANAL_PLAN_SIEGES,
  CANAL_STATUT_PAIEMENT,
  OP_ANNULER_BILLET,
  OP_APERCU_ANNULATION,
  OP_BILLET,
  OP_BLOQUER_SIEGE,
  OP_COMMANDE,
  OP_CREER_COMMANDE,
  OP_DEFINIR_PREFEREE,
  OP_DETAIL_DEPART,
  OP_DEVIS,
  OP_ENREGISTRER_FILTRES,
  OP_LIEN_PROCHE,
  OP_MOYENS_PAIEMENT,
  OP_OPTIONS_FILTRES,
  OP_PAYER_COMMANDE,
  OP_PLAN_SIEGES,
  OP_PROCHES,
  OP_PROFIL,
  OP_RECHERCHER_DEPARTS,
  OP_RECHERCHER_VILLE,
  OP_REPORTER_BILLET,
  OP_STATUT_PAIEMENT,
} from "../operations";
import { profilAicha } from "./compte";
import {
  AICHA,
  CODES_VILLES,
  dateFr,
  donneesDe,
  dureeEnMinutes,
  entier,
  entitesDe,
  idCompagnie,
  initiales,
  isoA,
  jourDe,
  minutesEntre,
  plusMinutes,
  slug,
  telephone,
  ville,
} from "./outils";
import type { EcranSource } from "./outils";

const classeDe = (texte: string): c.Classe => (/vip/i.test(texte) ? "vip" : "classique");

function profilDeNom(nomComplet: string, tel: string): c.Profil {
  const [prenom = AICHA.prenom, ...reste] = nomComplet.split(" ");
  return {
    ...profilAicha(),
    prenom,
    nom: reste.join(" "),
    initiales: initiales(nomComplet),
    telephone: telephone(tel),
  };
}

/* ------------------------------------------------------------------ Main : accueil, entre villes */

function filtrerDeparts(
  departs: readonly c.DepartVoyageur[],
  f: c.FiltresDeparts = {},
): c.DepartVoyageur[] {
  return departs.filter(
    (d) =>
      (!f.classe || f.classe === "toutes" || d.classe === f.classe) &&
      (!f.compagnies || f.compagnies.length === 0 || f.compagnies.includes(d.compagnie.id)) &&
      (f.prixMax === undefined || d.prix <= f.prixMax) &&
      (!f.matinSeulement || d.heureDepart.slice(11, 13) < "12"),
  );
}

export function mockMain(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Main");
  const entites = entitesDe(source, "Main");
  const jour = jourDe(source.maintenant);

  const departs: c.DepartVoyageur[] = d.liste.departs.map((x) => {
    const entite = entites.departs?.find((e) => e.id === x._departId);
    const places = entier(x.places);
    return {
      id: x._departId,
      numero: entite?.numero ?? x._departId,
      compagnie: { id: idCompagnie(x.compagnie), nom: x.compagnie },
      classe: classeDe(x.classe),
      heureDepart: entite?.heureDepart ?? isoA(jour, x.heure),
      prix: x.prix,
      placesLibres: places,
      presqueComplet: /plus que/.test(x.places) || places <= 3,
    };
  });

  const [detailCovoit1 = "", places = "0 places", vehicule = ""] =
    d.liste.covoit.detail.split(" · ");
  const covoits: c.CovoitDansListe[] = [
    {
      id: `covoit-${slug(d.liste.covoit.conducteur.split(" · ")[0] ?? "")}-${d.liste.covoit.heure.replace(":", "")}`,
      heureDepart: isoA(jour, d.liste.covoit.heure),
      conducteur: d.liste.covoit.conducteur.split(" · ")[0] ?? d.liste.covoit.conducteur,
      verifie: /vérifi/.test(d.liste.covoit.conducteur),
      lieuDepart: detailCovoit1,
      placesLibres: entier(places),
      vehicule,
      prixParPlace: d.liste.covoit.prix,
    },
  ];

  const position = /Tu es à (.+?) · (.+?) → (.+)$/.exec(d.trajet.position);
  const totaux = /(\d+) bus et (\d+) covoiturages/.exec(d.liste.reseau);
  const compagnies = /(\d+) compagnies/.exec(d.filtre.resume);
  const resume: c.ResultatRechercheDeparts = {
    maintenant: source.maintenant,
    depart: { code: d.trajet.depart.code, nom: d.trajet.depart.ville },
    arrivee: { code: d.trajet.arrivee.code, nom: d.trajet.arrivee.ville },
    ...(position
      ? {
          position: {
            ville: position[1] ?? "",
            gareDepart: position[2] ?? "",
            gareArrivee: position[3] ?? "",
          },
        }
      : {}),
    jour,
    filtres: {
      classe: /Toutes classes/.test(d.filtre.resume) ? "toutes" : "toutes",
      compagnies: Number(compagnies?.[1] ?? 0),
      preferees: entier(d.filtre.preferees),
    },
    departs,
    covoits,
    totaux: { bus: Number(totaux?.[1] ?? departs.length), covoiturages: Number(totaux?.[2] ?? 0) },
    notificationColis: {
      colisId: d.notificationColis._colisId,
      titre: d.notificationColis.titre,
      detail: d.notificationColis.detail,
    },
  };

  return [
    implementer(OP_PROFIL, () => ({
      ...profilAicha(),
      prenom: d.salutation.replace(/^Bonjour\s+/, ""),
    })),
    implementer(OP_RECHERCHER_DEPARTS, (p) => ({
      ...resume,
      departs: filtrerDeparts(departs, p.filtres),
    })),
  ];
}

/* ------------------------------------------------------------------ MainVille et CovoitVille */

const QUAND: readonly c.Quand[] = ["maintenant", "dans_1h", "chaque_matin"];

export function typeOffreVille(texte: string): c.TypeOffreVille {
  if (/moto/i.test(texte)) return "moto_taxi";
  if (/bus/i.test(texte)) return "bus_ville";
  return "covoiturage";
}

/** « 3 min », « dans 3 min » ou « 07:50 » → instant ISO. */
function instantDepart(delai: string, source: EcranSource): string {
  const hhmm = /(\d{2}:\d{2})/.exec(delai)?.[1];
  if (hhmm) return isoA(jourDe(source.maintenant), hhmm);
  return plusMinutes(source.maintenant, entier(delai));
}

export function offreVille(
  source: EcranSource,
  i: number,
  o: { delai: string; type: string; qui: string; detail: string; reputation?: string },
): c.OffreVille {
  const departA = instantDepart(o.delai, source);
  const type = typeOffreVille(o.type);
  const note = /(\d),(\d) ★/.exec(`${o.detail} ${o.reputation ?? ""}`);
  const duree = /(?:^|· )(\d+) min(?: de trajet)?(?: ·|$)/.exec(o.detail);
  const places = /(\d+) places?/.exec(o.detail);
  return {
    id: `offre-ville-${i + 1}-${slug(o.qui)}`,
    type,
    departA,
    departDansMinutes: Math.max(0, minutesEntre(departA, source.maintenant)),
    qui: type === "bus_ville" ? o.qui : (o.qui.split(" · ")[0] ?? o.qui),
    verifie: /vérifi/.test(`${o.qui} ${o.reputation ?? ""}`),
    ...(note ? { note: Number(`${note[1]}.${note[2]}`) } : {}),
    detail: o.detail,
    ...(duree ? { dureeMinutes: Number(duree[1]) } : {}),
    ...(places ? { placesLibres: Number(places[1]) } : {}),
    prix: 0,
  };
}

export function mockMainVille(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "MainVille");
  const offres = d.liste.offres.map((o, i) => ({
    ...offreVille(source, i, o),
    prix: o.prix,
  }));
  const resultat: c.ResultatRechercheVille = {
    maintenant: source.maintenant,
    ville: { nom: d.ville.nom, detectee: /détectée/.test(d.ville.detection) },
    itineraire: {
      depart: d.itineraire.depart.replace(/ · ma position$/, ""),
      arrivee: d.itineraire.arrivee,
      departSurMaPosition: /ma position/.test(d.itineraire.depart),
      distanceKm: entier(/(\d+) km/.exec(d.liste.resume)?.[1] ?? "0"),
    },
    quand: QUAND[d.quand.indexOf(d.quandActif)] ?? "maintenant",
    offres,
  };
  return [
    implementer(OP_PROFIL, () => ({
      ...profilAicha(),
      prenom: d.salutation.replace(/^Bonjour\s+/, ""),
    })),
    implementer(OP_RECHERCHER_VILLE, (p) => ({
      ...resultat,
      offres:
        p.types && p.types.length > 0 ? offres.filter((o) => p.types?.includes(o.type)) : offres,
    })),
  ];
}

/* ------------------------------------------------------------------ MainFiltres */

const CLASSES_FILTRE: Readonly<Record<string, c.OptionsFiltres["classeActive"]>> = {
  Toutes: "toutes",
  "VIP · clim": "vip",
  Classique: "classique",
};

export function mockMainFiltres(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "MainFiltres");
  const jour = jourDe(source.maintenant);
  const preferees = new Map(d.compagnies.liste.map((x) => [idCompagnie(x.nom), x.preferee]));
  const options = (): c.OptionsFiltres => ({
    depart: ville(d.trajet.depart),
    arrivee: ville(d.trajet.arrivee),
    jour,
    classes: d.classe.options.map((libelle) => ({
      valeur: CLASSES_FILTRE[libelle] ?? "toutes",
      libelle,
    })),
    classeActive: CLASSES_FILTRE[d.classe.active] ?? "toutes",
    compagnies: d.compagnies.liste.map((x) => ({
      id: idCompagnie(x.nom),
      nom: x.nom,
      ...("etiquette" in x && x.etiquette ? { etiquette: x.etiquette } : {}),
      departs: entier(x.departs),
      coche: x.coche,
      preferee: preferees.get(idCompagnie(x.nom)) ?? false,
    })),
    totalDeparts: entier(d.compagnies.toutes.departs),
    aussi: d.aussi.options.map((libelle) => ({
      code: slug(libelle.replace(/[✓≤]/g, "")),
      libelle: libelle.replace(/\s*✓$/, ""),
      actif: libelle.endsWith("✓"),
    })),
  });
  return [
    implementer(OP_PROFIL, () => ({
      ...profilAicha(),
      prenom: d.salutation.replace(/^Bonjour\s+/, ""),
    })),
    implementer(OP_OPTIONS_FILTRES, () => options()),
    implementer(OP_ENREGISTRER_FILTRES, () => ({ enregistre: true })),
    implementer(OP_DEFINIR_PREFEREE, (p) => {
      preferees.set(p.compagnieId, p.preferee);
      return { compagnieId: p.compagnieId, preferee: p.preferee };
    }),
  ];
}

/* ------------------------------------------------------------------ SiegePay : siège + paiement */

function moyensDe(
  moyens: ReadonlyArray<{ nom: string; sigle?: string; detail?: string; choisi?: boolean }>,
  choisi?: string,
): c.MoyenPaiementVue[] {
  const code = (nom: string): c.MoyenPaiement =>
    /mtn/i.test(nom)
      ? "mtn_momo"
      : /orange/i.test(nom)
        ? "orange_money"
        : /carte/i.test(nom)
          ? "carte"
          : "proche";
  return moyens.map((m) => ({
    code: code(m.nom),
    nom: m.nom,
    ...(m.sigle ? { sigle: m.sigle } : {}),
    ...(m.detail ? { detail: m.detail } : {}),
    choisi: choisi ? m.nom === choisi : (m.choisi ?? false),
  }));
}

/** Générateur d'identifiants de commande propre à un client (état neuf par `charger`). */
function compteur(prefixe: string): () => string {
  let n = 0;
  return () => `${prefixe}-${++n}`;
}

export function mockSiegePay(source: EcranSource): {
  operations: ImplementationMock[];
  flux: FluxMock[];
} {
  const d = donneesDe(source, "SiegePay");
  const entites = entitesDe(source, "SiegePay");
  const entite = entites.departs?.[0];
  const departId = entite?.id ?? "dep-siegepay";
  const [nomCompagnie = "", classeTexte = ""] = d.compagnie.split(" · ");
  const classe = classeDe(classeTexte);
  const jour = jourDe(source.maintenant);
  const prix = d.recapitulatif.billet.montant;
  const placesLibres = entier(d.plan.libres);
  const depart: c.DepartVoyageur = {
    id: departId,
    numero: entite?.numero ?? departId,
    compagnie: { id: idCompagnie(nomCompagnie), nom: nomCompagnie },
    classe,
    heureDepart: entite?.heureDepart ?? isoA(jour, d.trajet.heure),
    prix,
    placesLibres,
    presqueComplet: placesLibres <= 3,
  };
  const villeDe = (gare: string): c.Ville => ville(gare.split(" ")[0] ?? gare);

  // État des sièges de ce client : le siège « choisi » de la planche est bloqué pour moi.
  const sieges = new Map<number, c.EtatSiegeVue>(
    d.plan.sieges.map((s) => [
      s.numero,
      s.etat === "choisi" ? "a_moi" : (s.etat as c.EtatSiegeVue),
    ]),
  );
  let version = 1;
  let monBlocage: c.BlocageSiege | undefined = {
    departId,
    siege: d.plan.choix.numero,
    jusqua: plusMinutes(source.maintenant, BLOCAGE_SIEGE_MINUTES),
  };
  const plan = (): c.PlanSiegesVue => {
    const vue = [...sieges.entries()].map(([numero, etat]) => ({
      numero,
      etat,
      ...(numero === d.plan.choix.numero ? { emplacement: d.plan.choix.description } : {}),
    }));
    return {
      departId,
      capacite: vue.length,
      sieges: vue,
      libres: vue.filter((s) => s.etat === "libre" || s.etat === "a_moi").length,
      ...(monBlocage ? { mon: monBlocage } : {}),
      versionPlan: version,
    };
  };

  const devis = (): c.Devis => {
    const offert = /avec (\w+)/.exec(d.recapitulatif.frais.offert)?.[1];
    const lignes: c.LigneDevis[] = [
      {
        code: "billet",
        libelle: d.recapitulatif.billet.libelle,
        montant: d.recapitulatif.billet.montant,
      },
      {
        code: "frais_voyageur",
        libelle: d.recapitulatif.frais.libelle,
        montant: d.recapitulatif.frais.montant,
        montantBarre: d.recapitulatif.frais.montantBarre,
        ...(offert ? { offertAvec: offert } : {}),
      },
    ];
    return { lignes, total: lignes.reduce((t, l) => t + l.montant, 0) };
  };

  const idCommande = compteur("cmd");
  const flux: FluxMock[] = [
    simulerFlux(CANAL_PLAN_SIEGES, (p, ctx) => {
      ctx.emettre({ type: "plan", plan: plan() });
      // Un autre voyageur prend le siège 3 une demi-minute plus tard : le plan se met à jour seul.
      ctx.planifier(30_000, () => {
        if (sieges.get(3) !== "libre") return;
        sieges.set(3, "pris");
        version += 1;
        ctx.emettre({
          type: "siege",
          departId: p.departId,
          siege: 3,
          etat: "pris",
          versionPlan: version,
        });
      });
    }),
  ];

  const operations = [
    implementer(OP_PROFIL, () => profilDeNom(d.voyageur.nom, d.voyageur.telephone)),
    implementer(
      OP_DETAIL_DEPART,
      (): c.DetailDepart => ({
        depart,
        origine: { ville: villeDe(d.trajet.origine), gare: d.trajet.origine },
        destination: { ville: villeDe(d.trajet.destination), gare: d.trajet.destination },
        dureeMinutes: dureeEnMinutes(d.trajet.duree),
        blocageMinutes: BLOCAGE_SIEGE_MINUTES,
      }),
    ),
    implementer(OP_PLAN_SIEGES, () => plan()),
    implementer(OP_BLOQUER_SIEGE, (p, ctx): c.BlocageSiege => {
      const etat = sieges.get(p.siege);
      if (etat === undefined)
        throw new ErreurHttp(404, `Siège ${p.siege} inexistant`, "siege_inexistant");
      if (etat === "pris" || etat === "bloque") {
        throw new ErreurHttp(409, `Siège ${p.siege} indisponible`, "siege_indisponible");
      }
      if (monBlocage && monBlocage.siege !== p.siege) sieges.set(monBlocage.siege, "libre");
      sieges.set(p.siege, "a_moi");
      version += 1;
      monBlocage = {
        departId: p.departId,
        siege: p.siege,
        jusqua: plusMinutes(ctx.horloge.iso(), BLOCAGE_SIEGE_MINUTES),
      };
      return monBlocage;
    }),
    implementer(OP_MOYENS_PAIEMENT, () =>
      moyensDe(
        d.moyens.map((nom) => ({
          nom,
          ...(nom === d.moyenChoisi ? { detail: telephone(d.voyageur.telephone) } : {}),
        })),
        d.moyenChoisi,
      ),
    ),
    implementer(OP_DEVIS, () => devis()),
    implementer(OP_CREER_COMMANDE, (p, ctx): c.Commande => {
      const maintenant = ctx.horloge.iso();
      const lignes = devis().lignes;
      return {
        id: idCommande(),
        type: p.pour === "proche" ? "proche" : "billet",
        libelle: `Billet ${nomCompagnie} ${classeTexte}`,
        lignes,
        total: lignes.reduce((t, l) => t + l.montant, 0),
        statut: "en_attente_paiement",
        creeeA: maintenant,
        expireA: plusMinutes(maintenant, BLOCAGE_SIEGE_MINUTES),
        billetIds: [],
      };
    }),
  ];
  return { operations, flux };
}

/* ------------------------------------------------------------------ Pass : le billet */

export function mockPass(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Pass");
  const entites = entitesDe(source, "Pass");
  const entiteDepart = entites.departs?.[0];
  const entiteBillet = entites.billets?.[0];
  const jour = jourDe(source.maintenant);
  const b = d.billet;
  const heureDepart = entiteDepart?.heureDepart ?? isoA(jour, b.depart);
  const gratuiteJusqua = isoA(
    jourDe(heureDepart),
    /jusqu'à (\d{2}:\d{2})/.exec(d.annulation)?.[1] ?? "00:00",
  );
  const villeDeGare = (gare: string, code: string): c.Ville => ({
    code,
    nom: gare.split(" ")[0] ?? gare,
  });
  const moto = /part à (\d{2}:\d{2}) · (\d[\d\s]*) F/.exec(d.moto.detail);

  let billet: c.BilletVoyageur = {
    id: b._billetId,
    numero: b.numero,
    etat: /^Payé/.test(d.statut) ? "paye" : "reserve",
    smsEnvoye: /SMS/.test(d.statut),
    compagnie: { id: idCompagnie(b.compagnie), nom: b.compagnie },
    classe: classeDe(b.classe),
    departId: entiteDepart?.id ?? entiteBillet?.departId ?? "dep-pass",
    heureDepart,
    dureeMinutes: dureeEnMinutes(b.duree),
    origine: { ville: villeDeGare(b.origine.gare, b.origine.code), gare: b.origine.gare },
    destination: {
      ville: villeDeGare(b.destination.gare, b.destination.code),
      gare: b.destination.gare,
    },
    siege: b.siege,
    prix: entiteBillet?.prix ?? 0,
    passager: {
      nom: d.codeSansScanner.voyageur.split(" · ")[0] ?? "",
      pieceQuatreDerniers: /(\d{4})$/.exec(d.codeSansScanner.voyageur)?.[1],
    },
    qr: `AFM|${b.numero}|${d.codeSansScanner.code}`,
    codeBillet: d.codeSansScanner.code,
    presenceQuaiMinutes: entier(d.codeSansScanner.consigne),
    annulationGratuiteJusqua: gratuiteJusqua,
    ...(moto
      ? {
          courseProposee: { partirA: isoA(jour, moto[1] ?? "00:00"), prix: entier(moto[2] ?? "0") },
        }
      : {}),
  };

  const apercu = (maintenant: string): c.ApercuAnnulation => {
    const decision = decisionAnnulation({
      etat: billet.etat,
      prix: billet.prix,
      classe: billet.classe,
      heureDepart: billet.heureDepart,
      maintenant,
    });
    return {
      billetId: billet.id,
      autorise: decision.autorise,
      gratuite: decision.gratuite,
      retenue: decision.retenue,
      remboursement: decision.remboursement,
      gratuiteJusqua: limiteAnnulationGratuite(billet.heureDepart),
    };
  };

  return [
    implementer(OP_BILLET, () => billet),
    implementer(OP_APERCU_ANNULATION, (_p, ctx) => apercu(ctx.horloge.iso())),
    implementer(OP_ANNULER_BILLET, (_p, ctx): c.ResultatAnnulation => {
      const decision = apercu(ctx.horloge.iso());
      if (!decision.autorise)
        throw new ErreurHttp(409, "Annulation impossible", "annulation_interdite");
      billet = { ...billet, etat: "annule" };
      return {
        billetId: billet.id,
        etat: "annule",
        retenue: decision.retenue,
        remboursement: decision.remboursement,
        rembourseSur: "mtn_momo",
      };
    }),
    implementer(OP_REPORTER_BILLET, (p): c.ResultatReport => {
      const ancien = billet.id;
      billet = { ...billet, id: `${ancien}-reporte`, departId: p.departCibleId, etat: "paye" };
      return { ancienBilletId: ancien, billet };
    }),
  ];
}

/* ------------------------------------------------------------------ Paiement : MoMo, OM, carte, proche */

export function mockPaiement(source: EcranSource): {
  operations: ImplementationMock[];
  flux: FluxMock[];
} {
  const d = donneesDe(source, "Paiement");
  const moyens = moyensDe(d.moyens);
  const lignes: c.LigneDevis[] = d.detail.map((l, i) => ({
    code: i === 0 ? "trajet" : "frais_service",
    libelle: l.libelle,
    montant: l.montant,
  }));
  const creeeA = source.maintenant;
  const commande = (id: string, statut: c.StatutCommande, billetIds: string[]): c.Commande => ({
    id,
    type: "covoiturage",
    libelle: d.commande,
    lignes,
    total: d.aPayer.montant,
    statut,
    creeeA,
    expireA: plusMinutes(creeeA, BLOCAGE_SIEGE_MINUTES),
    billetIds,
  });

  const paiements = new Map<string, { paiement: c.Paiement; confirmeA: number }>();
  const nombrePaiements = compteur("pay");
  const DELAI_CONFIRMATION_MS = 5000;
  const consigne = d.moyens[0]?.detail.split(" · ")[1];

  const statutDe = (id: string, maintenantMs: number): c.Paiement => {
    const entree = paiements.get(id);
    if (!entree) throw new ErreurHttp(404, `Paiement ${id} inconnu`, "paiement_inconnu");
    return maintenantMs >= entree.confirmeA
      ? { ...entree.paiement, statut: "reussi" }
      : entree.paiement;
  };

  const flux: FluxMock[] = [
    simulerFlux(CANAL_STATUT_PAIEMENT, (p, ctx) => {
      const entree = paiements.get(p.paiementId);
      const commandeId = entree?.paiement.commandeId ?? "";
      ctx.emettre({
        paiementId: p.paiementId,
        commandeId,
        statut: "en_attente_confirmation",
        billetIds: [],
        instant: ctx.horloge.iso(),
      });
      ctx.planifier(DELAI_CONFIRMATION_MS, () =>
        ctx.emettre({
          paiementId: p.paiementId,
          commandeId,
          statut: "reussi",
          billetIds: [`billet-${commandeId}`],
          instant: ctx.horloge.iso(),
        }),
      );
    }),
  ];

  const operations = [
    implementer(OP_COMMANDE, (p, ctx) => {
      const paye = [...paiements.values()].some(
        (e) => e.paiement.commandeId === p.commandeId && ctx.horloge.maintenant() >= e.confirmeA,
      );
      return commande(
        p.commandeId,
        paye ? "payee" : "en_attente_paiement",
        paye ? [`billet-${p.commandeId}`] : [],
      );
    }),
    implementer(OP_MOYENS_PAIEMENT, () => moyens),
    implementer(OP_PAYER_COMMANDE, (p, ctx): c.Paiement => {
      const id = nombrePaiements();
      const paiement: c.Paiement = {
        id,
        commandeId: p.commandeId,
        moyen: p.moyen,
        statut: "en_attente_confirmation",
        montant: d.aPayer.montant,
        ...(consigne && (p.moyen === "mtn_momo" || p.moyen === "orange_money") ? { consigne } : {}),
        creeA: ctx.horloge.iso(),
      };
      paiements.set(id, { paiement, confirmeA: ctx.horloge.maintenant() + DELAI_CONFIRMATION_MS });
      return paiement;
    }),
    implementer(OP_STATUT_PAIEMENT, (p, ctx) => statutDe(p.paiementId, ctx.horloge.maintenant())),
    implementer(
      OP_LIEN_PROCHE,
      (p, ctx): c.LienProche => ({
        commandeId: p.commandeId,
        url: `https://afrimove.example/payer/${p.commandeId}`,
        expireA: plusMinutes(ctx.horloge.iso(), BLOCAGE_SIEGE_MINUTES),
        ...(p.telephone ? { envoyeA: p.telephone } : {}),
      }),
    ),
  ];
  return { operations, flux };
}

/* ------------------------------------------------------------------ Proche : payer pour un proche */

export function mockProche(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Proche");
  const jourVoyage = dateFr(d.trajet.jour, source.maintenant)?.jour ?? jourDe(source.maintenant);
  const codeDe = (nom: string): string => CODES_VILLES[nom] ?? nom.slice(0, 3).toUpperCase();
  const [nomProche = "", nomComplet] = d.destinataire.nom.split(" · ");

  const proches: c.Proche[] = d.proches
    .filter((p) => "initiales" in p && p.initiales)
    .map((p) => {
      const est = p.nom === nomProche;
      return {
        id: slug(p.nom),
        nom: p.nom,
        ...(est && nomComplet ? { nomComplet } : {}),
        initiales: "initiales" in p && p.initiales ? p.initiales : initiales(p.nom),
        ...(est ? { telephone: telephone(d.destinataire.telephone) } : {}),
        prevenuALArrivee: est,
        payeMesVoyages: false,
      };
    });

  const departs: c.DepartVoyageur[] = d.departs.options.map((o) => {
    const heure = isoA(jourVoyage, o.heure);
    const numero = numeroDepart({
      agence: idCompagnie(o.compagnie).slice(4).toUpperCase(),
      ligne: `${codeDe(d.trajet.depart)}${codeDe(d.trajet.arrivee)}`,
      at: heure,
    });
    const places = entier(o.detail);
    return {
      id: `dep-${numero.toLowerCase()}`,
      numero,
      compagnie: { id: idCompagnie(o.compagnie), nom: o.compagnie },
      classe: classeDe(o.classe),
      heureDepart: heure,
      prix: o.prix,
      placesLibres: places,
      presqueComplet: places <= 3,
    };
  });
  const choisi = departs[d.departs.options.findIndex((o) => o.choisi)] ?? departs[0];
  const siegeChoisi = Number(
    /siège (\d+)/.exec(d.departs.options.find((o) => o.choisi)?.detail ?? "")?.[1] ?? 0,
  );
  const equivalent = /≈\s*(\d+),(\d{2})\s*\$\s*(\w{2})/.exec(d.paiement.equivalent);
  const devise = /· (\w{3})$/.exec(d.paiement.libelle)?.[1] ?? "CAD";
  const frais = entier(/\+ (\d[\d\s]*) F de frais/.exec(d.paiement.detail)?.[1] ?? "0");
  const idCommande = compteur("cmd-proche");

  const recherche: c.ResultatRechercheDeparts = {
    maintenant: source.maintenant,
    depart: ville(d.trajet.depart),
    arrivee: ville(d.trajet.arrivee),
    jour: jourVoyage,
    filtres: {
      classe: "toutes",
      compagnies: new Set(departs.map((x) => x.compagnie.id)).size,
      preferees: 0,
    },
    departs,
    covoits: [],
    totaux: { bus: departs.length, covoiturages: 0 },
  };

  return [
    implementer(OP_PROFIL, () => profilAicha()),
    implementer(OP_PROCHES, () => proches),
    implementer(OP_RECHERCHER_DEPARTS, () => recherche),
    implementer(OP_DETAIL_DEPART, (p): c.DetailDepart => {
      const depart = departs.find((x) => x.id === p.departId) ?? choisi;
      if (!depart) throw new ErreurHttp(404, "Départ inconnu", "depart_inconnu");
      return {
        depart,
        origine: { ville: ville(d.trajet.depart), gare: d.trajet.depart },
        destination: { ville: ville(d.trajet.arrivee), gare: d.trajet.arrivee },
        dureeMinutes: 240,
        blocageMinutes: BLOCAGE_SIEGE_MINUTES,
      };
    }),
    implementer(OP_DEVIS, () => {
      const lignes: c.LigneDevis[] = [
        { code: "billet", libelle: "Billet", montant: choisi?.prix ?? 0 },
        { code: "frais_voyageur", libelle: "Frais de service", montant: frais },
      ];
      return { lignes, total: lignes.reduce((t, l) => t + l.montant, 0) };
    }),
    implementer(OP_CREER_COMMANDE, (p, ctx): c.Commande => {
      const maintenant = ctx.horloge.iso();
      const lignes: c.LigneDevis[] = [
        { code: "billet", libelle: "Billet", montant: choisi?.prix ?? 0 },
        { code: "frais_voyageur", libelle: "Frais de service", montant: frais },
      ];
      return {
        id: idCommande(),
        type: "proche",
        libelle: `${choisi?.compagnie.nom ?? ""} · ${d.trajet.depart} → ${d.trajet.arrivee} · ${d.trajet.jour}${
          siegeChoisi ? ` · siège ${siegeChoisi}` : ""
        }`,
        lignes,
        total: d.action.total,
        ...(equivalent
          ? {
              conversion: {
                devise: p.devise ?? devise,
                montantMineur: Number(equivalent[1]) * 100 + Number(equivalent[2]),
                approximatif: true,
              },
            }
          : {}),
        statut: "en_attente_paiement",
        creeeA: maintenant,
        expireA: plusMinutes(maintenant, BLOCAGE_SIEGE_MINUTES),
        billetIds: [],
      };
    }),
  ];
}
