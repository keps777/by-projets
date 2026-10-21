import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type {
  AnnulationFaite,
  BilletVendu,
  ColisEnregistre,
  CompagnieRapport,
  ControleEnRoute,
  GareRapport,
  ModePaiement,
} from "./modele";
import {
  ActiviteColis,
  AnnulationsDuJour,
  ControlesEnRoute,
  ReferentielRapport,
  RapportsSoir,
  VentesBillets,
  type StockeRapport,
} from "./ports";
import { debutDeJour, decalerJour, versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) du rapport du soir (AM-171) : `ReferentielRapport`,
 * `VentesBillets`, `ActiviteColis`, `AnnulationsDuJour`, `ControlesEnRoute` et `RapportsSoir`.
 * Les cinq premiers **lisent** les tables des autres modules (`compagnie`, `gare`, `billet`,
 * `colis`, `reclamation_colis`, `demande_annulation`, `journal_evenement`) ; seul `RapportsSoir`
 * écrit, dans la table `rapport_soir` (migration « rapport_soir »). Les trois autres ports de
 * lecture (caisses, départs, numérotation) passent par les ponts de `ponts.ts`.
 *
 * Toutes les lectures sont bornées à la compagnie demandée et au jour de Douala
 * (`[00:00, 24:00[` à +01:00) : le rapport d'une compagnie ne lit jamais les données d'une autre.
 * Un jour mal formé ou inexistant ne lit rien (liste vide, zéro).
 *
 * Les garanties du rapport tiennent dans la base :
 * - **un rapport par compagnie et par jour** : clé primaire `(compagnieId, jour)`, écriture par
 *   `INSERT … ON CONFLICT DO NOTHING` ; deux instances qui arrêtent le rapport en même temps n'en
 *   écrivent qu'un, l'autre relit celui qui fait foi ;
 * - **un rapport arrêté ne change plus** : déclencheurs contre `UPDATE`, `DELETE` et `TRUNCATE`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Bornes `[début, fin[` du jour de Douala, ou `null` si le jour n'existe pas. */
function bornes(jour: string): { debut: Date; fin: Date } | null {
  const debut = debutDeJour(jour);
  if (!debut) return null;
  const fin = debutDeJour(decalerJour(jour, 1));
  return fin ? { debut, fin } : null;
}

/** Le moyen de paiement tel que l'écrit chaque module, ramené aux trois du rapport. */
export function modeDuRapport(brut: unknown): ModePaiement | null {
  if (typeof brut !== "string") return null;
  switch (brut.trim().toLowerCase()) {
    case "cash":
    case "especes":
    case "especes_agence":
      return "cash";
    case "momo":
    case "mtn":
    case "mtn_momo":
    case "momo_marchand":
      return "momo";
    case "orange_money":
    case "orange":
      return "orange_money";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ référentiel */

@Injectable()
export class ReferentielRapportPrisma extends ReferentielRapport {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async compagnies(): Promise<CompagnieRapport[]> {
    const lignes = await this.prisma.compagnie.findMany({
      where: { actif: true },
      select: { id: true, nom: true },
      orderBy: { id: "asc" },
    });
    return lignes;
  }

  async compagnie(id: string): Promise<CompagnieRapport | null> {
    if (!UUID.test(id)) return null;
    return this.prisma.compagnie.findFirst({
      where: { id, actif: true },
      select: { id: true, nom: true },
    });
  }

  async gares(compagnieId: string): Promise<GareRapport[]> {
    if (!UUID.test(compagnieId)) return [];
    // Les identifiants sont des UUID v7 : l'ordre des identifiants est l'ordre de création.
    return this.prisma.gare.findMany({
      where: { compagnieId },
      select: { id: true, nom: true },
      orderBy: { id: "asc" },
    });
  }
}

/* ------------------------------------------------------------------ billets */

@Injectable()
export class VentesBilletsPrisma extends VentesBillets {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async duJour(compagnieId: string, jour: string): Promise<BilletVendu[]> {
    const b = bornes(jour);
    if (!b || !UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.billet.findMany({
      where: { compagnieId, creeA: { gte: b.debut, lt: b.fin } },
      select: {
        id: true,
        numero: true,
        gareId: true,
        canal: true,
        paiement: true,
        prix: true,
        bagage: true,
        creeA: true,
        etat: true,
        reporteDeId: true,
        aCompleterAuQuai: true,
        embarqueA: true,
        depart: { select: { etat: true } },
      },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      numero: l.numero,
      gareId: l.gareId,
      canal: l.canal,
      mode: modeDuBillet(l.paiement),
      montant: l.prix + l.bagage,
      venduA: versIsoDouala(l.creeA),
      etat: l.etat,
      reporteDe: l.reporteDeId,
      aCompleterAuQuai: l.aCompleterAuQuai,
      // Le drapeau tombe quand le nom est complété au quai : tant qu'il est levé, le nom manque.
      sansNom: l.aCompleterAuQuai,
      embarque: l.embarqueA !== null,
      departParti: l.depart.etat === "parti" || l.depart.etat === "arrive",
    }));
  }
}

function modeDuBillet(paiement: Prisma.JsonValue | null): ModePaiement | null {
  if (paiement === null || typeof paiement !== "object" || Array.isArray(paiement)) return null;
  return modeDuRapport((paiement as Record<string, unknown>)["mode"]);
}

/* ------------------------------------------------------------------ colis */

@Injectable()
export class ActiviteColisPrisma extends ActiviteColis {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enregistresLe(compagnieId: string, jour: string): Promise<ColisEnregistre[]> {
    const b = bornes(jour);
    if (!b || !UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.colis.findMany({
      where: { compagnieId, creeA: { gte: b.debut, lt: b.fin } },
      select: {
        id: true,
        numero: true,
        gareOrigineId: true,
        prixTotal: true,
        complementPoids: true,
        paiementEtat: true,
        paiementMoyen: true,
        creeA: true,
      },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => {
      // `prixTotal` contient déjà le complément de poids payé au dépôt. Un colis de l'application
      // dont le port n'est pas encore payé n'a fait entrer que ce complément.
      const paye = l.paiementEtat === "paye";
      return {
        id: l.id,
        numero: l.numero,
        gareId: l.gareOrigineId,
        montant: paye ? l.prixTotal : Math.min(l.complementPoids, l.prixTotal),
        mode: paye ? modeDuRapport(l.paiementMoyen) : null,
        creeA: versIsoDouala(l.creeA),
      };
    });
  }

  async litigesOuvertsLe(compagnieId: string, jour: string): Promise<number> {
    const b = bornes(jour);
    if (!b || !UUID.test(compagnieId)) return 0;
    return this.prisma.reclamationColis.count({
      where: { compagnieId, ouverteA: { gte: b.debut, lt: b.fin } },
    });
  }
}

/* ------------------------------------------------------------------ annulations */

@Injectable()
export class AnnulationsDuJourPrisma extends AnnulationsDuJour {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Les demandes décidées dans le jour par un superviseur (donc avec son PIN) et remboursées ou
   * converties en avoir. `reporter` et `refuser` ne rendent rien au client : exclues. Les
   * annulations faites en ligne par le voyageur ne laissent pas de trace de montant dans le schéma
   * actuel : elles ne sont pas comptées ici (voir le README).
   */
  async duJour(compagnieId: string, jour: string): Promise<AnnulationFaite[]> {
    const b = bornes(jour);
    if (!b || !UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.demandeAnnulation.findMany({
      where: {
        compagnieId,
        statut: "decidee",
        decision: { in: ["rembourser", "avoir"] },
        decideeA: { gte: b.debut, lt: b.fin },
      },
      select: {
        billetId: true,
        montant: true,
        decideeA: true,
        billet: { select: { numero: true, gareId: true } },
      },
      orderBy: [{ decideeA: "asc" }, { demandeId: "asc" }],
    });
    return lignes.map((l) => ({
      billetId: l.billetId,
      numero: l.billet.numero,
      gareId: l.billet.gareId,
      montant: l.montant ?? 0,
      avecPin: true,
      at: versIsoDouala(l.decideeA ?? b.debut),
    }));
  }
}

/* ------------------------------------------------------------------ contrôles en route */

interface LigneControle {
  type: string;
  controleId: string;
  lieu: string | null;
}

@Injectable()
export class ControlesEnRoutePrisma extends ControlesEnRoute {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Les événements `controle.regularise`, `controle.convoyeur_signale` et `controle.cloture` du
   * journal, reçus dans le jour, pour les départs de la compagnie, regroupés par contrôle. Le lieu
   * est le dernier arrêt annoncé par le chauffeur (`chauffeur.arrivee_arret`) avant le contrôle ;
   * vide quand aucun arrêt n'a été annoncé.
   */
  async duJour(compagnieId: string, jour: string): Promise<ControleEnRoute[]> {
    const b = bornes(jour);
    if (!b || !UUID.test(compagnieId)) return [];
    // Comparaisons en texte : une charge mal formée ne fait jamais échouer un cast en UUID.
    const lignes = await this.prisma.$queryRaw<LigneControle[]>`
      SELECT j."type" AS "type",
             j."donnees" ->> 'controleId' AS "controleId",
             (SELECT a."donnees" ->> 'arret'
                FROM "journal_evenement" a
               WHERE a."type" = 'chauffeur.arrivee_arret'
                 AND a."cibleType" = 'depart'
                 AND a."cibleId" = j."donnees" ->> 'departId'
                 AND a."at" <= j."at"
               ORDER BY a."at" DESC, a."seq" DESC
               LIMIT 1) AS "lieu"
        FROM "journal_evenement" j
        JOIN "depart" d ON d."id"::text = j."donnees" ->> 'departId'
        JOIN "ligne" l ON l."id" = d."ligneId"
       WHERE l."compagnieId" = ${compagnieId}::uuid
         AND j."type" IN ('controle.regularise', 'controle.convoyeur_signale', 'controle.cloture')
         AND j."at" >= ${b.debut} AND j."at" < ${b.fin}
         AND j."donnees" ->> 'controleId' IS NOT NULL
       ORDER BY j."at", j."seq"`;
    const parControle = new Map<string, ControleEnRoute>();
    for (const l of lignes) {
      const c = parControle.get(l.controleId) ?? {
        controleId: l.controleId,
        lieu: "",
        regularisations: 0,
        ventesNonEnregistrees: 0,
      };
      if (c.lieu === "" && l.lieu) c.lieu = l.lieu;
      if (l.type === "controle.regularise") c.regularisations += 1;
      if (l.type === "controle.convoyeur_signale") c.ventesNonEnregistrees += 1;
      parControle.set(l.controleId, c);
    }
    return [...parControle.values()];
  }
}

/* ------------------------------------------------------------------ rapports générés */

type LigneRapport = Prisma.RapportSoirGetPayload<object>;

function versStocke(l: LigneRapport): StockeRapport {
  return {
    compagnieId: l.compagnieId,
    jour: l.jour.toISOString().slice(0, 10),
    genereA: versIsoDouala(l.genereA),
    rapport: l.rapport as unknown as StockeRapport["rapport"],
  };
}

@Injectable()
export class RapportsSoirPrisma extends RapportsSoir {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(compagnieId: string, jour: string): Promise<StockeRapport | null> {
    if (!UUID.test(compagnieId) || !JOUR.test(jour) || !bornes(jour)) return null;
    const ligne = await this.prisma.rapportSoir.findUnique({
      where: { compagnieId_jour: { compagnieId, jour: new Date(`${jour}T00:00:00.000Z`) } },
    });
    return ligne ? versStocke(ligne) : null;
  }

  async creer(entree: StockeRapport): Promise<{ rapport: StockeRapport; nouveau: boolean }> {
    if (!UUID.test(entree.compagnieId) || !JOUR.test(entree.jour) || !bornes(entree.jour)) {
      throw new RangeError(
        `Rapport du soir invalide : compagnie ou jour mal formé (${entree.jour})`,
      );
    }
    // ON CONFLICT DO NOTHING : le nombre de lignes écrites dit qui a arrêté le rapport.
    const { count } = await this.prisma.rapportSoir.createMany({
      data: {
        compagnieId: entree.compagnieId,
        jour: new Date(`${entree.jour}T00:00:00.000Z`),
        genereA: new Date(entree.genereA),
        rapport: entree.rapport as unknown as Prisma.InputJsonValue,
      },
      skipDuplicates: true,
    });
    const ligne = await this.prisma.rapportSoir.findUniqueOrThrow({
      where: {
        compagnieId_jour: {
          compagnieId: entree.compagnieId,
          jour: new Date(`${entree.jour}T00:00:00.000Z`),
        },
      },
    });
    return { rapport: versStocke(ligne), nouveau: count === 1 };
  }
}
