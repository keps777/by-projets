import { describe, expect, it } from "vitest";
import { HorlogeFixe } from "../socle/testing/memoire";
import { AgregateurAbsent } from "./agregateur-absent";
import { AgregateurHttp, TransportFetch } from "./agregateur-http";
import { AgregateurSimule } from "./agregateur-simule";
import { chargerConfigPaiements } from "./config";
import {
  ComptesReversementMemoire,
  LiensPaiementMemoire,
  NotificationsTraiteesMemoire,
  PaiementsMemoire,
  ReglagesPaiementsMemoire,
  RemboursementsMemoire,
} from "./memoire";
import { VerificationStockagePaiements, construireAgregateur } from "./paiements.module";

const HTTP = {
  PAIEMENTS_FOURNISSEUR: "http",
  PAIEMENTS_API_URL: "https://api.agregateur.example/v1",
  PAIEMENTS_API_KEY: "k".repeat(24),
  PAIEMENTS_WEBHOOK_SECRET: "s".repeat(40),
  PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
};

describe("choix de l'agrégateur d'après la configuration", () => {
  const horloge = new HorlogeFixe();
  const transport = new TransportFetch();

  it("aucun en production par défaut : mode dégradé permanent, aucun appel ne part", async () => {
    const config = chargerConfigPaiements(
      { PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer" },
      true,
    );
    const agregateur = construireAgregateur(config, transport, horloge);
    expect(agregateur).toBeInstanceOf(AgregateurAbsent);
    expect(agregateur.reel).toBe(false);
    await expect(agregateur.consulter("x")).rejects.toMatchObject({ code: "agregateur_absent" });
  });

  it("simulé en développement, avec l'issue demandée", () => {
    const agregateur = construireAgregateur(
      chargerConfigPaiements({ PAIEMENTS_SIMULE_ISSUE: "echoue" }),
      transport,
      horloge,
    );
    expect(agregateur).toBeInstanceOf(AgregateurSimule);
    expect(agregateur.nom).toBe("simule");
    expect(agregateur.reel).toBe(false);
  });

  it("HTTP quand l'agrégateur est configuré", () => {
    const agregateur = construireAgregateur(chargerConfigPaiements(HTTP, true), transport, horloge);
    expect(agregateur).toBeInstanceOf(AgregateurHttp);
    expect(agregateur.nom).toBe("agregateur");
    expect(agregateur.reel).toBe(true);
  });
});

function verification(production: boolean, ports: Partial<Record<string, unknown>> = {}) {
  const config = chargerConfigPaiements(production ? HTTP : {}, production);
  return new VerificationStockagePaiements(
    config,
    (ports.paiements ?? new PaiementsMemoire()) as PaiementsMemoire,
    (ports.remboursements ?? new RemboursementsMemoire()) as RemboursementsMemoire,
    (ports.traitees ?? new NotificationsTraiteesMemoire()) as NotificationsTraiteesMemoire,
    (ports.liens ?? new LiensPaiementMemoire()) as LiensPaiementMemoire,
    (ports.comptes ?? new ComptesReversementMemoire()) as ComptesReversementMemoire,
    (ports.reglages ?? new ReglagesPaiementsMemoire()) as ReglagesPaiementsMemoire,
  );
}

describe("garde-fou de production : jamais de paiements en mémoire", () => {
  it("développement : les ports en mémoire sont acceptés", () => {
    expect(() => verification(false).onModuleInit()).not.toThrow();
  });

  it("production avec les ports en mémoire : le démarrage est refusé, avec la liste", () => {
    expect(() => verification(true).onModuleInit()).toThrowError(
      /Paiements, Remboursements, NotificationsTraitees, LiensPaiement, ComptesReversement, ReglagesPaiements sont en mémoire/,
    );
  });

  it("un seul port resté en mémoire suffit à bloquer", () => {
    const durable = { durable: true };
    const presque = verification(true, {
      paiements: durable,
      remboursements: durable,
      traitees: durable,
      liens: durable,
      comptes: durable,
    });
    expect(() => presque.onModuleInit()).toThrowError(/ReglagesPaiements sont en mémoire/);
  });

  it("production avec des adaptateurs durables : le démarrage passe", () => {
    const durable = { durable: true };
    const tout = verification(true, {
      paiements: durable,
      remboursements: durable,
      traitees: durable,
      liens: durable,
      comptes: durable,
      reglages: durable,
    });
    expect(() => tout.onModuleInit()).not.toThrow();
  });
});
