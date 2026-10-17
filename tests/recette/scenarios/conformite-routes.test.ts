import * as client from "@afrimove/api-client";
import { describe, expect, it } from "vitest";
import { appeler } from "../support/api";

/**
 * Conformité des routes : chaque opération du client HTTP de l'application (`packages/api-client`, toutes les
 * planches : voyageur, agence, patron…) doit avoir sa route dans l'API réelle (`/openapi.json`), même méthode, même
 * chemin. La liste ci-dessous est l'état constaté lors de la recette (AM-181) : ce sont des écrans de l'application
 * qui appellent une route que l'API ne sert pas encore, donc qui échouent en 404 sur la vraie pile.
 *
 * Le test échoue dans les deux sens : une NOUVELLE opération sans route doit être reconnue ici, et une route
 * ajoutée à l'API doit être retirée de la liste (la liste ne doit jamais mentir).
 */
const ROUTES_ABSENTES: Record<string, string[]> = {
  "voyageur (hors périmètre de la mise en service en gare)": [
    "GET /voyageur/moi",
    "GET /voyageur/moi/fidelite",
    "GET /voyageur/moi/parrainage",
    "GET /voyageur/moi/proches",
    "POST /voyageur/moi/proches",
    "GET /voyageur/moi/historique",
    "GET /voyageur/reseau",
    "POST /voyageur/monter-en-route/commandes",
    "GET /voyageur/billets/{}/course",
    "POST /voyageur/billets/{}/course",
    "GET /voyageur/groupes/{}",
    "POST /voyageur/groupes",
    "POST /voyageur/groupes/{}/invitations",
    "POST /voyageur/groupes/devis-bus",
    "POST /voyageur/billets/{}/direct/signalements",
    "GET /voyageur/billets/{}/direct/chauffeur",
    "GET /voyageur/billets/{}/direct/colis",
  ],
  "guichet : accueil, cadence, impression": [
    "GET /agence/guichet/accueil",
    "GET /agence/cadence",
    "GET /agence/cadence/billets/{}",
    "GET /agence/impression",
    "POST /agence/impressions",
  ],
  quai: ["GET /agence/quai/cadence"],
  "bus : convoyeur et chauffeur": [
    "GET /agence/bus/convoyeur",
    "GET /agence/bus/chauffeur",
    "POST /agence/bus/ventes",
    "POST /agence/bus/scans",
    "POST /agence/bus/depenses",
    "POST /agence/bus/incidents",
    "POST /agence/bus/retards",
    "POST /agence/bus/arrivees",
  ],
  "contrôle inopiné": [
    "GET /agence/controle/inopine",
    "POST /agence/controle/sieges",
    "POST /agence/controle/regularisations",
    "POST /agence/controle/signalements",
    "POST /agence/controle/clotures",
  ],
  "superviseur : appareils": [
    "GET /agence/superviseur/appareils/{}",
    "POST /agence/superviseur/appareils/deblocage",
  ],
  "patron : tableau, gares, équipe, réglages, salle de contrôle": [
    "GET /patron/aujourdhui",
    "GET /patron/alertes",
    "GET /patron/gares",
    "GET /patron/gares/{}",
    "GET /patron/equipe",
    "GET /patron/personnes/{}",
    "GET /patron/reglages",
    "GET /patron/reglages/lignes/{}",
    "PUT /patron/reglages/lignes/{}",
    "POST /patron/reglages/lignes",
    "GET /patron/reglages/personnes/{}",
    "PUT /patron/reglages/personnes/{}",
    "POST /patron/reglages/personnes",
    "POST /patron/reglages/personnes/{}/desactivation",
    "POST /patron/reglages/personnes/{}/pin-provisoire",
    "GET /patron/reglages/regles",
    "PUT /patron/reglages/regles",
    "POST /patron/reglages/comptes-momo/confirmation",
    "PUT /patron/reglages/comptes-momo",
    "GET /patron/controle",
  ],
};

const proxy = new Proxy({}, { get: (_c, k) => `{${String(k)}}` });

interface OperationClient {
  module: string;
  nom: string;
  methode: string;
  chemin: string;
}

/** Toutes les opérations exportées par le client (lectures `OP_*`, écritures de l'agence, patron, voyageur…). */
function operationsDuClient(): OperationClient[] {
  const sortie: OperationClient[] = [];
  const vus = new Set<unknown>();
  const visiter = (module: string, valeur: unknown): void => {
    if (!valeur || typeof valeur !== "object" || vus.has(valeur)) return;
    vus.add(valeur);
    const o = valeur as Record<string, unknown>;
    if (
      typeof o["nom"] === "string" &&
      typeof o["methode"] === "string" &&
      typeof o["chemin"] === "function"
    ) {
      const chemin = decodeURIComponent((o["chemin"] as (p: unknown) => string)(proxy));
      sortie.push({
        module,
        nom: o["nom"],
        methode: o["methode"],
        chemin: chemin.replace(/\{[^}]+\}/g, "{}"),
      });
      return;
    }
    for (const v of Object.values(o)) visiter(module, v);
  };
  for (const [nom, v] of Object.entries(client)) visiter(nom, v);
  return sortie;
}

describe("conformité des routes du client HTTP avec l'API réelle", () => {
  it("les opérations sans route sont exactement celles de la liste des écarts connus", async () => {
    const r = await appeler<{ paths: Record<string, Record<string, unknown>> }>(
      "GET",
      "/openapi.json",
    );
    expect(r.statut).toBe(200);
    const routesApi = new Set<string>();
    for (const [chemin, methodes] of Object.entries(r.corps.paths)) {
      for (const m of Object.keys(methodes)) {
        routesApi.add(
          `${m.toUpperCase()} ${chemin.replace(/\{[^}]+\}/g, "{}").replace(/\/$/, "")}`,
        );
      }
    }
    const operations = operationsDuClient();
    expect(operations.length).toBeGreaterThan(150);
    const absentes = operations
      .map((o) => `${o.methode} ${o.chemin}`)
      .filter((o) => !routesApi.has(o))
      .sort();
    const connues = Object.values(ROUTES_ABSENTES).flat().sort();
    expect(absentes).toEqual(connues);
  });

  it("les opérations qui servent aux six critères ont leur route : caisse, vente, quai, scans, annulations, validation, rapport", async () => {
    const r = await appeler<{ paths: Record<string, Record<string, unknown>> }>(
      "GET",
      "/openapi.json",
    );
    const routesApi = new Set(Object.keys(r.corps.paths).map((c) => c.replace(/\{[^}]+\}/g, "{}")));
    const necessaires = [
      "/agence/caisse/ouverture",
      "/agence/caisse/comptage",
      "/agence/caisse/cloture",
      "/agence/billets",
      "/agence/vente/contexte",
      "/agence/quai/scans",
      "/agence/quai/codes",
      "/agence/annulations",
      "/agence/superviseur/annulations",
      "/agence/superviseur/validations",
      "/agence/superviseur/pin",
      "/patron/rapports/soir",
      "/sync/evenements",
    ];
    for (const route of necessaires) expect(routesApi.has(route), route).toBe(true);
  });
});
