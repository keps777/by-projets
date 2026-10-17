import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { creerAppPg, entetePg, type AppPg } from "../socle/testing/app-pg";

const FICHE = {
  nom: "Boutique Chez Paul",
  type: "Boutique · alimentation",
  ouvert: "7 h – 20 h · lun.–sam.",
  position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face au marché" },
  tailleMax: "Tous (≤ 30 kg)",
  momo: { telephone: "+237670000111", operateur: "mtn" },
  facadeRef: "photos/facade-paul.jpg",
};

/**
 * Devenir point relais sur PostgreSQL, par l'API : brouillon, dépôt de la fiche, visite et activation par
 * un agent AfriMove (le compte reçoit le rôle `relais` en base), espace du relais, puis redémarrage de
 * l'API : le dossier, le relais et le rôle sont toujours là.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · relais, l'API de bout en bout", () => {
  let base: BaseDeTest;
  let t: AppPg;

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    t = await creerAppPg({ url: base.url });
  }, 120_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  it("du brouillon à l'activation, puis après un redémarrage", async () => {
    const agent = await t.compte("afrimove");
    const commercant = await t.compte("voyageur", {
      nom: "Paul Biyick",
      telephone: "+237677000111",
    });
    const autre = await t.compte("voyageur", { nom: "Marie Ndongo" });

    const brouillon = await t
      .http()
      .put("/partenaires/relais/brouillon")
      .set(entetePg(commercant.jeton))
      .send({ fiche: { nom: "Brouillon", momo: FICHE.momo } });
    expect(brouillon.status, JSON.stringify(brouillon.body)).toBe(200);

    const depot = await t
      .http()
      .post("/partenaires/relais/demandes")
      .set(entetePg(commercant.jeton))
      .send(FICHE);
    expect(depot.status, JSON.stringify(depot.body)).toBe(201);
    const dossier = depot.body.dossier as string;
    expect(dossier).toBe("R-BAF-0001");
    // Deux envois simultanés d'une même personne comptent pour un.
    const [a, b] = await Promise.all([
      t.http().post("/partenaires/relais/demandes").set(entetePg(autre.jeton)).send(FICHE),
      t.http().post("/partenaires/relais/demandes").set(entetePg(autre.jeton)).send(FICHE),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await t.prisma.brouillonRelais.count({ where: { personneId: commercant.id } })).toBe(0);

    const visite = await t
      .http()
      .post(`/partenaires/relais/demandes/${dossier}/visite`)
      .set(entetePg(agent.jeton))
      .send({ agent: "Éric", creneau: "jeudi 10 h" });
    expect(visite.status, JSON.stringify(visite.body)).toBe(200);

    const activations = await Promise.all(
      [1, 2].map(() =>
        t
          .http()
          .post(`/partenaires/relais/demandes/${dossier}/activation`)
          .set(entetePg(agent.jeton))
          .send({ position: { lat: 5.4737, lon: 10.4179 }, capacite: 20 }),
      ),
    );
    expect(
      activations.map((r) => r.status),
      JSON.stringify(activations.map((r) => r.body)),
    ).toContain(200);
    expect(await t.prisma.relais.count({ where: { personneId: commercant.id } })).toBe(1);
    const personne = await t.prisma.personne.findUniqueOrThrow({ where: { id: commercant.id } });
    expect(personne.roles.filter((r) => r === "relais")).toHaveLength(1);

    const jeton = await t.jetonPour(commercant.id, "relais");
    const espace = await t.http().get("/relais/moi").set(entetePg(jeton));
    expect(espace.status, JSON.stringify(espace.body)).toBe(200);
    expect(espace.body.boutique.nom).toBe(FICHE.nom);

    // Le numéro MoMo n'est jamais en clair en base.
    const brut = await t.prisma.$queryRaw<
      { momo: string }[]
    >`SELECT "momoTelephoneChiffre" AS momo FROM "relais" WHERE "personneId" = ${commercant.id}::uuid`;
    expect(brut[0]?.momo).not.toContain("670000111");

    // Redémarrage : une autre instance de l'API sur la même base.
    await t.fermer();
    t = await creerAppPg({ url: base.url });
    const apres = await t.http().get("/relais/moi").set(entetePg(jeton));
    expect(apres.status, JSON.stringify(apres.body)).toBe(200);
    expect(apres.body.boutique.nom).toBe(FICHE.nom);
    const suivi = await t
      .http()
      .get("/partenaires/relais/demandes/moi")
      .set(entetePg(commercant.jeton));
    expect(suivi.body).toMatchObject({ statut: "active" });
  }, 60_000);
});
