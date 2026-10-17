import {
  MACHINE_SESSION,
  TransitionInterdite,
  annulerBillet,
  appliquerBillet,
  debloquerTemporairement,
  etatSuivant,
} from "@afrimove/domain";
import { MONDE } from "@afrimove/fixtures";
import type { agence as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/index";
import {
  CANAL_GARE,
  ECRITURES,
  OP_SUPERVISEUR_ANNULATION,
  OP_SUPERVISEUR_APPAREIL,
  OP_SUPERVISEUR_CLOTURE,
  OP_SUPERVISEUR_EQUIPE,
  OP_SUPERVISEUR_GARE,
} from "../operations";
import { installerJournal } from "./journal";
import type { InstallateurPlanche } from "./types";
import {
  capturer,
  groupe,
  idDemandeAnnulation,
  idDemandeCloture,
  iso,
  lire,
  montant,
  personne,
  verifierSuperviseur,
} from "./utilitaires";

const gareAkwa = (): { id: string } =>
  lire(
    MONDE.gares.find((g) => g.compagnieId === "cie-alp" && g.code === "DLA"),
    "la gare d'Akwa",
  );

/* ------------------------------------------------------------------ Superviseur */

/** « écart 0 · ouvert », « − 1 000 · à valider », « ouvert 09:00 » → un guichet du contrat. */
function guichetSuperviseur(libelle: string, billets: number, etat: string): c.GuichetSuperviseur {
  const rang = Number(groupe(capturer(/(\d+)$/, libelle, "le rang du guichet"), 1));
  const ouvertA = /ouvert (\d{2}:\d{2})$/.exec(etat);
  const ecart = /^écart (.+?) ·/.exec(etat) ?? /^(− ?[\d\s]+) ·/.exec(etat);
  return {
    rang,
    billets,
    ecart: ecart?.[1] ? montant(ecart[1].replace(/\s*$/, "")) : 0,
    etat: etat.includes("à valider") ? "a_valider" : etat.includes("fermé") ? "ferme" : "ouvert",
    ouvertA: ouvertA?.[1] ? iso(ouvertA[1]) : null,
  };
}

/** Planche « Superviseur » : `useSuperviseurGare`, `useGareDirect`, journal. */
export const installerSuperviseur: InstallateurPlanche<"Superviseur"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const titre = capturer(/^Superviseur · (.+)$/, d.titre, "le titre");
  const detail = capturer(
    /^(.+) · (\d+) guichets · (\d+) quais · (\d{2}:\d{2})$/,
    d.detail,
    "l'en-tête",
  );
  const synchro = capturer(/^(\d+) \/ (\d+) sync$/, d.synchro, "la synchronisation");

  const demandes: c.DemandeSuperviseur[] = d.demandes.liste.map((x) => {
    if (x._sessionId !== undefined) {
      const rang = capturer(/Clôture guichet (\d+)/, x.type, "la clôture");
      const m = capturer(/^· (.+) · écart (.+) · compté ([\d\s]+)$/, x.detail, "la demande");
      return {
        genre: "cloture",
        demandeId: idDemandeCloture(x._sessionId),
        sessionId: x._sessionId,
        guichetRang: Number(groupe(rang, 1)),
        agent: personne(groupe(m, 1)),
        compte: montant(groupe(m, 3)),
        ecart: montant(groupe(m, 2)),
      };
    }
    const m = capturer(
      /^· guichet (\d+) · billet (\d{4}) · ([\d\s]+) · « (.+) »$/,
      x.detail,
      "l'annulation",
    );
    return {
      genre: "annulation",
      demandeId: idDemandeAnnulation(x._billetId),
      billetId: x._billetId,
      billetSequence: Number(groupe(m, 2)),
      guichetRang: Number(groupe(m, 1)),
      montant: montant(groupe(m, 3)),
      motif: groupe(m, 4),
    };
  });

  const departs: c.DepartGare[] = d.apresMidi.departs.map((x) => {
    const m = capturer(
      /^(\S+) · quai (\d+)(?: · (.+))?$/,
      x.destination.replace(/\s*·\s*$/, ""),
      "un départ de l'après-midi",
    );
    const remplissage = capturer(/^(\d+)\/(\d+)$/, x.remplissage, "le remplissage");
    const fusion =
      x.fusion !== undefined ? capturer(/(\d{2}:\d{2})$/, x.fusion, "la fusion") : null;
    return {
      departId: x._departId,
      heureDepart: iso(x.heure),
      destination: groupe(m, 1),
      quai: Number(groupe(m, 2)),
      bus: m[3] ?? null,
      vendus: Number(groupe(remplissage, 1)),
      capacite: Number(groupe(remplissage, 2)),
      fusionProposeeAvec: fusion ? iso(groupe(fusion, 1)) : null,
    };
  });

  const etat: c.SuperviseurGare = {
    gare: { id: gareAkwa().id, nom: groupe(titre, 1) },
    superviseur: personne(groupe(detail, 1)),
    at: ecran.maintenant,
    quais: Number(groupe(detail, 3)),
    synchro: { synchronises: Number(groupe(synchro, 1)), total: Number(groupe(synchro, 2)) },
    demandes,
    guichets: d.guichets.map((g) => guichetSuperviseur(g.libelle, g.billets, g.etat)),
    apresMidi: departs,
  };

  poseur.lecture(OP_SUPERVISEUR_GARE, () => etat);
  installerJournal(poseur, ecran.entites);

  // Temps réel : l'état courant tout de suite, puis un départ qui se remplit toutes les 5 s.
  poseur.flux(CANAL_GARE, (_params, ctx) => {
    const copie = structuredClone(etat);
    const premier = copie.apresMidi[0];
    if (premier) {
      const message = (): void =>
        ctx.emettre({
          type: "remplissage",
          at: ctx.horloge.iso(),
          departId: premier.departId,
          vendus: premier.vendus,
          capacite: premier.capacite,
        });
      const avancer = (): void => {
        if (premier.vendus < premier.capacite) premier.vendus += 1;
        message();
        if (premier.vendus < premier.capacite) ctx.planifier(5000, avancer);
      };
      message();
      ctx.planifier(5000, avancer);
    }
    for (const demande of copie.demandes) {
      ctx.emettre({ type: "demande", at: ctx.horloge.iso(), demande });
    }
  });
};

/* ------------------------------------------------------------------ SuperviseurValider */

/** Planche « SuperviseurValider » : `useSuperviseurCloture`, valider ou refuser avec le PIN. */
export const installerSuperviseurValider: InstallateurPlanche<"SuperviseurValider"> = (
  ecran,
  poseur,
) => {
  const d = ecran.donnees;
  const session0 = lire(ecran.entites.sessions?.[0], "la session à valider");
  const entete = capturer(
    /^Guichet (\d+) · (.+) · (K-\S+) · (\d{2}:\d{2})$/,
    d.detail,
    "l'en-tête",
  );
  const resume = capturer(
    /^(\d+) billets cash · (\d+) colis · (\d+) annulations validées$/,
    d.session.resume,
    "le résumé",
  );
  const periode = capturer(/^(\d{2}:\d{2}) → (\d{2}:\d{2})$/, d.session.periode, "la période");
  const [tolerance, historique, cadence] = d.controles;
  const jours = capturer(/(\d+) derniers jours/, lire(historique?.libelle, "historique"), "jours");
  const ecarts = capturer(
    /^(\d+) écarts négatifs · (.+)$/,
    String(lire(historique?.valeur, "historique")),
    "l'historique de l'agent",
  );
  const superviseur = capturer(/^Mon PIN · (.+)$/, d.pin.titre, "le superviseur");
  const longueur = capturer(/^(\d+) chiffres/, d.pin.aide, "la longueur du PIN");
  const regle = capturer(/^(\d+) essais, puis blocage (\d+) min/, d.pin.regle, "la règle du PIN");
  const [attendu, compte, ecart] = d.bilan;

  let etatSession = session0.etat;
  const vue: c.SuperviseurCloture = {
    sessionId: d.session._sessionId,
    numero: groupe(entete, 3),
    guichetRang: Number(groupe(entete, 1)),
    agent: personne(groupe(entete, 2)),
    clotureeA: iso(groupe(entete, 4)),
    periode: { debut: iso(groupe(periode, 1)), fin: iso(groupe(periode, 2)) },
    bilan: {
      attendu: lire(attendu?.montant, "attendu"),
      compte: lire(compte?.montant, "compté"),
      ecart: lire(ecart?.montant, "écart"),
      statut: ecran.visuel.statutEcart as c.SuperviseurCloture["bilan"]["statut"],
    },
    resume: {
      billetsCash: Number(groupe(resume, 1)),
      colis: Number(groupe(resume, 2)),
      annulationsValidees: Number(groupe(resume, 3)),
    },
    controles: {
      tolerance: {
        montant: Number(lire(tolerance?.valeur, "tolérance")),
        dansLaLimite: lire(tolerance?.etat, "tolérance").includes("dans la limite"),
      },
      historiqueAgent: {
        jours: Number(groupe(jours, 1)),
        ecartsNegatifs: Number(groupe(ecarts, 1)),
        total: montant(groupe(ecarts, 2)),
      },
      cadenceSansNom: Number(lire(cadence?.valeur, "cadence")),
    },
    commentaire: d.commentaire.valeur,
    pin: {
      superviseur: personne(groupe(superviseur, 1)),
      longueur: Number(groupe(longueur, 1)),
      empreinteDisponible: d.pin.touches.some((t) => t.includes("empreinte")),
      essaisMax: Number(groupe(regle, 1)),
      blocageMinutes: Number(groupe(regle, 2)),
    },
  };

  poseur.lecture(OP_SUPERVISEUR_CLOTURE, ({ sessionId }) => {
    if (sessionId !== vue.sessionId)
      throw new ErreurHttp(404, "Session inconnue", "SESSION_INCONNUE");
    return vue;
  });
  installerJournal(poseur, ecran.entites);

  const transiter = (
    action: "valider" | "refuser",
    sessionId: string,
    preuve: c.ValidationSuperviseur,
  ): void => {
    verifierSuperviseur(preuve);
    if (sessionId !== vue.sessionId)
      throw new ErreurHttp(404, "Session inconnue", "SESSION_INCONNUE");
    try {
      etatSession = etatSuivant(MACHINE_SESSION, etatSession, action);
    } catch (e) {
      if (e instanceof TransitionInterdite) {
        throw new ErreurHttp(409, e.message, "TRANSITION_INTERDITE");
      }
      throw e;
    }
  };

  poseur.ecriture(ECRITURES.caisseValidee, (evenement) => {
    const v = evenement.donnees;
    verifierSuperviseur(v.validePar);
    if (v.sessionId === vue.sessionId && v.ecart !== vue.bilan.ecart) {
      throw new ErreurHttp(422, "L'écart signé ne correspond pas à la clôture", "ECART_DIFFERENT");
    }
    transiter("valider", v.sessionId, v.validePar);
    return { session: { sessionId: v.sessionId, etat: etatSession, ecart: vue.bilan.ecart } };
  });

  poseur.ecriture(ECRITURES.caisseRefusee, (evenement) => {
    const v = evenement.donnees;
    transiter("refuser", v.sessionId, v.validePar);
    return { session: { sessionId: v.sessionId, etat: etatSession, ecart: vue.bilan.ecart } };
  });
};

/* ------------------------------------------------------------------ SuperviseurVoir */

const DECISIONS: Readonly<Record<string, c.DecisionAnnulationAgence>> = {
  Rembourser: "rembourser",
  "Reporter à demain": "reporter",
};

/** Planche « SuperviseurVoir » : `useSuperviseurAnnulation`, `useDeciderAnnulation`. */
export const installerSuperviseurVoir: InstallateurPlanche<"SuperviseurVoir"> = (ecran, poseur) => {
  const d = ecran.donnees;
  let billet = lire(ecran.entites.billets?.[0], "le billet à annuler");
  const depart = lire(ecran.entites.departs?.[0], "le départ du billet");
  const entete = capturer(
    /^Guichet (\d+) · (.+) · demandée à (\d{2}:\d{2}), il y a (\d+) min$/,
    d.detail,
    "l'en-tête",
  );
  const heureDepart = capturer(/^(\d{2}:\d{2}) (\S+)$/, d.billet.depart.valeur, "le départ");
  const siege = capturer(/siège (\d+)/, d.billet.depart.siege, "le siège");
  const piece = capturer(/(\d{4})$/, d.billet.voyageur.piece, "la pièce");
  const vendu = capturer(
    /^(\d{2}:\d{2}) · guichet (\d+) · (cash|momo|orange_money) · (.+)$/,
    d.billet.vendu.valeur,
    "la vente",
  );
  const motif = capturer(/^« (.+) »$/, d.billet.motif.valeur, "le motif");
  const [scanne, delai, frequence, client] = d.verifications.lignes;
  const aujourdhui = capturer(
    /^(\d+)e annulation/,
    lire(frequence && "gras" in frequence ? frequence.gras : undefined, "fréquence"),
    "annulations",
  );
  const dixJours = capturer(
    /(\d+) sur les 10 derniers jours \(moyenne des guichets : (\d+)\)/,
    lire(frequence?.suite, "fréquence"),
    "les annulations sur 10 jours",
  );
  const aRendre = capturer(
    /([\d\s]+) F à lui rendre/,
    lire(client?.suite, "client"),
    "le cash à rendre",
  );

  const demandeId = idDemandeAnnulation(d.billet._billetId);
  let decidee = false;
  const vue: c.SuperviseurAnnulation = {
    demandeId,
    demandeA: iso(groupe(entete, 3)),
    guichetRang: Number(groupe(entete, 1)),
    demandeur: personne(groupe(entete, 2)),
    billet: {
      billetId: d.billet._billetId,
      numero: d.billet.numero,
      sequence: billet.sequence,
      prix: d.billet.prix,
      etat: billet.etat,
      depart: {
        departId: depart.id,
        heureDepart: iso(groupe(heureDepart, 1)),
        destination: groupe(heureDepart, 2),
        siege: Number(groupe(siege, 1)),
      },
      voyageur: { nom: d.billet.voyageur.valeur, pieceQuatreDerniers: groupe(piece, 1) },
      vendu: {
        at: iso(groupe(vendu, 1)),
        guichetRang: Number(groupe(vendu, 2)),
        mode: groupe(vendu, 3) as c.SuperviseurAnnulation["billet"]["vendu"]["mode"],
        agent: personne(groupe(vendu, 4)),
      },
      motif: groupe(motif, 1),
    },
    verifications: {
      scanne: !lire(scanne && "gras" in scanne ? scanne.gras : undefined, "scan").includes(
        "pas encore",
      ),
      siegeLiberable: lire(scanne?.suite, "scan").includes("libérable"),
      // Selon la planche : remboursement intégral. Le domaine, lui, retiendrait une part
      // (départ dans moins d'une heure) : voir INCOHERENCES.md de @afrimove/fixtures.
      remboursementIntegral: lire(
        delai && "gras" in delai ? delai.gras : undefined,
        "délai",
      ).includes("intégral"),
      retenue: 0,
      annulationsAgentAujourdhui: Number(groupe(aujourdhui, 1)),
      annulationsAgent10Jours: Number(groupe(dixJours, 1)),
      moyenneGuichets: Number(groupe(dixJours, 2)),
      clientPresent: lire(client?.suite, "client").includes("présent"),
      pieceVue: lire(client?.suite, "client").includes("pièce vue"),
      aRendreCash: montant(groupe(aRendre, 1)),
    },
    decisionsPossibles: [...d.decision.choix.map((x) => DECISIONS[x] ?? "avoir"), "refuser"],
    decisionProposee: DECISIONS[d.decision.choisi] ?? "avoir",
  };

  poseur.lecture(OP_SUPERVISEUR_ANNULATION, (params) => {
    if (params.demandeId !== demandeId)
      throw new ErreurHttp(404, "Demande inconnue", "DEMANDE_INCONNUE");
    return vue;
  });
  installerJournal(poseur, ecran.entites);

  poseur.ecriture(ECRITURES.annulationDecidee, (evenement) => {
    const v = evenement.donnees;
    verifierSuperviseur(v.validePar);
    if (v.demandeId !== demandeId || v.billetId !== billet.id) {
      throw new ErreurHttp(404, "Demande inconnue", "DEMANDE_INCONNUE");
    }
    if (decidee)
      throw new ErreurHttp(409, "Cette demande a déjà reçu une décision", "DEJA_DECIDEE");
    if (v.montant > billet.prix) {
      throw new ErreurHttp(422, "Le montant dépasse le prix du billet", "MONTANT_TROP_ELEVE");
    }
    let siegeLibere = false;
    try {
      if (v.decision === "rembourser" || v.decision === "avoir") {
        // Le domaine refuse sans PIN de superviseur et garde le numéro du billet.
        billet = annulerBillet(billet, {
          evenementId: evenement.id,
          at: evenement.at,
          par: vue.demandeur.id,
          validePar: v.validePar.superviseurId,
          motif: vue.billet.motif,
          heureDepart: depart.heureDepart,
        }).billet;
        siegeLibere = true;
      } else if (v.decision === "reporter") {
        billet = appliquerBillet(billet, "reporter", {
          at: evenement.at,
          par: v.validePar.superviseurId,
        });
        siegeLibere = true;
      }
    } catch (e) {
      throw new ErreurHttp(
        409,
        e instanceof Error ? e.message : "Décision impossible",
        "TRANSITION_INTERDITE",
      );
    }
    decidee = true;
    vue.billet.etat = billet.etat;
    return {
      billet: { billetId: billet.id, numero: billet.numero, etat: billet.etat },
      decision: v.decision,
      montant: v.montant,
      siegeLibere,
    };
  });
};

/* ------------------------------------------------------------------ SuperviseurEquipe */

const ROLES: readonly [RegExp, c.RoleEquipe][] = [
  [/^guichetier/, "guichetier"],
  [/^convoyeur/, "convoyeur"],
  [/^chauffeur/, "chauffeur"],
  [/^contrôleu/, "controleur"],
  [/^superviseur/, "superviseur"],
];

function roleEquipe(texte: string): c.RoleEquipe {
  return ROLES.find(([re]) => re.test(texte))?.[1] ?? "guichetier";
}

const ACTIONS_EQUIPE: readonly [string, c.ActionEquipe][] = [
  ["Renouveler", "renouveler_pin"],
  ["Changer de guichet", "changer_affectation"],
  ["Voir son journal", "voir_journal"],
  ["Désactiver", "desactiver"],
];

/** Planche « SuperviseurEquipe » : `useSuperviseurEquipe`, PIN provisoire, comptes, journal. */
export const installerSuperviseurEquipe: InstallateurPlanche<"SuperviseurEquipe"> = (
  ecran,
  poseur,
) => {
  const d = ecran.donnees;
  const entete = capturer(/^(\S+) · (\d+) personnes/, d.detail, "l'en-tête");
  const autres = capturer(/^\+ (\d+) autres(?: \((.+)\))?$/, d.enService.autres, "les autres");
  const regle = capturer(/valable (\d+) h/, d.fiche.regle, "la validité du PIN provisoire");
  const choisie = lire(
    d.enService.personnes.find((p) => "choisi" in p && p.choisi),
    "la personne choisie",
  );
  const ficheDetail = capturer(
    /^(\S+) (depuis .+) · ([\d\s]+) billets$/,
    d.fiche.detail,
    "le détail de la fiche",
  );

  const personnes: c.PersonneEquipe[] = d.enService.personnes.map((p) => {
    const nom = capturer(/^(.+?) · (\S+) · (.+)$/, p.nom, "une personne de l'équipe");
    const etatPin = p.etat.startsWith("PIN à renouveler")
      ? "a_renouveler"
      : p.etat.startsWith("bloquée")
        ? "bloque"
        : "ok";
    const reste = p.etat.split(" · ").slice(1).join(" · ") || null;
    const faux = /(\d+) PIN faux à (\d{2}:\d{2})/.exec(p.etat);
    const situation = reste?.startsWith("en route") ? reste : null;
    return {
      personneId: p._personneId,
      initiales: p.initiales,
      nom: groupe(nom, 1),
      role: roleEquipe(groupe(nom, 2)),
      affectation: groupe(nom, 3),
      statut: p.statut === "à bord" ? "a_bord" : p.statut === "bloquée" ? "bloquee" : "en_service",
      pin: {
        etat: etatPin,
        fauxEssais: faux?.[1] ? Number(faux[1]) : 0,
        bloqueA: faux?.[2] ? iso(faux[2]) : null,
      },
      alerte: etatPin === "bloque" || situation ? null : reste,
      situation,
    };
  });

  const etat: c.SuperviseurEquipe = {
    gare: { id: gareAkwa().id, nom: groupe(entete, 1) },
    effectif: Number(groupe(entete, 2)),
    enService: personnes,
    autres: { nombre: Number(groupe(autres, 1)), detail: autres[2] ?? null },
    fiche: {
      personneId: choisie._personneId,
      nom: d.fiche.nom,
      role: roleEquipe(groupe(ficheDetail, 1)),
      depuisLibelle: groupe(ficheDetail, 2),
      billets: montant(groupe(ficheDetail, 3)),
      actions: d.fiche.actions.map(
        (a) => ACTIONS_EQUIPE.find(([debut]) => a.titre.startsWith(debut))?.[1] ?? "voir_journal",
      ),
      personnesADebloquer: d.fiche.autres
        .filter((x) => x.startsWith("Débloquer "))
        .map((x) => personne(x.replace("Débloquer ", ""))),
    },
    pinProvisoireMinutes: Number(groupe(regle, 1)) * 60,
  };

  poseur.lecture(OP_SUPERVISEUR_EQUIPE, () => etat);
  installerJournal(poseur, ecran.entites);

  const trouver = (personneId: string): c.PersonneEquipe => {
    const p = etat.enService.find((x) => x.personneId === personneId);
    if (!p) throw new ErreurHttp(404, "Personne inconnue", "PERSONNE_INCONNUE");
    return p;
  };
  const resultat = (p: c.PersonneEquipe, actif = true, sms = false) => ({
    personne: { personneId: p.personneId, actif, pin: p.pin.etat, smsProvisoireEnvoye: sms },
  });

  poseur.ecriture(ECRITURES.equipePinRenouvele, (evenement) => {
    verifierSuperviseur(evenement.donnees.validePar);
    const p = trouver(evenement.donnees.personneId);
    // Le PIN provisoire part par SMS ; la personne le remplace à sa première connexion.
    p.pin = { etat: "a_renouveler", fauxEssais: 0, bloqueA: null };
    return resultat(p, true, true);
  });

  poseur.ecriture(ECRITURES.equipeAffectationChangee, (evenement) => {
    const v = evenement.donnees;
    verifierSuperviseur(v.validePar);
    const p = trouver(v.personneId);
    if (v.role) p.role = v.role;
    if (v.guichetId) {
      const rang = MONDE.guichets.find((g) => g.id === v.guichetId)?.rang;
      p.affectation = rang ? `guichet ${rang}` : p.affectation;
    }
    return resultat(p);
  });

  poseur.ecriture(ECRITURES.equipeCompteDesactive, (evenement) => {
    verifierSuperviseur(evenement.donnees.validePar);
    const p = trouver(evenement.donnees.personneId);
    etat.enService = etat.enService.filter((x) => x.personneId !== p.personneId);
    etat.effectif = Math.max(0, etat.effectif - 1);
    return resultat(p, false);
  });

  poseur.ecriture(ECRITURES.equipePersonneDebloquee, (evenement) => {
    verifierSuperviseur(evenement.donnees.validePar);
    const p = trouver(evenement.donnees.personneId);
    if (p.statut !== "bloquee") {
      throw new ErreurHttp(409, "Ce compte n'est pas bloqué", "COMPTE_NON_BLOQUE");
    }
    p.statut = "en_service";
    p.pin = { etat: "ok", fauxEssais: 0, bloqueA: null };
    if (etat.fiche) {
      etat.fiche.personnesADebloquer = etat.fiche.personnesADebloquer.filter(
        (x) => x.id !== p.personneId,
      );
    }
    return resultat(p);
  });
};

/* ------------------------------------------------------------------ SuperviseurDebloquer */

const OPTIONS_PAR_RANG: Readonly<Record<number, c.OptionDeblocage>> = {
  1: "synchroniser",
  2: "debloquer_4h",
  3: "telephone_secours",
};

/** Planche « SuperviseurDebloquer » : `useSuperviseurAppareil`, `useDebloquerAppareil`. */
export const installerSuperviseurDebloquer: InstallateurPlanche<"SuperviseurDebloquer"> = (
  ecran,
  poseur,
) => {
  const d = ecran.donnees;
  const appareil = lire(ecran.entites.appareils?.[0], "l'appareil bloqué");
  const entete = capturer(
    /^Guichet (\d+) · téléphone (\S+) · hors ligne depuis/,
    d.detail,
    "l'en-tête",
  );
  const [ventes, cash, plage] = d.enAttente;
  const colis = capturer(/(\d+) colis/, lire(ventes?.detail, "ventes"), "les colis en attente");
  const numeros = capturer(
    /^(\d+)–(\d+) sans trou$/,
    lire(plage?.detail, "plage"),
    "la plage de numéros",
  );
  const limite = capturer(/plus de (\d+) h/, d.regle.libelle, "la limite hors ligne");

  const vue: c.SuperviseurAppareil = {
    appareil: {
      id: appareil.id,
      code: groupe(entete, 2),
      guichetRang: Number(groupe(entete, 1)),
      gareId: lire(appareil.gareId, "la gare de l'appareil"),
    },
    etat: d._statutDomaine.bloque ? "bloque" : "en_ligne",
    derniereSyncA: appareil.derniereSyncA,
    horsLigneMinutes: d._statutDomaine.horsLigneMinutes,
    limiteHeures: Number(groupe(limite, 1)),
    enAttente: {
      ventes: Number(lire(ventes?.valeur, "ventes")),
      colis: Number(groupe(colis, 1)),
      cash: montant(String(lire(cash?.valeur, "cash"))),
      plage: { debut: Number(groupe(numeros, 1)), fin: Number(groupe(numeros, 2)), trous: [] },
    },
    diagnostics: d.pourquoi.lignes.map((l) => ({
      niveau: "marque" in l ? "alerte" : "info",
      constat: [l.debut, "gras" in l ? l.gras : undefined, "suite" in l ? l.suite : undefined]
        .filter((x): x is string => x !== undefined)
        .join(" "),
    })),
    options: d.queFaire.options.map((o) => ({
      rang: o.rang,
      option: lire(OPTIONS_PAR_RANG[o.rang], "l'option de déblocage"),
      recommande: "etiquette" in o && o.etiquette === "recommandé",
    })),
    rappelSupport: d.rappel.includes("rappel envoyé"),
  };

  poseur.lecture(OP_SUPERVISEUR_APPAREIL, ({ appareilId }) => {
    if (appareilId !== vue.appareil.id)
      throw new ErreurHttp(404, "Appareil inconnu", "APPAREIL_INCONNU");
    return vue;
  });

  let debloqueJusqua: string | null = null;
  let ventesSynchronisees = 0;

  poseur.ecriture(ECRITURES.appareilDebloque, (evenement) => {
    const v = evenement.donnees;
    verifierSuperviseur(v.validePar);
    if (v.appareilId !== vue.appareil.id) {
      throw new ErreurHttp(404, "Appareil inconnu", "APPAREIL_INCONNU");
    }
    if (v.option === "synchroniser") {
      ventesSynchronisees = vue.enAttente.ventes;
      vue.enAttente = { ...vue.enAttente, ventes: 0, colis: 0, cash: 0 };
      vue.etat = "en_ligne";
      vue.horsLigneMinutes = 0;
    } else if (v.option === "debloquer_4h") {
      debloqueJusqua = debloquerTemporairement(evenement.at);
      vue.etat = "debloque_temporairement";
    }
    // « telephone_secours » : le guichet continue sur le téléphone de secours, le GU3 reste bloqué.
    return {
      appareil: { id: vue.appareil.id, etat: vue.etat, debloqueJusqua, ventesSynchronisees },
    };
  });
};

/** Utile aux tests : le rang de guichet d'un identifiant, comme le monde commun le calcule. */
