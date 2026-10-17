import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { versIsoDouala } from "../colis/temps";
import { creerAppPg, entetePg, type AppPg } from "../socle/testing/app-pg";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  DonneesAgenceMemoire,
  ENTETE_SECRET_PARTENAIRE,
  PartenaireSimule,
  SalairesMemoire,
  SECRET_PARTENAIRE_TEST,
  VersementsPaieMemoire,
} from "./memoire";
import { DonneesAgence, PartenaireFinancier, SalairesAgence, VersementsPaie } from "./ports";
import { PrelevementsService } from "./prelevements.service";

/**
 * Le financement sur PostgreSQL, par l'API : une agence éligible demande son avance (PIN du patron), le
 * partenaire (simulé) la verse, huit pour cent des ventes MoMo sont prélevés sans jamais dépasser le dû, la
 * paie des équipages est versée une fois, le billet en deux fois est réglé — puis l'API redémarre sur la même
 * base et retrouve tout. Le partenaire, l'agrégateur de paie, les salaires et les données de l'agence restent
 * simulés (voir le README) : le test les règle.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · financement, l'API de bout en bout", () => {
  let base: BaseDeTest;
  let t: AppPg;

  const PIN = "482915";
  const montage = () => creerAppPg({ url: base.url });
  const iso = (decalageMs = 0): string =>
    versIsoDouala(new Date(t.horloge.maintenant().getTime() + decalageMs));
  const signature = () => ({ pin: PIN, methode: "pin" as const, signeA: iso() });

  /** Ce que les ports simulés savent de l'agence (la mémoire d'un processus : à reposer après un redémarrage). */
  const poserDonnees = (agenceId: string): void => {
    const donnees = t.resoudre(DonneesAgence) as DonneesAgenceMemoire;
    donnees.ventesParAgence.set(agenceId, {
      joursCouverts: 90,
      total: 108_000_000,
      billets: 8940,
      colis: 2310,
      ventesMomo: 100_000_000,
    });
    donnees.releves.set(agenceId, { mois: 3, correspondancePct: 99.8 });
    donnees.piecesParAgence.set(agenceId, { registreEtCarteValides: true });
    donnees.comptes.set(agenceId, { id: "marchand-alpha", operateur: "mtn" });
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    t = await montage();
  }, 120_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  it("de la demande d'avance à la paie, puis après un redémarrage", async () => {
    const fx = new FixturesPg(t.prisma);
    const agence = await fx.compagnie();
    const patron = await t.compte("patron", { compagnieId: agence.id, gareId: null });
    poserDonnees(agence.id);
    await t.prisma.conventionFinancement.create({
      data: {
        agenceId: agence.id,
        partenaire: "Banque Atlantique",
        signeeA: new Date("2026-10-01T09:00:00.000Z"),
      },
    });
    await t.prisma.offreCreditMateriel.create({
      data: {
        agenceId: agence.id,
        description: "2 téléphones + imprimante pour la nouvelle gare",
        montantTotal: 1_100_000,
        mensualites: 12,
        montantMensualite: 100_000,
      },
    });
    const http = () => t.http();

    // L'offre : éligible, avec le crédit matériel lu en base.
    const offre = await http().get("/patron/financement").set(entetePg(patron.jeton));
    expect(offre.status, JSON.stringify(offre.body)).toBe(200);
    expect(offre.body).toMatchObject({
      partenaire: "Banque Atlantique",
      conventionSignee: true,
      avance: { statut: "eligible", montantPropose: 6_000_000 },
      creditMateriel: { montantTotal: 1_100_000, mensualites: 12 },
      billetEnDeuxFois: { actif: false },
    });

    // La demande : PIN du patron, dossier envoyé au partenaire (simulé), qui accuse réception.
    const demande = await http()
      .post("/patron/financement/demandes")
      .set(entetePg(patron.jeton))
      .send({ montant: 6_000_000, signature: signature() });
    expect(demande.status, JSON.stringify(demande.body)).toBe(201);
    const dossierId = demande.body.dossier.id as string;
    expect(dossierId).toMatch(/^AV-2027-\d{4}$/);
    const ligne = await t.prisma.dossierFinancement.findUniqueOrThrow({ where: { id: dossierId } });
    expect(ligne).toMatchObject({
      agenceId: agence.id,
      demandePar: patron.id,
      statut: "en_analyse",
      montant: 6_000_000,
      referencePartenaire: `PART-${dossierId}`,
      mandatActif: true,
      mandatCompteMarchandId: "marchand-alpha",
    });
    expect(ligne.pieces).toHaveLength(4);

    // Une seule avance à la fois : la base le garantit, l'API répond 409.
    const deux = await http()
      .post("/patron/financement/demandes")
      .set(entetePg(patron.jeton))
      .send({ montant: 6_000_000, signature: signature() });
    expect(deux.status).toBe(409);
    expect(deux.body.code).toBe("DEMANDE_EN_COURS");
    expect(await t.prisma.dossierFinancement.count({ where: { agenceId: agence.id } })).toBe(1);
    // Un autre patron ne voit pas ce dossier.
    const autreAgence = await fx.compagnie();
    const voisin = await t.compte("patron", { compagnieId: autreAgence.id, gareId: null });
    const vu = await http()
      .get(`/patron/financement/demandes/${dossierId}`)
      .set(entetePg(voisin.jeton));
    expect(vu.status).toBe(404);

    // Le partenaire verse (appel public, authentifié par son secret) : coût 5 %, dû 6,3 M.
    const verse = await http()
      .post("/financement/partenaire/notifications")
      .set(ENTETE_SECRET_PARTENAIRE, SECRET_PARTENAIRE_TEST)
      .send({
        type: "verse",
        reference: `PART-${dossierId}`,
        at: iso(),
        coutTotalPct: 5,
      });
    expect(verse.status, JSON.stringify(verse.body)).toBe(200);
    expect(
      await t.prisma.dossierFinancement.findUniqueOrThrow({ where: { id: dossierId } }),
    ).toMatchObject({ statut: "verse", resteDu: 6_300_000, version: 3 });

    // Le 8 % des ventes MoMo : cinq ventes simultanées, chacune prélevée une fois, rejeu sans doublon.
    const prelevements = t.resoudre(PrelevementsService);
    const ventes = [1, 2, 3, 4, 5].map((n) => ({
      agenceId: agence.id,
      venteId: `vente-${n}`,
      montant: 80_000,
      at: iso(3_600_000),
    }));
    const issues = await Promise.all(ventes.map((v) => prelevements.enregistrerVenteMomo(v)));
    expect(issues.map((i) => i.resultat)).toEqual(Array(5).fill("preleve"));
    expect((await prelevements.enregistrerVenteMomo(ventes[0]!)).resultat).toBe("deja_compte");
    const lignes = await t.prisma.prelevementAvance.findMany({ where: { dossierId } });
    expect(lignes).toHaveLength(5);
    expect(lignes.every((l) => l.etat === "execute" && l.montant === 6_400)).toBe(true);
    expect(lignes.every((l) => l.reference !== null)).toBe(true);
    // Le partenaire n'a reçu l'ordre qu'une fois par vente (clé d'idempotence).
    const partenaire = t.resoudre(PartenaireFinancier) as PartenaireSimule;
    expect(partenaire.prelevements.size).toBe(5);

    // La paie : trois salariés réels, un seul versement chacun, un numéro MoMo jamais en clair.
    const salaries = [
      await t.compte("guichetier", { compagnieId: agence.id }),
      await t.compte("guichetier", { compagnieId: agence.id }),
      await t.compte("guichetier", { compagnieId: agence.id }),
    ];
    (t.resoudre(SalairesAgence) as SalairesMemoire).parAgence.set(agence.id, [
      {
        personneId: salaries[0]!.id,
        nom: "Joseph M.",
        montant: 150_000,
        compte: { operateur: "mtn", telephone: "+237670000001" },
      },
      {
        personneId: salaries[1]!.id,
        nom: "Marie T.",
        montant: 120_000,
        compte: { operateur: "orange", telephone: "+237690000002" },
      },
      { personneId: salaries[2]!.id, nom: "Alain B.", montant: 90_000, compte: null },
    ]);
    const paie = await http()
      .post("/patron/paie")
      .set(entetePg(patron.jeton))
      .send({ mois: "2027-01", signature: signature() });
    expect(paie.status, JSON.stringify(paie.body)).toBe(200);
    expect(paie.body).toMatchObject({ mois: "2027-01", nbSalaires: 3, total: 360_000 });
    const lot = await t.prisma.lotPaie.findUniqueOrThrow({
      where: { agenceId_mois: { agenceId: agence.id, mois: "2027-01" } },
      include: { lignes: { orderBy: { rang: "asc" } } },
    });
    expect(lot.lignes.map((l) => l.etat)).toEqual(["verse", "verse", "refuse"]);
    expect(lot.lignes[2]!.motif).toBe("compte MoMo absent");
    expect(JSON.stringify(lot.lignes)).not.toContain("670000001");
    expect(JSON.stringify(lot.lignes)).not.toContain("690000002");
    const versements = t.resoudre(VersementsPaie) as VersementsPaieMemoire;
    expect(versements.ordres.size).toBe(2);
    const rejouee = await http()
      .post("/patron/paie")
      .set(entetePg(patron.jeton))
      .send({ mois: "2027-01", signature: signature() });
    // Un salarié sans compte reste refusé : la relance ne repaie personne d'autre.
    expect(rejouee.status).toBe(200);
    expect(versements.ordres.size).toBe(2);
    expect(await t.prisma.lotPaie.count({ where: { agenceId: agence.id } })).toBe(1);

    // Le billet en deux fois : option de l'agence, coupée par défaut.
    const regle = await http()
      .put("/patron/financement/billet-en-deux-fois")
      .set(entetePg(patron.jeton))
      .send({ actif: true, signature: signature() });
    expect(regle.status, JSON.stringify(regle.body)).toBeLessThan(300);

    // Redémarrage : une autre instance de l'API sur la même base.
    await t.fermer();
    t = await montage();
    poserDonnees(agence.id);
    const apres = await http().get("/patron/financement").set(entetePg(patron.jeton));
    expect(apres.status, JSON.stringify(apres.body)).toBe(200);
    expect(apres.body.billetEnDeuxFois.actif).toBe(true);
    expect(apres.body.avance.statut).toBe("en_cours");
    const suivi = await http()
      .get(`/patron/financement/demandes/${dossierId}`)
      .set(entetePg(patron.jeton));
    expect(suivi.status, JSON.stringify(suivi.body)).toBe(200);
    expect(suivi.body).toMatchObject({ id: dossierId, statut: "verse", retirable: false });
    expect(await t.prisma.prelevementAvance.count({ where: { dossierId } })).toBe(5);
    // Une avance déjà versée ne se retire plus.
    const retrait = await http()
      .post(`/patron/financement/demandes/${dossierId}/retrait`)
      .set(entetePg(patron.jeton))
      .send({ dossierId, signature: signature() });
    expect(retrait.status).toBe(409);
    expect(retrait.body.code).toBe("DOSSIER_NON_RETIRABLE");
  }, 90_000);
});
