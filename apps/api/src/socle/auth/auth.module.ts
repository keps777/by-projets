import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ComptesService } from "../comptes/comptes.service";
import { PersonnesPrisma, PersonnesRepository } from "../comptes/personnes.repository";
import { CONFIG, type AppConfig } from "../config/config";
import { Horloge, HorlogeSysteme } from "../horloge";
import { SmsGatewayPasserelle, SmsModule } from "../../sms/sms.module";
import { SmsGateway, SmsMock } from "../sms/sms.gateway";
import { AuthController, MoiController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DefisPrisma, DefisRepository } from "./defis.repository";
import { GardeAuthentification, GardeRoles } from "./gardes";
import { HachageService } from "./hachage.service";
import { TokensService } from "./tokens.service";

@Global()
@Module({
  imports: [
    // Les codes de connexion partent par la passerelle SMS (file, reprise, secours, journal).
    SmsModule,
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.jwt.secret }),
    }),
  ],
  controllers: [AuthController, MoiController],
  providers: [
    AuthService,
    ComptesService,
    HachageService,
    TokensService,
    GardeAuthentification,
    GardeRoles,
    { provide: PersonnesRepository, useClass: PersonnesPrisma },
    { provide: DefisRepository, useClass: DefisPrisma },
    {
      provide: SmsGateway,
      inject: [CONFIG, SmsGatewayPasserelle],
      // Hors test : la passerelle (file, reprise, secours, journal). En test (NODE_ENV=test), le
      // simulateur du socle, dont les tests lisent la boîte (`dernierCode`, `messages()`) ; la
      // passerelle a ses propres tests dans src/sms.
      useFactory: (config: AppConfig, passerelle: SmsGatewayPasserelle): SmsGateway =>
        config.env === "test" ? new SmsMock(config) : passerelle,
    },
    { provide: Horloge, useClass: HorlogeSysteme },
  ],
  exports: [
    ComptesService,
    HachageService,
    TokensService,
    PersonnesRepository,
    GardeAuthentification,
    GardeRoles,
    SmsGateway,
  ],
})
export class AuthModule {}
