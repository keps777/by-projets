import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { genererCleAppareil } from "@afrimove/sync";
import type { Role } from "../socle/auth/roles";
import type { AppConfig } from "../socle/config/config";
import { VerificationStockageSync } from "./sync.module";
import { MS_PAR_HEURE, MS_PAR_MINUTE, versIsoDouala } from "./temps";
import {
  AUTRE_COMPAGNIE,
  AUTRE_GARE,
  COMPAGNIE,
  GARE,
  creerAppSyncTest,
  type AppSyncTest,
} from "./testing/app-sync-test";
import { AppareilTest, installerAppareil, uuid, type EvenementBrut } from "./testing/outils";

let t: AppSyncTest;
let compteur = 0;
const nom = (prefixe: string) => `${prefixe}-${++compteur}`;

beforeAll(async () => {
  t = await creerAppSyncTest();
});
afterAll(() => t.fermer());

const maintenant = () => t.horloge.maintenant().getTime();

/** Envoie un lot signé par l'appareil, avec le jeton de son porteur. */
async function envoyer(
  a: AppareilTest,
  evenements: EvenementBrut[],
  options: { depuis?: number; envoyeA?: number; jeton?: string } = {},
) {
  const lot = await a.lot(evenements, {
    depuis: options.depuis,
    envoyeA: options.envoyeA ?? maintenant(),
  });
  return t
    .http()
    .post("/sync/evenements")
    .set("Authorization", `Bearer ${options.jeton ?? a.jeton}`)
    .send(lot);
}

const alertesDe = (appareilId: string, type?: string) =>
  t.alertes.lignes.filter(
    (a) => a.appareilId === appareilId && (type === undefined || a.type === type),
  );

describe("accès à la route", () => {
  it("sans jeton : 401 ; patron, comptable, afrimove, relais : 403 ; le terrain passe", async () => {
    const g = await installerAppareil(t, nom("g"));
    const vide = await g.lot([], { envoyeA: maintenant() });
    expect((await t.http().post("/sync/evenements").send(vide)).status).toBe(401);
    for (const role of [
      "patron",
      "comptable",
      "afrimove",
      "relais",
      "livreur",
      "voyageur",
    ] as Role[]) {
      const { jeton } = await t.compte(role, role === "patron" ? { gareId: null } : {});
      const rep = await t
        .http()
        .post("/sync/evenements")
        .set("Authorization", `Bearer ${jeton}`)
        .send(vide);
      expect(rep.status, role).toBe(403);
    }
    for (const role of [
      "guichetier",
      "convoyeur",
      "chauffeur",
      "vendeur",
      "controleur",
      "superviseur",
    ] as Role[]) {
      const a = await installerAppareil(t, nom(role), {
        role: role as "guichetier",
      });
      const rep = await envoyer(a, []);
      expect(rep.status, role).toBe(200);
    }
  });

  it("l'enrôlement de la clé et la lecture des alertes ont leurs propres rôles", async () => {
    const g = await installerAppareil(t, nom("g"), { sansCle: true });
    const cle = (await genererCleAppareil()).publique;
    const patron = await t.compte("patron", { gareId: null });
    expect(
      (
        await t
          .http()
          .put(`/sync/appareils/${g.id}/cle`)
          .set("Authorization", `Bearer ${patron.jeton}`)
          .send({ cle })
      ).status,
    ).toBe(403);
    expect(
      (await t.http().get("/sync/alertes").set("Authorization", `Bearer ${g.jeton}`)).status,
    ).toBe(403);
    expect((await t.http().get("/sync/alertes")).status).toBe(401);
  });
});

describe("appareil et clé", () => {
  it("appareil inconnu : 404", async () => {
    const g = await installerAppareil(t, nom("g"));
    const lot = await g.lot([], { envoyeA: maintenant() });
    const rep = await t
      .http()
      .post("/sync/evenements")
      .set("Authorization", `Bearer ${g.jeton}`)
      .send({ ...lot, appareilId: "n-existe-pas" });
    expect(rep.status).toBe(404);
    expect(rep.body.code).toBe("APPAREIL_INCONNU");
  });

  it("appareil sans clé : 409 tant que sa clé n'est pas enregistrée", async () => {
    const g = await installerAppareil(t, nom("g"), { sansCle: true });
    const rep = await envoyer(g, [g.autre("caisse.ouverte", maintenant())]);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("APPAREIL_NON_ENROLE");
    expect(t.journal.lignes.some((l) => l.evenement.appareilId === g.id)).toBe(false);
  });

  it("enrôlement : une clé invalide est refusée, une clé déjà posée ne se remplace pas sans superviseur", async () => {
    const g = await installerAppareil(t, nom("g"), { sansCle: true });
    const jeton = `Bearer ${g.jeton}`;
    const mauvaise = await t
      .http()
      .put(`/sync/appareils/${g.id}/cle`)
      .set("Authorization", jeton)
      .send({ cle: { kty: "RSA" } });
    expect(mauvaise.status).toBe(409);
    expect(mauvaise.body.code).toBe("CLE_INVALIDE");
    expect(
      (await t.http().put(`/sync/appareils/${g.id}/cle`).set("Authorization", jeton).send({}))
        .status,
    ).toBe(409);
    const bonne = await t
      .http()
      .put(`/sync/appareils/${g.id}/cle`)
      .set("Authorization", jeton)
      .send({ cle: g.cle.publique });
    expect(bonne.status).toBe(204);
    const encore = await t
      .http()
      .put(`/sync/appareils/${g.id}/cle`)
      .set("Authorization", jeton)
      .send({ cle: g.cle.publique });
    expect(encore.status).toBe(409);
    expect(encore.body.code).toBe("CLE_DEJA_ENREGISTREE");
    expect(t.auditRepo.lignes.some((l) => l.action === "sync.cle_enregistree")).toBe(true);
  });

  it("un superviseur remplace la clé (téléphone réinstallé) ; l'ancienne ne signe plus", async () => {
    const g = await installerAppareil(t, nom("g"));
    const sup = await t.compte("superviseur");
    const neuve = await genererCleAppareil();
    const rep = await t
      .http()
      .put(`/sync/appareils/${g.id}/cle`)
      .set("Authorization", `Bearer ${sup.jeton}`)
      .send({ cle: neuve.publique });
    expect(rep.status).toBe(204);
    expect(t.auditRepo.lignes.some((l) => l.action === "sync.cle_remplacee")).toBe(true);
    const ancien = await envoyer(g, [g.vente({ at: maintenant(), numeroPlage: 1001 })]);
    expect(ancien.body.resultats[0]).toMatchObject({
      statut: "rejete",
      code: "signature_invalide",
    });
    const nouveau = new AppareilTest(g.id, g.auteurId, g.jeton, neuve);
    const ok = await envoyer(nouveau, [nouveau.vente({ at: maintenant(), numeroPlage: 1002 })]);
    expect(ok.body.resultats[0].statut).toBe("accepte");
  });

  it("un appareil d'une autre gare ou d'une autre compagnie n'est pas accessible", async () => {
    const g = await installerAppareil(t, nom("g"));
    const etranger = await t.compte("guichetier", { gareId: AUTRE_GARE });
    const lot = await g.lot([], { envoyeA: maintenant() });
    const rep = await t
      .http()
      .post("/sync/evenements")
      .set("Authorization", `Bearer ${etranger.jeton}`)
      .send(lot);
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("APPAREIL_AUTRE_GARE");
    const autreCompagnie = await t.compte("guichetier", { compagnieId: AUTRE_COMPAGNIE });
    const rep2 = await t
      .http()
      .post("/sync/evenements")
      .set("Authorization", `Bearer ${autreCompagnie.jeton}`)
      .send(lot);
    expect(rep2.status).toBe(403);
    const cle = (await genererCleAppareil()).publique;
    const rep3 = await t
      .http()
      .put(`/sync/appareils/${g.id}/cle`)
      .set("Authorization", `Bearer ${etranger.jeton}`)
      .send({ cle });
    expect(rep3.status).toBe(403);
  });
});

describe("réception idempotente", () => {
  it("accepte, puis répond deja_recu au renvoi sans rien écrire une seconde fois", async () => {
    const g = await installerAppareil(t, nom("g"));
    const evenements = [
      g.autre("caisse.ouverte", maintenant() - 3 * MS_PAR_MINUTE, { fondDeCaisse: 5000 }),
      g.vente({ at: maintenant() - 2 * MS_PAR_MINUTE, numeroPlage: 1001, siege: 3 }),
      g.vente({ at: maintenant() - MS_PAR_MINUTE, numeroPlage: 1002, siege: 4 }),
    ];
    const premier = await envoyer(g, evenements);
    expect(premier.status).toBe(200);
    expect(premier.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "accepte",
      "accepte",
      "accepte",
    ]);
    expect(premier.body.resultats.map((r: { evenementId: string }) => r.evenementId)).toEqual(
      evenements.map((e) => e.id),
    );
    const dedans = t.journal.lignes.filter((l) => l.evenement.appareilId === g.id);
    expect(dedans).toHaveLength(3);
    const operations = (await t.sieges.operations("depart-1", 3)).length;

    const second = await envoyer(g, evenements);
    expect(second.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "deja_recu",
      "deja_recu",
      "deja_recu",
    ]);
    expect(t.journal.lignes.filter((l) => l.evenement.appareilId === g.id)).toHaveLength(3);
    expect(await t.sieges.operations("depart-1", 3)).toHaveLength(operations);
    expect(alertesDe(g.id)).toEqual([]);
  });

  it("un renvoi partiel (la réponse s'est perdue en route) complète sans doublon", async () => {
    const g = await installerAppareil(t, nom("g"));
    const e = [1, 2, 3, 4].map((i) =>
      g.vente({ at: maintenant() - i * MS_PAR_MINUTE, numeroPlage: 1000 + i, siege: 10 + i }),
    );
    await envoyer(g, e.slice(0, 2));
    const rep = await envoyer(g, e, { depuis: 1 });
    expect(rep.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "deja_recu",
      "deja_recu",
      "accepte",
      "accepte",
    ]);
    expect(t.journal.lignes.filter((l) => l.evenement.appareilId === g.id)).toHaveLength(4);
    expect(alertesDe(g.id, "file_reinitialisee")).toEqual([]);
  });

  it("rejoue dans l'ordre de la file, même si le lot arrive mélangé", async () => {
    const g = await installerAppareil(t, nom("g"));
    const e = [1, 2, 3].map((i) =>
      g.vente({
        at: maintenant() - 10 * MS_PAR_MINUTE + i * MS_PAR_MINUTE,
        numeroPlage: 1100 + i,
        siege: 20 + i,
      }),
    );
    const lot = await g.lot(e);
    lot.evenements.reverse();
    const rep = await t
      .http()
      .post("/sync/evenements")
      .set("Authorization", `Bearer ${g.jeton}`)
      .send(lot);
    expect(rep.body.resultats.map((r: { evenementId: string }) => r.evenementId)).toEqual(
      e.map((x) => x.id),
    );
    const lignes = t.journal.lignes.filter((l) => l.evenement.appareilId === g.id);
    expect(lignes.map((l) => l.ordreAppareil)).toEqual([1, 2, 3]);
    expect(lignes.map((l) => l.seq)).toEqual([...lignes.map((l) => l.seq)].sort((a, b) => a - b));
  });

  it("garde l'événement tel qu'il est arrivé (la signature porte sur ce texte)", async () => {
    const g = await installerAppareil(t, nom("g"));
    const e = g.vente({ at: maintenant(), numeroPlage: 1201, siege: 33 });
    await envoyer(g, [e]);
    const ligne = t.journal.lignes.find((l) => l.evenement.id === e.id)!;
    expect(ligne.evenement).toMatchObject({ at: e.at, numeroPlage: 1201, donnees: e.donnees });
    expect(ligne.origine).toBe("appareil");
  });

  it("la réponse porte la plage, l'heure de synchronisation, les parts hors ligne et les vérificateurs", async () => {
    const g = await installerAppareil(t, nom("g"), { rang: 2 });
    t.provisionnement.parts.set(g.id, { "depart-1": [1, 2, 3] });
    t.provisionnement.verificateurs.push({
      superviseurId: "s1",
      sel: "00ff",
      iterations: 1000,
      hache: "ab",
    });
    const rep = await envoyer(g, []);
    expect(rep.body.appareil).toMatchObject({
      derniereSyncA: versIsoDouala(maintenant()),
      plage: { debut: 1001, fin: 1999 },
      partsHorsLigne: { "depart-1": [1, 2, 3] },
      octroi: null,
      verificateursPin: [{ superviseurId: "s1", sel: "00ff", iterations: 1000, hache: "ab" }],
    });
    expect(rep.body.serveurA).toBe(versIsoDouala(maintenant()));
    expect((await t.appareils.trouver(g.id))!.derniereSyncA).toBe(versIsoDouala(maintenant()));
    t.provisionnement.verificateurs.length = 0;
  });

  it("une plage attribuée explicitement (AM-161) l'emporte sur celle du rang", async () => {
    const g = await installerAppareil(t, nom("g"), { rang: 2, plage: { debut: 5001, fin: 5099 } });
    const rep = await envoyer(g, []);
    expect(rep.body.appareil.plage).toEqual({ debut: 5001, fin: 5099 });
  });

  it("reprise après un arrêt du serveur entre les effets et l'écriture au journal : pas de doublon", async () => {
    const g = await installerAppareil(t, nom("g"));
    const e = g.vente({
      at: maintenant() - MS_PAR_MINUTE,
      numeroPlage: 1301,
      billetId: "b-reprise",
      siege: 41,
    });
    // Le serveur est tombé après avoir posé le siège mais avant d'écrire au journal.
    await t.sieges.definirBillet("b-reprise", "depart-1", 41);
    await t.sieges.ajouterOperation("depart-1", 41, {
      evenementId: e.id,
      billetId: "b-reprise",
      kind: "prend",
      at: Date.parse(e.at),
      appareilId: g.id,
      auteurId: g.auteurId,
    });
    await t.numeros.enregistrer({
      appareilId: g.id,
      jour: "261102",
      genre: "billet",
      numeroPlage: 1301,
      evenementId: e.id,
      plage: null,
    });
    const rep = await envoyer(g, [e]);
    expect(rep.body.resultats[0].statut).toBe("accepte");
    expect(await t.sieges.operations("depart-1", 41)).toHaveLength(1);
    expect(alertesDe(g.id)).toEqual([]);
    expect(t.journal.lignes.filter((l) => l.evenement.id === e.id)).toHaveLength(1);
  });
});

describe("un événement refusé n'arrête pas le lot", () => {
  it("signature invalide, rôle interdit, auteur ou appareil incohérent, type inconnu, données illisibles", async () => {
    const g = await installerAppareil(t, nom("g"));
    const bon1 = g.vente({ at: maintenant(), numeroPlage: 1401, siege: 50 });
    const falsifie = g.vente({ at: maintenant(), numeroPlage: 1402, siege: 51 });
    const autreAuteur = {
      ...g.vente({ at: maintenant(), numeroPlage: 1403, siege: 52 }),
      auteurId: "quelqu-un-d-autre",
    };
    const autreAppareil = {
      ...g.vente({ at: maintenant(), numeroPlage: 1404, siege: 53 }),
      appareilId: "g-voisin",
    };
    const interdit = g.autre(
      "annulation.decidee",
      maintenant(),
      { billetId: "b1", decision: "rembourser" },
      { type: "demande", id: "r1" },
    );
    const inconnu = g.autre("billet.offert", maintenant());
    const illisible = {
      ...g.vente({ at: maintenant(), numeroPlage: 1405 }),
      donnees: null,
    } as unknown as EvenementBrut;
    const bon2 = g.vente({ at: maintenant(), numeroPlage: 1406, siege: 54 });

    const lot = await g.lot([
      bon1,
      falsifie,
      autreAuteur,
      autreAppareil,
      interdit,
      inconnu,
      illisible,
      bon2,
    ]);
    lot.evenements[1]!.evenement = { ...falsifie, numeroPlage: 1499 } as never; // modifié après signature
    const rep = await t
      .http()
      .post("/sync/evenements")
      .set("Authorization", `Bearer ${g.jeton}`)
      .send(lot);
    expect(rep.status).toBe(200);
    const resultats = rep.body.resultats as { statut: string; code?: string }[];
    expect(resultats.map((r) => [r.statut, r.code])).toEqual([
      ["accepte", undefined],
      ["rejete", "signature_invalide"],
      ["rejete", "auteur_incoherent"],
      ["rejete", "appareil_incoherent"],
      ["rejete", "role_non_autorise"],
      ["rejete", "type_inconnu"],
      ["rejete", "donnees_invalides"],
      ["accepte", undefined],
    ]);
    const ids = t.journal.lignes
      .filter((l) => l.evenement.appareilId === g.id)
      .map((l) => l.evenement.id);
    expect(ids).toEqual([bon1.id, bon2.id]);
    expect(alertesDe(g.id, "evenement_rejete")).toHaveLength(6);
    const refus = t.auditRepo.lignes.filter((l) => l.action === "sync.evenement_rejete");
    expect(refus.length).toBeGreaterThanOrEqual(6);
    expect(refus.at(-1)).toMatchObject({ resultat: "refus" });
    // les rejets comptent comme reçus : le rang de la file ne doit plus manquer
    expect((await t.appareils.trouver(g.id))!.dernierOrdre).toBe(8);
  });

  it("le rôle de la session décide : un guichetier ne peut pas écrire une validation de caisse", async () => {
    const g = await installerAppareil(t, nom("g"));
    const e = g.autre(
      "caisse.validee",
      maintenant(),
      { caisseId: "c1" },
      { type: "session", id: "c1" },
    );
    const rep = await envoyer(g, [e]);
    expect(rep.body.resultats[0]).toMatchObject({ statut: "rejete", code: "role_non_autorise" });
  });

  it("un contrôleur écrit une régularisation, pas un guichetier", async () => {
    const c = await installerAppareil(t, nom("c"), {
      role: "controleur",
      genre: "autre",
      rang: null,
    });
    const e = c.vente({ at: maintenant(), numeroPlage: 7, siege: 60 });
    e.type = "controle.regularise";
    const refus = await installerAppareil(t, nom("g"));
    const eg = refus.vente({ at: maintenant(), numeroPlage: 1411, siege: 61 });
    eg.type = "controle.regularise";
    expect((await envoyer(c, [e])).body.resultats[0].statut).toBe("accepte");
    expect((await envoyer(refus, [eg])).body.resultats[0]).toMatchObject({
      statut: "rejete",
      code: "role_non_autorise",
    });
  });

  it("lot illisible ou trop gros : 400 pour tout le lot", async () => {
    const g = await installerAppareil(t, nom("g"));
    const post = (corps: unknown) =>
      t
        .http()
        .post("/sync/evenements")
        .set("Authorization", `Bearer ${g.jeton}`)
        .send(corps as object);
    expect(
      (await post({ appareilId: g.id, envoyeA: "n'importe quoi", evenements: [] })).status,
    ).toBe(400);
    expect((await post({ appareilId: g.id, envoyeA: new Date().toISOString() })).status).toBe(400);
    const gros = await g.lot(
      Array.from({ length: 101 }, (_, i) =>
        g.vente({ at: maintenant(), numeroPlage: 1500 + (i % 400), siege: 100 + i }),
      ),
    );
    const rep = await post(gros);
    expect(rep.status).toBe(400);
    expect(rep.body.code).toBe("LOT_INVALIDE");
    expect(t.journal.lignes.some((l) => l.evenement.appareilId === g.id)).toBe(false);
    const cent = await g.lot(
      Array.from({ length: 100 }, (_, i) =>
        g.vente({ at: maintenant(), numeroPlage: 1500 + i, siege: 100 + i }),
      ),
    );
    expect((await post(cent)).body.resultats).toHaveLength(100);
  });
});

describe("numéros, trous et horloge", () => {
  it("un numéro hors plage ou en double est accepté (le billet est imprimé) mais signalé par nom", async () => {
    const g = await installerAppareil(t, nom("g"), { rang: 2 });
    const horsPlage = g.vente({ at: maintenant(), numeroPlage: 5, siege: 70 });
    const a = g.vente({ at: maintenant(), numeroPlage: 1600, siege: 71 });
    const doublon = g.vente({ at: maintenant(), numeroPlage: 1600, siege: 72 });
    const rep = await envoyer(g, [horsPlage, a, doublon]);
    expect(rep.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "accepte",
      "accepte",
      "accepte",
    ]);
    const hors = alertesDe(g.id, "numero_hors_plage");
    expect(hors).toHaveLength(1);
    expect(hors[0]).toMatchObject({
      auteurId: g.auteurId,
      evenementId: horsPlage.id,
      gareId: GARE,
      compagnieId: COMPAGNIE,
    });
    const double = alertesDe(g.id, "numero_en_double");
    expect(double).toHaveLength(1);
    expect(double[0]!.details).toMatchObject({ numeroPlage: 1600, evenementIdExistant: a.id });
  });

  it("deux jours différents peuvent reprendre le même numéro de plage sans alerte", async () => {
    const g = await installerAppareil(t, nom("g"));
    const aujourdhui = g.vente({ at: maintenant(), numeroPlage: 1701, siege: 80 });
    const demain = g.vente({ at: maintenant() + 24 * MS_PAR_HEURE, numeroPlage: 1701, siege: 81 });
    await envoyer(g, [aujourdhui, demain]);
    expect(alertesDe(g.id, "numero_en_double")).toEqual([]);
  });

  it("le billet et le colis ont chacun leur compteur", async () => {
    const g = await installerAppareil(t, nom("g"));
    const billet = g.vente({ at: maintenant(), numeroPlage: 1801, siege: 90 });
    const colis = g.autre(
      "colis.enregistre",
      maintenant(),
      { colisId: "c1" },
      { type: "colis", id: "c1" },
    );
    colis.numeroPlage = 1801;
    const rep = await envoyer(g, [billet, colis]);
    expect(rep.body.resultats[0].statut).toBe("accepte");
    // les données du colis sont libres côté serveur : seule l'enveloppe est contrôlée ici
    expect(alertesDe(g.id, "numero_en_double")).toEqual([]);
  });

  it("une file avec un trou de rangs est signalée, une file réinitialisée aussi", async () => {
    const g = await installerAppareil(t, nom("g"));
    const e1 = g.autre("caisse.ouverte", maintenant());
    await envoyer(g, [e1], { depuis: 3 });
    const trous = alertesDe(g.id, "file_avec_trou");
    expect(trous).toHaveLength(1);
    expect(trous[0]!.details).toEqual({ attendu: 1, recu: 3 });
    const e2 = g.autre("caisse.comptee", maintenant());
    await envoyer(g, [e2], { depuis: 1 });
    expect(alertesDe(g.id, "file_reinitialisee")).toHaveLength(1);
  });

  it("une horloge d'appareil en avance de plus de 5 minutes est signalée", async () => {
    const g = await installerAppareil(t, nom("g"));
    const futur = g.vente({ at: maintenant() + 30 * MS_PAR_MINUTE, numeroPlage: 1901, siege: 95 });
    await envoyer(g, [futur], { envoyeA: maintenant() + 30 * MS_PAR_MINUTE });
    expect(alertesDe(g.id, "horloge_en_avance").length).toBeGreaterThanOrEqual(1);
    const g2 = await installerAppareil(t, nom("g"));
    await envoyer(
      g2,
      [g2.vente({ at: maintenant() + 2 * MS_PAR_MINUTE, numeroPlage: 1902, siege: 96 })],
      {
        envoyeA: maintenant() + 2 * MS_PAR_MINUTE,
      },
    );
    expect(alertesDe(g2.id, "horloge_en_avance")).toEqual([]);
  });
});

describe("conflit de siège : le premier horodatage gagne", () => {
  async function deuxGuichets() {
    const g2 = await installerAppareil(t, nom("g2"), { rang: 2 });
    const g3 = await installerAppareil(t, nom("g3"), { rang: 3 });
    return { g2, g3 };
  }

  it("le plus tôt garde le siège, l'autre billet est « à replacer » et l'appareil l'apprend", async () => {
    const { g2, g3 } = await deuxGuichets();
    const depart = nom("depart");
    const tard = g2.vente({
      at: maintenant() - 10 * MS_PAR_MINUTE,
      numeroPlage: 1001,
      departId: depart,
      siege: 12,
      billetId: "b-tard",
    });
    const tot = g3.vente({
      at: maintenant() - 20 * MS_PAR_MINUTE,
      numeroPlage: 2001,
      departId: depart,
      siege: 12,
      billetId: "b-tot",
    });

    // g2 se synchronise d'abord : sa vente est la seule connue, elle tient le siège.
    const r2 = await envoyer(g2, [tard]);
    expect(r2.body.conflits).toEqual([]);
    // g3 arrive ensuite avec une vente plus ancienne : elle gagne, celle de g2 devient « à replacer ».
    const r3 = await envoyer(g3, [tot]);
    expect(r3.body.resultats[0].statut).toBe("accepte");
    expect(r3.body.conflits).toEqual([]);

    // g2 apprend le conflit à sa prochaine synchronisation (même avec un lot vide).
    const suite = await envoyer(g2, []);
    expect(suite.body.conflits).toEqual([
      expect.objectContaining({
        evenementId: tard.id,
        billetId: "b-tard",
        departId: depart,
        siege: 12,
        gagnantBilletId: "b-tot",
        motif: "siege_deja_pris",
      }),
    ]);
    // La vente perdante reste au journal (rien ne s'efface) et un événement serveur la marque.
    expect(t.journal.lignes.some((l) => l.evenement.id === tard.id)).toBe(true);
    const marques = t.journal.lignes.filter(
      (l) =>
        l.evenement.type === "billet.a_replacer" && l.evenement.donnees["billetId"] === "b-tard",
    );
    expect(marques).toHaveLength(1);
    expect(marques[0]).toMatchObject({ origine: "serveur", ordreAppareil: null });
    expect(marques[0]!.evenement).toMatchObject({ appareilId: null, auteurId: null });
    // Alerte nominative : qui doit replacer quel billet, et qui a gagné.
    const alertes = alertesDe(g2.id, "siege_en_conflit");
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatchObject({ auteurId: g2.auteurId, gareId: GARE });
    expect(alertes[0]!.details).toMatchObject({
      departId: depart,
      siege: 12,
      aReplacer: { billetId: "b-tard", auteurId: g2.auteurId, appareilId: g2.id },
      gagnant: { billetId: "b-tot", auteurId: g3.auteurId, appareilId: g3.id },
    });
    expect(t.auditRepo.lignes.some((l) => l.action === "sync.siege_en_conflit")).toBe(true);
  });

  it("même résultat quel que soit l'ordre de synchronisation", async () => {
    const { g2, g3 } = await deuxGuichets();
    const depart = nom("depart");
    const tard = g2.vente({
      at: maintenant() - 10 * MS_PAR_MINUTE,
      numeroPlage: 1011,
      departId: depart,
      siege: 13,
      billetId: "b2-tard",
    });
    const tot = g3.vente({
      at: maintenant() - 20 * MS_PAR_MINUTE,
      numeroPlage: 2011,
      departId: depart,
      siege: 13,
      billetId: "b3-tot",
    });
    const r3 = await envoyer(g3, [tot]);
    expect(r3.body.conflits).toEqual([]);
    const r2 = await envoyer(g2, [tard]);
    // g2 est la dernière à arriver mais elle a vendu plus tard : son billet est à replacer tout de suite.
    expect(r2.body.conflits).toEqual([
      expect.objectContaining({ billetId: "b2-tard", gagnantBilletId: "b3-tot" }),
    ]);
    expect((await envoyer(g3, [])).body.conflits).toEqual([]);
  });

  it("renvoyer le lot ne crée ni deuxième conflit, ni deuxième événement, ni deuxième alerte", async () => {
    const { g2, g3 } = await deuxGuichets();
    const depart = nom("depart");
    const a = g2.vente({
      at: maintenant() - 5 * MS_PAR_MINUTE,
      numeroPlage: 1021,
      departId: depart,
      siege: 14,
    });
    const b = g3.vente({
      at: maintenant() - 9 * MS_PAR_MINUTE,
      numeroPlage: 2021,
      departId: depart,
      siege: 14,
    });
    await envoyer(g2, [a]);
    await envoyer(g3, [b]);
    await envoyer(g2, [a]);
    await envoyer(g3, [b]);
    expect(alertesDe(g2.id, "siege_en_conflit")).toHaveLength(1);
    expect(
      t.journal.lignes.filter(
        (l) =>
          l.evenement.type === "billet.a_replacer" && l.evenement.donnees["evenementId"] === a.id,
      ),
    ).toHaveLength(1);
    expect(await t.sieges.conflitsDuSiege(depart, 14)).toHaveLength(1);
  });

  it("une libération datée d'avant la vente suivante lève le conflit ; deux sièges différents ne se gênent pas", async () => {
    const { g2, g3 } = await deuxGuichets();
    const depart = nom("depart");
    const premier = g3.vente({
      at: maintenant() - 30 * MS_PAR_MINUTE,
      numeroPlage: 2031,
      departId: depart,
      siege: 15,
      billetId: "b-1",
    });
    const second = g2.vente({
      at: maintenant() - 10 * MS_PAR_MINUTE,
      numeroPlage: 1031,
      departId: depart,
      siege: 15,
      billetId: "b-2",
    });
    const autreSiege = g2.vente({
      at: maintenant() - 9 * MS_PAR_MINUTE,
      numeroPlage: 1032,
      departId: depart,
      siege: 16,
      billetId: "b-3",
    });
    await envoyer(g3, [premier]);
    const r = await envoyer(g2, [second, autreSiege]);
    expect(r.body.conflits.map((c: { billetId: string }) => c.billetId)).toEqual(["b-2"]);

    // Le quai avait libéré le siège 15 entre les deux ventes (libération arrivée en retard).
    const libere = g3.autre(
      "quai.libere",
      maintenant() - 20 * MS_PAR_MINUTE,
      { billetId: "b-1", departId: depart, siege: 15 },
      { type: "billet", id: "b-1" },
    );
    await envoyer(g3, [libere], { depuis: 2 });
    expect((await envoyer(g2, [])).body.conflits).toEqual([]);
    expect(alertesDe(g3.id, "conflit_leve").length).toBeGreaterThanOrEqual(1);
  });

  it("une annulation décidée par un superviseur libère le siège du billet", async () => {
    const g2 = await installerAppareil(t, nom("g"), { rang: 2 });
    const g3 = await installerAppareil(t, nom("g"), { rang: 3 });
    const sup = await installerAppareil(t, nom("sup"), {
      role: "superviseur",
      genre: "autre",
      rang: null,
    });
    const depart = nom("depart");
    const vendu = g2.vente({
      at: maintenant() - 30 * MS_PAR_MINUTE,
      numeroPlage: 1041,
      departId: depart,
      siege: 17,
      billetId: "b-annule",
    });
    const revendu = g3.vente({
      at: maintenant() - 5 * MS_PAR_MINUTE,
      numeroPlage: 2041,
      departId: depart,
      siege: 17,
      billetId: "b-revendu",
    });
    await envoyer(g2, [vendu]);
    const annulation = sup.autre(
      "annulation.decidee",
      maintenant() - 15 * MS_PAR_MINUTE,
      { billetId: "b-annule", decision: "rembourser" },
      { type: "demande", id: "dem-1" },
    );
    await envoyer(sup, [annulation]);
    const r = await envoyer(g3, [revendu]);
    expect(r.body.conflits).toEqual([]);
    expect(await t.sieges.conflitsDuSiege(depart, 17)).toEqual([]);
    // un refus d'annulation ne libère rien
    const depart2 = nom("depart");
    const v2 = g2.vente({
      at: maintenant() - 30 * MS_PAR_MINUTE,
      numeroPlage: 1042,
      departId: depart2,
      siege: 18,
      billetId: "b-garde",
    });
    const r2 = g3.vente({
      at: maintenant() - 5 * MS_PAR_MINUTE,
      numeroPlage: 2042,
      departId: depart2,
      siege: 18,
      billetId: "b-trop-tard",
    });
    await envoyer(g2, [v2], { depuis: 2 });
    await envoyer(
      sup,
      [
        sup.autre(
          "annulation.decidee",
          maintenant() - 15 * MS_PAR_MINUTE,
          { billetId: "b-garde", decision: "refuser" },
          { type: "demande", id: "dem-2" },
        ),
      ],
      { depuis: 2 },
    );
    expect((await envoyer(g3, [r2], { depuis: 2 })).body.conflits).toEqual([
      expect.objectContaining({ billetId: "b-trop-tard", gagnantBilletId: "b-garde" }),
    ]);
  });

  it("une vente sans siège (debout, colis) ne crée aucun conflit", async () => {
    const g = await installerAppareil(t, nom("g"));
    const a = g.vente({ at: maintenant(), numeroPlage: 1051, siege: null });
    const b = g.vente({ at: maintenant(), numeroPlage: 1052, siege: null });
    const rep = await envoyer(g, [a, b]);
    expect(rep.body.conflits).toEqual([]);
    expect(rep.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "accepte",
      "accepte",
    ]);
  });
});

describe("déblocage par un superviseur", () => {
  async function debloquer(
    option: "synchroniser" | "debloquer_4h" | "telephone_secours",
    cible: AppareilTest,
    sup: AppareilTest,
    depuis = 1,
  ) {
    const e = sup.autre(
      "appareil.debloque",
      maintenant(),
      { appareilId: cible.id, option, validePar: { superviseurId: sup.auteurId } },
      { type: "appareil", id: cible.id },
    );
    return envoyer(sup, [e], { depuis });
  }

  it("l'appareil bloqué reçoit l'octroi à sa prochaine synchronisation", async () => {
    const g = await installerAppareil(t, nom("g"));
    const sup = await installerAppareil(t, nom("sup"), {
      role: "superviseur",
      genre: "autre",
      rang: null,
    });
    expect((await envoyer(g, [])).body.appareil.octroi).toBeNull();
    const rep = await debloquer("debloquer_4h", g, sup);
    expect(rep.body.resultats[0].statut).toBe("accepte");
    const octroi = (await envoyer(g, [])).body.appareil.octroi;
    expect(octroi).toEqual({
      option: "debloquer_4h",
      superviseurId: sup.auteurId,
      accordeA: versIsoDouala(maintenant()),
      debloqueJusqua: versIsoDouala(maintenant() + 4 * MS_PAR_HEURE),
    });
    expect(t.auditRepo.lignes.some((l) => l.action === "sync.deblocage_accorde")).toBe(true);
  });

  it("l'option « synchroniser » n'ouvre pas de fenêtre de 4 h ; le téléphone de secours retire l'ancien", async () => {
    const g = await installerAppareil(t, nom("g"));
    const h = await installerAppareil(t, nom("h"));
    const sup = await installerAppareil(t, nom("sup"), {
      role: "superviseur",
      genre: "autre",
      rang: null,
    });
    await debloquer("synchroniser", g, sup);
    expect((await envoyer(g, [])).body.appareil.octroi).toMatchObject({
      option: "synchroniser",
      debloqueJusqua: null,
    });
    await debloquer("telephone_secours", h, sup, 2);
    expect((await t.appareils.trouver(h.id))!.retire).toBe(true);
  });

  it("un octroi vieux de plus de 24 h n'est plus rendu", async () => {
    const g = await installerAppareil(t, nom("g"));
    const sup = await installerAppareil(t, nom("sup"), {
      role: "superviseur",
      genre: "autre",
      rang: null,
    });
    await debloquer("debloquer_4h", g, sup);
    t.horloge.avancer(25 * MS_PAR_HEURE);
    expect((await envoyer(g, [])).body.appareil.octroi).toBeNull();
  });

  it("un guichetier ne débloque personne ; un superviseur d'une autre gare non plus", async () => {
    const g = await installerAppareil(t, nom("g"));
    const voisin = await installerAppareil(t, nom("v"));
    const e = voisin.autre(
      "appareil.debloque",
      maintenant(),
      { appareilId: g.id, option: "debloquer_4h", validePar: { superviseurId: voisin.auteurId } },
      { type: "appareil", id: g.id },
    );
    await envoyer(voisin, [e]);
    expect((await envoyer(g, [])).body.appareil.octroi).toBeNull();

    const etranger = await installerAppareil(t, nom("sup"), {
      role: "superviseur",
      genre: "autre",
      rang: null,
      gareId: AUTRE_GARE,
    });
    await debloquer("debloquer_4h", g, etranger);
    expect((await envoyer(g, [])).body.appareil.octroi).toBeNull();
    expect(alertesDe(voisin.id, "deblocage_sur_place")).toHaveLength(1);
  });

  it("un déblocage fait sur place (PIN contrôlé sans réseau) est journalisé et signalé au superviseur", async () => {
    const g = await installerAppareil(t, nom("g"));
    const e = g.autre(
      "appareil.debloque",
      maintenant() - 2 * MS_PAR_HEURE,
      { appareilId: g.id, option: "debloquer_4h", validePar: { superviseurId: "sup-gare" } },
      { type: "appareil", id: g.id },
    );
    const rep = await envoyer(g, [e]);
    expect(rep.body.resultats[0].statut).toBe("accepte");
    expect(t.journal.lignes.some((l) => l.evenement.id === e.id)).toBe(true);
    const [alerte] = alertesDe(g.id, "deblocage_sur_place");
    expect(alerte).toMatchObject({ gravite: "info", auteurId: g.auteurId });
    expect(alerte!.details).toMatchObject({ superviseurId: "sup-gare", option: "debloquer_4h" });
  });
});

describe("alertes", () => {
  it("le superviseur voit les alertes de sa gare, le patron celles de sa compagnie, personne d'autre", async () => {
    const g = await installerAppareil(t, nom("g"));
    await envoyer(g, [{ ...g.vente({ at: maintenant(), numeroPlage: 5, siege: 200 }) }]);
    const alerteDeLaGare = alertesDe(g.id, "numero_hors_plage")[0]!;

    const sup = await t.compte("superviseur");
    const rep = await t.http().get("/sync/alertes").set("Authorization", `Bearer ${sup.jeton}`);
    expect(rep.status).toBe(200);
    expect((rep.body as { id: string }[]).map((a) => a.id)).toContain(alerteDeLaGare.id);

    const patron = await t.compte("patron", { gareId: null });
    const repP = await t.http().get("/sync/alertes").set("Authorization", `Bearer ${patron.jeton}`);
    expect((repP.body as { id: string }[]).map((a) => a.id)).toContain(alerteDeLaGare.id);

    const supAutre = await t.compte("superviseur", { gareId: AUTRE_GARE });
    const repA = await t
      .http()
      .get("/sync/alertes")
      .set("Authorization", `Bearer ${supAutre.jeton}`);
    expect((repA.body as { id: string }[]).map((a) => a.id)).not.toContain(alerteDeLaGare.id);

    const patronAutre = await t.compte("patron", { gareId: null, compagnieId: AUTRE_COMPAGNIE });
    const repPA = await t
      .http()
      .get("/sync/alertes")
      .set("Authorization", `Bearer ${patronAutre.jeton}`);
    expect((repPA.body as { id: string }[]).map((a) => a.id)).not.toContain(alerteDeLaGare.id);

    for (const role of ["guichetier", "comptable", "voyageur"] as Role[]) {
      const autre = await t.compte(role, { gareId: null });
      expect(
        (await t.http().get("/sync/alertes").set("Authorization", `Bearer ${autre.jeton}`)).status,
        role,
      ).toBe(403);
    }
  });

  it("un superviseur sans gare (ou un patron sans compagnie) ne voit rien, jamais « tout »", async () => {
    const g = await installerAppareil(t, nom("g"));
    await envoyer(g, [g.vente({ at: maintenant(), numeroPlage: 8, siege: 203 })]);
    expect(t.alertes.lignes.length).toBeGreaterThan(0);
    const supSansGare = await t.compte("superviseur", { gareId: null });
    const rep = await t
      .http()
      .get("/sync/alertes")
      .set("Authorization", `Bearer ${supSansGare.jeton}`);
    expect(rep.status).toBe(200);
    expect(rep.body).toEqual([]);
    const patronSansCompagnie = await t.compte("patron", { gareId: null, compagnieId: null });
    const repP = await t
      .http()
      .get("/sync/alertes")
      .set("Authorization", `Bearer ${patronSansCompagnie.jeton}`);
    expect(repP.body).toEqual([]);
  });

  it("les plus récentes d'abord", async () => {
    const g = await installerAppareil(t, nom("g"));
    await envoyer(g, [g.vente({ at: maintenant(), numeroPlage: 6, siege: 201 })]);
    t.horloge.avancer(MS_PAR_MINUTE);
    await envoyer(g, [g.vente({ at: maintenant(), numeroPlage: 7, siege: 202 })], { depuis: 2 });
    const sup = await t.compte("superviseur");
    const rep = await t.http().get("/sync/alertes").set("Authorization", `Bearer ${sup.jeton}`);
    const dates = (rep.body as { creeeA: string }[]).map((a) => a.creeeA);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("stockage", () => {
  it("en production, le module refuse de démarrer tant qu'un port est encore en mémoire", () => {
    const garde = (env: string) =>
      new VerificationStockageSync(
        { env } as unknown as AppConfig,
        t.appareils,
        t.journal,
        t.sieges,
        t.alertes,
        t.numeros,
      );
    expect(() => garde("test").onModuleInit()).not.toThrow();
    expect(() => garde("development").onModuleInit()).not.toThrow();
    expect(() => garde("production").onModuleInit()).toThrow(/mémoire/);
  });
});

void uuid;
