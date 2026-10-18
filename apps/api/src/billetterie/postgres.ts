import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { NumerosEnLigneEpuises } from "../numerotation/erreurs";
import { NumerotationService } from "../numerotation/numerotation.service";
import { PlageEpuisee } from "./erreurs";
import type { StockageBilletterie } from "./memoire";
import type {
  Billet,
  Bus,
  Commande,
  Compagnie,
  Depart,
  DepartComplet,
  EvenementTraite,
  Gare,
  Guichet,
  Ligne,
  PlanStocke,
  ScanStocke,
  StatutCommande,
} from "./modeles";
import {
  Billets,
  Catalogue,
  Commandes,
  EvenementsTraites,
  Inventaire,
  NumerotationEnLigne,
  PreferencesVoyageur,
  Scans,
  type BlocageExpire,
  type FiltreDepartsCatalogue,
  type ResultatAjoutBillet,
  type ResultatSiege,
} from "./ports";
import { PLAGE_EN_LIGNE, type EtatBillet, type EtatDepart } from "./regles";
import type { FiltresDeparts } from "./schemas";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports de la billetterie (AM-162). Tables : `compagnie`,
 * `gare`, `guichet`, `ligne`, `arret`, `bus`, `depart`, `billet`, `siege_depart`, `commande`,
 * `scan_quai`, `evenement_traite`, `compagnie_preferee`, `filtres_voyageur`.
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **un siège ne se vend pas deux fois** : la clé primaire `(departId, siege)` de `siege_depart` et
 *   des `INSERT … ON CONFLICT DO UPDATE … WHERE` : la condition (« libre, ou bloqué par moi, ou
 *   bloqué mais échu ») est évaluée par la base sur la ligne verrouillée, jamais « lire puis écrire » ;
 *   en second filet, l'index unique partiel `billet_siege_vivant_unique` ;
 * - **un billet ne se scanne pas deux fois** : `transitionner` est un `UPDATE … WHERE etat = ANY(…)`,
 *   un seul des deux scans simultanés touche la ligne ;
 * - **un événement n'est traité qu'une fois** : clés primaires de `evenement_traite` et `scan_quai`,
 *   `INSERT … ON CONFLICT DO NOTHING` ;
 * - **version du plan** : `depart.versionPlan` est incrémentée dans la même transaction que le siège.
 */

/** Espace de noms des verrous consultatifs de la billetterie (numérotation : 7 017 161). */
const VERROU_BILLETTERIE = 7_017_162;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v: string | null | undefined): v is string =>
  typeof v === "string" && UUID.test(v);

type Tx = Prisma.TransactionClient;

const iso = (d: Date): string => versIsoDouala(d);
const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
const jsonOuNul = (v: unknown) => (v === null ? Prisma.DbNull : json(v));

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

/* ------------------------------------------------------------------ catalogue */

const INCLUSION_DEPART = {
  ligne: {
    include: {
      arrets: { orderBy: { ordre: "asc" } },
      compagnie: true,
      origine: true,
      destination: true,
    },
  },
  bus: true,
  chauffeur: { select: { id: true, nom: true } },
  convoyeur: { select: { id: true, nom: true } },
} satisfies Prisma.DepartInclude;

type LigneDepart = Prisma.DepartGetPayload<{ include: typeof INCLUSION_DEPART }>;

const versGare = (g: {
  id: string;
  compagnieId: string;
  code: string;
  nom: string;
  ville: string;
}): Gare => ({
  id: g.id,
  compagnieId: g.compagnieId,
  code: g.code,
  nom: g.nom,
  ville: g.ville,
});

function versDepart(
  d: Prisma.DepartGetPayload<object>,
  chauffeur: Depart["chauffeur"],
  convoyeur: Depart["convoyeur"],
): Depart {
  return {
    id: d.id,
    numero: d.numero,
    ligneId: d.ligneId,
    busId: d.busId,
    classe: d.classe,
    heureDepart: iso(d.heureDepart),
    etat: d.etat,
    historique: (d.historique ?? []) as unknown as Depart["historique"],
    fusionneDansId: d.fusionneDansId,
    quai: d.quai,
    chauffeur,
    convoyeur,
  };
}

function versDepartComplet(d: LigneDepart): DepartComplet {
  const l = d.ligne;
  const ligne: Ligne = {
    id: l.id,
    compagnieId: l.compagnieId,
    code: l.code,
    origineGareId: l.origineGareId,
    destinationGareId: l.destinationGareId,
    tarifs: { classique: l.tarifClassique, vip: l.tarifVip, bagage: l.tarifBagage },
    dureeMinutes: l.dureeMinutes,
    arrets: l.arrets.map((a) => ({
      id: a.id,
      nom: a.nom,
      ordre: a.ordre,
      kmDepuisOrigine: a.kmDepuisOrigine,
      montee: a.montee,
    })),
  };
  const bus: Bus | null = d.bus
    ? {
        id: d.bus.id,
        compagnieId: d.bus.compagnieId,
        immatriculation: d.bus.immatriculation,
        capacite: d.bus.capacite,
        capaciteSoute: d.bus.capaciteSoute,
        classe: d.bus.classe,
      }
    : null;
  return {
    depart: versDepart(d, d.chauffeur, d.convoyeur),
    ligne,
    compagnie: { id: l.compagnie.id, code: l.compagnie.code, nom: l.compagnie.nom },
    origine: versGare(l.origine),
    destination: versGare(l.destination),
    bus,
  };
}

function donneesDepart(c: Partial<Omit<Depart, "id">>): Prisma.DepartUncheckedUpdateManyInput {
  const d: Prisma.DepartUncheckedUpdateManyInput = {};
  if (c.numero !== undefined) d.numero = c.numero;
  if (c.ligneId !== undefined) d.ligneId = c.ligneId;
  if (c.busId !== undefined) d.busId = c.busId;
  if (c.classe !== undefined) d.classe = c.classe;
  if (c.heureDepart !== undefined) d.heureDepart = new Date(c.heureDepart);
  if (c.etat !== undefined) d.etat = c.etat;
  if (c.historique !== undefined) d.historique = json(c.historique);
  if (c.fusionneDansId !== undefined) d.fusionneDansId = c.fusionneDansId;
  if (c.quai !== undefined) d.quai = c.quai;
  if (c.chauffeur !== undefined) d.chauffeurId = c.chauffeur?.id ?? null;
  if (c.convoyeur !== undefined) d.convoyeurId = c.convoyeur?.id ?? null;
  return d;
}

@Injectable()
export class CataloguePrisma extends Catalogue implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async compagnie(id: string): Promise<Compagnie | null> {
    if (!estUuid(id)) return null;
    const c = await this.prisma.compagnie.findUnique({ where: { id } });
    return c ? { id: c.id, code: c.code, nom: c.nom } : null;
  }

  async gare(id: string): Promise<Gare | null> {
    if (!estUuid(id)) return null;
    const g = await this.prisma.gare.findUnique({ where: { id } });
    return g ? versGare(g) : null;
  }

  async guichet(id: string): Promise<Guichet | null> {
    if (!estUuid(id)) return null;
    const g = await this.prisma.guichet.findUnique({ where: { id } });
    return g ? { id: g.id, gareId: g.gareId, rang: g.rang } : null;
  }

  async ville(code: string): Promise<string | null> {
    const g = await this.prisma.gare.findFirst({ where: { code }, orderBy: { id: "asc" } });
    return g?.ville ?? null;
  }

  async guichetDe(personneId: string): Promise<Guichet | null> {
    if (!estUuid(personneId)) return null;
    const p = await this.prisma.personne.findUnique({
      where: { id: personneId },
      select: { guichet: true },
    });
    return p?.guichet ? { id: p.guichet.id, gareId: p.guichet.gareId, rang: p.guichet.rang } : null;
  }

  async depart(id: string): Promise<DepartComplet | null> {
    if (!estUuid(id)) return null;
    const d = await this.prisma.depart.findUnique({ where: { id }, include: INCLUSION_DEPART });
    return d ? versDepartComplet(d) : null;
  }

  async departs(filtre: FiltreDepartsCatalogue): Promise<DepartComplet[]> {
    const lignes = await this.prisma.depart.findMany({
      where: {
        ...(filtre.etats ? { etat: { in: [...filtre.etats] } } : {}),
        ...(filtre.de || filtre.avant
          ? {
              heureDepart: {
                ...(filtre.de ? { gte: new Date(filtre.de) } : {}),
                ...(filtre.avant ? { lt: new Date(filtre.avant) } : {}),
              },
            }
          : {}),
        ligne: {
          ...(filtre.compagnieId ? { compagnieId: filtre.compagnieId } : {}),
          ...(filtre.ligneId ? { id: filtre.ligneId } : {}),
          ...(filtre.gareOrigineId ? { origineGareId: filtre.gareOrigineId } : {}),
          ...(filtre.villeOrigine ? { origine: { code: filtre.villeOrigine } } : {}),
          ...(filtre.villeDestination ? { destination: { code: filtre.villeDestination } } : {}),
        },
      },
      include: INCLUSION_DEPART,
      orderBy: [{ heureDepart: "asc" }, { id: "asc" }],
    });
    return lignes.map(versDepartComplet);
  }

  async changerDepart(
    id: string,
    attendu: EtatDepart,
    changement: Partial<Omit<Depart, "id">>,
  ): Promise<Depart | null> {
    if (!estUuid(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      // Comparer et remplacer : la ligne n'est touchée que si l'état est encore celui qu'on attend.
      const { count } = await tx.depart.updateMany({
        where: { id, etat: attendu },
        data: donneesDepart(changement),
      });
      if (count === 0) return null;
      const d = await tx.depart.findUniqueOrThrow({
        where: { id },
        include: {
          chauffeur: { select: { id: true, nom: true } },
          convoyeur: { select: { id: true, nom: true } },
        },
      });
      return versDepart(d, d.chauffeur, d.convoyeur);
    });
  }
}

/* ------------------------------------------------------------------ billets */

type LigneBillet = Prisma.BilletGetPayload<object>;

function versBillet(l: LigneBillet): Billet {
  return {
    id: l.id,
    numero: l.numero,
    sequence: l.sequence,
    compagnieId: l.compagnieId,
    gareId: l.gareId,
    departId: l.departId,
    siege: l.siege,
    classe: l.classe,
    prix: l.prix,
    bagage: l.bagage,
    canal: l.canal,
    guichetId: l.guichetId,
    acheteurId: l.acheteurId,
    commandeId: l.commandeId,
    passagerChiffre: l.passagerChiffre ?? "",
    passagerTelephoneIndex: l.passagerTelephoneIndex,
    codeBillet: l.codeBillet,
    qr: l.qr ?? "",
    creeA: iso(l.creeA),
    etat: l.etat,
    historique: (l.historique ?? []) as unknown as Billet["historique"],
    evenementId: l.evenementId,
    appareilId: l.appareilId,
    auteurId: l.auteurId,
    paiement: (l.paiement as Billet["paiement"]) ?? null,
    aCompleterAuQuai: l.aCompleterAuQuai,
    smsEnvoye: l.smsEnvoye,
    retardPrevenu: l.retardPrevenu,
    embarqueA: l.embarqueA ? iso(l.embarqueA) : null,
    reporteDe: l.reporteDeId,
  };
}

/**
 * Les seuls champs fournis. `sessionId` (la caisse) n'existe pas dans le modèle de la billetterie :
 * il n'est jamais écrit ici, une mise à jour ne l'efface donc pas.
 */
function donneesBillet(
  c: Partial<Omit<Billet, "id" | "numero">>,
): Prisma.BilletUncheckedUpdateManyInput {
  const d: Prisma.BilletUncheckedUpdateManyInput = {};
  if (c.sequence !== undefined) d.sequence = c.sequence;
  if (c.compagnieId !== undefined) d.compagnieId = c.compagnieId;
  if (c.gareId !== undefined) d.gareId = c.gareId;
  if (c.departId !== undefined) d.departId = c.departId;
  if (c.siege !== undefined) d.siege = c.siege;
  if (c.classe !== undefined) d.classe = c.classe;
  if (c.prix !== undefined) d.prix = c.prix;
  if (c.bagage !== undefined) d.bagage = c.bagage;
  if (c.canal !== undefined) d.canal = c.canal;
  if (c.guichetId !== undefined) d.guichetId = c.guichetId;
  if (c.acheteurId !== undefined) d.acheteurId = c.acheteurId;
  if (c.commandeId !== undefined) d.commandeId = c.commandeId;
  if (c.passagerChiffre !== undefined) d.passagerChiffre = c.passagerChiffre;
  if (c.passagerTelephoneIndex !== undefined) d.passagerTelephoneIndex = c.passagerTelephoneIndex;
  if (c.codeBillet !== undefined) d.codeBillet = c.codeBillet;
  if (c.qr !== undefined) d.qr = c.qr;
  if (c.creeA !== undefined) d.creeA = new Date(c.creeA);
  if (c.etat !== undefined) d.etat = c.etat;
  if (c.historique !== undefined) d.historique = json(c.historique);
  if (c.evenementId !== undefined) d.evenementId = c.evenementId;
  if (c.appareilId !== undefined) d.appareilId = c.appareilId;
  if (c.auteurId !== undefined) d.auteurId = c.auteurId;
  if (c.paiement !== undefined) d.paiement = jsonOuNul(c.paiement);
  if (c.aCompleterAuQuai !== undefined) d.aCompleterAuQuai = c.aCompleterAuQuai;
  if (c.smsEnvoye !== undefined) d.smsEnvoye = c.smsEnvoye;
  if (c.retardPrevenu !== undefined) d.retardPrevenu = c.retardPrevenu;
  if (c.embarqueA !== undefined) d.embarqueA = c.embarqueA === null ? null : new Date(c.embarqueA);
  if (c.reporteDe !== undefined) d.reporteDeId = c.reporteDe;
  return d;
}

@Injectable()
export class BilletsPrisma extends Billets implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(billet: Billet): Promise<ResultatAjoutBillet> {
    const { id, numero, ...reste } = billet;
    try {
      await this.prisma.billet.create({
        data: { id, numero, ...donneesBillet(reste) } as Prisma.BilletUncheckedCreateInput,
      });
      return "ok";
    } catch (e) {
      if (!porteCode(e, "23505") && !porteCode(e, "P2002")) throw e;
      // Quelle règle a refusé ? Les index uniques de la base décident, on lit pour répondre juste.
      if (await this.prisma.billet.findUnique({ where: { id }, select: { id: true } })) {
        return "id_pris";
      }
      if (await this.prisma.billet.findUnique({ where: { numero }, select: { id: true } })) {
        return "numero_pris";
      }
      if (
        billet.etat !== "annule" &&
        (await this.prisma.billet.findFirst({
          where: {
            departId: billet.departId,
            codeBillet: billet.codeBillet,
            etat: { not: "annule" },
          },
          select: { id: true },
        }))
      ) {
        return "code_pris";
      }
      // Même événement de guichet déjà enregistré par une requête concurrente : c'est un rejeu.
      if (
        billet.evenementId !== null &&
        (await this.prisma.billet.findUnique({
          where: { evenementId: billet.evenementId },
          select: { id: true },
        }))
      ) {
        return "id_pris";
      }
      throw e;
    }
  }

  async trouver(id: string): Promise<Billet | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.billet.findUnique({ where: { id } });
    return l ? versBillet(l) : null;
  }

  async parNumero(numero: string): Promise<Billet | null> {
    const l = await this.prisma.billet.findUnique({ where: { numero } });
    return l ? versBillet(l) : null;
  }

  async parEvenement(evenementId: string): Promise<Billet | null> {
    if (!estUuid(evenementId)) return null;
    const l = await this.prisma.billet.findUnique({ where: { evenementId } });
    return l ? versBillet(l) : null;
  }

  async parCode(departId: string, code: string): Promise<Billet | null> {
    if (!estUuid(departId)) return null;
    const l = await this.prisma.billet.findFirst({
      where: { departId, codeBillet: code, etat: { not: "annule" } },
    });
    return l ? versBillet(l) : null;
  }

  async duDepart(departId: string): Promise<Billet[]> {
    if (!estUuid(departId)) return [];
    const lignes = await this.prisma.billet.findMany({
      where: { departId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versBillet);
  }

  async duGuichetEtJour(guichetId: string, aammjj: string): Promise<Billet[]> {
    if (!estUuid(guichetId)) return [];
    // Le jour est le troisième morceau du numéro : AGENCE-GARE-AAMMJJ-NNNN.
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM billet
      WHERE "guichetId" = ${guichetId}::uuid AND split_part(numero, '-', 3) = ${aammjj}`;
    if (ids.length === 0) return [];
    const lignes = await this.prisma.billet.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versBillet);
  }

  async deLAcheteur(acheteurId: string): Promise<Billet[]> {
    if (!estUuid(acheteurId)) return [];
    const lignes = await this.prisma.billet.findMany({
      where: { acheteurId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versBillet);
  }

  async transitionner(
    id: string,
    de: readonly EtatBillet[],
    changement: Partial<Omit<Billet, "id" | "numero">>,
  ): Promise<Billet | null> {
    if (!estUuid(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      // `UPDATE … WHERE etat = ANY(…)` : de deux scans simultanés, un seul touche la ligne, l'autre
      // voit zéro ligne modifiée.
      const { count } = await tx.billet.updateMany({
        where: { id, etat: { in: [...de] } },
        data: donneesBillet(changement),
      });
      if (count === 0) return null;
      return versBillet(await tx.billet.findUniqueOrThrow({ where: { id } }));
    });
  }
}

/* ------------------------------------------------------------------ sièges */

/**
 * Ajoute `n` à la version du plan du départ (même transaction que le siège) et rend la nouvelle
 * valeur. Verrouille la ligne du départ jusqu'à la fin de la transaction : les changements d'un même
 * plan reçoivent des versions qui se suivent.
 */
async function monterVersion(tx: Tx, departId: string, n: number): Promise<number> {
  const lignes = await tx.$queryRaw<{ version: number }[]>`
    UPDATE depart SET "versionPlan" = "versionPlan" + ${n}::int
    WHERE id = ${departId}::uuid RETURNING "versionPlan" AS version`;
  const version = lignes[0]?.version;
  if (version === undefined) throw new Error(`Départ inconnu : ${departId}`);
  return version;
}

/** Une opération de siège se retente si la ligne a disparu entre la tentative et la lecture du motif. */
const ESSAIS_SIEGE = 5;

@Injectable()
export class InventairePrisma extends Inventaire implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async plan(departId: string): Promise<PlanStocke> {
    if (!estUuid(departId)) return { occupes: {}, bloques: {}, version: 0 };
    // Une seule requête : les sièges et la version viennent du même instant.
    const lignes = await this.prisma.$queryRaw<
      {
        version: number;
        siege: number | null;
        billetId: string | null;
        bloquePar: string | null;
        commandeId: string | null;
        bloqueJusqua: Date | null;
      }[]
    >`
      SELECT d."versionPlan" AS version, s.siege, s."billetId", s."bloquePar", s."commandeId", s."bloqueJusqua"
      FROM depart d
      LEFT JOIN siege_depart s ON s."departId" = d.id
      WHERE d.id = ${departId}::uuid`;
    const plan: PlanStocke = { occupes: {}, bloques: {}, version: lignes[0]?.version ?? 0 };
    for (const l of lignes) {
      if (l.siege === null) continue;
      if (l.billetId !== null) plan.occupes[l.siege] = l.billetId;
      else if (l.bloquePar !== null && l.bloqueJusqua !== null) {
        plan.bloques[l.siege] = {
          par: l.bloquePar,
          commandeId: l.commandeId,
          jusqua: iso(l.bloqueJusqua),
        };
      }
    }
    return plan;
  }

  async bloquer(a: {
    departId: string;
    siege: number;
    par: string;
    commandeId: string | null;
    jusqua: string;
    maintenant: string;
  }): Promise<ResultatSiege> {
    const jusqua = new Date(a.jusqua);
    const maintenant = new Date(a.maintenant);
    return this.prisma.$transaction(async (tx) => {
      for (let essai = 0; essai < ESSAIS_SIEGE; essai++) {
        // Le siège est bloqué s'il est libre (pas de ligne), s'il est déjà bloqué par ce voyageur
        // (la fin est repoussée) ou si le blocage d'un autre est échu. Occupé : jamais.
        const prises = await tx.$queryRaw<{ siege: number }[]>`
          INSERT INTO siege_depart ("departId", siege, "bloquePar", "commandeId", "bloqueJusqua")
          VALUES (${a.departId}::uuid, ${a.siege}::int, ${a.par}, ${a.commandeId}::uuid, ${jusqua}::timestamptz)
          ON CONFLICT ("departId", siege) DO UPDATE SET
            "bloquePar" = EXCLUDED."bloquePar",
            "commandeId" = EXCLUDED."commandeId",
            "bloqueJusqua" = EXCLUDED."bloqueJusqua"
          WHERE siege_depart."billetId" IS NULL
            AND (siege_depart."bloquePar" = EXCLUDED."bloquePar"
                 OR siege_depart."bloqueJusqua" <= ${maintenant}::timestamptz)
          RETURNING siege`;
        if (prises.length > 0) {
          return { ok: true, version: await monterVersion(tx, a.departId, 1) } as const;
        }
        const actuel = await tx.siegeDepart.findUnique({
          where: { departId_siege: { departId: a.departId, siege: a.siege } },
        });
        if (!actuel) continue; // libéré entre-temps : on retente
        return {
          ok: false,
          raison: actuel.billetId !== null ? "pris" : "bloque_par_autre",
        } as const;
      }
      throw new Error(`Siège ${a.siege} du départ ${a.departId} : trop de concurrence`);
    });
  }

  async occuper(a: {
    departId: string;
    siege: number;
    billetId: string;
    par: string | null;
    maintenant: string;
  }): Promise<ResultatSiege> {
    const maintenant = new Date(a.maintenant);
    return this.prisma.$transaction(async (tx) => {
      for (let essai = 0; essai < ESSAIS_SIEGE; essai++) {
        // Occupé : jamais. Retenu par un autre voyageur et encore valable : non. Libre, retenu par
        // l'acheteur (consommé) ou retenu mais échu : le siège passe au billet.
        const prises = await tx.$queryRaw<{ siege: number }[]>`
          INSERT INTO siege_depart ("departId", siege, "billetId")
          VALUES (${a.departId}::uuid, ${a.siege}::int, ${a.billetId}::uuid)
          ON CONFLICT ("departId", siege) DO UPDATE SET
            "billetId" = EXCLUDED."billetId",
            "bloquePar" = NULL,
            "commandeId" = NULL,
            "bloqueJusqua" = NULL
          WHERE siege_depart."billetId" IS NULL
            AND (siege_depart."bloquePar" = ${a.par}::text
                 OR siege_depart."bloqueJusqua" <= ${maintenant}::timestamptz)
          RETURNING siege`;
        if (prises.length > 0) {
          return { ok: true, version: await monterVersion(tx, a.departId, 1) } as const;
        }
        const actuel = await tx.siegeDepart.findUnique({
          where: { departId_siege: { departId: a.departId, siege: a.siege } },
        });
        if (!actuel) continue;
        return {
          ok: false,
          raison: actuel.billetId !== null ? "pris" : "bloque_par_autre",
        } as const;
      }
      throw new Error(`Siège ${a.siege} du départ ${a.departId} : trop de concurrence`);
    });
  }

  async leverBlocages(
    departId: string,
    par: string,
    sauf: readonly number[] = [],
  ): Promise<{ siege: number; version: number }[]> {
    if (!estUuid(departId)) return [];
    return this.prisma.$transaction(async (tx) => {
      const levees = await tx.$queryRaw<{ siege: number }[]>`
        DELETE FROM siege_depart
        WHERE "departId" = ${departId}::uuid AND "bloquePar" = ${par} AND "commandeId" IS NULL
          AND siege <> ALL(${[...sauf]}::int[])
        RETURNING siege`;
      return this.versions(tx, departId, levees);
    });
  }

  async leverCommande(
    departId: string,
    commandeId: string,
  ): Promise<{ siege: number; version: number }[]> {
    if (!estUuid(departId) || !estUuid(commandeId)) return [];
    return this.prisma.$transaction(async (tx) => {
      const levees = await tx.$queryRaw<{ siege: number }[]>`
        DELETE FROM siege_depart
        WHERE "departId" = ${departId}::uuid AND "commandeId" = ${commandeId}::uuid
        RETURNING siege`;
      return this.versions(tx, departId, levees);
    });
  }

  async liberer(
    departId: string,
    siege: number,
    billetId: string,
  ): Promise<{ version: number } | null> {
    if (!estUuid(departId) || !estUuid(billetId)) return null;
    return this.prisma.$transaction(async (tx) => {
      // Le siège n'est rendu qu'à son billet : `billetId` fait partie de la condition.
      const rendus = await tx.$queryRaw<{ siege: number }[]>`
        DELETE FROM siege_depart
        WHERE "departId" = ${departId}::uuid AND siege = ${siege}::int AND "billetId" = ${billetId}::uuid
        RETURNING siege`;
      if (rendus.length === 0) return null;
      return { version: await monterVersion(tx, departId, 1) };
    });
  }

  async expirer(maintenant: string): Promise<BlocageExpire[]> {
    const limite = new Date(maintenant);
    return this.prisma.$transaction(async (tx) => {
      // Un seul balayeur à la fois (plusieurs instances de l'API) : les autres attendent, puis ne
      // trouvent plus rien à supprimer.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_BILLETTERIE}::int, 1)`;
      const echus = await tx.$queryRaw<
        { departId: string; siege: number; bloquePar: string; commandeId: string | null }[]
      >`
        DELETE FROM siege_depart
        WHERE "bloquePar" IS NOT NULL AND "bloqueJusqua" <= ${limite}::timestamptz
        RETURNING "departId", siege, "bloquePar", "commandeId"`;
      const parDepart = new Map<string, typeof echus>();
      for (const e of echus) parDepart.set(e.departId, [...(parDepart.get(e.departId) ?? []), e]);
      const sortie: BlocageExpire[] = [];
      // Les départs dans le même ordre pour tous : pas d'interblocage entre deux balayeurs.
      for (const departId of [...parDepart.keys()].sort()) {
        const lignes = [...parDepart.get(departId)!].sort((x, y) => x.siege - y.siege);
        const dernier = await monterVersion(tx, departId, lignes.length);
        lignes.forEach((l, i) =>
          sortie.push({
            departId,
            siege: l.siege,
            par: l.bloquePar,
            commandeId: l.commandeId,
            version: dernier - lignes.length + 1 + i,
          }),
        );
      }
      return sortie;
    });
  }

  /** Une version par siège levé, qui se suivent (la dernière est la version du plan). */
  private async versions(
    tx: Tx,
    departId: string,
    levees: { siege: number }[],
  ): Promise<{ siege: number; version: number }[]> {
    if (levees.length === 0) return [];
    const tries = [...levees].sort((a, b) => a.siege - b.siege);
    const dernier = await monterVersion(tx, departId, tries.length);
    return tries.map((l, i) => ({ siege: l.siege, version: dernier - tries.length + 1 + i }));
  }
}

/* ------------------------------------------------------------------ commandes */

type LigneCommande = Prisma.CommandeGetPayload<object>;

function versCommande(l: LigneCommande): Commande {
  return {
    id: l.id,
    voyageurId: l.voyageurId,
    departId: l.departId,
    type: l.type as Commande["type"],
    libelle: l.libelle,
    lignes: (l.lignes ?? []) as unknown as Commande["lignes"],
    total: l.total,
    conversion: (l.conversion as Commande["conversion"]) ?? null,
    statut: l.statut as StatutCommande,
    creeeA: iso(l.creeA),
    expireA: iso(l.expireA),
    sieges: l.sieges,
    passagersChiffre: l.passagersChiffre,
    billetIds: l.billetIds,
    codePromo: l.codePromo,
    moyenPaiement: l.moyenPaiement,
  };
}

function donneesCommande(
  c: Partial<Omit<Commande, "id">>,
): Prisma.CommandeUncheckedUpdateManyInput {
  const d: Prisma.CommandeUncheckedUpdateManyInput = {};
  if (c.voyageurId !== undefined) d.voyageurId = c.voyageurId;
  if (c.departId !== undefined) d.departId = c.departId;
  if (c.type !== undefined) d.type = c.type;
  if (c.libelle !== undefined) d.libelle = c.libelle;
  if (c.lignes !== undefined) d.lignes = json(c.lignes);
  if (c.total !== undefined) d.total = c.total;
  if (c.conversion !== undefined) d.conversion = jsonOuNul(c.conversion);
  if (c.statut !== undefined) d.statut = c.statut;
  if (c.creeeA !== undefined) d.creeA = new Date(c.creeeA);
  if (c.expireA !== undefined) d.expireA = new Date(c.expireA);
  if (c.sieges !== undefined) d.sieges = [...c.sieges];
  if (c.passagersChiffre !== undefined) d.passagersChiffre = c.passagersChiffre;
  if (c.billetIds !== undefined) d.billetIds = [...c.billetIds];
  if (c.codePromo !== undefined) d.codePromo = c.codePromo;
  if (c.moyenPaiement !== undefined) d.moyenPaiement = c.moyenPaiement;
  return d;
}

@Injectable()
export class CommandesPrisma extends Commandes implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(commande: Commande): Promise<void> {
    const { id, ...reste } = commande;
    await this.prisma.commande.create({
      data: { id, ...donneesCommande(reste) } as Prisma.CommandeUncheckedCreateInput,
    });
  }

  async trouver(id: string): Promise<Commande | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.commande.findUnique({ where: { id } });
    return l ? versCommande(l) : null;
  }

  async duDepart(departId: string, statut: StatutCommande): Promise<Commande[]> {
    if (!estUuid(departId)) return [];
    const lignes = await this.prisma.commande.findMany({
      where: { departId, statut },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versCommande);
  }

  async enAttenteExpirees(maintenant: string): Promise<Commande[]> {
    const lignes = await this.prisma.commande.findMany({
      where: { statut: "en_attente_paiement", expireA: { lte: new Date(maintenant) } },
      orderBy: [{ expireA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versCommande);
  }

  async transitionner(
    id: string,
    de: readonly StatutCommande[],
    changement: Partial<Omit<Commande, "id">>,
  ): Promise<Commande | null> {
    if (!estUuid(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      // Comparer et remplacer sur le statut : un paiement et une expiration simultanés ne passent
      // pas tous les deux.
      const { count } = await tx.commande.updateMany({
        where: { id, statut: { in: [...de] } },
        data: donneesCommande(changement),
      });
      if (count === 0) return null;
      return versCommande(await tx.commande.findUniqueOrThrow({ where: { id } }));
    });
  }
}

/* ------------------------------------------------------------------ scans et événements traités */

@Injectable()
export class ScansPrisma extends Scans implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: Prisma.ScanQuaiGetPayload<object>): ScanStocke {
    return {
      evenementId: l.evenementId,
      departId: l.departId,
      billetId: l.billetId,
      numero: l.numero,
      resultat: l.resultat as ScanStocke["resultat"],
      at: iso(l.at),
      siege: l.siege,
      classe: l.classe,
      bagagesSoute: l.bagagesSoute,
      premierScanA: l.premierScanA ? iso(l.premierScanA) : null,
      appareilId: l.appareilId,
      auteurId: l.auteurId,
    };
  }

  async ajouter(scan: ScanStocke): Promise<void> {
    // Une ligne par événement : le rejeu d'un scan n'en écrit pas une seconde.
    await this.prisma.scanQuai.createMany({
      data: [
        {
          evenementId: scan.evenementId,
          departId: scan.departId,
          billetId: scan.billetId,
          numero: scan.numero,
          resultat: scan.resultat,
          at: new Date(scan.at),
          siege: scan.siege,
          classe: scan.classe,
          bagagesSoute: scan.bagagesSoute,
          premierScanA: scan.premierScanA ? new Date(scan.premierScanA) : null,
          appareilId: scan.appareilId,
          auteurId: scan.auteurId,
        },
      ],
      skipDuplicates: true,
    });
  }

  async duDepart(departId: string): Promise<ScanStocke[]> {
    const lignes = await this.prisma.scanQuai.findMany({
      where: { departId },
      orderBy: [{ at: "asc" }, { evenementId: "asc" }],
    });
    return lignes.map((l) => this.vers(l));
  }

  async parEvenement(evenementId: string): Promise<ScanStocke | null> {
    if (!estUuid(evenementId)) return null;
    const l = await this.prisma.scanQuai.findUnique({ where: { evenementId } });
    return l ? this.vers(l) : null;
  }
}

@Injectable()
export class EvenementsTraitesPrisma extends EvenementsTraites implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(id: string): Promise<EvenementTraite | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.evenementTraite.findUnique({ where: { id } });
    return l
      ? { id: l.id, type: l.type, recuA: iso(l.recuA), reponseChiffree: l.reponseChiffree }
      : null;
  }

  async memoriser(entree: EvenementTraite): Promise<boolean> {
    // `ON CONFLICT DO NOTHING` : de deux requêtes identiques simultanées, une seule écrit.
    const { count } = await this.prisma.evenementTraite.createMany({
      data: [
        {
          id: entree.id,
          type: entree.type,
          recuA: new Date(entree.recuA),
          reponseChiffree: entree.reponseChiffree,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async typesDe(ids: readonly string[]): Promise<Map<string, string>> {
    const valides = [...new Set(ids.filter(estUuid))];
    if (valides.length === 0) return new Map();
    const lignes = await this.prisma.evenementTraite.findMany({
      where: { id: { in: valides } },
      select: { id: true, type: true },
    });
    return new Map(lignes.map((l) => [l.id, l.type]));
  }
}

/* ------------------------------------------------------------------ préférences */

@Injectable()
export class PreferencesPrisma extends PreferencesVoyageur implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async compagniesPreferees(voyageurId: string): Promise<ReadonlySet<string>> {
    if (!estUuid(voyageurId)) return new Set();
    const lignes = await this.prisma.compagniePreferee.findMany({ where: { voyageurId } });
    return new Set(lignes.map((l) => l.compagnieId));
  }

  async definirPreferee(voyageurId: string, compagnieId: string, preferee: boolean): Promise<void> {
    if (preferee) {
      await this.prisma.compagniePreferee.createMany({
        data: [{ voyageurId, compagnieId }],
        skipDuplicates: true,
      });
    } else {
      await this.prisma.compagniePreferee.deleteMany({ where: { voyageurId, compagnieId } });
    }
  }

  async filtres(
    voyageurId: string,
    depart: string,
    arrivee: string,
  ): Promise<FiltresDeparts | null> {
    if (!estUuid(voyageurId)) return null;
    const l = await this.prisma.filtresVoyageur.findUnique({
      where: { voyageurId_depart_arrivee: { voyageurId, depart, arrivee } },
    });
    return l ? (l.filtres as unknown as FiltresDeparts) : null;
  }

  async enregistrerFiltres(
    voyageurId: string,
    depart: string,
    arrivee: string,
    filtres: FiltresDeparts,
  ): Promise<void> {
    await this.prisma.filtresVoyageur.upsert({
      where: { voyageurId_depart_arrivee: { voyageurId, depart, arrivee } },
      create: { voyageurId, depart, arrivee, filtres: json(filtres) },
      update: { filtres: json(filtres) },
    });
  }
}

/* ------------------------------------------------------------------ numérotation des ventes en ligne */

/**
 * Numéros 4001–9999 des ventes en ligne : c'est la numérotation du serveur (AM-161) qui les donne,
 * dans le registre `numero_vu` (une clé primaire par portée, jour, genre et numéro), sans trou et
 * sans doublon. La `reference` (identifiant du billet) rend l'appel rejouable : le même billet
 * reçoit toujours le même numéro.
 */
@Injectable()
export class NumerotationEnLigneServeur extends NumerotationEnLigne implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly numerotation: NumerotationService) {
    super();
  }

  async prochaine(a: {
    compagnieId: string;
    gareId: string;
    aammjj: string;
    reference?: string;
  }): Promise<number> {
    // Le jour est donné en AAMMJJ ; midi à Douala tombe toujours dans ce jour-là.
    const [aa, mm, jj] = [a.aammjj.slice(0, 2), a.aammjj.slice(2, 4), a.aammjj.slice(4, 6)];
    try {
      const { numero } = await this.numerotation.prendreEnLigne({
        gareId: a.gareId,
        compagnieId: a.compagnieId,
        genre: "billet",
        at: `20${aa}-${mm}-${jj}T12:00:00.000+01:00`,
        reference: a.reference ?? randomUUID(),
      });
      return numero;
    } catch (e) {
      // Même erreur que la version en mémoire : c'est elle que les services connaissent.
      if (e instanceof NumerosEnLigneEpuises) throw new PlageEpuisee(PLAGE_EN_LIGNE);
      throw e;
    }
  }
}
