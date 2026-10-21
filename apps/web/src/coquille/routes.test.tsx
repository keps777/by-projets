import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sourcesRoutes } from "@/app";
import fr from "@/i18n/fr.json";
import { rendreApp } from "@/test/rendre";
import { declarerRoutes, dossierDeLayout, layoutDe } from "./arbre-routes";
import { PLANCHES, analyserRoute, urlExemple, urlPlanche, type Planche } from "./planches";
import { ESPACES, PREFIXES_URL } from "./roles";

const planches = Object.keys(PLANCHES) as Planche[];
const declarees = declarerRoutes(sourcesRoutes);

describe("table planche -> route", () => {
  it("couvre les 75 planches qui ont une route (Parcours et Systeme n'en ont pas)", () => {
    expect(planches).toHaveLength(75);
    expect(planches).not.toContain("Parcours");
    expect(planches).not.toContain("Systeme");
  });

  it.each(planches)("%s a son fichier src/routes/<route>.tsx", (planche) => {
    const route = PLANCHES[planche].route;
    expect(
      declarees.some((declaree) => declaree.route === route),
      `fichier manquant : apps/web/src/routes${route}.tsx`,
    ).toBe(true);
  });

  it("n'a aucune route en trop : chaque fichier de route est une planche ou une page de développement", () => {
    const connues = new Set<string>(planches.map((planche) => PLANCHES[planche].route));
    const inconnues = declarees
      .map((declaree) => declaree.route)
      .filter((route) => !connues.has(route) && !route.startsWith("/dev/"));
    expect(inconnues).toEqual([]);
  });

  it("donne une URL unique à chaque route", () => {
    const urls = declarees.map((declaree) => declaree.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("retire le groupe de l'URL, sauf pour les espaces qui sinon se heurteraient", () => {
    expect(analyserRoute("/(voyageur)/depart/[departId]")).toEqual({
      espace: "voyageur",
      url: "/depart/:departId",
      params: ["departId"],
    });
    expect(urlPlanche("Main")).toBe("/voyager");
    expect(urlPlanche("Patron")).toBe("/aujourdhui");
    expect(urlPlanche("Controle")).toBe("/controle");
    expect(urlPlanche("Guichet")).toBe("/guichet/accueil");
    expect(urlPlanche("GuichetColis")).toBe("/guichet/colis");
    expect(urlPlanche("ColisEnvoi")).toBe("/colis");
    expect(urlPlanche("RelaisApp")).toBe("/relais/accueil");
    expect(Object.keys(PREFIXES_URL).sort()).toEqual(["guichet", "livreur", "relais", "vendeur"]);
    expect(() => urlPlanche("SiegePay")).toThrow(/departId/);
    expect(urlPlanche("SiegePay", { departId: "dep-0800" })).toBe("/depart/dep-0800");
  });

  it("n'oublie aucun espace : un layout par groupe de routes", () => {
    for (const espace of ESPACES) {
      expect(
        declarees.some((declaree) => declaree.layout === `(${espace})`),
        `aucune route dans (${espace})`,
      ).toBe(true);
    }
  });
});

describe("layouts", () => {
  const dossiers = new Set(["", "(voyageur)", "controle", "dev"]);

  it("lit le dossier d'un layout", () => {
    expect(dossierDeLayout("./routes/layout.tsx")).toBe("");
    expect(dossierDeLayout("./routes/(voyageur)/layout.tsx")).toBe("(voyageur)");
    expect(dossierDeLayout("./routes/controle/layout.tsx")).toBe("controle");
    expect(dossierDeLayout("./routes/(voyageur)/moi.tsx")).toBeNull();
  });

  it("applique le layout le plus proche", () => {
    expect(layoutDe("(voyageur)/depart/[departId]", dossiers)).toBe("(voyageur)");
    expect(layoutDe("controle", dossiers)).toBe("controle");
    expect(layoutDe("bienvenue", dossiers)).toBe("");
    expect(layoutDe("dev/kit", dossiers)).toBe("dev");
  });

  it("range /controle sous son layout et les routes publiques sous le layout racine", () => {
    const parUrl = Object.fromEntries(declarees.map((d) => [d.url, d.layout]));
    expect(parUrl["/controle"]).toBe("controle");
    expect(parUrl["/bienvenue"]).toBe("");
    expect(parUrl["/connexion"]).toBe("");
    expect(parUrl["/tutoriel"]).toBe("");
    expect(parUrl["/guichet/accueil"]).toBe("(guichet)");
    expect(parUrl["/inopine"]).toBe("(controle)");
  });
});

// Une planche dont l'écran est livré (dossier `src/ecrans/<Planche>/`) n'est plus un écran vide :
// elle est couverte par les tests de son propre dossier.
const ecransLivres = new Set(
  Object.keys(import.meta.glob("../ecrans/*/index.ts")).map((chemin) => chemin.split("/")[2]),
);
const plancheVides = planches.filter((p) => !ecransLivres.has(p));

describe("écrans vides titrés", () => {
  it.each(plancheVides)("%s s'ouvre avec le titre de sa planche", async (planche) => {
    rendreApp({ url: urlExemple(planche) });
    const titre = fr.ecrans[planche].titre;
    expect(await screen.findByRole("heading", { level: 1, name: titre })).toBeInTheDocument();
  });
});

describe("tools/fidelite/ecrans.json", () => {
  const ecrans = (
    JSON.parse(
      readFileSync(resolve(process.cwd(), "../../tools/fidelite/ecrans.json"), "utf8"),
    ) as { ecrans: Record<string, { route: string }> }
  ).ecrans;

  it("déclare les 75 planches avec une URL résolue (valeur d'exemple pour [param])", () => {
    expect(Object.keys(ecrans).sort()).toEqual([...planches].sort());
    for (const planche of planches) {
      expect(ecrans[planche]?.route).toBe(urlExemple(planche));
      expect(ecrans[planche]?.route).not.toMatch(/[:[\]()]/);
    }
  });
});

describe("navigation de base", () => {
  it("envoie / vers l'accueil du rôle courant", async () => {
    const { routeur } = rendreApp({ url: "/" });
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Main.titre });
    expect(routeur.state.location.pathname).toBe("/voyager");
  });

  it("affiche « introuvable » pour une adresse inconnue", async () => {
    rendreApp({ url: "/nimporte-quoi" });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.coquille.introuvable.titre }),
    ).toBeInTheDocument();
  });
});
