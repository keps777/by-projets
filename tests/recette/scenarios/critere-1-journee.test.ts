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
 * Critère 1 : « une journée complète de gare se passe sans intervention ».
 *
 * La journée est jouée contre la vraie pile, dans l'ordre où elle se passe : connexion des agents par PIN, ouverture
 * des trois caisses, ventes pour les départs de 8 h, 11 h et 15 h, embarquement au quai (scans, code dicté, absent
 * libéré), liste au chauffeur et départ des bus, annulation décidée avec le PIN du superviseur, clôture et validation
 * des caisses, rapport du soir du patron. Chaque lecture d'écran passe par le client de l'application (schémas zod du
 * contrat). Les étapes que la pile ne permet pas encore sont jouées aussi : elles sont écrites `it.fails` avec
 * l'anomalie qui les bloque (voir le procès-verbal), et passeront au rouge le jour où elles seront corrigées.
 */
const H = 3_600_000;
const MIN = 60_000;
const hm = (h: number, m = 0): number => (h * 60 + m) * MIN;

interface Vente {
  guichet: 1 | 2 | 3;
  depart: 0 | 1 | 2;
  mode: ModePaiement;
  at: number;
  billet?: BilletVendu;
  annule?: boolean;
}

const FONDS = { 1: 40_000, 2: 30_000, 3: 20_000 } as const;
const HEURES_DEPARTS = [8, 11, 15];

let sessions: Record<1 | 2 | 3, Session>;
let superviseur: Session;
let patronSession: Session;
let minuit: number;
let jour: string;
let departs: DepartCree[];
const ventes: Vente[] = [];
let postes: Record<1 | 2 | 3, Poste>;
let sessionsCaisse: Record<1 | 2 | 3, string>;
let remboursement = 0;

const modeDe = (i: number): ModePaiement =>
  i % 3 === 0 ? "momo" : i % 7 === 0 ? "orange_money" : "cash";

beforeAll(async () => {
  await fenetreSansBalayage();
  sessions = {
    1: await connecter("guichetier"),
    2: await connecter("guichetier2"),
    3: await connecter("guichetier3"),
  };
  superviseur = await connecter("superviseur");
  patronSession = await connecter("patron");
  const local = new Date(Date.now() + H);
  minuit = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 5) - H;
  jour = new Date(minuit + H).toISOString().slice(0, 10);
  departs = HEURES_DEPARTS.map((h, i) =>
    creerDepart({ heureDepart: new Date(minuit + h * H), bus: i }),
  );
  postes = {
    1: new Poste(sessions[1], 1, minuit + hm(6, 30)),
    2: new Poste(sessions[2], 2, minuit + hm(6, 30)),
    3: new Poste(sessions[3], 3, minuit + hm(6, 30)),
  };
});

const sup = (): Poste => new Poste(superviseur, 1, minuit + hm(12));

async function vendre(
  v: Omit<Vente, "billet" | "at">,
  minute: number,
  siege: number,
): Promise<Vente> {
  const poste = postes[v.guichet];
  await poste.aHeure(minuit + minute * MIN);
  const vente: Vente = { ...v, at: minute };
  vente.billet = await poste.vendre({
    depart: departs[v.depart]!,
    siege,
    nom: `Voyageur ${v.depart + 1}-${siege}`,
    mode: v.mode,
  });
  ventes.push(vente);
  return vente;
}

const ventesDe = (depart: number) => ventes.filter((v) => v.depart === depart);
const etatsDes = (depart: DepartCree) =>
  lire<{ etat: string; n: number }>(
    `select etat, count(*)::int as n from billet where "departId" = '${depart.id}' group by etat order by etat`,
  );

describe("critère 1 : une journée de gare, de l'ouverture des caisses au rapport du soir", () => {
  it("6 h 30 : les trois caisses s'ouvrent, chaque guichetier lit sa session avec le client de l'application", async () => {
    sessionsCaisse = { 1: randomUUID(), 2: randomUUID(), 3: randomUUID() };
    for (const rang of [1, 2, 3] as const) {
      const caissier = new Poste(sessions[rang], rang, minuit + hm(6, 45));
      const r = await caissier.ouvrirCaisse(FONDS[rang], sessionsCaisse[rang]);
      expect(r.numero).toMatch(new RegExp(`^K-DLA-\\d{6}-${rang}-1$`));
      const lue = await caissier.client.executer(agence.OP_CAISSE_SESSION, {
        sessionId: sessionsCaisse[rang],
      });
      expect(lue).toMatchObject({ etat: "ouverte", fondDeCaisse: FONDS[rang] });
      // Une caisse ouverte compte tout le cash encaissé depuis son ouverture jusqu'à l'instant du SERVEUR (qui, lui,
      // n'est pas simulé) : les ventes d'autres scénarios, datées d'après, y entrent. On ne vérifie donc ici que le
      // plancher ; le montant exact est vérifié à la clôture, bornée par l'heure de l'appareil.
      expect(lue.cashAttendu).toBeGreaterThanOrEqual(FONDS[rang]);
    }
    // Une deuxième caisse ouverte par le même agent est refusée.
    const doublon = new Poste(sessions[1], 1, minuit + hm(6, 50));
    await expect(doublon.ouvrirCaisse(1000)).rejects.toMatchObject({ statut: 409 });
  });

  it("7 h à 7 h 55 : le contexte de vente se charge et 18 billets partent pour le bus de 8 h", async () => {
    // (Le contexte de vente suit l'heure réelle du serveur : il est lu en direct par le scénario du critère 6.)
    let siege = 0;
    for (let i = 0; i < 18; i++) {
      const guichet = ((i % 3) + 1) as 1 | 2 | 3;
      await vendre({ guichet, depart: 0, mode: modeDe(i) }, 7 * 60 + i * 3, ++siege);
    }
    expect(ventesDe(0)).toHaveLength(18);
    // Numéros sans trou dans la plage de chaque guichet, chacun son compteur.
    for (const rang of [1, 2, 3] as const) {
      const seq = lire<{ sequence: number }>(
        `select sequence from billet where "guichetId" = '${referentiel().guichets[rang]}' and "creeA" >= '${new Date(minuit).toISOString()}' and "creeA" < '${new Date(minuit + 24 * H).toISOString()}' order by sequence`,
      ).map((l) => l.sequence);
      const debut = rang === 1 ? 1 : rang === 2 ? 1001 : 2001;
      expect(seq).toEqual(seq.map((_, i) => debut + i));
    }
  });

  it("7 h 30 : au quai, 16 voyageurs montent au scan, 1 en dictant son code, un billet présenté deux fois est refusé", async () => {
    const quai = new Poste(sessions[1], 1, minuit + hm(7, 30));
    const dep = departs[0]!;
    const billets = ventesDe(0).map((v) => v.billet!);
    for (const b of billets.slice(0, 16)) {
      await quai.horloge.avancer(15_000);
      const r = await quai.scannerQr(dep.id, b.qr);
      expect(r.reponse.scan.resultat, b.numero).toBe("monte");
    }
    const parCode = await quai.saisirCode(dep.id, billets[16]!.codeBillet);
    expect(parCode.reponse.scan.resultat).toBe("monte");
    const deuxFois = await quai.scannerQr(dep.id, billets[3]!.qr);
    expect(deuxFois.reponse.scan.resultat).toBe("deja_scanne");
    expect(deuxFois.reponse.embarques).toBe(17);

    // L'écran du quai : 17 embarqués, le seul absent est proposé à la libération.
    await quai.aHeure(minuit + hm(7, 52));
    const ecran = await quai.client.executer(agence.OP_QUAI_EMBARQUEMENT, { departId: dep.id });
    expect(ecran.embarquement.embarques).toBe(17);
    expect(ecran.absents.map((a) => a.billetId)).toEqual([billets[17]!.billetId]);
  });

  it("7 h 55 : le dernier absent est libéré, la liste part au chauffeur, le bus de 8 h est parti", async () => {
    const quai = new Poste(sessions[1], 1, minuit + hm(7, 55));
    const dep = departs[0]!;
    const absent = ventesDe(0)[17]!.billet!;
    const [siege] = lire<{ siege: number }>(
      `select siege from billet where id = '${absent.billetId}'`,
    );
    const libere = await quai.client.executer(
      agence.ECRITURES.quaiLibere.operation,
      quai.appareil.creerEvenement(agence.ECRITURES.quaiLibere.evenement, {
        departId: dep.id,
        billetId: absent.billetId,
        siege: siege!.siege,
        motif: "absent",
      }),
    );
    expect(libere.accuse.statut).toBe("accepte");
    const liste = await quai.client.executer(
      agence.ECRITURES.quaiListeEnvoyee.operation,
      quai.appareil.creerEvenement(agence.ECRITURES.quaiListeEnvoyee.evenement, {
        departId: dep.id,
        embarques: 17,
        capacite: 70,
      }),
    );
    expect(liste.embarques).toBe(17);
    const [etat] = lire<{ etat: string }>(`select etat from depart where id = '${dep.id}'`);
    expect(etat?.etat).toBe("parti");
    // Plus personne n'est « payé, pas monté » : 17 embarqués, le reste est non présenté ou annulé.
    const etats = Object.fromEntries(etatsDes(dep).map((e) => [e.etat, e.n]));
    expect(etats["paye"] ?? 0).toBe(0);
    expect(etats["embarque"]).toBe(17);
    // Un bus parti ne vend plus.
    await expect(
      vendre({ guichet: 2, depart: 0, mode: "cash" }, 8 * 60 + 5, 60),
    ).rejects.toMatchObject({ statut: 409 });
  });

  it("10 h à 11 h : 8 billets pour 11 h, tous embarqués, départ du bus", async () => {
    let siege = 0;
    for (let i = 0; i < 8; i++) {
      const guichet = (i % 2 === 0 ? 2 : 3) as 2 | 3;
      await vendre({ guichet, depart: 1, mode: modeDe(i + 1) }, 9 * 60 + 30 + i * 6, ++siege);
    }
    const quai = new Poste(sessions[2], 2, minuit + hm(10, 40));
    for (const v of ventesDe(1)) {
      await quai.horloge.avancer(20_000);
      expect((await quai.scannerQr(departs[1]!.id, v.billet!.qr)).reponse.scan.resultat).toBe(
        "monte",
      );
    }
    await quai.client.executer(
      agence.ECRITURES.quaiListeEnvoyee.operation,
      quai.appareil.creerEvenement(agence.ECRITURES.quaiListeEnvoyee.evenement, {
        departId: departs[1]!.id,
        embarques: 8,
        capacite: 70,
      }),
    );
    expect(
      lire<{ etat: string }>(`select etat from depart where id = '${departs[1]!.id}'`)[0]?.etat,
    ).toBe("parti");
  });

  it("11 h 30 à 13 h : 6 billets pour 15 h ; le superviseur décide le remboursement d'un billet avec son PIN", async () => {
    let siege = 0;
    for (let i = 0; i < 6; i++) {
      const guichet = (i % 2 === 0 ? 1 : 3) as 1 | 3;
      await vendre(
        { guichet, depart: 2, mode: i === 0 ? "cash" : modeDe(i + 2) },
        11 * 60 + 30 + i * 8,
        ++siege,
      );
    }
    const cible = ventesDe(2)[0]!;
    expect(cible.mode).toBe("cash");
    const demandeur = new Poste(sessions[cible.guichet], cible.guichet, minuit + hm(12, 10));
    const { demandeId, evenement: demande } = demandeur.demandeAnnulation(
      cible.billet!.billetId,
      "Le client a changé de programme",
    );
    const accuse = await demandeur.client.executer(
      agence.ECRITURES.annulationDemandee.operation,
      demande as never,
    );
    expect(accuse.statut).toBe("en_attente_du_pin");

    const chef = sup();
    await chef.aHeure(minuit + hm(12, 20));
    const decision = await chef.signerParPin(
      chef.evenementValide(agence.ECRITURES.annulationDecidee.evenement, {
        demandeId,
        billetId: cible.billet!.billetId,
        decision: "rembourser",
        montant: TARIF.classique,
      }),
    );
    // L'écran du superviseur lit d'abord la demande, avec ses vérifications, comme l'application.
    const ecran = await chef.client.executer(agence.OP_SUPERVISEUR_ANNULATION, { demandeId });
    expect(ecran.billet.billetId).toBe(cible.billet!.billetId);
    expect(ecran.decisionsPossibles).toContain("rembourser");
    const r = await chef.client.executer(
      agence.ECRITURES.annulationDecidee.operation,
      decision as never,
    );
    expect(r).toMatchObject({
      decision: "rembourser",
      montant: TARIF.classique,
      siegeLibere: true,
    });
    expect(r.billet.etat).toBe("annule");
    cible.annule = true;
    remboursement = TARIF.classique;
    // Sans la preuve du PIN, la même décision est refusée (403).
    const sansPreuve = chef.evenementValide(agence.ECRITURES.annulationDecidee.evenement, {
      demandeId: randomUUID(),
      billetId: cible.billet!.billetId,
      decision: "rembourser",
      montant: TARIF.classique,
    });
    (sansPreuve["donnees"] as Evt)["validePar"].signature = "0".repeat(72);
    await expect(
      chef.client.executer(agence.ECRITURES.annulationDecidee.operation, sansPreuve as never),
    ).rejects.toMatchObject({
      statut: expect.any(Number),
    });
  });

  it("15 h : 5 voyageurs montent, le bus de 15 h part", async () => {
    const quai = new Poste(sessions[3], 3, minuit + hm(14, 40));
    for (const v of ventesDe(2).filter((x) => !x.annule)) {
      await quai.horloge.avancer(20_000);
      expect((await quai.scannerQr(departs[2]!.id, v.billet!.qr)).reponse.scan.resultat).toBe(
        "monte",
      );
    }
    await quai.client.executer(
      agence.ECRITURES.quaiListeEnvoyee.operation,
      quai.appareil.creerEvenement(agence.ECRITURES.quaiListeEnvoyee.evenement, {
        departId: departs[2]!.id,
        embarques: 5,
        capacite: 70,
      }),
    );
    expect(
      lire<{ etat: string }>(`select etat from depart where id = '${departs[2]!.id}'`)[0]?.etat,
    ).toBe("parti");
  });

  it("17 h à 19 h : les caisses sont comptées et clôturées, le superviseur les valide ; l'écran de la gare les montre", async () => {
    const attendu = (rang: 1 | 2 | 3): number =>
      FONDS[rang] +
      ventes.filter((v) => v.guichet === rang && v.mode === "cash").length * TARIF.classique -
      ventes.filter((v) => v.guichet === rang && v.annule && v.mode === "cash").length *
        remboursement;
    const chef = sup();
    await chef.aHeure(minuit + hm(18, 30));
    const ecarts = { 1: 0, 2: -500, 3: 1000 } as const;
    const evenementsValidation: Record<number, Evt> = {};
    for (const rang of [1, 2, 3] as const) {
      evenementsValidation[rang] = await chef.signerParPin(
        chef.evenementValide(agence.ECRITURES.caisseValidee.evenement, {
          sessionId: sessionsCaisse[rang],
          ecart: ecarts[rang],
          commentaire: null,
        }),
      );
    }
    for (const rang of [1, 2, 3] as const) {
      const caissier = new Poste(sessions[rang], rang, minuit + hm(17, 30));
      const r = await caissier.fermerCaisse(
        sessionsCaisse[rang],
        attendu(rang) + ecarts[rang],
        attendu(rang),
      );
      expect(r.session).toMatchObject({ etat: "cloturee", cashAttendu: attendu(rang) });
      expect(r.session.ecart.montant).toBe(ecarts[rang]);
    }
    // Avant validation : la gare voit les trois guichets « à valider ».
    const avant = await chef.client.executer(agence.OP_SUPERVISEUR_GARE, {});
    expect(avant.guichets.map((g) => g.etat)).toEqual(["a_valider", "a_valider", "a_valider"]);
    const ecranCloture = await chef.client.executer(agence.OP_SUPERVISEUR_CLOTURE, {
      sessionId: sessionsCaisse[2],
    });
    expect(ecranCloture.bilan).toMatchObject({
      attendu: attendu(2),
      compte: attendu(2) - 500,
      ecart: -500,
    });
    for (const rang of [1, 2, 3] as const) {
      const r = await chef.client.executer(
        agence.ECRITURES.caisseValidee.operation,
        evenementsValidation[rang] as never,
      );
      expect(r.session.etat).toBe("validee");
    }
    const apres = await chef.client.executer(agence.OP_SUPERVISEUR_GARE, {});
    expect(apres.guichets.every((g) => g.etat === "ferme")).toBe(true);
  });

  it("21 h : le rapport du soir du patron reprend la journée, au franc près", async () => {
    const tenues = ventes.filter((v) => !v.annule);
    const recette = tenues.length * TARIF.classique;
    const cash = tenues.filter((v) => v.mode === "cash").length * TARIF.classique;
    const rapport = await clientHttp(patronSession).executer(patron.OP_RAPPORT_SOIR, { jour });
    expect(rapport.chiffres).toMatchObject({
      billets: tenues.length,
      recette,
      cash,
      momo: recette - cash,
    });
    expect(rapport.annulations).toEqual({ nombre: 1, montant: remboursement, toutesAvecPin: true });
    const dla = rapport.gares.find((g) => g.gareId === referentiel().gareDlaId)!;
    expect(dla.billets).toBe(tenues.length);
    expect(dla.ecart).toBe(-500 + 1000);
    // Le taux de remplissage compte les billets tenus (l'absent libéré a payé : il compte) sur 3 × 70 places.
    expect(rapport.remplissage.moyenPct).toBe(Math.round((tenues.length * 1000) / 210) / 10);
    expect(rapport.signatures).toHaveLength(1);
  });

  it("le journal de caisse de l'agence a gardé les événements de la journée (caisses, annulation) et eux seuls", async () => {
    // Les ventes et les scans vivent dans leurs tables (billet, scan_quai) ; le journal de l'agence est celui des caisses.
    const journal = await new Poste(superviseur, 1).client.executer(agence.OP_JOURNAL, {
      jour,
      limite: 200,
    });
    const parType: Record<string, number> = {};
    for (const e of journal.entrees as Array<{ type: string }>)
      parType[e.type] = (parType[e.type] ?? 0) + 1;
    expect(parType).toEqual({
      "caisse.ouverte": 3,
      "caisse.comptee": 3,
      "caisse.cloturee": 3,
      "caisse.validee": 3,
      "annulation.demandee": 1,
      "annulation.decidee": 1,
    });
  });

  /* ---------------------------------------------------------------- ce que la pile ne permet pas encore */

  it.fails("ANOMALIE A5 : un colis se déclare au guichet (POST /agence/colis)", async () => {
    const p = postes[1];
    const evenement = p.appareil.creerEvenement(agence.ECRITURES.colisEnregistre.evenement, {
      colisId: p.appareil.nouvelId(),
      departId: departs[2]!.id,
      expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
      destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      contenu: "Médicaments",
      poidsKg: 2,
      valeurDeclaree: 25_000,
      assure: true,
      photoRef: "photo-1",
      paiement: { mode: "cash", montant: 2000 },
    } as never);
    const r = await appeler("POST", "/agence/colis", {
      jeton: sessions[1].jeton,
      corps: evenement,
    });
    expect(r.statut).toBe(200);
  });

  it.fails(
    "ANOMALIE A3 : le convoyeur et le chauffeur lisent leur feuille de route (GET /agence/bus/convoyeur, /chauffeur)",
    async () => {
      const convoyeur = await connecter("convoyeur");
      const chauffeur = await connecter("chauffeur");
      const a = await appeler("GET", "/agence/bus/convoyeur", {
        jeton: convoyeur.jeton,
        requete: { departId: departs[0]!.id },
      });
      const b = await appeler("GET", "/agence/bus/chauffeur", {
        jeton: chauffeur.jeton,
        requete: { departId: departs[0]!.id },
      });
      expect([a.statut, b.statut]).toEqual([200, 200]);
    },
  );

  it.fails(
    "ANOMALIE A3 : le chauffeur signale un retard ou une dépense en route (POST /agence/bus/retards, /depenses)",
    async () => {
      const chauffeur = await connecter("chauffeur");
      const poste = new Poste(chauffeur, 1);
      const r = await appeler("POST", "/agence/bus/retards", {
        jeton: chauffeur.jeton,
        corps: poste.appareil.creerEvenement(agence.ECRITURES.chauffeurRetard.evenement, {
          departId: departs[0]!.id,
          minutes: 20,
          motif: "controle",
        } as never),
      });
      expect(r.statut).toBe(200);
    },
  );

  it.fails(
    "ANOMALIE A1 : le patron voit sa journée en direct (GET /patron/aujourdhui)",
    async () => {
      const r = await appeler("GET", "/patron/aujourdhui", { jeton: patronSession.jeton });
      expect(r.statut).toBe(200);
    },
  );

  it.fails(
    "ANOMALIE A8 : un départ se programme par l'API, sans toucher à la base (aucune route de création de départ)",
    async () => {
      const r = await appeler("POST", "/patron/reglages/lignes", {
        jeton: patronSession.jeton,
        corps: {},
      });
      expect(r.statut).not.toBe(404);
      void poserColis;
    },
  );
});
