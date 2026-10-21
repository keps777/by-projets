import { ValidationPipe, type INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import helmet from "helmet";
import type { AppConfig } from "./config/config";

/** Construit le document OpenAPI 3 à partir des contrôleurs et DTO de l'application. */
export function documentOpenApi(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle("API AfriMove")
    .setDescription(
      "Socle de l'API : authentification par rôle, journal d'audit, santé. " +
        "Les jetons s'obtiennent via /auth/* et s'envoient en `Authorization: Bearer`.",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, options);
}

/** Réglages communs au démarrage réel et aux tests HTTP. */
export function configurerApp(app: NestExpressApplication, config: AppConfig): void {
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  app.use(
    helmet({
      // L'API ne sert que du JSON (et l'interface /docs) : HSTS seulement en production, derrière HTTPS.
      hsts: config.env === "production",
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  });
  if (config.openapi) {
    const document = documentOpenApi(app);
    SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "openapi.json" });
  }
}
