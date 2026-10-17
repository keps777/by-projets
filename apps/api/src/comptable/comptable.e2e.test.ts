import { patron } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OP_APERCU_EXPORT,
  OP_CLOTURE,
  OP_FICHIER_EXPORT,
} from "../../../../packages/api-client/src/patron/operations";
import { ORPHELINES, ajouterOrphelines, iso, peuplerMois, vente } from "./testing/donnees";
import {
  AGENCE,
  AUTRE_AGENCE,
  EMAIL_CABINET,
  PIN_PATRON,
  creerAppComptableTest,
  type AppComptableTest,
} from "./testing/app-comptable-test";

/**
 * Le module en HTTP : gardes d'accès, signature PIN, règles du rapprochement et de la clôture, fichiers,
 * journal d'audit. Le matin du 5 janvier 2027, le mois à clôturer est décembre 2026.
 */

const MOIS = "2026-12";
const auth = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
const BASE = "/patron/comptable";

let t: AppComptableTest;
let patronJeton: string;
let patronId: string;
let comptableJeton: string;

beforeEach(async () => {
  t = await creerAppComptableTest();
  const p = await t.compte("patron");
  patronJeton = p.jeton;
  patronId = p.id;
  comptableJeton = (await t.compte("comptable")).jeton;
  t.parametres.definir({
    compagnieId: AGENCE,
    nomAgence: "Alpha Voyages",
    emailCabinet: EMAIL_CABINET,
    envoiAutomatique: true,
    jourDEnvoi: 2,
    jourDeCloture: 5,
  });
  peuplerMois(t, AGENCE, MOIS);
  ajouterOrphelines(t, AGENCE, MOIS);
});

afterEach(async () => {
  await t.fermer();
});

const lire = (chemin: string, jeton = patronJeton) =>
  t.http().get(`${BASE}${chemin}`).set(auth(jeton));
const ecrire = (chemin: string, corps: unknown, jeton = patronJeton) =>
  t
    .http()
    .post(`${BASE}${chemin}`)
    .set(auth(jeton))
    .send(corps as object);

/** Les quatre décisions proposées par l'API : rembourser, rembourser, rattacher, demander. */
interface Decision {
  reference: string;
  action: "rembourser" | "rattacher" | "demander";
}

const TOUTES: Decision[] = [
  { reference: ORPHELINES.doublon, action: "rembourser" },
  { reference: ORPHELINES.expiration, action: "rembourser" },
  { reference: ORPHELINES.colis, action: "rattacher" },
  { reference: ORPHELINES.inconnue, action: "demander" },
];

const decider = (decisions = TOUTES, pin = PIN_PATRON, mois = MOIS) =>
  ecrire("/rapprochement/decisions", t.corpsDecisions(mois, decisions, pin));

const cloturer = (envoyer = false, pin = PIN_PATRON, mois = MOIS) =>
  ecrire("/clotures", t.corpsCloture(mois, envoyer, pin));

/** Le total que les ventes du mois qui tiennent ont encaissé, calculé à part du module. */
function encaisseAttendu(): number {
  return (t.ventes.parCompagnie.get(AGENCE) ?? [])
    .filter((v) => v.at.startsWith(MOIS) && v.annuleeA === null)
    .reduce((s, v) => s + v.prix, 0);
}

/** Règle l'horloge de l'API sur un instant précis. */
const regler = (instant: Date) =>
  t.horloge.avancer(instant.getTime() - t.horloge.maintenant().getTime());

const journalEnTexte = () =>
  JSON.stringify(t.auditRepo.lignes, (_cle, valeur: unknown) =>
    typeof valeur === "bigint" ? valeur.toString() : valeur,
  );

describe("accès", () => {
  it("refuse sans jeton, aux autres rôles et aux comptes sans agence", async () => {
    expect((await t.http().get(BASE)).status).toBe(401);
    const guichetier = await t.compte("guichetier");
    expect((await lire("", guichetier.jeton)).status).toBe(403);
    const voyageur = await t.compte("voyageur", { compagnieId: null });
    expect((await lire("", voyageur.jeton)).status).toBe(403);
    const sansAgence = await t.compte("patron", { compagnieId: null });
    const rep = await lire("", sansAgence.jeton);
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("AGENCE_REQUISE");
  });

  it("le comptable lit mais n'écrit pas : seul le patron décide et clôture", async () => {
    expect((await lire("", comptableJeton)).status).toBe(200);
    expect((await lire("/rapprochement", comptableJeton)).status).toBe(200);
    expect((await lire("/cloture", comptableJeton)).status).toBe(200);
    const decisions = await decider(TOUTES.slice(0, 1));
    expect(decisions.status).toBe(200);
    const refus = await ecrire(
      "/rapprochement/decisions",
      t.corpsDecisions(MOIS, TOUTES.slice(1, 2)),
      comptableJeton,
    );
    expect(refus.status).toBe(403);
    expect((await ecrire("/clotures", t.corpsCloture(MOIS), comptableJeton)).status).toBe(403);
    expect(t.actions.appels).toHaveLength(1);
  });

  it("une agence ne voit jamais les données d'une autre", async () => {
    peuplerMois(t, AUTRE_AGENCE, MOIS, { jours: 3, parJour: 2, graine: 99 });
    const autre = await t.compte("patron", { compagnieId: AUTRE_AGENCE });
    const rep = await lire(`/rapprochement?mois=${MOIS}`, autre.jeton);
    expect(rep.status).toBe(200);
    expect(rep.body.lignes).toEqual([]);
    const synthese = await lire(`?mois=${MOIS}`, autre.jeton);
    const moi = await lire(`?mois=${MOIS}`);
    expect(synthese.body.exports[0].lignes).not.toBe(moi.body.exports[0].lignes);
    const apercu = await lire(`/exports/journal_ventes/apercu?mois=${MOIS}`, autre.jeton);
    expect(apercu.body.tableau.total).toBe((t.ventes.parCompagnie.get(AUTRE_AGENCE) ?? []).length);
  });
});

describe("synthèse", () => {
  it("respecte le contrat et décrit décembre 2026 : taux, quatre lignes à 16 000 F, cinq exports", async () => {
    const rep = await lire("");
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const s = patron.SyntheseComptableSchema.parse(rep.body);
    expect(s.mois).toBe(MOIS);
    expect(s.libelle).toBe("Décembre 2026");
    expect(s.statut).toBe("ouvert");
    expect(s.jourDeCloture).toBe(5);
    expect(s.rapprochement.sansCorrespondance).toEqual({ transactions: 4, montant: 16_000 });
    expect(s.rapprochement.tauxRapprochePct).toBeLessThan(100);
    expect(s.exports.map((e) => e.id)).toEqual([
      "journal_ventes",
      "journal_caisse",
      "annulations",
      "ecritures_syscohada",
      "factures_afrimove",
    ]);
    expect(s.cabinet).toEqual({
      destinataire: "cabinet@…",
      automatique: true,
      jourDEnvoi: 2,
      derniersEnvoisRecus: 0,
    });
    expect(s.moisDisponibles.map((m) => m.mois)).toContain(MOIS);
    expect(JSON.stringify(rep.body)).not.toContain("compta-douala");
  });

  it("par défaut : le mois précédent tant qu'il n'est pas clôturé, puis le mois en cours", async () => {
    expect((await lire("")).body.mois).toBe(MOIS);
  });

  it("refuse un mois mal écrit (400), un mois futur ou antérieur à AfriMove (404)", async () => {
    expect((await lire("?mois=2026-13")).status).toBe(400);
    expect((await lire("?mois=décembre")).status).toBe(400);
    const futur = await lire("?mois=2027-06");
    expect(futur.status).toBe(404);
    expect(futur.body.code).toBe("MOIS_INDISPONIBLE");
    expect((await lire("?mois=2019-12")).status).toBe(404);
  });

  it("un mois sans aucune activité répond tout de même, à zéro", async () => {
    const rep = await lire("?mois=2026-03");
    expect(rep.status).toBe(200);
    const s = patron.SyntheseComptableSchema.parse(rep.body);
    expect(s.rapprochement.sansCorrespondance.transactions).toBe(0);
    expect(s.rapprochement.tauxRapprochePct).toBe(100);
  });
});

describe("aperçu et fichier d'un export", () => {
  const IDS = [
    "journal_ventes",
    "journal_caisse",
    "annulations",
    "ecritures_syscohada",
    "factures_afrimove",
  ] as const;

  it.each(IDS)("%s : l'aperçu respecte le contrat et ne montre que dix lignes", async (id) => {
    const rep = await lire(`/exports/${id}/apercu`);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const a = patron.ApercuExportSchema.parse(rep.body);
    expect(a.export.id).toBe(id);
    expect(a.tableau.lignes.length).toBeLessThanOrEqual(10);
    expect(a.tableau.total).toBe(a.export.lignes);
    expect(a.signe).toBe(true);
    for (const ligne of a.tableau.lignes) expect(ligne).toHaveLength(a.tableau.colonnes.length);
  });

  it("le journal des ventes : 4 onglets, total des ventes au franc près, choix de l'onglet", async () => {
    const a = patron.ApercuExportSchema.parse((await lire("/exports/journal_ventes/apercu")).body);
    expect(a.tableau.totalMontant).toBe(encaisseAttendu());
    expect(a.tableau.total).toBeGreaterThan(100);
    expect(a.tableau.lignes).toHaveLength(10);
    expect(a.onglets.length).toBeGreaterThanOrEqual(3);
    const autre = a.onglets[1]!;
    const rep = await lire(`/exports/journal_ventes/apercu?onglet=${autre.id}`);
    expect(rep.status).toBe(200);
    expect(rep.body.tableau.colonnes).not.toEqual(a.tableau.colonnes);
    const inconnu = await lire("/exports/journal_ventes/apercu?onglet=nexiste_pas");
    expect(inconnu.status).toBe(404);
    expect(inconnu.body.code).toBe("ONGLET_INCONNU");
    expect((await lire("/exports/journal_ventes/apercu?onglet=../etc")).status).toBe(400);
  });

  it("parité avec les opérations du client : chemin, requête (mois, onglet) et fichier remis", async () => {
    // Le chemin et la requête exacts que fabrique le client, relatifs à /patron/comptable.
    const adresse = (
      op: { chemin: (p: never) => string; requete?: (p: never) => Record<string, unknown> },
      params: unknown,
    ): string => {
      const requete = new URLSearchParams();
      for (const [cle, valeur] of Object.entries(op.requete?.(params as never) ?? {})) {
        if (valeur !== undefined) requete.set(cle, String(valeur));
      }
      const chaine = requete.toString();
      return op.chemin(params as never).slice(BASE.length) + (chaine ? `?${chaine}` : "");
    };

    const apercu = patron.ApercuExportSchema.parse(
      (await lire("/exports/journal_ventes/apercu")).body,
    );
    const onglet = apercu.onglets[1]!.id;
    const params = { exportId: "journal_ventes", mois: MOIS, onglet } as const;
    const rep = await lire(adresse(OP_APERCU_EXPORT, params));
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(OP_APERCU_EXPORT.reponse.parse(rep.body).tableau.colonnes).not.toEqual(
      apercu.tableau.colonnes,
    );

    const adresseFichier = adresse(OP_FICHIER_EXPORT, { exportId: "journal_ventes", mois: MOIS });
    expect(adresseFichier).toBe(`/exports/journal_ventes/fichier?mois=${MOIS}`);
    const fichier = await lire(adresseFichier).buffer(true).parse(binaire);
    expect(fichier.status).toBe(200);
    expect(OP_FICHIER_EXPORT.lecture).toBe("binaire");
    expect(fichier.headers["content-disposition"]).toContain("journal-ventes-2026-12.xlsx");
    expect(fichier.headers["x-empreinte-afrimove"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuse un export inconnu (404) et un mois invalide (400)", async () => {
    const rep = await lire("/exports/livre_de_paie/apercu");
    expect(rep.status).toBe(404);
    expect(rep.body.code).toBe("EXPORT_INCONNU");
    expect((await lire("/exports/journal_ventes/apercu?mois=hier")).status).toBe(400);
    expect((await lire("/exports/livre_de_paie/fichier")).status).toBe(404);
  });

  it("le fichier téléchargé est exactement celui qu'on a prévisualisé", async () => {
    const apercu = patron.ApercuExportSchema.parse(
      (await lire("/exports/journal_ventes/apercu")).body,
    );
    const rep = await lire("/exports/journal_ventes/fichier").buffer(true).parse(binaire);
    expect(rep.status).toBe(200);
    const octets = rep.body as Buffer;
    expect(octets.length).toBe(apercu.export.tailleOctets);
    expect(rep.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(rep.headers["content-disposition"]).toBe(
      'attachment; filename="journal-ventes-2026-12.xlsx"',
    );
    expect(rep.headers["x-empreinte-afrimove"]).toMatch(/^[0-9a-f]{64}$/);
    expect(rep.headers["x-content-type-options"]).toBe("nosniff");
    // Un fichier XLSX est un zip : il commence par « PK ».
    expect(octets.subarray(0, 2).toString("latin1")).toBe("PK");
    // Un second téléchargement rend les mêmes octets.
    const encore = await lire("/exports/journal_ventes/fichier").buffer(true).parse(binaire);
    expect((encore.body as Buffer).equals(octets)).toBe(true);
  });

  it("chaque export se télécharge dans son format : XLSX, CSV, PDF", async () => {
    const attendus: Record<string, [string, string]> = {
      journal_ventes: [".xlsx", "PK"],
      journal_caisse: [".xlsx", "PK"],
      annulations: [".csv", ""],
      ecritures_syscohada: [".csv", ""],
      factures_afrimove: [".pdf", "%PDF"],
    };
    for (const [id, [extension, debut]] of Object.entries(attendus)) {
      const rep = await lire(`/exports/${id}/fichier`).buffer(true).parse(binaire);
      expect(rep.status, id).toBe(200);
      expect(rep.headers["content-disposition"], id).toContain(`${extension}"`);
      const texte = (rep.body as Buffer).toString("latin1");
      if (debut) expect(texte.startsWith(debut), id).toBe(true);
    }
  });

  it("le CSV porte l'empreinte sur sa dernière ligne, la même que l'en-tête", async () => {
    const rep = await lire("/exports/ecritures_syscohada/fichier").buffer(true).parse(binaire);
    const texte = (rep.body as Buffer).toString("utf8");
    const derniere = texte.trimEnd().split("\r\n").at(-1)!;
    expect(derniere.startsWith("#AFRIMOVE;empreinte;HMAC-SHA-256;")).toBe(true);
    expect(derniere).toContain(String(rep.headers["x-empreinte-afrimove"]));
  });

  it("le téléchargement est tracé au journal d'audit, sans contenu", async () => {
    await lire("/exports/annulations/fichier");
    const ligne = t.auditRepo.lignes.find((l) => l.action === "comptable.export.telecharger");
    expect(ligne).toBeDefined();
    expect(ligne?.acteurId).toBe(patronId);
  });

  it("un aperçu de moins de dix minutes est rendu tel quel au téléchargement ; plus vieux, il est régénéré", async () => {
    const a1 = (await lire("/exports/annulations/apercu")).body;
    const memo1 = t.apercus.lignes.get(`${AGENCE}|${MOIS}|annulations`);
    expect(memo1?.genereA).toBe(a1.export.genereA);

    t.horloge.avancer(5 * 60_000);
    const frais = await lire("/exports/annulations/fichier").buffer(true).parse(binaire);
    expect(frais.headers["x-empreinte-afrimove"]).toBe(memo1?.empreinte);
    expect((frais.body as Buffer).equals(memo1!.contenu)).toBe(true);

    t.horloge.avancer(11 * 60_000);
    const vieux = await lire("/exports/annulations/fichier").buffer(true).parse(binaire);
    expect(vieux.headers["x-empreinte-afrimove"]).not.toBe(memo1?.empreinte);
  });
});

/** supertest ne sait pas lire seul un corps binaire. */
function binaire(reponse: unknown, rappel: (err: Error | null, corps: Buffer) => void): void {
  const flux = reponse as NodeJS.ReadableStream;
  const morceaux: Buffer[] = [];
  flux.on("data", (m: Buffer) => morceaux.push(m));
  flux.on("end", () => rappel(null, Buffer.concat(morceaux)));
}

describe("rapprochement MoMo", () => {
  it("liste les quatre transactions, la cause probable et l'action proposée, avec le contrat", async () => {
    const rep = await lire("/rapprochement");
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const r = patron.RapprochementMomoSchema.parse(rep.body);
    expect(r.mois).toBe(MOIS);
    expect(r.transactions).toBe(4);
    expect(r.montantTotal).toBe(16_000);
    expect(r.surTotalVentes).toBeGreaterThan(50);
    expect(r.lignes.map((l) => [l.reference, l.cause, l.actionProposee, l.decision])).toEqual([
      [ORPHELINES.doublon, "doublon_paiement", "rembourser", null],
      [ORPHELINES.expiration, "paiement_apres_expiration", "rembourser", null],
      [ORPHELINES.colis, "scan_depot_manquant", "rattacher", null],
      [ORPHELINES.inconnue, "inconnue", "demander", null],
    ]);
    expect(r.lignes[2]?.cibleSuggeree).toBe("C-ALP-DLA-261217-0141");
    expect(r.lignes[0]?.explication).toContain("2e paiement 40 s après le 1er");
  });

  it("ne montre jamais un numéro de téléphone en clair", async () => {
    const texte = JSON.stringify((await lire("/rapprochement")).body);
    expect(texte).not.toContain("677123441");
    expect(texte).not.toContain("+237");
    expect(texte).toContain("6 77 •• •• 41");
  });
});

describe("appliquer les décisions", () => {
  it("refuse sans signature (401), avec un mauvais PIN (403) et trace le refus", async () => {
    const sans = await ecrire("/rapprochement/decisions", { mois: MOIS, decisions: TOUTES });
    expect(sans.status).toBe(401);
    expect(sans.body.code).toBe("PIN_REQUIS");
    const mauvais = await decider(TOUTES, "000000");
    expect(mauvais.status).toBe(403);
    expect(mauvais.body.code).toBe("PIN_INCORRECT");
    expect(t.actions.appels).toHaveLength(0);
    expect(t.decisions.lignes.size).toBe(0);
    expect(
      t.auditRepo.lignes.filter(
        (l) => l.action === "comptable.rapprochement.appliquer" && l.resultat === "refus",
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("refuse un corps invalide (422 COMMANDE_INVALIDE) sans rien faire", async () => {
    const mauvais: unknown[] = [
      { ...t.corpsDecisions(MOIS, []), decisions: [] },
      t.corpsDecisions("2026-12-01", TOUTES),
      t.corpsDecisions(MOIS, [{ reference: "X", action: "offrir" as never }]),
      { ...t.corpsDecisions(MOIS, TOUTES), pirate: true },
      t.corpsDecisions(MOIS, [{ reference: "", action: "rembourser" }]),
    ];
    for (const corps of mauvais) {
      const rep = await ecrire("/rapprochement/decisions", corps);
      expect(rep.status, JSON.stringify(corps)).toBe(422);
      expect(rep.body.code).toBe("COMMANDE_INVALIDE");
    }
    expect(t.actions.appels).toHaveLength(0);
  });

  it("applique les quatre décisions, répond comme le contrat et compte chaque action", async () => {
    const rep = await decider();
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const r = patron.RapprochementAppliqueSchema.parse(rep.body);
    expect(r).toMatchObject({
      mois: MOIS,
      remboursements: 2,
      rattachements: 1,
      reclamations: 1,
      lignesOuvertes: 0,
      signePar: patronId,
    });
    expect(t.actions.appels.map((a) => a.type).sort()).toEqual([
      "rattacher",
      "reclamer",
      "rembourser",
      "rembourser",
    ]);
    const liste = patron.RapprochementMomoSchema.parse((await lire("/rapprochement")).body);
    expect(liste.lignes.map((l) => l.decision)).toEqual([
      "rembourser",
      "rembourser",
      "rattacher",
      "demander",
    ]);
  });

  it("une décision partielle laisse des lignes ouvertes", async () => {
    const rep = await decider(TOUTES.slice(0, 1));
    expect(rep.body.lignesOuvertes).toBe(3);
  });

  it("rejouer la même décision ne rembourse pas deux fois", async () => {
    await decider(TOUTES.slice(0, 2));
    const encore = await decider(TOUTES.slice(0, 2));
    expect(encore.status).toBe(200);
    expect(t.actions.appels.filter((a) => a.type === "rembourser")).toHaveLength(2);
    expect(encore.body.remboursements).toBe(2);
  });

  it("deux envois simultanés de la même décision ne paient qu'une fois", async () => {
    const [a, b] = await Promise.all([decider(TOUTES.slice(0, 1)), decider(TOUTES.slice(0, 1))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(t.actions.appels.filter((x) => x.type === "rembourser")).toHaveLength(1);
  });

  it("une décision prise est définitive : en changer est refusé (409 DECISION_DEJA_PRISE)", async () => {
    await decider(TOUTES.slice(0, 1));
    const rep = await decider([{ reference: ORPHELINES.doublon, action: "demander" }]);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("DECISION_DEJA_PRISE");
    expect(t.actions.appels.filter((x) => x.type === "reclamer")).toHaveLength(0);
  });

  it("un lot invalide ne fait aucun effet : tout est contrôlé avant le premier remboursement", async () => {
    const inconnue = await decider([
      TOUTES[0]!,
      { reference: "MP-INEXISTANTE", action: "rembourser" },
    ]);
    expect(inconnue.status).toBe(404);
    expect(inconnue.body.code).toBe("TRANSACTION_INCONNUE");
    // « rattacher » n'a de sens que si le colis a été retrouvé.
    const sansCible = await decider([
      TOUTES[0]!,
      { reference: ORPHELINES.inconnue, action: "rattacher" },
    ]);
    expect(sansCible.status).toBe(422);
    expect(sansCible.body.code).toBe("CIBLE_INTROUVABLE");
    expect(t.actions.appels).toHaveLength(0);
    expect(t.decisions.lignes.size).toBe(0);
  });

  it("l'opérateur refuse un remboursement : 422, la décision est retirée et la ligne reste ouverte", async () => {
    t.actions.refusees.add(ORPHELINES.doublon);
    const rep = await decider(TOUTES.slice(0, 1));
    expect(rep.status).toBe(422);
    expect(rep.body.code).toBe("ACTION_REFUSEE");
    const liste = patron.RapprochementMomoSchema.parse((await lire("/rapprochement")).body);
    expect(liste.lignes[0]?.decision).toBeNull();
    // Le patron peut choisir une autre action pour cette ligne.
    t.actions.refusees.clear();
    const autre = await decider([{ reference: ORPHELINES.doublon, action: "demander" }]);
    expect(autre.status).toBe(200);
  });

  it("réseau coupé : la décision est enregistrée mais la ligne reste ouverte, la tâche de fond la termine", async () => {
    t.actions.panne = true;
    const rep = await decider(TOUTES.slice(0, 1));
    expect(rep.status).toBe(200);
    expect(rep.body.lignesOuvertes).toBe(4);
    expect(t.actions.appels).toHaveLength(0);
    // La clôture reste impossible tant que le remboursement n'est pas parti.
    await decider(TOUTES.slice(1));
    t.actions.panne = false;
    expect(await t.taches.reprendreDecisions()).toBe(4);
    expect(t.actions.appels).toHaveLength(4);
    expect(await t.taches.reprendreDecisions()).toBe(0);
    const liste = patron.RapprochementMomoSchema.parse((await lire("/rapprochement")).body);
    expect(liste.lignes.every((l) => l.decision !== null)).toBe(true);
  });

  it("trace l'action au journal d'audit sans jamais y écrire le PIN", async () => {
    await decider();
    const ligne = t.auditRepo.lignes.find(
      (l) => l.action === "comptable.rapprochement.appliquer" && l.resultat === "succes",
    );
    expect(ligne).toBeDefined();
    expect(ligne?.acteurId).toBe(patronId);
    await decider(TOUTES, "135790");
    expect(journalEnTexte()).not.toContain(PIN_PATRON);
    expect(journalEnTexte()).not.toContain("135790");
  });

  it("refuse un mois futur (404) ou antérieur à AfriMove (404)", async () => {
    expect((await decider(TOUTES, PIN_PATRON, "2027-06")).status).toBe(404);
    expect((await decider(TOUTES, PIN_PATRON, "2019-01")).status).toBe(404);
  });
});

describe("clôture du mois", () => {
  async function toutTraiter() {
    const rep = await decider();
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
  }

  it("la lecture d'un mois ouvert respecte le contrat : encaissé et écart MoMo de 16 000 F", async () => {
    const rep = await lire("/cloture");
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const c = patron.ClotureMoisSchema.parse(rep.body);
    expect(c).toMatchObject({ mois: MOIS, statut: "ouvert", verrouille: false, clotureA: null });
    expect(c.encaisse.total).toBe(encaisseAttendu());
    expect(c.encaisse.cash + c.encaisse.momo).toBeLessThanOrEqual(c.encaisse.total);
    expect(c.encaisse.ecart).toBe(16_000);
    expect(c.envoi.fichiers).toHaveLength(5);
    expect(c.envoi.destinataire).toBe("cabinet@…");
    // L'en-tête et les trois premières ventes.
    expect(c.apercuJournal).toHaveLength(4);
    expect(c.apercuJournal[0]).toContain("date;heure;ligne");
    // Aucune des quatre transactions n'est traitée encore ; elles le sont toutes après les décisions.
    expect(c.transactionsTraitees).toBe(0);
    // L'écart tombe à zéro quand les quatre lignes sont traitées.
    await toutTraiter();
    expect((await lire("/cloture")).body.encaisse.ecart).toBe(0);
    const apres = patron.ClotureMoisSchema.parse((await lire("/cloture")).body);
    expect(apres.transactionsTraitees).toBe(TOUTES.length);
    expect(OP_CLOTURE.chemin({})).toBe("/patron/comptable/cloture");
  });

  it("refuse sans signature (401) et avec un mauvais PIN (403) : rien n'est clôturé", async () => {
    await toutTraiter();
    const sans = await ecrire("/clotures", { mois: MOIS, envoyerAuCabinet: false });
    expect(sans.status).toBe(401);
    const mauvais = await cloturer(false, "111111");
    expect(mauvais.status).toBe(403);
    expect(t.clotures.lignes.size).toBe(0);
    expect((await lire("/cloture")).body.statut).toBe("ouvert");
  });

  it("refuse un corps invalide (422)", async () => {
    for (const corps of [
      { ...t.corpsCloture(MOIS), envoyerAuCabinet: "oui" },
      { ...t.corpsCloture(MOIS), extra: 1 },
      { ...t.corpsCloture("décembre") },
    ]) {
      const rep = await ecrire("/clotures", corps);
      expect(rep.status, JSON.stringify(corps)).toBe(422);
    }
  });

  it("rien n'est clôturé tant qu'une ligne du rapprochement reste ouverte (409)", async () => {
    await decider(TOUTES.slice(0, 3));
    const rep = await cloturer();
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("RAPPROCHEMENT_OUVERT");
    expect(rep.body.message).toContain("1 à traiter");
    expect(t.clotures.lignes.size).toBe(0);
  });

  it("on ne clôture pas un mois qui n'est pas terminé (409 MOIS_EN_COURS)", async () => {
    const rep = await cloturer(false, PIN_PATRON, "2027-01");
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("MOIS_EN_COURS");
  });

  it("clôture : fige les cinq fichiers, verrouille, répond comme le contrat et trace l'action", async () => {
    await toutTraiter();
    const avant = encaisseAttendu();
    const rep = await cloturer();
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const r = patron.MoisClotureSchema.parse(rep.body);
    expect(r.signePar).toBe(patronId);
    expect(r.cloture).toMatchObject({ mois: MOIS, statut: "cloture", verrouille: true });
    expect(r.cloture.clotureA).toMatch(/\+01:00$/);
    expect(r.cloture.encaisse.total).toBe(avant);
    expect(r.cloture.encaisse.ecart).toBe(0);
    expect(r.cloture.transactionsTraitees).toBe(TOUTES.length);
    expect(r.cloture.envoi.fichiers.map((f) => f.format)).toEqual([
      "xlsx",
      "xlsx",
      "csv",
      "csv",
      "pdf",
    ]);
    expect(r.cloture.envoi.fichiers.every((f) => (f.tailleOctets ?? 0) > 0)).toBe(true);
    expect(r.cloture.envoi.fichiers[4]?.pages).toBeGreaterThanOrEqual(1);
    expect(r.cloture.envoi.recuA).toBeNull();
    expect(t.messagerie.envoyes).toHaveLength(0);
    expect(t.clotures.lignes.get(`${AGENCE}|${MOIS}`)?.fichiers).toHaveLength(5);
    expect(
      t.auditRepo.lignes.some((l) => l.action === "comptable.cloturer" && l.resultat === "succes"),
    ).toBe(true);
    expect(journalEnTexte()).not.toContain(PIN_PATRON);
  });

  it("« tout envoyer » : un seul message au cabinet avec les cinq pièces, accusé de réception noté", async () => {
    await toutTraiter();
    t.messagerie.accuse = "2027-01-05T10:00:00.000+01:00";
    const rep = await cloturer(true);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(t.messagerie.envoyes).toHaveLength(1);
    const message = t.messagerie.envoyes[0]!;
    expect(message.destinataire).toBe(EMAIL_CABINET);
    expect(message.objet).toBe("AfriMove · exports comptables · Décembre 2026");
    expect(message.pieces.map((p) => p.nom)).toEqual([
      "journal-ventes-2026-12.xlsx",
      "journal-caisse-2026-12.xlsx",
      "annulations-remboursements-2026-12.csv",
      "ecritures-syscohada-2026-12.csv",
      "factures-afrimove-2026-12.pdf",
    ]);
    expect(rep.body.cloture.envoi.recuA).toBe("2027-01-05T10:00:00.000+01:00");
    expect((await lire("")).body.cabinet.derniersEnvoisRecus).toBe(1);
  });

  it("messagerie en panne : le mois est clôturé quand même et la tâche de fond renvoie le message", async () => {
    await toutTraiter();
    t.messagerie.panne = true;
    const rep = await cloturer(true);
    expect(rep.status).toBe(200);
    expect(rep.body.cloture.envoi.recuA).toBeNull();
    expect(t.messagerie.envoyes).toHaveLength(0);
    t.messagerie.panne = false;
    t.messagerie.accuse = "2027-01-05T11:00:00.000+01:00";
    expect(await t.taches.reprendreEnvois()).toBe(1);
    expect(t.messagerie.envoyes).toHaveLength(1);
    expect((await lire(`/cloture?mois=${MOIS}`)).body.envoi.recuA).toBe(
      "2027-01-05T11:00:00.000+01:00",
    );
    // Plus rien à reprendre, et pas de second message.
    expect(await t.taches.reprendreEnvois()).toBe(0);
    expect(t.messagerie.envoyes).toHaveLength(1);
  });

  it("envoyer au cabinet sans adresse renseignée : 422, rien n'est clôturé", async () => {
    await toutTraiter();
    t.parametres.definir({
      compagnieId: AGENCE,
      nomAgence: "Alpha Voyages",
      emailCabinet: null,
      envoiAutomatique: false,
      jourDEnvoi: 2,
      jourDeCloture: 5,
    });
    const rep = await cloturer(true);
    expect(rep.status).toBe(422);
    expect(rep.body.code).toBe("CABINET_NON_RENSEIGNE");
    expect(t.clotures.lignes.size).toBe(0);
    // Sans envoi, la clôture passe.
    expect((await cloturer(false)).status).toBe(200);
  });

  it("une seconde clôture est refusée (409), même lancée en même temps que la première", async () => {
    await toutTraiter();
    const reponses = await Promise.all([cloturer(true), cloturer(true), cloturer(true)]);
    expect(reponses.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(t.messagerie.envoyes).toHaveLength(1);
    expect(t.clotures.lignes.size).toBe(1);
  });

  describe("mois clôturé", () => {
    beforeEach(async () => {
      await toutTraiter();
      expect((await cloturer(true)).status).toBe(200);
    });

    it("refuse toute nouvelle décision (409 MOIS_DEJA_CLOTURE)", async () => {
      const rep = await decider([{ reference: ORPHELINES.doublon, action: "rembourser" }]);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("MOIS_DEJA_CLOTURE");
    });

    it("le verrou est à la disposition des autres modules", async () => {
      expect(await t.verrou.estVerrouille(AGENCE, MOIS)).toBe(true);
      expect(await t.verrou.estVerrouille(AGENCE, new Date("2026-12-15T10:00:00Z"))).toBe(true);
      expect(await t.verrou.estVerrouille(AGENCE, "2027-01")).toBe(false);
      expect(await t.verrou.estVerrouille(AUTRE_AGENCE, MOIS)).toBe(false);
      await expect(t.verrou.exigerOuvert(AGENCE, MOIS)).rejects.toMatchObject({ status: 409 });
      await expect(t.verrou.exigerOuvert(AGENCE, "2027-01")).resolves.toBeUndefined();
    });

    /** Tout ce que l'API montre de décembre, tel qu'elle le montre maintenant. */
    async function toutDeDecembre() {
      const q = `?mois=${MOIS}`;
      const fichier = await lire(`/exports/journal_ventes/fichier${q}`).buffer(true).parse(binaire);
      return {
        fichier: fichier.body as Buffer,
        empreinte: fichier.headers["x-empreinte-afrimove"],
        apercu: (await lire(`/exports/journal_ventes/apercu${q}`)).body,
        cloture: (await lire(`/cloture${q}`)).body,
        rapprochement: (await lire(`/rapprochement${q}`)).body,
        synthese: (await lire(q)).body,
      };
    }

    it("une écriture tardive ne change rien : le fichier, l'aperçu et l'encaissé restent ceux de la clôture", async () => {
      const avant = await toutDeDecembre();
      // Une vente saisie après coup dans décembre (synchronisation tardive d'une caisse hors ligne).
      t.ventes.ajouter(AGENCE, vente({ at: iso("2026-12-20", "10:00:00"), prix: 9999 }));
      t.horloge.avancer(3 * 24 * 3600_000);
      const apres = await toutDeDecembre();
      expect(apres.fichier.equals(avant.fichier)).toBe(true);
      expect(apres.empreinte).toBe(avant.empreinte);
      expect(apres.apercu).toEqual(avant.apercu);
      expect(apres.cloture).toEqual(avant.cloture);
      expect(apres.rapprochement).toEqual(avant.rapprochement);
      expect(apres.synthese).toEqual(avant.synthese);
    });

    it("la synthèse d'un mois clôturé dit « cloture » et le mois par défaut devient janvier", async () => {
      const rep = await lire(`?mois=${MOIS}`);
      expect(patron.SyntheseComptableSchema.parse(rep.body).statut).toBe("cloture");
      expect((await lire("")).body.mois).toBe("2027-01");
    });

    it("l'aperçu d'un mois clôturé relit le tableau figé : le même total, la même signature", async () => {
      const a = patron.ApercuExportSchema.parse(
        (await lire(`/exports/journal_ventes/apercu?mois=${MOIS}`)).body,
      );
      expect(a.tableau.totalMontant).toBe(encaisseAttendu());
      expect(a.signe).toBe(true);
      const onglet = a.onglets[1]!;
      const rep = await lire(`/exports/journal_ventes/apercu?mois=${MOIS}&onglet=${onglet.id}`);
      expect(rep.status).toBe(200);
      // Le fichier téléchargé est celui qui a été envoyé au cabinet.
      const envoye = t.messagerie.envoyes[0]!.pieces[0]!.contenu;
      const telecharge = await lire(`/exports/journal_ventes/fichier?mois=${MOIS}`)
        .buffer(true)
        .parse(binaire);
      expect((telecharge.body as Buffer).equals(envoye)).toBe(true);
    });
  });
});

describe("envoi automatique du 2 du mois", () => {
  it("n'envoie rien avant le jour réglé", async () => {
    regler(new Date("2027-01-01T09:00:00.000Z"));
    expect(await t.taches.envoyerAuCabinet()).toBe(0);
  });

  it("le 2, envoie les cinq fichiers provisoires du mois écoulé, une seule fois", async () => {
    regler(new Date("2027-01-02T07:00:00.000Z"));
    expect(await t.taches.envoyerAuCabinet()).toBe(1);
    expect(t.messagerie.envoyes).toHaveLength(1);
    const m = t.messagerie.envoyes[0]!;
    expect(m.objet).toBe("AfriMove · exports comptables · Décembre 2026 (provisoire)");
    expect(m.pieces).toHaveLength(5);
    expect(m.corps).toContain("provisoires");
    // Rejoué le même jour, ou le lendemain : pas de doublon.
    expect(await t.taches.envoyerAuCabinet()).toBe(0);
    regler(new Date("2027-01-03T07:00:00.000Z"));
    expect(await t.taches.envoyerAuCabinet()).toBe(0);
    expect(t.messagerie.envoyes).toHaveLength(1);
  });

  it("si la clôture a déjà tout envoyé, l'envoi automatique n'envoie rien de plus", async () => {
    regler(new Date("2027-01-03T07:00:00.000Z"));
    expect((await decider()).status).toBe(200);
    expect((await cloturer(true)).status).toBe(200);
    expect(await t.taches.envoyerAuCabinet()).toBe(0);
    expect(t.messagerie.envoyes).toHaveLength(1);
  });

  it("un mois clôturé sans envoi part le 2 avec ses fichiers définitifs", async () => {
    regler(new Date("2027-01-03T07:00:00.000Z"));
    expect((await decider()).status).toBe(200);
    expect((await cloturer(false)).status).toBe(200);
    expect(await t.taches.envoyerAuCabinet()).toBe(1);
    const m = t.messagerie.envoyes[0]!;
    expect(m.objet).toBe("AfriMove · exports comptables · Décembre 2026");
    expect(m.corps).toContain("définitifs");
    const figes = t.clotures.lignes.get(`${AGENCE}|${MOIS}`)!.fichiers;
    for (const piece of m.pieces) {
      const fige = figes.find((f) => f.nomFichier === piece.nom);
      expect(fige, piece.nom).toBeDefined();
      expect(piece.contenu.equals(fige!.contenu), piece.nom).toBe(true);
    }
  });

  it("rattrape l'envoi si l'API était arrêtée le 2, mais pas au-delà de trois jours", async () => {
    regler(new Date("2027-01-04T07:00:00.000Z"));
    expect(await t.taches.envoyerAuCabinet()).toBe(1);
    const autre = await creerAppComptableTest({ debut: new Date("2027-01-06T07:00:00.000Z") });
    autre.parametres.definir({
      compagnieId: AGENCE,
      nomAgence: "Alpha Voyages",
      emailCabinet: EMAIL_CABINET,
      envoiAutomatique: true,
      jourDEnvoi: 2,
      jourDeCloture: 5,
    });
    expect(await autre.taches.envoyerAuCabinet()).toBe(0);
    await autre.fermer();
  });

  it("ne fait rien si l'agence n'a pas activé l'envoi automatique ou n'a pas de cabinet", async () => {
    regler(new Date("2027-01-02T07:00:00.000Z"));
    t.parametres.definir({
      compagnieId: AGENCE,
      nomAgence: "Alpha Voyages",
      emailCabinet: EMAIL_CABINET,
      envoiAutomatique: false,
      jourDEnvoi: 2,
      jourDeCloture: 5,
    });
    expect(await t.taches.envoyerAuCabinet()).toBe(0);
    t.parametres.definir({
      compagnieId: AGENCE,
      nomAgence: "Alpha Voyages",
      emailCabinet: null,
      envoiAutomatique: true,
      jourDEnvoi: 2,
      jourDeCloture: 5,
    });
    expect(await t.taches.envoyerAuCabinet()).toBe(0);
    expect(t.messagerie.envoyes).toHaveLength(0);
  });

  it("messagerie en panne : l'envoi n'est pas marqué fait et repart à la tâche suivante", async () => {
    regler(new Date("2027-01-02T07:00:00.000Z"));
    t.messagerie.panne = true;
    expect(await t.taches.envoyerAuCabinet()).toBe(0);
    expect(t.envois.lignes.size).toBe(0);
    t.messagerie.panne = false;
    expect(await t.taches.envoyerAuCabinet()).toBe(1);
  });
});
