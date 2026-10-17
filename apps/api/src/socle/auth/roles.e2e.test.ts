import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerAppTest, type AppTest } from "../testing/app-test";
import { jetonPour } from "../testing/jetons";
import { listerRoutes } from "../testing/routes";
import { SondesController } from "../testing/sondes.controller";
import { Vente } from "./decorateurs";
import { ROLES, ROLES_ESPACE_PATRON, ROLES_VENTE, type Role } from "./roles";

const UUID_FACTICE = "00000000-0000-4000-8000-000000000000";
const sansTerrain = (r: Role) => !(ROLES_ESPACE_PATRON as readonly string[]).includes(r);

describe("rôles stricts (HTTP)", () => {
  let t: AppTest;
  const jetons = {} as Record<Role, string>;

  beforeAll(async () => {
    t = await creerAppTest({ controleurs: [SondesController] });
    for (const r of ROLES) jetons[r] = (await jetonPour(t, r)).jeton;
  });
  afterAll(() => t.fermer());

  const appeler = (methode: "get" | "post", chemin: string, jeton?: string) => {
    const req = t.http()[methode](chemin);
    return jeton ? req.set("Authorization", `Bearer ${jeton}`) : req;
  };

  describe("un guichetier n'appelle aucune route patron", () => {
    it("les routes patron existent (le test n'est pas vide)", () => {
      const routesPatron = listerRoutes(t.app).filter((r) => r.chemin.startsWith("/patron"));
      expect(routesPatron.length).toBeGreaterThan(0);
    });

    it("toute route /patron/** répond 403 au guichetier et à tout rôle hors espace patron", async () => {
      const routesPatron = listerRoutes(t.app).filter((r) => r.chemin.startsWith("/patron"));
      for (const route of routesPatron) {
        const chemin = route.chemin.replace(/:\w+/g, UUID_FACTICE);
        const methode = route.methode.toLowerCase() as "get" | "post";
        for (const role of ROLES.filter(sansTerrain)) {
          const rep = await appeler(methode, chemin, jetons[role]);
          expect(rep.status, `${role} ${route.methode} ${route.chemin}`).toBe(403);
        }
        const sansJeton = await appeler(methode, chemin);
        expect(sansJeton.status, `sans jeton ${route.chemin}`).toBe(401);
      }
    });

    it("la route sonde patron : le patron passe, le guichetier non", async () => {
      expect((await appeler("get", "/sondes/patron", jetons.patron)).status).toBe(200);
      expect((await appeler("get", "/sondes/patron", jetons.guichetier)).status).toBe(403);
      expect((await appeler("get", "/sondes/patron", jetons.superviseur)).status).toBe(403);
    });

    it("un compte guichetier ET patron connecté en guichetier n'entre pas chez le patron", async () => {
      const double = await jetonPour(t, "guichetier", { rolesDuCompte: ["guichetier", "patron"] });
      expect((await appeler("get", "/sondes/patron", double.jeton)).status).toBe(403);
      const moi = await appeler("get", "/me", double.jeton);
      expect(moi.body).toMatchObject({ role: "guichetier", accesPatron: false, peutVendre: true });
    });

    it("le refus est écrit dans le journal d'audit", async () => {
      await appeler("get", "/sondes/patron", jetons.guichetier);
      const refus = t.auditRepo.lignes.filter((l) => l.action === "acces.refuse");
      expect(refus.length).toBeGreaterThan(0);
      expect(refus.at(-1)).toMatchObject({
        resultat: "refus",
        acteurRole: "guichetier",
        details: { route: "/sondes/patron", cause: "role_non_autorise" },
      });
    });
  });

  describe("AfriMove ne vend jamais", () => {
    it("les rôles qui vendent passent, AfriMove est refusé", async () => {
      for (const role of ROLES) {
        const rep = await appeler("post", "/sondes/vente", jetons[role]);
        const attendu = (ROLES_VENTE as readonly string[]).includes(role) ? 201 : 403;
        expect(rep.status, `${role} sur une route de vente`).toBe(attendu);
      }
    });

    it("une route de vente restreinte au guichetier refuse les autres vendeurs", async () => {
      expect((await appeler("post", "/sondes/vente-guichet", jetons.guichetier)).status).toBe(201);
      expect((await appeler("post", "/sondes/vente-guichet", jetons.convoyeur)).status).toBe(403);
    });

    it("même si AfriMove est ajouté par erreur aux rôles d'une route de vente, il est refusé", async () => {
      expect((await appeler("post", "/sondes/vente-piege", jetons.afrimove)).status).toBe(403);
      expect((await appeler("post", "/sondes/vente-piege", jetons.guichetier)).status).toBe(201);
      const refus = t.auditRepo.lignes.filter(
        (l) => l.details["cause"] === "afrimove_ne_vend_jamais",
      );
      expect(refus.length).toBeGreaterThan(0);
    });

    it("@Vente refuse AfriMove dès la déclaration", () => {
      expect(() => Vente("afrimove" as never)).toThrow(/ne vend pas/);
      expect(() => Vente("patron" as never)).toThrow(/ne vend pas/);
    });

    it("AfriMove accède à ses propres routes, pas les autres", async () => {
      expect((await appeler("get", "/sondes/afrimove", jetons.afrimove)).status).toBe(200);
      expect((await appeler("get", "/sondes/afrimove", jetons.patron)).status).toBe(403);
    });

    it("/me indique que AfriMove ne peut pas vendre", async () => {
      const moi = await appeler("get", "/me", jetons.afrimove);
      expect(moi.body).toMatchObject({ role: "afrimove", peutVendre: false, accesPatron: false });
    });
  });

  describe("refus par défaut", () => {
    it("une route sans règle est refusée à tous les rôles", async () => {
      for (const role of ROLES) {
        expect((await appeler("get", "/sondes/oubliee", jetons[role])).status, role).toBe(403);
      }
      expect((await appeler("get", "/sondes/oubliee")).status).toBe(401);
    });

    it("@Authentifie ouvre à tout compte connecté mais pas aux anonymes", async () => {
      for (const role of ROLES) {
        expect((await appeler("get", "/sondes/tous", jetons[role])).status, role).toBe(200);
      }
      expect((await appeler("get", "/sondes/tous")).status).toBe(401);
    });
  });

  describe("inventaire des routes de l'application", () => {
    // Les sondes sont des routes de test : on inspecte les vraies routes.
    const vraies = () => listerRoutes(t.app).filter((r) => !r.chemin.startsWith("/sondes"));

    it("toute route a une règle d'accès explicite (public, authentifié, rôles ou vente)", () => {
      for (const r of vraies()) {
        const regle = r.publique || r.toutAuthentifie || r.vente || (r.roles?.length ?? 0) > 0;
        expect(regle, `${r.methode} ${r.chemin} (${r.controleur}) sans règle d'accès`).toBe(true);
      }
    });

    it("les seules routes publiques sont la santé et les routes de connexion", () => {
      const publiques = vraies()
        .filter((r) => r.publique)
        .map((r) => `${r.methode} ${r.chemin}`)
        .sort();
      expect(publiques).toEqual(
        [
          "GET /health",
          "POST /auth/voyageur/code",
          "POST /auth/voyageur/verification",
          "POST /auth/guichet/connexion",
          "POST /auth/direction/connexion",
          "POST /auth/direction/verification",
          // Billetterie : la clé publique qui vérifie les QR hors ligne (JWK, rien de secret).
          "GET /billetterie/cle-publique",
        ].sort(),
      );
    });

    it("/patron/** est réservé à l'espace patron ; /afrimove/** à AfriMove seul", () => {
      for (const r of vraies()) {
        if (r.chemin.startsWith("/patron")) {
          expect(r.roles, r.chemin).toBeDefined();
          for (const role of r.roles ?? []) {
            expect(
              ROLES_ESPACE_PATRON as readonly string[],
              `${r.chemin} ouvert à ${role}`,
            ).toContain(role);
          }
        }
        if (r.chemin.startsWith("/afrimove")) expect(r.roles).toEqual(["afrimove"]);
      }
    });

    it("aucune route de vente n'est ouverte à AfriMove", () => {
      for (const r of vraies()) {
        if (r.vente) expect(r.roles ?? []).not.toContain("afrimove");
      }
    });

    it("aucune route qui accepte AfriMove ne contient « vente » ou « billet » dans son chemin", () => {
      for (const r of vraies()) {
        if (r.roles?.includes("afrimove")) expect(r.chemin).not.toMatch(/vente|billet|caisse/);
      }
    });
  });
});
