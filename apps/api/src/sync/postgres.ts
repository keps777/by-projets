import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { Horloge } from "../socle/horloge";
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
import { repartirParts, reserveEnLigne } from "./regles";
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

/** Départs dont un téléphone reçoit la part : encore vendables, partis depuis moins d'une semaine ou dans les 48 h. */
const ETATS_AVEC_PART = ["en_vente", "embarquement"];
const PASSE_MAX_MS = 7 * 24 * 3_600_000;
const FUTUR_MAX_MS = 48 * 3_600_000;
const DEPARTS_MAX = 40;

/**
 * Ce que l'appareil reçoit pour travailler hors ligne (A7).
 *
 * **Parts de sièges.** Un téléphone de guichet ne vend sans réseau que dans sa part du plan du bus. La part suit le
 * **rang du guichet** (1 à 3) et non le téléphone : un téléphone de secours reprend la part de celui qu'il remplace.
 * Pour chaque départ vendable de la gare du téléphone (état `en_vente` ou `embarquement`, bus affecté, parti depuis
 * moins de 7 jours ou dans les 48 h, 40 au plus) :
 *
 * 1. à la première demande, le bus est réparti entre **tous les guichets de la gare** (`guichet`, un bloc de sièges
 *    contigus chacun, 15 % des derniers sièges gardés pour la vente connectée : `repartirParts`) et la répartition
 *    est **figée** dans `part_hors_ligne` (`INSERT … ON CONFLICT DO NOTHING` : deux synchronisations simultanées
 *    s'entendent). Un téléphone qui a déjà vendu ne voit donc jamais sa part changer sous lui ;
 * 2. à chaque synchronisation, le téléphone reçoit sa part **moins les sièges devenus indisponibles** depuis :
 *    occupés par un billet (vente en ligne, autre guichet, siège pris par un autre téléphone) ou retenus par une
 *    commande en cours. C'est la « reprise » : un siège pris ailleurs sort de la part. À l'inverse un siège libéré
 *    (absent au quai, billet annulé) y revient : c'est la « libération ». Ses propres ventes en attente n'y figurent
 *    plus non plus, le téléphone les retranche de lui-même (`siegesPris`) ;
 * 3. la réponse REMPLACE la part de chaque départ cité (une liste vide dit « plus rien à vendre sans réseau ») ; un
 *    départ qui n'est plus cité (parti, annulé, fermé) n'est plus vendable.
 *
 * **Vérificateurs de PIN.** Toujours vides : ils demandent un secret dérivé pour l'appareil (PBKDF2) que le serveur ne
 * peut pas tirer de `personne.pinHache` (argon2id avec poivre, côté serveur seulement). Il faut le calculer quand le
 * superviseur choisit son PIN. L'appareil continue de vendre ; il ne peut simplement pas valider un déblocage sur
 * place.
 */
@Injectable()
export class ProvisionnementPrisma extends ProvisionnementSync implements StockageSync {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly horloge: Horloge,
  ) {
    super();
  }

  async partsHorsLigne(appareil: AppareilSync): Promise<Record<string, number[]>> {
    if (appareil.genre !== "guichet" || appareil.retire) return {};
    const { rang, gareId } = appareil;
    if (rang === null || !gareId || !UUID.test(gareId)) return {};

    const maintenant = this.horloge.maintenant();
    const departs = await this.prisma.$queryRaw<{ id: string; capacite: number }[]>`
      SELECT d.id::text AS id, b.capacite
      FROM depart d
        JOIN ligne l ON l.id = d."ligneId"
        JOIN bus b ON b.id = d."busId"
      WHERE l."origineGareId" = ${gareId}::uuid
        AND d.etat::text = ANY(${ETATS_AVEC_PART}::text[])
        AND d."heureDepart" >= ${new Date(maintenant.getTime() - PASSE_MAX_MS)}
        AND d."heureDepart" <= ${new Date(maintenant.getTime() + FUTUR_MAX_MS)}
      ORDER BY d."heureDepart", d.id
      LIMIT ${DEPARTS_MAX}`;
    if (departs.length === 0) return {};
    const ids = departs.map((d) => d.id);

    let parts = await this.prisma.partHorsLigne.findMany({ where: { departId: { in: ids } } });
    const sansPart = departs.filter((d) => !parts.some((p) => p.departId === d.id));
    if (sansPart.length > 0) {
      const guichets = await this.prisma.$queryRaw<{ rang: number }[]>`
        SELECT rang FROM guichet WHERE "gareId" = ${gareId}::uuid ORDER BY rang`;
      const rangs = guichets.map((g) => g.rang);
      const lignes = sansPart.flatMap((d) => {
        if (rangs.length === 0 || d.capacite < 2) return [];
        const reparties = repartirParts(d.capacite, rangs.length, reserveEnLigne(d.capacite));
        return rangs.map((r, i) => ({ departId: d.id, rang: r, sieges: reparties[i]! }));
      });
      if (lignes.length > 0) {
        await this.prisma.partHorsLigne.createMany({ data: lignes, skipDuplicates: true });
        // Relue : si une autre synchronisation a figé la répartition la première, c'est la sienne qui vaut.
        parts = await this.prisma.partHorsLigne.findMany({ where: { departId: { in: ids } } });
      }
    }

    const indisponibles = await this.prisma.$queryRaw<{ departId: string; siege: number }[]>`
      SELECT "departId"::text AS "departId", siege
      FROM siege_depart
      WHERE "departId" = ANY(${ids}::uuid[])
        AND ("billetId" IS NOT NULL OR "bloqueJusqua" > ${maintenant})`;
    const pris = new Map<string, Set<number>>();
    for (const l of indisponibles) {
      const deja = pris.get(l.departId) ?? new Set<number>();
      deja.add(l.siege);
      pris.set(l.departId, deja);
    }

    const resultat: Record<string, number[]> = {};
    for (const d of departs) {
      const ma = parts.find((p) => p.departId === d.id && p.rang === rang);
      if (!ma) continue;
      const occupes = pris.get(d.id);
      resultat[d.id] = ma.sieges.filter((s) => s <= d.capacite && !occupes?.has(s));
    }
    return resultat;
  }

  async verificateursPin(): Promise<
    { superviseurId: string; sel: string; iterations: number; hache: string }[]
  > {
    return [];
  }
}
