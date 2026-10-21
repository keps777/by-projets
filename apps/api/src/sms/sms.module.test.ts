import { describe, expect, it } from "vitest";
import { FileEnvoiSms } from "./file";
import { TransportHttp } from "./fournisseur-http";
import { JournalSms } from "./journal";
import { chargerConfigSms } from "./config";
import { construireRegistre } from "./registre";
import { SmsGatewayPasserelle, VerificationSms } from "./sms.module";
import { monterSms } from "./testing/montage";

const PROD = {
  SMS_FOURNISSEUR: "http",
  SMS_API_URL: "https://api.sms.example/v1",
  SMS_API_KEY: "cle-api-de-production-0123456789",
  SMS_WEBHOOK_SECRET: "w".repeat(40),
  SMS_HOTES_LIENS: "afrimove.app",
};
const transport = {} as TransportHttp;
const durable = <T>(base: object): T => ({ ...base, durable: true }) as T;

describe("VerificationSms (démarrage en production)", () => {
  const config = chargerConfigSms(PROD, true);
  const registre = construireRegistre(config, transport);

  it("refuse de démarrer tant que le journal ou la file sont en mémoire", () => {
    const m = monterSms();
    const verif = new VerificationSms(config, m.journal, m.file, registre);
    expect(() => verif.onModuleInit()).toThrowError(/journal des SMS est en mémoire/);
    expect(() => verif.onModuleInit()).toThrowError(/file d'envoi est en mémoire/);
  });

  it("refuse un fournisseur principal simulé", () => {
    const m = monterSms();
    const verif = new VerificationSms(
      config,
      durable<JournalSms>({}),
      durable<FileEnvoiSms>({}),
      m.registre,
    );
    expect(() => verif.onModuleInit()).toThrowError(/fournisseur principal est simulé/);
  });

  it("démarre quand tout est durable et réel", () => {
    const verif = new VerificationSms(
      config,
      durable<JournalSms>({}),
      durable<FileEnvoiSms>({}),
      registre,
    );
    expect(() => verif.onModuleInit()).not.toThrow();
  });

  it("hors production, la mémoire est permise", () => {
    const m = monterSms();
    expect(() =>
      new VerificationSms(m.config, m.journal, m.file, m.registre).onModuleInit(),
    ).not.toThrow();
  });
});

describe("SmsGatewayPasserelle (SmsGateway du socle)", () => {
  it("met le code de connexion en file, le fournisseur le reçoit tel quel", async () => {
    const m = monterSms();
    const gateway = new SmsGatewayPasserelle(m.passerelle);
    await gateway.envoyer("+237655012345", "Votre code AfriMove est 123456.");
    expect(m.principal.envoyes).toHaveLength(0);
    await m.vider();
    expect(m.principal.envoyes[0]).toMatchObject({
      destinataire: "+237655012345",
      texte: "Votre code AfriMove est 123456.",
    });
    const [msg] = await m.journal.lister({});
    expect(msg).toMatchObject({ type: "systeme", statut: "envoye" });
  });

  it("un code de connexion n'est plus envoyé au bout de 5 minutes", async () => {
    const m = monterSms({ env: { SMS_REPRISE_MS: "200000" } });
    m.principal.mettreEnPanne();
    await new SmsGatewayPasserelle(m.passerelle).envoyer("+237655012345", "Votre code est 123456");
    await m.vider();
    expect((await m.journal.lister({}))[0]?.statut).toBe("expire");
  });
});
