import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AnnuaireAdminMemoire, LignesMemoire, ParcBusMemoire } from "../../administration/memoire";
import { AnnuaireAdmin, Lignes, ParcBus } from "../../administration/ports";
import { SessionsMemoire } from "../../caisse/memoire";
import { ReglesMemoire } from "../../caisse/memoire";
import { SessionsCaisse, ReglesAgence, type SessionStockee } from "../../caisse/ports";
import {
  ActiviteColisMemoire,
  ReferentielMemoire,
  VentesBilletsMemoire,
} from "../../rapport/memoire";
import { ActiviteColis, ReferentielRapport, VentesBillets } from "../../rapport/ports";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { DefisRepository } from "../../socle/auth/defis.repository";
import { HachageService } from "../../socle/auth/hachage.service";
import { METHODE_PAR_ROLE, type Role } from "../../socle/auth/roles";
import { TokensService } from "../../socle/auth/tokens.service";
import { ChiffrementService } from "../../socle/chiffrement/chiffrement.service";
import { CONTEXTE_TELEPHONE, ComptesService } from "../../socle/comptes/comptes.service";
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
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import {
  AlertesEcritesMemoire,
  EquipePatronMemoire,
  ExploitationPatronMemoire,
  ReferentielPatronMemoire,
  ReglesPatronMemoire,
} from "../memoire";
import {
  AlertesEcrites,
  EquipePatron,
  ExploitationPatron,
  ReferentielPatron,
  ReglesPatron,
} from "../ports";
import type { MembrePatron } from "../modele";
import { droitsParDefaut } from "../modele";

/** Identifiants fixes du jeu d'essai. */
export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const GARE_AKWA = "00000000-0000-4000-8000-0000000000a1";
export const GARE_MVAN = "00000000-0000-4000-8000-0000000000a2";
export const GARE_AUTRE = "00000000-0000-4000-8000-0000000000b1";
export const GUICHET_AKWA_1 = "00000000-0000-4000-8000-0000000000e1";
export const GUICHET_AKWA_2 = "00000000-0000-4000-8000-0000000000e2";
export const GUICHET_MVAN_1 = "00000000-0000-4000-8000-0000000000e3";
export const ERIC = "00000000-0000-4000-8000-0000000000f1";
export const JOSEPH = "00000000-0000-4000-8000-0000000000f2";
export const PAUL = "00000000-0000-4000-8000-0000000000f3";
export const SAMUEL = "00000000-0000-4000-8000-0000000000f4";
export const MARIE_AUTRE = "00000000-0000-4000-8000-0000000000f9";
export const LIGNE_DLA_YDE = "00000000-0000-4000-8000-0000000000d1";
export const PIN_PATRON = "482915";

export async function creerAppPatronTest() {
  const config = configTest();
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe();
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({ imports: [AppModule] })
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
  const chiffrement = app.get(ChiffrementService);
  const sms = app.get<SmsMock>(SmsGateway);
  const referentiel = app.get(ReferentielPatron) as ReferentielPatronMemoire;
  const exploitation = app.get(ExploitationPatron) as ExploitationPatronMemoire;
  const alertes = app.get(AlertesEcrites) as AlertesEcritesMemoire;
  const equipe = app.get(EquipePatron) as EquipePatronMemoire;
  // Les lignes sont celles du module administration (seul propriétaire de `ligne`, `horaire_ligne`, `reglage_ligne`).
  const lignes = app.get(Lignes) as LignesMemoire;
  const annuaireAdmin = app.get(AnnuaireAdmin) as AnnuaireAdminMemoire;
  const parcBus = app.get(ParcBus) as ParcBusMemoire;
  const regles = app.get(ReglesPatron) as ReglesPatronMemoire;
  const ventes = app.get(VentesBillets) as VentesBilletsMemoire;
  const colis = app.get(ActiviteColis) as ActiviteColisMemoire;
  const referentielRapport = app.get(ReferentielRapport) as ReferentielMemoire;
  const sessions = app.get(SessionsCaisse) as SessionsMemoire;
  const reglesCaisse = app.get(ReglesAgence) as ReglesMemoire;

  // L'équipe créée par le patron a un compte qui se connecte ; la désactivation coupe ses jetons.
  equipe.surCreation = (m) => {
    void personnes.creer({
      id: m.id,
      nom: m.nom,
      telephoneChiffre: m.telephoneChiffre,
      telephoneIndex: m.telephoneIndex,
      roles: [m.role],
      compagnieId: m.compagnieId,
      gareId: m.gareId,
      actif: true,
      pinHache: m.pinHache,
      motDePasseHache: m.motDePasseHache,
    });
  };
  equipe.surDesactivation = (id) => personnes.modifier(id, { actif: false });

  let compteur = 800;
  /** Un compte avec le PIN `PIN_PATRON` et son jeton. */
  async function compte(
    role: Role,
    opts: { compagnieId?: string | null; gareId?: string | null } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const compagnieId = opts.compagnieId === undefined ? COMPAGNIE : opts.compagnieId;
    const gareId = opts.gareId === undefined ? GARE_AKWA : opts.gareId;
    const p = await comptes.creer({
      nom: role === "patron" ? "Alpha Voyages Patron" : `Test ${role}`,
      telephone: `+2376553${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId,
      gareId,
      pin: PIN_PATRON,
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    personnes.modifier(p.id, { pinHache: await hachage.hacher(PIN_PATRON) });
    const { accessToken } = await tokens.emettre({
      sub: p.id,
      role,
      cid: p.compagnieId,
      gid: p.gareId,
    });
    return { id: p.id, jeton: accessToken };
  }

  const tel = (n: string): string => chiffrement.chiffrer(n, CONTEXTE_TELEPHONE);
  const membre = (
    m: Partial<MembrePatron> & Pick<MembrePatron, "id" | "nom" | "role">,
  ): MembrePatron => ({
    gareId: GARE_AKWA,
    gareNom: "Akwa",
    guichetId: null,
    guichetRang: null,
    bus: null,
    situation: "repos",
    enServiceDepuis: null,
    actif: true,
    bloqueJusqua: null,
    pinProvisoireJusqua: null,
    creeA: new Date("2026-06-01T08:00:00.000Z"),
    telephoneChiffre: tel(`+23767700${String(m.id.charCodeAt(m.id.length - 1)).padStart(4, "0")}`),
    operateur: "MTN",
    salaire: 90_000,
    jourDePaie: 30,
    droits: droitsParDefaut(m.role),
    billets90: 120,
    ...m,
  });

  /** La compagnie Alpha Voyages (2 gares, 3 guichets, 4 personnes, une ligne) et une autre compagnie. */
  function semer(): void {
    referentiel.declarer(
      { id: COMPAGNIE, nom: "Alpha Voyages" },
      [
        {
          id: GARE_AKWA,
          code: "DLA",
          nom: "Akwa",
          ville: "Douala",
          nbQuais: 3,
          guichets: [
            { id: GUICHET_AKWA_1, rang: 1 },
            { id: GUICHET_AKWA_2, rang: 2 },
          ],
          appareils: [
            { rang: 1, derniereSyncA: new Date("2026-11-02T07:55:00.000Z") },
            { rang: 2, derniereSyncA: new Date("2026-11-02T07:58:00.000Z") },
          ],
        },
        {
          id: GARE_MVAN,
          code: "YDE",
          nom: "Mvan",
          ville: "Yaoundé",
          guichets: [{ id: GUICHET_MVAN_1, rang: 1 }],
          appareils: [{ rang: 1, derniereSyncA: new Date("2026-11-02T06:00:00.000Z") }],
        },
      ],
      6,
    );
    referentiel.declarer(
      { id: AUTRE_COMPAGNIE, nom: "Oméga" },
      [{ id: GARE_AUTRE, code: "BAF", nom: "Bafoussam", ville: "Bafoussam", guichets: [] }],
      2,
    );
    equipe.declarerGare(GARE_AKWA, "Akwa").declarerGare(GARE_MVAN, "Mvan");
    equipe
      .declarerGuichet(GARE_AKWA, 1, GUICHET_AKWA_1)
      .declarerGuichet(GARE_AKWA, 2, GUICHET_AKWA_2);
    equipe.declarerGuichet(GARE_MVAN, 1, GUICHET_MVAN_1);
    equipe.ajouter(
      COMPAGNIE,
      membre({
        id: ERIC,
        nom: "Éric Ngono",
        role: "guichetier",
        guichetId: GUICHET_AKWA_2,
        guichetRang: 2,
        situation: "en_service",
        enServiceDepuis: new Date("2026-11-02T05:30:00.000Z"),
      }),
    );
    equipe.ajouter(
      COMPAGNIE,
      membre({
        id: JOSEPH,
        nom: "Joseph Mbarga",
        role: "guichetier",
        guichetId: GUICHET_AKWA_1,
        guichetRang: 1,
      }),
    );
    equipe.ajouter(COMPAGNIE, membre({ id: PAUL, nom: "Paul Essomba", role: "superviseur" }));
    equipe.ajouter(
      COMPAGNIE,
      membre({
        id: SAMUEL,
        nom: "Samuel Tchoua",
        role: "chauffeur",
        gareId: GARE_MVAN,
        gareNom: "Mvan",
        bus: "LT 412 AB",
        situation: "en_route",
      }),
    );
    equipe.ajouter(
      AUTRE_COMPAGNIE,
      membre({
        id: MARIE_AUTRE,
        nom: "Marie Autre",
        role: "guichetier",
        gareId: GARE_AUTRE,
        gareNom: "Bafoussam",
      }),
    );
    // Annuaire de l'administration : la compagnie et ses deux gares (les lignes s'y réfèrent).
    annuaireAdmin.declarerCompagnie({ id: COMPAGNIE, code: "ALP", nom: "Alpha Voyages" });
    annuaireAdmin.declarerGare({
      id: GARE_AKWA,
      compagnieId: COMPAGNIE,
      code: "DLA",
      nom: "Akwa",
      ville: "Douala",
    });
    annuaireAdmin.declarerGare({
      id: GARE_MVAN,
      compagnieId: COMPAGNIE,
      code: "YDE",
      nom: "Mvan",
      ville: "Yaoundé",
    });
    // Le plus grand bus de la compagnie fixe le plan de sièges d'une ligne jamais réglée : 40 places, 2+2.
    void parcBus.creer({
      compagnieId: COMPAGNIE,
      immatriculation: "LT 412 AB",
      capacite: 40,
      capaciteSoute: 0,
      classe: "classique",
      modele: "Coaster",
      annee: 2020,
    });
    lignes.declarer(
      {
        id: LIGNE_DLA_YDE,
        compagnieId: COMPAGNIE,
        code: "DLAYDE",
        origineGareId: GARE_AKWA,
        destinationGareId: GARE_MVAN,
        tarifs: { classique: 3500, vip: 5000, bagage: 500 },
        dureeMinutes: 240,
        arrets: [
          { nom: "Douala", kmDepuisOrigine: 0, montee: true },
          { nom: "Édéa", kmDepuisOrigine: 60, montee: true },
          { nom: "Yaoundé", kmDepuisOrigine: 240, montee: false },
        ],
      },
      [
        {
          id: "00000000-0000-4000-8000-0000000000b0",
          ligneId: LIGNE_DLA_YDE,
          heure: "06:00",
          classe: "classique",
          actif: true,
          note: null,
          jours: [],
        },
        {
          id: "00000000-0000-4000-8000-0000000000b1",
          ligneId: LIGNE_DLA_YDE,
          heure: "10:00",
          classe: "classique",
          actif: true,
          note: "soute colis",
          jours: [],
        },
      ],
    );
  }

  const http = () => request(app.getHttpServer());
  const iso = (decalageMs = 0) =>
    new Date(horloge.maintenant().getTime() + decalageMs + 3_600_000)
      .toISOString()
      .replace("Z", "+01:00");
  /** Une signature valide du patron (`SignaturePin` des contrats). */
  const signature = (pin = PIN_PATRON, decalageMs = 0) => ({
    pin,
    methode: "pin" as const,
    signeA: iso(decalageMs),
  });

  return {
    app,
    http,
    horloge,
    iso,
    signature,
    personnes,
    auditRepo,
    sms,
    compte,
    semer,
    referentiel,
    exploitation,
    alertes,
    equipe,
    lignes,
    regles,
    ventes,
    colis,
    referentielRapport,
    sessions,
    reglesCaisse,
    chiffrement,
    fermer: () => app.close(),
  };
}

export type AppPatronTest = Awaited<ReturnType<typeof creerAppPatronTest>>;

export type { SessionStockee };
