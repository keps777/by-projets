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
  LignesPatronMemoire,
  ReferentielPatronMemoire,
  ReglesPatronMemoire,
} from "./memoire";
import { VerificationPatron } from "./patron.module";
import {
  COMPAGNIE,
  LIGNE_DLA_YDE,
  PIN_PATRON,
  creerAppPatronTest,
} from "./testing/app-patron-test";
import { PlanificateurLignes } from "./planificateur";

describe("configuration du module patron", () => {
  it("lit le balayage, éteint par défaut en test", () => {
    expect(chargerConfigPatron({ NODE_ENV: "test" }).balayageMs).toBe(0);
    expect(chargerConfigPatron({}).balayageMs).toBe(300_000);
    expect(chargerConfigPatron({ PATRON_BALAYAGE_MS: "60000" }).balayageMs).toBe(60_000);
    expect(chargerConfigPatron({}, true).production).toBe(true);
  });
  it("refuse une valeur inexploitable en nommant la variable", () => {
    expect(() => chargerConfigPatron({ PATRON_BALAYAGE_MS: "souvent" })).toThrow(
      /PATRON_BALAYAGE_MS/,
    );
    expect(() => chargerConfigPatron({ PATRON_BALAYAGE_MS: "-5" })).toThrow(/PATRON_BALAYAGE_MS/);
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
      new LignesPatronMemoire(),
      new ReglesPatronMemoire(),
    ];
    const [r, x, a, e, l, g] = ports.map((p, i) => (i < durables ? durable(p) : p)) as [
      ReferentielPatronMemoire,
      ExploitationPatronMemoire,
      AlertesEcritesMemoire,
      EquipePatronMemoire,
      LignesPatronMemoire,
      ReglesPatronMemoire,
    ];
    return new VerificationPatron(chargerConfigPatron({}, production), r, x, a, e, l, g);
  };

  it("hors production, tout est permis", () => {
    expect(() => garde(false, 0).onModuleInit()).not.toThrow();
  });
  it("en production, refuse de démarrer tant qu'un port est en mémoire, et les nomme", () => {
    expect(() => garde(true, 0).onModuleInit()).toThrow(
      /ReferentielPatron, ExploitationPatron, AlertesEcrites, EquipePatron, LignesPatron, ReglesPatron/,
    );
    expect(() => garde(true, 5).onModuleInit()).toThrow(/ReglesPatron/);
  });
  it("en production avec des ports durables : démarre", () => {
    expect(() => garde(true, 6).onModuleInit()).not.toThrow();
  });
  it("l'application complète refuse de démarrer en production avec les adaptateurs en mémoire", async () => {
    await expect(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CONFIG)
        .useValue(configTest())
        .overrideProvider(CONFIG_PATRON)
        .useValue(chargerConfigPatron({}, true))
        .overrideProvider(PrismaService)
        .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
        .compile()
        .then((m) => m.createNestApplication().init()),
    ).rejects.toThrow(/PatronModule/);
  });
});

describe("PlanificateurLignes", () => {
  it("met en vigueur la modification datée dont le jour est venu, une seule fois", async () => {
    const t = await creerAppPatronTest();
    try {
      t.semer();
      const patronCompte = await t.compte("patron", { gareId: null });
      const url = `/patron/reglages/lignes/${LIGNE_DLA_YDE}`;
      const r = await t
        .http()
        .put(url)
        .set({ Authorization: `Bearer ${patronCompte.jeton}` })
        .send({
          ligneId: LIGNE_DLA_YDE,
          tarifs: { classique: 3100, vip: 4600, bagage: 500 },
          effetDu: "2026-11-09",
          signature: t.signature(PIN_PATRON),
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const planificateur = t.app.get(PlanificateurLignes);
      expect(await planificateur.tick()).toBe(0);
      expect((await t.lignes.trouver(COMPAGNIE, LIGNE_DLA_YDE))?.brouillon).not.toBeNull();

      t.horloge.avancer(8 * 24 * 3_600_000);
      expect(await planificateur.tick()).toBe(1);
      const ligne = await t.lignes.trouver(COMPAGNIE, LIGNE_DLA_YDE);
      expect(ligne?.tarifs.classique).toBe(3100);
      expect(ligne?.brouillon).toBeNull();
      expect(await planificateur.tick()).toBe(0);
    } finally {
      await t.fermer();
    }
  });
});
