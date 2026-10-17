import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelephoneInvalide } from "../socle/comptes/telephone";
import {
  AnnulationImpossible,
  FenetreFermee,
  FileWhatsAppIndisponible,
  QuotaWhatsAppDepasse,
} from "./erreurs";
import { ErreurNonRelancable } from "./file";
import { VariablesInvalides } from "./gabarits";
import {
  VARIABLES_BILLET,
  VARIABLES_COLIS,
  monterWhatsApp,
  rapportMaquette,
  type MontageWhatsApp,
} from "./testing/montage";

afterEach(() => vi.restoreAllMocks());

const TEL = "+237655012345";
const ALERTE = {
  voyageur: "Marie",
  gare: "Yaoundé",
  arriveeA: new Date("2027-01-05T10:40:00.000Z"),
  compagnie: "Alpha Voyages",
};

const billet = (m: MontageWhatsApp, surcharge: Record<string, unknown> = {}, tel = TEL) =>
  m.passerelle.envoyer({
    type: "billet",
    variables: VARIABLES_BILLET,
    destinataire: tel,
    ...surcharge,
  });

const silence = () => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
};

describe("envoi d'un gabarit", () => {
  it("met en file puis envoie : le gabarit approuvé part avec ses variables, le statut passe à « envoyé »", async () => {
    silence();
    const m = monterWhatsApp();
    const { message, nouveau } = await billet(m);
    expect(nouveau).toBe(true);
    expect(message).toMatchObject({
      type: "billet",
      statut: "en_file",
      gabarit: "afrimove_billet",
    });
    expect(message.destinataireMasque).toBe("+237 ••••• 345");
    expect(m.fournisseur.envoyes).toHaveLength(0);

    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(1);
    expect(m.fournisseur.envoyes[0]).toMatchObject({
      reference: message.id,
      destinataire: TEL,
      contenu: {
        type: "gabarit",
        nom: "afrimove_billet",
        langue: "fr",
        parametres: ["Alpha Voyages", "Douala", "Yaoundé", "05/01 à 08h30", "14", "7341"],
        boutonUrl: "Xk3pQ9",
      },
    });
    const m2 = await m.passerelle.obtenir(message.id);
    expect(m2).toMatchObject({
      statut: "envoye",
      tentatives: 1,
      delaiEnvoiMs: 0,
      derniereErreur: null,
      secours: "aucun",
    });
    expect(m2.idFournisseur).toMatch(/^wamid\./);
    expect(await m.journal.essais(message.id)).toMatchObject([
      { numero: 1, fournisseur: "simule", resultat: "accepte", code: null },
    ]);
  });

  it("mesure le délai d'envoi de la demande à l'acceptation", async () => {
    silence();
    const m = monterWhatsApp({ latenceMs: 1800 });
    const { message } = await billet(m);
    await m.vider();
    expect((await m.passerelle.obtenir(message.id)).delaiEnvoiMs).toBe(1800);
  });

  it("est idempotent sur la clé : la même clé ne produit jamais deux messages", async () => {
    silence();
    const m = monterWhatsApp();
    const a = await billet(m, { cle: "billet:b1" });
    const b = await billet(m, { cle: "billet:b1" });
    expect(b.nouveau).toBe(false);
    expect(b.message.id).toBe(a.message.id);
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(1);
    expect(m.file.instantane()).toHaveLength(1);
  });

  it("normalise un numéro camerounais à 9 chiffres en +237", async () => {
    silence();
    const m = monterWhatsApp();
    await billet(m, {}, "655 01 23 45");
    await m.vider();
    expect(m.fournisseur.envoyes[0]?.destinataire).toBe("+237655012345");
  });

  it("refuse un numéro invalide ou des variables invalides, sans rien mettre en file", async () => {
    const m = monterWhatsApp();
    await expect(billet(m, {}, "12345")).rejects.toBeInstanceOf(TelephoneInvalide);
    await expect(
      m.passerelle.envoyer({
        type: "billet",
        variables: { ...VARIABLES_BILLET, code: "12" },
        destinataire: TEL,
      }),
    ).rejects.toBeInstanceOf(VariablesInvalides);
    expect(m.file.instantane()).toHaveLength(0);
    expect(await m.journal.lister({})).toHaveLength(0);
  });

  it("les messages urgents (billet, colis, rapport) passent avant les alertes", async () => {
    silence();
    const m = monterWhatsApp();
    await m.passerelle.envoyer({ type: "alerte_proche", variables: ALERTE, destinataire: TEL });
    await billet(m, {}, "+237655000002");
    await m.passerelle.envoyer({
      type: "colis",
      variables: VARIABLES_COLIS,
      destinataire: "+237655000003",
    });
    await m.vider();
    expect(
      m.fournisseur.envoyes.map((e) => (e.contenu.type === "gabarit" ? e.contenu.nom : "texte")),
    ).toEqual(["afrimove_billet", "afrimove_colis_retrait", "afrimove_alerte_proche"]);
  });

  it("programme un envoi : rien ne part avant l'heure, le délai se compte depuis l'heure voulue", async () => {
    silence();
    const m = monterWhatsApp();
    const arrivee = new Date(m.horloge.maintenant().getTime() + 2 * 60 * 60_000);
    const { message } = await m.passerelle.envoyer({
      type: "alerte_proche",
      variables: ALERTE,
      destinataire: TEL,
      envoyerA: arrivee,
    });
    expect(message.planifieA).toEqual(arrivee);
    expect(await m.file.traiterPrets()).toBe(0);
    expect(m.fournisseur.envoyes).toHaveLength(0);
    m.horloge.avancer(2 * 60 * 60_000 + 1500);
    await m.file.traiterPrets();
    expect(m.fournisseur.envoyes).toHaveLength(1);
    expect((await m.passerelle.obtenir(message.id)).delaiEnvoiMs).toBe(1500);
  });
});

describe("limites anti-abus", () => {
  it("limite les messages par compte et par heure, puis repart l'heure suivante", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_LIMITE_DEMANDEUR_HEURE: "3" } });
    for (let i = 0; i < 3; i++) {
      await billet(m, { demandeurId: "u1" }, `+23765500000${i}`);
    }
    await expect(billet(m, { demandeurId: "u1" }, "+237655000009")).rejects.toMatchObject({
      portee: "demandeur",
    });
    await billet(m, { demandeurId: "u2" }, "+237655000009"); // un autre compte n'est pas gêné
    m.horloge.avancer(61 * 60_000);
    await billet(m, { demandeurId: "u1" }, "+237655000008");
  });

  it("limite les messages par numéro et par heure", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_LIMITE_DESTINATAIRE_HEURE: "2" } });
    await billet(m);
    await billet(m);
    await expect(billet(m)).rejects.toBeInstanceOf(QuotaWhatsAppDepasse);
    await expect(
      m.passerelle.envoyer({
        type: "alerte_retard",
        variables: {
          compagnie: "Alpha",
          origine: "A",
          destination: "B",
          departA: new Date(0),
          minutes: 5,
        },
        destinataire: TEL,
      }),
    ).rejects.toMatchObject({ portee: "destinataire" });
  });

  it("la limite par numéro ne bloque pas le rapport du soir", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_LIMITE_DESTINATAIRE_HEURE: "1" } });
    await billet(m);
    await expect(billet(m)).rejects.toBeInstanceOf(QuotaWhatsAppDepasse);
    const r = await m.passerelle.envoyer({
      type: "rapport_soir",
      variables: { compagnie: "Alpha Voyages", rapport: rapportMaquette() },
      destinataire: TEL,
    });
    expect(r.nouveau).toBe(true);
  });
});

describe("reprise sur échec", () => {
  it("un échec temporaire programme un nouvel essai (5 s, 10 s, 20 s) puis l'envoi réussit sans doublon", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.programmer({ type: "temporaire", code: "limite_debit" }, { type: "temporaire" });
    const { message } = await billet(m);

    await m.file.traiterPrets();
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "en_reprise",
      tentatives: 1,
      derniereErreur: "limite_debit",
    });
    expect(m.file.prochaineEcheance()?.getTime()).toBe(m.horloge.maintenant().getTime() + 5000);

    await m.vider();
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "envoye",
      tentatives: 3,
      derniereErreur: null,
      secours: "aucun",
    });
    expect((await m.journal.essais(message.id)).map((e) => [e.numero, e.resultat, e.code])).toEqual(
      [
        [1, "temporaire", "limite_debit"],
        [2, "temporaire", "fournisseur_indisponible"],
        [3, "accepte", null],
      ],
    );
    expect(m.fournisseur.envoyes).toHaveLength(1);
    expect(m.secoursSms.demandes).toHaveLength(0);
  });

  it("réponse perdue : le réessai porte la même référence, WhatsApp ne reçoit qu'un message", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.programmer({ type: "reponse_perdue" });
    const { message } = await billet(m);
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(1);
    expect(m.fournisseur.appels).toBe(2);
    const final = await m.passerelle.obtenir(message.id);
    expect(final.statut).toBe("envoye");
    expect(final.idFournisseur).toBe(m.fournisseur.envoyes[0]?.idFournisseur);
  });

  it("un travail déjà traité (doublon dans la file, reprise après un arrêt) n'envoie rien de plus", async () => {
    silence();
    const m = monterWhatsApp();
    const { message } = await billet(m);
    await m.vider();
    const travail = m.file.instantane().find((t) => t.id === message.id)!;
    await m.passerelle.traiter(travail);
    expect(m.fournisseur.appels).toBe(1);
  });

  it("un message introuvable fait échouer le travail sans réessai", async () => {
    silence();
    const m = monterWhatsApp();
    const { message } = await billet(m);
    const travail = m.file.instantane().find((t) => t.id === message.id)!;
    await expect(
      m.passerelle.traiter({ ...travail, data: { ...travail.data, messageId: "inconnu" } }),
    ).rejects.toBeInstanceOf(ErreurNonRelancable);
  });

  it("une charge utile altérée n'est pas rejouée : échec, repli SMS", async () => {
    silence();
    const m = monterWhatsApp();
    const { message } = await billet(m);
    const travail = m.file.instantane().find((t) => t.id === message.id)!;
    await expect(
      m.passerelle.traiter({ ...travail, data: { ...travail.data, contenuChiffre: "altéré" } }),
    ).rejects.toBeInstanceOf(ErreurNonRelancable);
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "echec",
      derniereErreur: "charge_illisible",
      secours: "sms",
    });
    expect(m.fournisseur.appels).toBe(0);
    expect(m.secoursSms.demandes).toHaveLength(1);
  });

  it("si la file refuse le message : échec immédiat, rien ne reste en attente", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    vi.spyOn(m.file, "ajouter").mockRejectedValue(new Error("redis coupé"));
    await expect(billet(m)).rejects.toBeInstanceOf(FileWhatsAppIndisponible);
    const [msg] = await m.journal.lister({});
    expect(msg).toMatchObject({
      statut: "echec",
      derniereErreur: "file_indisponible",
      secoursChiffre: null,
    });
  });
});

describe("repli par SMS", () => {
  it("après le dernier essai raté, le billet part par SMS avec ses variables, une seule fois", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_DISJONCTEUR_SEUIL: "10" } });
    m.fournisseur.mettreEnPanne("fournisseur_indisponible");
    const { message } = await billet(m, {
      compagnieId: "c1",
      reference: { type: "billet", id: "b1" },
    });
    await m.vider();

    expect(m.fournisseur.appels).toBe(4); // 4 essais : 0 s, 5 s, 10 s, 20 s
    const final = await m.passerelle.obtenir(message.id);
    expect(final).toMatchObject({
      statut: "echec",
      tentatives: 4,
      derniereErreur: "fournisseur_indisponible",
      secours: "sms",
      secoursSmsId: "sms-1",
      secoursChiffre: null,
    });
    expect(m.secoursSms.demandes).toHaveLength(1);
    expect(m.secoursSms.demandes[0]).toMatchObject({
      type: "billet",
      destinataire: TEL,
      cle: `whatsapp-secours:${message.id}`,
      compagnieId: "c1",
      reference: { type: "billet", id: "b1" },
      variables: {
        compagnie: "Alpha Voyages",
        origine: "Douala",
        destination: "Yaoundé",
        departA: "2027-01-05T07:30:00.000Z",
        siege: "14",
        code: "7341",
        lien: "https://afrimove.app/b/Xk3pQ9",
      },
    });
    const actions = m.auditRepo.lignes.map((l) => [l.action, l.resultat]);
    expect(actions).toEqual([
      ["whatsapp.secours_sms", "succes"],
      ["whatsapp.echec", "echec"],
    ]);
    expect(m.auditRepo.lignes[1]?.details).toMatchObject({
      typeWhatsApp: "billet",
      erreur: "fournisseur_indisponible",
      essais: 4,
      secours: "sms",
    });
  });

  it("un refus définitif (numéro sans WhatsApp) bascule tout de suite, sans réessayer", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.programmer({ type: "definitif", code: "pas_sur_whatsapp" });
    const { message } = await billet(m);
    await m.vider();
    expect(m.fournisseur.appels).toBe(1);
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "echec",
      derniereErreur: "pas_sur_whatsapp",
      secours: "sms",
      tentatives: 1,
    });
    expect(m.secoursSms.demandes).toHaveLength(1);
    expect((await m.journal.essais(message.id))[0]).toMatchObject({
      resultat: "definitif",
      code: "pas_sur_whatsapp",
    });
  });

  it("le rapport du soir n'a pas de gabarit SMS : le repli porte le texte court, sans variables", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.programmer({ type: "definitif" });
    await m.passerelle.envoyer({
      type: "rapport_soir",
      variables: { compagnie: "Alpha Voyages", rapport: rapportMaquette() },
      destinataire: TEL,
      reference: { type: "rapport_soir", id: "c1:2027-01-05" },
    });
    await m.vider();
    const [demande] = m.secoursSms.demandes;
    expect(demande).toMatchObject({ type: "rapport_soir", variables: null, destinataire: TEL });
    expect(demande?.texte).toMatch(
      /^AfriMove Alpha Voyages : Rapport du mardi 5 janvier, 3 gares\./,
    );
  });

  it("sans repli voulu (WHATSAPP_SECOURS_SMS=false), le message reste en échec et rien n'est conservé", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_SECOURS_SMS: "false" } });
    m.fournisseur.programmer({ type: "definitif" });
    const { message } = await billet(m);
    expect((await m.journal.trouver(message.id))?.secoursChiffre).toBeNull();
    await m.vider();
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "echec",
      secours: "aucun",
    });
    expect(m.secoursSms.demandes).toHaveLength(0);
  });

  it("un message sans repli prévu (secours: false) n'est pas repris par SMS", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.programmer({ type: "definitif" });
    await billet(m, { secours: false });
    await m.vider();
    expect(m.secoursSms.demandes).toHaveLength(0);
  });

  it("canal SMS non branché ou en panne : « echec_sms » au message et à l'audit, le texte de repli est effacé", async () => {
    silence();
    for (const cas of ["non branché", "en panne"] as const) {
      const m = monterWhatsApp({ secoursBranche: cas === "en panne" });
      if (cas === "en panne") m.secoursSms.enPanne = true;
      m.fournisseur.programmer({ type: "definitif" });
      const { message } = await billet(m);
      await m.vider();
      const final = await m.journal.trouver(message.id);
      expect(final, cas).toMatchObject({
        statut: "echec",
        secours: "echec_sms",
        secoursChiffre: null,
      });
      expect(
        m.auditRepo.lignes.map((l) => l.action),
        cas,
      ).toEqual(["whatsapp.secours_echec", "whatsapp.echec"]);
      expect(m.auditRepo.lignes[1]?.details).toMatchObject({ secours: "echec_sms" });
    }
  });

  it("le repli est réservé une seule fois même demandé deux fois de suite", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.programmer({ type: "definitif" });
    const { message } = await billet(m);
    await m.vider();
    expect(await m.secours.declencher(message.id, "encore")).toBeNull();
    expect(m.secoursSms.demandes).toHaveLength(1);
  });

  it("un message annulé ou expiré n'est pas repris par SMS", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.mettreEnPanne();
    const { message } = await billet(m, {
      expireA: new Date(m.horloge.maintenant().getTime() + 1000),
    });
    await m.vider();
    expect((await m.passerelle.obtenir(message.id)).statut).toBe("expire");
    expect(m.secoursSms.demandes).toHaveLength(0);
    expect(await m.secours.declencher(message.id, "x")).toBeNull();
  });
});

describe("mode dégradé : disjoncteur", () => {
  const cinqMessages = async (m: MontageWhatsApp) => {
    for (let i = 0; i < 5; i++) await billet(m, {}, `+23765500000${i}`);
  };

  it("après 3 échecs d'affilée, WhatsApp n'est plus appelé : « secours_sms », puis il est retesté et rétabli", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_TENTATIVES_MAX: "1", WHATSAPP_CONCURRENCE: "1" } });
    m.fournisseur.mettreEnPanne();
    await cinqMessages(m);
    await m.vider();
    // 3 appels réels, puis le circuit s'ouvre : les 2 derniers n'appellent pas WhatsApp
    expect(m.fournisseur.appels).toBe(3);
    expect(m.disjoncteur.etat()).toBe("ouvert");
    expect(await m.passerelle.etat()).toMatchObject({
      mode: "secours_sms",
      circuit: { circuit: "ouvert", echecsConsecutifs: 3 },
      secoursSms: { voulu: true, branche: true },
      fournisseur: { nom: "simule", reel: false },
    });
    expect(m.secoursSms.demandes).toHaveLength(5); // tous repris par SMS
    const essais = await Promise.all(
      (await m.journal.lister({})).map((x) => m.journal.essais(x.id)),
    );
    expect(essais.flat().filter((e) => e.code === "circuit_ouvert")).toHaveLength(2);

    m.horloge.avancer(31_000);
    expect(m.disjoncteur.etat()).toBe("semi_ouvert");
    m.fournisseur.retablir();
    await billet(m, {}, "+237655000099");
    await m.vider();
    expect(m.disjoncteur.etat()).toBe("ferme");
    expect((await m.passerelle.etat()).mode).toBe("normal");
    expect(m.fournisseur.envoyes).toHaveLength(1);
  });

  it("avec le seuil par défaut, une panne totale ouvre le circuit au 3e échec : le 4e essai n'appelle pas WhatsApp, le repli part quand même", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.mettreEnPanne("fournisseur_indisponible");
    const { message } = await billet(m);
    await m.vider();
    expect(m.fournisseur.appels).toBe(3);
    expect((await m.journal.essais(message.id)).map((e) => e.code)).toEqual([
      "fournisseur_indisponible",
      "fournisseur_indisponible",
      "fournisseur_indisponible",
      "circuit_ouvert",
    ]);
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "echec",
      tentatives: 4,
      derniereErreur: "circuit_ouvert",
      secours: "sms",
    });
    expect(m.secoursSms.demandes).toHaveLength(1);
  });

  it("annonce « indisponible » quand le circuit est ouvert et que le repli SMS n'est pas branché", async () => {
    silence();
    const m = monterWhatsApp({
      env: { WHATSAPP_TENTATIVES_MAX: "1", WHATSAPP_CONCURRENCE: "1" },
      secoursBranche: false,
    });
    m.fournisseur.mettreEnPanne();
    await cinqMessages(m);
    await m.vider();
    expect((await m.passerelle.etat()).mode).toBe("indisponible");
    expect((await m.passerelle.etat()).secoursSms).toEqual({ voulu: true, branche: false });
  });

  it("un refus définitif d'un message ne compte pas comme une panne de WhatsApp", async () => {
    silence();
    const m = monterWhatsApp();
    for (let i = 0; i < 6; i++) {
      m.fournisseur.programmer({ type: "definitif" });
      await billet(m, {}, `+23765500000${i}`);
      await m.vider();
    }
    expect(m.disjoncteur.etat()).toBe("ferme");
    expect((await m.passerelle.etat()).mode).toBe("normal");
  });

  it("journalise chaque bascule de mode", async () => {
    const avertissements: string[] = [];
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation((...a: unknown[]) => {
      avertissements.push(a.map(String).join(" "));
    });
    const m = monterWhatsApp({ env: { WHATSAPP_TENTATIVES_MAX: "1", WHATSAPP_CONCURRENCE: "1" } });
    m.fournisseur.mettreEnPanne();
    await cinqMessages(m);
    await m.vider();
    expect(avertissements.filter((l) => l.includes("mode normal → secours_sms"))).toHaveLength(1);
    expect(avertissements.some((l) => l.includes("circuit ouvert"))).toBe(true);
  });
});

describe("expiration et annulation", () => {
  it("un message périmé n'est plus envoyé (alerte, après 3 h de panne)", async () => {
    silence();
    const m = monterWhatsApp({
      env: { WHATSAPP_REPRISE_MS: "600000", WHATSAPP_TENTATIVES_MAX: "12" },
    });
    m.fournisseur.mettreEnPanne();
    const { message } = await m.passerelle.envoyer({
      type: "alerte_proche",
      variables: ALERTE,
      destinataire: TEL,
    });
    expect(message.expireA?.getTime()).toBe(m.horloge.maintenant().getTime() + 3 * 3_600_000);
    await m.vider();
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({ statut: "expire" });
    expect(m.fournisseur.envoyes).toHaveLength(0);
  });

  it("le rapport du soir est valable 6 h à partir de l'heure voulue (réglable)", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_RAPPORT_VALIDITE_H: "2" } });
    const { message } = await m.passerelle.envoyer({
      type: "rapport_soir",
      variables: { compagnie: "Alpha", rapport: rapportMaquette() },
      destinataire: TEL,
    });
    expect(message.expireA?.getTime()).toBe(m.horloge.maintenant().getTime() + 2 * 3_600_000);
    expect(monterWhatsApp().config.rapport.validiteMs).toBe(6 * 3_600_000);
  });

  it("annule un message programmé avant son envoi", async () => {
    silence();
    const m = monterWhatsApp();
    const { message } = await m.passerelle.envoyer({
      type: "alerte_proche",
      variables: ALERTE,
      destinataire: TEL,
      envoyerA: new Date(m.horloge.maintenant().getTime() + 3_600_000),
    });
    const annule = await m.passerelle.annuler(message.id);
    expect(annule.statut).toBe("annule");
    m.horloge.avancer(2 * 3_600_000);
    await m.vider();
    expect(m.fournisseur.appels).toBe(0);
    expect((await m.file.compter()).attente).toBe(0);
  });

  it("refuse d'annuler un message déjà parti", async () => {
    silence();
    const m = monterWhatsApp();
    const { message } = await billet(m);
    await m.vider();
    await expect(m.passerelle.annuler(message.id)).rejects.toBeInstanceOf(AnnulationImpossible);
  });
});

describe("texte libre : la fenêtre de 24 heures", () => {
  const ecrit = async (m: MontageWhatsApp, de = "237655012345", id = "wamid.in-1") =>
    m.reception.traiter(
      m.fournisseur.fabriquerWebhook({
        messages: [{ idFournisseur: id, de, texte: "Pourquoi le 09:30 part si vide ?" }],
      }),
    );

  it("refuse un texte libre à quelqu'un qui n'a jamais écrit", async () => {
    const m = monterWhatsApp();
    await expect(
      m.passerelle.repondre({ destinataire: TEL, texte: "Bonjour" }),
    ).rejects.toBeInstanceOf(FenetreFermee);
    expect(m.file.instantane()).toHaveLength(0);
  });

  it("répond en texte libre dans les 24 h qui suivent un message reçu, pas au-delà", async () => {
    silence();
    const m = monterWhatsApp();
    await ecrit(m);
    m.horloge.avancer(23 * 3_600_000);
    const { message } = await m.passerelle.repondre({
      destinataire: TEL,
      texte: "  Trois jours de suite à 55 %.  ",
    });
    expect(message).toMatchObject({ type: "reponse", gabarit: null, statut: "en_file" });
    await m.vider();
    expect(m.fournisseur.envoyes[0]?.contenu).toEqual({
      type: "texte",
      texte: "Trois jours de suite à 55 %.",
    });
    expect((await m.passerelle.obtenir(message.id)).statut).toBe("envoye");

    m.horloge.avancer(2 * 3_600_000);
    await expect(
      m.passerelle.repondre({ destinataire: TEL, texte: "Encore" }),
    ).rejects.toBeInstanceOf(FenetreFermee);
  });

  it("la fenêtre est propre à chaque numéro", async () => {
    silence();
    const m = monterWhatsApp();
    await ecrit(m, "237655000001");
    await expect(
      m.passerelle.repondre({ destinataire: "+237655000002", texte: "Salut" }),
    ).rejects.toBeInstanceOf(FenetreFermee);
    await expect(
      m.passerelle.repondre({ destinataire: "+237655000001", texte: "Salut" }),
    ).resolves.toBeDefined();
  });

  it("refuse un texte vide ou de plus de 1 000 caractères", async () => {
    silence();
    const m = monterWhatsApp();
    await ecrit(m);
    await expect(m.passerelle.repondre({ destinataire: TEL, texte: "   " })).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(
      m.passerelle.repondre({ destinataire: TEL, texte: "x".repeat(1001) }),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("une réponse est idempotente sur sa clé", async () => {
    silence();
    const m = monterWhatsApp();
    await ecrit(m);
    const a = await m.passerelle.repondre({ destinataire: TEL, texte: "Un", cle: "rep-1" });
    const b = await m.passerelle.repondre({ destinataire: TEL, texte: "Un", cle: "rep-1" });
    expect(b).toMatchObject({ nouveau: false, message: { id: a.message.id } });
  });

  it("une réponse refusée par WhatsApp n'est pas reprise par SMS (pas de texte libre en repli)", async () => {
    silence();
    const m = monterWhatsApp();
    await ecrit(m);
    m.fournisseur.programmer({ type: "definitif", code: "fenetre_fermee" });
    const { message } = await m.passerelle.repondre({ destinataire: TEL, texte: "Bonjour" });
    await m.vider();
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "echec",
      secours: "aucun",
    });
    expect(m.secoursSms.demandes).toHaveLength(0);
  });
});

describe("confidentialité", () => {
  it("ni le numéro ni le contenu (code, lien, chiffres du rapport) n'apparaissent en clair au journal, dans la file, l'audit ou les logs", async () => {
    const m = monterWhatsApp();
    const lignes: string[] = [];
    for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
      vi.spyOn(Logger.prototype, niveau).mockImplementation((...args: unknown[]) => {
        lignes.push(args.map(String).join(" "));
      });
    }
    m.fournisseur.programmer({ type: "temporaire", code: "limite_debit" }, { type: "definitif" });
    await billet(m);
    await m.passerelle.envoyer({ type: "colis", variables: VARIABLES_COLIS, destinataire: TEL });
    await m.passerelle.envoyer({
      type: "rapport_soir",
      variables: { compagnie: "Alpha Voyages", rapport: rapportMaquette() },
      destinataire: "+237655000007",
    });
    const dansLaFile = JSON.stringify(m.file.instantane());
    const auJournal = JSON.stringify(await m.journal.lister({}));
    await m.vider();
    const messages = await m.journal.lister({});
    const apres = JSON.stringify(messages);
    const essais = JSON.stringify(await Promise.all(messages.map((x) => m.journal.essais(x.id))));
    const audit = JSON.stringify(m.auditRepo.lignes, (_k, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );

    for (const secret of [
      "655012345",
      "655000007",
      "7341",
      "482915",
      "Xk3pQ9",
      "1 004",
      "4,41 M",
      "Essono",
    ]) {
      for (const [nom, texte] of [
        ["file", dansLaFile],
        ["journal", auJournal],
        ["journal après envoi", apres],
        ["essais", essais],
        ["logs", lignes.join("\n")],
        ["audit", audit],
      ] as const) {
        expect(texte, `${nom} contient ${secret}`).not.toContain(secret);
      }
    }
    expect(lignes.length).toBeGreaterThan(0);
    expect(m.secoursSms.demandes.length).toBeGreaterThan(0); // le repli a bien reçu le contenu, lui
  });

  it("le numéro et le contenu chiffrés sont liés au message : recopiés sur un autre, ils ne se déchiffrent pas", async () => {
    silence();
    const m = monterWhatsApp();
    const a = await billet(m, {}, "+237655000001");
    const b = await billet(m, {}, "+237655000002");
    const ma = (await m.journal.trouver(a.message.id))!;
    expect(() =>
      m.chiffrement.dechiffrer(ma.destinataireChiffre, `whatsapp.destinataire:${b.message.id}`),
    ).toThrow();
    expect(() =>
      m.chiffrement.dechiffrer(ma.secoursChiffre!, `whatsapp.secours:${b.message.id}`),
    ).toThrow();
    expect(
      m.chiffrement.dechiffrer(ma.destinataireChiffre, `whatsapp.destinataire:${a.message.id}`),
    ).toBe("+237655000001");
  });

  it("la vue publique d'un message n'expose ni le numéro chiffré, ni son index, ni le texte de repli", async () => {
    silence();
    const m = monterWhatsApp();
    const { message } = await billet(m);
    expect(Object.keys(message)).not.toContain("destinataireChiffre");
    expect(Object.keys(message)).not.toContain("destinataireIndex");
    expect(Object.keys(message)).not.toContain("secoursChiffre");
  });

  it("le texte de repli est effacé dès que le message est remis", async () => {
    silence();
    const m = monterWhatsApp();
    const { message } = await billet(m);
    await m.vider();
    expect((await m.journal.trouver(message.id))?.secoursChiffre).not.toBeNull();
    const id = (await m.passerelle.obtenir(message.id)).idFournisseur!;
    await m.reception.traiter(
      m.fournisseur.fabriquerWebhook({ statuts: [{ idFournisseur: id, etat: "remis" }] }),
    );
    expect((await m.journal.trouver(message.id))?.secoursChiffre).toBeNull();
  });
});
