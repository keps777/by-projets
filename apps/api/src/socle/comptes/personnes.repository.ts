import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import type { Role } from "../auth/roles";

/** Une personne telle que stockée : le téléphone est chiffré, les secrets sont hachés. */
export interface PersonneEnregistree {
  id: string;
  nom: string;
  telephoneChiffre: string;
  telephoneIndex: string;
  roles: Role[];
  compagnieId: string | null;
  gareId: string | null;
  actif: boolean;
  pinHache: string | null;
  motDePasseHache: string | null;
  echecsConnexion: number;
  bloqueJusqua: Date | null;
}

export type NouvellePersonne = Omit<
  PersonneEnregistree,
  "id" | "echecsConnexion" | "bloqueJusqua"
> & { id?: string };

export class TelephoneDejaUtilise extends Error {
  constructor() {
    super("Ce numéro est déjà associé à un compte");
    this.name = "TelephoneDejaUtilise";
  }
}

/** Port de persistance des personnes (implémentations : Prisma en production, mémoire dans les tests). */
export abstract class PersonnesRepository {
  abstract trouverParId(id: string): Promise<PersonneEnregistree | null>;
  abstract trouverParTelephoneIndex(index: string): Promise<PersonneEnregistree | null>;
  /** Lève `TelephoneDejaUtilise` si l'index existe déjà. */
  abstract creer(personne: NouvellePersonne): Promise<PersonneEnregistree>;
  abstract enregistrerEchec(id: string, echecs: number, bloqueJusqua: Date | null): Promise<void>;
  abstract enregistrerSucces(id: string, at: Date): Promise<void>;
  /** Les comptes actifs d'une compagnie qui ont l'un de ces rôles (rapport du soir : patron et superviseurs). */
  abstract listerActifsParRoles(
    compagnieId: string,
    roles: readonly Role[],
  ): Promise<PersonneEnregistree[]>;
}

@Injectable()
export class PersonnesPrisma extends PersonnesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouverParId(id: string): Promise<PersonneEnregistree | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return this.prisma.personne.findUnique({ where: { id } });
  }

  trouverParTelephoneIndex(index: string): Promise<PersonneEnregistree | null> {
    return this.prisma.personne.findUnique({ where: { telephoneIndex: index } });
  }

  async creer(personne: NouvellePersonne): Promise<PersonneEnregistree> {
    try {
      return await this.prisma.personne.create({ data: personne });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new TelephoneDejaUtilise();
      throw e;
    }
  }

  async enregistrerEchec(id: string, echecs: number, bloqueJusqua: Date | null): Promise<void> {
    await this.prisma.personne.update({
      where: { id },
      data: { echecsConnexion: echecs, bloqueJusqua },
    });
  }

  async enregistrerSucces(id: string, at: Date): Promise<void> {
    await this.prisma.personne.update({
      where: { id },
      data: { echecsConnexion: 0, bloqueJusqua: null, derniereConnexionA: at },
    });
  }

  async listerActifsParRoles(
    compagnieId: string,
    roles: readonly Role[],
  ): Promise<PersonneEnregistree[]> {
    if (!/^[0-9a-f-]{36}$/i.test(compagnieId)) return [];
    return this.prisma.personne.findMany({
      where: { compagnieId, actif: true, roles: { hasSome: [...roles] } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
  }
}
