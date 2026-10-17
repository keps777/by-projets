import "reflect-metadata";
import { Controller, Get } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { AuditService } from "../../socle/audit/audit.service";
import { DefisRepository } from "../../socle/auth/defis.repository";
import { Roles } from "../../socle/auth/decorateurs";
import { HachageService } from "../../socle/auth/hachage.service";
import { METHODE_PAR_ROLE, type Role } from "../../socle/auth/roles";
import { TokensService } from "../../socle/auth/tokens.service";
import { ComptesService } from "../../socle/comptes/comptes.service";
import { PersonnesRepository } from "../../socle/comptes/personnes.repository";
import { CONFIG } from "../../socle/config/config";
import { configurerApp } from "../../socle/configurer-app";
import { PrismaService } from "../../socle/db/prisma.service";
import { EvenementsRepository } from "../../socle/evenements/evenements.service";
import { Horloge } from "../../socle/horloge";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { ModuleRequis } from "../garde-module";
import { AnnuaireAgences, ReglagesModules } from "../ports";
import type { AnnuaireMemoire, ReglagesMemoire } from "../memoire";
import { ModulesModule } from "../modules.module";
import { ModulesService } from "../modules.service";

export const AGENCE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_AGENCE = "00000000-0000-4000-8000-0000000000c2";
export const DOUALA_AKWA = "00000000-0000-4000-8000-0000000000a1";
export const DOUALA_BONANJO = "00000000-0000-4000-8000-0000000000a2";
export const YAOUNDE_MVAN = "00000000-0000-4000-8000-0000000000a3";
export const BAFOUSSAM = "00000000-0000-4000-8000-0000000000a4";
export const GARE_AUTRE_AGENCE = "00000000-0000-4000-8000-0000000000b1";

export const PIN_PATRON = "482915";

/** Route factice d'un autre module (le colis) protégée par `@ModuleRequis`, pour tester la garde. */
@Controller("colis-test")
export class ColisTestController {
  @Roles("guichetier", "patron")
  @ModuleRequis("colis")
  @Get("liste")
  liste(): { ok: true } {
    return { ok: true };
  }

  @Roles("guichetier", "patron")
  @ModuleRequis("guichet_caisse")
  @Get("caisse")
  caisse(): { ok: true } {
    return { ok: true };
  }
}

export interface OptionsAppModulesTest {
  config?: Record<string, string>;
  debut?: Date;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec le moteur des modules branché sur ses
 * adaptateurs en mémoire. Le socle de test n'importe pas `ModulesModule` : on refait le même
 * montage ici pour ne pas toucher au socle.
 */
export async function creerAppModulesTest(options: OptionsAppModulesTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut);
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({
    imports: [AppModule, ModulesModule],
    controllers: [ColisTestController],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(PersonnesRepository)
    .useValue(personnes)
    .overrideProvider(DefisRepository)
    .useValue(new DefisMemoire())
    .overrideProvider(AuditRepository)
    .useValue(auditRepo)
    .overrideProvider(EvenementsRepository)
    .useValue(new EvenementsMemoire())
    .overrideProvider(Horloge)
    .useValue(horloge)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  const hachage = app.get(HachageService);
  const annuaire = app.get(AnnuaireAgences) as AnnuaireMemoire;
  annuaire.declarer(AGENCE, [
    { id: DOUALA_AKWA, nom: "Douala Akwa", ville: "Douala" },
    { id: DOUALA_BONANJO, nom: "Douala Bonanjo", ville: "Douala" },
    { id: YAOUNDE_MVAN, nom: "Yaoundé Mvan", ville: "Yaoundé" },
    { id: BAFOUSSAM, nom: "Bafoussam", ville: "Bafoussam" },
  ]);
  annuaire.declarer(AUTRE_AGENCE, [{ id: GARE_AUTRE_AGENCE, nom: "Douala Akwa", ville: "Douala" }]);
  let compteur = 700;

  /** Crée un compte, lui donne le PIN `PIN_PATRON` et renvoie son identifiant et un jeton. */
  async function compte(
    role: Role,
    opts: { compagnieId?: string | null; gareId?: string | null } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const compagnieId = opts.compagnieId === undefined ? AGENCE : opts.compagnieId;
    const gareId = opts.gareId === undefined ? DOUALA_AKWA : opts.gareId;
    const personne = await comptes.creer({
      nom: `Test ${role}`,
      telephone: `+2376552${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId,
      gareId,
      pin: PIN_PATRON,
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    // Un patron se connecte par mot de passe : son PIN de signature est posé à part.
    personnes.modifier(personne.id, { pinHache: await hachage.hacher(PIN_PATRON) });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken };
  }

  const http = () => request(app.getHttpServer());
  const iso = (decalageMs = 0) => versIso(new Date(horloge.maintenant().getTime() + decalageMs));

  /** Corps signé d'un changement de module (`ChangerModule` des contrats patron). */
  function corps(
    code: string,
    actif: boolean,
    portee: Record<string, unknown> = { type: "agence" },
    pin = PIN_PATRON,
  ) {
    return {
      code,
      actif,
      portee,
      signature: { pin, methode: "pin", signeA: iso() },
    };
  }

  return {
    app,
    http,
    horloge,
    /** L'heure du serveur de test, en ISO Douala (ce que signe l'appareil). */
    iso,
    personnes,
    auditRepo,
    audit: app.get(AuditService),
    reglages: app.get(ReglagesModules) as ReglagesMemoire,
    annuaire,
    modules: app.get(ModulesService),
    compte,
    corps,
    fermer: () => app.close(),
  };
}

function versIso(d: Date): string {
  const decale = new Date(d.getTime() + 3_600_000).toISOString();
  return decale.replace("Z", "+01:00");
}

export type AppModulesTest = Awaited<ReturnType<typeof creerAppModulesTest>>;
