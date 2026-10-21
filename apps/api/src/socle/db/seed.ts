import { randomBytes, randomInt } from "node:crypto";
import { ComptesService } from "../comptes/comptes.service";
import { PrismaService } from "./prisma.service";
import { semerFixtures } from "./seed-fixtures";
import type { Role } from "../auth/roles";

/**
 * Données minimales pour pouvoir se connecter en développement : une compagnie de démonstration,
 * deux gares, un guichet et un compte par rôle de gestion. Rejouable sans doublon.
 *
 * Les secrets viennent de l'environnement (SEED_PIN, SEED_MOT_DE_PASSE) ; absents, ils sont tirés
 * au hasard et affichés une seule fois. Rien n'est écrit en dur dans le code.
 */

export interface ContexteSeed {
  prisma: PrismaService;
  comptes: ComptesService;
  env: Readonly<Record<string, string | undefined>>;
  /** Où écrire les messages (par défaut la console). */
  journal: (message: string) => void;
}

export interface CompteSemis {
  role: Role;
  telephone: string;
  secret: string;
  /** PIN de signature (le superviseur valide les caisses et les annulations avec lui). */
  pinSignature?: string;
  cree: boolean;
}

export const TELEPHONES_DEMO = {
  guichetier: "+237655000002",
  superviseur: "+237655000003",
  patron: "+237655000004",
  comptable: "+237655000005",
  afrimove: "+237655000006",
} as const;

function pinAleatoire(): string {
  // Évite les PIN refusés par la politique (suites, chiffres identiques).
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (new Set(pin).size >= 4 && !"0123456789".includes(pin)) return pin;
  }
}

export async function executerSeed(ctx: ContexteSeed): Promise<CompteSemis[]> {
  const { prisma, comptes, env, journal } = ctx;
  if (env["NODE_ENV"] === "production" && env["SEED_ALLOW_PRODUCTION"] !== "true") {
    throw new Error("Seed refusé en production (SEED_ALLOW_PRODUCTION=true pour le forcer)");
  }

  const compagnie = await prisma.compagnie.upsert({
    where: { code: "DEM" },
    update: {},
    create: { code: "DEM", nom: "Compagnie de démonstration" },
  });
  const douala = await prisma.gare.upsert({
    where: { compagnieId_code: { compagnieId: compagnie.id, code: "DLA" } },
    update: {},
    create: { compagnieId: compagnie.id, code: "DLA", nom: "Gare de Douala", ville: "Douala" },
  });
  await prisma.gare.upsert({
    where: { compagnieId_code: { compagnieId: compagnie.id, code: "YDE" } },
    update: {},
    create: { compagnieId: compagnie.id, code: "YDE", nom: "Gare de Yaoundé", ville: "Yaoundé" },
  });
  const guichet1 = await prisma.guichet.upsert({
    where: { gareId_rang: { gareId: douala.id, rang: 1 } },
    update: {},
    create: { gareId: douala.id, rang: 1 },
  });

  const pin = env["SEED_PIN"] ?? pinAleatoire();
  const motDePasse = env["SEED_MOT_DE_PASSE"] ?? randomBytes(15).toString("base64url");
  const aCreer: Array<{
    role: Role;
    nom: string;
    telephone: string;
    secret: string;
    compagnie: boolean;
    gare: boolean;
  }> = [
    {
      role: "guichetier",
      nom: "Guichetier démo",
      telephone: TELEPHONES_DEMO.guichetier,
      secret: pin,
      compagnie: true,
      gare: true,
    },
    {
      role: "superviseur",
      nom: "Superviseur démo",
      telephone: TELEPHONES_DEMO.superviseur,
      secret: motDePasse,
      compagnie: true,
      gare: true,
    },
    {
      role: "patron",
      nom: "Patron démo",
      telephone: TELEPHONES_DEMO.patron,
      secret: motDePasse,
      compagnie: true,
      gare: false,
    },
    {
      role: "comptable",
      nom: "Comptable démo",
      telephone: TELEPHONES_DEMO.comptable,
      secret: motDePasse,
      compagnie: true,
      gare: false,
    },
    {
      role: "afrimove",
      nom: "AfriMove démo",
      telephone: TELEPHONES_DEMO.afrimove,
      secret: motDePasse,
      compagnie: false,
      gare: false,
    },
  ];

  const pinSuperviseur = env["SEED_PIN_SUPERVISEUR"] ?? pinAleatoire();
  const resultat: CompteSemis[] = [];
  for (const c of aCreer) {
    const existant = await comptes.trouverParTelephone(c.telephone);
    if (existant) {
      resultat.push({ role: c.role, telephone: c.telephone, secret: "(inchangé)", cree: false });
      continue;
    }
    const estPin = c.role === "guichetier";
    const personne = await comptes.creer({
      nom: c.nom,
      telephone: c.telephone,
      roles: [c.role],
      compagnieId: c.compagnie ? compagnie.id : null,
      gareId: c.gare ? douala.id : null,
      ...(estPin ? { pin: c.secret } : { motDePasse: c.secret }),
    });
    // Le superviseur se connecte par mot de passe mais valide avec un PIN : sans `pinHache`, aucune caisse ni
    // annulation ne peut être validée (`POST /agence/superviseur/pin` répond 401 ; constat de la recette, AM-181).
    if (c.role === "superviseur") {
      await prisma.personne.update({
        where: { id: personne.id },
        data: { pinHache: await comptes.hacherPin(pinSuperviseur) },
      });
      resultat.push({
        role: c.role,
        telephone: c.telephone,
        secret: c.secret,
        pinSignature: pinSuperviseur,
        cree: true,
      });
      continue;
    }
    resultat.push({ role: c.role, telephone: c.telephone, secret: c.secret, cree: true });
  }

  // Le guichetier de démonstration tient le guichet 1 : sans ce lien, `GET /agence/vente/contexte` répond 404
  // GUICHET_INCONNU et le guichetier ne peut rien vendre (constat de la recette, AM-181). Rejouable, comptes déjà
  // existants compris.
  const guichetier = await comptes.trouverParTelephone(TELEPHONES_DEMO.guichetier);
  if (guichetier) {
    await prisma.personne.update({
      where: { id: guichetier.id },
      data: { guichetId: guichet1.id },
    });
  }

  journal(`Compagnie ${compagnie.code}, gares DLA/YDE, guichet 1 : prêts.`);
  for (const r of resultat) {
    journal(
      `  ${r.role.padEnd(11)} ${r.telephone}  ${r.cree ? `secret : ${r.secret}` : "déjà présent"}${
        r.pinSignature ? `  PIN de validation : ${r.pinSignature}` : ""
      }`,
    );
  }
  await semerFixtures(ctx);
  return resultat;
}
