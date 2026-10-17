import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type { StockageSync } from "./memoire";
import {
  AlertesSync,
  AppareilsSync,
  JournalSync,
  ProvisionnementSync,
  SiegesSync,
  type AlerteSync,
  type AppareilSync,
  type ConflitStocke,
  type EntreeJournal,
  type NouvelAppareil,
  type Octroi,
  type TypeAlerte,
} from "./ports";
import type { CleJwk } from "./signature";
import type { OperationSiege } from "./sieges";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports de la synchronisation (AM-160). Tables : `appareil_sync`,
 * `journal_evenement`, `siege_operation`, `siege_billet`, `siege_conflit`, `alerte_sync` (migrations
 * « modules_metier » et « modules_metier_garanties »).
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **idempotence par UUID d'événement** : `journal_evenement.id` est unique, l'écriture est un
 *   `INSERT … ON CONFLICT (id) DO NOTHING RETURNING seq` : deux requêtes qui portent le même
 *   événement, même exactement au même instant, n'écrivent qu'une ligne et une seule reçoit `seq` ;
 * - **gestes sur les sièges** : clé primaire `(departId, siege, evenementId)` de `siege_operation`,
 *   même mécanisme (`ON CONFLICT DO NOTHING`, le nombre de lignes écrites dit qui a gagné) ;
 * - **conflits** : clé primaire `evenementId` de `siege_conflit` ; `enregistrerConflit` et
 *   `leverConflit` disent si l'appel a changé quelque chose, pour qu'un rejeu concurrent n'écrive
 *   ni alerte ni événement en double ;
 * - **ajout seul** : `journal_evenement` et `siege_operation` refusent UPDATE, DELETE et TRUNCATE
 *   (déclencheurs de la migration « garanties »).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gare ou compagnie qui n'existe pas (clé étrangère) : la fiche d'appareil est incohérente. */
export class AppareilInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppareilInvalide";
  }
}

/** Vrai si l'erreur (ou sa cause) porte ce code SQLSTATE ou ce code Prisma. */
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

const iso = (d: Date): string => versIsoDouala(d);
const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

/* ------------------------------------------------------------------ appareils */

type LigneAppareil = Prisma.AppareilSyncGetPayload<object>;

function versAppareil(l: LigneAppareil): AppareilSync {
  return {
    id: l.id,
    cle: (l.clePublique as CleJwk | null) ?? null,
    genre: l.genre as AppareilSync["genre"],
    rang: l.rang,
    nbConvoyeurs: l.nbConvoyeurs,
    plage:
      l.plageDebut !== null && l.plageFin !== null
        ? { debut: l.plageDebut, fin: l.plageFin }
        : null,
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    derniereSyncA: l.derniereSyncA ? iso(l.derniereSyncA) : null,
    dernierOrdre: l.dernierOrdre,
    octroi: (l.octroi as Octroi | null) ?? null,
    retire: l.retire,
  };
}

/** Les seuls champs fournis : une clé absente (ou `undefined`) ne touche pas la colonne. */
function donneesAppareil(
  c: Partial<Omit<AppareilSync, "id">>,
): Prisma.AppareilSyncUncheckedUpdateInput {
  const d: Prisma.AppareilSyncUncheckedUpdateInput = {};
  if (c.cle !== undefined) d.clePublique = c.cle === null ? Prisma.DbNull : json(c.cle);
  if (c.genre !== undefined) d.genre = c.genre;
  if (c.rang !== undefined) d.rang = c.rang;
  if (c.nbConvoyeurs !== undefined) d.nbConvoyeurs = c.nbConvoyeurs;
  if (c.plage !== undefined) {
    d.plageDebut = c.plage?.debut ?? null;
    d.plageFin = c.plage?.fin ?? null;
  }
  if (c.gareId !== undefined) d.gareId = c.gareId;
  if (c.compagnieId !== undefined) d.compagnieId = c.compagnieId;
  if (c.derniereSyncA !== undefined) {
    d.derniereSyncA = c.derniereSyncA === null ? null : new Date(c.derniereSyncA);
  }
  if (c.dernierOrdre !== undefined) d.dernierOrdre = c.dernierOrdre;
  if (c.octroi !== undefined) d.octroi = c.octroi === null ? Prisma.DbNull : json(c.octroi);
  if (c.retire !== undefined) d.retire = c.retire;
  return d;
}

@Injectable()
export class AppareilsSyncPrisma extends AppareilsSync implements StockageSync {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(id: string): Promise<AppareilSync | null> {
    const l = await this.prisma.appareilSync.findUnique({ where: { id } });
    return l ? versAppareil(l) : null;
  }

  async declarer(appareil: NouvelAppareil): Promise<AppareilSync> {
    const { id, ...reste } = appareil;
    const donnees = donneesAppareil(reste);
    try {
      // Une seule requête (INSERT … ON CONFLICT DO UPDATE) : créer ou compléter sans écraser ce qui
      // n'est pas donné.
      await this.prisma.appareilSync.upsert({
        where: { id },
        create: { id, genre: "autre", ...donnees } as Prisma.AppareilSyncUncheckedCreateInput,
        update: donnees,
      });
    } catch (e) {
      if (porteCode(e, "P2003") || porteCode(e, "23503")) {
        throw new AppareilInvalide("Gare ou compagnie inconnue");
      }
      if (porteCode(e, "23514")) throw new AppareilInvalide("Fiche d'appareil incohérente");
      throw e;
    }
    return (await this.trouver(id))!;
  }

  async enregistrerCle(id: string, cle: CleJwk): Promise<void> {
    await this.prisma.appareilSync.updateMany({ where: { id }, data: { clePublique: json(cle) } });
  }

  async mettreAJour(
    id: string,
    changement: Parameters<AppareilsSync["mettreAJour"]>[1],
  ): Promise<void> {
    await this.prisma.appareilSync.updateMany({ where: { id }, data: donneesAppareil(changement) });
  }
}

/* ------------------------------------------------------------------ journal */

type LigneJournal = Prisma.JournalEvenementGetPayload<object>;

function versEntree(l: LigneJournal): EntreeJournal {
  return {
    seq: Number(l.seq),
    evenement: {
      id: l.id,
      type: l.type,
      at: l.atTexte ?? iso(l.at),
      appareilId: l.appareilId,
      auteurId: l.auteurId,
      cible: { type: l.cibleType, id: l.cibleId },
      numeroPlage: l.numeroPlage,
      donnees: (l.donnees ?? {}) as Record<string, unknown>,
    },
    recuA: iso(l.recuA),
    ordreAppareil: l.ordreAppareil,
    origine: l.origine as EntreeJournal["origine"],
  };
}

@Injectable()
export class JournalSyncPrisma extends JournalSync implements StockageSync {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async existe(id: string): Promise<boolean> {
    // Un identifiant mal formé (événement rejeté pour cette raison) n'est jamais au journal.
    if (!UUID.test(id)) return false;
    return (await this.prisma.journalEvenement.count({ where: { id } })) > 0;
  }

  async ajouter(entree: Omit<EntreeJournal, "seq">): Promise<EntreeJournal | null> {
    const e = entree.evenement;
    const lignes = await this.prisma.$queryRaw<{ seq: bigint }[]>`
      INSERT INTO journal_evenement
        (id, type, at, "atTexte", "appareilId", "auteurId", "cibleType", "cibleId", "numeroPlage",
         donnees, "recuA", "ordreAppareil", origine)
      VALUES
        (${e.id}::uuid, ${e.type}, ${new Date(e.at)}::timestamptz, ${e.at}, ${e.appareilId},
         ${e.auteurId}, ${e.cible.type}, ${e.cible.id}, ${e.numeroPlage}::int,
         ${JSON.stringify(e.donnees)}::jsonb, ${new Date(entree.recuA)}::timestamptz,
         ${entree.ordreAppareil}::int, ${entree.origine})
      ON CONFLICT (id) DO NOTHING
      RETURNING seq`;
    const seq = lignes[0]?.seq;
    if (seq === undefined) return null;
    return {
      ...entree,
      evenement: { ...e, donnees: structuredClone(e.donnees) },
      seq: Number(seq),
    };
  }

  async lister(
    filtre: { appareilId?: string; type?: string; depuisSeq?: number } = {},
  ): Promise<EntreeJournal[]> {
    const lignes = await this.prisma.journalEvenement.findMany({
      where: {
        ...(filtre.appareilId !== undefined ? { appareilId: filtre.appareilId } : {}),
        ...(filtre.type !== undefined ? { type: filtre.type } : {}),
        ...(filtre.depuisSeq !== undefined ? { seq: { gt: BigInt(filtre.depuisSeq) } } : {}),
      },
      orderBy: { seq: "asc" },
    });
    return lignes.map(versEntree);
  }
}

/* ------------------------------------------------------------------ sièges et conflits */

type LigneConflit = Prisma.SiegeConflitGetPayload<object>;

function versConflit(l: LigneConflit): ConflitStocke {
  return {
    evenementId: l.evenementId,
    billetId: l.billetId,
    departId: l.departId,
    siege: l.siege,
    gagnantBilletId: l.gagnantBilletId,
    appareilId: l.appareilId,
    auteurId: l.auteurId,
    detecteA: iso(l.detecteA),
  };
}

@Injectable()
export class SiegesSyncPrisma extends SiegesSync implements StockageSync {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouterOperation(
    departId: string,
    siege: number,
    operation: OperationSiege,
  ): Promise<boolean> {
    // La clé primaire (départ, siège, événement) départage : un seul des appels simultanés écrit.
    const { count } = await this.prisma.siegeOperation.createMany({
      data: [
        {
          departId,
          siege,
          evenementId: operation.evenementId,
          billetId: operation.billetId,
          kind: operation.kind,
          at: new Date(operation.at),
          appareilId: operation.appareilId,
          auteurId: operation.auteurId,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async operations(departId: string, siege: number): Promise<OperationSiege[]> {
    const lignes = await this.prisma.siegeOperation.findMany({
      where: { departId, siege },
      orderBy: [{ at: "asc" }, { appareilId: "asc" }, { evenementId: "asc" }],
    });
    return lignes.map((l) => ({
      evenementId: l.evenementId,
      billetId: l.billetId,
      kind: l.kind as OperationSiege["kind"],
      at: l.at.getTime(),
      appareilId: l.appareilId,
      auteurId: l.auteurId,
    }));
  }

  async billet(billetId: string): Promise<{ departId: string; siege: number } | null> {
    const l = await this.prisma.siegeBillet.findUnique({ where: { billetId } });
    return l ? { departId: l.departId, siege: l.siege } : null;
  }

  async definirBillet(billetId: string, departId: string, siege: number): Promise<void> {
    await this.prisma.siegeBillet.upsert({
      where: { billetId },
      create: { billetId, departId, siege },
      update: { departId, siege },
    });
  }

  async conflit(evenementId: string): Promise<ConflitStocke | null> {
    if (!UUID.test(evenementId)) return null;
    const l = await this.prisma.siegeConflit.findUnique({ where: { evenementId } });
    return l ? versConflit(l) : null;
  }

  async conflitsDuSiege(departId: string, siege: number): Promise<ConflitStocke[]> {
    const lignes = await this.prisma.siegeConflit.findMany({
      where: { departId, siege },
      orderBy: [{ detecteA: "asc" }, { evenementId: "asc" }],
    });
    return lignes.map(versConflit);
  }

  async enregistrerConflit(conflit: ConflitStocke): Promise<boolean> {
    const donnees = {
      billetId: conflit.billetId,
      departId: conflit.departId,
      siege: conflit.siege,
      gagnantBilletId: conflit.gagnantBilletId,
      appareilId: conflit.appareilId,
      auteurId: conflit.auteurId,
      detecteA: new Date(conflit.detecteA),
    };
    // `xmax = 0` : la ligne vient d'être insérée (et non mise à jour par le conflit).
    const lignes = await this.prisma.$queryRaw<{ nouveau: boolean }[]>`
      INSERT INTO siege_conflit
        ("evenementId", "billetId", "departId", siege, "gagnantBilletId", "appareilId", "auteurId", "detecteA")
      VALUES
        (${conflit.evenementId}::uuid, ${donnees.billetId}, ${donnees.departId}, ${donnees.siege}::int,
         ${donnees.gagnantBilletId}, ${donnees.appareilId}, ${donnees.auteurId},
         ${donnees.detecteA}::timestamptz)
      ON CONFLICT ("evenementId") DO UPDATE SET
        "billetId" = EXCLUDED."billetId", "departId" = EXCLUDED."departId", siege = EXCLUDED.siege,
        "gagnantBilletId" = EXCLUDED."gagnantBilletId", "appareilId" = EXCLUDED."appareilId",
        "auteurId" = EXCLUDED."auteurId", "detecteA" = EXCLUDED."detecteA"
      RETURNING (xmax = 0) AS nouveau`;
    return lignes[0]?.nouveau === true;
  }

  async leverConflit(evenementId: string): Promise<boolean> {
    if (!UUID.test(evenementId)) return false;
    // DELETE … : un seul des appels simultanés supprime la ligne.
    const { count } = await this.prisma.siegeConflit.deleteMany({ where: { evenementId } });
    return count > 0;
  }

  async conflitsDeAppareil(appareilId: string, depuisIso: string): Promise<ConflitStocke[]> {
    const lignes = await this.prisma.siegeConflit.findMany({
      where: { appareilId, detecteA: { gte: new Date(depuisIso) } },
      orderBy: [{ detecteA: "asc" }, { evenementId: "asc" }],
    });
    return lignes.map(versConflit);
  }
}

/* ------------------------------------------------------------------ alertes */

type LigneAlerte = Prisma.AlerteSyncGetPayload<object>;

/** Où l'on garde un identifiant d'événement qui n'est pas un UUID (événement rejeté pour cela). */
const CLE_ID_BRUT = "_evenementIdBrut";

function versAlerte(l: LigneAlerte): AlerteSync {
  const { [CLE_ID_BRUT]: brut, ...details } = (l.details ?? {}) as Record<string, unknown>;
  return {
    id: l.id,
    type: l.type as TypeAlerte,
    gravite: l.gravite as AlerteSync["gravite"],
    creeeA: iso(l.creeA),
    appareilId: l.appareilId,
    auteurId: l.auteurId,
    evenementId: l.evenementId ?? (typeof brut === "string" ? brut : null),
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    details,
    resolueA: l.resolueA ? iso(l.resolueA) : null,
  };
}

@Injectable()
export class AlertesSyncPrisma extends AlertesSync implements StockageSync {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(alerte: AlerteSync): Promise<void> {
    // Un événement refusé parce que son `id` n'est pas un UUID doit quand même être signalé : la
    // colonne est un UUID, l'identifiant brut est donc gardé dans le détail.
    const idValide = alerte.evenementId !== null && UUID.test(alerte.evenementId);
    const details =
      alerte.evenementId !== null && !idValide
        ? { ...alerte.details, [CLE_ID_BRUT]: alerte.evenementId }
        : alerte.details;
    await this.prisma.alerteSync.createMany({
      data: [
        {
          id: alerte.id,
          type: alerte.type,
          gravite: alerte.gravite,
          creeA: new Date(alerte.creeeA),
          appareilId: alerte.appareilId,
          auteurId: alerte.auteurId,
          evenementId: idValide ? alerte.evenementId : null,
          gareId: alerte.gareId,
          compagnieId: alerte.compagnieId,
          details: json(details) as Prisma.InputJsonObject,
          resolueA: alerte.resolueA ? new Date(alerte.resolueA) : null,
        },
      ],
      skipDuplicates: true,
    });
  }

  async lister(filtre: {
    gareId?: string | null;
    compagnieId?: string | null;
    ouvertesSeulement?: boolean;
  }): Promise<AlerteSync[]> {
    const lignes = await this.prisma.alerteSync.findMany({
      where: {
        ...(filtre.gareId !== undefined ? { gareId: filtre.gareId } : {}),
        ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
        ...(filtre.ouvertesSeulement ? { resolueA: null } : {}),
      },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versAlerte);
  }
}

/* ------------------------------------------------------------------ provisionnement */

/**
 * Ce que l'appareil reçoit pour travailler hors ligne. **Aucune source de données n'existe encore**
 * pour ces deux listes, il n'y a donc rien à lire en base :
 * - les parts de sièges hors ligne dépendent d'une règle de répartition entre guichets qui n'est pas
 *   décidée ;
 * - les vérificateurs de PIN des superviseurs demandent un secret dérivé pour l'appareil (PBKDF2)
 *   que le serveur ne peut pas tirer de `personne.pinHache` (argon2id avec poivre, côté serveur
 *   seulement) : il faut le calculer quand le superviseur choisit son PIN.
 * Réponse honnête en attendant : des listes vides. L'appareil continue de vendre sur sa plage de
 * numéros ; il ne peut simplement pas valider un déblocage sur place.
 */
@Injectable()
export class ProvisionnementVide extends ProvisionnementSync implements StockageSync {
  /** Rien n'est conservé : il n'y a rien à perdre au redémarrage. */
  readonly durable = true;

  async partsHorsLigne(): Promise<Record<string, number[]>> {
    return {};
  }

  async verificateursPin(): Promise<
    { superviseurId: string; sel: string; iterations: number; hache: string }[]
  > {
    return [];
  }
}
