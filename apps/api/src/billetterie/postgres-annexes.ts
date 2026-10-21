import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import type { StockageBilletterie } from "./memoire";
import {
  AvisBillets,
  ColisDuDepart,
  ProchesVoyageur,
  Promotions,
  type AvisBilletterie,
  type Proche,
  type Promotion,
} from "./ports";

/**
 * Adaptateurs PostgreSQL des quatre ports de la billetterie qui n'avaient pas de table (lot B) :
 * `Promotions` (`promotion`), `ProchesVoyageur` (`proche_voyageur`), `ColisDuDepart` (lecture de
 * `colis`) et `AvisBillets` (`avis_billetterie`, en ajout seul).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v: string): boolean => UUID.test(v);

const CONTEXTE_TELEPHONE_PROCHE = "billetterie.proche.telephone";

/** Le code est cherché en majuscules sans espace, comme il est rangé (CHECK `promotion_code_normalise`). */
const normaliserCode = (code: string): string => code.trim().toUpperCase();

@Injectable()
export class PromotionsPrisma extends Promotions implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(code: string): Promise<Promotion | null> {
    const cle = normaliserCode(code);
    if (cle === "") return null;
    const l = await this.prisma.promotion.findFirst({ where: { code: cle, actif: true } });
    return l ? { code: l.code, type: "frais_offerts" } : null;
  }

  /** Crée ou réactive un code (administration, tests). */
  async ajouter(promotion: Promotion): Promise<void> {
    const code = normaliserCode(promotion.code);
    await this.prisma.promotion.upsert({
      where: { code },
      create: { code, type: promotion.type },
      update: { type: promotion.type, actif: true },
    });
  }

  /** Désactive un code : il n'est plus trouvé, la ligne reste pour l'historique. */
  async retirer(code: string): Promise<void> {
    await this.prisma.promotion.updateMany({
      where: { code: normaliserCode(code) },
      data: { actif: false },
    });
  }
}

@Injectable()
export class ProchesPrisma extends ProchesVoyageur implements StockageBilletterie {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async trouver(voyageurId: string, procheId: string): Promise<Proche | null> {
    // Un proche n'est visible que de son voyageur : deux comptes ne se lisent pas l'un l'autre.
    if (!estUuid(voyageurId) || !estUuid(procheId)) return null;
    const l = await this.prisma.procheVoyageur.findFirst({ where: { id: procheId, voyageurId } });
    if (!l) return null;
    return {
      id: l.id,
      nom: l.nom,
      telephone:
        l.telephoneChiffre === null
          ? null
          : this.chiffrement.dechiffrer(l.telephoneChiffre, CONTEXTE_TELEPHONE_PROCHE),
    };
  }

  /** Enregistre (ou remplace) un proche. Les comptes (AM-013) l'appelleront ; les tests aussi. */
  async ajouter(voyageurId: string, proche: Proche): Promise<void> {
    const telephoneChiffre =
      proche.telephone === null
        ? null
        : this.chiffrement.chiffrer(proche.telephone, CONTEXTE_TELEPHONE_PROCHE);
    await this.prisma.procheVoyageur.upsert({
      where: { id: proche.id },
      create: { id: proche.id, voyageurId, nom: proche.nom, telephoneChiffre },
      update: { voyageurId, nom: proche.nom, telephoneChiffre },
    });
  }
}

/**
 * Colis d'un départ, lus dans la table des colis (AM-163), jamais copiés :
 *  - `charges` : colis en soute (état `charge`) ou déjà en route (`en_route`) ;
 *  - `colisACharger` : colis enregistrés pour ce départ et pas encore chargés (`enregistre`).
 * Un colis déchargé, remis, perdu… n'est plus dans la soute et ne reste pas à charger.
 */
@Injectable()
export class ColisDuDepartPrisma extends ColisDuDepart implements StockageBilletterie {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async etat(departId: string): Promise<{ charges: number; colisACharger: number }> {
    if (!estUuid(departId)) return { charges: 0, colisACharger: 0 };
    const groupes = await this.prisma.colis.groupBy({
      by: ["etat"],
      where: { departId, etat: { in: ["enregistre", "charge", "en_route"] } },
      _count: { _all: true },
    });
    const nombre = (etat: string): number => groupes.find((g) => g.etat === etat)?._count._all ?? 0;
    return {
      charges: nombre("charge") + nombre("en_route"),
      colisACharger: nombre("enregistre"),
    };
  }
}

/**
 * Journal durable des avis de la billetterie. Chaque avis est écrit tel quel (ajout seul) : après un
 * redémarrage, on sait ce qui a été annoncé aux SMS, aux paiements et à la caisse. Les écouteurs
 * (paiements : `AbonnementAvisBilletterie`) enveloppent `publier` sans rien savoir du stockage.
 *
 * `publier` ne lève jamais : un journal qui ne s'écrit pas ne doit pas faire échouer la vente ou
 * l'annulation qui l'a déclenché (l'erreur est journalisée dans les logs de l'API).
 */
@Injectable()
export class AvisBilletsPrisma extends AvisBillets implements StockageBilletterie {
  readonly durable = true;
  private readonly journal = new Logger("AvisBilletterie");

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async publier(avis: AvisBilletterie): Promise<void> {
    try {
      await this.prisma.avisBilletterie.create({
        data: {
          type: avis.type,
          cible: cibleDe(avis),
          avis: avis as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.journal.error(
        `Avis ${avis.type} non écrit au journal : ${e instanceof Error ? e.message : "erreur inconnue"}`,
      );
    }
  }

  /** Les avis d'un type, du plus ancien au plus récent (exploitation, tests). */
  async de<T extends AvisBilletterie["type"]>(
    type: T,
  ): Promise<Extract<AvisBilletterie, { type: T }>[]> {
    const lignes = await this.prisma.avisBilletterie.findMany({
      where: { type },
      orderBy: { id: "asc" },
    });
    return lignes.map((l) => l.avis as unknown as Extract<AvisBilletterie, { type: T }>);
  }

  /** Les avis qui concernent un billet, un départ ou une commande. */
  async deLaCible(cible: string): Promise<AvisBilletterie[]> {
    const lignes = await this.prisma.avisBilletterie.findMany({
      where: { cible },
      orderBy: { id: "asc" },
    });
    return lignes.map((l) => l.avis as unknown as AvisBilletterie);
  }
}

/** L'objet principal de l'avis : le billet, sinon la commande, sinon le départ. */
function cibleDe(avis: AvisBilletterie): string {
  switch (avis.type) {
    case "billet.emis":
    case "billet.annule":
    case "billet.embarque":
    case "billet.non_presente":
      return avis.billetId;
    case "billet.reporte":
      return avis.billetId;
    case "commande.expiree":
    case "commande.payee":
      return avis.commandeId;
    case "depart.etat_change":
    case "depart.fusionne":
      return avis.departId;
  }
}
