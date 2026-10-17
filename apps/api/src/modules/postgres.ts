import { Injectable } from "@nestjs/common";
import { PrismaService } from "../socle/db/prisma.service";
import { moduleDuCatalogue } from "./catalogue";
import type { StockageModules } from "./memoire";
import { cleVille, type ExceptionModule, type PorteeException, type ReglageModule } from "./portee";
import { AnnuaireAgences, ReglagesModules, type GareAnnuaire } from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) du moteur des modules (AM-126).
 *
 * Tables : `module_compagnie` (règle générale de l'agence, une ligne seulement si l'agence a réglé le
 * module), `module_exception` (exceptions par gare ou par ville), `compagnie` et `gare` (annuaire).
 * Chaque méthode est atomique et ne touche qu'une ligne, sauf `definirAgence` qui remet à plat les
 * exceptions du module dans la même transaction que la règle générale.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant qui n'est pas un UUID ne peut être celui d'aucune agence ni d'aucune gare. */
const estUuid = (valeur: string): boolean => UUID.test(valeur);

@Injectable()
export class ReglagesModulesPrisma extends ReglagesModules implements StockageModules {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(agenceId: string): Promise<ReadonlyMap<string, ReglageModule>> {
    const reglages = new Map<string, { actif: boolean | null; exceptions: ExceptionModule[] }>();
    if (!estUuid(agenceId)) return reglages;

    const [generales, exceptions] = await Promise.all([
      this.prisma.moduleCompagnie.findMany({ where: { compagnieId: agenceId } }),
      this.prisma.moduleException.findMany({
        where: { compagnieId: agenceId },
        orderBy: [{ creeA: "asc" }, { id: "asc" }],
      }),
    ]);
    for (const g of generales) reglages.set(g.code, { actif: g.actif, exceptions: [] });
    for (const e of exceptions) {
      // Un module peut avoir des exceptions sans règle générale (l'agence n'a rien réglé pour lui).
      const reglage = reglages.get(e.code) ?? { actif: null, exceptions: [] };
      reglages.set(e.code, reglage);
      if (e.porteeType === "gare" && e.gareId !== null) {
        reglage.exceptions.push({ portee: { type: "gare", id: e.gareId }, actif: e.actif });
      } else if (e.porteeType === "ville" && e.villeNom !== null) {
        reglage.exceptions.push({ portee: { type: "ville", nom: e.villeNom }, actif: e.actif });
      }
    }
    return reglages;
  }

  async definirAgence(agenceId: string, code: string, actif: boolean): Promise<void> {
    const nom = moduleDuCatalogue(code)?.nom ?? code;
    await this.prisma.$transaction([
      this.prisma.moduleCompagnie.upsert({
        where: { compagnieId_code: { compagnieId: agenceId, code } },
        create: { compagnieId: agenceId, code, nom, actif },
        update: { nom, actif },
      }),
      // « Toute l'agence » remet à plat : les exceptions du module disparaissent avec le réglage.
      this.prisma.moduleException.deleteMany({ where: { compagnieId: agenceId, code } }),
    ]);
  }

  async poserException(agenceId: string, code: string, exception: ExceptionModule): Promise<void> {
    const { portee, actif } = exception;
    if (portee.type === "gare") {
      // INSERT … ON CONFLICT : deux réglages simultanés de la même gare se terminent sur une ligne.
      await this.prisma.$executeRaw`
        INSERT INTO module_exception (id, "compagnieId", code, "porteeType", "gareId", actif)
        VALUES (gen_random_uuid(), ${agenceId}::uuid, ${code}, 'gare', ${portee.id}::uuid, ${actif})
        ON CONFLICT ("compagnieId", code, "gareId") DO UPDATE SET actif = EXCLUDED.actif`;
    } else {
      await this.prisma.$executeRaw`
        INSERT INTO module_exception (id, "compagnieId", code, "porteeType", "villeCle", "villeNom", actif)
        VALUES (gen_random_uuid(), ${agenceId}::uuid, ${code}, 'ville', ${cleVille(portee.nom)}, ${portee.nom}, ${actif})
        ON CONFLICT ("compagnieId", code, "villeCle")
        DO UPDATE SET actif = EXCLUDED.actif, "villeNom" = EXCLUDED."villeNom"`;
    }
  }

  async retirerException(agenceId: string, code: string, portee: PorteeException): Promise<void> {
    if (portee.type === "gare") {
      if (!estUuid(portee.id)) return;
      await this.prisma.moduleException.deleteMany({
        where: { compagnieId: agenceId, code, porteeType: "gare", gareId: portee.id },
      });
    } else {
      await this.prisma.moduleException.deleteMany({
        where: { compagnieId: agenceId, code, porteeType: "ville", villeCle: cleVille(portee.nom) },
      });
    }
  }
}

@Injectable()
export class AnnuaireAgencesPrisma extends AnnuaireAgences implements StockageModules {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async agenceExiste(agenceId: string): Promise<boolean> {
    if (!estUuid(agenceId)) return false;
    const agence = await this.prisma.compagnie.findUnique({
      where: { id: agenceId },
      select: { id: true },
    });
    return agence !== null;
  }

  async gares(agenceId: string): Promise<readonly GareAnnuaire[]> {
    if (!estUuid(agenceId)) return [];
    const gares = await this.prisma.gare.findMany({
      where: { compagnieId: agenceId },
      select: { id: true, nom: true, ville: true },
      orderBy: [{ ville: "asc" }, { nom: "asc" }],
    });
    return gares;
  }
}
