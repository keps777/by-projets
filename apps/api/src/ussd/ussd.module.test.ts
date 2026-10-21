import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chargerConfigUssd } from "./config";
import {
  AchatsUssdMemoire,
  JournalUssdMemoire,
  NotifieurBilletMemoire,
  SessionsMemoire,
  SuiviBusAucun,
  SuiviBusMemoire,
  SuiviColisAucun,
  SuiviColisMemoire,
} from "./memoire";
import type { AchatsUssd, JournalUssd, NotifieurBilletUssd, SessionsUssd } from "./ports";
import { VerificationUssd } from "./ussd.module";

const PROD = chargerConfigUssd(
  { USSD_MTN_JETON: "un-jeton-de-production-assez-long-0123456789" },
  true,
);
const DEV = chargerConfigUssd({});
const durable = <T>(base: object): T => ({ ...base, durable: true }) as T;

function verification(
  config = PROD,
  surcharge: Partial<{
    sessions: SessionsUssd;
    journal: JournalUssd;
    achats: AchatsUssd;
    notifieur: NotifieurBilletUssd;
  }> = {},
) {
  return new VerificationUssd(
    config,
    surcharge.sessions ?? durable<SessionsUssd>({}),
    surcharge.journal ?? durable<JournalUssd>({}),
    surcharge.achats ?? durable<AchatsUssd>({}),
    surcharge.notifieur ?? Object.assign(new NotifieurBilletMemoire(), { reel: true }),
    new SuiviColisAucun(),
    new SuiviBusAucun(),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("VerificationUssd (démarrage en production)", () => {
  it("démarre quand les sessions, le journal et les achats sont durables et le SMS branché", () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    expect(() => verification().onModuleInit()).not.toThrow();
  });

  it("refuse de démarrer avec les adaptateurs en mémoire livrés par défaut, en les nommant tous", () => {
    const v = verification(PROD, {
      sessions: new SessionsMemoire(),
      journal: new JournalUssdMemoire(),
      achats: new AchatsUssdMemoire(),
      notifieur: new NotifieurBilletMemoire(),
    });
    expect(() => v.onModuleInit()).toThrowError(/sessions sont en mémoire/);
    expect(() => v.onModuleInit()).toThrowError(/journal USSD est en mémoire/);
    expect(() => v.onModuleInit()).toThrowError(/achats USSD sont en mémoire/);
    expect(() => v.onModuleInit()).toThrowError(/SMS du billet n'est pas branché/);
  });

  it("des sessions en mémoire suffisent à refuser : deux instances ne se verraient pas", () => {
    const v = verification(PROD, { sessions: new SessionsMemoire() });
    expect(() => v.onModuleInit()).toThrowError(/sessions sont en mémoire/);
  });

  it("hors production, les adaptateurs en mémoire sont acceptés", () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const v = verification(DEV, {
      sessions: new SessionsMemoire(),
      journal: new JournalUssdMemoire(),
      achats: new AchatsUssdMemoire(),
      notifieur: new NotifieurBilletMemoire(),
    });
    expect(() => v.onModuleInit()).not.toThrow();
  });

  it("le suivi des colis et celui des bus non branchés sont signalés sans bloquer le démarrage", () => {
    const avertir = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    verification().onModuleInit();
    expect(avertir).toHaveBeenCalledTimes(2);
    expect(String(avertir.mock.calls[0]![0])).toContain("colis");
    expect(String(avertir.mock.calls[1]![0])).toContain("GPS");
  });

  it("branchés, ils ne sont plus signalés", () => {
    const avertir = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const colis = Object.assign(new SuiviColisMemoire(), { branche: true });
    const bus = Object.assign(new SuiviBusMemoire(), { branche: true });
    new VerificationUssd(
      PROD,
      durable<SessionsUssd>({}),
      durable<JournalUssd>({}),
      durable<AchatsUssd>({}),
      Object.assign(new NotifieurBilletMemoire(), { reel: true }),
      colis,
      bus,
    ).onModuleInit();
    expect(avertir).not.toHaveBeenCalled();
  });
});
