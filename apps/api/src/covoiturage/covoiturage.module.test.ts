import { describe, expect, it } from "vitest";
import { chargerConfigCovoiturage } from "./config";
import { VerificationStockageCovoiturage } from "./covoiturage.module";
import {
  DemandesMemoire,
  DossiersMemoire,
  NotesMemoire,
  PasserelleVersementsSimulee,
  ReferentielMemoire,
  ReservationsMemoire,
  TrajetsMemoire,
  TrajetsReguliersMemoire,
  VersementsMemoire,
} from "./memoire";
import type { StockageCovoiturage } from "./ports";

function verification(production: boolean, surcharge: Record<string, unknown> = {}) {
  const ports: Record<string, unknown> = {
    trajets: new TrajetsMemoire(),
    reservations: new ReservationsMemoire(),
    dossiers: new DossiersMemoire(),
    versements: new VersementsMemoire(),
    passerelle: new PasserelleVersementsSimulee(),
    demandes: new DemandesMemoire(),
    notes: new NotesMemoire(),
    reguliers: new TrajetsReguliersMemoire(),
    referentiel: new ReferentielMemoire(),
    ...surcharge,
  };
  // les ports de remplacement du test ne sont que des marqueurs `durable` : on les passe tels quels
  return new VerificationStockageCovoiturage(
    chargerConfigCovoiturage({}, production),
    ports.trajets as never,
    ports.reservations as never,
    ports.dossiers as never,
    ports.versements as never,
    ports.passerelle as never,
    ports.demandes as never,
    ports.notes as never,
    ports.reguliers as never,
    ports.referentiel as never,
  );
}

/** Un port « durable » : ce que serait une version PostgreSQL. */
const durable: StockageCovoiturage = { durable: true };

describe("garde-fou de production : jamais de covoiturage en mémoire", () => {
  it("développement : les ports en mémoire sont acceptés", () => {
    expect(() => verification(false).onModuleInit()).not.toThrow();
  });

  it("production avec les ports en mémoire : le démarrage est refusé, avec la liste", () => {
    expect(() => verification(true).onModuleInit()).toThrowError(
      /Trajets, Reservations, Dossiers, Versements, PasserelleVersements, Demandes, Notes, TrajetsReguliersPassagers, ReferentielCovoiturage sont en mémoire ou simulés/,
    );
  });

  it("production : un seul port resté en mémoire suffit à refuser, et le message le nomme", () => {
    const tout = {
      trajets: durable,
      reservations: durable,
      dossiers: durable,
      versements: durable,
      passerelle: durable,
      demandes: durable,
      notes: durable,
      reguliers: durable,
      referentiel: durable,
    };
    expect(() => verification(true, tout).onModuleInit()).not.toThrow();
    expect(() =>
      verification(true, { ...tout, passerelle: new PasserelleVersementsSimulee() }).onModuleInit(),
    ).toThrowError(/PasserelleVersements sont en mémoire/);
    expect(() =>
      verification(true, { ...tout, versements: new VersementsMemoire() }).onModuleInit(),
    ).toThrowError(/Versements sont en mémoire/);
  });
});
