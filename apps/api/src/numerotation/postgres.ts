import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type { AlerteSync, TypeAlerte } from "../sync/ports";
import { versIsoDouala } from "../sync/temps";
import { PlageInvalide } from "./erreurs";
import {
  AlertesNumerotation,
  PlagesAttribuees,
  RegistreNumeros,
  type AttributionPlage,
  type EntreeRegistre,
  type ResultatAttribution,
  type ResultatReservation,
  type StockageNumerotation,
} from "./ports";
import { porteeDe, type GenreNumero, type Plage } from "./regles";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports de la numérotation (AM-161). Tables : `plage_attribuee`,
 * `numero_vu` et `alerte_sync` (migrations « modules_metier » et « modules_metier_garanties »).
 *
 * Les garanties ne reposent pas sur le code seul :
 * - `numero_vu` a pour clé primaire (portée, jour, genre, numéro) : un numéro ne peut pas être pris
 *   deux fois, même si deux requêtes se croisent ;
 * - `plage_attribuee` a une contrainte d'exclusion : deux plages en cours d'une même portée ne se
 *   recouvrent pas ; le code verrouille la portée pour répondre proprement (409 qui nomme l'appareil
 *   en conflit) au lieu de laisser la base lever l'erreur.
 */

/** Espace de noms des verrous consultatifs de la numérotation (le journal d'audit prend 7 017 001). */
const VERROU_NUMEROTATION = 7_017_161;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Prisma.TransactionClient;

/** Verrou valable jusqu'à la fin de la transaction : sérialise les écritures d'une même clé. */
async function verrouiller(tx: Tx, cle: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_NUMEROTATION}::int, hashtext(${cle}))`;
}

/** Vrai si l'erreur (ou sa cause) porte ce code SQLSTATE : le pilote la remonte de façons variées. */
function estErreurSql(e: unknown, sqlstate: string): boolean {
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, profondeur: number): boolean => {
    if (v === null || typeof v !== "object" || profondeur > 6 || vus.has(v)) return false;
    vus.add(v);
    const o = v as Record<string, unknown>;
    if (o["code"] === sqlstate || o["originalCode"] === sqlstate) return true;
    return Object.values(o).some((x) => parcourir(x, profondeur + 1));
  };
  return parcourir(e, 0) || (e instanceof Error && e.message.includes(sqlstate));
}

/* ------------------------------------------------------------------ plages */

type LignePlage = Prisma.PlageAttribueeGetPayload<object>;

function versAttribution(l: LignePlage): AttributionPlage {
  return {
    appareilId: l.appareilId,
    genre: l.genre as AttributionPlage["genre"],
    rang: l.rang,
    nbConvoyeurs: l.nbConvoyeurs,
    plage: { debut: l.plageDebut, fin: l.plageFin },
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    titulaire:
      l.titulaireId !== null && l.titulaireNom !== null
        ? { id: l.titulaireId, nom: l.titulaireNom }
        : null,
    attribueeA: versIsoDouala(l.attribueeA),
    attribueePar: l.attribueePar,
    libereeA: l.libereeA ? versIsoDouala(l.libereeA) : null,
  };
}

/** La demande décrit-elle exactement l'attribution en cours ? (rejouer une demande ne change rien) */
function memeAttribution(l: LignePlage, a: AttributionPlage): boolean {
  return (
    l.genre === a.genre &&
    l.rang === a.rang &&
    l.nbConvoyeurs === a.nbConvoyeurs &&
    l.plageDebut === a.plage.debut &&
    l.plageFin === a.plage.fin &&
    l.gareId === a.gareId &&
    l.compagnieId === a.compagnieId &&
    (l.titulaireId ?? null) === (a.titulaire?.id ?? null) &&
    (l.titulaireNom ?? null) === (a.titulaire?.nom ?? null)
  );
}

function exigerUuid(valeur: string | null, nom: string): void {
  if (valeur !== null && !UUID.test(valeur)) throw new PlageInvalide(`${nom} invalide : ${valeur}`);
}

@Injectable()
export class PlagesAttribueesPrisma extends PlagesAttribuees implements StockageNumerotation {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(appareilId: string): Promise<AttributionPlage | null> {
    const l = await this.prisma.plageAttribuee.findFirst({
      where: { appareilId, libereeA: null },
    });
    return l ? versAttribution(l) : null;
  }

  async lister(
    filtre: { gareId?: string | null; compagnieId?: string | null } = {},
  ): Promise<AttributionPlage[]> {
    const lignes = await this.prisma.plageAttribuee.findMany({
      where: {
        libereeA: null,
        ...(filtre.gareId !== undefined ? { gareId: filtre.gareId } : {}),
        ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
      },
      orderBy: { id: "asc" },
    });
    return lignes.map(versAttribution);
  }

  async attribuer(attribution: AttributionPlage): Promise<ResultatAttribution> {
    exigerUuid(attribution.gareId, "Identifiant de gare");
    exigerUuid(attribution.compagnieId, "Identifiant de compagnie");
    exigerUuid(attribution.attribueePar, "Identifiant de l'auteur");
    const portee = porteeDe(attribution);
    const { debut, fin } = attribution.plage;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Tout ce qui touche la même portée passe l'un après l'autre : la vérification du
        // chevauchement et l'écriture ne peuvent pas être séparées par une autre attribution.
        await verrouiller(tx, `plage:${portee}`);
        const conflit = await tx.plageAttribuee.findFirst({
          where: {
            portee,
            libereeA: null,
            appareilId: { not: attribution.appareilId },
            plageDebut: { lte: fin },
            plageFin: { gte: debut },
          },
          orderBy: { id: "asc" },
        });
        if (conflit) return { ok: false, enConflitAvec: versAttribution(conflit) };

        const courante = await tx.plageAttribuee.findFirst({
          where: { appareilId: attribution.appareilId, libereeA: null },
        });
        if (courante && memeAttribution(courante, attribution)) {
          return { ok: true, attribution: versAttribution(courante) };
        }
        const attribueeA = new Date(attribution.attribueeA);
        if (courante) {
          // L'attribution remplacée garde sa ligne, libérée à l'instant du remplacement.
          await tx.plageAttribuee.update({
            where: { id: courante.id },
            data: { libereeA: attribueeA > courante.attribueeA ? attribueeA : courante.attribueeA },
          });
        }
        const creee = await tx.plageAttribuee.create({
          data: {
            appareilId: attribution.appareilId,
            genre: attribution.genre,
            rang: attribution.rang,
            nbConvoyeurs: attribution.nbConvoyeurs,
            plageDebut: debut,
            plageFin: fin,
            compagnieId: attribution.compagnieId,
            gareId: attribution.gareId,
            portee,
            titulaireId: attribution.titulaire?.id ?? null,
            titulaireNom: attribution.titulaire?.nom ?? null,
            attribueeA,
            attribueePar: attribution.attribueePar,
            libereeA: null,
          },
        });
        return { ok: true, attribution: versAttribution(creee) };
      });
    } catch (e) {
      // Filet : la contrainte d'exclusion a refusé une écriture que le verrou n'avait pas vue
      // (autre application écrivant dans la table). On répond comme pour un chevauchement détecté.
      if (estErreurSql(e, "23P01")) {
        const conflit = await this.prisma.plageAttribuee.findFirst({
          where: {
            portee,
            libereeA: null,
            appareilId: { not: attribution.appareilId },
            plageDebut: { lte: fin },
            plageFin: { gte: debut },
          },
          orderBy: { id: "asc" },
        });
        if (conflit) return { ok: false, enConflitAvec: versAttribution(conflit) };
      }
      // Une gare ou une compagnie qui n'existe pas (clé étrangère) est une demande incohérente.
      if (estErreurSql(e, "23503") || estErreurSql(e, "P2003")) {
        throw new PlageInvalide("Gare ou compagnie inconnue");
      }
      throw e;
    }
  }

  async liberer(appareilId: string, libereeA: string): Promise<AttributionPlage | null> {
    return this.prisma.$transaction(async (tx) => {
      const courante = await tx.plageAttribuee.findFirst({ where: { appareilId, libereeA: null } });
      if (!courante) return null;
      const instant = new Date(libereeA);
      const liberee = await tx.plageAttribuee.update({
        where: { id: courante.id },
        data: { libereeA: instant > courante.attribueeA ? instant : courante.attribueeA },
      });
      return versAttribution(liberee);
    });
  }
}

/* ------------------------------------------------------------------ registre des numéros */

type LigneRegistre = Prisma.NumeroVuGetPayload<object>;

function versEntree(l: LigneRegistre): EntreeRegistre {
  return {
    portee: l.portee,
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    appareilId: l.appareilId,
    jour: l.jour,
    genre: l.genre as GenreNumero,
    numero: l.numero,
    evenementId: l.evenementId,
    recuA: versIsoDouala(l.recuA),
  };
}

const versLigne = (e: EntreeRegistre): Prisma.NumeroVuCreateManyInput => ({
  portee: e.portee,
  jour: e.jour,
  genre: e.genre,
  numero: e.numero,
  appareilId: e.appareilId,
  evenementId: e.evenementId,
  gareId: e.gareId,
  compagnieId: e.compagnieId,
  recuA: new Date(e.recuA),
});

/** Prises concurrentes d'un même numéro par un appareil et par le serveur : on réessaie avec le suivant. */
const ESSAIS_MAX = 5;

@Injectable()
export class RegistreNumerosPrisma extends RegistreNumeros implements StockageNumerotation {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async reserver(entree: EntreeRegistre): Promise<ResultatReservation> {
    // INSERT … ON CONFLICT DO NOTHING : la clé primaire départage, sans verrou.
    const { count } = await this.prisma.numeroVu.createMany({
      data: [versLigne(entree)],
      skipDuplicates: true,
    });
    if (count === 1) return { statut: "reserve" };
    const existante = await this.prisma.numeroVu.findUnique({
      where: {
        portee_jour_genre_numero: {
          portee: entree.portee,
          jour: entree.jour,
          genre: entree.genre,
          numero: entree.numero,
        },
      },
    });
    if (!existante) return { statut: "reserve" }; // impossible : le registre est en ajout seul
    return existante.evenementId === entree.evenementId
      ? { statut: "rejeu" }
      : { statut: "doublon", evenementIdExistant: existante.evenementId };
  }

  async prendreSuivant(
    demande: Omit<EntreeRegistre, "numero"> & { plage: Plage },
  ): Promise<{ numero: number; nouveau: boolean } | null> {
    const { plage, ...base } = demande;
    // Les prises du serveur d'une même portée, d'un même jour et d'un même genre se font l'une après
    // l'autre : le numéro choisi est le plus petit libre, et le billet écrit dans la même
    // transaction par l'appelant ne laisse pas de trou.
    return this.prisma.$transaction(async (tx) => {
      await verrouiller(tx, `suivant:${base.portee}|${base.jour}|${base.genre}`);
      const reference = await tx.numeroVu.findFirst({
        where: {
          portee: base.portee,
          jour: base.jour,
          genre: base.genre,
          appareilId: base.appareilId,
          evenementId: base.evenementId,
        },
      });
      if (reference) return { numero: reference.numero, nouveau: false };

      for (let essai = 0; essai < ESSAIS_MAX; essai++) {
        const numero = await this.plusPetitLibre(tx, base, plage);
        if (numero === null) return null;
        const { count } = await tx.numeroVu.createMany({
          data: [versLigne({ ...base, numero })],
          skipDuplicates: true,
        });
        if (count === 1) return { numero, nouveau: true };
        // Un appareil a sorti ce numéro entre la lecture et l'écriture : on prend le suivant libre.
      }
      return null;
    });
  }

  async entrees(portee: string, jour: string, genre: GenreNumero): Promise<EntreeRegistre[]> {
    const lignes = await this.prisma.numeroVu.findMany({
      where: { portee, jour, genre },
      orderBy: { numero: "asc" },
    });
    return lignes.map(versEntree);
  }

  async duJour(jour: string): Promise<EntreeRegistre[]> {
    const lignes = await this.prisma.numeroVu.findMany({
      where: { jour },
      orderBy: [{ portee: "asc" }, { genre: "asc" }, { numero: "asc" }],
    });
    return lignes.map(versEntree);
  }

  /** Le plus petit numéro de la plage qui n'est pas au registre ; `null` si elle est épuisée. */
  private async plusPetitLibre(
    tx: Tx,
    cle: Pick<EntreeRegistre, "portee" | "jour" | "genre">,
    plage: Plage,
  ): Promise<number | null> {
    // Candidats : le début de la plage, et chaque numéro pris + 1. Le plus petit candidat libre est
    // le plus petit numéro libre de la plage (parcours de l'index de la clé primaire).
    const lignes = await tx.$queryRaw<{ numero: number }[]>`
      SELECT c.n AS numero
      FROM (
        SELECT ${plage.debut}::int AS n
        UNION
        SELECT v.numero + 1
        FROM numero_vu v
        WHERE v.portee = ${cle.portee} AND v.jour = ${cle.jour} AND v.genre = ${cle.genre}
          AND v.numero BETWEEN ${plage.debut}::int AND ${plage.fin}::int
      ) c
      WHERE c.n BETWEEN ${plage.debut}::int AND ${plage.fin}::int
        AND NOT EXISTS (
          SELECT 1 FROM numero_vu w
          WHERE w.portee = ${cle.portee} AND w.jour = ${cle.jour} AND w.genre = ${cle.genre}
            AND w.numero = c.n
        )
      ORDER BY c.n
      LIMIT 1`;
    return lignes[0]?.numero ?? null;
  }
}

/* ------------------------------------------------------------------ alertes */

type LigneAlerte = Prisma.AlerteSyncGetPayload<object>;

function versAlerte(l: LigneAlerte): AlerteSync {
  return {
    id: l.id,
    type: l.type as TypeAlerte,
    gravite: l.gravite as AlerteSync["gravite"],
    creeeA: versIsoDouala(l.creeA),
    appareilId: l.appareilId,
    auteurId: l.auteurId,
    evenementId: l.evenementId,
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    details: (l.details ?? {}) as Record<string, unknown>,
    resolueA: l.resolueA ? versIsoDouala(l.resolueA) : null,
  };
}

@Injectable()
export class AlertesNumerotationPrisma extends AlertesNumerotation implements StockageNumerotation {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enregistrer(alerte: AlerteSync): Promise<void> {
    const donnees = {
      type: alerte.type,
      gravite: alerte.gravite,
      creeA: new Date(alerte.creeeA),
      appareilId: alerte.appareilId,
      auteurId: alerte.auteurId,
      evenementId: alerte.evenementId,
      gareId: alerte.gareId,
      compagnieId: alerte.compagnieId,
      details: alerte.details as Prisma.InputJsonObject,
      resolueA: alerte.resolueA ? new Date(alerte.resolueA) : null,
    };
    await this.prisma.alerteSync.upsert({
      where: { id: alerte.id },
      create: { id: alerte.id, ...donnees },
      update: donnees,
    });
  }

  async lister(filtre: {
    gareId?: string | null;
    compagnieId?: string | null;
    jour?: string;
    ouvertesSeulement?: boolean;
  }): Promise<AlerteSync[]> {
    const lignes = await this.prisma.alerteSync.findMany({
      where: {
        // Les alertes de numérotation et celles de la synchronisation partagent la table : ici,
        // seulement les trous (le jour est dans le détail).
        type: "trou_dans_la_plage",
        ...(filtre.gareId !== undefined ? { gareId: filtre.gareId } : {}),
        ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
        ...(filtre.jour !== undefined ? { details: { path: ["jour"], equals: filtre.jour } } : {}),
        ...(filtre.ouvertesSeulement ? { resolueA: null } : {}),
      },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versAlerte);
  }

  async resoudre(id: string, resolueA: string): Promise<void> {
    await this.prisma.alerteSync.updateMany({
      where: { id, resolueA: null },
      data: { resolueA: new Date(resolueA) },
    });
  }
}
