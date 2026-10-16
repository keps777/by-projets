import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ComptesService } from "../comptes/comptes.service";
import { PersonnesPrisma, PersonnesRepository } from "../comptes/personnes.repository";
import { CONFIG, type AppConfig } from "../config/config";
import { Horloge, HorlogeSysteme } from "../horloge";
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
    { provide: SmsGateway, useClass: SmsMock },
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
