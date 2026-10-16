import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";

export const TYPES_CIBLE = ["billet", "colis", "depart", "session"] as const;
export type TypeCible = (typeof TYPES_CIBLE)[number];

/** Événement métier (reprend `Evenement` de @afrimove/domain, avec des dates `Date`). */
export interface EvenementMetier {
  /** UUID créé sur l'appareil : le rejouer est sans effet. */
  id: string;
  type: string;
  at: Date;
  appareilId: string | null;
  auteurId: string | null;
  cible: { type: TypeCible; id: string };
  numeroPlage?: number | null;
  donnees: Record<string, unknown>;
}

export class EvenementInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvenementInvalide";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Port du journal d'événements : ajout et lecture, jamais de modification (la base le refuse aussi). */
export abstract class EvenementsRepository {
  /** Renvoie `false` si l'événement existait déjà (rejeu). */
  abstract ajouter(evenement: EvenementMetier): Promise<boolean>;
  abstract listerPourCible(cible: EvenementMetier["cible"]): Promise<EvenementMetier[]>;
}

@Injectable()
export class EvenementsPrisma extends EvenementsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(e: EvenementMetier): Promise<boolean> {
    const { count } = await this.prisma.evenement.createMany({
      skipDuplicates: true,
      data: [
        {
          id: e.id,
          type: e.type,
          at: e.at,
          appareilId: e.appareilId,
          auteurId: e.auteurId,
          cibleType: e.cible.type,
          cibleId: e.cible.id,
          numeroPlage: e.numeroPlage ?? null,
          donnees: e.donnees as object,
        },
      ],
    });
    return count === 1;
  }

  async listerPourCible(cible: EvenementMetier["cible"]): Promise<EvenementMetier[]> {
    const lignes = await this.prisma.evenement.findMany({
      where: { cibleType: cible.type, cibleId: cible.id },
      orderBy: [{ at: "asc" }, { seq: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      type: l.type,
      at: l.at,
      appareilId: l.appareilId,
      auteurId: l.auteurId,
      cible: { type: l.cibleType, id: l.cibleId },
      numeroPlage: l.numeroPlage,
      donnees: (l.donnees ?? {}) as Record<string, unknown>,
    }));
  }
}

/**
 * Journal d'événements : tout ce qui se passe est un événement horodaté, ajouté, jamais effacé.
 * Une annulation est un événement. Les futurs modules (billets, colis, caisse…) écrivent ici.
 */
@Injectable()
export class EvenementsService {
  constructor(private readonly repo: EvenementsRepository) {}

  /** Ajoute l'événement ; renvoie `false` s'il avait déjà été reçu (synchronisation rejouée). */
  async enregistrer(e: EvenementMetier): Promise<boolean> {
    if (!UUID.test(e.id))
      throw new EvenementInvalide("Identifiant d'événement invalide (UUID attendu)");
    if (!/^[a-z][a-z0-9_.]{1,63}$/.test(e.type))
      throw new EvenementInvalide("Type d'événement invalide");
    if (!(TYPES_CIBLE as readonly string[]).includes(e.cible.type) || !UUID.test(e.cible.id)) {
      throw new EvenementInvalide("Cible d'événement invalide");
    }
    if (Number.isNaN(e.at.getTime())) throw new EvenementInvalide("Date d'événement invalide");
    if (e.numeroPlage != null && (!Number.isInteger(e.numeroPlage) || e.numeroPlage < 0)) {
      throw new EvenementInvalide("Numéro de plage invalide");
    }
    return this.repo.ajouter(e);
  }

  historique(cible: EvenementMetier["cible"]): Promise<EvenementMetier[]> {
    return this.repo.listerPourCible(cible);
  }
}
