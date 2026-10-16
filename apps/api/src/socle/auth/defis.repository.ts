import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import type { Role } from "./roles";

export type ObjetDefi = "connexion_voyageur" | "connexion_direction";

export interface Defi {
  id: string;
  objet: ObjetDefi;
  telephoneIndex: string;
  /** Numéro chiffré (voyageur), effacé dès que le défi est consommé. */
  telephoneChiffre: string | null;
  personneId: string | null;
  role: Role | null;
  codeHache: string;
  expireA: Date;
  essais: number;
  consommeA: Date | null;
  creeA: Date;
}

/** Port de persistance des défis SMS (code à usage unique). */
export abstract class DefisRepository {
  abstract creer(
    defi: Omit<Defi, "essais" | "consommeA" | "creeA"> & { creeA?: Date },
  ): Promise<Defi>;
  abstract trouver(id: string): Promise<Defi | null>;
  /** Nombre de défis créés pour ce numéro depuis `depuis` (limite de demandes). */
  abstract compterDepuis(objet: ObjetDefi, telephoneIndex: string, depuis: Date): Promise<number>;
  /** Ajoute un essai raté et renvoie le total. */
  abstract incrementerEssais(id: string): Promise<number>;
  /** Marque le défi consommé ; renvoie `false` s'il l'était déjà (usage unique, même en concurrence). */
  abstract consommer(id: string, at: Date): Promise<boolean>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DefisPrisma extends DefisRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  creer(defi: Omit<Defi, "essais" | "consommeA" | "creeA"> & { creeA?: Date }): Promise<Defi> {
    return this.prisma.defiOtp.create({ data: defi });
  }

  async trouver(id: string): Promise<Defi | null> {
    if (!UUID.test(id)) return null;
    return this.prisma.defiOtp.findUnique({ where: { id } });
  }

  compterDepuis(objet: ObjetDefi, telephoneIndex: string, depuis: Date): Promise<number> {
    return this.prisma.defiOtp.count({
      where: { objet, telephoneIndex, creeA: { gte: depuis } },
    });
  }

  async incrementerEssais(id: string): Promise<number> {
    const defi = await this.prisma.defiOtp.update({
      where: { id },
      data: { essais: { increment: 1 } },
      select: { essais: true },
    });
    return defi.essais;
  }

  async consommer(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.defiOtp.updateMany({
      where: { id, consommeA: null },
      data: { consommeA: at, telephoneChiffre: null },
    });
    return count === 1;
  }
}
