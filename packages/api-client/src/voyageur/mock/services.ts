import { BLOCAGE_SIEGE_MINUTES, numeroDepart } from "@afrimove/domain";
import type { voyageur as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer, simulerFlux } from "../../infra/scenarios";
import type { FluxMock, ImplementationMock } from "../../infra/scenarios";
import {
  OP_CHAUFFEUR_BUS,
  OP_COLIS_DU_BILLET,
  OP_NE_PLUS_PREVENIR_PROCHE,
  OP_SIGNALER_TRAJET,
} from "../direct";
import { OP_CREER_COMMANDE, OP_PROCHES } from "../operations";
import {
  CANAL_POSITION_BUS,
  OP_CREER_GROUPE,
  OP_DEVIS_BUS,
  OP_GROUPE,
  OP_INVITER_GROUPE,
  OP_OFFRES_MONTEE,
  OP_PREVENIR_PROCHE,
  OP_PROPOSITION_COURSE,
  OP_RESERVER_COURSE,
  OP_RESERVER_MONTEE,
  OP_RESEAU,
  OP_SANS_INTERNET,
  OP_SUIVI_BUS,
} from "../operationsServices";
import {
  AICHA,
  dateFr,
  donneesDe,
  entier,
  idCompagnie,
  initiales,
  isoA,
  jourDe,
  minutesEntre,
  nomCompagnie,
  plusMinutes,
  slug,
} from "./outils";
import type { EcranSource } from "./outils";

const compteur = (prefixe: string): (() => string) => {
  let n = 0;
  return () => `${prefixe}-${++n}`;
};

/* ------------------------------------------------------------------ Direct : mon bus en direct */

export function mockDirect(source: EcranSource): {
  operations: ImplementationMock[];
  flux: FluxMock[];
} {
  const d = donneesDe(source, "Direct");
  const jour = jourDe(source.maintenant);
  const [nomCie = "", sieges = ""] = d.billet.compagnie.split(" · ");
  const retard = /(\d+) min de retard/.exec(d.arrivee.detail);
  const prevue = /prévu (\d{2}:\d{2})/.exec(d.arrivee.detail)?.[1] ?? d.arrivee.heure;
  const procheNom = /Prévenir (.+?) quand/.exec(d.prevenir.titre)?.[1] ?? "";
  const rangProchain = d.etapes.findIndex((e) => /prochain/.test(e.libelle));

  const etapes: c.EtapeTrajet[] = d.etapes.map((e, i) => {
    const [arret = e.libelle, precision] = e.libelle.split(" · ");
    const minutes = /arrêt (\d+) min/.exec(precision ?? "");
    const monte = /(\d+) places? montent?/.exec(precision ?? "");
    return {
      arret,
      heure: isoA(jour, e.heure),
      statut:
        rangProchain < 0
          ? "passe"
          : i < rangProchain
            ? "passe"
            : i === rangProchain
              ? "prochain"
              : "a_venir",
      ...(precision ? { precision } : {}),
      ...(minutes ? { arretMinutes: Number(minutes[1]) } : {}),
      ...(monte ? { placesQuiMontent: Number(monte[1]) } : {}),
    };
  });
  const prochainArret = rangProchain >= 0 ? etapes[rangProchain]?.arret : undefined;
  const procheId = slug(procheNom);
  const minutesAvant = entier(/(\d+) min avant/.exec(d.prevenir.detail)?.[1] ?? "15");
  const gareArrivee = /avant (\S+)\s*$/.exec(d.prevenir.detail)?.[1] ?? "";
  let prevenirActif = false;
  let signalements = 0;

  const suivi = (): c.SuiviBus => ({
    billetId: d.billet._billetId,
    enDirect: d.statut === "EN DIRECT",
    compagnie: { id: idCompagnie(nomCie), nom: nomCie },
    siege: Number(/siège (\d+)/.exec(sieges)?.[1] ?? 0) || null,
    bus: { immatriculation: d.billet.bus },
    villes: [...d.carte.villes],
    vitesseKmh: entier(d.carte.vitesse),
    arrivee: {
      prevue: isoA(jour, prevue),
      estimee: isoA(jour, d.arrivee.heure),
      retardMinutes: retard ? Number(retard[1]) : 0,
    },
    etapes,
    prevenir: {
      procheId,
      nom: procheNom,
      minutesAvantArrivee: minutesAvant,
      gareArrivee,
      actif: prevenirActif,
    },
  });

  const flux: FluxMock[] = [
    simulerFlux(CANAL_POSITION_BUS, (p, ctx) => {
      // Le bus remonte de Douala vers Yaoundé : 0,002° de plus toutes les 5 s.
      let pas = 0;
      const emettre = (): void => {
        ctx.emettre({
          billetId: p.billetId,
          instant: ctx.horloge.iso(),
          latitude: Number((4.05 - pas * 0.002).toFixed(4)),
          longitude: Number((9.7 + pas * 0.004).toFixed(4)),
          vitesseKmh: entier(d.carte.vitesse),
          arriveeEstimee: isoA(jour, d.arrivee.heure),
          retardMinutes: retard ? Number(retard[1]) : 0,
          ...(prochainArret ? { prochainArret } : {}),
        });
        pas += 1;
        ctx.planifier(5000, emettre);
      };
      emettre();
    }),
  ];

  const operations = [
    implementer(OP_SUIVI_BUS, () => suivi()),
    implementer(OP_PROCHES, (): c.Proche[] => [
      {
        id: procheId,
        nom: procheNom,
        initiales: initiales(procheNom),
        prevenuALArrivee: true,
        payeMesVoyages: false,
      },
    ]),
    implementer(OP_PREVENIR_PROCHE, (p): c.ResultatPrevenirProche => {
      prevenirActif = true;
      return {
        billetId: p.billetId,
        procheId: p.procheId,
        actif: true,
        minutesAvantArrivee: p.minutesAvantArrivee ?? minutesAvant,
      };
    }),
    implementer(OP_NE_PLUS_PREVENIR_PROCHE, (p): c.ResultatPrevenirProche => {
      prevenirActif = false;
      return {
        billetId: p.billetId,
        procheId: p.procheId,
        actif: false,
        minutesAvantArrivee: minutesAvant,
      };
    }),
    implementer(OP_SIGNALER_TRAJET, (p, ctx) => ({
      id: `signalement-${++signalements}`,
      billetId: p.billetId,
      motif: p.motif,
      // Le signalement part à la gare de départ du bus (première étape de la frise).
      transmisA: etapes[0]?.arret ?? "",
      creeA: ctx.horloge.iso(),
    })),
    // Le chauffeur de la feuille de route du LT 412 AB (planche Chauffeur) : Mbarga, numéro du monde commun.
    implementer(OP_CHAUFFEUR_BUS, () => ({ nom: "Mbarga", telephone: "+237677000024" })),
    // Le colis pour Maman du monde commun (C-DLA-270105-0017), celui que montrent Main et ColisCode.
    implementer(OP_COLIS_DU_BILLET, (p) => ({
      billetId: p.billetId,
      colisId: "colis-c-dla-270105-0017",
    })),
  ];
  return { operations, flux };
}

/* ------------------------------------------------------------------ Reseau : le réseau en direct */

export function mockReseau(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Reseau");
  const jour = jourDe(source.maintenant);
  const resume = /(\d+) compagnies · (\d+) bus en route · (\d+) départs à venir/.exec(d.resume);

  const lignes: c.LigneReseau[] = d.lignes.liste.map((l) => {
    const [depart = "", arrivee = ""] = l.trajet.split(" → ");
    const prochains = [...l.detail.matchAll(/(\d{2}:\d{2}) ([^·]+)/g)].map((m) => ({
      heure: isoA(jour, m[1] ?? "00:00"),
      libelle: (m[2] ?? "").trim(),
    }));
    const compagnies = /(\d+) compagnies/.exec(l.detail);
    const correspondance = /correspondance (\d+) min/.exec(l.detail);
    const prix = l.prixDes ?? l.prix ?? 0;
    return {
      id: `ligne-${slug(l.trajet)}`,
      depart,
      arrivee,
      ...("via" in l && l.via ? { via: l.via.replace(/^via\s+/, "") } : {}),
      mode: "mode" in l && l.mode === "covoiturage" ? "covoiturage" : "bus",
      ...(compagnies ? { compagnies: Number(compagnies[1]) } : {}),
      prochains,
      ...(correspondance ? { correspondanceMinutes: Number(correspondance[1]) } : {}),
      resume: l.detail,
      prix,
      prixEstUnMinimum: l.prixDes !== undefined,
    };
  });

  const apercu = (filtre: string): c.ApercuReseau => ({
    maintenant: source.maintenant,
    compagnies: Number(resume?.[1] ?? 0),
    busEnRoute: Number(resume?.[2] ?? 0),
    departsAVenir: Number(resume?.[3] ?? 0),
    filtres: [...d.filtres],
    filtreActif: filtre,
    villes: [...d.carte.villes],
    lignes:
      filtre === d.filtres[0]
        ? lignes
        : lignes.filter((l) =>
            l.prochains.some((p) => p.libelle.toLowerCase().includes(filtre.toLowerCase())),
          ),
  });
  return [implementer(OP_RESEAU, (p) => apercu(p.filtre ?? d.filtreActif))];
}

/* ------------------------------------------------------------------ Arret : monter en route */

export function mockArret(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Arret");
  const jour = jourDe(source.maintenant);
  const arretNom = /Tu es à (.+?) ·/.exec(d.position)?.[1] ?? "";
  const arretId = slug(arretNom);
  const libelleLigne = d.ligne.libelle.replace(/^Ligne\s+/, "");

  const bus: c.BusQuiPasse[] = d.bus.map((b) => {
    const passeA = isoA(jour, b.heure);
    const parti = /parti de \S+ (\d{2}:\d{2})/.exec(b.detail)?.[1];
    const arrivee = /arrive \S+ (\d{2}:\d{2})/.exec(b.detail)?.[1] ?? b.heure;
    const compagnie = b.compagnie.replace(/\s+VIP$/, "");
    return {
      departId: `dep-route-${idCompagnie(compagnie).slice(4)}-${b.heure.replace(":", "")}`,
      compagnie: { id: idCompagnie(compagnie), nom: compagnie },
      classe: /vip/i.test(b.compagnie) ? "vip" : "classique",
      passeA,
      passeDansMinutes: Math.max(0, minutesEntre(passeA, source.maintenant)),
      placesLibres: entier(b.places),
      ...(parti ? { partiA: isoA(jour, parti) } : {}),
      arriveeDestination: isoA(jour, arrivee),
      prix: b.prix,
      prorata: b.mention === "prorata",
    };
  });

  const idCommande = compteur("cmd-route");
  return [
    implementer(
      OP_OFFRES_MONTEE,
      (): c.OffresMonteeEnRoute => ({
        maintenant: source.maintenant,
        arret: { id: arretId, nom: arretNom, gps: d.gps === "GPS" },
        ligne: {
          libelle: libelleLigne,
          sens: d.ligne.sens,
          arrets: d.ligne.arrets.map((a) => a.replace(/ · toi$/, "")),
          arretCourant: arretNom,
          pointDeMontee: d.ligne.pointDeMontee,
        },
        bus,
      }),
    ),
    implementer(OP_RESERVER_MONTEE, (p, ctx): c.Commande => {
      const choisi = bus.find((b) => b.departId === p.departId);
      if (!choisi) throw new ErreurHttp(404, "Ce bus ne passe pas ici", "depart_inconnu");
      const maintenant = ctx.horloge.iso();
      return {
        id: idCommande(),
        type: "billet",
        libelle: `Monter à ${arretNom} · ${choisi.compagnie.nom} · ${libelleLigne}`,
        lignes: [
          { code: "billet_prorata", libelle: `Billet ${arretNom} → arrivée`, montant: choisi.prix },
        ],
        total: choisi.prix,
        statut: "en_attente_paiement",
        creeeA: maintenant,
        expireA: plusMinutes(maintenant, BLOCAGE_SIEGE_MINUTES),
        billetIds: [],
      };
    }),
  ];
}

/* ------------------------------------------------------------------ Course : moto ou taxi vers la gare */

const MODES_COURSE: Readonly<Record<string, c.ModeCourse>> = {
  Moto: "moto",
  Taxi: "taxi",
  "Avec 2 valises": "avec_valises",
};

export function mockCourse(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Course");
  const jour = jourDe(source.maintenant);
  const heure = (texte: string): string => /(\d{2}:\d{2})/.exec(texte)?.[1] ?? "00:00";
  const modes = d.modes.map((m) => ({
    mode: MODES_COURSE[m.libelle] ?? "moto",
    libelle: m.libelle,
    ...("prix" in m && m.prix !== undefined ? { prix: m.prix } : {}),
    choisi: m.choisi,
  }));
  const prixMoto = modes.find((m) => m.mode === "moto")?.prix ?? 0;
  const arrivee = d.horaires.find((h) => /quai/.test(h.libelle));
  const paiement = d.horaires.find((h) => h.montant !== undefined);
  const chauffeurId = `chauffeur-${slug(d.chauffeur.nom)}`;
  const retardChauffeur = entier(d.carte.find((x) => /min$/.test(x)) ?? "0 min");

  const proposition = (billetId: string): c.PropositionCourse => ({
    billetId,
    lieuDepart: d.carte[0] ?? "",
    gare: d.carte[1] ?? "",
    modes,
    partirA: isoA(jour, heure(d.depart.heure)),
    arriveeQuai: isoA(jour, arrivee?.heure ?? heure(d.depart.heure)),
    trajetMinutes: entier(d.depart.trajet),
    busA: isoA(jour, heure(d.depart.bus)),
    presenceQuaiMinutes: entier(d.depart.consigne),
    chauffeur: {
      id: chauffeurId,
      nom: d.chauffeur.nom,
      initiales: d.chauffeur.initiales,
      type: d.chauffeur.type,
      verifie: /vérifi/.test(d.chauffeur.reputation),
      note:
        Number((/(\d),(\d) ★/.exec(d.chauffeur.reputation) ?? []).slice(1).join(".")) || undefined,
      detail: d.chauffeur.detail,
      arriveDansMinutes: retardChauffeur,
    },
    prix: paiement?.montant ?? prixMoto,
    payeAvecBillet: /un seul paiement/.test(paiement?.libelle ?? ""),
    rappelMinutes: entier(/Rappel (\d+) min/.exec(d.rappel)?.[1] ?? "10"),
    annulationGratuiteJusqua: isoA(
      jour,
      heure(/jusqu'à (\d{2}:\d{2})/.exec(d.rappel)?.[1] ?? "00:00"),
    ),
  });

  const idCourse = compteur("course");
  return [
    implementer(OP_PROPOSITION_COURSE, (p) => proposition(p.billetId)),
    implementer(
      OP_RESERVER_COURSE,
      (p): c.Course => ({
        id: idCourse(),
        billetId: p.billetId,
        mode: p.mode,
        statut: "reservee",
        partirA: p.partirA,
        prix: modes.find((m) => m.mode === p.mode)?.prix ?? prixMoto,
        chauffeurId,
      }),
    ),
  ];
}

/* ------------------------------------------------------------------ Groupe : à plusieurs */

export function mockGroupe(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Groupe");
  const [trajet = "", jourTexte = ""] = d.depart.trajet.split(" · ");
  const jourVoyage = dateFr(jourTexte, source.maintenant)?.jour ?? jourDe(source.maintenant);
  const [heure = "00:00", nomCourt = ""] = d.depart.compagnie.split(" ");
  const heureDepart = isoA(jourVoyage, heure);
  const villes = trajet.split(" → ");
  const code = (v: string | undefined): string =>
    (v ?? "").normalize("NFD").replace(/\p{M}/gu, "").slice(0, 3).toUpperCase();
  const idCie = idCompagnie(nomCourt);
  const numero = numeroDepart({
    agence: idCie.slice(4).toUpperCase(),
    ligne: `${code(villes[0])}${code(villes[1])}`,
    at: heureDepart,
  });
  const MODES: readonly c.ModeGroupe[] = ["groupe", "bus_entier", "cagnotte"];

  const participants: c.ParticipantGroupe[] = d.cagnotte.participants.map((p) => {
    const [nom = p.nom] = p.nom.split(" · ");
    const statut: c.StatutParticipant =
      p.statut === "payé" ? "paye" : p.statut === "lien envoyé" ? "lien_envoye" : "en_attente";
    return {
      ...(/moi/.test(p.nom) ? { id: AICHA.id } : {}),
      nom,
      initiales: p.initiales,
      places: nom.includes(",") ? nom.split(",").length : 1,
      statut,
    };
  });

  const groupe = (id: string, mode: c.ModeGroupe, voyageurs: number): c.Groupe => ({
    id,
    mode,
    depart: {
      id: `dep-${numero.toLowerCase()}`,
      numero,
      compagnie: { id: idCie, nom: nomCompagnie(nomCourt) },
      heureDepart,
    },
    trajet,
    voyageurs,
    sieges: [...d.sieges],
    blocageJusqua: plusMinutes(source.maintenant, BLOCAGE_SIEGE_MINUTES),
    cagnotte: {
      prixPlace: d.cagnotte.prixPlace,
      total: d.cagnotte.total,
      partMoi: d.paiement.part,
      participants,
    },
    lienPartage: `https://afrimove.example/groupe/${id}`,
  });

  const idGroupe = compteur("groupe");
  const idDevis = compteur("devis-bus");
  const idCommande = compteur("cmd-groupe");
  return [
    implementer(OP_GROUPE, (p) =>
      groupe(p.groupeId, MODES[d.modes.indexOf(d.modeActif)] ?? "groupe", d.voyageurs.nombre),
    ),
    implementer(OP_CREER_GROUPE, (p) => groupe(idGroupe(), p.mode, p.voyageurs)),
    implementer(
      OP_INVITER_GROUPE,
      (p): c.ResultatInvitation => ({
        groupeId: p.groupeId,
        liensEnvoyes: p.telephones.length,
      }),
    ),
    implementer(
      OP_DEVIS_BUS,
      (p, ctx): c.DevisBus => ({
        id: idDevis(),
        places: p.places,
        statut: "demande",
        reponseAttendueAvant: plusMinutes(ctx.horloge.iso(), 120),
      }),
    ),
    implementer(OP_CREER_COMMANDE, (p, ctx): c.Commande => {
      const places = p.sieges.length;
      const maintenant = ctx.horloge.iso();
      const montant = d.cagnotte.prixPlace * places;
      return {
        id: idCommande(),
        type: "groupe",
        libelle: `Groupe ${trajet} · ${d.depart.compagnie}`,
        lignes: [{ code: "places", libelle: `${places} place${places > 1 ? "s" : ""}`, montant }],
        total: montant,
        statut: "en_attente_paiement",
        creeeA: maintenant,
        expireA: plusMinutes(maintenant, BLOCAGE_SIEGE_MINUTES),
        billetIds: [],
      };
    }),
  ];
}

/* ------------------------------------------------------------------ USSD : sans internet */

export function mockUssd(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "USSD");
  const apercu: c.ApercuSansInternet = {
    ussd: {
      code: /(\*\d+#)/.exec(d.ussd.titre)?.[1] ?? "*123#",
      lignes: [...d.ussd.ecran],
      touches: [...d.ussd.clavier],
      note: d.ussd.note,
    },
    whatsapp: {
      motCle: /«\s*(.+?)\s*»/.exec(d.whatsapp.titre)?.[1] ?? "billet",
      echanges: d.whatsapp.echanges.map((e) => ({
        de: e._de === "afrimove" ? "afrimove" : "voyageur",
        lignes: [...e.texte],
      })),
      vocal: d.whatsapp.vocal,
    },
  };
  return [implementer(OP_SANS_INTERNET, () => apercu)];
}
