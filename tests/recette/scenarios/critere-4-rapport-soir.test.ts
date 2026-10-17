import { agence, patron } from "@afrimove/api-client";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { appeler, connecter, fenetreSansBalayage, lire, type Session } from "../support/api";
import {
  clientHttp,
  creerDepart,
  poserColis,
  referentiel,
  type DepartCree,
} from "../support/journee";
import { Poste, TARIF, type BilletVendu, type Evt, type ModePaiement } from "../support/postes";

/**
 * Critère 4 : « le rapport du soir est exact au centime ».
 *
 * Il n'y a pas de centimes en FCFA : « au centime » veut dire ici « au franc près ». La journée est jouée contre la
 * vraie pile (API + PostgreSQL) avec des événements datés d'une journée close, comme le feraient trois téléphones de guichet : vingt
 * ventes en trois modes de paiement, des bagages, des colis, trois caisses clôturées avec un écart chacune, des
 * annulations validées par le PIN du superviseur. Le rapport que le patron lit est ensuite comparé à un décompte
 * indépendant, tenu ici, vente par vente, sans réutiliser une seule ligne de l'API.
 */

const H = 3_600_000;
const MIN = 60_000;

/**
 * Un jour clos, loin derrière : chaque fichier de scénarios a le sien (critère 1 : J-5, critère 2 : J-3, critère 5 : J-6)
 * et aucun ne partage de jour avec ce que les scénarios du « maintenant » vendent (critères 3 et 6), même quand la
 * recette passe minuit à Douala.
 */
const JOUR_DE_LA_RECETTE = 8;

/** Un jour passé à Douala : `jour` (AAAA-MM-JJ) et minuit (en ms). */
function hier(decalage = 1): { jour: string; minuit: number } {
  const local = new Date(Date.now() + H);
  const minuit =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - decalage) - H;
  return { jour: new Date(minuit + H).toISOString().slice(0, 10), minuit };
}

interface Vente {
  guichet: 1 | 2 | 3;
  depart: 0 | 1 | 2;
  mode: ModePaiement;
  bagage?: boolean;
  /** Cash : montant donné par le client. */
  recu?: number;
  /** Heure de la vente (en minutes depuis minuit, Douala). */
  minute: number;
  /** Décision prise sur ce billet par le superviseur. */
  annulation?: { decision: "rembourser" | "avoir" | "refuser"; montant: number; minute: number };
  billet?: BilletVendu;
}

/* Le décompte de la journée. Chaque ligne est un fait qu'on peut recompter à la main. */
const JOURNEE: Vente[] = [
  // Guichet 1, départ de 8 h
  {
    guichet: 1,
    depart: 0,
    mode: "cash",
    minute: 7 * 60 + 40,
    annulation: { decision: "rembourser", montant: 8000, minute: 12 * 60 },
  },
  { guichet: 1, depart: 0, mode: "cash", bagage: true, minute: 7 * 60 + 45 },
  { guichet: 1, depart: 0, mode: "cash", recu: 10_000, minute: 7 * 60 + 50 },
  { guichet: 1, depart: 0, mode: "momo", minute: 7 * 60 + 52 },
  { guichet: 1, depart: 0, mode: "momo", minute: 7 * 60 + 55 },
  { guichet: 1, depart: 0, mode: "orange_money", minute: 7 * 60 + 58 },
  // Guichet 1, départ de 11 h
  { guichet: 1, depart: 1, mode: "cash", minute: 10 * 60 + 10 },
  {
    guichet: 1,
    depart: 1,
    mode: "cash",
    minute: 10 * 60 + 20,
    annulation: { decision: "rembourser", montant: 7000, minute: 12 * 60 + 5 },
  },
  { guichet: 1, depart: 1, mode: "cash", minute: 10 * 60 + 30 },
  // Guichet 2, départs de 11 h et de 15 h
  { guichet: 2, depart: 1, mode: "cash", minute: 9 * 60 + 15 },
  { guichet: 2, depart: 1, mode: "cash", minute: 9 * 60 + 20 },
  {
    guichet: 2,
    depart: 1,
    mode: "momo",
    minute: 9 * 60 + 40,
    annulation: { decision: "avoir", montant: 8000, minute: 12 * 60 + 10 },
  },
  { guichet: 2, depart: 1, mode: "momo", minute: 9 * 60 + 45 },
  { guichet: 2, depart: 1, mode: "orange_money", bagage: true, minute: 9 * 60 + 50 },
  {
    guichet: 2,
    depart: 2,
    mode: "cash",
    minute: 13 * 60 + 10,
    annulation: { decision: "refuser", montant: 0, minute: 12 * 60 + 15 },
  },
  { guichet: 2, depart: 2, mode: "cash", bagage: true, minute: 13 * 60 + 20 },
  { guichet: 2, depart: 2, mode: "cash", minute: 13 * 60 + 25 },
  { guichet: 2, depart: 2, mode: "cash", bagage: true, recu: 9000, minute: 13 * 60 + 30 },
  // Guichet 3, départ de 15 h
  { guichet: 3, depart: 2, mode: "momo", minute: 14 * 60 },
  { guichet: 3, depart: 2, mode: "cash", minute: 14 * 60 + 5 },
  { guichet: 3, depart: 2, mode: "cash", minute: 14 * 60 + 10 },
];

/** Les caisses : fond de caisse et ce que l'agent a réellement compté, en plus ou en moins de l'attendu. */
const CAISSES = {
  1: { fond: 50_000, manque: 500, pieces: 250, ouverte: 6 * 60 + 50, fermee: 18 * 60 },
  2: { fond: 25_000, manque: 0, pieces: 0, ouverte: 7 * 60 + 5, fermee: 18 * 60 + 10 },
  3: { fond: 10_000, manque: 2500, pieces: 0, ouverte: 7 * 60 + 10, fermee: 18 * 60 + 20 },
} as const;

/** Les colis déposés au guichet (posés en base, voir `poserColis`). */
const COLIS = [
  { guichet: 1, mode: "cash", montant: 2000, minute: 9 * 60 },
  { guichet: 1, mode: "momo", montant: 1500, minute: 9 * 60 + 30 },
  { guichet: 2, mode: "cash", montant: 3500, minute: 10 * 60 },
] as const;

const HEURES_DEPARTS = [8, 11, 15];

const prix = (v: Vente): number => TARIF.classique + (v.bagage ? TARIF.bagage : 0);
const estCash = (v: Vente): boolean => v.mode === "cash";
const annule = (v: Vente): boolean =>
  v.annulation !== undefined &&
  (v.annulation.decision === "rembourser" || v.annulation.decision === "avoir");

/* ------------------------------------------------------------------ l'oracle (décompte indépendant) */

function sommer(valeurs: number[]): number {
  return valeurs.reduce((a, b) => a + b, 0);
}

const ventesTenues = (): Vente[] => JOURNEE.filter((v) => !annule(v));

const attenduDe = (rang: 1 | 2 | 3): number => {
  const c = CAISSES[rang];
  // Un billet annulé a été encaissé : il reste dans les entrées, son remboursement cash sort de la caisse.
  const billetsCash = sommer(JOURNEE.filter((v) => v.guichet === rang && estCash(v)).map(prix));
  const colisCash = sommer(
    COLIS.filter((k) => k.guichet === rang && k.mode === "cash").map((k) => k.montant),
  );
  const rembourse = sommer(
    JOURNEE.filter(
      (v) => v.guichet === rang && v.annulation?.decision === "rembourser" && estCash(v),
    ).map((v) => v.annulation!.montant),
  );
  return c.fond + billetsCash + colisCash - rembourse;
};
const comptéDe = (rang: 1 | 2 | 3): number => attenduDe(rang) - CAISSES[rang].manque;
const ecartDe = (rang: 1 | 2 | 3): number => 0 - CAISSES[rang].manque;

let guichetier: Record<1 | 2 | 3, Session>;
let superviseur: Session;
let patronSession: Session;
let jour: string;
let minuit: number;
let veille: { jour: string; minuit: number };
let departs: DepartCree[];
let sessionsCaisse: Record<1 | 2 | 3, string>;
let nomSuperviseur: string;
let evenementValidationG3: Evt;
let nbBilletsVeille = 0;

beforeAll(async () => {
  await fenetreSansBalayage();
  guichetier = {
    1: await connecter("guichetier"),
    2: await connecter("guichetier2"),
    3: await connecter("guichetier3"),
  };
  superviseur = await connecter("superviseur");
  patronSession = await connecter("patron");
  nomSuperviseur = lire<{ nom: string }>(
    `select nom from personne where id = '${superviseur.id}'`,
  )[0]!.nom;

  const d = hier(JOUR_DE_LA_RECETTE);
  jour = d.jour;
  minuit = d.minuit;
  veille = hier(JOUR_DE_LA_RECETTE + 1);
  const a = (heure: number, jourMinuit = minuit): Date => new Date(jourMinuit + heure * H);
  departs = HEURES_DEPARTS.map((h, i) => creerDepart({ heureDepart: a(h), bus: i }));

  /* ---- la veille : quinze billets (pour la variation du nombre de billets) ---- */
  const departVeille = creerDepart({ heureDepart: a(9, veille.minuit), bus: 0 });
  for (const rang of [1, 2, 3] as const) {
    const poste = new Poste(guichetier[rang], rang, veille.minuit + 9 * H);
    for (let siege = 1; siege <= 5; siege++) {
      await poste.vendre({ depart: departVeille, siege: siege + (rang - 1) * 5, mode: "cash" });
      nbBilletsVeille++;
      await poste.horloge.avancer(MIN);
    }
  }

  /* ---- le jour du rapport : les ventes ---- */
  const postes = {
    1: new Poste(guichetier[1], 1, minuit + 7 * H),
    2: new Poste(guichetier[2], 2, minuit + 7 * H),
    3: new Poste(guichetier[3], 3, minuit + 7 * H),
  };
  const sieges = [0, 0, 0];
  const dansLOrdre = [...JOURNEE].sort((x, y) => x.minute - y.minute);
  for (const v of dansLOrdre) {
    const poste = postes[v.guichet];
    await poste.aHeure(minuit + v.minute * MIN);
    sieges[v.depart]! += 1;
    v.billet = await poste.vendre({
      depart: departs[v.depart]!,
      siege: sieges[v.depart]!,
      mode: v.mode,
      bagage: v.bagage ?? false,
      ...(v.recu === undefined ? {} : { recu: v.recu }),
    });
  }

  /* ---- le jour du rapport : les colis ---- */
  COLIS.forEach((k, i) => {
    poserColis({
      numeroSequence: i + 1,
      agentId: guichetier[k.guichet].id,
      creeA: minuit + k.minute * MIN,
      mode: k.mode,
      montant: k.montant,
      departId: departs[1]!.id,
    });
  });

  /* ---- les preuves du PIN, prises avant : elles valent dix minutes et ne dépendent que des événements ---- */
  sessionsCaisse = {
    1: randomUUID(),
    2: randomUUID(),
    3: randomUUID(),
  };
  const sup = new Poste(superviseur, 1, minuit + 12 * H);
  const demandeurs = {
    1: new Poste(guichetier[1], 1, minuit + 10 * H),
    2: new Poste(guichetier[2], 2, minuit + 10 * H),
    3: new Poste(guichetier[3], 3, minuit + 10 * H),
  };
  const caissiers = {
    1: new Poste(guichetier[1], 1, minuit + CAISSES[1].ouverte * MIN),
    2: new Poste(guichetier[2], 2, minuit + CAISSES[2].ouverte * MIN),
    3: new Poste(guichetier[3], 3, minuit + CAISSES[3].ouverte * MIN),
  };
  const decisions: Array<{ vente: Vente; demande: Evt; decision: Evt }> = [];
  for (const v of JOURNEE.filter((x) => x.annulation).sort(
    (x, y) => x.annulation!.minute - y.annulation!.minute,
  )) {
    const an = v.annulation!;
    const demandeur = demandeurs[v.guichet];
    await demandeur.aHeure(minuit + (an.minute - 20) * MIN);
    const { demandeId, evenement: demande } = demandeur.demandeAnnulation(
      v.billet!.billetId,
      "Le client a changé de programme",
    );
    await sup.aHeure(minuit + an.minute * MIN);
    const brut = sup.evenementValide(agence.ECRITURES.annulationDecidee.evenement, {
      demandeId,
      billetId: v.billet!.billetId,
      decision: an.decision,
      montant: an.montant,
    });
    decisions.push({ vente: v, demande, decision: await sup.signerParPin(brut) });
  }
  const validations: Record<1 | 2, Evt> = { 1: {}, 2: {} };
  await sup.aHeure(minuit + 19 * H);
  for (const rang of [1, 2] as const) {
    validations[rang] = await sup.signerParPin(
      sup.evenementValide(agence.ECRITURES.caisseValidee.evenement, {
        sessionId: sessionsCaisse[rang],
        ecart: ecartDe(rang),
        commentaire:
          rang === 1 ? "Il manque 500 F, le guichetier a rendu la monnaie en pièces" : null,
      }),
    );
  }
  evenementValidationG3 = await sup.signerParPin(
    sup.evenementValide(agence.ECRITURES.caisseValidee.evenement, {
      sessionId: sessionsCaisse[3],
      ecart: ecartDe(3),
      commentaire: "Écart hors tolérance, le guichetier a été reçu",
    }),
  );

  /* ---- les caisses, sans traîner : le système clôture à minuit toute caisse restée ouverte (toutes les minutes) ---- */
  const client = clientHttp(superviseur);
  for (const rang of [1, 2, 3] as const) {
    const caissier = caissiers[rang];
    await caissier.ouvrirCaisse(CAISSES[rang].fond, sessionsCaisse[rang]);
    for (const x of decisions.filter((y) => y.vente.guichet === rang)) {
      await clientHttp(guichetier[rang]).executer(
        agence.ECRITURES.annulationDemandee.operation,
        x.demande as never,
      );
      await client.executer(agence.ECRITURES.annulationDecidee.operation, x.decision as never);
    }
    await caissier.aHeure(minuit + CAISSES[rang].fermee * MIN);
    await caissier.fermerCaisse(
      sessionsCaisse[rang],
      comptéDe(rang),
      attenduDe(rang),
      CAISSES[rang].pieces,
    );
  }
  for (const rang of [1, 2] as const) {
    await client.executer(agence.ECRITURES.caisseValidee.operation, validations[rang] as never);
  }
});

async function lireRapport() {
  return clientHttp(patronSession).executer(patron.OP_RAPPORT_SOIR, { jour });
}

describe("critère 4 : rapport du soir exact au franc près", () => {
  it("les caisses sont celles que le décompte indépendant annonce, à l'écart près", async () => {
    for (const rang of [1, 2, 3] as const) {
      const [s] = lire<{ etat: string; cloture: any }>(
        `select etat, cloture from session_caisse where id = '${sessionsCaisse[rang]}'`,
      );
      expect(s?.cloture.cashAttendu, `attendu du guichet ${rang}`).toBe(attenduDe(rang));
      expect(s?.cloture.cashCompte, `compté du guichet ${rang}`).toBe(comptéDe(rang));
      expect(s?.cloture.ecart, `écart du guichet ${rang}`).toBe(ecartDe(rang));
      // Plus un seul écart entre ce que l'appareil annonçait et ce que le serveur a recompté.
      expect(s?.cloture.divergenceAppareil, `divergence du guichet ${rang}`).toBe(0);
      expect(s?.etat).toBe(rang === 3 ? "cloturee" : "validee");
    }
  });

  it("le rapport du patron reprend chaque chiffre du décompte, au franc près", async () => {
    const rapport = await lireRapport();
    const tenues = ventesTenues();
    const recette = sommer(tenues.map(prix)) + sommer(COLIS.map((k) => k.montant));
    const cash =
      sommer(tenues.filter(estCash).map(prix)) +
      sommer(COLIS.filter((k) => k.mode === "cash").map((k) => k.montant));

    expect(rapport.jour).toBe(jour);
    expect(rapport.chiffres.billets).toBe(tenues.length);
    expect(rapport.chiffres.colis).toBe(COLIS.length);
    expect(rapport.chiffres.recette).toBe(recette);
    expect(rapport.chiffres.cash).toBe(cash);
    expect(rapport.chiffres.momo).toBe(recette - cash);
    expect(rapport.chiffres.cash + rapport.chiffres.momo).toBe(rapport.chiffres.recette);
    expect(rapport.chiffres.litiges).toBe(0);
    expect(rapport.chiffres.variationBilletsPct).toBe(
      Math.round(((tenues.length - nbBilletsVeille) * 1000) / nbBilletsVeille) / 10,
    );
    // Tous les montants sont des francs entiers.
    for (const n of [rapport.chiffres.recette, rapport.chiffres.cash, rapport.chiffres.momo]) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("la gare, les écarts de caisse et les remarques sont ceux de la journée", async () => {
    const rapport = await lireRapport();
    const ref = referentiel();
    const nbGares = lire<{ n: number }>(
      `select count(*)::int as n from gare where "compagnieId" = '${ref.compagnieId}'`,
    )[0]!.n;
    expect(rapport.nbGares).toBe(nbGares);
    expect(rapport.gares).toHaveLength(nbGares);
    const dla = rapport.gares.find((g) => g.gareId === ref.gareDlaId)!;
    expect(dla.billets).toBe(ventesTenues().length);
    expect(dla.ecart).toBe(ecartDe(1) + ecartDe(2) + ecartDe(3));
    for (const g of rapport.gares.filter((x) => x.gareId !== ref.gareDlaId))
      expect(g.billets).toBe(0);

    const f = " ";
    expect(dla.remarques).toContain("3 guichets clôturés");
    expect(dla.remarques).toContain(`guichet 1, validé par ${nomSuperviseur}`);
    expect(dla.remarques).toContain(`guichet 3, caisse non validée (écart −2${f}500 F)`);
    // Le guichet 2 est exact et validé : rien à dire de lui.
    expect(dla.remarques.some((r) => r.startsWith("guichet 2"))).toBe(false);
    // La signature du superviseur figure une fois pour la gare.
    expect(rapport.signatures).toEqual([{ nom: nomSuperviseur, gare: dla.nom }]);

    const libelle = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Africa/Douala",
    }).format(new Date(minuit + 12 * H));
    expect(rapport.titre).toBe(
      `Rapport du ${libelle} · ${nbGares} ${nbGares > 1 ? "gares" : "gare"}`,
    );
  });

  it("les annulations validées par PIN et le remplissage sont ceux de la journée", async () => {
    const rapport = await lireRapport();
    // Rembourser et avoir comptent, refuser non : 8 000 + 7 000 + 8 000.
    const rendues = JOURNEE.filter(annule);
    expect(rapport.annulations).toEqual({
      nombre: rendues.length,
      montant: sommer(rendues.map((v) => v.annulation!.montant)),
      toutesAvecPin: true,
    });
    const vendus = [0, 1, 2].map((i) => ventesTenues().filter((v) => v.depart === i).length);
    const moyen = Math.round((sommer(vendus) * 1000) / (3 * 70)) / 10;
    expect(rapport.remplissage.moyenPct).toBe(moyen);
    // Le départ de 8 h est le moins rempli : c'est lui que le rapport signale.
    const faible = vendus.indexOf(Math.min(...vendus));
    expect(rapport.remplissage.remarque).toMatch(
      new RegExp(
        `^le 0${HEURES_DEPARTS[faible]}:00 .* part à ${Math.round((vendus[faible]! * 100) / 70)} %$`,
      ),
    );
    expect(rapport.enLigne).toEqual({ billets: 0, partPct: 0 });
    expect(rapport.enRoute.billetsConvoyeurs).toBe(0);
  });

  it("constat : sur un remboursement partiel, la retenue reste en caisse mais n'est pas dans le cash du rapport", async () => {
    const rapport = await lireRapport();
    // Le rapport écarte tout le billet annulé (8 000 F) ; la caisse garde la retenue (1 000 F quand on rembourse
    // 7 000 F sur 8 000 F). Le cash net qui a changé de mains dépasse donc le cash du rapport de la retenue.
    // À trancher avec Luther : la retenue est-elle une recette du jour ?
    const cashNet = sommer(([1, 2, 3] as const).map((r) => attenduDe(r) - CAISSES[r].fond));
    const retenue = sommer(
      JOURNEE.filter((v) => annule(v) && estCash(v)).map((v) => prix(v) - v.annulation!.montant),
    );
    expect(retenue).toBe(1000);
    expect(cashNet - rapport.chiffres.cash).toBe(retenue);
  });

  it("le rapport est arrêté une fois pour toutes : valider la dernière caisse plus tard ne le change pas", async () => {
    const avant = await lireRapport();
    await clientHttp(superviseur).executer(
      agence.ECRITURES.caisseValidee.operation,
      evenementValidationG3 as never,
    );
    const [s] = lire<{ etat: string }>(
      `select etat from session_caisse where id = '${sessionsCaisse[3]}'`,
    );
    expect(s?.etat).toBe("validee");
    const apres = await lireRapport();
    expect(apres).toEqual(avant);
    // Et la lecture brute (ce que la passerelle WhatsApp lit) donne la même chose.
    const brut = await appeler("GET", "/patron/rapports/soir", {
      jeton: patronSession.jeton,
      requete: { jour },
    });
    expect(brut.statut).toBe(200);
    expect(brut.corps).toEqual(avant);
  });

  it("un rapport demandé trop tôt, ou à une mauvaise date, est refusé proprement", async () => {
    const demain = new Date(Date.now() + 36 * H).toISOString().slice(0, 10);
    const trop = await appeler("GET", "/patron/rapports/soir", {
      jeton: patronSession.jeton,
      requete: { jour: demain },
    });
    expect(trop.statut).toBe(404);
    expect(trop.corps.code).toBe("RAPPORT_PAS_ENCORE");
    const mauvais = await appeler("GET", "/patron/rapports/soir", {
      jeton: patronSession.jeton,
      requete: { jour: "hier" },
    });
    expect(mauvais.statut).toBe(400);
    // Un guichetier ne lit pas le rapport du patron.
    const interdit = await appeler("GET", "/patron/rapports/soir", {
      jeton: guichetier[1].jeton,
      requete: { jour },
    });
    expect(interdit.statut).toBe(403);
  });
});
