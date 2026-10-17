import { afterEach, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { AppModule } from "../socle/app.module";
import { CONFIG } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { SmsGateway, SmsMock } from "../socle/sms/sms.gateway";
import { configTest } from "../socle/testing/app-test";
import { JournalSms } from "./journal";
import { JournalMemoire } from "./journal-memoire";
import { SmsGatewayPasserelle } from "./sms.module";

/** Le montage de `SmsModule` dans l'application : qui est `SmsGateway`, où va le journal. */

let app: NestExpressApplication | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

async function monter(env: Record<string, string>) {
  const config = configTest(env);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();
  app = module.createNestApplication<NestExpressApplication>();
  await app.init();
  return app;
}

describe("SmsModule dans AppModule", () => {
  it("hors test, l'authentification envoie ses codes par la passerelle (file, secours, journal)", async () => {
    const a = await monter({ NODE_ENV: "development" });
    const gateway = a.get(SmsGateway);
    expect(gateway).toBeInstanceOf(SmsGatewayPasserelle);
    expect(gateway).toBe(a.get(SmsGatewayPasserelle));
    expect(a.get(JournalSms)).toBeInstanceOf(JournalMemoire);
  });

  it("en test, elle garde le simulateur du socle, dont les tests lisent la boîte", async () => {
    const a = await monter({ NODE_ENV: "test" });
    expect(a.get(SmsGateway)).toBeInstanceOf(SmsMock);
  });
});
