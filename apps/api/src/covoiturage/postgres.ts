import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type {
  DemandeCovoit,
  DossierConducteur,
  NoteCovoit,
  PieceConducteur,
  Proposition,
  Reservation,
  ResultatPaiementReservation,
  ResultatReservation,
  RoleNote,
  StatutDemande,
  StatutReservation,
  StatutTrajet,
  StatutVersement,
  Trajet,
  TrajetRegulierPassager,
  TypePiece,
  Versement,
} from "./modeles";
import {
  Demandes,
  Dossiers,
  Notes,
  ReferentielCovoiturage,
  Reservations,
  Trajets,
  TrajetsReguliersPassagers,
  Versements,
  type ConseilTrajet,
  type FiltreRecherche,
  type FiltreVersements,
  type StockageCovoiturage,
} from "./ports";
import { normaliser } from "./regles";

/**
 * Adaptateurs PostgreSQL (Prisma) du covoiturage. Tables : `trajet_covoiturage`,
 * `vue_trajet_covoiturage`, `reservation_covoiturage`, `dossier_conducteur`, `piece_conducteur`,
 * `versement_covoiturage`, `demande_covoiturage`, `proposition_covoiturage`, `note_covoiturage`,
 * `trajet_regulier_passager`, `conseil_covoiturage` (voir le README et la migration
 * `20261017000801_covoiturage`).
 *
 * Les garanties tiennent dans la base :
 * - **les places ne dépassent jamais** : `reserver` et `payer` verrouillent la ligne du trajet
 *   (`SELECT … FOR UPDATE`) avant de compter les places prises ;
 * - **une réservation en cours par passager et par trajet** : index unique partiel
 *   `reservation_covoiturage_une_en_cours` ;
 * - **un changement d'état ne passe qu'une fois** : `transitionner` est un
 *   `UPDATE … WHERE id = $1 AND statut = ANY($2)` ;
 * - **un versement par réservation**, **une note par rôle**, **une proposition par trajet** : clés
 *   uniques, `INSERT … ON CONFLICT DO NOTHING`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v: string): boolean => UUID.test(v);

type Tx = Prisma.TransactionClient;

const OCCUPENT: StatutReservation[] = ["en_attente_paiement", "payee"];

/** Vrai si l'erreur (ou sa cause) porte ce code SQLSTATE ou Prisma. */
function porteCode(e: unknown, code: string): boolean {
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, profondeur: number): boolean => {
    if (v === null || typeof v !== "object" || profondeur > 6 || vus.has(v)) return false;
    vus.add(v);
    const o = v as Record<string, unknown>;
    if (o["code"] === code || o["originalCode"] === code) return true;
    return Object.values(o).some((x) => parcourir(x, profondeur + 1));
  };
  return parcourir(e, 0) || (e instanceof Error && e.message.includes(code));
}

const jourVersDate = (jour: string): Date => new Date(`${jour}T00:00:00.000Z`);
const dateVersJour = (d: Date): string => d.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ trajets */

type LigneTrajet = Prisma.TrajetCovoiturageGetPayload<object>;

function versTrajet(l: LigneTrajet): Trajet {
  return {
    id: l.id,
    conducteurId: l.conducteurId,
    type: l.type as Trajet["type"],
    departVille: l.departVille,
    departPoint: l.departPoint,
    arriveeVille: l.arriveeVille,
    arriveePoint: l.arriveePoint,
    departA: l.departA,
    dureeMinutes: l.dureeMinutes,
    places: l.places,
    prixParPlace: l.prixParPlace,
    options: l.options as Trajet["options"],
    vehicule: l.vehicule,
    immatriculation: l.immatriculation,
    grandBagage: l.grandBagage,
    regulier: l.regulier,
    suivantCreeA: l.suivantCreeA,
    statut: l.statut as StatutTrajet,
    creeA: l.creeA,
    annuleA: l.annuleA,
  };
}

function donneesTrajet(t: Partial<Trajet>): Prisma.TrajetCovoiturageUncheckedUpdateInput {
  const d: Prisma.TrajetCovoiturageUncheckedUpdateInput = {};
  if (t.id !== undefined) d.id = t.id;
  if (t.conducteurId !== undefined) d.conducteurId = t.conducteurId;
  if (t.type !== undefined) d.type = t.type;
  if (t.departVille !== undefined) {
    d.departVille = t.departVille;
    d.departVilleNorm = normaliser(t.departVille);
  }
  if (t.departPoint !== undefined) d.departPoint = t.departPoint;
  if (t.arriveeVille !== undefined) {
    d.arriveeVille = t.arriveeVille;
    d.arriveeVilleNorm = normaliser(t.arriveeVille);
  }
  if (t.arriveePoint !== undefined) d.arriveePoint = t.arriveePoint;
  if (t.departA !== undefined) d.departA = t.departA;
  if (t.dureeMinutes !== undefined) d.dureeMinutes = t.dureeMinutes;
  if (t.places !== undefined) d.places = t.places;
  if (t.prixParPlace !== undefined) d.prixParPlace = t.prixParPlace;
  if (t.options !== undefined) d.options = [...t.options];
  if (t.vehicule !== undefined) d.vehicule = t.vehicule;
  if (t.immatriculation !== undefined) d.immatriculation = t.immatriculation;
  if (t.grandBagage !== undefined) d.grandBagage = t.grandBagage;
  if (t.regulier !== undefined) d.regulier = t.regulier;
  if (t.suivantCreeA !== undefined) d.suivantCreeA = t.suivantCreeA;
  if (t.statut !== undefined) d.statut = t.statut;
  if (t.creeA !== undefined) d.creeA = t.creeA;
  if (t.annuleA !== undefined) d.annuleA = t.annuleA;
  return d;
}

@Injectable()
export class TrajetsPrisma extends Trajets implements StockageCovoiturage {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async creer(trajet: Trajet): Promise<void> {
    await this.prisma.trajetCovoiturage.create({
      data: donneesTrajet(trajet) as Prisma.TrajetCovoiturageUncheckedCreateInput,
    });
  }

  async trouver(id: string): Promise<Trajet | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.trajetCovoiturage.findUnique({ where: { id } });
    return l ? versTrajet(l) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutTrajet[],
    changement: Partial<Omit<Trajet, "id">>,
  ): Promise<Trajet | null> {
    if (!estUuid(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.trajetCovoiturage.updateMany({
        where: { id, statut: { in: [...de] } },
        data: donneesTrajet(changement),
      });
      if (count === 0) return null;
      return versTrajet(await tx.trajetCovoiturage.findUniqueOrThrow({ where: { id } }));
    });
  }

  async rechercher(f: FiltreRecherche): Promise<Trajet[]> {
    const lignes = await this.prisma.trajetCovoiturage.findMany({
      where: {
        statut: "publie",
        type: f.type,
        departA: { gte: f.du, ...(f.jusqua === undefined ? {} : { lt: f.jusqua }) },
        ...(f.departVille === undefined ? {} : { departVilleNorm: f.departVille }),
        ...(f.arriveeVille === undefined ? {} : { arriveeVilleNorm: f.arriveeVille }),
        ...(f.ville === undefined ? {} : { departVilleNorm: f.ville }),
      },
      orderBy: [{ departA: "asc" }, { id: "asc" }],
      take: f.limite,
    });
    return lignes.map(versTrajet);
  }

  async duConducteur(
    conducteurId: string,
    filtre: { statuts?: readonly StatutTrajet[]; depuis?: Date } = {},
  ): Promise<Trajet[]> {
    if (!estUuid(conducteurId)) return [];
    const lignes = await this.prisma.trajetCovoiturage.findMany({
      where: {
        conducteurId,
        ...(filtre.statuts === undefined ? {} : { statut: { in: [...filtre.statuts] } }),
        ...(filtre.depuis === undefined ? {} : { departA: { gte: filtre.depuis } }),
      },
      orderBy: [{ departA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versTrajet);
  }

  async aTerminer(maintenant: Date, limite: number): Promise<Trajet[]> {
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "trajet_covoiturage"
      WHERE "statut" = 'publie'
        AND "departA" + "dureeMinutes" * interval '1 minute' <= ${maintenant}
      ORDER BY "departA", "id" LIMIT ${limite}`;
    return this.lire(ids.map((i) => i.id));
  }

  async aRenouveler(maintenant: Date, limite: number): Promise<Trajet[]> {
    const lignes = await this.prisma.trajetCovoiturage.findMany({
      where: { regulier: true, suivantCreeA: null, departA: { lte: maintenant } },
      orderBy: [{ departA: "asc" }, { id: "asc" }],
      take: limite,
    });
    return lignes.map(versTrajet);
  }

  async marquerSuivant(id: string, at: Date): Promise<boolean> {
    if (!estUuid(id)) return false;
    const { count } = await this.prisma.trajetCovoiturage.updateMany({
      where: { id, suivantCreeA: null },
      data: { suivantCreeA: at },
    });
    return count === 1;
  }

  async enregistrerVues(trajetIds: readonly string[], voyageurId: string): Promise<void> {
    const ids = trajetIds.filter(estUuid);
    if (ids.length === 0 || !estUuid(voyageurId)) return;
    await this.prisma.vueTrajetCovoiturage.createMany({
      data: ids.map((trajetId) => ({ trajetId, voyageurId })),
      skipDuplicates: true,
    });
  }

  async nombreVues(trajetId: string): Promise<number> {
    if (!estUuid(trajetId)) return 0;
    return this.prisma.vueTrajetCovoiturage.count({ where: { trajetId } });
  }

  async nombreAnnules(conducteurId: string): Promise<number> {
    if (!estUuid(conducteurId)) return 0;
    return this.prisma.trajetCovoiturage.count({ where: { conducteurId, statut: "annule" } });
  }

  /** Relit des trajets dans l'ordre des identifiants donnés. */
  private async lire(ids: string[]): Promise<Trajet[]> {
    if (ids.length === 0) return [];
    const lignes = await this.prisma.trajetCovoiturage.findMany({ where: { id: { in: ids } } });
    const parId = new Map(lignes.map((l) => [l.id, l]));
    return ids.flatMap((id) => {
      const l = parId.get(id);
      return l ? [versTrajet(l)] : [];
    });
  }
}

/* ------------------------------------------------------------------ réservations */

type LigneReservation = Prisma.ReservationCovoiturageGetPayload<object>;

function versReservation(l: LigneReservation): Reservation {
  return {
    id: l.id,
    trajetId: l.trajetId,
    conducteurId: l.conducteurId,
    passagerId: l.passagerId,
    places: l.places,
    prixParPlace: l.prixParPlace,
    fraisParPlace: l.fraisParPlace,
    libelle: l.libelle,
    statut: l.statut as StatutReservation,
    creeA: l.creeA,
    expireA: l.expireA,
    payeeA: l.payeeA,
    moyenPaiement: l.moyenPaiement,
    departA: l.departA,
    liberationAutoA: l.liberationAutoA,
    libereeA: l.libereeA,
    motifLiberation: l.motifLiberation as Reservation["motifLiberation"],
    annuleeA: l.annuleeA,
    annulePar: l.annulePar as Reservation["annulePar"],
    remboursement:
      l.remboursementPrix === null || l.remboursementFrais === null
        ? null
        : { prix: l.remboursementPrix, frais: l.remboursementFrais },
    retenue: l.retenue,
  };
}

function donneesReservation(
  r: Partial<Reservation>,
): Prisma.ReservationCovoiturageUncheckedUpdateInput {
  const d: Prisma.ReservationCovoiturageUncheckedUpdateInput = {};
  if (r.id !== undefined) d.id = r.id;
  if (r.trajetId !== undefined) d.trajetId = r.trajetId;
  if (r.conducteurId !== undefined) d.conducteurId = r.conducteurId;
  if (r.passagerId !== undefined) d.passagerId = r.passagerId;
  if (r.places !== undefined) d.places = r.places;
  if (r.prixParPlace !== undefined) d.prixParPlace = r.prixParPlace;
  if (r.fraisParPlace !== undefined) d.fraisParPlace = r.fraisParPlace;
  if (r.libelle !== undefined) d.libelle = r.libelle;
  if (r.statut !== undefined) d.statut = r.statut;
  if (r.creeA !== undefined) d.creeA = r.creeA;
  if (r.expireA !== undefined) d.expireA = r.expireA;
  if (r.payeeA !== undefined) d.payeeA = r.payeeA;
  if (r.moyenPaiement !== undefined) d.moyenPaiement = r.moyenPaiement;
  if (r.departA !== undefined) d.departA = r.departA;
  if (r.liberationAutoA !== undefined) d.liberationAutoA = r.liberationAutoA;
  if (r.libereeA !== undefined) d.libereeA = r.libereeA;
  if (r.motifLiberation !== undefined) d.motifLiberation = r.motifLiberation;
  if (r.annuleeA !== undefined) d.annuleeA = r.annuleeA;
  if (r.annulePar !== undefined) d.annulePar = r.annulePar;
  if (r.remboursement !== undefined) {
    d.remboursementPrix = r.remboursement?.prix ?? null;
    d.remboursementFrais = r.remboursement?.frais ?? null;
  }
  if (r.retenue !== undefined) d.retenue = r.retenue;
  return d;
}

/** Places retenues ou payées d'un trajet, sans compter une retenue échue ni la réservation `sauf`. */
async function placesPrisesTx(
  tx: Tx,
  trajetId: string,
  maintenant: Date,
  sauf?: string,
): Promise<number> {
  const somme = await tx.reservationCovoiturage.aggregate({
    _sum: { places: true },
    where: {
      trajetId,
      ...(sauf === undefined ? {} : { id: { not: sauf } }),
      OR: [
        { statut: { in: ["payee", "terminee"] } },
        { statut: "en_attente_paiement", expireA: { gt: maintenant } },
      ],
    },
  });
  return somme._sum.places ?? 0;
}

/** Verrouille la ligne du trajet : les réservations et paiements du même trajet passent l'un après l'autre. */
async function verrouillerTrajet(tx: Tx, trajetId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "trajet_covoiturage" WHERE "id" = ${trajetId}::uuid FOR UPDATE`;
}

@Injectable()
export class ReservationsPrisma extends Reservations implements StockageCovoiturage {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async reserver(
    reservation: Reservation,
    capacite: number,
    maintenant: Date,
  ): Promise<ResultatReservation> {
    const chercherExistante = async (tx: Tx | PrismaService) =>
      tx.reservationCovoiturage.findFirst({
        where: {
          trajetId: reservation.trajetId,
          passagerId: reservation.passagerId,
          statut: { in: OCCUPENT },
        },
      });
    try {
      return await this.prisma.$transaction(async (tx): Promise<ResultatReservation> => {
        await verrouillerTrajet(tx, reservation.trajetId);
        const existante = await chercherExistante(tx);
        if (existante) {
          return { ok: false, raison: "deja_reservee", existante: versReservation(existante) };
        }
        const prises = await placesPrisesTx(tx, reservation.trajetId, maintenant);
        if (prises + reservation.places > capacite) return { ok: false, raison: "complet" };
        await tx.reservationCovoiturage.create({
          data: donneesReservation(
            reservation,
          ) as Prisma.ReservationCovoiturageUncheckedCreateInput,
        });
        return { ok: true };
      });
    } catch (e) {
      // Filet : l'index unique partiel refuse une seconde réservation en cours du même passager.
      if (porteCode(e, "23505") || porteCode(e, "P2002")) {
        const existante = await chercherExistante(this.prisma);
        if (existante) {
          return { ok: false, raison: "deja_reservee", existante: versReservation(existante) };
        }
      }
      throw e;
    }
  }

  async trouver(id: string): Promise<Reservation | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.reservationCovoiturage.findUnique({ where: { id } });
    return l ? versReservation(l) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutReservation[],
    changement: Partial<Omit<Reservation, "id">>,
  ): Promise<Reservation | null> {
    if (!estUuid(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.reservationCovoiturage.updateMany({
        where: { id, statut: { in: [...de] } },
        data: donneesReservation(changement),
      });
      if (count === 0) return null;
      return versReservation(await tx.reservationCovoiturage.findUniqueOrThrow({ where: { id } }));
    });
  }

  async payer(
    id: string,
    capacite: number,
    maintenant: Date,
    changement: Partial<Omit<Reservation, "id">>,
  ): Promise<ResultatPaiementReservation> {
    if (!estUuid(id)) return { ok: false, raison: "inconnue" };
    const apercu = await this.prisma.reservationCovoiturage.findUnique({
      where: { id },
      select: { trajetId: true },
    });
    if (!apercu) return { ok: false, raison: "inconnue" };
    return this.prisma.$transaction(async (tx): Promise<ResultatPaiementReservation> => {
      // Le trajet d'abord, la réservation ensuite : même ordre partout, pas d'interblocage.
      await verrouillerTrajet(tx, apercu.trajetId);
      const r = await tx.reservationCovoiturage.findUnique({ where: { id } });
      if (!r) return { ok: false, raison: "inconnue" };
      if (r.statut === "payee" || r.statut === "terminee") {
        return { ok: true, reservation: versReservation(r), dejaPayee: true };
      }
      if (r.statut === "annulee") return { ok: false, raison: "annulee" };
      const retenueActive = r.statut === "en_attente_paiement" && r.expireA > maintenant;
      if (!retenueActive) {
        // Retenue échue : les places sont reprises seulement s'il en reste et si le passager n'a pas
        // pris une autre réservation entre-temps.
        const autreActive = await tx.reservationCovoiturage.count({
          where: {
            id: { not: r.id },
            trajetId: r.trajetId,
            passagerId: r.passagerId,
            statut: { in: OCCUPENT },
          },
        });
        const prises = await placesPrisesTx(tx, r.trajetId, maintenant, r.id);
        if (autreActive > 0 || prises + r.places > capacite) {
          return { ok: false, raison: "complet" };
        }
      }
      const apres = await tx.reservationCovoiturage.update({
        where: { id },
        data: { ...donneesReservation(changement), statut: "payee" },
      });
      return { ok: true, reservation: versReservation(apres), dejaPayee: false };
    });
  }

  async duTrajet(trajetId: string): Promise<Reservation[]> {
    if (!estUuid(trajetId)) return [];
    const l = await this.prisma.reservationCovoiturage.findMany({
      where: { trajetId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map(versReservation);
  }

  async duPassager(passagerId: string): Promise<Reservation[]> {
    if (!estUuid(passagerId)) return [];
    const l = await this.prisma.reservationCovoiturage.findMany({
      where: { passagerId },
      orderBy: [{ departA: "desc" }, { id: "asc" }],
    });
    return l.map(versReservation);
  }

  async duConducteur(
    conducteurId: string,
    statuts?: readonly StatutReservation[],
  ): Promise<Reservation[]> {
    if (!estUuid(conducteurId)) return [];
    const l = await this.prisma.reservationCovoiturage.findMany({
      where: { conducteurId, ...(statuts === undefined ? {} : { statut: { in: [...statuts] } }) },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map(versReservation);
  }

  async placesPrises(trajetId: string, maintenant: Date): Promise<number> {
    if (!estUuid(trajetId)) return 0;
    return this.prisma.$transaction((tx) => placesPrisesTx(tx, trajetId, maintenant));
  }

  async aExpirer(maintenant: Date, limite: number): Promise<Reservation[]> {
    const l = await this.prisma.reservationCovoiturage.findMany({
      where: { statut: "en_attente_paiement", expireA: { lte: maintenant } },
      orderBy: [{ expireA: "asc" }, { id: "asc" }],
      take: limite,
    });
    return l.map(versReservation);
  }

  async aLiberer(maintenant: Date, limite: number): Promise<Reservation[]> {
    const l = await this.prisma.reservationCovoiturage.findMany({
      where: { statut: "payee", liberationAutoA: { lte: maintenant } },
      orderBy: [{ liberationAutoA: "asc" }, { id: "asc" }],
      take: limite,
    });
    return l.map(versReservation);
  }
}

/* ------------------------------------------------------------------ dossiers des conducteurs */

type LigneDossier = Prisma.DossierConducteurGetPayload<{ include: { pieces: true } }>;

function versDossier(l: LigneDossier): DossierConducteur {
  const pieces: Partial<Record<TypePiece, PieceConducteur>> = {};
  for (const p of l.pieces) {
    pieces[p.type as TypePiece] = {
      type: p.type as TypePiece,
      statut: p.statut as PieceConducteur["statut"],
      fichierId: p.fichierId,
      numeroChiffre: p.numeroChiffre,
      expireLe: p.expireLe ? dateVersJour(p.expireLe) : null,
      deposeeA: p.deposeeA,
      verifieePar: p.verifieePar,
      verifieeA: p.verifieeA,
      motifRefus: p.motifRefus,
    };
  }
  const v = l.vehiculeMarque !== null;
  return {
    conducteurId: l.conducteurId,
    vehicule: v
      ? {
          marque: l.vehiculeMarque!,
          modele: l.vehiculeModele!,
          couleur: l.vehiculeCouleur!,
          immatriculation: l.vehiculeImmatriculation!,
          places: l.vehiculePlaces!,
          grandBagage: l.vehiculeGrandBagage!,
        }
      : null,
    pieces,
    numeroVersementChiffre: l.numeroVersementChiffre,
    creeA: l.creeA,
    modifieA: l.modifieA,
  };
}

@Injectable()
export class DossiersPrisma extends Dossiers implements StockageCovoiturage {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(conducteurId: string): Promise<DossierConducteur | null> {
    if (!estUuid(conducteurId)) return null;
    const l = await this.prisma.dossierConducteur.findUnique({
      where: { conducteurId },
      include: { pieces: true },
    });
    return l ? versDossier(l) : null;
  }

  /** Crée ou remplace le dossier et ses pièces, en une seule transaction. */
  async enregistrer(dossier: DossierConducteur): Promise<void> {
    const v = dossier.vehicule;
    const donnees = {
      vehiculeMarque: v?.marque ?? null,
      vehiculeModele: v?.modele ?? null,
      vehiculeCouleur: v?.couleur ?? null,
      vehiculeImmatriculation: v?.immatriculation ?? null,
      vehiculePlaces: v?.places ?? null,
      vehiculeGrandBagage: v?.grandBagage ?? null,
      numeroVersementChiffre: dossier.numeroVersementChiffre,
      modifieA: dossier.modifieA,
    };
    const pieces = Object.values(dossier.pieces).filter(
      (p): p is PieceConducteur => p !== undefined,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.dossierConducteur.upsert({
        where: { conducteurId: dossier.conducteurId },
        create: { conducteurId: dossier.conducteurId, creeA: dossier.creeA, ...donnees },
        update: donnees,
      });
      await tx.pieceConducteur.deleteMany({
        where: { conducteurId: dossier.conducteurId, type: { notIn: pieces.map((p) => p.type) } },
      });
      for (const p of pieces) {
        const piece = {
          statut: p.statut,
          fichierId: p.fichierId,
          numeroChiffre: p.numeroChiffre,
          expireLe: p.expireLe === null ? null : jourVersDate(p.expireLe),
          deposeeA: p.deposeeA,
          verifieePar: p.verifieePar,
          verifieeA: p.verifieeA,
          motifRefus: p.motifRefus,
        };
        await tx.pieceConducteur.upsert({
          where: { conducteurId_type: { conducteurId: dossier.conducteurId, type: p.type } },
          create: { conducteurId: dossier.conducteurId, type: p.type, ...piece },
          update: piece,
        });
      }
    });
  }

  async aVerifier(limite: number): Promise<DossierConducteur[]> {
    const l = await this.prisma.dossierConducteur.findMany({
      where: { pieces: { some: { statut: "a_verifier" } } },
      include: { pieces: true },
      orderBy: [{ modifieA: "asc" }, { conducteurId: "asc" }],
      take: limite,
    });
    return l.map(versDossier);
  }

  async tous(limite: number): Promise<DossierConducteur[]> {
    const l = await this.prisma.dossierConducteur.findMany({
      include: { pieces: true },
      orderBy: [{ modifieA: "desc" }, { conducteurId: "asc" }],
      take: limite,
    });
    return l.map(versDossier);
  }
}

/* ------------------------------------------------------------------ versements */

type LigneVersement = Prisma.VersementCovoiturageGetPayload<object>;

const versVersement = (l: LigneVersement): Versement => ({
  id: l.id,
  reservationId: l.reservationId,
  conducteurId: l.conducteurId,
  montant: l.montant,
  motif: l.motif as Versement["motif"],
  statut: l.statut as StatutVersement,
  reference: l.reference,
  tentatives: l.tentatives,
  prochainEssaiA: l.prochainEssaiA,
  derniereErreur: l.derniereErreur,
  creeA: l.creeA,
  faitA: l.faitA,
});

function donneesVersement(v: Partial<Versement>): Prisma.VersementCovoiturageUncheckedUpdateInput {
  const d: Prisma.VersementCovoiturageUncheckedUpdateInput = {};
  if (v.id !== undefined) d.id = v.id;
  if (v.reservationId !== undefined) d.reservationId = v.reservationId;
  if (v.conducteurId !== undefined) d.conducteurId = v.conducteurId;
  if (v.montant !== undefined) d.montant = v.montant;
  if (v.motif !== undefined) d.motif = v.motif;
  if (v.statut !== undefined) d.statut = v.statut;
  if (v.reference !== undefined) d.reference = v.reference;
  if (v.tentatives !== undefined) d.tentatives = v.tentatives;
  if (v.prochainEssaiA !== undefined) d.prochainEssaiA = v.prochainEssaiA;
  if (v.derniereErreur !== undefined) d.derniereErreur = v.derniereErreur;
  if (v.creeA !== undefined) d.creeA = v.creeA;
  if (v.faitA !== undefined) d.faitA = v.faitA;
  return d;
}

@Injectable()
export class VersementsPrisma extends Versements implements StockageCovoiturage {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async creer(versement: Versement): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : de deux appels pour la même réservation, un seul crée.
    const { count } = await this.prisma.versementCovoiturage.createMany({
      data: [donneesVersement(versement) as Prisma.VersementCovoiturageCreateManyInput],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async deLaReservation(reservationId: string): Promise<Versement | null> {
    if (!estUuid(reservationId)) return null;
    const l = await this.prisma.versementCovoiturage.findUnique({ where: { reservationId } });
    return l ? versVersement(l) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutVersement[],
    changement: Partial<Omit<Versement, "id">>,
  ): Promise<Versement | null> {
    if (!estUuid(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.versementCovoiturage.updateMany({
        where: { id, statut: { in: [...de] } },
        data: donneesVersement(changement),
      });
      if (count === 0) return null;
      return versVersement(await tx.versementCovoiturage.findUniqueOrThrow({ where: { id } }));
    });
  }

  async aReprendre(maintenant: Date, limite: number): Promise<Versement[]> {
    const l = await this.prisma.versementCovoiturage.findMany({
      where: { statut: "a_faire", prochainEssaiA: { not: null, lte: maintenant } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
      take: limite,
    });
    return l.map(versVersement);
  }

  async duConducteur(conducteurId: string, depuis: Date): Promise<Versement[]> {
    if (!estUuid(conducteurId)) return [];
    const l = await this.prisma.versementCovoiturage.findMany({
      where: { conducteurId, statut: "fait", faitA: { gte: depuis } },
      orderBy: [{ faitA: "asc" }, { id: "asc" }],
    });
    return l.map(versVersement);
  }

  async lister(f: FiltreVersements): Promise<Versement[]> {
    const l = await this.prisma.versementCovoiturage.findMany({
      where: {
        ...(f.statut === undefined ? {} : { statut: f.statut }),
        ...(f.depuis === undefined ? {} : { creeA: { gte: f.depuis } }),
      },
      orderBy: [{ creeA: "desc" }, { id: "asc" }],
      take: f.limite,
    });
    return l.map(versVersement);
  }
}

/* ------------------------------------------------------------------ demandes, notes, trajet régulier */

type LigneDemande = Prisma.DemandeCovoiturageGetPayload<object>;

const versDemande = (l: LigneDemande): DemandeCovoit => ({
  id: l.id,
  passagerId: l.passagerId,
  departVille: l.departVille,
  arriveeVille: l.arriveeVille,
  jour: dateVersJour(l.jour),
  moment: l.moment as DemandeCovoit["moment"],
  places: l.places,
  statut: l.statut as StatutDemande,
  creeA: l.creeA,
});

function donneesDemande(d: Partial<DemandeCovoit>): Prisma.DemandeCovoiturageUncheckedUpdateInput {
  const r: Prisma.DemandeCovoiturageUncheckedUpdateInput = {};
  if (d.id !== undefined) r.id = d.id;
  if (d.passagerId !== undefined) r.passagerId = d.passagerId;
  if (d.departVille !== undefined) r.departVille = d.departVille;
  if (d.arriveeVille !== undefined) r.arriveeVille = d.arriveeVille;
  if (d.jour !== undefined) r.jour = jourVersDate(d.jour);
  if (d.moment !== undefined) r.moment = d.moment;
  if (d.places !== undefined) r.places = d.places;
  if (d.statut !== undefined) r.statut = d.statut;
  if (d.creeA !== undefined) r.creeA = d.creeA;
  return r;
}

const versProposition = (l: Prisma.PropositionCovoiturageGetPayload<object>): Proposition => ({
  demandeId: l.demandeId,
  conducteurId: l.conducteurId,
  trajetId: l.trajetId,
  envoyeeA: l.envoyeeA,
});

@Injectable()
export class DemandesPrisma extends Demandes implements StockageCovoiturage {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async creer(demande: DemandeCovoit): Promise<void> {
    await this.prisma.demandeCovoiturage.create({
      data: donneesDemande(demande) as Prisma.DemandeCovoiturageUncheckedCreateInput,
    });
  }

  async trouver(id: string): Promise<DemandeCovoit | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.demandeCovoiturage.findUnique({ where: { id } });
    return l ? versDemande(l) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutDemande[],
    changement: Partial<Omit<DemandeCovoit, "id">>,
  ): Promise<DemandeCovoit | null> {
    if (!estUuid(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.demandeCovoiturage.updateMany({
        where: { id, statut: { in: [...de] } },
        data: donneesDemande(changement),
      });
      if (count === 0) return null;
      return versDemande(await tx.demandeCovoiturage.findUniqueOrThrow({ where: { id } }));
    });
  }

  async duPassager(passagerId: string): Promise<DemandeCovoit[]> {
    if (!estUuid(passagerId)) return [];
    const l = await this.prisma.demandeCovoiturage.findMany({
      where: { passagerId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map(versDemande);
  }

  async ouvertes(f: { du: string; au: string; limite: number }): Promise<DemandeCovoit[]> {
    const l = await this.prisma.demandeCovoiturage.findMany({
      where: { statut: "ouverte", jour: { gte: jourVersDate(f.du), lte: jourVersDate(f.au) } },
      orderBy: [{ jour: "asc" }, { creeA: "asc" }, { id: "asc" }],
      take: f.limite,
    });
    return l.map(versDemande);
  }

  async ajouterProposition(p: Proposition): Promise<boolean> {
    const { count } = await this.prisma.propositionCovoiturage.createMany({
      data: [
        {
          demandeId: p.demandeId,
          conducteurId: p.conducteurId,
          trajetId: p.trajetId,
          envoyeeA: p.envoyeeA,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async propositionsDuConducteur(conducteurId: string): Promise<Proposition[]> {
    if (!estUuid(conducteurId)) return [];
    const l = await this.prisma.propositionCovoiturage.findMany({
      where: { conducteurId },
      orderBy: [{ envoyeeA: "asc" }, { trajetId: "asc" }],
    });
    return l.map(versProposition);
  }

  async propositionsDeLaDemande(demandeId: string): Promise<Proposition[]> {
    if (!estUuid(demandeId)) return [];
    const l = await this.prisma.propositionCovoiturage.findMany({
      where: { demandeId },
      orderBy: [{ envoyeeA: "asc" }, { trajetId: "asc" }],
    });
    return l.map(versProposition);
  }

  async aExpirer(avantJour: string, limite: number): Promise<DemandeCovoit[]> {
    const l = await this.prisma.demandeCovoiturage.findMany({
      where: { statut: "ouverte", jour: { lt: jourVersDate(avantJour) } },
      orderBy: [{ jour: "asc" }, { id: "asc" }],
      take: limite,
    });
    return l.map(versDemande);
  }
}

const versNote = (l: Prisma.NoteCovoiturageGetPayload<object>): NoteCovoit => ({
  id: l.id,
  reservationId: l.reservationId,
  noteId: l.noteId,
  roleNote: l.roleNote as RoleNote,
  auteurId: l.auteurId,
  valeur: l.valeur,
  commentaire: l.commentaire,
  creeA: l.creeA,
});

@Injectable()
export class NotesPrisma extends Notes implements StockageCovoiturage {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(note: NoteCovoit): Promise<boolean> {
    const { count } = await this.prisma.noteCovoiturage.createMany({
      data: [
        {
          id: note.id,
          reservationId: note.reservationId,
          noteId: note.noteId,
          roleNote: note.roleNote,
          auteurId: note.auteurId,
          valeur: note.valeur,
          commentaire: note.commentaire,
          creeA: note.creeA,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async deLaPersonne(noteId: string, roleNote: RoleNote): Promise<NoteCovoit[]> {
    if (!estUuid(noteId)) return [];
    const l = await this.prisma.noteCovoiturage.findMany({
      where: { noteId, roleNote },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map(versNote);
  }

  async deLaReservation(reservationId: string): Promise<NoteCovoit[]> {
    if (!estUuid(reservationId)) return [];
    const l = await this.prisma.noteCovoiturage.findMany({
      where: { reservationId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map(versNote);
  }
}

@Injectable()
export class TrajetsReguliersPrisma
  extends TrajetsReguliersPassagers
  implements StockageCovoiturage
{
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(voyageurId: string): Promise<TrajetRegulierPassager | null> {
    if (!estUuid(voyageurId)) return null;
    const l = await this.prisma.trajetRegulierPassager.findUnique({ where: { voyageurId } });
    return l ? { ...l } : null;
  }

  async enregistrer(trajet: TrajetRegulierPassager): Promise<void> {
    const { voyageurId, ...reste } = trajet;
    await this.prisma.trajetRegulierPassager.upsert({
      where: { voyageurId },
      create: { voyageurId, ...reste },
      update: reste,
    });
  }
}

/* ------------------------------------------------------------------ référentiel */

/**
 * Villes et conseils lus dans la base : le nom d'une ville vient des gares du réseau (code de ville
 * ou nom) et de la table des conseils ; la fourchette de prix et la durée, de `conseil_covoiturage`
 * (sens indifférent). Un trajet sans conseil reçoit le plafond général du module.
 */
@Injectable()
export class ReferentielLignesPrisma extends ReferentielCovoiturage implements StockageCovoiturage {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ville(codeOuNom: string): Promise<string | null> {
    const cle = normaliser(codeOuNom);
    if (cle === "") return null;
    const parCode = await this.prisma.gare.findFirst({
      where: { code: cle.toUpperCase() },
      select: { ville: true },
      orderBy: { id: "asc" },
    });
    if (parCode) return parCode.ville;
    const gares = await this.prisma.gare.findMany({ distinct: ["ville"], select: { ville: true } });
    const gare = gares.find((g) => normaliser(g.ville) === cle);
    if (gare) return gare.ville;
    const conseils = await this.prisma.conseilCovoiturage.findMany();
    for (const c of conseils) {
      if (c.villeANorm === cle) return c.villeA;
      if (c.villeBNorm === cle) return c.villeB;
    }
    return null;
  }

  async conseil(departVille: string, arriveeVille: string): Promise<ConseilTrajet | null> {
    const a = normaliser(departVille);
    const b = normaliser(arriveeVille);
    if (a === "" || b === "" || a === b) return null;
    const [villeANorm, villeBNorm] = a < b ? [a, b] : [b, a];
    const l = await this.prisma.conseilCovoiturage.findUnique({
      where: { villeANorm_villeBNorm: { villeANorm, villeBNorm } },
    });
    return l ? { prix: { min: l.prixMin, max: l.prixMax }, dureeMinutes: l.dureeMinutes } : null;
  }
}
