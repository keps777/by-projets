import { agence, creerHorlogeManuelle, patron, type HorlogeManuelle } from "@afrimove/api-client";
import { agence as contrats } from "@afrimove/contrats";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { appeler, connecter, fenetreSansBalayage, lire, type Session } from "../support/api";
import {
  appareilDeBord,
  clientHttp,
  creerDepart,
  declarerAppareil,
  poserColis,
  referentiel,
  type DepartCree,
} from "../support/journee";
import { PIN_PATRON } from "../support/config";
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

  /* ---------------------------------------------------------------- en route : convoyeur, chauffeur, contrôleur */

  describe("le bus de 8 h en route (écart A3 corrigé)", () => {
    // Le bus de 8 h (17 voyageurs à bord) roule. Les équipiers ont chacun leur téléphone, leur compte et leur PIN.
    let convoyeur: Session;
    let chauffeur: Session;
    let controleur: Session;
    let horloge: HorlogeManuelle;
    const dep = (): DepartCree => departs[0]!;

    beforeAll(async () => {
      convoyeur = await connecter("convoyeur");
      chauffeur = await connecter("chauffeur");
      controleur = await connecter("controleur");
      // L'heure des téléphones : 9 h 30 le jour de la journée jouée, le bus roule depuis 8 h.
      horloge = creerHorlogeManuelle(minuit + hm(9, 30));
    });

    it("le convoyeur et le chauffeur lisent leur feuille de route, avec le client de l'application", async () => {
      const a = await clientHttp(convoyeur).executer(agence.OP_CONVOYEUR_ETAT, {
        departId: dep().id,
      });
      expect(a.departId).toBe(dep().id);
      expect(a.convoyeur.id).toBe(convoyeur.id);
      expect(a.trajet).toMatchObject({ origine: "Douala", destination: "Yaoundé" });
      expect(a.compteurs.scannesABord).toBe(17);
      expect(a.vente).toMatchObject({ arretMontee: "Douala", destination: "Yaoundé", prix: 8000 });
      const b = await clientHttp(chauffeur).executer(agence.OP_CHAUFFEUR_FEUILLE, {
        departId: dep().id,
      });
      expect(b.chauffeur.id).toBe(chauffeur.id);
      expect(b.trajet).toMatchObject({ departId: dep().id, aBord: 17 });
      // Sans `departId`, la feuille est celle du bus en route de l'équipier ; un autre rôle n'y a pas accès.
      const sans = await appeler("GET", "/agence/bus/chauffeur", { jeton: convoyeur.jeton });
      expect(sans.statut).toBe(403);
    });

    it("le convoyeur vend une place en route (plage 3001–3999) et scanne un voyageur à Édéa", async () => {
      const appareil = appareilDeBord(convoyeur, 1, horloge);
      const client = clientHttp(convoyeur);
      const evenementVente = appareil.creerEvenement(agence.ECRITURES.routeBilletVendu.evenement, {
        billetId: appareil.nouvelId(),
        departId: dep().id,
        arretMontee: "Douala",
        arretDescente: "Yaoundé",
        siege: 40,
        prix: 8000,
        passager: { nom: "Mballa Jean", telephone: null },
        paiement: { mode: "cash", recu: 10_000, rendu: 2000, reference: null },
        codeBillet: "7301",
        gps: { latitude: 4.05, longitude: 9.7, precisionM: 15 },
      });
      const vente = await client.executer(
        agence.ECRITURES.routeBilletVendu.operation,
        evenementVente,
      );
      expect(vente.accuse.statut).toBe("accepte");
      // Le même événement rejoué (réseau coupé au retour de la réponse) ne vend pas deux fois.
      const rejouee = await client.executer(
        agence.ECRITURES.routeBilletVendu.operation,
        evenementVente,
      );
      expect(rejouee.accuse.statut).toBe("deja_recu");
      expect(rejouee.billet.billetId).toBe(vente.billet.billetId);
      expect(vente.billet).toMatchObject({ siege: 40, prix: 8000 });
      expect(vente.ventesEnRoute).toEqual({ nombre: 1, montant: 8000 });
      const [ligne] = lire<{ sequence: number; etat: string; canal: string }>(
        `select sequence, etat, canal from billet where id = '${vente.billet.billetId}'`,
      );
      expect(ligne?.sequence).toBeGreaterThanOrEqual(3001);
      expect(ligne?.sequence).toBeLessThanOrEqual(3999);
      expect(ligne).toMatchObject({ etat: "embarque", canal: "convoyeur" });

      // Une autre vente du même siège est refusée : le siège est pris (409).
      const doublon = await client
        .executer(
          agence.ECRITURES.routeBilletVendu.operation,
          appareil.creerEvenement(agence.ECRITURES.routeBilletVendu.evenement, {
            billetId: appareil.nouvelId(),
            departId: dep().id,
            arretMontee: "Douala",
            arretDescente: "Yaoundé",
            siege: 40,
            prix: 8000,
            passager: { nom: "Autre", telephone: null },
            paiement: { mode: "cash", recu: 8000, rendu: 0, reference: null },
            codeBillet: "7302",
            gps: null,
          }),
        )
        .catch((e: { statut?: number }) => e);
      expect(doublon).toMatchObject({ statut: 409 });

      const scan = await client.executer(
        agence.ECRITURES.routeScanne.operation,
        appareil.creerEvenement(agence.ECRITURES.routeScanne.evenement, {
          departId: dep().id,
          arret: "Édéa",
          qr: ventesDe(0)[1]!.billet!.qr,
        }),
      );
      expect(scan.accuse.statut).toBe("accepte");
      expect(scan.scannesABord).toBe(18);

      const feuille = await client.executer(agence.OP_CONVOYEUR_ETAT, { departId: dep().id });
      expect(feuille.compteurs.ventesEnRoute).toEqual({ nombre: 1, montant: 8000 });
      expect(feuille.compteurs.scannesABord).toBe(18);
    });

    it("le chauffeur déclare une dépense, un incident, un retard, puis l'arrivée à Édéa", async () => {
      const appareil = appareilDeBord(chauffeur, 1, horloge);
      const client = clientHttp(chauffeur);
      const depense = await client.executer(
        agence.ECRITURES.chauffeurDepense.operation,
        appareil.creerEvenement(agence.ECRITURES.chauffeurDepense.evenement, {
          depenseId: appareil.nouvelId(),
          departId: dep().id,
          categorie: "carburant",
          libelle: "Gasoil, station d'Édéa",
          montant: 25_000,
          justificatifRef: "photo-gasoil-1",
        }),
      );
      expect(depense.totalDepenses).toBe(25_000);
      expect(depense.depense).toMatchObject({ categorie: "carburant", montant: 25_000 });

      const incident = await client.executer(
        agence.ECRITURES.chauffeurIncident.operation,
        appareil.creerEvenement(agence.ECRITURES.chauffeurIncident.evenement, {
          incidentId: appareil.nouvelId(),
          departId: dep().id,
          nature: "panne",
          gps: { latitude: 3.95, longitude: 10.0, precisionM: 20 },
          note: "Crevaison, roue de secours montée",
        }),
      );
      expect(incident.accuse.statut).toBe("accepte");
      expect(incident.garePrevenue).toBe(true);

      const retard = await client.executer(
        agence.ECRITURES.chauffeurRetard.operation,
        appareil.creerEvenement(agence.ECRITURES.chauffeurRetard.evenement, {
          departId: dep().id,
          minutes: 20,
        }),
      );
      expect(retard.accuse.statut).toBe("accepte");
      expect(retard.garePrevenue).toBe(true);

      const arrivee = await client.executer(
        agence.ECRITURES.chauffeurArriveeArret.operation,
        appareil.creerEvenement(agence.ECRITURES.chauffeurArriveeArret.evenement, {
          departId: dep().id,
          arret: "Édéa",
          gps: null,
        }),
      );
      expect(arrivee.accuse.statut).toBe("accepte");

      const feuille = await client.executer(agence.OP_CHAUFFEUR_FEUILLE, { departId: dep().id });
      expect(feuille.depenses.total).toBe(25_000);
      expect(feuille.depenses.lignes).toHaveLength(1);
      // La dépense et l'incident sont dans les tables du départ, avec leur auteur.
      const [d] = lire<{ n: number }>(
        `select count(*)::int as n from depart_depense where "departId" = '${dep().id}' and "auteurId" = '${chauffeur.id}'`,
      );
      expect(d?.n).toBe(1);
      const [i] = lire<{ n: number }>(
        `select count(*)::int as n from depart_incident where "departId" = '${dep().id}' and "auteurId" = '${chauffeur.id}'`,
      );
      expect(i?.n).toBe(1);
    });

    it("le contrôleur ouvre un contrôle, constate un siège sans billet, signale le convoyeur, régularise et clôt : le constat part au patron", async () => {
      const appareil = appareilDeBord(controleur, 2, horloge);
      const client = clientHttp(controleur);
      // L'écran ouvre le contrôle sur « le bus en route le plus récent » ; la recette choisit le bus par `?departId=`
      // (seule extension hors contrat du lot : les autres scénarios laissent aussi des bus « en route » en base).
      const lecture = await appeler("GET", "/agence/controle/inopine", {
        jeton: controleur.jeton,
        requete: { departId: dep().id },
      });
      expect(lecture.statut, JSON.stringify(lecture.corps)).toBe(200);
      const ouvert = contrats.SchemaControleInopine.parse(lecture.corps);
      expect(ouvert.departId).toBe(dep().id);
      expect(ouvert.controleur.id).toBe(controleur.id);
      // 17 embarqués au quai + 1 vente en route = 18 billets valides, 18 têtes : rien ne manque.
      expect(ouvert.comptes).toEqual({ liste: 18, tetes: 18, ecart: 0 });
      const controleId = ouvert.controleId;

      const constat = await client.executer(
        agence.ECRITURES.controleSiegeVerifie.operation,
        appareil.creerEvenement(agence.ECRITURES.controleSiegeVerifie.evenement, {
          controleId,
          departId: dep().id,
          siege: 41,
          constat: "sans_billet",
        }),
      );
      expect(constat.controle.comptes).toEqual({ liste: 18, tetes: 19, ecart: 1 });

      const signale = await client.executer(
        agence.ECRITURES.controleConvoyeurSignale.operation,
        appareil.creerEvenement(agence.ECRITURES.controleConvoyeurSignale.evenement, {
          controleId,
          departId: dep().id,
          convoyeurId: referentiel().convoyeurId,
          siege: 41,
          montantDeclare: 8000,
          note: "Dit avoir payé en monnaie à Édéa",
        }),
      );
      expect(signale.accuse.statut).toBe("accepte");

      const regularise = await client.executer(
        agence.ECRITURES.controleRegularise.operation,
        appareil.creerEvenement(agence.ECRITURES.controleRegularise.evenement, {
          controleId,
          billetId: appareil.nouvelId(),
          departId: dep().id,
          siege: 41,
          prix: 8000,
          paiement: { mode: "cash", recu: 8000, rendu: 0, reference: null },
          codeBillet: "7401",
          passager: { nom: "Njoya Marie", pieceQuatreDerniers: "1234" },
        }),
      );
      expect(regularise.accuse.statut).toBe("accepte");
      const [billet] = lire<{ sequence: number; etat: string }>(
        `select sequence, etat from billet where "departId" = '${dep().id}' and siege = 41`,
      );
      // Deuxième moitié de la plage commune des convoyeurs (la première est celle du convoyeur).
      expect(billet?.sequence).toBeGreaterThanOrEqual(3500);
      expect(billet?.sequence).toBeLessThanOrEqual(3999);
      expect(billet?.etat).toBe("embarque");

      const apres = await client.executer(agence.OP_CONTROLE_INOPINE, { controleId });
      expect(apres.comptes).toEqual({ liste: 19, tetes: 19, ecart: 0 });

      const cloture = await client.executer(
        agence.ECRITURES.controleCloture.operation,
        appareil.creerEvenement(agence.ECRITURES.controleCloture.evenement, {
          controleId,
          departId: dep().id,
          ...apres.comptes,
        }),
      );
      expect(cloture.controle).toMatchObject({ controleId, clos: true, envoyeAuPatron: true });
      const [fige] = lire<{ liste: number; tetes: number; ecart: number; envoye: boolean }>(
        `select liste, tetes, ecart, "envoyeAuPatron" as envoye from controle_inopine where id = '${controleId}'`,
      );
      expect(fige).toEqual({ liste: 19, tetes: 19, ecart: 0, envoye: true });
      // Un contrôle clos ne bouge plus.
      const tardif = await client
        .executer(
          agence.ECRITURES.controleSiegeVerifie.operation,
          appareil.creerEvenement(agence.ECRITURES.controleSiegeVerifie.evenement, {
            controleId,
            departId: dep().id,
            siege: 42,
            constat: "sans_billet",
          }),
        )
        .catch((e: { statut?: number }) => e);
      expect(tardif).toMatchObject({ statut: 409 });
    });

    it("le superviseur lit l'état d'un appareil de la gare : un appareil jamais synchronisé n'a rien à montrer (409)", async () => {
      const appareilId = `recette-appareil-jamais-synchro-${randomUUID().slice(0, 8)}`;
      declarerAppareil(appareilId, 2);
      const r = await appeler("GET", `/agence/superviseur/appareils/${appareilId}`, {
        jeton: superviseur.jeton,
      });
      expect(r.statut).toBe(409);
      expect(r.corps.code).toBe("APPAREIL_JAMAIS_SYNCHRONISE");
      const inconnu = await appeler("GET", `/agence/superviseur/appareils/${randomUUID()}`, {
        jeton: superviseur.jeton,
      });
      expect(inconnu.statut).toBe(404);
    });
  });

  /* ---------------------------------------------------------------- ce que la pile ne permet pas encore */

  // Anomalie A5 corrigée (lot Db) : le référentiel du module colis lit les départs réels de la base. Les départs de
  // la journée simulée sont partis depuis longtemps (« départ fermé » aux colis, c'est la règle) : le colis se
  // déclare sur un départ à venir, posé en base comme les autres.
  it("un colis se déclare au guichet sur un départ réel (POST /agence/colis)", async () => {
    const p = postes[1];
    const aVenir = creerDepart({ heureDepart: new Date(Date.now() + 4 * 3_600_000), bus: 1 });
    const evenement = p.appareil.creerEvenement(agence.ECRITURES.colisEnregistre.evenement, {
      colisId: p.appareil.nouvelId(),
      departId: aVenir.id,
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
    expect(r.statut, JSON.stringify(r.corps)).toBe(200);
    expect(
      lire<{ etat: string }>(`select etat from colis where "departId" = '${aVenir.id}'`)[0]?.etat,
    ).toBe("enregistre");
  });

  /* ---------------------------------------------------------------- l'espace du patron (A1, corrigée) */

  it("le patron lit ses écrans de la journée : tableau, alertes, gares, équipe, fiche, salle de contrôle (A1)", async () => {
    const c = clientHttp(patronSession);
    const ref = referentiel();
    const tableau = await c.executer(patron.OP_TABLEAU_DU_JOUR, undefined);
    const compter = (sql: string): number => lire<{ n: number }>(sql)[0]!.n;
    const garesEnBase = compter(
      `select count(*)::int as n from gare where "compagnieId" = '${ref.compagnieId}'`,
    );
    const busEnBase = compter(
      `select count(*)::int as n from bus where "compagnieId" = '${ref.compagnieId}'`,
    );
    const equipeEnBase = compter(
      `select count(*)::int as n from personne where "compagnieId" = '${ref.compagnieId}' and actif
       and roles && array['guichetier','convoyeur','chauffeur','superviseur','comptable','relais']::role[]`,
    );
    expect(tableau.nbGares).toBe(garesEnBase);
    expect(tableau.nbBus).toBe(busEnBase);
    expect(tableau.nbPersonnes).toBe(equipeEnBase);
    expect(tableau.jour.recette).toBeGreaterThanOrEqual(0);

    const alertes = await c.executer(patron.OP_ALERTES, undefined);
    expect(alertes.alertes.length).toBe(tableau.nbAlertes);

    const gares = await c.executer(patron.OP_GARES, undefined);
    expect(gares.gares.map((g) => g.id).sort()).toEqual([ref.gareDlaId, ref.gareYdeId].sort());
    const dla = await c.executer(patron.OP_GARE, { gareId: ref.gareDlaId });
    expect(dla.gare.nom).toMatch(/Douala/);

    const equipe = await c.executer(patron.OP_EQUIPE, {});
    expect(equipe.total).toBe(equipeEnBase);
    const guichetier = equipe.personnes.find((p) => p.id === sessions[1].id);
    expect(guichetier?.role).toBe("guichetier");
    const fiche = await c.executer(patron.OP_FICHE_PERSONNE, { personneId: sessions[1].id });
    expect(fiche.personne.id).toBe(sessions[1].id);
    expect(fiche.personne.telephoneMasque).toContain("••");
    expect(JSON.stringify(fiche)).not.toContain("655000002");

    const salle = await c.executer(patron.OP_SALLE_DE_CONTROLE, undefined);
    expect(salle).toBeDefined();

    // Les écrans du patron ne sont pas ceux d'un guichetier.
    for (const chemin of ["/patron/aujourdhui", "/patron/equipe", "/patron/reglages"]) {
      expect((await appeler("GET", chemin, { jeton: sessions[1].jeton })).statut, chemin).toBe(403);
      expect((await appeler("GET", chemin)).statut, chemin).toBe(401);
    }
  });

  it("le patron lit ses réglages : lignes, équipe, règles ; une écriture exige son PIN (A1)", async () => {
    const c = clientHttp(patronSession);
    const ref = referentiel();
    const accueil = await c.executer(patron.OP_REGLAGES, undefined);
    expect(accueil.lignes.map((l) => l.id)).toContain(ref.ligneId);
    const ligne = await c.executer(patron.OP_LIGNE_EDITABLE, { ligneId: ref.ligneId });
    expect(ligne.tarifs).toMatchObject({ classique: TARIF.classique });
    expect(ligne.arrets.map((a) => a.nom)).toContain("Édéa");
    const personne = await c.executer(patron.OP_PERSONNE_EDITABLE, { personneId: sessions[2].id });
    expect(personne.role).toBe("guichetier");
    expect(personne.guichet).toBe("2");
    const regles = await c.executer(patron.OP_REGLES, undefined);
    expect(regles.caisse.toleranceEcart).toBeGreaterThanOrEqual(0);
    const { comptesMomo: _comptes, ...modifiables } = regles;

    // Sans signature : la route existe et demande le PIN (ce n'est plus un 404).
    const sansPin = await appeler("PUT", "/patron/reglages/regles", {
      jeton: patronSession.jeton,
      corps: { regles: modifiables },
    });
    expect(sansPin.statut).toBe(401);
    expect((sansPin.corps as { code: string }).code).toBe("PIN_REQUIS");
    // Le compte patron a son PIN de signature (posé par `semer-recette.cjs`, lot De) : un PIN faux est refusé (403).
    const signeA = new Date(Date.now() + H).toISOString().replace("Z", "+01:00");
    const pinFaux = await appeler("PUT", "/patron/reglages/regles", {
      jeton: patronSession.jeton,
      corps: { regles: modifiables, signature: { pin: "482915", methode: "pin", signeA } },
    });
    expect(pinFaux.statut, JSON.stringify(pinFaux.corps)).toBe(403);
    expect((pinFaux.corps as { code: string }).code).toBe("PIN_INCORRECT");
  });

  it("la création d'une ligne passe par l'API et exige le PIN du patron (A8, en partie corrigée)", async () => {
    const sansPin = await appeler("POST", "/patron/reglages/lignes", {
      jeton: patronSession.jeton,
      corps: {},
    });
    expect(sansPin.statut).toBe(401);
    expect((sansPin.corps as { code: string }).code).toBe("PIN_REQUIS");
  });

  /* ---------------------------------------------------------------- ce qui reste en suspens */

  it("A8 corrigée : le patron programme les départs par l'API (horaire récurrent, génération, équipage), sans toucher à la base", async () => {
    const ligneId = referentiel().ligneId;
    const jeton = patronSession.jeton;
    const signature = () => ({
      pin: PIN_PATRON,
      methode: "pin",
      signeA: new Date(Date.now() + H).toISOString().replace("Z", "+01:00"),
    });
    // Un nouvel horaire de 5 h 40 sur la ligne, publié avec la signature PIN du patron.
    const lue = await appeler<{ departs: Record<string, unknown>[] }>(
      "GET",
      `/patron/reglages/lignes/${ligneId}`,
      { jeton },
    );
    expect(lue.statut).toBe(200);
    if (!lue.corps.departs.some((d) => d["heure"] === "05:40")) {
      const publie = await appeler("PUT", `/patron/reglages/lignes/${ligneId}`, {
        jeton,
        corps: {
          ligneId,
          departs: [
            ...lue.corps.departs,
            {
              id: null,
              heure: "05:40",
              heureInitiale: null,
              classe: "classique",
              prix: 8000,
              actif: true,
              note: null,
              jours: [],
              nouveau: true,
            },
          ],
          signature: signature(),
        },
      });
      expect(publie.statut, JSON.stringify(publie.corps)).toBe(200);
    }
    // Une seule source de vérité : l'accueil des réglages du patron compte les horaires actifs de l'administration
    // (`horaire_ligne`), le départ de 5 h 40 qu'on vient de publier compris.
    const accueil = await appeler<{ lignes: { id: string; nbDeparts: number }[] }>(
      "GET",
      "/patron/reglages",
      { jeton },
    );
    expect(accueil.statut).toBe(200);
    expect(accueil.corps.lignes.find((l) => l.id === ligneId)?.nbDeparts).toBe(
      lire<{ n: number }>(
        `select count(*)::int as n from horaire_ligne where "ligneId" = '${ligneId}' and actif`,
      )[0]!.n,
    );
    // Sans PIN, la même écriture est refusée.
    const sansPin = await appeler("PUT", `/patron/reglages/lignes/${ligneId}`, {
      jeton,
      corps: { ligneId },
    });
    expect(sansPin.statut).toBe(401);

    // Génération du jour J + 20 (loin des journées jouées plus haut) : un départ, rejouable sans doublon.
    const cible = new Date(Date.now() + H + 20 * 24 * H).toISOString().slice(0, 10);
    const aammjj = cible.slice(2, 4) + cible.slice(5, 7) + cible.slice(8, 10);
    const generation = await appeler<{
      crees: { id: string; numero: string }[];
      dejaPresents: number;
    }>("POST", "/admin/departs/generer", { jeton, corps: { ligneId, du: cible, au: cible } });
    expect(generation.statut, JSON.stringify(generation.corps)).toBe(200);
    const numero = `DEM-DLAYDE-${aammjj}-0540`;
    const [ligne] = lire<{ id: string; numero: string }>(
      `select id, numero from depart where numero = '${numero}'`,
    );
    expect(ligne?.numero).toBe(numero);
    const rejeu = await appeler<{ crees: unknown[]; dejaPresents: number }>(
      "POST",
      "/admin/departs/generer",
      { jeton, corps: { ligneId, du: cible, au: cible } },
    );
    expect(rejeu.corps.crees).toHaveLength(0);
    expect(rejeu.corps.dejaPresents).toBeGreaterThanOrEqual(1);
    expect(lire(`select 1 from depart where numero = '${numero}'`)).toHaveLength(1);

    // Bus, chauffeur et quai affectés par l'API ; le même bus ne part pas deux fois en même temps.
    const ref = referentiel();
    const equipe = await appeler("PATCH", `/admin/departs/${ligne!.id}/equipage`, {
      jeton,
      corps: { busId: ref.busIds[0], chauffeurId: ref.chauffeurId, quai: 2 },
    });
    expect(equipe.statut, JSON.stringify(equipe.corps)).toBe(200);
    const meme = await appeler("POST", "/admin/departs", {
      jeton,
      corps: {
        ligneId,
        heureDepart: `${cible}T07:00:00.000+01:00`,
        busId: ref.busIds[0],
      },
    });
    expect(meme.statut).toBe(409);
  });
});
