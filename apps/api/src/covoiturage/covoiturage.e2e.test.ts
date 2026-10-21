import { voyageur } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RequeteNotification } from "../paiements/agregateur";
import { MINUTE } from "./testing/montage";
import {
  DEPART,
  avec,
  creerAppCovoiturageTest,
  type AppCovoiturageTest,
} from "./testing/app-covoiturage-test";

type Compte = { id: string; jeton: string; telephone: string };

let t: AppCovoiturageTest;
let afrimove: Compte;
let guichetier: Compte;
let patron: Compte;
let compteurFichiers = 0;

beforeAll(async () => {
  t = await creerAppCovoiturageTest();
  afrimove = await t.compte("afrimove");
  guichetier = await t.compte("guichetier");
  patron = await t.compte("patron");
});
afterAll(async () => t.fermer());

const get = (chemin: string, j: string) => t.http().get(chemin).set(avec(j));
const post = (chemin: string, j: string, corps: object = {}) =>
  t.http().post(chemin).set(avec(j)).send(corps);
const put = (chemin: string, j: string, corps: object) =>
  t.http().put(chemin).set(avec(j)).send(corps);
const supprimer = (chemin: string, j: string) => t.http().delete(chemin).set(avec(j));

const webhook = (n: Pick<RequeteNotification, "entetes" | "corpsBrut">) =>
  t
    .http()
    .post("/paiements/webhooks/simule")
    .set(n.entetes as Record<string, string>)
    .send(n.corpsBrut ?? "");

const racine = "/voyageur/covoit/conducteur";

async function nouveauVoyageur(nom: string, telephone?: string): Promise<Compte> {
  return t.compte("voyageur", { nom, ...(telephone ? { telephone } : {}) });
}

/** Dépose et fait valider les quatre pièces d'un conducteur, par les routes. */
async function verifierConducteur(c: Compte, immatriculation = "LT 882 CE"): Promise<void> {
  const v = await put(`${racine}/verification/vehicule`, c.jeton, {
    marque: "Toyota",
    modele: "Corolla",
    couleur: "grise",
    immatriculation,
    places: 3,
    grandBagage: false,
  });
  expect(v.status, JSON.stringify(v.body)).toBe(200);
  const pieces: [string, object][] = [
    ["identite", { numero: "123456789" }],
    ["permis", { numero: "CM-445566", expireLe: "2031-06-30" }],
    ["carte_grise", { numero: "CG-778899" }],
    ["voiture", {}],
  ];
  for (const [type, extra] of pieces) {
    compteurFichiers += 1;
    const d = await put(`${racine}/verification/pieces/${type}`, c.jeton, {
      fichierId: `fichier:${compteurFichiers}`,
      ...extra,
    });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    const r = await put(`/covoiturage/verifications/${c.id}/pieces/${type}`, afrimove.jeton, {
      decision: "validee",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
}

async function conducteurVerifie(nom: string, telephone?: string): Promise<Compte> {
  const c = await nouveauVoyageur(nom, telephone);
  await verifierConducteur(c);
  return c;
}

const trajetDemain = (extra: object = {}) => ({
  depart: { ville: "Douala", point: "Bonapriso, pharmacie du Rond-point" },
  arrivee: { ville: "Kribi", point: "Kribi centre" },
  departA: t.dans(24 * 60),
  places: 2,
  prixParPlace: 4000,
  options: ["clim"],
  ...extra,
});

async function publier(c: Compte, extra: object = {}) {
  const r = await post(`${racine}/trajets`, c.jeton, trajetDemain(extra));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string };
}

async function reserver(p: Compte, offreId: string, places = 2) {
  const r = await post(`/voyageur/covoit/${offreId}/reservations`, p.jeton, { places });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return voyageur.SchemaCommande.parse(r.body);
}

async function payer(p: Compte, commandeId: string) {
  const r = await post(`/voyageur/commandes/${commandeId}/paiements`, p.jeton, {
    moyen: "mtn_momo",
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return voyageur.SchemaPaiement.parse(r.body);
}

async function operateurConfirme(paiementId: string) {
  const r = await webhook(t.agregateur.notificationDeReussite(paiementId));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

/** Réservation payée, de bout en bout par les routes. */
async function reservationPayee(p: Compte, offreId: string, places = 2) {
  const commande = await reserver(p, offreId, places);
  const paiement = await payer(p, commande.id);
  await operateurConfirme(paiement.id);
  return { commande, paiement };
}

describe("un conducteur non vérifié ne peut pas publier", () => {
  it("403 CONDUCTEUR_NON_VERIFIE avec ce qu'il reste à fournir ; vérifié, il publie", async () => {
    const c = await nouveauVoyageur("Paul Nkoulou");
    const refus = await post(`${racine}/trajets`, c.jeton, trajetDemain());
    expect(refus.status).toBe(403);
    expect(refus.body).toMatchObject({
      code: "CONDUCTEUR_NON_VERIFIE",
      details: { statut: "incomplet", aFournir: ["identite", "permis", "carte_grise", "voiture"] },
    });

    await verifierConducteur(c, "LT 100 AA");
    const ok = await post(`${racine}/trajets`, c.jeton, trajetDemain());
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
  });

  it("les pièces déposées ne suffisent pas : AfriMove doit les valider", async () => {
    const c = await nouveauVoyageur("Pierre Essomba");
    await put(`${racine}/verification/vehicule`, c.jeton, {
      marque: "Toyota",
      modele: "Yaris",
      couleur: "blanche",
      immatriculation: "LT 200 BB",
      places: 3,
    });
    for (const [type, extra] of [
      ["identite", { numero: "111222333" }],
      ["permis", { numero: "CM-1", expireLe: "2031-01-01" }],
      ["carte_grise", { numero: "CG-1" }],
      ["voiture", {}],
    ] as [string, object][]) {
      await put(`${racine}/verification/pieces/${type}`, c.jeton, {
        fichierId: `f:${type}:x`,
        ...extra,
      });
    }
    const refus = await post(`${racine}/trajets`, c.jeton, trajetDemain());
    expect(refus.status).toBe(403);
    expect(refus.body).toMatchObject({ details: { statut: "en_verification" } });
    // AfriMove voit le dossier à vérifier
    const liste = await get("/covoiturage/verifications", afrimove.jeton);
    expect(liste.status).toBe(200);
    expect(JSON.stringify(liste.body)).toContain(c.id);
    expect(JSON.stringify(liste.body)).not.toContain("111222333");
  });

  it("une pièce refusée est expliquée au conducteur par SMS et bloque la publication", async () => {
    const c = await nouveauVoyageur("Alain Tchoua");
    await verifierConducteur(c, "LT 300 CC");
    compteurFichiers += 1;
    await put(`${racine}/verification/pieces/permis`, c.jeton, {
      fichierId: `fichier:${compteurFichiers}`,
      numero: "CM-2",
      expireLe: "2031-01-01",
    });
    const sansMotif = await put(
      `/covoiturage/verifications/${c.id}/pieces/permis`,
      afrimove.jeton,
      {
        decision: "refusee",
      },
    );
    expect(sansMotif.status).toBe(422);
    const refus = await put(`/covoiturage/verifications/${c.id}/pieces/permis`, afrimove.jeton, {
      decision: "refusee",
      motif: "photo floue",
    });
    expect(refus.status, JSON.stringify(refus.body)).toBe(200);
    expect((await post(`${racine}/trajets`, c.jeton, trajetDemain())).status).toBe(403);
  });
});

// Avant les tests qui font avancer l'horloge : le départ de bus de test est à date fixe.
describe("les billets de bus ne sont pas touchés", () => {
  it("une commande de bus se paie et émet son billet comme avant", async () => {
    const v = await nouveauVoyageur("Laurent Bella");
    const r = await post("/voyageur/commandes", v.jeton, {
      departId: DEPART,
      sieges: [31],
      pour: "moi",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const commande = voyageur.SchemaCommande.parse(r.body);
    expect(commande.type).not.toBe("covoiturage");
    const paiement = await payer(v, commande.id);
    await operateurConfirme(paiement.id);
    expect((await t.commandes.trouver(commande.id))?.billetIds).toHaveLength(1);
    // et ce n'est pas une réservation de covoiturage
    expect(await t.covoiturage.reservations.trouver(commande.id)).toBeNull();
  });
});

const versementsDe = (reservationId: string) =>
  t.covoiturage.passerelle.envois.filter((e) => e.reservationId === reservationId);

describe("les écrans covoiturage avec l'adaptateur HTTP", () => {
  it("de la publication à l'argent libéré : chaque réponse suit son schéma", async () => {
    const conducteur = await conducteurVerifie("Samuel Ekambi", "+237677112233");
    const passager = await nouveauVoyageur("Alice Mballa");

    // « Proposer mon trajet »
    const formulaire = await get(`${racine}/formulaire`, conducteur.jeton);
    expect(formulaire.status).toBe(200);
    const f = voyageur.SchemaFormulairePublication.parse(formulaire.body);
    expect(f.fraisParPlace).toBe(250);

    const trajet = await publier(conducteur);
    const mes = voyageur.SchemaMesTrajetsCovoit.parse((await get(racine, conducteur.jeton)).body);
    expect(mes.resume).toMatchObject({
      gainSemaine: 0,
      trajets: 0,
      annulations: 0,
      piecesOk: true,
    });
    expect(mes.publies.map((x) => x.id)).toContain(trajet.id);

    // « Covoit » : recherche
    const recherche = await get("/voyageur/covoit?depart=Douala&arrivee=Kribi", passager.jeton);
    expect(recherche.status, JSON.stringify(recherche.body)).toBe(200);
    const res = voyageur.SchemaResultatRechercheCovoit.parse(recherche.body);
    const offre = res.offres.find((o) => o.id === trajet.id)!;
    expect(offre).toMatchObject({ placesLibres: 2, prixParPlace: 4000, clim: true });
    expect(offre.conducteur.verifie).toBe(true);

    // réserver puis payer comme pour un billet
    const commande = await reserver(passager, offre.id, 2);
    expect(commande).toMatchObject({ type: "covoiturage", total: 8500, billetIds: [] });
    expect(commande.lignes.map((l) => l.montant)).toEqual([8000, 500]);
    expect(commande.libelle).toContain("Samuel · Douala → Kribi");

    const paiement = await payer(passager, commande.id);
    expect(paiement).toMatchObject({
      commandeId: commande.id,
      statut: "en_attente_confirmation",
      montant: 8500,
    });

    // pas encore payée : le conducteur ne voit rien, les places sont retenues
    expect(
      voyageur.SchemaMesTrajetsCovoit.parse((await get(racine, conducteur.jeton)).body).publies[0]
        ?.reservations,
    ).toEqual([]);

    await operateurConfirme(paiement.id);
    expect(
      voyageur.SchemaPaiement.parse(
        (await get(`/voyageur/paiements/${paiement.id}`, passager.jeton)).body,
      ).statut,
    ).toBe("reussi");

    // aucun billet de bus n'a été créé
    expect(await t.commandes.trouver(commande.id)).toBeNull();

    // la réservation est payée ; l'argent n'est PAS encore parti
    const apresPaiement = await get(`/voyageur/covoit/reservations/${commande.id}`, passager.jeton);
    expect(apresPaiement.status).toBe(200);
    expect(apresPaiement.body).toMatchObject({
      statut: "payee",
      places: 2,
      total: 8500,
      peutConfirmerArrivee: false,
    });
    expect(versementsDe(commande.id)).toHaveLength(0);
    const mesApres = voyageur.SchemaMesTrajetsCovoit.parse(
      (await get(racine, conducteur.jeton)).body,
    );
    expect(mesApres.publies[0]?.reservations).toEqual([
      { passager: "Alice M.", places: 2, montantPaye: 8000 },
    ]);

    // avant le départ, « je suis arrivé » est refusé : toujours rien de versé
    const tot = await post(`/voyageur/covoit/reservations/${commande.id}/arrivee`, passager.jeton);
    expect(tot.status).toBe(409);
    expect(tot.body).toMatchObject({ code: "TRAJET_PAS_COMMENCE" });
    expect(versementsDe(commande.id)).toHaveLength(0);

    // le trajet a eu lieu : le passager confirme son arrivée
    t.horloge.avancer(24 * 60 * MINUTE + 1);
    const arrivee = await post(
      `/voyageur/covoit/reservations/${commande.id}/arrivee`,
      passager.jeton,
    );
    expect(arrivee.status, JSON.stringify(arrivee.body)).toBe(200);
    expect(arrivee.body).toMatchObject({ statut: "terminee" });
    expect(versementsDe(commande.id)).toEqual([
      {
        cle: `covoiturage:${commande.id}`,
        montant: 8000,
        telephone: "+237677112233",
        reservationId: commande.id,
      },
    ]);
    // on confirme une seconde fois : toujours un seul versement
    expect(
      (await post(`/voyageur/covoit/reservations/${commande.id}/arrivee`, passager.jeton)).status,
    ).toBe(200);
    expect(versementsDe(commande.id)).toHaveLength(1);

    // le tableau de bord du conducteur montre l'argent reçu et le trajet mené à terme
    const fin = voyageur.SchemaMesTrajetsCovoit.parse((await get(racine, conducteur.jeton)).body);
    expect(fin.resume).toMatchObject({ gainSemaine: 8000, trajets: 1 });

    // notes : une fois chacun
    const note = await post(`/voyageur/covoit/reservations/${commande.id}/note`, passager.jeton, {
      note: 5,
    });
    expect(note.status).toBe(201);
    expect(
      (await post(`/voyageur/covoit/reservations/${commande.id}/note`, passager.jeton, { note: 4 }))
        .status,
    ).toBe(409);
    expect(
      (await post(`${racine}/reservations/${commande.id}/note`, conducteur.jeton, { note: 4 }))
        .status,
    ).toBe(201);

    // AfriMove voit le versement
    const versements = await get("/covoiturage/versements", afrimove.jeton);
    expect(versements.status).toBe(200);
    expect(JSON.stringify(versements.body)).toContain(commande.id);
  });

  it("sans confirmation du passager, l'argent part 2 h après l'arrivée prévue (balayage)", async () => {
    const conducteur = await conducteurVerifie("Marc Njoya", "+237677445566");
    const passager = await nouveauVoyageur("Béatrice Ndzana");
    const trajet = await publier(conducteur, { departA: t.dans(60) });
    const { commande } = await reservationPayee(passager, trajet.id, 1);

    // arrivée prévue = départ + 2 h 30 ; paiement 2 h plus tard
    t.horloge.avancer((60 + 150 + 119) * MINUTE);
    await t.covoiturage.balayage.balayer();
    expect(
      t.covoiturage.passerelle.envois.filter((e) => e.reservationId === commande.id),
    ).toHaveLength(0);
    t.horloge.avancer(2 * MINUTE);
    await t.covoiturage.balayage.balayer();
    expect(t.covoiturage.passerelle.envois.filter((e) => e.reservationId === commande.id)).toEqual([
      expect.objectContaining({ montant: 4000, telephone: "+237677445566" }),
    ]);
    const vue = await get(`/voyageur/covoit/reservations/${commande.id}`, passager.jeton);
    expect(vue.body).toMatchObject({ statut: "terminee" });
  });

  it("annulation par le passager : le prix est rendu, les frais d'AfriMove restent", async () => {
    const conducteur = await conducteurVerifie("Henri Biyick", "+237677778899");
    const passager = await nouveauVoyageur("Claire Ondoa");
    const trajet = await publier(conducteur, { departA: t.dans(5 * 60) });
    const { commande, paiement } = await reservationPayee(passager, trajet.id, 2);

    const annulation = await supprimer(
      `/voyageur/covoit/reservations/${commande.id}`,
      passager.jeton,
    );
    expect(annulation.status, JSON.stringify(annulation.body)).toBe(200);
    expect(annulation.body).toMatchObject({
      statut: "annulee",
      rembourse: 8000,
      retenue: 0,
      gratuite: true,
    });
    const rembs = await t.remboursements.dePaiement(paiement.id);
    expect(rembs).toHaveLength(1);
    expect(rembs[0]!.lignes).toEqual([{ beneficiaire: "compagnie", montant: 8000 }]);
    expect(versementsDe(commande.id)).toHaveLength(0);
    // la place est libre de nouveau
    const recherche = voyageur.SchemaResultatRechercheCovoit.parse(
      (
        await get(
          "/voyageur/covoit?depart=Douala&arrivee=Kribi",
          (await nouveauVoyageur("Autre Voyageur")).jeton,
        )
      ).body,
    );
    expect(recherche.offres.find((o) => o.id === trajet.id)?.placesLibres).toBe(2);
  });

  it("annulation du trajet par le conducteur : passagers remboursés en entier", async () => {
    const conducteur = await conducteurVerifie("Joseph Fotso", "+237677990011");
    const passager = await nouveauVoyageur("Denise Mbarga");
    const trajet = await publier(conducteur, { departA: t.dans(48 * 60) });
    const { paiement } = await reservationPayee(passager, trajet.id, 1);

    const r = await supprimer(`${racine}/trajets/${trajet.id}`, conducteur.jeton);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ trajetId: trajet.id, statut: "annule", passagersRembourses: 1 });
    const rembs = await t.remboursements.dePaiement(paiement.id);
    expect(rembs.flatMap((x) => x.lignes)).toEqual([
      { beneficiaire: "compagnie", montant: 4000 },
      { beneficiaire: "afrimove", montant: 250 },
    ]);
    // le trajet n'est plus proposé
    const recherche = voyageur.SchemaResultatRechercheCovoit.parse(
      (await get("/voyageur/covoit?depart=Douala&arrivee=Kribi", passager.jeton)).body,
    );
    expect(recherche.offres.find((o) => o.id === trajet.id)).toBeUndefined();
  });

  it("paiement qui arrive après l'annulation du trajet : remboursé en entier, aucune réservation payée", async () => {
    const conducteur = await conducteurVerifie("Luc Mvondo", "+237677121212");
    const passager = await nouveauVoyageur("Estelle Abena");
    const trajet = await publier(conducteur, { departA: t.dans(72 * 60) });
    const commande = await reserver(passager, trajet.id, 2);
    const paiement = await payer(passager, commande.id);
    await supprimer(`${racine}/trajets/${trajet.id}`, conducteur.jeton);
    await operateurConfirme(paiement.id);

    expect((await t.covoiturage.reservations.trouver(commande.id))?.statut).toBe("annulee");
    const rembs = await t.remboursements.dePaiement(paiement.id);
    expect(rembs.flatMap((x) => x.lignes).reduce((s, l) => s + l.montant, 0)).toBe(8500);
    expect(versementsDe(commande.id)).toHaveLength(0);
  });

  it("« Covoit en ville » et trajet régulier : réponses conformes", async () => {
    const conducteur = await conducteurVerifie("Yves Kamdem", "+237677131313");
    const passager = await nouveauVoyageur("Fanny Etoundi");
    const ville = await post(`${racine}/trajets`, conducteur.jeton, {
      depart: { ville: "Douala", point: "Akwa, rond-point Deido" },
      arrivee: { ville: "Douala", point: "Bonanjo, Boulevard de la Liberté" },
      departA: t.dans(45),
      places: 2,
      prixParPlace: 500,
      options: [],
    });
    expect(ville.status, JSON.stringify(ville.body)).toBe(201);

    const offres = await get(
      "/voyageur/ville/offres?ville=Douala&quand=maintenant",
      passager.jeton,
    );
    expect(offres.status, JSON.stringify(offres.body)).toBe(200);
    const parse = voyageur.SchemaResultatRechercheVille.parse(offres.body);
    expect(parse.offres.map((o) => o.id)).toContain((ville.body as { id: string }).id);

    expect((await get("/voyageur/covoit/ville/trajet-regulier", passager.jeton)).status).toBe(404);
    const cree = await post("/voyageur/covoit/ville/trajet-regulier", passager.jeton, {
      ville: "Douala",
      depart: "Akwa",
      arrivee: "Bonanjo",
      departA: "07:30",
    });
    expect(cree.status, JSON.stringify(cree.body)).toBe(201);
    expect(voyageur.SchemaTrajetRegulier.parse(cree.body).actif).toBe(true);
    const coupe = await put("/voyageur/covoit/ville/trajet-regulier", passager.jeton, {
      actif: false,
    });
    expect(voyageur.SchemaTrajetRegulier.parse(coupe.body).actif).toBe(false);
    const avecTrajet = voyageur.SchemaResultatRechercheVille.parse(
      (await get("/voyageur/ville/offres?ville=Douala", passager.jeton)).body,
    );
    expect(avecTrajet.trajetDuMatin?.actif).toBe(false);
  });

  it("demande de passager, proposition du conducteur, réservation", async () => {
    const conducteur = await conducteurVerifie("Gilbert Atangana", "+237677141414");
    const passager = await nouveauVoyageur("Hélène Mevoungou");
    const trajet = await publier(conducteur, { departA: t.dans(30 * 60) });
    const jour = t.dans(30 * 60).slice(0, 10);

    const demande = await post("/voyageur/covoit/demandes", passager.jeton, {
      depart: "Douala",
      arrivee: "Kribi",
      jour,
      places: 1,
    });
    expect(demande.status, JSON.stringify(demande.body)).toBe(201);
    const demandeId = (demande.body as { id: string }).id;

    const mes = voyageur.SchemaMesTrajetsCovoit.parse((await get(racine, conducteur.jeton)).body);
    const vue = mes.demandes.find((d) => d.id === demandeId);
    expect(vue).toMatchObject({ passager: "Hélène M.", trajetPropose: trajet.id });

    const proposition = await post(
      `${racine}/demandes/${demandeId}/propositions`,
      conducteur.jeton,
      {
        trajetId: trajet.id,
      },
    );
    expect(proposition.status, JSON.stringify(proposition.body)).toBe(201);
    expect(voyageur.SchemaResultatProposition.parse(proposition.body)).toEqual({
      demandeId,
      trajetId: trajet.id,
      envoyee: true,
    });
    const mesDemandes = await get("/voyageur/covoit/demandes", passager.jeton);
    expect((mesDemandes.body as { propositions: unknown[] }[])[0]?.propositions).toHaveLength(1);

    await reservationPayee(passager, trajet.id, 1);
    const apres = await get("/voyageur/covoit/demandes", passager.jeton);
    expect((apres.body as { statut: string }[])[0]?.statut).toBe("satisfaite");
  });
});

describe("rôles et accès", () => {
  it("sans jeton : 401 ; guichetier et patron : 403 sur les routes du voyageur", async () => {
    expect((await t.http().get("/voyageur/covoit?depart=Douala&arrivee=Kribi")).status).toBe(401);
    expect(
      (await get("/voyageur/covoit?depart=Douala&arrivee=Kribi", guichetier.jeton)).status,
    ).toBe(403);
    expect((await get(racine, patron.jeton)).status).toBe(403);
    expect((await post(`${racine}/trajets`, guichetier.jeton, trajetDemain())).status).toBe(403);
  });

  it("les routes d'AfriMove ne sont pas ouvertes aux voyageurs", async () => {
    const v = await nouveauVoyageur("Curieux");
    expect((await get("/covoiturage/verifications", v.jeton)).status).toBe(403);
    expect((await get("/covoiturage/versements", v.jeton)).status).toBe(403);
    expect(
      (
        await put(`/covoiturage/verifications/${v.id}/pieces/identite`, v.jeton, {
          decision: "validee",
        })
      ).status,
    ).toBe(403);
    expect((await get("/covoiturage/verifications", afrimove.jeton)).status).toBe(200);
  });

  it("une réservation est personnelle : un autre voyageur ne la voit pas, ne la paie pas, ne l'annule pas", async () => {
    const conducteur = await conducteurVerifie("Ivan Tamo", "+237677151515");
    const proprio = await nouveauVoyageur("Jeanne Kenfack");
    const intrus = await nouveauVoyageur("Intrus Curieux");
    const trajet = await publier(conducteur, { departA: t.dans(96 * 60) });
    const commande = await reserver(proprio, trajet.id, 1);
    expect((await get(`/voyageur/covoit/reservations/${commande.id}`, intrus.jeton)).status).toBe(
      404,
    );
    expect(
      (await supprimer(`/voyageur/covoit/reservations/${commande.id}`, intrus.jeton)).status,
    ).toBe(404);
    expect(
      (
        await post(`/voyageur/commandes/${commande.id}/paiements`, intrus.jeton, {
          moyen: "mtn_momo",
        })
      ).status,
    ).toBe(404);
    expect(
      (await post(`/voyageur/covoit/reservations/${commande.id}/arrivee`, intrus.jeton)).status,
    ).toBe(404);
  });

  it("un guichetier ne peut pas lire ni encaisser une réservation de covoiturage", async () => {
    const conducteur = await conducteurVerifie("Jules Mbida", "+237677161616");
    const passager = await nouveauVoyageur("Karine Ela");
    const trajet = await publier(conducteur, { departA: t.dans(120 * 60) });
    const commande = await reserver(passager, trajet.id, 1);
    expect(
      (await get(`/paiements/commandes/${commande.id}`, guichetier.jeton)).status,
    ).toBeGreaterThanOrEqual(403);
    const e = await post(`/paiements/commandes/${commande.id}/encaissement`, guichetier.jeton, {
      mode: "especes",
    });
    expect(e.status).toBeGreaterThanOrEqual(403);
    expect((await t.covoiturage.reservations.trouver(commande.id))?.statut).toBe(
      "en_attente_paiement",
    );
  });

  it("données invalides : 400 ou 422 lisible, jamais d'erreur 500", async () => {
    const v = await nouveauVoyageur("Test Invalide");
    const mauvais = await post("/voyageur/covoit/inconnu/reservations", v.jeton, { places: 0 });
    expect(mauvais.status).toBe(400);
    const inconnu = await post("/voyageur/covoit/inconnu/reservations", v.jeton, { places: 1 });
    expect(inconnu.status).toBe(404);
    expect((await get("/voyageur/covoit", v.jeton)).status).toBe(400);
    expect(
      (await put(`${racine}/verification/pieces/passeport`, v.jeton, { fichierId: "f:1" })).status,
    ).toBe(400);
  });
});
