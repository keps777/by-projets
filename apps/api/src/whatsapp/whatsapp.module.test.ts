import { describe, expect, it, vi } from "vitest";
import { chargerConfigWhatsApp, type ConfigWhatsApp } from "./config";
import { FileEnvoiWhatsApp } from "./file";
import { FournisseurWhatsApp } from "./fournisseur";
import { FournisseurWhatsAppHttp, TransportHttp } from "./fournisseur-http";
import { JournalWhatsApp } from "./journal";
import { AnnuaireRapportMemoire, SecoursSmsMemoire, SourceRapportMemoire } from "./memoire";
import { SecoursSmsAucun } from "./ports";
import { monterWhatsApp } from "./testing/montage";
import { TravailleurWhatsApp, VerificationWhatsApp } from "./whatsapp.module";

const PROD = {
  WHATSAPP_FOURNISSEUR: "http",
  WHATSAPP_API_URL: "https://graph.facebook.com/v21.0",
  WHATSAPP_TOKEN: "jeton-d-acces-de-production-0123456789",
  WHATSAPP_PHONE_ID: "109876543210",
  WHATSAPP_WABA_ID: "208765432109",
  WHATSAPP_APP_SECRET: "secret-application-de-production-0123",
  WHATSAPP_VERIFY_TOKEN: "jeton-de-verification-de-production",
};
const durable = <T>(base: object): T => ({ ...base, durable: true }) as T;
const reel = { reel: true };

function verification(
  config: ConfigWhatsApp,
  surcharge: Partial<{
    journal: JournalWhatsApp;
    file: FileEnvoiWhatsApp;
    fournisseur: FournisseurWhatsApp;
    secours: SecoursSmsMemoire | SecoursSmsAucun;
  }> = {},
  source = Object.assign(new SourceRapportMemoire(), reel),
  annuaire = Object.assign(new AnnuaireRapportMemoire(), reel),
) {
  const m = monterWhatsApp();
  const fournisseur = new FournisseurWhatsAppHttp(
    {
      urlApi: "https://graph.example/v21.0",
      jeton: "j".repeat(20),
      numeroId: "1",
      compteId: "2",
      secretApplication: "s".repeat(20),
      jetonVerification: "v".repeat(20),
      delaiMs: 1000,
    },
    {} as TransportHttp,
  );
  return new VerificationWhatsApp(
    config,
    surcharge.journal ?? durable<JournalWhatsApp>({}),
    surcharge.file ?? durable<FileEnvoiWhatsApp>({}),
    surcharge.fournisseur ?? fournisseur,
    surcharge.secours ?? m.secoursSms,
    source,
    annuaire,
  );
}

describe("VerificationWhatsApp (démarrage en production)", () => {
  const prod = chargerConfigWhatsApp(PROD, true);

  it("démarre quand tout est durable, réel et branché", () => {
    expect(() => verification(prod).onModuleInit()).not.toThrow();
  });

  it("refuse de démarrer avec les adaptateurs en mémoire livrés par défaut, en les nommant tous", () => {
    const m = monterWhatsApp();
    const v = new VerificationWhatsApp(
      prod,
      m.journal,
      m.file,
      m.fournisseur,
      new SecoursSmsAucun(),
      m.source,
      m.annuaire,
    );
    expect(() => v.onModuleInit()).toThrowError(/journal WhatsApp est en mémoire/);
    expect(() => v.onModuleInit()).toThrowError(/file d'envoi est en mémoire/);
    expect(() => v.onModuleInit()).toThrowError(/fournisseur WhatsApp est simulé/);
    expect(() => v.onModuleInit()).toThrowError(/repli par SMS n'est pas branché/);
    expect(() => v.onModuleInit()).toThrowError(/rapport du soir n'a pas de source/);
    expect(() => v.onModuleInit()).toThrowError(/destinataires du rapport ne sont pas branchés/);
  });

  it("refuse chaque adaptateur manquant, un par un", () => {
    const m = monterWhatsApp();
    expect(() => verification(prod, { journal: m.journal }).onModuleInit()).toThrowError(/journal/);
    expect(() => verification(prod, { file: m.file }).onModuleInit()).toThrowError(/file/);
    expect(() => verification(prod, { fournisseur: m.fournisseur }).onModuleInit()).toThrowError(
      /simulé/,
    );
    expect(() =>
      verification(prod, { secours: new SecoursSmsAucun() }).onModuleInit(),
    ).toThrowError(/SMS/);
    expect(() => verification(prod, {}, new SourceRapportMemoire()).onModuleInit()).toThrowError(
      /source/,
    );
    expect(() =>
      verification(prod, {}, undefined, new AnnuaireRapportMemoire()).onModuleInit(),
    ).toThrowError(/destinataires/);
  });

  it("le repli par SMS peut être écarté explicitement (WHATSAPP_SECOURS_SMS=false)", () => {
    const sansSecours = chargerConfigWhatsApp({ ...PROD, WHATSAPP_SECOURS_SMS: "false" }, true);
    expect(() =>
      verification(sansSecours, { secours: new SecoursSmsAucun() }).onModuleInit(),
    ).not.toThrow();
  });

  it("hors production, la mémoire est permise", () => {
    const m = monterWhatsApp();
    expect(() =>
      new VerificationWhatsApp(
        m.config,
        m.journal,
        m.file,
        m.fournisseur,
        new SecoursSmsAucun(),
        m.source,
        m.annuaire,
      ).onModuleInit(),
    ).not.toThrow();
  });
});

describe("TravailleurWhatsApp", () => {
  it("branche la file sur la passerelle au démarrage et la ferme à l'arrêt", async () => {
    const m = monterWhatsApp();
    const file = { traiter: vi.fn(), fermer: vi.fn().mockResolvedValue(undefined) };
    const t = new TravailleurWhatsApp(file as never, m.passerelle, m.config);
    t.onApplicationBootstrap();
    expect(file.traiter).toHaveBeenCalledTimes(1);
    expect(file.traiter.mock.calls[0]?.[1]).toEqual({ concurrence: m.config.concurrence });
    await t.onApplicationShutdown();
    expect(file.fermer).toHaveBeenCalled();
  });
});
