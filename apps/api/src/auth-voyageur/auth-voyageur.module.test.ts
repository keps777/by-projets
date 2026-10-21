import { describe, expect, it } from "vitest";
import { FileEnvoiSms } from "../sms/file";
import type { FileEnvoiMemoire } from "../sms/file-memoire";
import type { FournisseurSimule } from "../sms/fournisseur-simule";
import { RegistreFournisseurs } from "../sms/registre";
import { VerificationAuthVoyageur } from "./auth-voyageur.module";
import { chargerConfigAuthVoyageur } from "./config";
import {
  EnvoiCodeSmsMemoire,
  EnvoiCodeWhatsAppAbsent,
  EnvoiCodeWhatsAppMemoire,
  FichesVoyageurMemoire,
  StockageConnexionMemoire,
} from "./memoire";
import { EnvoiCodeSms, EnvoiCodeWhatsApp, FichesVoyageur, StockageConnexion } from "./ports";
import { formatWebOtp, texteSms } from "./regles";
import { creerAppAuthTest } from "./testing/app-auth-test";

const production = chargerConfigAuthVoyageur(
  { AUTH_VOYAGEUR_WEBOTP_DOMAINE: "app.exemple.cm" },
  true,
);
const developpement = chargerConfigAuthVoyageur({});

const durable = <T extends object>(base: T): T =>
  Object.assign(base, { durable: true, reel: true });

describe("garde-fou de production", () => {
  const verif = (config = production, ports: Partial<Record<string, unknown>> = {}) =>
    new VerificationAuthVoyageur(
      config,
      (ports["stockage"] as StockageConnexion) ?? new StockageConnexionMemoire(),
      (ports["fiches"] as FichesVoyageur) ?? new FichesVoyageurMemoire(),
      (ports["sms"] as EnvoiCodeSms) ?? new EnvoiCodeSmsMemoire(),
      (ports["whatsapp"] as EnvoiCodeWhatsApp) ?? new EnvoiCodeWhatsAppAbsent(),
    );

  it("refuse de démarrer en production sur des adaptateurs en mémoire, et les nomme tous", () => {
    expect(() => verif().onModuleInit()).toThrow(
      /codes et les essais sont en mémoire.*fiches voyageur sont en mémoire.*SMS est simulé/,
    );
  });

  it("démarre hors production, même en mémoire", () => {
    expect(() => verif(developpement).onModuleInit()).not.toThrow();
  });

  it("démarre en production avec des adaptateurs durables, WhatsApp non branché compris", () => {
    expect(() =>
      verif(production, {
        stockage: durable(new StockageConnexionMemoire()),
        fiches: durable(new FichesVoyageurMemoire()),
        sms: durable(new EnvoiCodeSmsMemoire()),
      }).onModuleInit(),
    ).not.toThrow();
  });

  it("un seul adaptateur volatil suffit à refuser", () => {
    expect(() =>
      verif(production, {
        stockage: durable(new StockageConnexionMemoire()),
        fiches: durable(new FichesVoyageurMemoire()),
      }).onModuleInit(),
    ).toThrow(/SMS est simulé/);
  });
});

describe("remplacer un adaptateur de AppModule", () => {
  it("branche WhatsApp : la demande par WhatsApp part par WhatsApp", async () => {
    const whatsapp = new EnvoiCodeWhatsAppMemoire();
    const t = await creerAppAuthTest({
      fournisseurs: [{ provide: EnvoiCodeWhatsApp, useValue: whatsapp }],
    });
    try {
      const r = await t
        .http()
        .post("/voyageur/connexion/code")
        .send({ telephone: "+237691221008", canal: "whatsapp" });
      expect(r.status).toBe(200);
      expect(r.body.canal).toBe("whatsapp");
      expect(whatsapp.boite.at(-1)?.telephone).toBe("+237691221008");
      expect(t.sms.boite).toHaveLength(0);

      const session = await t
        .http()
        .post("/voyageur/connexion/verification")
        .send({ telephone: "+237691221008", code: whatsapp.dernierCode() });
      expect(session.status).toBe(200);
    } finally {
      await t.fermer();
    }
  });
});

describe("avec la vraie passerelle SMS (AM-166)", () => {
  async function monter() {
    const t = await creerAppAuthTest({ passerelleSms: true });
    return {
      t,
      file: t.app.get(FileEnvoiSms) as FileEnvoiMemoire,
      fournisseur: t.app.get(RegistreFournisseurs).principal as FournisseurSimule,
    };
  }

  it("le code part par la file de la passerelle vers le bon numéro, expéditeur AfriMove", async () => {
    const { t, file, fournisseur } = await monter();
    try {
      const r = await t
        .http()
        .post("/voyageur/connexion/code")
        .send({ telephone: "+237691221008" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      await file.traiterPrets();
      const envoye = fournisseur.envoyes.at(-1)!;
      expect(envoye.destinataire).toBe("+237691221008");
      expect(envoye.expediteur).toBe("AfriMove");
      expect(envoye.texte).toMatch(/ton code est \d{4}\./);
      expect(envoye.texte).toMatch(/@afrimove\.app #\d{4}$/);
    } finally {
      await t.fermer();
    }
  });

  it("le code reçu ouvre la session", async () => {
    const { t, file, fournisseur } = await monter();
    try {
      await t.http().post("/voyageur/connexion/code").send({ telephone: "+237691221008" });
      await file.traiterPrets();
      const code = /#(\d{4})$/.exec(fournisseur.envoyes.at(-1)!.texte)![1]!;
      const session = await t
        .http()
        .post("/voyageur/connexion/verification")
        .send({ telephone: "+237691221008", code });
      expect(session.status).toBe(200);
    } finally {
      await t.fermer();
    }
  });

  /**
   * WebOTP (Chrome Android) ne lit que la DERNIÈRE ligne du SMS : elle doit être `@domaine #code`. Le
   * type `code_connexion` de la passerelle garde les sauts de ligne (le type `systeme` les écrasait).
   */
  it("le SMS arrive avec « @domaine #code » en dernière ligne (WebOTP)", async () => {
    const { t, file, fournisseur } = await monter();
    try {
      await t.http().post("/voyageur/connexion/code").send({ telephone: "+237691221008" });
      await file.traiterPrets();
      const texte = fournisseur.envoyes.at(-1)!.texte;
      const code = /#(\d{4})$/.exec(texte)![1]!;
      expect(formatWebOtp(texte, "afrimove.app", code)).toBe(true);
      // Le gabarit de la passerelle rend exactement le texte que ce module compose.
      expect(texte).toBe(texteSms(code, 5, "afrimove.app"));
      expect(texte.split("\n")).toHaveLength(3);
    } finally {
      await t.fermer();
    }
  });
});
