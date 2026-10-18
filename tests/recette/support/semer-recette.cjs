/* eslint-disable */
/**
 * Données de la recette : ce que le seed de développement (apps/api/src/socle/db/seed.ts) ne sème pas et
 * dont une journée de gare a besoin. Lancé par le banc après `migrate.js` et `seed.js`, avec les mêmes
 * variables d'environnement que l'API :
 *
 *   node tests/recette/support/semer-recette.cjs <dossier apps/api>
 *
 * Il ouvre l'application Nest du dossier compilé (`dist/`), comme le fait `dist/seed.js`, pour passer par les
 * vrais services (chiffrement du téléphone, hachage du PIN). Rejouable sans doublon.
 *
 * Sème : guichets 2 et 3 de la gare de Douala, deux guichetiers de plus (un PIN chacun), un convoyeur, un
 * chauffeur, un contrôleur, une ligne Douala -> Yaoundé avec ses arrêts, trois bus. Les départs, eux, sont créés par chaque
 * scénario (ils dépendent de l'heure).
 */
const path = require("node:path");

const api = path.resolve(process.argv[2] ?? "apps/api");
const requireApi = (m) => require(require.resolve(m, { paths: [api] }));
const { NestFactory } = requireApi("@nestjs/core");
require(path.join(api, "node_modules/reflect-metadata"));
const { AppModule } = require(path.join(api, "dist/socle/app.module.js"));
const { ComptesService } = require(path.join(api, "dist/socle/comptes/comptes.service.js"));
const { PrismaService } = require(path.join(api, "dist/socle/db/prisma.service.js"));

const COMPTES = [
  { cle: "guichetier2", role: "guichetier", nom: "Guichetier 2", tel: "+237655000012", rang: 2 },
  { cle: "guichetier3", role: "guichetier", nom: "Guichetier 3", tel: "+237655000013", rang: 3 },
  { cle: "convoyeur", role: "convoyeur", nom: "Convoyeur recette", tel: "+237655000021" },
  { cle: "chauffeur", role: "chauffeur", nom: "Chauffeur recette", tel: "+237655000022" },
  { cle: "controleur", role: "controleur", nom: "Contrôleur recette", tel: "+237655000023" },
];

async function main() {
  const pin = process.env.SEED_PIN ?? "482916";
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  try {
    const prisma = app.get(PrismaService);
    const comptes = app.get(ComptesService);

    const compagnie = await prisma.compagnie.findUniqueOrThrow({ where: { code: "DEM" } });
    const gares = await prisma.gare.findMany({ where: { compagnieId: compagnie.id } });
    const douala = gares.find((g) => g.code === "DLA");
    const yaounde = gares.find((g) => g.code === "YDE");
    if (!douala || !yaounde) throw new Error("Le seed de développement n'a pas semé DLA et YDE");

    const guichets = {};
    for (const rang of [1, 2, 3]) {
      guichets[rang] = await prisma.guichet.upsert({
        where: { gareId_rang: { gareId: douala.id, rang } },
        update: {},
        create: { gareId: douala.id, rang },
      });
    }

    for (const c of COMPTES) {
      let p = await comptes.trouverParTelephone(c.tel);
      if (!p) {
        p = await comptes.creer({
          nom: c.nom,
          telephone: c.tel,
          roles: [c.role],
          compagnieId: compagnie.id,
          gareId: douala.id,
          pin,
        });
      }
      if (c.rang) {
        await prisma.personne.update({
          where: { id: p.id },
          data: { guichetId: guichets[c.rang].id },
        });
      }
    }

    let ligne = await prisma.ligne.findFirst({
      where: { compagnieId: compagnie.id, code: "DLA-YDE" },
    });
    if (!ligne) {
      ligne = await prisma.ligne.create({
        data: {
          compagnieId: compagnie.id,
          code: "DLA-YDE",
          origineGareId: douala.id,
          destinationGareId: yaounde.id,
          tarifClassique: 8000,
          tarifVip: 12000,
          tarifBagage: 500,
          dureeMinutes: 270,
        },
      });
      await prisma.arret.createMany({
        data: [
          { ligneId: ligne.id, ordre: 0, nom: "Douala", kmDepuisOrigine: 0, montee: true },
          { ligneId: ligne.id, ordre: 1, nom: "Édéa", kmDepuisOrigine: 65, montee: true },
          { ligneId: ligne.id, ordre: 2, nom: "Yaoundé", kmDepuisOrigine: 245, montee: false },
        ],
      });
    }
    const nbBus = await prisma.bus.count({ where: { compagnieId: compagnie.id } });
    for (let i = nbBus; i < 3; i++) {
      await prisma.bus.create({
        data: {
          compagnieId: compagnie.id,
          immatriculation: `LT 70${i + 1} RC`,
          capacite: 70,
          capaciteSoute: 20,
          classe: "classique",
        },
      });
    }

    console.log(
      "Recette : guichets 1 à 3, 3 guichetiers, convoyeur, chauffeur, contrôleur, ligne DLA-YDE, 3 bus prêts.",
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
