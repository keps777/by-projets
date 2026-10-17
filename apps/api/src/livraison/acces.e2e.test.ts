import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listerRoutes, type InfoRoute } from "../socle/testing/routes";
import { VerificationPortsLivraison } from "./livraison.module";
import { VerificationPortsRelais } from "../relais/relais.module";
import {
  AttributionRoles,
  BrouillonsRelais,
  CompteursDossiers,
  DemandesRelaisRepository,
  Lieux,
  Portefeuille,
  ReceptionsRelais,
  RelaisRepository,
  VersementsMobile,
} from "../relais/ports";
import {
  creerAppLivraisonTest,
  creerEquipeRelais,
  entete,
  type AppLivraisonTest,
  type EquipeRelais,
} from "./testing/app-livraison-test";
import {
  DemandesLivreurRepository,
  DiffusionLivraison,
  Invitations,
  LivreursRepository,
  MissionsRepository,
  PartagesSuivi,
} from "./ports";

const UUID = "00000000-0000-4000-8000-0000000000aa";

/** Les routes ajoutées par ce ticket : relais, livreurs, livraison, inscriptions, suivi public. */
const EST_DU_TICKET = (r: InfoRoute): boolean =>
  /^\/(relais|livreurs|partenaires\/(relais|livreurs)|suivi)\b/.test(r.chemin) ||
  /^\/colis\/:colisId\/(relais|livraison)/.test(r.chemin);

describe("accès aux routes des points relais et de la livraison", () => {
  let t: AppLivraisonTest;
  let e: EquipeRelais;

  beforeEach(async () => {
    t = await creerAppLivraisonTest();
    e = await creerEquipeRelais(t);
  });
  afterEach(async () => {
    await t.fermer();
  });

  const routes = () => listerRoutes(t.app).filter(EST_DU_TICKET);
  const appeler = (r: InfoRoute, jeton?: string) => {
    const chemin = r.chemin.replace(/:[A-Za-z]+/g, UUID);
    const requete = t.http()[r.methode.toLowerCase() as "get" | "post" | "put"](chemin);
    if (jeton) requete.set(entete(jeton));
    return r.methode === "GET" ? requete : requete.send({});
  };

  it("inventorie toutes les routes du ticket, chacune avec une règle d'accès explicite", () => {
    const liste = routes();
    expect(liste.map((r) => `${r.methode} ${r.chemin}`).sort()).toEqual(
      [
        "GET /colis/:colisId/relais",
        "PUT /colis/:colisId/relais",
        "GET /relais/moi",
        "GET /relais/moi/colis/:colisId",
        "POST /relais/moi/receptions",
        "POST /relais/moi/remises",
        "GET /partenaires/relais/programme",
        "GET /partenaires/relais/formulaire",
        "PUT /partenaires/relais/brouillon",
        "POST /partenaires/relais/demandes",
        "GET /partenaires/relais/demandes/moi",
        "POST /partenaires/relais/demandes/:dossier/visite",
        "POST /partenaires/relais/demandes/:dossier/activation",
        "POST /partenaires/relais/demandes/:dossier/refus",
        "GET /colis/:colisId/livraison",
        "POST /colis/:colisId/livraison/partage",
        "PUT /colis/:colisId/livraison/adresse",
        "GET /suivi/:jeton",
        "GET /livreurs/moi",
        "GET /livreurs/moi/missions/en-cours",
        "PUT /livreurs/moi/disponibilite",
        "POST /livreurs/moi/missions/:missionId/acceptation",
        "POST /livreurs/moi/missions/:missionId/refus",
        "POST /livreurs/moi/missions/:missionId/remise",
        "POST /livreurs/moi/missions/:missionId/absence",
        "POST /livreurs/moi/retraits",
        "POST /livreurs/moi/invitations",
        "GET /partenaires/livreurs/programme",
        "POST /partenaires/livreurs/demandes",
        "GET /partenaires/livreurs/demandes/moi",
        "POST /partenaires/livreurs/demandes/:dossier/verification",
        "POST /partenaires/livreurs/demandes/:dossier/activation",
        "POST /partenaires/livreurs/demandes/:dossier/refus",
      ].sort(),
    );
    for (const r of liste) {
      const nom = `${r.methode} ${r.chemin}`;
      expect(r.publique || (r.roles?.length ?? 0) > 0, nom).toBe(true);
      expect(r.vente, nom).toBe(false);
    }
  });

  it("seul le suivi par lien est public ; chaque autre route a ses rôles", () => {
    const parRole = (role: string) =>
      routes()
        .filter((r) => r.roles?.includes(role as never))
        .map((r) => r.chemin.split("/").slice(1, 3).join("/"));
    expect(
      routes()
        .filter((r) => r.publique)
        .map((r) => r.chemin),
    ).toEqual(["/suivi/:jeton"]);
    expect(new Set(parRole("relais"))).toEqual(new Set(["relais/moi"]));
    expect(new Set(parRole("livreur"))).toEqual(new Set(["livreurs/moi"]));
    expect(new Set(parRole("afrimove"))).toEqual(
      new Set(["partenaires/relais", "partenaires/livreurs"]),
    );
    for (const r of routes().filter((x) => x.chemin.includes("/demandes/:dossier/"))) {
      expect(r.roles, r.chemin).toEqual(["afrimove"]);
    }
  });

  it("sans jeton : 401 sur toutes les routes, sauf le suivi public", async () => {
    for (const r of routes().filter((x) => !x.publique)) {
      const rep = await appeler(r);
      expect(rep.status, `${r.methode} ${r.chemin}`).toBe(401);
    }
  });

  it("avec un rôle qui n'est pas prévu : 403 sur toutes les routes, sans rien exécuter", async () => {
    const intrus = [e.superviseur.jeton, e.convoyeur.jeton];
    for (const r of routes().filter((x) => !x.publique)) {
      for (const jeton of intrus) {
        const rep = await appeler(r, jeton);
        expect(rep.status, `${r.methode} ${r.chemin}`).toBe(403);
      }
    }
    expect(t.missionsRepo.lignes.size).toBe(0);
    expect(t.demandes.lignes.size + t.demandesLivreur.lignes.size).toBe(0);
  });

  it("un voyageur ne passe pas par les routes des relais, des livreurs ni des agents", async () => {
    const reservees = routes().filter((r) => !r.publique && !r.roles?.includes("voyageur"));
    expect(reservees.length).toBeGreaterThan(10);
    for (const r of reservees) {
      const rep = await appeler(r, e.expediteur.jeton);
      expect(rep.status, `${r.methode} ${r.chemin}`).toBe(403);
    }
  });
});

describe("garde-fous de production", () => {
  let t: AppLivraisonTest;

  beforeEach(async () => {
    t = await creerAppLivraisonTest();
  });
  afterEach(async () => {
    await t.fermer();
  });

  it("les points relais acceptent la mémoire hors production, la refusent en production en nommant les ports", () => {
    expect(() => t.app.get(VerificationPortsRelais).onModuleInit()).not.toThrow();
    const verif = new VerificationPortsRelais(
      { ...t.config, env: "production" },
      t.app.get(RelaisRepository),
      t.app.get(DemandesRelaisRepository),
      t.app.get(BrouillonsRelais),
      t.app.get(CompteursDossiers),
      t.app.get(ReceptionsRelais),
      t.app.get(Lieux),
      t.app.get(Portefeuille),
      t.app.get(VersementsMobile),
      t.app.get(AttributionRoles),
    );
    expect(() => verif.onModuleInit()).toThrow(
      /RelaisRepository.*DemandesRelaisRepository.*Portefeuille/s,
    );
    expect(() => verif.onModuleInit()).toThrow(/relais\/README\.md/);
  });

  it("la livraison accepte la mémoire hors production, la refuse en production en nommant les ports", () => {
    expect(() => t.app.get(VerificationPortsLivraison).onModuleInit()).not.toThrow();
    const verif = new VerificationPortsLivraison(
      { ...t.config, env: "production" },
      t.app.get(LivreursRepository),
      t.app.get(DemandesLivreurRepository),
      t.app.get(MissionsRepository),
      t.app.get(PartagesSuivi),
      t.app.get(Invitations),
      t.app.get(DiffusionLivraison),
    );
    expect(() => verif.onModuleInit()).toThrow(
      /LivreursRepository.*MissionsRepository.*DiffusionLivraison/s,
    );
    expect(() => verif.onModuleInit()).toThrow(/livraison\/README\.md/);
  });
});
