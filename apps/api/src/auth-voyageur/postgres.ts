import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import {
  FichesVoyageur,
  StockageConnexion,
  type CodeEmis,
  type FicheVoyageur,
  type ReservationEnvoi,
} from "./ports";
import {
  ETAT_VIERGE,
  appliquerEchec,
  decider,
  type EtatLimite,
  type ReglesEnvoi,
  type ReglesEssais,
} from "./regles";

/**
 * Adaptateurs PostgreSQL (Prisma) de la connexion du voyageur (AM-023) : `StockageConnexion`
 * (tables `code_connexion_voyageur` et `limite_connexion_voyageur`) et `FichesVoyageur` (table
 * `fiche_voyageur`), migration « connexion_voyageur ».
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **quota d'envois** : `reserverEnvoi` prend un verrou consultatif de transaction propre au numéro
 *   (`pg_advisory_xact_lock(espace, hashtext(index))`), lit les codes déjà émis, applique `decider`
 *   (`regles.ts`) et insère ; deux demandes simultanées pour le même numéro passent l'une après
 *   l'autre et ne dépassent ni 1 envoi par 40 s ni 5 par heure. Deux numéros ne se gênent pas ;
 * - **usage unique du code** : `consommer` est un `UPDATE … WHERE consommeA IS NULL` ; une ligne
 *   modifiée = le code est à celui qui l'a consommé. Un déclencheur interdit en plus de toucher à
 *   l'empreinte ou à l'échéance d'un code, et de le rendre à nouveau valable ;
 * - **mauvais codes** : `noterEchec` prend le même verrou, applique `appliquerEchec` et écrit ; douze
 *   mauvais codes simultanés bloquent le numéro une seule fois ;
 * - **une fiche par personne** : clé primaire, écriture par `INSERT … ON CONFLICT DO NOTHING`.
 *
 * Le code n'est jamais rangé, seulement son empreinte HMAC ; le numéro non plus, seulement son index
 * aveugle.
 */

/** Espace des verrous consultatifs de la connexion du voyageur (un espace par usage, voir INTEGRATION.md). */
const ESPACE_VERROU_CONNEXION = 7_017_166;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LigneCode = Prisma.CodeConnexionVoyageurGetPayload<object>;
type LigneLimite = Prisma.LimiteConnexionVoyageurGetPayload<object>;

function versCode(l: LigneCode): CodeEmis {
  return {
    id: l.id,
    telephoneIndex: l.telephoneIndex,
    codeHache: l.codeHache,
    canal: l.canal === "whatsapp" ? "whatsapp" : "sms",
    creeA: l.creeA,
    expireA: l.expireA,
    consommeA: l.consommeA,
  };
}

function versEtat(l: LigneLimite | null): EtatLimite {
  if (!l) return { ...ETAT_VIERGE };
  return {
    echecs: l.echecs,
    blocages: l.blocages,
    bloqueJusqua: l.bloqueJusqua,
    dernierEchecA: l.dernierEchecA,
  };
}

@Injectable()
export class StockageConnexionPrisma extends StockageConnexion {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async reserverEnvoi(code: CodeEmis, regles: ReglesEnvoi): Promise<ReservationEnvoi> {
    return this.prisma.$transaction(async (tx) => {
      // Une demande à la fois par numéro : sans ce verrou, deux transactions liraient les mêmes
      // codes déjà émis et passeraient toutes deux sous le quota.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${ESPACE_VERROU_CONNEXION}::int, hashtext(${code.telephoneIndex}))`;
      const portee = Math.max(regles.fenetreMs, regles.intervalleMs);
      const emis = await tx.codeConnexionVoyageur.findMany({
        where: {
          telephoneIndex: code.telephoneIndex,
          creeA: { gt: new Date(code.creeA.getTime() - portee) },
        },
        select: { creeA: true },
      });
      const decision = decider(
        emis.map((e) => e.creeA),
        code.creeA,
        regles,
      );
      if (!decision.permis) {
        return { ok: false, raison: decision.raison, reessayerA: decision.reessayerA };
      }
      await tx.codeConnexionVoyageur.create({
        data: {
          id: code.id,
          telephoneIndex: code.telephoneIndex,
          codeHache: code.codeHache,
          canal: code.canal,
          creeA: code.creeA,
          expireA: code.expireA,
          consommeA: code.consommeA,
        },
      });
      return { ok: true };
    });
  }

  async annulerEnvoi(codeId: string): Promise<void> {
    if (!UUID.test(codeId)) return;
    await this.prisma.codeConnexionVoyageur.deleteMany({ where: { id: codeId } });
  }

  async dernierCode(telephoneIndex: string): Promise<CodeEmis | null> {
    const ligne = await this.prisma.codeConnexionVoyageur.findFirst({
      where: { telephoneIndex },
      orderBy: [{ creeA: "desc" }, { id: "desc" }],
    });
    return ligne ? versCode(ligne) : null;
  }

  async consommer(codeId: string, at: Date): Promise<boolean> {
    if (!UUID.test(codeId)) return false;
    // UPDATE conditionnel : une seule des requêtes simultanées modifie la ligne.
    const { count } = await this.prisma.codeConnexionVoyageur.updateMany({
      where: { id: codeId, consommeA: null },
      data: { consommeA: at },
    });
    return count === 1;
  }

  async etat(telephoneIndex: string): Promise<EtatLimite> {
    return versEtat(
      await this.prisma.limiteConnexionVoyageur.findUnique({ where: { telephoneIndex } }),
    );
  }

  async noterEchec(telephoneIndex: string, at: Date, regles: ReglesEssais): Promise<EtatLimite> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${ESPACE_VERROU_CONNEXION}::int, hashtext(${telephoneIndex}))`;
      const avant = versEtat(
        await tx.limiteConnexionVoyageur.findUnique({ where: { telephoneIndex } }),
      );
      const apres = appliquerEchec(avant, at, regles);
      // Un numéro déjà bloqué n'est pas modifié : `appliquerEchec` rend le même objet.
      if (apres === avant) return apres;
      await tx.limiteConnexionVoyageur.upsert({
        where: { telephoneIndex },
        create: { telephoneIndex, ...apres },
        update: apres,
      });
      return apres;
    });
  }

  async effacerEchecs(telephoneIndex: string): Promise<void> {
    await this.prisma.limiteConnexionVoyageur.deleteMany({ where: { telephoneIndex } });
  }
}

@Injectable()
export class FichesVoyageurPrisma extends FichesVoyageur {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ouvrir(personneId: string, at: Date): Promise<FicheVoyageur> {
    if (!UUID.test(personneId)) {
      throw new RangeError(`Fiche voyageur : identifiant de personne invalide (${personneId})`);
    }
    // ON CONFLICT DO NOTHING : la fiche existante garde sa date d'inscription.
    await this.prisma.ficheVoyageur.createMany({
      data: { personneId, inscritA: at },
      skipDuplicates: true,
    });
    const l = await this.prisma.ficheVoyageur.findUniqueOrThrow({ where: { personneId } });
    return {
      personneId: l.personneId,
      inscritA: l.inscritA,
      langue: l.langue === "en" ? "en" : "fr",
      pieceVerifiee: l.pieceVerifiee,
      pieceQuatreDerniers: l.pieceQuatreDerniers,
    };
  }
}
