import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./socle/app.module";
import { ComptesService } from "./socle/comptes/comptes.service";
import { PrismaService } from "./socle/db/prisma.service";
import { executerSeed } from "./socle/db/seed";

/** `node dist/seed.js` (après `node dist/migrate.js`) : données minimales de développement. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    await executerSeed({
      prisma: app.get(PrismaService),
      comptes: app.get(ComptesService),
      env: process.env,
      journal: (m) => console.log(m),
    });
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
