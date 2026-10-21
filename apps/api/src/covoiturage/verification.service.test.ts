import { beforeEach, describe, expect, it } from "vitest";
import { AFRIMOVE, JOUR, monterCovoiturage, type MontageCovoiturage } from "./testing/montage";

let m: MontageCovoiturage;
beforeEach(() => {
  m = monterCovoiturage();
});

const vehicule = {
  marque: "Toyota",
  modele: "Corolla",
  couleur: "grise",
  immatriculation: "lt-882  ce",
  places: 3,
};

const texte = (v: unknown): string =>
  JSON.stringify(v, (_c, x: unknown) => (typeof x === "bigint" ? x.toString() : x));

describe("un conducteur non vérifié ne peut pas publier", () => {
  it("sans dossier : 403 CONDUCTEUR_NON_VERIFIE, avec les quatre pièces à fournir", async () => {
    const c = m.voyageur("Samuel Ekambi");
    await expect(m.services.trajets.publier(c, m.publication())).rejects.toMatchObject({
      status: 403,
      response: {
        code: "CONDUCTEUR_NON_VERIFIE",
        details: {
          statut: "incomplet",
          aFournir: ["identite", "permis", "carte_grise", "voiture"],
        },
      },
    });
    expect(await m.ports.trajets.duConducteur(c.id)).toEqual([]);
  });

  it("pièces déposées mais pas encore vérifiées par AfriMove : toujours refusé", async () => {
    const c = m.voyageur("Samuel Ekambi");
    await m.services.verification.declarerVehicule(c.id, vehicule);
    for (const type of ["identite", "permis", "carte_grise", "voiture"] as const) {
      await m.services.verification.deposerPiece(c.id, type, {
        fichierId: `f-${type}`,
        numero: type === "voiture" ? undefined : "123456",
        expireLe: type === "permis" ? "2030-01-01" : undefined,
      });
    }
    await expect(m.services.trajets.publier(c, m.publication())).rejects.toMatchObject({
      response: { code: "CONDUCTEUR_NON_VERIFIE", details: { statut: "en_verification" } },
    });
  });

  it("trois pièces sur quatre validées : refusé ; la quatrième ouvre la publication", async () => {
    const c = m.voyageur("Samuel Ekambi");
    const v = m.services.verification;
    await v.declarerVehicule(c.id, vehicule);
    const depot = async (type: "identite" | "permis" | "carte_grise" | "voiture") => {
      await v.deposerPiece(c.id, type, {
        fichierId: `f-${type}`,
        numero: type === "voiture" ? undefined : "123456",
        expireLe: type === "permis" ? "2030-01-01" : undefined,
      });
      await v.decider(AFRIMOVE, c.id, type, "validee", undefined);
    };
    await depot("identite");
    await depot("permis");
    await depot("carte_grise");
    await expect(m.services.trajets.publier(c, m.publication())).rejects.toMatchObject({
      status: 403,
    });
    await depot("voiture");
    const publie = await m.services.trajets.publier(c, m.publication());
    expect(publie.id).toBeTruthy();
  });

  it("une pièce refusée bloque, tant qu'elle n'est pas redéposée puis validée", async () => {
    const c = await m.conducteur();
    const v = m.services.verification;
    // le conducteur redépose son permis : il repasse à vérifier, la publication se ferme
    await v.deposerPiece(c.id, "permis", {
      fichierId: "f-permis-2",
      numero: "NOUVEAU-1",
      expireLe: "2031-01-01",
    });
    await expect(m.services.trajets.publier(c, m.publication())).rejects.toMatchObject({
      status: 403,
    });
    await v.decider(AFRIMOVE, c.id, "permis", "refusee", "Photo illisible");
    await expect(m.services.trajets.publier(c, m.publication())).rejects.toMatchObject({
      response: { details: { statut: "refuse", aFournir: ["permis"] } },
    });
    await v.deposerPiece(c.id, "permis", {
      fichierId: "f-permis-3",
      numero: "NOUVEAU-1",
      expireLe: "2031-01-01",
    });
    await v.decider(AFRIMOVE, c.id, "permis", "validee", undefined);
    expect((await m.services.trajets.publier(c, m.publication())).id).toBeTruthy();
  });

  it("un permis périmé ferme la publication le lendemain de sa date de fin", async () => {
    const c = m.voyageur("Samuel Ekambi");
    await m.verifier(c);
    // permis valable jusqu'au 30 juin 2030 : on se place le 1er juillet 2030
    m.avancer(1_273 * JOUR);
    await expect(
      m.services.trajets.publier(c, m.publication({ departA: new Date(Date.now()).toISOString() })),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("dépôt des pièces", () => {
  it("le numéro de pièce est obligatoire (sauf pour la voiture), le permis a une date de fin", async () => {
    const c = m.voyageur("Samuel Ekambi");
    const v = m.services.verification;
    await expect(v.deposerPiece(c.id, "identite", { fichierId: "f" })).rejects.toMatchObject({
      response: { code: "NUMERO_REQUIS" },
    });
    await expect(
      v.deposerPiece(c.id, "permis", { fichierId: "f", numero: "123" }),
    ).rejects.toMatchObject({
      response: { code: "EXPIRATION_REQUISE" },
    });
    await expect(
      v.deposerPiece(c.id, "permis", { fichierId: "f", numero: "123", expireLe: "2026-12-31" }),
    ).rejects.toMatchObject({ response: { code: "PIECE_PERIMEE" } });
    await expect(v.deposerPiece(c.id, "voiture", { fichierId: "f" })).resolves.toBeTruthy();
  });

  it("le numéro de pièce est chiffré au repos et ne sort jamais du dossier ni du journal", async () => {
    const c = m.voyageur("Samuel Ekambi");
    await m.services.verification.deposerPiece(c.id, "identite", {
      fichierId: "f-id",
      numero: "123456789",
    });
    const dossier = await m.ports.dossiers.trouver(c.id);
    const stocke = dossier?.pieces.identite?.numeroChiffre ?? "";
    expect(stocke).toMatch(/^enc:v1:/);
    expect(stocke).not.toContain("123456789");
    expect(texte(dossier)).not.toContain("123456789");
    // le contexte de chiffrement lie le numéro à la pièce et au conducteur
    expect(() => m.chiffrement.dechiffrer(stocke, "covoiturage.piece:autre:identite")).toThrow();
    expect(m.chiffrement.dechiffrer(stocke, `covoiturage.piece:${c.id}:identite`)).toBe(
      "123456789",
    );
    const journal = texte(await m.audit.lister({ limite: 200 }));
    expect(journal).not.toContain("123456789");
    expect(journal).toContain("covoiturage.piece_deposee");
  });

  it("changer d'immatriculation oblige à redéposer la carte grise et la voiture, pas l'identité ni le permis", async () => {
    const c = await m.conducteur();
    expect(await m.services.verification.estVerifie(c.id)).toBe(true);
    await m.services.verification.declarerVehicule(c.id, {
      ...vehicule,
      immatriculation: "LT 100 AB",
    });
    expect(await m.services.verification.estVerifie(c.id)).toBe(false);
    const d = await m.ports.dossiers.trouver(c.id);
    expect(Object.keys(d?.pieces ?? {}).sort()).toEqual(["identite", "permis"]);
    // même véhicule déclaré à nouveau (autre couleur) : rien à redéposer
    const c2 = await m.conducteur("Marthe Nana");
    await m.services.verification.declarerVehicule(c2.id, {
      ...vehicule,
      immatriculation: "LT 882 CE",
      couleur: "blanche",
    });
    expect(await m.services.verification.estVerifie(c2.id)).toBe(true);
  });

  it("l'immatriculation est rangée en majuscules, sans espaces en trop", async () => {
    const c = m.voyageur("Samuel Ekambi");
    const d = await m.services.verification.declarerVehicule(c.id, vehicule);
    expect(d.vehicule?.immatriculation).toBe("LT 882 CE");
    await expect(
      m.services.verification.declarerVehicule(c.id, { ...vehicule, immatriculation: "!!@@" }),
    ).rejects.toMatchObject({ response: { code: "IMMATRICULATION_INVALIDE" } });
  });
});

describe("décision d'AfriMove", () => {
  it("un refus doit dire pourquoi, et part par SMS au conducteur", async () => {
    const c = m.voyageur("Samuel Ekambi");
    const v = m.services.verification;
    await v.deposerPiece(c.id, "carte_grise", { fichierId: "f", numero: "CG-1" });
    await expect(
      v.decider(AFRIMOVE, c.id, "carte_grise", "refusee", undefined),
    ).rejects.toMatchObject({
      response: { code: "MOTIF_REQUIS" },
    });
    await expect(v.decider(AFRIMOVE, c.id, "carte_grise", "refusee", "  ")).rejects.toMatchObject({
      response: { code: "MOTIF_REQUIS" },
    });
    await v.decider(AFRIMOVE, c.id, "carte_grise", "refusee", "Photo floue, https://x.example");
    expect(m.ports.notifieur.pour(c.id)).toEqual([
      "AfriMove : ta carte grise n'est pas acceptée (Photo floue,). Dépose-la de nouveau dans l'app.",
    ]);
  });

  it("une pièce ne se juge qu'une fois : il faut la redéposer", async () => {
    const c = m.voyageur("Samuel Ekambi");
    const v = m.services.verification;
    await v.deposerPiece(c.id, "identite", { fichierId: "f", numero: "1234" });
    await v.decider(AFRIMOVE, c.id, "identite", "validee", undefined);
    await expect(v.decider(AFRIMOVE, c.id, "identite", "refusee", "Erreur")).rejects.toMatchObject({
      status: 409,
      response: { code: "PIECE_DEJA_TRAITEE" },
    });
    await expect(v.decider(AFRIMOVE, c.id, "permis", "validee", undefined)).rejects.toMatchObject({
      status: 404,
      response: { code: "PIECE_INCONNUE" },
    });
  });

  it("le conducteur est prévenu une seule fois, quand son dossier devient vérifié", async () => {
    const c = await m.conducteur();
    expect(m.ports.notifieur.pour(c.id)).toEqual([
      "AfriMove : ton dossier conducteur est vérifié. Tu peux publier des trajets.",
    ]);
  });

  it("la décision est journalisée avec la personne qui l'a prise, sans le numéro", async () => {
    const c = m.voyageur("Samuel Ekambi");
    await m.services.verification.deposerPiece(c.id, "identite", {
      fichierId: "f",
      numero: "987654321",
    });
    await m.services.verification.decider(AFRIMOVE, c.id, "identite", "validee", undefined);
    const lignes = await m.audit.lister({ limite: 200 });
    const decision = lignes.find((l) => l.action === "covoiturage.piece_decidee");
    expect(decision).toMatchObject({ acteurId: AFRIMOVE.id, acteurRole: "afrimove" });
    expect(texte(lignes)).not.toContain("987654321");
  });

  it("la liste de travail d'AfriMove : les dossiers à vérifier, du plus ancien au plus récent", async () => {
    const a = m.voyageur("Alice Mbarga");
    const b = m.voyageur("Bruno Tchoua");
    await m.services.verification.deposerPiece(a.id, "voiture", { fichierId: "fa" });
    m.avancer(60_000);
    await m.services.verification.deposerPiece(b.id, "voiture", { fichierId: "fb" });
    const liste = await m.services.exploitation.dossiers();
    expect(liste.map((d) => d.nom)).toEqual(["Alice Mbarga", "Bruno Tchoua"]);
    expect(liste[0]?.fichiers).toEqual([{ type: "voiture", fichierId: "fa" }]);
    await m.services.verification.decider(AFRIMOVE, a.id, "voiture", "validee", undefined);
    expect((await m.services.exploitation.dossiers()).map((d) => d.nom)).toEqual(["Bruno Tchoua"]);
    expect((await m.services.exploitation.dossiers("incomplet")).map((d) => d.nom).sort()).toEqual([
      "Alice Mbarga",
      "Bruno Tchoua",
    ]);
  });
});

describe("numéro qui reçoit le paiement", () => {
  it("par défaut, le numéro du compte ; sinon celui que le conducteur a choisi, chiffré", async () => {
    const c = m.voyageur("Samuel Ekambi", "+237677001111");
    expect(await m.services.verification.numeroVersement(c.id)).toBe("+237677001111");
    await m.services.verification.definirNumeroVersement(c.id, "6 91 22 10 08");
    expect(await m.services.verification.numeroVersement(c.id)).toBe("+237691221008");
    const stocke = (await m.ports.dossiers.trouver(c.id))?.numeroVersementChiffre ?? "";
    expect(stocke).toMatch(/^enc:v1:/);
    expect(stocke).not.toContain("691221008");
  });

  it("refuse un numéro invalide ou étranger", async () => {
    const c = m.voyageur("Samuel Ekambi");
    await expect(m.services.verification.definirNumeroVersement(c.id, "abc")).rejects.toMatchObject(
      {
        response: { code: "TELEPHONE_INVALIDE" },
      },
    );
    await expect(
      m.services.verification.definirNumeroVersement(c.id, "+33612345678"),
    ).rejects.toMatchObject({
      response: { code: "TELEPHONE_NON_CAMEROUNAIS" },
    });
  });
});
