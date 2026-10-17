import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ColisModule } from "../../colis/colis.module";
import { ColisService } from "../../colis/colis.service";
import { ColisMemoire, ReferentielMemoire } from "../../colis/memoire";
import { ColisRepository, ReferentielColis } from "../../colis/ports";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART_BAF,
  GARE_BAF,
  GARE_DLA,
  GUICHET_2,
  HorlogeColis,
  demandeCreation,
  entete,
} from "../../colis/testing/app-colis-test";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { DefisRepository } from "../../socle/auth/defis.repository";
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
import { SmsGateway, SmsMock } from "../../socle/sms/sms.gateway";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { AnnuairePatrons } from "../annuaire";
import { BilletsService } from "../billets.service";
import { ConventionsService } from "../conventions.service";
import { EchangesService } from "../echanges.service";
import { InterAgencesModule } from "../inter-agences.module";
import {
  AnnuaireCompagniesMemoire,
  BilletsCorrespondanceMemoire,
  BilletsEmisMemoire,
  ColisInterAgencesMemoire,
  ContestationsMemoire,
  ConventionsMemoire,
  DepartsMemoire,
  ReglementsMemoire,
  ReglementsMobileMemoire,
} from "../memoire";
import type { DepartInterAgences } from "../modele";
import {
  AnnuaireCompagnies,
  BilletsCorrespondance,
  BilletsEmis,
  ColisInterAgences,
  Contestations,
  ConventionsRepository,
  DepartsInterAgences,
  Reglements,
  ReglementsMobile,
} from "../ports";
import { ReglementsService } from "../reglements.service";
import { TachesInterAgences } from "../taches.service";
import { versIsoDouala } from "../temps";

export { COMPAGNIE, DEPART_BAF, entete };

/** Alpha (la compagnie des tests du module colis), Oméga, et une troisième compagnie qui ne doit rien voir. */
export const ALPHA = COMPAGNIE;
export const OMEGA = AUTRE_COMPAGNIE;
export const BETA = "00000000-0000-4000-8000-0000000000c3";

export const PIN = "482915";

/** Douala → Bafoussam chez Alpha (10:00, arrivée 15:00) : le premier tronçon du colis. */
export const D_ALPHA_COLIS: DepartInterAgences = {
  id: DEPART_BAF.id,
  compagnieId: ALPHA,
  origine: "Douala",
  destination: "Bafoussam",
  heureDepart: "2026-11-02T10:00:00.000+01:00",
  arriveePrevue: "2026-11-02T15:00:00.000+01:00",
  bus: "LT 118 AB",
};
/** Bafoussam → Bamenda chez Oméga à 15:40 : 40 minutes après l'arrivée d'Alpha. */
export const D_OMEGA: DepartInterAgences = {
  id: "dep-ome-bafbam-261102-1540",
  compagnieId: OMEGA,
  origine: "Bafoussam",
  destination: "Bamenda",
  heureDepart: "2026-11-02T15:40:00.000+01:00",
  arriveePrevue: "2026-11-02T18:10:00.000+01:00",
  bus: "OU 302 NW",
};
/** Le départ suivant d'Oméga, le lendemain matin : le replacement gratuit. */
export const D_OMEGA_SUIVANT: DepartInterAgences = {
  id: "dep-ome-bafbam-261103-0800",
  compagnieId: OMEGA,
  origine: "Bafoussam",
  destination: "Bamenda",
  heureDepart: "2026-11-03T08:00:00.000+01:00",
  arriveePrevue: "2026-11-03T10:30:00.000+01:00",
  bus: "OU 117 NW",
};
/** Oméga part 10 minutes seulement après l'arrivée d'Alpha : moins que les 25 minutes garanties. */
export const D_OMEGA_TROP_TOT: DepartInterAgences = {
  id: "dep-ome-bafbam-261102-1510",
  compagnieId: OMEGA,
  origine: "Bafoussam",
  destination: "Bamenda",
  heureDepart: "2026-11-02T15:10:00.000+01:00",
  arriveePrevue: "2026-11-02T17:40:00.000+01:00",
  bus: "OU 410 NW",
};
/** Yaoundé → Bafoussam chez Alpha (11:00, arrivée 15:00) : le premier tronçon du billet voyageur. */
export const D_ALPHA_YDE: DepartInterAgences = {
  id: "dep-alp-ydebaf-261102-1100",
  compagnieId: ALPHA,
  origine: "Yaoundé",
  destination: "Bafoussam",
  heureDepart: "2026-11-02T11:00:00.000+01:00",
  arriveePrevue: "2026-11-02T15:00:00.000+01:00",
  bus: "LT 204 AB",
};
/** Bêta fait aussi Douala → Bafoussam, mais n'a aucune convention. */
export const D_BETA: DepartInterAgences = {
  id: "dep-bet-bafbam-261102-1600",
  compagnieId: BETA,
  origine: "Bafoussam",
  destination: "Bamenda",
  heureDepart: "2026-11-02T16:00:00.000+01:00",
  arriveePrevue: "2026-11-02T18:30:00.000+01:00",
  bus: "BX 009 NW",
};

/** Le colis type de la convention : 3 kg à 3 000 F, 1 600 F pour Alpha et 1 400 F pour Oméga. */
export const PARTS_CONVENTION = {
  colisType: { poidsKg: 3, prix: 3000 },
  lignes: [
    { troncon: "Douala → Bafoussam", parts: { [ALPHA]: 1400, [OMEGA]: null } },
    { troncon: "Bafoussam → Bamenda", parts: { [ALPHA]: null, [OMEGA]: 1200 } },
    { troncon: "Transbordement à Bafoussam", parts: { [ALPHA]: 200, [OMEGA]: 200 } },
  ],
};

export const VOYAGEURS_CONVENTION = {
  lignes: [
    {
      origine: "Yaoundé",
      via: "Bafoussam",
      destination: "Bamenda",
      premiere: ALPHA,
      parts: { [ALPHA]: 4000, [OMEGA]: 3000 },
    },
  ],
};

export function proposition(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    compagnieId: OMEGA,
    renouvellement: "trimestriel",
    parts: PARTS_CONVENTION,
    voyageurs: VOYAGEURS_CONVENTION,
    ...over,
  };
}

export async function creerAppInterAgencesTest(options: { config?: Record<string, string> } = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeColis();
  const auditRepo = new AuditMemoire();
  const evenements = new EvenementsMemoire();

  const module = await Test.createTestingModule({
    imports: [AppModule, ColisModule, InterAgencesModule],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(Horloge)
    .useValue(horloge)
    .overrideProvider(PersonnesRepository)
    .useValue(personnes)
    .overrideProvider(DefisRepository)
    .useValue(new DefisMemoire())
    .overrideProvider(AuditRepository)
    .useValue(auditRepo)
    .overrideProvider(EvenementsRepository)
    .useValue(evenements)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  const hachage = app.get(HachageService);
  let compteur = 900;

  /** Crée un compte (le PIN `PIN` posé aussi aux rôles qui se connectent par mot de passe) et un jeton. */
  async function compte(
    role: Role,
    opts: { compagnieId?: string | null; gareId?: string | null; nom?: string } = {},
  ) {
    compteur += 1;
    const voyageur = role === "voyageur" || role === "afrimove";
    const compagnieId =
      opts.compagnieId === undefined ? (voyageur ? null : ALPHA) : opts.compagnieId;
    const personne = await comptes.creer({
      nom: opts.nom ?? `Test ${role} ${compteur}`,
      telephone: `+2376556${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId,
      gareId: opts.gareId === undefined ? (voyageur ? null : GARE_DLA.id) : opts.gareId,
      pin: PIN,
      ...(METHODE_PAR_ROLE[role] === "motdepasse_sms"
        ? { motDePasse: "Un-mot-de-passe-solide" }
        : {}),
    });
    personnes.modifier(personne.id, { pinHache: await hachage.hacher(PIN) });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return {
      id: personne.id,
      jeton: accessToken,
      nom: personne.nom,
      telephone: comptes.telephoneEnClair(personne),
    };
  }

  const annuaire = app.get(AnnuaireCompagnies) as AnnuaireCompagniesMemoire;
  annuaire.compagnies.set(ALPHA, {
    id: ALPHA,
    nom: "Alpha",
    momo: { telephone: "+237670000001", operateur: "mtn" },
  });
  annuaire.compagnies.set(OMEGA, {
    id: OMEGA,
    nom: "Oméga",
    momo: { telephone: "+237670000002", operateur: "orange" },
  });
  annuaire.compagnies.set(BETA, {
    id: BETA,
    nom: "Bêta",
    momo: { telephone: "+237670000003", operateur: "mtn" },
  });
  const departs = app.get(DepartsInterAgences) as DepartsMemoire;
  for (const d of [
    D_ALPHA_COLIS,
    D_OMEGA,
    D_OMEGA_SUIVANT,
    D_OMEGA_TROP_TOT,
    D_ALPHA_YDE,
    D_BETA,
  ]) {
    departs.departs.set(d.id, d);
  }

  // Le module colis : gares et départ d'Alpha à 3 000 F le port (le colis type de la convention).
  const referentiel = app.get(ReferentielColis) as ReferentielMemoire;
  referentiel.gares.set(GARE_DLA.id, GARE_DLA);
  referentiel.gares.set(GARE_BAF.id, GARE_BAF);
  referentiel.departs.set(DEPART_BAF.id, { ...DEPART_BAF, portColis: 3000 });
  referentiel.guichets.set(GUICHET_2.id, GUICHET_2);

  const sms = app.get<SmsMock>(SmsGateway);
  const http = () => request(app.getHttpServer());

  /** `{ signature }` tel que l'appareil du patron l'envoie, à l'heure du serveur. */
  const signature = (pin = PIN, avance = 0) => ({
    signature: {
      pin,
      methode: "pin",
      signeA: versIsoDouala(horloge.maintenant().getTime() + avance),
    },
  });

  const equipe = {
    patronAlpha: await compte("patron", { compagnieId: ALPHA, nom: "Kamga Paul" }),
    patronOmega: await compte("patron", { compagnieId: OMEGA, nom: "Tchoua Henri" }),
    patronBeta: await compte("patron", { compagnieId: BETA, nom: "Mbarga Joseph" }),
    convoyeurAlpha: await compte("convoyeur", { compagnieId: ALPHA }),
    convoyeurOmega: await compte("convoyeur", { compagnieId: OMEGA }),
    convoyeurBeta: await compte("convoyeur", { compagnieId: BETA }),
    guichetierAlpha: await compte("guichetier", { compagnieId: ALPHA, gareId: GARE_DLA.id }),
    guichetierOmega: await compte("guichetier", { compagnieId: OMEGA, gareId: null }),
    afrimove: await compte("afrimove"),
    expediteur: await compte("voyageur", { nom: "Ngo Aïcha" }),
  };

  /** Alpha propose, Oméga signe : la convention est en vigueur. */
  async function conventionEnVigueur(over: Record<string, unknown> = {}): Promise<string> {
    const p = await http()
      .post("/inter-agences/conventions")
      .set(entete(equipe.patronAlpha.jeton))
      .send({ ...proposition(over), ...signature() });
    if (p.status !== 201) throw new Error(`Proposition refusée : ${JSON.stringify(p.body)}`);
    const s = await http()
      .post(`/inter-agences/conventions/${p.body.id}/signatures`)
      .set(entete(equipe.patronOmega.jeton))
      .send(signature());
    if (s.status !== 200) throw new Error(`Signature refusée : ${JSON.stringify(s.body)}`);
    return p.body.id as string;
  }

  /** Un colis d'Alpha de 3 kg, créé par l'expéditeur dans l'app (port de 3 000 F). */
  async function creerColis(over: Record<string, unknown> = {}) {
    const rep = await http()
      .post("/colis")
      .set(entete(equipe.expediteur.jeton))
      .send(demandeCreation({ photoRef: `photos/colis-${randomUUID()}.jpg`, ...over }));
    if (rep.status !== 201) throw new Error(`Création refusée : ${JSON.stringify(rep.body)}`);
    return { colisId: rep.body.colis.id as string, numero: rep.body.colis.numero as string };
  }

  /** Enregistre le colis en correspondance : Alpha jusqu'à Bafoussam, Oméga ensuite. */
  async function colisEnCorrespondance(
    departIds: string[] = [D_ALPHA_COLIS.id, D_OMEGA.id],
  ): Promise<{ colisId: string; numero: string }> {
    const colis = await creerColis();
    const rep = await http()
      .post("/inter-agences/colis")
      .set(entete(equipe.guichetierAlpha.jeton))
      .send({ colisId: colis.colisId, departIds });
    if (rep.status !== 201) throw new Error(`Enregistrement refusé : ${JSON.stringify(rep.body)}`);
    return colis;
  }

  const scanner = (
    jeton: string,
    colisId: string,
    sens: "remis_a" | "recu",
    compagnie: string,
    lieu?: string,
  ) =>
    http()
      .post("/inter-agences/transferts")
      .set(entete(jeton))
      .send({ colisId, sens, compagnie, ...(lieu ? { lieu } : {}) });

  /** Remis par le convoyeur d'Alpha puis reçu par celui d'Oméga : le passage de témoin est complet. */
  async function passerLeTemoin(colisId: string) {
    const a = await scanner(equipe.convoyeurAlpha.jeton, colisId, "remis_a", "Oméga", "Bafoussam");
    if (a.status !== 200) throw new Error(`remis_a refusé : ${JSON.stringify(a.body)}`);
    const b = await scanner(equipe.convoyeurOmega.jeton, colisId, "recu", "Oméga", "Bafoussam");
    if (b.status !== 200) throw new Error(`recu refusé : ${JSON.stringify(b.body)}`);
  }

  const billetsEmis = app.get(BilletsEmis) as BilletsEmisMemoire;
  /** Un billet vendu par Alpha, Yaoundé → Bafoussam, à 7 000 F. */
  function vendreBillet(over: Partial<ReturnType<typeof billetBase>> = {}) {
    const b = { ...billetBase(), ...over };
    billetsEmis.billets.set(b.id, b);
    return b;
  }

  return {
    app,
    config,
    http,
    horloge,
    personnes,
    auditRepo,
    sms,
    compte,
    equipe,
    signature,
    conventionEnVigueur,
    creerColis,
    colisEnCorrespondance,
    scanner,
    passerLeTemoin,
    vendreBillet,
    annuaire,
    departs,
    conventionsRepo: app.get(ConventionsRepository) as ConventionsMemoire,
    plansRepo: app.get(ColisInterAgences) as ColisInterAgencesMemoire,
    billetsRepo: app.get(BilletsCorrespondance) as BilletsCorrespondanceMemoire,
    reglementsRepo: app.get(Reglements) as ReglementsMemoire,
    contestationsRepo: app.get(Contestations) as ContestationsMemoire,
    operateur: app.get(ReglementsMobile) as ReglementsMobileMemoire,
    colisRepo: app.get(ColisRepository) as ColisMemoire,
    referentiel,
    conventions: app.get(ConventionsService),
    echanges: app.get(EchangesService),
    billets: app.get(BilletsService),
    reglements: app.get(ReglementsService),
    taches: app.get(TachesInterAgences),
    patrons: app.get(AnnuairePatrons),
    colis: app.get(ColisService),
    fermer: async () => {
      await app.close();
    },
  };
}

function billetBase() {
  return {
    id: randomUUID(),
    numero: "ALP-YDE-261102-0142",
    compagnieId: ALPHA,
    departId: D_ALPHA_YDE.id,
    voyageur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
    prix: 7000,
    annule: false,
  };
}

export type AppInterAgencesTest = Awaited<ReturnType<typeof creerAppInterAgencesTest>>;

/** Dernier SMS envoyé à ce numéro. */
export function dernierSmsA(t: Pick<AppInterAgencesTest, "sms">, telephone: string) {
  return [...t.sms.messages()].reverse().find((m) => m.telephone === telephone)?.message;
}

export const HEURE = 3_600_000;
export const JOUR = 24 * HEURE;

/** Avance l'horloge jusqu'à l'instant ISO donné (ne recule jamais). */
export function allerA(t: Pick<AppInterAgencesTest, "horloge">, iso: string): void {
  const ecart = Date.parse(iso) - t.horloge.maintenant().getTime();
  if (ecart < 0) throw new Error(`L'horloge est déjà après ${iso}`);
  t.horloge.avancer(ecart);
}
