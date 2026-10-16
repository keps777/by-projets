import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { GardeAuthentification, GardeRoles } from "./auth/gardes";
import { ChiffrementModule } from "./chiffrement/chiffrement.module";
import { CONFIG, type AppConfig } from "./config/config";
import { ConfigModule } from "./config/config.module";
import { DbModule } from "./db/db.module";
import { EvenementsModule } from "./evenements/evenements.module";
import { SanteController } from "./sante/sante.controller";

/**
 * Socle de l'API. Les gardes sont globales et s'exécutent dans cet ordre :
 * limitation de débit, authentification, rôles (refusé par défaut).
 */
@Module({
  imports: [
    ConfigModule,
    ChiffrementModule,
    DbModule,
    AuditModule,
    EvenementsModule,
    AuthModule,
    ThrottlerModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        skipIf: () => !config.limitationDebit,
      }),
    }),
  ],
  controllers: [SanteController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: GardeAuthentification },
    { provide: APP_GUARD, useExisting: GardeRoles },
  ],
})
export class AppModule {}
