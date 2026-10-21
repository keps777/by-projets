import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelephoneInvalide } from "../socle/comptes/telephone";
import { AnnulationImpossible, FileIndisponible, QuotaSmsDepasse } from "./erreurs";
import { ErreurNonRelancable } from "./file";
import { VariablesInvalides } from "./gabarits";
import { monterSms, VARIABLES_BILLET, type MontageSms } from "./testing/montage";

const TEL = "+237655012345";
const PIN = { pin: "482915", lien: "https://afrimove.app/app" };

const billet = (m: MontageSms, surcharge: Record<string, unknown> = {}, tel = TEL) =>
  m.passerelle.envoyer({
    type: "billet",
    variables: { ...VARIABLES_BILLET, ...surcharge },
    destinataire: tel,
    compagnieId: "c1",
    demandeurId: "u1",
  });

afterEach(() => vi.restoreAllMocks());

describe("envoi nominal", () => {
  it("met en file puis envoie : statut, morceaux, coût de 12 F, fournisseur, essai journalisé", async () => {
    const m = monterSms();
    const { message, nouveau } = await billet(m);
    expect(nouveau).toBe(true);
    expect(message).toMatchObject({
      type: "billet",
      statut: "en_file",
      expediteur: "AfriMove",
      encodage: "gsm7",
      segments: 1,
      coutFcfa: 0,
      coutEstimeFcfa: 12,
      destinataireMasque: "+237 ••••• 345",
    });
    expect(m.principal.envoyes).toHaveLength(0); // rien ne part avant la file

    await m.vider();
    const envoye = await m.journal.trouver(message.id);
    expect(envoye).toMatchObject({
      statut: "envoye",
      fournisseur: "principal",
      coutFcfa: 12,
      tentatives: 1,
      derniereErreur: null,
    });
    expect(envoye?.idFournisseur).toBe(m.principal.envoyes[0]?.idFournisseur);
    expect(m.principal.envoyes[0]).toMatchObject({
      reference: message.id,
      expediteur: "AfriMove",
      destinataire: TEL,
    });
    expect(m.principal.envoyes[0]?.texte).toContain("Code 7341");
    expect(await m.journal.essais(message.id)).toMatchObject([
      { numero: 1, fournisseur: "principal", resultat: "accepte", code: null },
    ]);
  });

  it("accepte un numéro camerounais à 9 chiffres et le range en +237", async () => {
    const m = monterSms();
    await billet(m, {}, "655 01 23 45");
    await m.vider();
    expect(m.principal.envoyes[0]?.destinataire).toBe("+237655012345");
  });

  it("le délai d'envoi mesure la demande jusqu'à l'acceptation, la médiane tient sous 5 s", async () => {
    const m = monterSms({ latenceMs: 800 });
    // Un message à la fois : le fournisseur simulé fait avancer l'horloge commune, des appels
    // simultanés s'additionneraient à tort.
    for (let i = 0; i < 20; i++) {
      await billet(m, {}, `+2376550000${String(i).padStart(2, "0")}`);
      await m.vider();
    }
    const messages = await m.journal.lister({});
    expect(messages.every((x) => x.statut === "envoye")).toBe(true);
    const rapport = await m.statistiques.couts();
    expect(rapport.total.delaiMedianMs).toBeLessThan(5000);
    expect(rapport.objectifAtteint).toBe(true);
    expect(Math.min(...messages.map((x) => x.delaiEnvoiMs ?? 0))).toBe(800);
  });

  it("les caractères hors GSM perdent leur accent : un seul morceau facturé", async () => {
    const m = monterSms();
    const { message } = await billet(m, { compagnie: "Bêta Express" });
    expect(message.segments).toBe(1);
    await m.vider();
    expect(m.principal.envoyes[0]?.texte.startsWith("Beta Express : billet")).toBe(true);
  });

  it("un message long coûte un morceau de plus", async () => {
    const m = monterSms();
    const { message } = await billet(m, {
      compagnie: "C".repeat(30),
      origine: "O".repeat(24),
      destination: "D".repeat(24),
      lien: `https://afrimove.app/${"x".repeat(50)}`,
    });
    expect(message.segments).toBe(2);
    expect(message.coutEstimeFcfa).toBe(24);
    await m.vider();
    expect((await m.journal.trouver(message.id))?.coutFcfa).toBe(24);
  });

  it("le prix du morceau vient de la configuration", async () => {
    const m = monterSms({ env: { SMS_COUT_SEGMENT_FCFA: "15" } });
    const { message } = await billet(m);
    expect(message.coutEstimeFcfa).toBe(15);
  });
});

describe("idempotence et limites", () => {
  it("la même clé ne crée qu'un message et n'envoie qu'un SMS", async () => {
    const m = monterSms();
    const demande = {
      type: "pin_provisoire" as const,
      variables: PIN,
      destinataire: TEL,
      cle: "pin:u9:2027-01-05",
    };
    const a = await m.passerelle.envoyer(demande);
    const b = await m.passerelle.envoyer(demande);
    expect(b.nouveau).toBe(false);
    expect(b.message.id).toBe(a.message.id);
    await m.vider();
    expect(m.principal.envoyes).toHaveLength(1);
    expect(await m.journal.lister({})).toHaveLength(1);
  });

  it("sans clé, chaque appel est un nouveau SMS", async () => {
    const m = monterSms();
    await billet(m);
    await billet(m);
    await m.vider();
    expect(m.principal.envoyes).toHaveLength(2);
  });

  it("refuse un numéro invalide et des variables invalides sans rien créer", async () => {
    const m = monterSms();
    await expect(billet(m, {}, "12345")).rejects.toBeInstanceOf(TelephoneInvalide);
    await expect(billet(m, { code: "12" })).rejects.toBeInstanceOf(VariablesInvalides);
    expect(await m.journal.lister({})).toHaveLength(0);
    expect(await m.file.compter()).toMatchObject({ attente: 0 });
  });

  it("limite les SMS par numéro et par heure, puis repart l'heure suivante", async () => {
    const m = monterSms({ env: { SMS_LIMITE_DESTINATAIRE_HEURE: "3" } });
    for (let i = 0; i < 3; i++) await billet(m);
    await expect(billet(m)).rejects.toMatchObject({ portee: "destinataire" });
    await expect(billet(m, {}, "+237699999999")).resolves.toBeDefined(); // un autre numéro passe
    m.horloge.avancer(60 * 60_000 + 1);
    await expect(billet(m)).resolves.toBeDefined();
  });

  it("limite les SMS par compte et par heure", async () => {
    const m = monterSms({ env: { SMS_LIMITE_DEMANDEUR_HEURE: "2" } });
    await billet(m, {}, "+237655000001");
    await billet(m, {}, "+237655000002");
    await expect(billet(m, {}, "+237655000003")).rejects.toBeInstanceOf(QuotaSmsDepasse);
    // un autre compte n'est pas touché
    await expect(
      m.passerelle.envoyer({
        type: "billet",
        variables: VARIABLES_BILLET,
        destinataire: "+237655000004",
        demandeurId: "u2",
      }),
    ).resolves.toBeDefined();
  });

  it("les codes de connexion (système) échappent à la limite par numéro", async () => {
    const m = monterSms({ env: { SMS_LIMITE_DESTINATAIRE_HEURE: "1" } });
    for (let i = 0; i < 3; i++) {
      await m.passerelle.envoyer({
        type: "systeme",
        variables: { texte: "Code 123456" },
        destinataire: TEL,
      });
    }
    expect(await m.journal.lister({})).toHaveLength(3);
  });

  it("n'accepte que les liens des domaines autorisés", async () => {
    const m = monterSms({ env: { SMS_HOTES_LIENS: "afrimove.app" } });
    await expect(billet(m, { lien: "https://afrimove.app/b/1" })).resolves.toBeDefined();
    await expect(billet(m, { lien: "https://b.afrimove.app/b/1" })).resolves.toBeDefined();
    for (const lien of [
      "https://pirate.example/b/1",
      "https://notafrimove.app/b/1",
      "https://afrimove.app.pirate.example/b/1",
    ]) {
      await expect(billet(m, { lien })).rejects.toBeInstanceOf(VariablesInvalides);
    }
  });

  it("si la file refuse le message, il est marqué en échec et personne n'est facturé", async () => {
    const m = monterSms();
    vi.spyOn(m.file, "ajouter").mockRejectedValue(new Error("redis coupé"));
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    await expect(billet(m)).rejects.toBeInstanceOf(FileIndisponible);
    const [msg] = await m.journal.lister({});
    expect(msg).toMatchObject({
      statut: "echec",
      derniereErreur: "file_indisponible",
      coutFcfa: 0,
    });
  });
});

describe("billet à la demande (guichet)", () => {
  const demande = (m: MontageSms, surcharge: { renvoi?: boolean; tel?: string } = {}) =>
    m.passerelle.envoyerBillet({
      billetId: "bil-1",
      destinataire: surcharge.tel ?? TEL,
      variables: VARIABLES_BILLET,
      renvoi: surcharge.renvoi ?? false,
      compagnieId: "c1",
      demandeurId: "u1",
    });

  it("un double appui ne renvoie rien et ne coûte rien de plus", async () => {
    const m = monterSms();
    const a = await demande(m);
    const b = await demande(m);
    expect(b).toMatchObject({ nouveau: false });
    expect(b.message.id).toBe(a.message.id);
    await m.vider();
    expect(m.principal.envoyes).toHaveLength(1);
  });

  it("« renvoyer » envoie un autre SMS, jusqu'à 2 renvois", async () => {
    const m = monterSms();
    const premier = await demande(m);
    const r1 = await demande(m, { renvoi: true });
    const r2 = await demande(m, { renvoi: true });
    expect(new Set([premier.message.id, r1.message.id, r2.message.id]).size).toBe(3);
    await expect(demande(m, { renvoi: true })).rejects.toMatchObject({ portee: "renvois" });
    await m.vider();
    expect(m.principal.envoyes).toHaveLength(3);
  });

  it("un renvoi sans envoi préalable est un premier envoi ; un autre numéro est indépendant", async () => {
    const m = monterSms();
    const a = await demande(m, { renvoi: true });
    expect(a.nouveau).toBe(true);
    const b = await demande(m, { tel: "+237677000000" });
    expect(b.nouveau).toBe(true);
    expect(b.message.id).not.toBe(a.message.id);
  });

  it("le billet part en priorité sur une alerte déjà en file", async () => {
    const m = monterSms({ env: { SMS_CONCURRENCE: "1" } });
    await m.passerelle.envoyer({
      type: "alerte_proche",
      variables: {
        voyageur: "Aïcha",
        gare: "Mvan",
        arriveeA: new Date("2027-01-05T09:40:00Z"),
        compagnie: "Alpha",
      },
      destinataire: "+237655000009",
    });
    await demande(m);
    await m.vider();
    expect(m.principal.envoyes.map((e) => e.texte.slice(0, 5))).toEqual(["Alpha", "AfriM"]);
  });
});

describe("reprise sur échec", () => {
  it("deux pannes passagères puis succès : 3 essais, attente de 3 s puis 6 s, facturé une fois", async () => {
    const m = monterSms();
    m.principal.programmer({ type: "temporaire", code: "limite_debit" }, { type: "temporaire" });
    const { message } = await billet(m);
    const logs = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await m.vider();
    const final = await m.journal.trouver(message.id);
    expect(final).toMatchObject({
      statut: "envoye",
      tentatives: 3,
      coutFcfa: 12,
      derniereErreur: null,
    });
    expect(final?.delaiEnvoiMs).toBe(3000 + 6000);
    expect((await m.journal.essais(message.id)).map((e) => [e.numero, e.resultat, e.code])).toEqual(
      [
        [1, "temporaire", "limite_debit"],
        [2, "temporaire", "fournisseur_indisponible"],
        [3, "accepte", null],
      ],
    );
    expect(logs).toHaveBeenCalled();
    expect(m.principal.envoyes).toHaveLength(1);
  });

  it("pendant la reprise le statut est « en_reprise » avec le code de la dernière erreur", async () => {
    const m = monterSms();
    m.principal.programmer({ type: "temporaire", code: "limite_debit" });
    const { message } = await billet(m);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await m.file.traiterPrets(); // un seul passage, sans avancer l'horloge
    expect(await m.journal.trouver(message.id)).toMatchObject({
      statut: "en_reprise",
      tentatives: 1,
      derniereErreur: "limite_debit",
      coutFcfa: 0,
    });
  });

  it("réponse perdue : le réessai porte la même référence, pas de deuxième SMS, pas de double coût", async () => {
    const m = monterSms();
    m.principal.programmer({ type: "reponse_perdue" });
    const { message } = await billet(m);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await m.vider();
    expect(m.principal.appels).toBe(2);
    expect(m.principal.envoyes).toHaveLength(1);
    expect(await m.journal.trouver(message.id)).toMatchObject({ statut: "envoye", coutFcfa: 12 });
    expect((await m.statistiques.couts()).total.coutFcfa).toBe(12);
  });

  it("panne durable : échec définitif après 6 essais, jamais facturé, porté à l'audit", async () => {
    const m = monterSms();
    m.principal.mettreEnPanne("fournisseur_indisponible");
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const erreurs = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { message } = await billet(m);
    await m.vider();
    expect(await m.journal.trouver(message.id)).toMatchObject({
      statut: "echec",
      tentatives: 6,
      coutFcfa: 0,
      derniereErreur: expect.stringMatching(/fournisseur_indisponible|fournisseurs_indisponibles/),
    });
    // le disjoncteur a épargné des appels au fournisseur en panne
    expect(m.principal.appels).toBeLessThan(6);
    expect((await m.statistiques.couts()).total).toMatchObject({ perdus: 1, coutFcfa: 0 });
    expect(m.auditRepo.lignes.map((l) => l.action)).toContain("sms.echec");
    expect(erreurs).toHaveBeenCalledWith(expect.stringContaining("échec définitif"));
    expect(await m.file.compter()).toMatchObject({ echoues: 1, attente: 0 });
  });

  it("le nombre d'essais est configurable", async () => {
    const m = monterSms({ env: { SMS_TENTATIVES_MAX: "2" } });
    m.principal.mettreEnPanne();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { message } = await billet(m);
    await m.vider();
    expect(await m.journal.trouver(message.id)).toMatchObject({ statut: "echec", tentatives: 2 });
  });

  it("refus définitif (numéro invalide chez le fournisseur) : un seul essai, pas de reprise", async () => {
    const m = monterSms();
    m.principal.programmer({ type: "definitif", code: "destinataire_invalide" });
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { message } = await billet(m);
    await m.vider();
    expect(await m.journal.trouver(message.id)).toMatchObject({
      statut: "echec",
      tentatives: 1,
      derniereErreur: "destinataire_invalide",
    });
    expect(m.principal.appels).toBe(1);
    expect((await m.journal.essais(message.id))[0]).toMatchObject({ resultat: "definitif" });
    expect(await m.file.compter()).toMatchObject({ echoues: 1, attente: 0 });
  });

  it("un PIN provisoire qui n'a pas pu partir en moins d'une heure n'est plus envoyé", async () => {
    const m = monterSms({ env: { SMS_REPRISE_MS: "600000", SMS_TENTATIVES_MAX: "8" } });
    m.principal.mettreEnPanne();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { message } = await m.passerelle.envoyer({
      type: "pin_provisoire",
      variables: PIN,
      destinataire: TEL,
    });
    await m.vider();
    expect(await m.journal.trouver(message.id)).toMatchObject({ statut: "expire", coutFcfa: 0 });
    // rétabli trop tard, il ne part pas
    m.principal.retablir();
    await m.vider();
    expect(m.principal.envoyes).toHaveLength(0);
  });

  it("un PIN qui part à temps est valable une heure : expireA = création + 1 h", async () => {
    const m = monterSms();
    const { message } = await m.passerelle.envoyer({
      type: "pin_provisoire",
      variables: PIN,
      destinataire: TEL,
    });
    expect(message.expireA?.getTime()).toBe(message.creeA.getTime() + 3_600_000);
  });

  it("une charge utile altérée n'est jamais réessayée", async () => {
    const m = monterSms();
    const { message } = await billet(m);
    const [travail] = m.file.instantane();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    await expect(
      m.passerelle.traiter({
        ...travail!,
        data: { ...travail!.data, texteChiffre: travail!.data.texteChiffre.slice(0, -4) + "AAAA" },
      }),
    ).rejects.toBeInstanceOf(ErreurNonRelancable);
    expect(await m.journal.trouver(message.id)).toMatchObject({
      statut: "echec",
      derniereErreur: "charge_illisible",
    });
    expect(m.principal.appels).toBe(0);
  });

  it("un travail rejoué pour un message déjà parti ne renvoie rien", async () => {
    const m = monterSms();
    await billet(m);
    const [travail] = m.file.instantane();
    await m.vider();
    await m.passerelle.traiter(travail!);
    await m.passerelle.traiter({ ...travail!, attemptsMade: 2 });
    expect(m.principal.appels).toBe(1);
  });

  it("un travail sans message au journal échoue sans réessai", async () => {
    const m = monterSms();
    await expect(
      m.passerelle.traiter({
        id: "x",
        name: "envoi-sms",
        data: {
          messageId: "00000000-0000-4000-8000-000000000000",
          destinataireChiffre: "",
          texteChiffre: "",
        },
        attemptsMade: 0,
        opts: { jobId: "x", attempts: 3, backoff: { type: "fixed", delay: 1 } },
        timestamp: 0,
      }),
    ).rejects.toBeInstanceOf(ErreurNonRelancable);
  });
});

describe("mode dégradé : secours et disjoncteur", () => {
  it("le principal en panne : le secours envoie dans le même essai, sans attendre", async () => {
    const m = monterSms({ avecSecours: true });
    m.principal.mettreEnPanne();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { message } = await billet(m);
    await m.vider();
    expect(await m.journal.trouver(message.id)).toMatchObject({
      statut: "envoye",
      fournisseur: "secours",
      tentatives: 1,
      delaiEnvoiMs: 0,
      coutFcfa: 12,
    });
    expect((await m.journal.essais(message.id)).map((e) => [e.fournisseur, e.resultat])).toEqual([
      ["principal", "temporaire"],
      ["secours", "accepte"],
    ]);
  });

  it("après 3 échecs d'affilée le principal n'est plus appelé (mode secours), puis il est retesté", async () => {
    const m = monterSms({ avecSecours: true });
    m.principal.mettreEnPanne();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const tels = ["+237655000001", "+237655000002", "+237655000003", "+237655000004"];
    for (const t of tels.slice(0, 3)) await billet(m, {}, t);
    await m.vider();
    expect(m.principal.appels).toBe(3);
    expect((await m.passerelle.etat()).mode).toBe("secours");

    await billet(m, {}, tels[3]);
    await m.vider();
    expect(m.principal.appels).toBe(3); // circuit ouvert : pas d'appel
    expect(m.secours?.envoyes).toHaveLength(4);

    // 30 s plus tard, le principal est rétabli : l'essai de contrôle réussit, tout redevient normal
    m.principal.retablir();
    m.horloge.avancer(30_000);
    await billet(m, {}, "+237655000005");
    await m.vider();
    expect(m.principal.appels).toBe(4);
    expect(m.principal.envoyes).toHaveLength(1);
    expect((await m.passerelle.etat()).mode).toBe("normal");
  });

  it("l'essai de contrôle qui échoue rouvre le circuit", async () => {
    const m = monterSms({ avecSecours: true });
    m.principal.mettreEnPanne();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 3; i++) await billet(m, {}, `+23765500000${i}`);
    await m.vider();
    m.horloge.avancer(30_000);
    await billet(m, {}, "+237655000010");
    await m.vider();
    expect(m.principal.appels).toBe(4); // un seul appel de contrôle
    await billet(m, {}, "+237655000011");
    await m.vider();
    expect(m.principal.appels).toBe(4); // de nouveau fermé pour 30 s
    expect((await m.passerelle.etat()).mode).toBe("secours");
  });

  it("tous les fournisseurs coupés : mode indisponible, les messages attendent en reprise", async () => {
    const m = monterSms({ avecSecours: true });
    m.principal.mettreEnPanne();
    m.secours?.mettreEnPanne();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 3; i++) await billet(m, {}, `+23765500000${i}`);
    await m.file.traiterPrets();
    const etat = await m.passerelle.etat();
    expect(etat.mode).toBe("indisponible");
    expect(etat.fournisseurs.map((f) => [f.fournisseur, f.circuit, f.role])).toEqual([
      ["principal", "ouvert", "principal"],
      ["secours", "ouvert", "secours"],
    ]);
    const messages = await m.journal.lister({});
    expect(messages.every((x) => x.statut === "en_reprise")).toBe(true);
    expect(etat.file.attente).toBe(3);
  });

  it("une panne rétablie sans secours : les messages en reprise partent d'eux-mêmes", async () => {
    const m = monterSms();
    m.principal.mettreEnPanne();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { message } = await billet(m);
    await m.file.traiterPrets();
    m.principal.retablir();
    await m.vider();
    expect((await m.journal.trouver(message.id))?.statut).toBe("envoye");
  });
});

describe("envoi différé et annulation", () => {
  it("l'alerte prévue dans 15 minutes attend son heure ; le délai se mesure depuis l'heure prévue", async () => {
    const m = monterSms();
    const arrivee = new Date(m.horloge.maintenant().getTime() + 15 * 60_000);
    const { message } = await m.passerelle.envoyer({
      type: "alerte_proche",
      variables: { voyageur: "Maman", gare: "Mvan", arriveeA: arrivee, compagnie: "Alpha" },
      destinataire: TEL,
      envoyerA: arrivee,
    });
    expect(message.planifieA).toEqual(arrivee);
    expect(await m.file.traiterPrets()).toBe(0);
    m.horloge.avancer(14 * 60_000);
    expect(await m.file.traiterPrets()).toBe(0);
    await m.vider();
    expect(m.principal.envoyes).toHaveLength(1);
    expect((await m.journal.trouver(message.id))?.delaiEnvoiMs).toBe(0);
  });

  it("annuler retire le SMS de la file ; on ne peut plus annuler un SMS parti ou déjà annulé", async () => {
    const m = monterSms();
    const arrivee = new Date(m.horloge.maintenant().getTime() + 15 * 60_000);
    const { message } = await m.passerelle.envoyer({
      type: "alerte_proche",
      variables: { voyageur: "Maman", gare: "Mvan", arriveeA: arrivee, compagnie: "Alpha" },
      destinataire: TEL,
      envoyerA: arrivee,
    });
    expect((await m.passerelle.annuler(message.id)).statut).toBe("annule");
    await m.vider();
    expect(m.principal.envoyes).toHaveLength(0);
    await expect(m.passerelle.annuler(message.id)).rejects.toBeInstanceOf(AnnulationImpossible);

    const parti = await billet(m);
    await m.vider();
    await expect(m.passerelle.annuler(parti.message.id)).rejects.toBeInstanceOf(
      AnnulationImpossible,
    );
  });
});

describe("confidentialité", () => {
  it("ni le numéro ni le texte (code, PIN) n'apparaissent en clair au journal, dans la file ou dans les logs", async () => {
    const m = monterSms();
    const lignes: string[] = [];
    for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
      vi.spyOn(Logger.prototype, niveau).mockImplementation((...args: unknown[]) => {
        lignes.push(args.map(String).join(" "));
      });
    }
    m.principal.programmer({ type: "temporaire", code: "limite_debit" }, { type: "definitif" });
    await billet(m);
    await m.passerelle.envoyer({ type: "pin_provisoire", variables: PIN, destinataire: TEL });
    const dansLaFile = JSON.stringify(m.file.instantane());
    const auJournal = JSON.stringify(await m.journal.lister({}));
    await m.vider();
    const apres = JSON.stringify(await m.journal.lister({}));
    const essais = JSON.stringify(
      await Promise.all((await m.journal.lister({})).map((x) => m.journal.essais(x.id))),
    );
    for (const secret of ["655012345", "7341", "482915", "Xk3pQ9", "Alpha Voyages"]) {
      for (const [nom, texte] of [
        ["file", dansLaFile],
        ["journal", auJournal],
        ["journal après envoi", apres],
        ["essais", essais],
        ["logs", lignes.join("\n")],
        [
          "audit",
          JSON.stringify(m.auditRepo.lignes, (_k, v: unknown) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
        ],
      ] as const) {
        expect(texte, `${nom} contient ${secret}`).not.toContain(secret);
      }
    }
    expect(lignes.length).toBeGreaterThan(0);
  });

  it("le numéro chiffré du journal est lié au message : recopié sur un autre, il ne se déchiffre pas", async () => {
    const m = monterSms();
    const a = await billet(m, {}, "+237655000001");
    const b = await billet(m, {}, "+237655000002");
    const ma = await m.journal.trouver(a.message.id);
    expect(() =>
      m.chiffrement.dechiffrer(ma!.destinataireChiffre, `sms.destinataire:${b.message.id}`),
    ).toThrow();
  });

  it("la vue publique d'un message n'expose ni le numéro chiffré ni son index", async () => {
    const m = monterSms();
    const { message } = await billet(m);
    expect(Object.keys(message)).not.toContain("destinataireChiffre");
    expect(Object.keys(message)).not.toContain("destinataireIndex");
  });
});
