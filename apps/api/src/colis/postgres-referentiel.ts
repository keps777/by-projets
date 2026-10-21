import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type { DepartColis, GareRef, GuichetRef, RelaisRef } from "./modele";
import { ReferentielColis } from "./ports";
import { enMs, versIsoDouala } from "./temps";

/**
 * Adaptateur PostgreSQL de `ReferentielColis` (lot Db, recette AM-181, anomalie A5) : l'annuaire des
 * départs, des gares, des guichets et des relais que le module colis consulte, lu dans les tables
 * d'administration (`depart`, `ligne`, `bus`, `gare`, `guichet`, `personne`, `relais`) et dans `colis`
 * pour remplir la soute. Il ne crée rien : départs, lignes et bus se posent ailleurs.
 *
 * Règles provisoires, à confirmer (listées dans le README du module) :
 * - **Départ ouvert aux colis** : état « en vente », « embarquement » ou « retardé » (pas « programmé »,
 *   ni parti, arrivé, annulé, fusionné). Le bus n'est pas exigé.
 * - **Port du colis** : `PORT_COLIS_PAR_DEFAUT` pour toutes les lignes. Le domaine dit « fixé par la ligne »
 *   mais la table `ligne` n'a pas encore de tarif de colis ; la recette (AM-181) suppose 1 500 F.
 * - **Soute occupée** : colis enregistrés, chargés ou en route sur le départ, divisés par les places de soute
 *   du bus (un colis = une place), en pourcentage entier plafonné à 100. 0 sans bus ni soute renseignée.
 * - **Arrivée prévue** : heure de départ + durée de la ligne ; la durée vaut 0 quand elle n'est pas
 *   renseignée, l'arrivée prévue est alors l'heure de départ.
 * - **Guichet de la personne** : celui auquel elle est affectée, sinon le premier (rang le plus petit) de sa gare.
 * - **Relais** : lu dans `relais` ; le module des relais le complète au démarrage (`BranchementRelaisColis`).
 * - **Inter-agences** : `false` ; le module des inter-agences remplace ce calcul au démarrage (conventions en vigueur).
 */

/** Port d'un colis en gare, en FCFA, tant que la ligne n'en porte pas. */
export const PORT_COLIS_PAR_DEFAUT = 1_500;

/** États d'un départ qui accepte encore des colis. */
export const ETATS_DEPART_OUVERTS_AUX_COLIS = ["en_vente", "embarquement", "retarde"] as const;

/** États d'un colis qui occupe la soute d'un départ. */
const ETATS_COLIS_EN_SOUTE = ["enregistre", "charge", "en_route"] as const;

/** Départs listés au plus : l'écran en montre quelques-uns, la liste n'a pas à être illimitée. */
const LIMITE_DEPARTS = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v: string | null | undefined): v is string =>
  typeof v === "string" && UUID.test(v);

const INCLUSION_DEPART = {
  ligne: { include: { compagnie: true, origine: true, destination: true } },
  bus: { select: { capaciteSoute: true } },
} satisfies Prisma.DepartInclude;

type LigneDepart = Prisma.DepartGetPayload<{ include: typeof INCLUSION_DEPART }>;

const versGare = (g: { id: string; code: string; nom: string; ville: string }): GareRef => ({
  id: g.id,
  code: g.code,
  nom: g.nom,
  ville: g.ville,
});

/** Part de la soute occupée, en pourcentage entier entre 0 et 100. */
export function pourcentageSoute(colisEnSoute: number, placesDeSoute: number): number {
  if (placesDeSoute <= 0 || colisEnSoute <= 0) return 0;
  return Math.min(100, Math.round((colisEnSoute * 100) / placesDeSoute));
}

@Injectable()
export class ReferentielColisPrisma extends ReferentielColis {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Colis en soute par départ, en une seule requête pour tous les départs demandés. */
  private async colisEnSoute(departIds: string[]): Promise<Map<string, number>> {
    if (departIds.length === 0) return new Map();
    const groupes = await this.prisma.colis.groupBy({
      by: ["departId"],
      where: { departId: { in: departIds }, etat: { in: [...ETATS_COLIS_EN_SOUTE] } },
      _count: { _all: true },
    });
    return new Map(groupes.flatMap((g) => (g.departId ? [[g.departId, g._count._all]] : [])));
  }

  private versDepart(d: LigneDepart, enSoute: number): DepartColis {
    const l = d.ligne;
    const heure = enMs(d.heureDepart);
    return {
      id: d.id,
      compagnieId: l.compagnieId,
      compagnieNom: l.compagnie.nom,
      gareOrigine: versGare(l.origine),
      gareDestination: versGare(l.destination),
      heureDepart: versIsoDouala(d.heureDepart),
      arriveePrevue: versIsoDouala(heure + l.dureeMinutes * 60_000),
      portColis: PORT_COLIS_PAR_DEFAUT,
      soutePct: pourcentageSoute(enSoute, d.bus?.capaciteSoute ?? 0),
      ouvertAuColis: (ETATS_DEPART_OUVERTS_AUX_COLIS as readonly string[]).includes(d.etat),
    };
  }

  async departsOuverts(critere: {
    gareOrigineId: string | null;
    compagnieId: string | null;
    villeDestination: string | null;
    apres: string;
  }): Promise<DepartColis[]> {
    if (
      (critere.gareOrigineId !== null && !estUuid(critere.gareOrigineId)) ||
      (critere.compagnieId !== null && !estUuid(critere.compagnieId))
    ) {
      return [];
    }
    const lignes = await this.prisma.depart.findMany({
      where: {
        etat: { in: [...ETATS_DEPART_OUVERTS_AUX_COLIS] },
        heureDepart: { gt: new Date(enMs(critere.apres)) },
        ligne: {
          ...(critere.compagnieId !== null ? { compagnieId: critere.compagnieId } : {}),
          ...(critere.gareOrigineId !== null ? { origineGareId: critere.gareOrigineId } : {}),
          ...(critere.villeDestination !== null
            ? { destination: { ville: { equals: critere.villeDestination, mode: "insensitive" } } }
            : {}),
        },
      },
      include: INCLUSION_DEPART,
      orderBy: [{ heureDepart: "asc" }, { id: "asc" }],
      take: LIMITE_DEPARTS,
    });
    const enSoute = await this.colisEnSoute(lignes.map((d) => d.id));
    return lignes.map((d) => this.versDepart(d, enSoute.get(d.id) ?? 0));
  }

  async depart(id: string): Promise<DepartColis | null> {
    if (!estUuid(id)) return null;
    const d = await this.prisma.depart.findUnique({ where: { id }, include: INCLUSION_DEPART });
    if (!d) return null;
    const enSoute = await this.colisEnSoute([d.id]);
    return this.versDepart(d, enSoute.get(d.id) ?? 0);
  }

  async gare(id: string): Promise<GareRef | null> {
    if (!estUuid(id)) return null;
    const g = await this.prisma.gare.findUnique({ where: { id } });
    return g ? versGare(g) : null;
  }

  async guichet(critere: {
    guichetId: string | null;
    utilisateurId: string;
    gareId: string | null;
  }): Promise<GuichetRef | null> {
    const inclusion = { gare: true } as const;
    let g;
    if (critere.guichetId !== null) {
      g = estUuid(critere.guichetId)
        ? await this.prisma.guichet.findUnique({
            where: { id: critere.guichetId },
            include: inclusion,
          })
        : null;
    } else {
      const personne = estUuid(critere.utilisateurId)
        ? await this.prisma.personne.findUnique({
            where: { id: critere.utilisateurId },
            select: { guichet: { include: inclusion } },
          })
        : null;
      g =
        personne?.guichet ??
        (estUuid(critere.gareId)
          ? await this.prisma.guichet.findFirst({
              where: { gareId: critere.gareId },
              orderBy: { rang: "asc" },
              include: inclusion,
            })
          : null);
    }
    return g
      ? { id: g.id, rang: g.rang, gare: versGare(g.gare), compagnieId: g.gare.compagnieId }
      : null;
  }

  async relais(id: string): Promise<RelaisRef | null> {
    if (!estUuid(id)) return null;
    const r = await this.prisma.relais.findUnique({
      where: { id },
      select: { id: true, nom: true, ville: true, actif: true },
    });
    return r ? { id: r.id, nom: r.nom, ville: r.ville, actif: r.actif } : null;
  }

  /** Remplacé au démarrage par `BranchementInterAgencesColis` (conventions en vigueur). */
  async interAgencesDisponible(): Promise<boolean> {
    return false;
  }
}
