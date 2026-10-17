import { agence } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEPART,
  DEPART_2,
  DEPART_NUIT,
  GUICHET_1,
  avec,
  creerAppBilletterieTest,
  especes,
  evenement,
  type AppBilletterieTest,
} from "./testing/app-billetterie-test";

/**
 * Vente au guichet et embarquement au quai, de bout en bout : HTTP, gardes, événements idempotents,
 * signature des QR. Chaque réponse est relue avec le schéma zod de `@afrimove/contrats`.
 */

let t: AppBilletterieTest;
let jeton: string;
let agentId: string;
let numeroPlage = 0;
let code = 1000;

beforeAll(async () => {
  t = await creerAppBilletterieTest();
  const g = await t.guichetier();
  jeton = g.jeton;
  agentId = g.id;
});
afterAll(async () => t.fermer());

const prochainCode = (): string => String(++code);
const prochainePlage = (): number => ++numeroPlage;

/** Une vente au guichet : événement `billet.vendu` prêt à envoyer. */
function venteEvt(
  o: {
    siege?: number | null;
    departId?: string;
    prix?: number;
    bagage?: number;
    codeBillet?: string;
    nom?: string;
    telephone?: string | null;
    id?: string;
    billetId?: string;
    paiement?: {
      mode: "cash" | "momo" | "orange_money";
      recu: number;
      rendu: number;
      reference: string | null;
    };
    numeroPlage?: number;
  } = {},
) {
  const prix = o.prix ?? 4000;
  const bagage = o.bagage ?? 0;
  return evenement(
    agence.EVENEMENT_BILLET_VENDU,
    agentId,
    t.maintenant(),
    {
      billetId: o.billetId ?? crypto.randomUUID(),
      departId: o.departId ?? DEPART,
      siege: o.siege === undefined ? 1 : o.siege,
      classe: "classique",
      prix,
      bagage,
      passager: {
        nom: o.nom ?? "Aminatou Fotso",
        telephone: o.telephone === undefined ? "+237691221008" : o.telephone,
        pieceQuatreDerniers: "4821",
      },
      paiement: o.paiement ?? especes(prix + bagage),
      codeBillet: o.codeBillet ?? prochainCode(),
      sms: true,
    },
    { ...(o.id ? { id: o.id } : {}), numeroPlage: o.numeroPlage ?? prochainePlage() },
  );
}

const poster = (chemin: string, corps: unknown, j = jeton) =>
  t
    .http()
    .post(chemin)
    .set(avec(j))
    .send(corps as object);

/** Vend un billet et renvoie sa fiche imprimable. */
async function vendre(o: Parameters<typeof venteEvt>[0] = {}) {
  const r = await poster("/agence/billets", venteEvt(o));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return agence.SchemaResultatVente.parse(r.body);
}

const scanEvt = (qr: string, departId = DEPART) =>
  evenement(agence.EVENEMENT_QUAI_SCANNE, agentId, t.maintenant(), { departId, qr });
const codeEvt = (codeBillet: string, departId = DEPART) =>
  evenement(agence.EVENEMENT_QUAI_CODE_SAISI, agentId, t.maintenant(), { departId, codeBillet });

async function scanner(qr: string, departId = DEPART) {
  const r = await poster("/agence/quai/scans", scanEvt(qr, departId));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return agence.SchemaResultatScanQuai.parse(r.body);
}

describe("vente au guichet : GET /agence/vente/contexte", () => {
  it("propose le prochain numéro de la plage du guichet, le départ et le premier siège libre", async () => {
    const r = await t.http().get("/agence/vente/contexte").set(avec(jeton));
    expect(r.status).toBe(200);
    const c = agence.SchemaVenteContexte.parse(r.body);
    expect(c.guichet).toEqual({ id: GUICHET_1, rang: 1 });
    expect(c.prochainNumero.sequence).toBeGreaterThanOrEqual(1);
    expect(c.prochainNumero.sequence).toBeLessThanOrEqual(999);
    expect(c.prochainNumero.numero).toMatch(/^ALP-DLA-261102-\d{4}$/);
    expect(c.departChoisiId).toBe(DEPART);
    expect(c.tarifs).toEqual({ classique: 4000, vip: 6000, bagage: 500 });
    expect(c.siege.plan.cases).toHaveLength(40);
    expect(c.siege.plan.cases.filter((x) => x.etat === "attribue")).toHaveLength(1);
    // Le départ de nuit n'a pas de bus : il ne se vend pas.
    expect(c.departs.map((d) => d.departId)).not.toContain(DEPART_NUIT);
  });

  it("refuse un voyageur et une demande sans jeton", async () => {
    const voyageur = await t.compte("voyageur");
    expect((await t.http().get("/agence/vente/contexte").set(avec(voyageur.jeton))).status).toBe(
      403,
    );
    expect((await t.http().get("/agence/vente/contexte")).status).toBe(401);
  });
});

describe("billet.vendu : POST /agence/billets", () => {
  it("vend un billet nominatif : numéro de la plage, QR signé vérifiable, siège occupé", async () => {
    const siege = 2;
    const r = await vendre({ siege, nom: "Aminatou Fotso" });
    expect(r.accuse.statut).toBe("accepte");
    expect(r.billet.siege).toBe(siege);
    expect(r.billet.numero).toMatch(/^ALP-DLA-261102-\d{4}$/);
    expect(r.billet.passager.nom).toBe("Aminatou Fotso");
    expect(r.billet.prix).toBe(4000);
    // La signature se vérifie avec la seule clé publique, donc hors ligne.
    const contenu = await t.signataire.verifier(r.billet.qr);
    expect(contenu).toEqual({
      numero: r.billet.numero,
      code: r.billet.codeBillet,
      departId: DEPART,
    });
    // Le siège n'est plus à la vente.
    const plan = await t.inventaire.plan(DEPART);
    expect(plan.occupes[siege]).toBe(r.billet.billetId);
  });

  it("ne stocke jamais l'identité du voyageur en clair", async () => {
    const r = await vendre({ siege: 3, nom: "Zéphirin Tchoumi", telephone: "+237699887766" });
    const stocke = t.billets.lignes.get(r.billet.billetId);
    expect(stocke).toBeDefined();
    const ligne = JSON.stringify(stocke);
    expect(ligne).not.toContain("Zéphirin");
    expect(ligne).not.toContain("699887766");
    const memorise = JSON.stringify([...t.traites.lignes.values()]);
    expect(memorise).not.toContain("Zéphirin");
  });

  it("rejouer un événement ne refait rien : même billet, statut deja_recu", async () => {
    const evt = venteEvt({ siege: 4 });
    const avant = t.billets.lignes.size;
    const premiere = agence.SchemaResultatVente.parse((await poster("/agence/billets", evt)).body);
    const rejeu = agence.SchemaResultatVente.parse((await poster("/agence/billets", evt)).body);
    expect(premiere.accuse.statut).toBe("accepte");
    expect(rejeu.accuse.statut).toBe("deja_recu");
    expect(rejeu.billet).toEqual(premiere.billet);
    expect(t.billets.lignes.size).toBe(avant + 1);
  });

  it("un siège ne se vend pas deux fois : le second guichet reçoit 409 SIEGE_PRIS", async () => {
    await vendre({ siege: 5 });
    const avant = t.billets.lignes.size;
    const r = await poster("/agence/billets", venteEvt({ siege: 5 }));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("SIEGE_PRIS");
    expect(t.billets.lignes.size).toBe(avant);
  });

  it("10 ventes simultanées du même siège : une seule réussit", async () => {
    const reponses = await Promise.all(
      Array.from({ length: 10 }, () => poster("/agence/billets", venteEvt({ siege: 6 }))),
    );
    const statuts = reponses.map((r) => r.status).sort();
    expect(statuts.filter((s) => s === 200)).toHaveLength(1);
    expect(statuts.filter((s) => s === 409)).toHaveLength(9);
    const vendus = [...t.billets.lignes.values()].filter(
      (b) => b.departId === DEPART && b.siege === 6 && b.etat !== "annule",
    );
    expect(vendus).toHaveLength(1);
  });

  it("le même événement envoyé 5 fois en même temps ne crée qu'un billet", async () => {
    const evt = venteEvt({ siege: 7 });
    const avant = t.billets.lignes.size;
    const reponses = await Promise.all(
      Array.from({ length: 5 }, () => poster("/agence/billets", evt)),
    );
    expect(reponses.every((r) => r.status === 200)).toBe(true);
    const statuts = reponses.map((r) => r.body.accuse.statut as string).sort();
    expect(statuts).toEqual(["accepte", "deja_recu", "deja_recu", "deja_recu", "deja_recu"]);
    expect(t.billets.lignes.size).toBe(avant + 1);
  });

  it("refuse un paiement dont la monnaie rendue est fausse : 422 PAIEMENT_INVALIDE", async () => {
    const r = await poster(
      "/agence/billets",
      venteEvt({ siege: 8, paiement: { mode: "cash", recu: 5000, rendu: 500, reference: null } }),
    );
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("PAIEMENT_INVALIDE");
    // Le siège n'a pas été pris par une vente refusée.
    expect((await t.inventaire.plan(DEPART)).occupes[8]).toBeUndefined();
  });

  it("accepte un paiement mobile du montant exact, avec « reçu » à 0 (contrat, écran de vente) ou égal au prix (recette AM-181)", async () => {
    const zero = await poster(
      "/agence/billets",
      venteEvt({ siege: 19, paiement: { mode: "momo", recu: 0, rendu: 0, reference: null } }),
    );
    expect(zero.status).toBe(200);
    expect(zero.body.accuse.statut).toBe("accepte");
    const egal = await poster(
      "/agence/billets",
      venteEvt({
        siege: 39,
        paiement: { mode: "orange_money", recu: 4000, rendu: 0, reference: "OM-1" },
      }),
    );
    expect(egal.status).toBe(200);
  });

  it("refuse un paiement mobile d'un autre montant ou avec de la monnaie rendue : 422 PAIEMENT_INVALIDE", async () => {
    for (const [siege, paiement] of [
      [22, { mode: "momo" as const, recu: 3000, rendu: 0, reference: null }],
      [37, { mode: "momo" as const, recu: 5000, rendu: 1000, reference: null }],
      [38, { mode: "orange_money" as const, recu: 0, rendu: 500, reference: "OM-2" }],
    ] as const) {
      const r = await poster("/agence/billets", venteEvt({ siege, paiement }));
      expect(r.status, `siège ${siege}`).toBe(422);
      expect(r.body.code).toBe("PAIEMENT_INVALIDE");
      expect((await t.inventaire.plan(DEPART)).occupes[siege]).toBeUndefined();
    }
  });

  it("refuse un prix qui n'est pas le tarif de la ligne", async () => {
    const r = await poster("/agence/billets", venteEvt({ siege: 9, prix: 3000 }));
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("PRIX_INCOHERENT");
  });

  it("encaisse le supplément bagage avec le billet", async () => {
    const r = await vendre({ siege: 10, bagage: 500 });
    expect(r.billet.prix).toBe(4500);
  });

  it("refuse un numéro hors de la plage du guichet", async () => {
    const r = await poster("/agence/billets", venteEvt({ siege: 11, numeroPlage: 1500 }));
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("NUMERO_HORS_PLAGE");
  });

  it("refuse deux billets au même numéro (plage rejouée par erreur)", async () => {
    const premier = await vendre({ siege: 12 });
    const r = await poster(
      "/agence/billets",
      venteEvt({ siege: 13, numeroPlage: premier.billet.sequence }),
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NUMERO_EN_DOUBLE");
    expect((await t.inventaire.plan(DEPART)).occupes[13]).toBeUndefined();
  });

  it("refuse deux billets au même code dans un départ", async () => {
    const premier = await vendre({ siege: 14 });
    const r = await poster(
      "/agence/billets",
      venteEvt({ siege: 15, codeBillet: premier.billet.codeBillet }),
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("CODE_BILLET_PRIS");
    expect((await t.inventaire.plan(DEPART)).occupes[15]).toBeUndefined();
  });

  it("refuse un départ sans bus, un départ inconnu et un départ d'une autre compagnie", async () => {
    const nuit = await poster("/agence/billets", venteEvt({ departId: DEPART_NUIT, siege: 1 }));
    expect(nuit.status).toBe(409);
    const inconnu = await poster("/agence/billets", venteEvt({ departId: "nulle-part", siege: 1 }));
    expect(inconnu.status).toBe(404);
    const autre = await t.guichetier(GUICHET_1);
    const autreCompagnie = await t.compte("guichetier", {
      compagnieId: "00000000-0000-4000-8000-0000000000c2",
      gareId: "00000000-0000-4000-8000-0000000000b1",
    });
    const evt = evenement(agence.EVENEMENT_BILLET_VENDU, autreCompagnie.id, t.maintenant(), {
      billetId: crypto.randomUUID(),
      departId: DEPART,
      siege: 20,
      classe: "classique",
      prix: 4000,
      bagage: 0,
      passager: { nom: "X Y", telephone: null, pieceQuatreDerniers: null },
      paiement: especes(4000),
      codeBillet: prochainCode(),
      sms: false,
    });
    expect((await poster("/agence/billets", evt, autreCompagnie.jeton)).status).toBe(404);
    expect(autre.id).not.toBe(agentId);
  });

  it("refuse un siège hors du bus", async () => {
    const r = await poster("/agence/billets", venteEvt({ siege: 41 }));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("SIEGE_INCONNU");
    expect((await poster("/agence/billets", venteEvt({ siege: 40 }))).status).toBe(200);
  });

  it("refuse un événement signé par un autre compte que le compte connecté", async () => {
    const evt = { ...venteEvt({ siege: 16 }), auteurId: "quelqu-un-d-autre" };
    const r = await poster("/agence/billets", evt);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("AUTEUR_INCOHERENT");
  });

  it("refuse un corps qui n'est pas un événement valide : 400", async () => {
    const mauvais = { ...venteEvt({ siege: 17 }), numeroPlage: null };
    const r = await poster("/agence/billets", mauvais);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("REQUETE_INVALIDE");
    expect((await poster("/agence/billets", { type: "billet.vendu" })).status).toBe(400);
  });

  it("n'est ouvert qu'aux rôles qui vendent", async () => {
    const evt = venteEvt({ siege: 18 });
    for (const role of ["voyageur", "superviseur", "patron", "chauffeur", "afrimove"] as const) {
      const c = await t.compte(role);
      expect((await poster("/agence/billets", evt, c.jeton)).status, role).toBe(403);
    }
    expect((await t.http().post("/agence/billets").send(evt)).status).toBe(401);
  });

  it("un billet vendu sans siège ne bloque aucun siège", async () => {
    const r = await vendre({ siege: null });
    expect(r.billet.siege).toBeNull();
  });
});

describe("billet.vendu_cadence et billet.complete", () => {
  function cadenceEvt(siege: number, o: { id?: string; telephone?: string | null } = {}) {
    return evenement(
      agence.EVENEMENT_BILLET_VENDU_CADENCE,
      agentId,
      t.maintenant(),
      {
        billetId: crypto.randomUUID(),
        departId: DEPART,
        siege,
        prix: 4000,
        paiement: especes(4000),
        codeBillet: prochainCode(),
        telephone: o.telephone === undefined ? null : o.telephone,
      },
      { ...(o.id ? { id: o.id } : {}), numeroPlage: prochainePlage() },
    );
  }

  it("vend sans nom ; au quai le billet est complété puis embarque", async () => {
    const r = await poster("/agence/cadence/billets", cadenceEvt(21));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vente = agence.SchemaResultatCadence.parse(r.body);
    expect(vente.billet.aCompleterAuQuai).toBe(true);
    expect(vente.billet.passager.nom).toBeNull();
    expect(vente.placesRestantes).toBeGreaterThanOrEqual(0);

    // Scanné avant d'être complété : le quai demande le nom.
    const sansNom = await scanner(vente.billet.qr);
    expect(sansNom.scan.resultat).toBe("sans_nom");
    expect(t.billets.lignes.get(vente.billet.billetId)?.etat).toBe("paye");

    const completer = evenement(agence.EVENEMENT_BILLET_COMPLETE, agentId, t.maintenant(), {
      billetId: vente.billet.billetId,
      departId: DEPART,
      nom: "Brice Nkoulou",
      pieceQuatreDerniers: "7710",
      telephone: "+237677112233",
      embarquer: true,
    });
    const c = await poster("/agence/quai/completions", completer);
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const completion = agence.SchemaResultatCompletion.parse(c.body);
    expect(completion.billet.nom).toBe("Brice Nkoulou");
    expect(completion.billet.embarque).toBe(true);
    // Le numéro ne change pas quand le billet est complété.
    expect(completion.billet.numero).toBe(vente.billet.numero);
    expect(t.billets.lignes.get(vente.billet.billetId)?.etat).toBe("embarque");

    // Complété : un second scan est un double scan.
    const encore = await scanner(vente.billet.qr);
    expect(encore.scan.resultat).toBe("deja_scanne");
  });

  it("refuse de compléter deux fois le même billet", async () => {
    const r = agence.SchemaResultatCadence.parse(
      (await poster("/agence/cadence/billets", cadenceEvt(22))).body,
    );
    const donnees = {
      billetId: r.billet.billetId,
      departId: DEPART,
      nom: "Carine Eyenga",
      pieceQuatreDerniers: "1234",
      telephone: null,
      embarquer: false,
    };
    const un = await poster(
      "/agence/quai/completions",
      evenement(agence.EVENEMENT_BILLET_COMPLETE, agentId, t.maintenant(), donnees),
    );
    expect(un.status).toBe(200);
    const deux = await poster(
      "/agence/quai/completions",
      evenement(agence.EVENEMENT_BILLET_COMPLETE, agentId, t.maintenant(), donnees),
    );
    expect(deux.status).toBe(409);
    expect(deux.body.code).toBe("DEJA_COMPLETE");
  });

  it("billet.telephone_ajoute enregistre le numéro d'un billet déjà vendu", async () => {
    const vente = await vendre({ siege: 23, telephone: null });
    const evt = evenement(agence.EVENEMENT_BILLET_TELEPHONE_AJOUTE, agentId, t.maintenant(), {
      billetId: vente.billet.billetId,
      telephone: "+237655443322",
    });
    const r = await poster("/agence/billets/telephone", evt);
    expect(r.status).toBe(200);
    agence.SchemaResultatSimple.parse(r.body);
    const stocke = t.billets.lignes.get(vente.billet.billetId);
    expect(stocke?.passagerTelephoneIndex).not.toBeNull();
    expect(JSON.stringify(stocke)).not.toContain("655443322");
  });
});

describe("quai : scan du QR et du code", () => {
  it("un billet payé monte ; le second scan est refusé (deja_scanne) avec l'heure du premier", async () => {
    const vente = await vendre({ siege: 24 });
    const premier = await scanner(vente.billet.qr);
    expect(premier.scan.resultat).toBe("monte");
    expect(premier.scan.billetId).toBe(vente.billet.billetId);
    expect(premier.scan.voyageur).toBe("Aminatou Fotso");
    expect(premier.scan.siege).toBe(24);
    expect(premier.scan.pieceQuatreDerniers).toBe("4821");
    expect(t.billets.lignes.get(vente.billet.billetId)?.etat).toBe("embarque");

    t.horloge.avancer(60_000);
    const second = await scanner(vente.billet.qr);
    expect(second.scan.resultat).toBe("deja_scanne");
    expect(second.accuse.statut).toBe("accepte");
    expect(t.billets.lignes.get(vente.billet.billetId)?.etat).toBe("embarque");
  });

  it("deux appareils qui scannent le même billet en même temps : un seul embarquement", async () => {
    const vente = await vendre({ siege: 25 });
    // On ralentit la lecture du billet pour que les six scans lisent tous « payé » avant que l'un
    // d'eux écrive : seule la comparaison atomique d'état à l'écriture départage alors les appareils.
    const lire = t.billets.parNumero.bind(t.billets);
    t.billets.parNumero = async (n) => {
      const b = await lire(n);
      await new Promise((r) => setTimeout(r, 15));
      return b;
    };
    const reponses = await Promise.all(
      Array.from({ length: 6 }, () => poster("/agence/quai/scans", scanEvt(vente.billet.qr))),
    );
    t.billets.parNumero = lire;
    const resultats = reponses.map(
      (r) => agence.SchemaResultatScanQuai.parse(r.body).scan.resultat,
    );
    expect(resultats.filter((x) => x === "monte")).toHaveLength(1);
    expect(resultats.filter((x) => x === "deja_scanne")).toHaveLength(5);
    const embarques = [...t.avis.de("billet.embarque")].filter(
      (a) => a.billetId === vente.billet.billetId,
    );
    expect(embarques).toHaveLength(1);
  });

  it("un scan rejoué (même événement) ne devient pas un double scan", async () => {
    const vente = await vendre({ siege: 26 });
    const evt = scanEvt(vente.billet.qr);
    const un = agence.SchemaResultatScanQuai.parse((await poster("/agence/quai/scans", evt)).body);
    const deux = agence.SchemaResultatScanQuai.parse(
      (await poster("/agence/quai/scans", evt)).body,
    );
    expect(un.scan.resultat).toBe("monte");
    expect(deux.scan.resultat).toBe("monte");
    expect(deux.accuse.statut).toBe("deja_recu");
  });

  it("un QR forgé ou modifié est refusé : introuvable", async () => {
    const vente = await vendre({ siege: 27 });
    const qr = vente.billet.qr;
    const parties = qr.split(":");
    const signature = parties[4] as string;
    const altere = (champ: number, valeur: string) => {
      const p = [...parties];
      p[champ] = valeur;
      return p.join(":");
    };
    const autreCode = String((Number(vente.billet.codeBillet) % 9000) + 1000 + 1).slice(0, 4);
    const forges = [
      // un caractère de la signature change
      qr.slice(0, -2) + (qr.endsWith("AA") ? "BB" : "AA"),
      // le code du billet est modifié
      altere(2, autreCode === parties[2] ? "0000" : autreCode),
      // le numéro est modifié (celui d'un autre billet)
      altere(1, "ALP-DLA-261102-0999"),
      // le départ est modifié
      altere(3, DEPART_2),
      // pas de signature
      parties.slice(0, 4).join(":"),
      // signature d'un autre billet recollée
      altere(4, signature.split("").reverse().join("")),
      "n'importe quoi",
      "AM1:ALP-DLA-261102-0001:1234:x:" + "A".repeat(86),
    ];
    for (const faux of forges) {
      const r = await scanner(faux);
      expect(r.scan.resultat, faux).toBe("introuvable");
    }
    // Le vrai billet n'a pas bougé et monte encore.
    expect(t.billets.lignes.get(vente.billet.billetId)?.etat).toBe("paye");
    expect((await scanner(qr)).scan.resultat).toBe("monte");
  });

  it("un QR signé par une autre clé est refusé", async () => {
    const { genererPaireQr, signerQr } = await import("./qr");
    const pirate = await genererPaireQr();
    const vente = await vendre({ siege: 28 });
    const faux = await signerQr(pirate.privee, {
      numero: vente.billet.numero,
      code: vente.billet.codeBillet,
      departId: DEPART,
    });
    expect((await scanner(faux)).scan.resultat).toBe("introuvable");
    expect(t.billets.lignes.get(vente.billet.billetId)?.etat).toBe("paye");
  });

  it("un billet d'un autre départ est refusé : autre_depart", async () => {
    const vente = await vendre({ siege: 29 });
    const r = await scanner(vente.billet.qr, DEPART_2);
    expect(r.scan.resultat).toBe("autre_depart");
    expect(t.billets.lignes.get(vente.billet.billetId)?.etat).toBe("paye");
  });

  it("le code à 4 chiffres fait monter le voyageur, et un mauvais code est introuvable", async () => {
    const vente = await vendre({ siege: 30 });
    const mauvais = agence.SchemaResultatScanQuai.parse(
      (await poster("/agence/quai/codes", codeEvt("0000"))).body,
    );
    expect(mauvais.scan.resultat).toBe("introuvable");
    const bon = agence.SchemaResultatScanQuai.parse(
      (await poster("/agence/quai/codes", codeEvt(vente.billet.codeBillet))).body,
    );
    expect(bon.scan.resultat).toBe("monte");
    const encore = agence.SchemaResultatScanQuai.parse(
      (await poster("/agence/quai/codes", codeEvt(vente.billet.codeBillet))).body,
    );
    expect(encore.scan.resultat).toBe("deja_scanne");
  });

  it("un billet annulé est refusé au quai", async () => {
    const vente = await vendre({ siege: 31 });
    await t.services.billets.annuler((await t.billets.trouver(vente.billet.billetId))!, {
      dc: (await t.catalogue.depart(DEPART))!,
      par: agentId,
      validePar: agentId,
      raison: "agence",
    });
    expect((await scanner(vente.billet.qr)).scan.resultat).toBe("annule");
  });

  it("le premier voyageur qui monte ouvre l'embarquement du départ", async () => {
    const vente = await vendre({ siege: 32 });
    await scanner(vente.billet.qr);
    expect((await t.catalogue.depart(DEPART))?.depart.etat).toBe("embarquement");
  });

  it("refuse un scan sur un départ d'une autre compagnie", async () => {
    const autre = await t.compte("guichetier", {
      compagnieId: "00000000-0000-4000-8000-0000000000c2",
      gareId: "00000000-0000-4000-8000-0000000000b1",
    });
    const evt = evenement(agence.EVENEMENT_QUAI_SCANNE, autre.id, t.maintenant(), {
      departId: DEPART,
      qr: "x",
    });
    expect((await poster("/agence/quai/scans", evt, autre.jeton)).status).toBe(404);
  });

  it("refuse un voyageur, et un rôle sans quai, au quai", async () => {
    const evt = scanEvt("x");
    for (const role of ["voyageur", "chauffeur", "convoyeur"] as const) {
      const c = await t.compte(role);
      expect((await poster("/agence/quai/scans", evt, c.jeton)).status, role).toBe(403);
    }
  });
});

describe("quai : absents, libération du siège, liste du chauffeur", () => {
  it("libère le siège d'un absent : il revient à la vente et le billet devient non présenté", async () => {
    const vente = await vendre({ siege: 33 });
    const evt = evenement(agence.EVENEMENT_QUAI_LIBERE, agentId, t.maintenant(), {
      departId: DEPART,
      billetId: vente.billet.billetId,
      siege: 33,
      motif: "absent",
    });
    const r = await poster("/agence/quai/liberations", evt);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    agence.SchemaResultatLiberation.parse(r.body);
    expect((await t.inventaire.plan(DEPART)).occupes[33]).toBeUndefined();
    const billet = t.billets.lignes.get(vente.billet.billetId);
    expect(billet?.etat).toBe("non_presente");
    // Le billet garde son numéro.
    expect(billet?.numero).toBe(vente.billet.numero);
    // Le siège peut être revendu.
    await vendre({ siege: 33 });
    // Et le billet libéré n'embarque plus.
    expect((await scanner(vente.billet.qr)).scan.resultat).toBe("annule");
  });

  it("refuse de libérer le siège d'un voyageur déjà monté", async () => {
    const vente = await vendre({ siege: 34 });
    await scanner(vente.billet.qr);
    const evt = evenement(agence.EVENEMENT_QUAI_LIBERE, agentId, t.maintenant(), {
      departId: DEPART,
      billetId: vente.billet.billetId,
      siege: 34,
      motif: "absent",
    });
    const r = await poster("/agence/quai/liberations", evt);
    expect(r.status).toBe(409);
    expect((await t.inventaire.plan(DEPART)).occupes[34]).toBe(vente.billet.billetId);
  });

  it("refuse un siège qui n'est pas celui du billet", async () => {
    const vente = await vendre({ siege: 35 });
    const evt = evenement(agence.EVENEMENT_QUAI_LIBERE, agentId, t.maintenant(), {
      departId: DEPART,
      billetId: vente.billet.billetId,
      siege: 36,
      motif: "retard",
    });
    expect((await poster("/agence/quai/liberations", evt)).status).toBe(422);
  });

  it("GET /agence/quai/embarquement : compte les embarqués, la soute et les absents", async () => {
    t.colis.definir(DEPART, { charges: 3, colisACharger: 2 });
    const r = await t
      .http()
      .get("/agence/quai/embarquement")
      .query({ departId: DEPART })
      .set(avec(jeton));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const q = agence.SchemaQuaiEmbarquement.parse(r.body);
    expect(q.quai).toBe(3);
    expect(q.depart.departId).toBe(DEPART);
    const montes = [...t.billets.lignes.values()].filter(
      (b) => b.departId === DEPART && (b.etat === "embarque" || b.etat === "voyage"),
    ).length;
    expect(q.embarquement.embarques).toBe(montes);
    expect(q.embarquement.capacite).toBe(40);
    expect(q.soute).toEqual({ charges: 3, capacite: 20, colisACharger: 2 });
    expect(q.equipage.chauffeur.nom).toBe("Paul Mbarga");
    expect(q.refuses.nombre).toBeGreaterThan(0);
    // L'embarquement est ouvert : les voyageurs payés qui ne sont pas montés sont des absents.
    expect(q.absents.length).toBeGreaterThan(0);
    for (const a of q.absents) {
      expect(["code_billet", "liberer"]).toContain(a.actionSuggeree);
    }
  });

  it("GET /agence/quai/embarquement : 409 tant que l'équipage n'est pas affecté", async () => {
    const dc = (await t.catalogue.depart(DEPART_2))!;
    await t.catalogue.changerDepart(DEPART_2, dc.depart.etat, { chauffeur: null });
    const r = await t
      .http()
      .get("/agence/quai/embarquement")
      .query({ departId: DEPART_2 })
      .set(avec(jeton));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EQUIPAGE_INCOMPLET");
    expect(r.body.details.manque).toEqual(["chauffeur"]);
    await t.catalogue.changerDepart(DEPART_2, dc.depart.etat, { chauffeur: dc.depart.chauffeur });
  });

  it("quai.liste_envoyee : le bus part ; ceux qui ne sont pas montés sont non présentés", async () => {
    // Départ propre à ce test : un départ de plus sur la ligne.
    const id = "00000000-0000-4000-8000-00000000d0aa";
    const { departType, heure } = await import("./testing/app-billetterie-test");
    t.catalogue.ajouterDepart(departType(id, { heureDepart: heure("15:30"), quai: 6 }));
    const monte = await vendre({ departId: id, siege: 1 });
    const absent = await vendre({ departId: id, siege: 2 });
    expect((await scanner(monte.billet.qr, id)).scan.resultat).toBe("monte");

    const evt = evenement(agence.EVENEMENT_QUAI_LISTE_ENVOYEE, agentId, t.maintenant(), {
      departId: id,
      embarques: 1,
      capacite: 40,
    });
    const r = await poster("/agence/quai/listes", evt);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const liste = agence.SchemaResultatListeChauffeur.parse(r.body);
    expect(liste.accuse.statut).toBe("accepte");
    expect((await t.catalogue.depart(id))?.depart.etat).toBe("parti");
    expect(t.billets.lignes.get(absent.billet.billetId)?.etat).toBe("non_presente");
    expect(t.billets.lignes.get(monte.billet.billetId)?.etat).toBe("embarque");
    // Le siège de l'absent est libre.
    expect((await t.inventaire.plan(id)).occupes[2]).toBeUndefined();
    // Un départ parti n'accepte plus de scan ni de vente.
    const tardif = await poster("/agence/quai/scans", scanEvt(absent.billet.qr, id));
    expect(tardif.status).toBe(409);
    expect(tardif.body.code).toBe("DEPART_FERME");
    const vente = await poster("/agence/billets", venteEvt({ departId: id, siege: 3 }));
    expect(vente.status).toBe(409);
  });

  it("quai.liste_envoyee : refusé sans chauffeur (EQUIPAGE_INCOMPLET)", async () => {
    const id = "00000000-0000-4000-8000-00000000d0ab";
    const { departType, heure } = await import("./testing/app-billetterie-test");
    t.catalogue.ajouterDepart(departType(id, { heureDepart: heure("15:45"), chauffeur: null }));
    const evt = evenement(agence.EVENEMENT_QUAI_LISTE_ENVOYEE, agentId, t.maintenant(), {
      departId: id,
      embarques: 0,
      capacite: 40,
    });
    const r = await poster("/agence/quai/listes", evt);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EQUIPAGE_INCOMPLET");
    expect((await t.catalogue.depart(id))?.depart.etat).toBe("en_vente");
  });
});
