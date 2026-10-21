import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type {
  DemandeCovoit,
  DossierConducteur,
  NoteCovoit,
  PieceConducteur,
  Reservation,
  Trajet,
  Versement,
} from "../modeles";
import type {
  Demandes,
  Dossiers,
  Notes,
  Reservations,
  Trajets,
  TrajetsReguliersPassagers,
  Versements,
} from "../ports";

/**
 * Contrat des ports de stockage du covoiturage : les mêmes tests passent sur la mémoire et sur
 * PostgreSQL. Un comportement que la mémoire a et que la base n'a pas (ou l'inverse) fait échouer l'un
 * des deux : c'est ce qui prouve que la mémoire, sur laquelle tournent tous les autres tests du
 * module, se comporte comme la base (places jamais dépassées, un versement par réservation…).
 */

export interface BancCovoiturage {
  trajets: Trajets;
  reservations: Reservations;
  dossiers: Dossiers;
  versements: Versements;
  demandes: Demandes;
  notes: Notes;
  reguliers: TrajetsReguliersPassagers;
  /** Un compte (en base : une ligne `personne`). */
  personne(): Promise<string>;
  fermer(): Promise<void>;
}

const T0 = new Date("2027-01-10T08:00:00.000Z");
const minutes = (n: number, depuis: Date = T0): Date => new Date(depuis.getTime() + n * 60_000);

export function unTrajet(conducteurId: string, o: Partial<Trajet> = {}): Trajet {
  return {
    id: randomUUID(),
    conducteurId,
    type: "entre_villes",
    departVille: "Douala",
    departPoint: "Carrefour Ndokoti",
    arriveeVille: "Kribi",
    arriveePoint: "Gare routière",
    departA: minutes(24 * 60),
    dureeMinutes: 150,
    places: 4,
    prixParPlace: 4000,
    options: ["clim"],
    vehicule: "Toyota Corolla grise",
    immatriculation: "LT 123 AB",
    grandBagage: false,
    regulier: false,
    suivantCreeA: null,
    statut: "publie",
    creeA: T0,
    annuleA: null,
    ...o,
  };
}

export function uneReservation(
  trajet: Trajet,
  passagerId: string,
  o: Partial<Reservation> = {},
): Reservation {
  return {
    id: randomUUID(),
    trajetId: trajet.id,
    conducteurId: trajet.conducteurId,
    passagerId,
    places: 1,
    prixParPlace: trajet.prixParPlace,
    fraisParPlace: 250,
    libelle: "Covoiturage Samuel · Douala → Kribi · 08:30",
    statut: "en_attente_paiement",
    creeA: T0,
    expireA: minutes(15),
    payeeA: null,
    moyenPaiement: null,
    departA: trajet.departA,
    liberationAutoA: minutes(24 * 60 + 270),
    libereeA: null,
    motifLiberation: null,
    annuleeA: null,
    annulePar: null,
    remboursement: null,
    retenue: 0,
    ...o,
  };
}

export function unVersement(
  reservationId: string,
  conducteurId: string,
  o: Partial<Versement> = {},
): Versement {
  return {
    id: randomUUID(),
    reservationId,
    conducteurId,
    montant: 8000,
    motif: "confirmation_passager",
    statut: "a_faire",
    reference: null,
    tentatives: 0,
    prochainEssaiA: T0,
    derniereErreur: null,
    creeA: T0,
    faitA: null,
    ...o,
  };
}

function unePiece(
  type: PieceConducteur["type"],
  o: Partial<PieceConducteur> = {},
): PieceConducteur {
  return {
    type,
    statut: "a_verifier",
    fichierId: `fichier-${randomUUID()}`,
    numeroChiffre: type === "voiture" ? null : "enc:v1:numero",
    expireLe: type === "permis" ? "2030-06-30" : null,
    deposeeA: T0,
    verifieePar: null,
    verifieeA: null,
    motifRefus: null,
    ...o,
  };
}

function unDossier(conducteurId: string, o: Partial<DossierConducteur> = {}): DossierConducteur {
  return {
    conducteurId,
    vehicule: {
      marque: "Toyota",
      modele: "Corolla",
      couleur: "grise",
      immatriculation: "LT 123 AB",
      places: 4,
      grandBagage: true,
    },
    pieces: { identite: unePiece("identite"), permis: unePiece("permis") },
    numeroVersementChiffre: "enc:v1:momo",
    creeA: T0,
    modifieA: T0,
    ...o,
  };
}

export function contratPortsCovoiturage(
  titre: string,
  creerBanc: () => Promise<BancCovoiturage>,
): void {
  describe(titre, () => {
    let banc: BancCovoiturage | null = null;
    const obtenir = async (): Promise<BancCovoiturage> => (banc ??= await creerBanc());
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("Trajets", () => {
      it("garde un trajet tel qu'il a été écrit", async () => {
        const b = await obtenir();
        const t = unTrajet(await b.personne(), { options: ["clim", "femmes"], regulier: true });
        await b.trajets.creer(t);
        expect(await b.trajets.trouver(t.id)).toEqual(t);
        expect(await b.trajets.trouver(randomUUID())).toBeNull();
        expect(await b.trajets.trouver("pas-un-uuid")).toBeNull();
      });

      it("un changement d'état ne passe qu'une fois (comparer et remplacer)", async () => {
        const b = await obtenir();
        const t = unTrajet(await b.personne());
        await b.trajets.creer(t);
        const resultats = await Promise.all(
          Array.from({ length: 6 }, () =>
            b.trajets.transitionner(t.id, ["publie"], { statut: "annule", annuleA: minutes(5) }),
          ),
        );
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
        expect((await b.trajets.trouver(t.id))?.statut).toBe("annule");
        expect(await b.trajets.transitionner(t.id, ["publie"], { statut: "termine" })).toBeNull();
      });

      it("la recherche ne rend que les trajets publiés de la fenêtre, du plus proche au plus lointain", async () => {
        const b = await obtenir();
        const c = await b.personne();
        // Une ville propre à ce test : les autres tests du même banc ne la croisent pas.
        const ville = `Villetest${randomUUID().slice(0, 6)}`;
        const norm = ville.toLowerCase();
        const base = { departVille: ville, arriveeVille: "Yaoundé" };
        const tard = unTrajet(c, { ...base, departA: minutes(48 * 60) });
        const tot = unTrajet(c, { ...base, departA: minutes(24 * 60) });
        const annule = unTrajet(c, { ...base, departA: minutes(30 * 60), statut: "annule" });
        const hors = unTrajet(c, { ...base, departA: minutes(90 * 60) });
        const autre = unTrajet(c, {
          ...base,
          arriveeVille: "Bafoussam",
          departA: minutes(25 * 60),
        });
        for (const t of [tard, tot, annule, hors, autre]) await b.trajets.creer(t);
        const trouves = await b.trajets.rechercher({
          type: "entre_villes",
          departVille: norm,
          arriveeVille: "yaounde",
          du: T0,
          jusqua: minutes(72 * 60),
          limite: 10,
        });
        expect(trouves.map((t) => t.id)).toEqual([tot.id, tard.id]);
        const un = await b.trajets.rechercher({
          type: "entre_villes",
          departVille: norm,
          du: T0,
          limite: 1,
        });
        expect(un.map((t) => t.id)).toEqual([tot.id]);
      });

      it("rend les trajets d'un conducteur, filtrés par statut et par date", async () => {
        const b = await obtenir();
        const c = await b.personne();
        const a = unTrajet(c, { departA: minutes(24 * 60) });
        const z = unTrajet(c, { departA: minutes(48 * 60), statut: "termine" });
        await b.trajets.creer(z);
        await b.trajets.creer(a);
        expect((await b.trajets.duConducteur(c)).map((t) => t.id)).toEqual([a.id, z.id]);
        expect(
          (await b.trajets.duConducteur(c, { statuts: ["termine"] })).map((t) => t.id),
        ).toEqual([z.id]);
        expect(
          (await b.trajets.duConducteur(c, { depuis: minutes(30 * 60) })).map((t) => t.id),
        ).toEqual([z.id]);
      });

      it("trouve les trajets dont l'arrivée prévue est passée", async () => {
        const b = await obtenir();
        const c = await b.personne();
        const fini = unTrajet(c, { departA: minutes(-300), dureeMinutes: 120 });
        const enCours = unTrajet(c, { departA: minutes(-100), dureeMinutes: 120 });
        const futur = unTrajet(c, { departA: minutes(60), dureeMinutes: 120 });
        for (const t of [fini, enCours, futur]) await b.trajets.creer(t);
        const ids = (await b.trajets.aTerminer(T0, 1000)).map((t) => t.id);
        expect(ids).toContain(fini.id);
        expect(ids).not.toContain(enCours.id);
        expect(ids).not.toContain(futur.id);
      });

      it("le marqueur « occurrence suivante publiée » ne se pose qu'une fois, même demandé en parallèle", async () => {
        const b = await obtenir();
        const t = unTrajet(await b.personne(), { regulier: true, departA: minutes(-60) });
        await b.trajets.creer(t);
        expect((await b.trajets.aRenouveler(T0, 1000)).map((x) => x.id)).toContain(t.id);
        const poses = await Promise.all(
          Array.from({ length: 5 }, () => b.trajets.marquerSuivant(t.id, minutes(1))),
        );
        expect(poses.filter(Boolean)).toHaveLength(1);
        expect((await b.trajets.trouver(t.id))?.suivantCreeA).toEqual(minutes(1));
        expect((await b.trajets.aRenouveler(T0, 1000)).map((x) => x.id)).not.toContain(t.id);
      });

      it("compte chaque voyageur une fois par trajet vu, et les trajets annulés d'un conducteur", async () => {
        const b = await obtenir();
        const c = await b.personne();
        const v1 = await b.personne();
        const v2 = await b.personne();
        const t = unTrajet(c);
        const t2 = unTrajet(c, { statut: "annule" });
        await b.trajets.creer(t);
        await b.trajets.creer(t2);
        await b.trajets.enregistrerVues([t.id, t2.id], v1);
        await b.trajets.enregistrerVues([t.id], v1);
        await b.trajets.enregistrerVues([t.id], v2);
        expect(await b.trajets.nombreVues(t.id)).toBe(2);
        expect(await b.trajets.nombreVues(t2.id)).toBe(1);
        expect(await b.trajets.nombreAnnules(c)).toBe(1);
      });
    });

    describe("Reservations", () => {
      async function trajetEtPassagers(places = 4) {
        const b = await obtenir();
        const t = unTrajet(await b.personne(), { places });
        await b.trajets.creer(t);
        return { b, t };
      }

      it("retient des places et les rend telles quelles", async () => {
        const { b, t } = await trajetEtPassagers();
        const r = uneReservation(t, await b.personne(), { places: 2 });
        expect(await b.reservations.reserver(r, t.places, T0)).toEqual({ ok: true });
        expect(await b.reservations.trouver(r.id)).toEqual(r);
        expect(await b.reservations.placesPrises(t.id, T0)).toBe(2);
        expect((await b.reservations.duTrajet(t.id)).map((x) => x.id)).toEqual([r.id]);
      });

      it("refuse une deuxième réservation en cours du même passager", async () => {
        const { b, t } = await trajetEtPassagers();
        const p = await b.personne();
        const premiere = uneReservation(t, p);
        await b.reservations.reserver(premiere, t.places, T0);
        const r = await b.reservations.reserver(uneReservation(t, p), t.places, T0);
        expect(r).toMatchObject({ ok: false, raison: "deja_reservee" });
        expect(r.ok === false && r.existante?.id).toBe(premiere.id);
      });

      it("refuse au-delà des places, une retenue échue ne compte plus", async () => {
        const { b, t } = await trajetEtPassagers(3);
        await b.reservations.reserver(
          uneReservation(t, await b.personne(), { places: 2, expireA: minutes(15) }),
          3,
          T0,
        );
        const trop = await b.reservations.reserver(
          uneReservation(t, await b.personne(), { places: 2 }),
          3,
          T0,
        );
        expect(trop).toEqual({ ok: false, raison: "complet" });
        // Vingt minutes plus tard, la retenue de 15 minutes est échue : les places sont revenues.
        const plusTard = await b.reservations.reserver(
          uneReservation(t, await b.personne(), {
            places: 3,
            creeA: minutes(20),
            expireA: minutes(35),
          }),
          3,
          minutes(20),
        );
        expect(plusTard).toEqual({ ok: true });
      });

      it("dix réservations simultanées pour quatre places : jamais plus de quatre places retenues", async () => {
        const { b, t } = await trajetEtPassagers(4);
        const passagers = await Promise.all(Array.from({ length: 10 }, () => b.personne()));
        const resultats = await Promise.all(
          passagers.map((p) => b.reservations.reserver(uneReservation(t, p), 4, T0)),
        );
        expect(resultats.filter((r) => r.ok)).toHaveLength(4);
        expect(resultats.filter((r) => !r.ok && r.raison === "complet")).toHaveLength(6);
        expect(await b.reservations.placesPrises(t.id, T0)).toBe(4);
      });

      it("le même passager qui réserve deux fois en même temps n'obtient qu'une réservation", async () => {
        const { b, t } = await trajetEtPassagers(4);
        const p = await b.personne();
        const resultats = await Promise.all(
          Array.from({ length: 5 }, () => b.reservations.reserver(uneReservation(t, p), 4, T0)),
        );
        expect(resultats.filter((r) => r.ok)).toHaveLength(1);
        expect(await b.reservations.placesPrises(t.id, T0)).toBe(1);
      });

      it("un changement d'état ne passe qu'une fois", async () => {
        const { b, t } = await trajetEtPassagers();
        const r = uneReservation(t, await b.personne());
        await b.reservations.reserver(r, t.places, T0);
        const resultats = await Promise.all(
          Array.from({ length: 5 }, () =>
            b.reservations.transitionner(r.id, ["en_attente_paiement"], {
              statut: "annulee",
              annuleeA: minutes(3),
              annulePar: "passager",
              remboursement: { prix: 4000, frais: 250 },
            }),
          ),
        );
        expect(resultats.filter((x) => x !== null)).toHaveLength(1);
        const apres = await b.reservations.trouver(r.id);
        expect(apres).toMatchObject({
          statut: "annulee",
          remboursement: { prix: 4000, frais: 250 },
        });
        // Une annulation libère les places.
        expect(await b.reservations.placesPrises(t.id, T0)).toBe(0);
      });

      it("le paiement passe la réservation à « payée », une seule fois", async () => {
        const { b, t } = await trajetEtPassagers();
        const r = uneReservation(t, await b.personne(), { places: 2 });
        await b.reservations.reserver(r, t.places, T0);
        const payee = await b.reservations.payer(r.id, t.places, minutes(5), {
          payeeA: minutes(5),
          moyenPaiement: "momo",
        });
        expect(payee).toMatchObject({
          ok: true,
          dejaPayee: false,
          reservation: { statut: "payee", moyenPaiement: "momo", payeeA: minutes(5) },
        });
        const encore = await b.reservations.payer(r.id, t.places, minutes(6), {
          payeeA: minutes(6),
          moyenPaiement: "momo",
        });
        expect(encore).toMatchObject({ ok: true, dejaPayee: true });
        expect((await b.reservations.trouver(r.id))?.payeeA).toEqual(minutes(5));
        expect(await b.reservations.payer(randomUUID(), 4, T0, {})).toEqual({
          ok: false,
          raison: "inconnue",
        });
      });

      it("un paiement tardif reprend les places seulement s'il en reste", async () => {
        const { b, t } = await trajetEtPassagers(2);
        const lente = uneReservation(t, await b.personne(), { places: 2 });
        await b.reservations.reserver(lente, 2, T0);
        await b.reservations.transitionner(lente.id, ["en_attente_paiement"], {
          statut: "expiree",
        });
        // Pendant ce temps, un autre passager prend les deux places.
        const rapide = uneReservation(t, await b.personne(), {
          places: 2,
          creeA: minutes(20),
          expireA: minutes(35),
        });
        expect(await b.reservations.reserver(rapide, 2, minutes(20))).toEqual({ ok: true });
        expect(await b.reservations.payer(lente.id, 2, minutes(25), {})).toEqual({
          ok: false,
          raison: "complet",
        });
        // Si l'autre annule, le paiement tardif passe.
        await b.reservations.transitionner(rapide.id, ["en_attente_paiement"], {
          statut: "annulee",
        });
        expect(await b.reservations.payer(lente.id, 2, minutes(30), {})).toMatchObject({
          ok: true,
        });
      });

      it("un paiement pour une réservation annulée est refusé", async () => {
        const { b, t } = await trajetEtPassagers();
        const r = uneReservation(t, await b.personne());
        await b.reservations.reserver(r, t.places, T0);
        await b.reservations.transitionner(r.id, ["en_attente_paiement"], { statut: "annulee" });
        expect(await b.reservations.payer(r.id, t.places, T0, {})).toEqual({
          ok: false,
          raison: "annulee",
        });
      });

      it("liste par passager, par conducteur, à expirer et à libérer", async () => {
        const { b, t } = await trajetEtPassagers(6);
        const p = await b.personne();
        const attente = uneReservation(t, p, { expireA: minutes(10) });
        const payee = uneReservation(t, await b.personne(), {
          statut: "payee",
          payeeA: minutes(2),
          liberationAutoA: minutes(60),
        });
        await b.reservations.reserver(attente, 6, T0);
        await b.reservations.reserver(payee, 6, T0);
        expect((await b.reservations.duPassager(p)).map((x) => x.id)).toEqual([attente.id]);
        expect(
          (await b.reservations.duConducteur(t.conducteurId, ["payee"])).map((x) => x.id),
        ).toEqual([payee.id]);
        const expirables = (await b.reservations.aExpirer(minutes(11), 100)).map((x) => x.id);
        expect(expirables).toContain(attente.id);
        expect((await b.reservations.aExpirer(minutes(9), 100)).map((x) => x.id)).not.toContain(
          attente.id,
        );
        expect((await b.reservations.aLiberer(minutes(61), 100)).map((x) => x.id)).toContain(
          payee.id,
        );
        expect((await b.reservations.aLiberer(minutes(59), 100)).map((x) => x.id)).not.toContain(
          payee.id,
        );
      });
    });

    describe("Dossiers", () => {
      it("garde le dossier, le véhicule et les pièces tels quels", async () => {
        const b = await obtenir();
        const d = unDossier(await b.personne());
        await b.dossiers.enregistrer(d);
        expect(await b.dossiers.trouver(d.conducteurId)).toEqual(d);
        expect(await b.dossiers.trouver(randomUUID())).toBeNull();
      });

      it("enregistrer remplace : une pièce retirée disparaît, un véhicule absent aussi", async () => {
        const b = await obtenir();
        const c = await b.personne();
        await b.dossiers.enregistrer(unDossier(c));
        const apres = unDossier(c, {
          vehicule: null,
          pieces: {
            identite: unePiece("identite", {
              statut: "validee",
              verifieePar: await b.personne(),
              verifieeA: minutes(3),
            }),
          },
          numeroVersementChiffre: null,
          modifieA: minutes(3),
        });
        await b.dossiers.enregistrer(apres);
        expect(await b.dossiers.trouver(c)).toEqual(apres);
      });

      it("liste les dossiers à vérifier (les plus anciens d'abord) et tous (les plus récents d'abord)", async () => {
        const b = await obtenir();
        const ancien = unDossier(await b.personne(), { modifieA: minutes(-500) });
        const recent = unDossier(await b.personne(), { modifieA: minutes(-400) });
        const verifie = unDossier(await b.personne(), {
          modifieA: minutes(-450),
          pieces: { identite: unePiece("identite", { statut: "validee" }) },
        });
        for (const d of [recent, verifie, ancien]) await b.dossiers.enregistrer(d);
        const aVerifier = (await b.dossiers.aVerifier(1000)).map((d) => d.conducteurId);
        expect(aVerifier.indexOf(ancien.conducteurId)).toBeLessThan(
          aVerifier.indexOf(recent.conducteurId),
        );
        expect(aVerifier).not.toContain(verifie.conducteurId);
        const tous = (await b.dossiers.tous(1000)).map((d) => d.conducteurId);
        expect(tous.indexOf(recent.conducteurId)).toBeLessThan(tous.indexOf(verifie.conducteurId));
        expect(tous.indexOf(verifie.conducteurId)).toBeLessThan(tous.indexOf(ancien.conducteurId));
      });
    });

    describe("Versements", () => {
      async function reservationPayee() {
        const b = await obtenir();
        const t = unTrajet(await b.personne());
        await b.trajets.creer(t);
        const r = uneReservation(t, await b.personne(), { statut: "payee" });
        await b.reservations.reserver(r, t.places, T0);
        return { b, t, r };
      }

      it("un seul versement par réservation, même créé en parallèle", async () => {
        const { b, t, r } = await reservationPayee();
        const crees = await Promise.all(
          Array.from({ length: 6 }, () => b.versements.creer(unVersement(r.id, t.conducteurId))),
        );
        expect(crees.filter(Boolean)).toHaveLength(1);
        const v = await b.versements.deLaReservation(r.id);
        expect(v).toMatchObject({ reservationId: r.id, montant: 8000, statut: "a_faire" });
        expect(await b.versements.deLaReservation(randomUUID())).toBeNull();
      });

      it("un changement d'état ne passe qu'une fois", async () => {
        const { b, t, r } = await reservationPayee();
        const v = unVersement(r.id, t.conducteurId);
        await b.versements.creer(v);
        const resultats = await Promise.all(
          Array.from({ length: 5 }, () =>
            b.versements.transitionner(v.id, ["a_faire"], {
              statut: "fait",
              reference: "VERS-1",
              faitA: minutes(7),
              prochainEssaiA: null,
            }),
          ),
        );
        expect(resultats.filter((x) => x !== null)).toHaveLength(1);
        expect(await b.versements.deLaReservation(r.id)).toMatchObject({
          statut: "fait",
          reference: "VERS-1",
          faitA: minutes(7),
          prochainEssaiA: null,
        });
      });

      it("reprend les versements échus, liste par statut, et additionne ce qui est fait", async () => {
        const { b, t, r } = await reservationPayee();
        const v = unVersement(r.id, t.conducteurId, {
          prochainEssaiA: minutes(10),
          creeA: minutes(1),
        });
        await b.versements.creer(v);
        expect((await b.versements.aReprendre(minutes(9), 100)).map((x) => x.id)).not.toContain(
          v.id,
        );
        expect((await b.versements.aReprendre(minutes(10), 100)).map((x) => x.id)).toContain(v.id);
        expect(
          (await b.versements.lister({ statut: "a_faire", limite: 1000 })).map((x) => x.id),
        ).toContain(v.id);
        expect(
          (await b.versements.lister({ statut: "echoue", limite: 1000 })).map((x) => x.id),
        ).not.toContain(v.id);
        expect(await b.versements.duConducteur(t.conducteurId, T0)).toEqual([]);
        await b.versements.transitionner(v.id, ["a_faire"], { statut: "fait", faitA: minutes(11) });
        expect((await b.versements.duConducteur(t.conducteurId, T0)).map((x) => x.id)).toEqual([
          v.id,
        ]);
        expect(await b.versements.duConducteur(t.conducteurId, minutes(12))).toEqual([]);
      });
    });

    describe("Demandes", () => {
      const uneDemande = (passagerId: string, o: Partial<DemandeCovoit> = {}): DemandeCovoit => ({
        id: randomUUID(),
        passagerId,
        departVille: "Douala",
        arriveeVille: "Kribi",
        jour: "2027-01-12",
        moment: "matin",
        places: 2,
        statut: "ouverte",
        creeA: T0,
        ...o,
      });

      it("garde la demande telle quelle, sans moment aussi", async () => {
        const b = await obtenir();
        const d = uneDemande(await b.personne(), { moment: null });
        await b.demandes.creer(d);
        expect(await b.demandes.trouver(d.id)).toEqual(d);
        expect(await b.demandes.trouver(randomUUID())).toBeNull();
      });

      it("liste les demandes ouvertes d'une fenêtre de jours, dans l'ordre", async () => {
        const b = await obtenir();
        const p = await b.personne();
        const tard = uneDemande(p, { jour: "2027-02-20" });
        const tot = uneDemande(p, { jour: "2027-02-18", creeA: minutes(2) });
        const tot2 = uneDemande(p, { jour: "2027-02-18", creeA: minutes(1) });
        const annulee = uneDemande(p, { jour: "2027-02-19", statut: "annulee" });
        const dehors = uneDemande(p, { jour: "2027-03-30" });
        for (const d of [tard, tot, tot2, annulee, dehors]) await b.demandes.creer(d);
        const ouvertes = await b.demandes.ouvertes({
          du: "2027-02-18",
          au: "2027-02-20",
          limite: 100,
        });
        expect(ouvertes.map((d) => d.id)).toEqual([tot2.id, tot.id, tard.id]);
        expect((await b.demandes.duPassager(p)).map((d) => d.id)).toHaveLength(5);
      });

      it("un changement d'état ne passe qu'une fois, et les demandes passées sont à expirer", async () => {
        const b = await obtenir();
        const d = uneDemande(await b.personne(), { jour: "2026-12-30" });
        await b.demandes.creer(d);
        expect((await b.demandes.aExpirer("2027-01-01", 1000)).map((x) => x.id)).toContain(d.id);
        const resultats = await Promise.all(
          Array.from({ length: 4 }, () =>
            b.demandes.transitionner(d.id, ["ouverte"], { statut: "expiree" }),
          ),
        );
        expect(resultats.filter((x) => x !== null)).toHaveLength(1);
        expect((await b.demandes.aExpirer("2027-01-01", 1000)).map((x) => x.id)).not.toContain(
          d.id,
        );
      });

      it("une proposition par trajet et par demande", async () => {
        const b = await obtenir();
        const conducteur = await b.personne();
        const t = unTrajet(conducteur);
        await b.trajets.creer(t);
        const d = uneDemande(await b.personne());
        await b.demandes.creer(d);
        const p = {
          demandeId: d.id,
          conducteurId: conducteur,
          trajetId: t.id,
          envoyeeA: minutes(4),
        };
        const resultats = await Promise.all(
          Array.from({ length: 4 }, () => b.demandes.ajouterProposition(p)),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
        expect(await b.demandes.propositionsDeLaDemande(d.id)).toEqual([p]);
        expect(await b.demandes.propositionsDuConducteur(conducteur)).toEqual([p]);
      });
    });

    describe("Notes", () => {
      it("une note par rôle et par réservation", async () => {
        const b = await obtenir();
        const t = unTrajet(await b.personne());
        await b.trajets.creer(t);
        const passager = await b.personne();
        const r = uneReservation(t, passager, { statut: "terminee" });
        await b.reservations.reserver(r, t.places, T0);
        const note = (o: Partial<NoteCovoit> = {}): NoteCovoit => ({
          id: randomUUID(),
          reservationId: r.id,
          noteId: t.conducteurId,
          roleNote: "conducteur",
          auteurId: passager,
          valeur: 5,
          commentaire: "Très bien",
          creeA: T0,
          ...o,
        });
        const crees = await Promise.all(Array.from({ length: 4 }, () => b.notes.ajouter(note())));
        expect(crees.filter(Boolean)).toHaveLength(1);
        const retour = note({
          noteId: passager,
          roleNote: "passager",
          auteurId: t.conducteurId,
          commentaire: null,
          valeur: 4,
        });
        expect(await b.notes.ajouter(retour)).toBe(true);
        expect(await b.notes.deLaReservation(r.id)).toHaveLength(2);
        const duConducteur = await b.notes.deLaPersonne(t.conducteurId, "conducteur");
        expect(duConducteur).toHaveLength(1);
        expect(duConducteur[0]).toMatchObject({ valeur: 5, commentaire: "Très bien" });
        expect(await b.notes.deLaPersonne(passager, "passager")).toEqual([retour]);
      });
    });

    describe("TrajetsReguliersPassagers", () => {
      it("un trajet du matin par voyageur, remplacé à chaque enregistrement", async () => {
        const b = await obtenir();
        const v = await b.personne();
        expect(await b.reguliers.trouver(v)).toBeNull();
        const un = {
          voyageurId: v,
          ville: "Douala",
          departPoint: "Bonamoussadi",
          arriveePoint: "Akwa",
          departA: "07:15",
          actif: true,
          modifieA: T0,
        };
        await b.reguliers.enregistrer(un);
        expect(await b.reguliers.trouver(v)).toEqual(un);
        const deux = { ...un, departA: "07:45", actif: false, modifieA: minutes(9) };
        await b.reguliers.enregistrer(deux);
        expect(await b.reguliers.trouver(v)).toEqual(deux);
      });
    });
  });
}
