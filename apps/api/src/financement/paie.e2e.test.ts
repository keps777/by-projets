import { patron } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENCE,
  AUTRE_AGENCE,
  PIN_PATRON,
  creerAppFinancementTest,
  salairesTypes,
  type AppFinancementTest,
} from "./testing/app-financement-test";

describe("paie des équipages par MoMo", () => {
  let t: AppFinancementTest;
  let chef: { id: string; jeton: string; telephone: string };

  beforeEach(async () => {
    t = await creerAppFinancementTest();
    chef = await t.compte("patron");
    t.salaires.parAgence.set(AGENCE, salairesTypes());
  });
  afterEach(async () => {
    await t.fermer();
  });

  const lancer = (over: Record<string, unknown> = {}, jeton = chef.jeton) =>
    t
      .http()
      .post("/patron/paie")
      .set(t.entete(jeton))
      .send({ mois: "2026-11", signature: t.signature(), ...over });

  const lot = async (mois = "2026-11", agence = AGENCE) => (await t.paie.lot(agence, mois))!;

  describe("accès et signature", () => {
    it("sans jeton : 401 ; autres rôles : 403", async () => {
      expect((await t.http().post("/patron/paie").send({})).status).toBe(401);
      for (const role of ["voyageur", "guichetier", "comptable"] as const) {
        const autre = await t.compte(role);
        expect((await lancer({}, autre.jeton)).status, role).toBe(403);
      }
      expect(t.versements.ordres.size).toBe(0);
    });

    it("un patron sans agence : 403 AGENCE_REQUISE", async () => {
      const orphelin = await t.compte("patron", { compagnieId: null });
      const r = await lancer({}, orphelin.jeton);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("AGENCE_REQUISE");
    });

    it("sans signature : 401 PIN_REQUIS, personne n'est payé", async () => {
      const r = await t
        .http()
        .post("/patron/paie")
        .set(t.entete(chef.jeton))
        .send({ mois: "2026-11" });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe("PIN_REQUIS");
      expect(t.versements.ordres.size).toBe(0);
      expect(await t.paie.lot(AGENCE, "2026-11")).toBeNull();
    });

    it("PIN faux : 403 PIN_INCORRECT, personne n'est payé, le refus est tracé sans le PIN", async () => {
      const r = await lancer({ signature: t.signature("111111") });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("PIN_INCORRECT");
      expect(t.versements.ordres.size).toBe(0);
      const trace = t.auditRepo.lignes.find((l) => l.action === "paie.lancer");
      expect(trace?.resultat).toBe("refus");
      expect(JSON.stringify(trace?.details)).not.toContain("111111");
    });

    it("corps invalide : 422 COMMANDE_INVALIDE", async () => {
      const r = await lancer({ mois: "novembre", total: 1 });
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("COMMANDE_INVALIDE");
    });
  });

  describe("lancer la paie", () => {
    it("verse chaque salaire par MoMo et respecte PaieLanceeSchema", async () => {
      const r = await lancer();
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const paie = patron.PaieLanceeSchema.parse(r.body);
      expect(paie).toMatchObject({
        mois: "2026-11",
        nbSalaires: 3,
        total: 360_000,
        versementA: "2026-11-02T09:00:00.000+01:00",
        signePar: chef.id,
      });
      const ordres = [...t.versements.ordres.values()];
      expect(ordres.map((o) => [o.montant, o.operateur, o.telephone]).sort()).toEqual([
        [120_000, "orange", "+237690000002"],
        [150_000, "mtn", "+237670000001"],
        [90_000, "mtn", "+237670000003"],
      ]);
      expect(ordres.every((o) => o.agenceId === AGENCE && o.libelle === "Salaire 2026-11")).toBe(
        true,
      );
      expect((await lot()).lignes.every((l) => l.etat === "verse" && l.reference !== null)).toBe(
        true,
      );
    });

    it("la réponse et le journal ne contiennent ni numéro MoMo ni salaire individuel", async () => {
      const r = await lancer();
      const texte = JSON.stringify(r.body);
      expect(texte).not.toContain("+237");
      expect(texte).not.toContain("Joseph");
      const trace = t.auditRepo.lignes.find(
        (l) => l.action === "paie.lancer" && l.resultat === "succes",
      )!;
      expect(trace.id).toBe(r.body.journalId);
      const details = JSON.stringify(trace.details);
      expect(details).not.toContain("+237");
      expect(details).not.toContain("150000");
      expect(details).not.toContain(PIN_PATRON);
      expect(trace.details["total"]).toBe(360_000);
    });

    it("accepte le mois précédent, refuse un mois futur ou trop ancien (422 MOIS_INVALIDE)", async () => {
      expect((await lancer({ mois: "2026-10" })).status).toBe(200);
      for (const mois of ["2026-12", "2026-09", "2025-11", "2026-13", "2026-00"]) {
        const r = await lancer({ mois });
        expect(r.status, mois).toBe(422);
        expect(r.body.code, mois).toBe("MOIS_INVALIDE");
      }
    });

    it("aucun salaire à payer : 422 AUCUN_SALAIRE, aucun lot", async () => {
      t.salaires.parAgence.set(AGENCE, [
        { personneId: "p-0", nom: "Sans salaire", montant: 0, compte: null },
      ]);
      const r = await lancer();
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("AUCUN_SALAIRE");
      expect(await t.paie.lot(AGENCE, "2026-11")).toBeNull();
    });

    it("un salaire à 0 F n'est ni payé ni compté", async () => {
      t.salaires.parAgence.set(AGENCE, [
        ...salairesTypes(),
        { personneId: "p-0", nom: "Sans salaire", montant: 0, compte: null },
      ]);
      const r = await lancer();
      expect(r.body.nbSalaires).toBe(3);
      expect(t.versements.ordres.size).toBe(3);
    });

    it("relancer une paie entièrement versée : 409 PAIE_DEJA_LANCEE, personne n'est payé deux fois", async () => {
      await lancer();
      const appels = t.versements.appels;
      const r = await lancer();
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("PAIE_DEJA_LANCEE");
      expect(t.versements.appels).toBe(appels);
      expect(t.versements.ordres.size).toBe(3);
    });

    it("deux touches simultanées : chaque salaire n'est versé qu'une fois", async () => {
      const [a, b] = await Promise.all([lancer(), lancer()]);
      expect([a.status, b.status].every((s) => s === 200 || s === 409)).toBe(true);
      expect(t.versements.ordres.size).toBe(3);
      const l = await lot();
      expect(l.lignes.map((x) => x.etat)).toEqual(["verse", "verse", "verse"]);
      expect(l.total).toBe(360_000);
    });

    it("chaque agence a sa paie du mois", async () => {
      t.salaires.parAgence.set(AUTRE_AGENCE, [
        {
          personneId: "q-1",
          nom: "Autre",
          montant: 50_000,
          compte: { operateur: "mtn", telephone: "+237670000009" },
        },
      ]);
      const voisin = await t.compte("patron", { compagnieId: AUTRE_AGENCE });
      expect((await lancer()).status).toBe(200);
      const r = await lancer({}, voisin.jeton);
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(50_000);
      expect(t.versements.ordres.size).toBe(4);
    });
  });

  describe("montants figés", () => {
    it("les salaires sont figés au premier lancement : relancer ne les recalcule pas", async () => {
      t.versements.panne = true;
      await lancer();
      t.versements.panne = false;
      t.salaires.parAgence.set(AGENCE, [
        { ...salairesTypes()[0]!, montant: 999_999 },
        ...salairesTypes().slice(1),
      ]);
      const r = await lancer();
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(360_000);
      expect([...t.versements.ordres.values()].map((o) => o.montant).sort((a, b) => a - b)).toEqual(
        [90_000, 120_000, 150_000],
      );
    });
  });

  describe("opérateur en panne ou qui refuse", () => {
    it("sans réponse de l'opérateur : lignes en attente, rejouées avec la même clé sans payer deux fois", async () => {
      t.versements.panne = true;
      const r = await lancer();
      expect(r.status).toBe(200);
      expect(r.body.nbSalaires).toBe(3);
      expect((await lot()).lignes.map((l) => l.etat)).toEqual([
        "en_attente",
        "en_attente",
        "en_attente",
      ]);
      expect(t.versements.ordres.size).toBe(0);

      // Tant que l'opérateur est en panne, la tâche ne paie rien.
      expect(await t.paie.rattraper()).toBe(0);

      t.versements.panne = false;
      expect(await t.paie.rattraper()).toBe(3);
      expect((await lot()).lignes.map((l) => l.etat)).toEqual(["verse", "verse", "verse"]);
      expect(t.versements.ordres.size).toBe(3);
      // Un nouveau passage ne repaie personne.
      const appels = t.versements.appels;
      expect(await t.paie.rattraper()).toBe(0);
      expect(t.versements.appels).toBe(appels);
    });

    it("un résultat inconnu rejoué après un vrai versement reste un seul versement", async () => {
      await lancer();
      // L'opérateur a payé mais la réponse s'est perdue : la ligne est revenue « en attente ».
      const l = await lot();
      await t.lots.marquerLigne(l.id, "p-1", { etat: "en_attente", reference: null });
      expect(await t.paie.rattraper()).toBe(1);
      expect(t.versements.ordres.size).toBe(3);
    });

    it("un numéro refusé par l'opérateur : ligne refusée, les autres sont payés", async () => {
      t.versements.refuses.add("+237690000002");
      const r = await lancer();
      expect(r.status).toBe(200);
      expect(r.body.nbSalaires).toBe(3);
      const etats = Object.fromEntries((await lot()).lignes.map((l) => [l.personneId, l.etat]));
      expect(etats).toEqual({ "p-1": "verse", "p-2": "refuse", "p-3": "verse" });
      expect(t.versements.ordres.size).toBe(2);
    });

    it("relancer ne rejoue que la ligne refusée, avec une nouvelle clé, sans repayer les autres", async () => {
      t.versements.refuses.add("+237690000002");
      await lancer();
      t.versements.refuses.clear();
      const r = await lancer();
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const l = await lot();
      expect(l.lignes.map((x) => x.etat)).toEqual(["verse", "verse", "verse"]);
      expect(l.lignes.find((x) => x.personneId === "p-2")!.tentative).toBe(1);
      expect(t.versements.ordres.size).toBe(3);
      expect(t.versements.ordres.has(`paie:${AGENCE}:2026-11:p-2:1`)).toBe(true);
      expect(t.versements.ordres.has(`paie:${AGENCE}:2026-11:p-1:0`)).toBe(true);
      // Plus rien à payer.
      expect((await lancer()).status).toBe(409);
    });

    it("un salarié sans compte MoMo est refusé avec son motif ; ajouter le compte puis relancer le paie", async () => {
      t.salaires.parAgence.set(AGENCE, [
        ...salairesTypes().slice(0, 2),
        { personneId: "p-3", nom: "Alain B.", montant: 90_000, compte: null },
      ]);
      const r = await lancer();
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(360_000);
      const ligne = (await lot()).lignes.find((l) => l.personneId === "p-3")!;
      expect(ligne).toMatchObject({ etat: "refuse", motif: "compte MoMo absent" });
      expect(t.versements.ordres.size).toBe(2);

      t.salaires.parAgence.set(AGENCE, salairesTypes());
      expect((await lancer()).status).toBe(200);
      const apres = (await lot()).lignes.find((l) => l.personneId === "p-3")!;
      expect(apres.etat).toBe("verse");
      expect(apres.montant).toBe(90_000);
      expect(t.versements.ordres.size).toBe(3);
    });
  });

  it("la tâche de fond complète rattrape aussi la paie", async () => {
    t.versements.panne = true;
    await lancer();
    t.versements.panne = false;
    await t.taches.toutExecuter();
    expect((await lot()).lignes.every((l) => l.etat === "verse")).toBe(true);
  });
});
