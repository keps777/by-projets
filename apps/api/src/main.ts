import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./socle/app.module";
import { CONFIG, ConfigInvalide, chargerConfig, type AppConfig } from "./socle/config/config";
import { configurerApp } from "./socle/configurer-app";

async function demarrer(): Promise<void> {
  let config: AppConfig;
  try {
    config = chargerConfig(process.env);
  } catch (e) {
    if (e instanceof ConfigInvalide) {
      // Message clair, sans valeur : on liste les variables en défaut, jamais leur contenu.
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Corps brut conservé : la signature des accusés de livraison SMS se calcule sur le corps exact.
    rawBody: true,
    logger:
      config.env === "production" ? ["log", "warn", "error"] : ["log", "warn", "error", "debug"],
  });
  app.enableShutdownHooks();
  configurerApp(app, app.get<AppConfig>(CONFIG));
  await app.listen(config.port, config.host);
  new Logger("Démarrage").log(
    `API AfriMove à l'écoute sur ${config.host}:${config.port} (${config.env})`,
  );
}

void demarrer();
