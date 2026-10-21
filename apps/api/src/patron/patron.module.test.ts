import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../socle/app.module";
import { CONFIG } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import { CONFIG_PATRON, chargerConfigPatron } from "./config";
import {
  AlertesEcritesMemoire,
  EquipePatronMemoire,
  ExploitationPatronMemoire,
  ReferentielPatronMemoire,
  ReglesPatronMemoire,
} from "./memoire";
import { VerificationPatron } from "./patron.module";

describe("configuration du module patron", () => {
  it("ne porte plus que le mode production (le balayage des lignes est celui de l'administration)", () => {
    expect(chargerConfigPatron()).toEqual({ production: false });
    expect(chargerConfigPatron(true)).toEqual({ production: true });
  });
});

describe("VerificationPatron (garde de production)", () => {
  const durable = <T extends object>(port: T): T => Object.assign(port, { durable: true });
  const garde = (production: boolean, durables: number) => {
    const ports = [
      new ReferentielPatronMemoire(),
      new ExploitationPatronMemoire(),
      new AlertesEcritesMemoire(),
      new EquipePatronMemoire(),
      new ReglesPatronMemoire(),
    ];
    const [r, x, a, e, g] = ports.map((p, i) => (i < durables ? durable(p) : p)) as [
      ReferentielPatronMemoire,
      ExploitationPatronMemoire,
      AlertesEcritesMemoire,
      EquipePatronMemoire,
      ReglesPatronMemoire,
    ];
    return new VerificationPatron(chargerConfigPatron(production), r, x, a, e, g);
  };

  it("hors production, tout est permis", () => {
    expect(() => garde(false, 0).onModuleInit()).not.toThrow();
  });
  it("en production, refuse de démarrer tant qu'un port est en mémoire, et les nomme", () => {
    expect(() => garde(true, 0).onModuleInit()).toThrow(
      /ReferentielPatron, ExploitationPatron, AlertesEcrites, EquipePatron, ReglesPatron/,
    );
    expect(() => garde(true, 4).onModuleInit()).toThrow(/ReglesPatron/);
  });
  it("en production avec des ports durables : démarre", () => {
    expect(() => garde(true, 5).onModuleInit()).not.toThrow();
  });
  it("l'application complète refuse de démarrer en production avec les adaptateurs en mémoire", async () => {
    await expect(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CONFIG)
        .useValue(configTest())
        .overrideProvider(CONFIG_PATRON)
        .useValue(chargerConfigPatron(true))
        .overrideProvider(PrismaService)
        .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
        .compile()
        .then((m) => m.createNestApplication().init()),
    ).rejects.toThrow(/PatronModule/);
  });
});
