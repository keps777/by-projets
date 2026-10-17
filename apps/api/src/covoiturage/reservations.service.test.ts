import { beforeEach, describe, expect, it } from "vitest";
import { MINUTE, dans, monterCovoiturage, type MontageCovoiturage } from "./testing/montage";

/** Départ de `publication()` : demain 08:30 ; Douala → Kribi dure 150 min dans le référentiel. */
const DEPART = 24 * 60 + 30;
const ARRIVEE = DEPART + 150;

describe("réserver", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  async function trajet(places = 2) {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication({ places }));
    return { c, t };
  }

  it("rend une commande à payer : le prix des places, 250 F de frais par place, 15 minutes de retenue", async () => {
    const { t } = await trajet();
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 2);
    expect(commande).toMatchObject({
      type: "covoiturage",
      statut: "en_attente_paiement",
      total: 8500,
      billetIds: [],
      lignes: [
        { code: "places", montant: 8000 },
        { code: "frais_voyageur", montant: 500 },
      ],
    });
    expect(commande.libelle).toBe("Covoiturage Samuel · Douala → Kribi · 08:30");
    expect(Date.parse(commande.expireA) - m.horloge.maintenant().getTime()).toBe(15 * MINUTE);
  });

  it("rejouer la même demande rend la même commande, sans prendre de places en plus", async () => {
    const { t } = await trajet();
    const p = m.voyageur("Alice Mballa");
    const a = await m.services.reservations.reserver(p, t.id, 1);
    const b = await m.services.reservations.reserver(p, t.id, 1);
    expect(b.id).toBe(a.id);
    expect(await m.ports.reservations.placesPrises(t.id, m.horloge.maintenant())).toBe(1);
  });

  it("changer le nombre de places remplace la commande en attente", async () => {
    const { t } = await trajet();
    const p = m.voyageur("Alice Mballa");
    const a = await m.services.reservations.reserver(p, t.id, 1);
    const b = await m.services.reservations.reserver(p, t.id, 2);
    expect(b.id).not.toBe(a.id);
    expect((await m.ports.reservations.trouver(a.id))?.statut).toBe("annulee");
    expect(await m.ports.reservations.placesPrises(t.id, m.horloge.maintenant())).toBe(2);
  });

  it("refuse plus de places que le trajet n'en offre, et son propre trajet", async () => {
    const { c, t } = await trajet();
    const p = m.voyageur("Alice Mballa");
    await expect(m.services.reservations.reserver(p, t.id, 3)).rejects.toMatchObject({
      status: 422,
      code: "PLACES_INVALIDES",
    });
    await expect(m.services.reservations.reserver(c, t.id, 1)).rejects.toMatchObject({
      status: 409,
      code: "TRAJET_PROPRE",
    });
    await expect(m.services.reservations.reserver(p, "inconnu", 1)).rejects.toMatchObject({
      status: 404,
      code: "OFFRE_INCONNUE",
    });
  });

  it("un trajet plein refuse, et les places retenues reviennent après 15 minutes sans paiement", async () => {
    const { t } = await trajet(2);
    const a = m.voyageur("Alice Mballa");
    const b = m.voyageur("Bertrand Nji");
    await m.services.reservations.reserver(a, t.id, 2);
    await expect(m.services.reservations.reserver(b, t.id, 1)).rejects.toMatchObject({
      status: 409,
      code: "PLUS_ASSEZ_DE_PLACES",
      response: { details: { placesLibres: 0 } },
    });
    m.avancer(16 * MINUTE);
    await expect(m.services.reservations.reserver(b, t.id, 1)).resolves.toMatchObject({
      statut: "en_attente_paiement",
    });
  });

  it("le dernier siège n'est vendu qu'une fois, même demandé en même temps", async () => {
    const { t } = await trajet(1);
    const passagers = ["A", "B", "C", "D", "E"].map((n) => m.voyageur(`Passager ${n}`));
    const issues = await Promise.allSettled(
      passagers.map((p) => m.services.reservations.reserver(p, t.id, 1)),
    );
    expect(issues.filter((i) => i.status === "fulfilled")).toHaveLength(1);
    expect(issues.filter((i) => i.status === "rejected")).toHaveLength(4);
    expect(await m.ports.reservations.placesPrises(t.id, m.horloge.maintenant())).toBe(1);
  });

  it("déjà réservé et payé : on ne réserve pas deux fois le même trajet", async () => {
    const { t } = await trajet();
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 1);
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    await expect(m.services.reservations.reserver(p, t.id, 1)).rejects.toMatchObject({
      status: 409,
      code: "DEJA_RESERVE",
    });
  });

  it("les réservations ferment 30 minutes avant le départ", async () => {
    const { t } = await trajet();
    const p = m.voyageur("Alice Mballa");
    m.allerA(DEPART - 31);
    await expect(m.services.reservations.reserver(p, t.id, 1)).resolves.toBeDefined();
    const q = m.voyageur("Bertrand Nji");
    m.allerA(DEPART - 29);
    await expect(m.services.reservations.reserver(q, t.id, 1)).rejects.toMatchObject({
      code: "RESERVATION_FERMEE",
    });
  });

  it("un conducteur dont le dossier n'est plus valable n'est plus réservable", async () => {
    const { c, t } = await trajet();
    const p = m.voyageur("Alice Mballa");
    // la pièce d'identité est de nouveau déposée : le dossier repasse « en vérification »
    await m.services.verification.deposerPiece(c.id, "identite", {
      fichierId: "nouveau",
      numero: "5555",
    });
    await expect(m.services.reservations.reserver(p, t.id, 1)).rejects.toMatchObject({
      status: 409,
      code: "TRAJET_INDISPONIBLE",
    });
  });
});

describe("paiement reçu", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  async function reserve(places = 2, trajetPlaces = 2) {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication({ places: trajetPlaces }));
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, places);
    return { c, t, p, commande };
  }

  it("la réservation passe « payée », le conducteur est prévenu une seule fois, l'argent n'est pas versé", async () => {
    const { c, commande } = await reserve();
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo"); // rejeu du webhook
    const r = await m.ports.reservations.trouver(commande.id);
    expect(r).toMatchObject({ statut: "payee", moyenPaiement: "mtn_momo" });
    expect(m.ports.notifieur.pour(c.id).filter((x) => x.includes("a réservé"))).toEqual([
      "AfriMove covoiturage : Alice M. a réservé 2 place(s) pour Douala - Kribi, mer. 06/01 à 08:30.",
    ]);
    expect(m.ports.passerelle.envois).toHaveLength(0);
  });

  it("une réservation annulée ne peut pas être payée : COMMANDE_ANNULEE", async () => {
    const { p, commande } = await reserve();
    await m.services.reservations.annulerReservation(p, commande.id);
    await expect(
      m.services.reservations.confirmerPaiement(commande.id, "mtn_momo"),
    ).rejects.toMatchObject({ status: 409, code: "COMMANDE_ANNULEE" });
    await expect(
      m.services.reservations.confirmerPaiement("inconnue", "mtn_momo"),
    ).rejects.toMatchObject({ code: "COMMANDE_ANNULEE" });
  });

  it("le conducteur annule avant le paiement : COMMANDE_ANNULEE", async () => {
    const { c, t, commande } = await reserve();
    await m.services.reservations.annulerTrajet(c, t.id);
    await expect(
      m.services.reservations.confirmerPaiement(commande.id, "mtn_momo"),
    ).rejects.toMatchObject({ code: "COMMANDE_ANNULEE" });
  });

  it("places reprises pendant le paiement : SIEGES_PERDUS (les paiements rembourseront en entier)", async () => {
    const { t, commande } = await reserve(2, 2);
    m.avancer(16 * MINUTE); // la retenue de la première réservation est écoulée
    const autre = m.voyageur("Bertrand Nji");
    await m.services.reservations.reserver(autre, t.id, 2);
    await expect(
      m.services.reservations.confirmerPaiement(commande.id, "mtn_momo"),
    ).rejects.toMatchObject({ status: 409, code: "SIEGES_PERDUS" });
    expect((await m.ports.reservations.trouver(commande.id))?.statut).not.toBe("payee");
  });

  it("paiement arrivé après le départ : SIEGES_PERDUS", async () => {
    const { commande } = await reserve();
    m.allerA(DEPART + 1);
    await expect(
      m.services.reservations.confirmerPaiement(commande.id, "mtn_momo"),
    ).rejects.toMatchObject({ code: "SIEGES_PERDUS" });
  });

  it("une retenue écoulée mais des places encore libres : le paiement est accepté", async () => {
    const { commande } = await reserve();
    m.avancer(20 * MINUTE);
    await m.services.reservations.confirmerPaiement(commande.id, "orange_money");
    expect((await m.ports.reservations.trouver(commande.id))?.statut).toBe("payee");
  });
});

describe("l'argent n'est libéré qu'à l'arrivée", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage({ env: { COVOITURAGE_VERSEMENT_ESSAIS_MAX: "3" } });
  });

  async function payee() {
    const c = await m.conducteur("Samuel Ekambi", "+237677001111");
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 2);
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    return { c, t, p, id: commande.id };
  }

  it("rien ne part à la réservation, au paiement, ni au balayage avant l'heure", async () => {
    const { id } = await payee();
    m.allerA(ARRIVEE + 119); // 2 h moins une minute après l'arrivée prévue
    await m.services.balayage.balayer();
    expect(m.ports.passerelle.envois).toHaveLength(0);
    expect((await m.ports.reservations.trouver(id))?.statut).toBe("payee");
    expect(await m.ports.versements.deLaReservation(id)).toBeNull();
  });

  it("le passager ne peut pas confirmer son arrivée avant le départ", async () => {
    const { p, id } = await payee();
    m.allerA(DEPART - 5);
    await expect(m.services.reservations.confirmerArrivee(p, id)).rejects.toMatchObject({
      status: 409,
      code: "TRAJET_PAS_COMMENCE",
    });
    expect(m.ports.passerelle.envois).toHaveLength(0);
  });

  it("à la confirmation du passager : le prix des places part vers le conducteur, sans les frais", async () => {
    const { c, p, id } = await payee();
    m.allerA(ARRIVEE);
    const vue = await m.services.reservations.confirmerArrivee(p, id);
    expect(vue.statut).toBe("terminee");
    expect(m.ports.passerelle.envois).toEqual([
      { cle: `covoiturage:${id}`, montant: 8000, telephone: "+237677001111", reservationId: id },
    ]);
    expect(await m.ports.versements.deLaReservation(id)).toMatchObject({
      statut: "fait",
      montant: 8000,
      motif: "confirmation_passager",
    });
    expect(m.ports.notifieur.pour(c.id).at(-1)).toContain("8 000");
  });

  it("confirmer deux fois, ou en même temps, ne paie qu'une fois", async () => {
    const { p, id } = await payee();
    m.allerA(ARRIVEE);
    await Promise.all([
      m.services.reservations.confirmerArrivee(p, id),
      m.services.reservations.confirmerArrivee(p, id),
      m.services.reservations.confirmerArrivee(p, id),
    ]);
    await m.services.reservations.confirmerArrivee(p, id);
    await m.services.balayage.balayer();
    expect(m.ports.passerelle.envois).toHaveLength(1);
  });

  it("sans confirmation, l'argent part 2 h après l'arrivée prévue, par le balayage", async () => {
    const { id } = await payee();
    m.allerA(ARRIVEE + 121);
    const bilan = await m.services.balayage.balayer();
    expect(bilan.argentLibere).toBe(1);
    expect(m.ports.passerelle.envois).toHaveLength(1);
    expect(await m.ports.versements.deLaReservation(id)).toMatchObject({
      motif: "delai_depasse",
      statut: "fait",
    });
    // la réservation est terminée et le trajet fermé
    expect(bilan.trajetsTermines).toBe(1);
  });

  it("le passager confirme ensuite : rien de plus n'est versé", async () => {
    const { p, id } = await payee();
    m.allerA(ARRIVEE + 121);
    await m.services.balayage.balayer();
    await m.services.reservations.confirmerArrivee(p, id);
    expect(m.ports.passerelle.envois).toHaveLength(1);
  });

  it("une réservation non payée ou annulée ne libère rien", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 1);
    m.allerA(DEPART + 10);
    await expect(m.services.reservations.confirmerArrivee(p, commande.id)).rejects.toMatchObject({
      code: "RESERVATION_NON_PAYEE",
    });
    await m.services.balayage.balayer();
    expect(m.ports.passerelle.envois).toHaveLength(0);
  });

  it("les autres voyageurs ne voient ni ne confirment la réservation", async () => {
    const { id } = await payee();
    const intrus = m.voyageur("Intrus");
    m.allerA(ARRIVEE);
    await expect(m.services.reservations.confirmerArrivee(intrus, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(m.services.reservations.reservation(intrus, id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("opérateur en panne : le versement reste à faire, repris avec la même clé, sans doublon", async () => {
    const { p, id } = await payee();
    m.ports.passerelle.echecsRestants = 2;
    m.allerA(ARRIVEE);
    await m.services.reservations.confirmerArrivee(p, id);
    expect(await m.ports.versements.deLaReservation(id)).toMatchObject({
      statut: "a_faire",
      tentatives: 1,
      derniereErreur: "ERREUR_VERSEMENT",
    });
    m.avancer(2 * MINUTE);
    await m.services.balayage.balayer(); // 2e essai : encore en panne
    expect(await m.ports.versements.deLaReservation(id)).toMatchObject({ statut: "a_faire" });
    m.avancer(10 * MINUTE);
    const bilan = await m.services.balayage.balayer();
    expect(bilan.versementsRepris).toBe(1);
    expect(m.ports.passerelle.envois).toHaveLength(1);
    expect(await m.ports.versements.deLaReservation(id)).toMatchObject({
      statut: "fait",
      tentatives: 3,
    });
  });

  it("après trop d'essais le versement est « échoué », visible d'AfriMove, et n'est plus repris", async () => {
    const { p, id } = await payee();
    m.ports.passerelle.echecsRestants = 99;
    m.allerA(ARRIVEE);
    await m.services.reservations.confirmerArrivee(p, id);
    for (let i = 0; i < 5; i += 1) {
      m.avancer(7 * 60 * MINUTE);
      await m.services.balayage.balayer();
    }
    const v = await m.ports.versements.deLaReservation(id);
    expect(v).toMatchObject({ statut: "echoue", tentatives: 3 });
    expect(m.ports.passerelle.envois).toHaveLength(0);
  });

  it("un conducteur sans numéro de versement : le versement attend, puis part dès qu'il en a un", async () => {
    const c = await m.conducteur("Samuel Ekambi");
    await m.ports.annuaire.identite(c.id);
    m.ports.annuaire.ajouter(c.id, "Samuel Ekambi", null); // plus de téléphone sur le compte
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 1);
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    m.allerA(ARRIVEE);
    await m.services.reservations.confirmerArrivee(p, commande.id);
    expect(await m.ports.versements.deLaReservation(commande.id)).toMatchObject({
      statut: "a_faire",
      derniereErreur: "NUMERO_VERSEMENT_ABSENT",
    });
    await m.services.verification.definirNumeroVersement(c.id, "+237677002222");
    m.avancer(10 * MINUTE);
    await m.services.balayage.balayer();
    expect(m.ports.passerelle.envois).toMatchObject([
      { telephone: "+237677002222", montant: 4000 },
    ]);
  });
});

describe("annulation par le passager", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  async function payee() {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 2);
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    return { c, t, p, id: commande.id };
  }

  it("avant le paiement : rien n'est dû, la place est rendue", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 2);
    const res = await m.services.reservations.annulerReservation(p, commande.id);
    expect(res).toMatchObject({ statut: "annulee", rembourse: 0, retenue: 0, gratuite: true });
    expect(m.ports.remboursements.demandes).toHaveLength(0);
    expect(await m.ports.reservations.placesPrises(t.id, m.horloge.maintenant())).toBe(0);
  });

  it("2 h ou plus avant le départ : le prix est rendu en entier, les frais d'AfriMove non", async () => {
    const { id, p } = await payee();
    m.allerA(DEPART - 120);
    const res = await m.services.reservations.annulerReservation(p, id);
    expect(res).toEqual({
      reservationId: id,
      statut: "annulee",
      rembourse: 8000,
      retenue: 0,
      gratuite: true,
    });
    expect(m.ports.remboursements.demandes).toEqual([
      {
        reservationId: id,
        prix: 8000,
        frais: 0,
        cause: "annulation_passager",
        cle: `covoiturage:${id}:annulation_passager`,
      },
    ]);
    expect(m.ports.passerelle.envois).toHaveLength(0);
  });

  it("moins de 2 h avant le départ : la moitié du prix part vers le conducteur, l'autre moitié est rendue", async () => {
    const { id, p } = await payee();
    m.allerA(DEPART - 119);
    const res = await m.services.reservations.annulerReservation(p, id);
    expect(res).toMatchObject({ rembourse: 4000, retenue: 4000, gratuite: false });
    expect(m.ports.remboursements.demandes[0]).toMatchObject({ prix: 4000, frais: 0 });
    expect(m.ports.passerelle.envois).toMatchObject([{ montant: 4000 }]);
    expect(await m.ports.versements.deLaReservation(id)).toMatchObject({
      motif: "annulation_tardive",
    });
  });

  it("annuler deux fois ne rembourse ni ne verse deux fois", async () => {
    const { id, p } = await payee();
    m.allerA(DEPART - 60);
    const a = await m.services.reservations.annulerReservation(p, id);
    const b = await m.services.reservations.annulerReservation(p, id);
    expect(b).toEqual(a);
    expect(m.ports.remboursements.demandes).toHaveLength(1);
    expect(m.ports.passerelle.envois).toHaveLength(1);
  });

  it("une réservation annulée ne libère jamais le reste de l'argent", async () => {
    const { id, p } = await payee();
    m.allerA(DEPART - 60);
    await m.services.reservations.annulerReservation(p, id);
    m.allerA(ARRIVEE + 200);
    await m.services.balayage.balayer();
    expect(m.ports.passerelle.envois).toHaveLength(1); // la seule retenue
    await expect(m.services.reservations.confirmerArrivee(p, id)).rejects.toMatchObject({
      code: "RESERVATION_NON_PAYEE",
    });
  });

  it("le trajet a commencé : on confirme l'arrivée au lieu d'annuler", async () => {
    const { id, p } = await payee();
    m.allerA(DEPART + 1);
    await expect(m.services.reservations.annulerReservation(p, id)).rejects.toMatchObject({
      status: 409,
      code: "TRAJET_COMMENCE",
    });
    expect(m.ports.remboursements.demandes).toHaveLength(0);
  });

  it("une fois le trajet terminé, plus d'annulation", async () => {
    const { id, p } = await payee();
    m.allerA(ARRIVEE);
    await m.services.reservations.confirmerArrivee(p, id);
    await expect(m.services.reservations.annulerReservation(p, id)).rejects.toMatchObject({
      code: "RESERVATION_TERMINEE",
    });
  });

  it("la vue de la réservation annonce à l'avance ce que coûterait l'annulation", async () => {
    const { id, p } = await payee();
    expect((await m.services.reservations.reservation(p, id)).annulation).toEqual({
      gratuite: true,
      retenue: 0,
      remboursement: 8000,
    });
    m.allerA(DEPART - 30);
    expect((await m.services.reservations.reservation(p, id)).annulation).toEqual({
      gratuite: false,
      retenue: 4000,
      remboursement: 4000,
    });
    m.allerA(DEPART + 1);
    const vue = await m.services.reservations.reservation(p, id);
    expect(vue.annulation).toBeNull();
    expect(vue.peutConfirmerArrivee).toBe(true);
  });
});

describe("annulation par le conducteur", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  it("les passagers payés sont remboursés en entier (prix et frais) et prévenus ; les réservations en attente sont closes", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication({ places: 3 }));
    const payeur = m.voyageur("Alice Mballa");
    const attente = m.voyageur("Bertrand Nji");
    const a = await m.services.reservations.reserver(payeur, t.id, 2);
    await m.services.reservations.confirmerPaiement(a.id, "mtn_momo");
    const b = await m.services.reservations.reserver(attente, t.id, 1);

    const res = await m.services.reservations.annulerTrajet(c, t.id);
    expect(res).toEqual({ trajetId: t.id, statut: "annule", passagersRembourses: 1 });
    expect(m.ports.remboursements.demandes).toEqual([
      {
        reservationId: a.id,
        prix: 8000,
        frais: 500,
        cause: "trajet_annule",
        cle: `covoiturage:${a.id}:trajet_annule`,
      },
    ]);
    expect(m.ports.notifieur.pour(payeur.id)).toEqual([
      "AfriMove covoiturage : Samuel a annulé le trajet Douala - Kribi, mer. 06/01 à 08:30. Tu es remboursé.",
    ]);
    expect((await m.ports.reservations.trouver(b.id))?.statut).toBe("annulee");
    expect(m.ports.passerelle.envois).toHaveLength(0);
    // le trajet n'est plus réservable
    await expect(
      m.services.reservations.reserver(m.voyageur("Chantal"), t.id, 1),
    ).rejects.toMatchObject({ code: "OFFRE_INCONNUE" });
  });

  it("rejouer l'annulation ne rembourse pas deux fois", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const a = await m.services.reservations.reserver(p, t.id, 1);
    await m.services.reservations.confirmerPaiement(a.id, "mtn_momo");
    await m.services.reservations.annulerTrajet(c, t.id);
    const encore = await m.services.reservations.annulerTrajet(c, t.id);
    expect(encore.passagersRembourses).toBe(0);
    expect(m.ports.remboursements.demandes).toHaveLength(1);
  });

  it("un échec de remboursement n'empêche pas l'annulation : il est journalisé pour AfriMove", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const a = await m.services.reservations.reserver(p, t.id, 1);
    await m.services.reservations.confirmerPaiement(a.id, "mtn_momo");
    m.ports.remboursements.rembourser = async () => {
      throw new Error("agrégateur indisponible");
    };
    await expect(m.services.reservations.annulerTrajet(c, t.id)).resolves.toMatchObject({
      passagersRembourses: 1,
    });
    const lignes = await m.audit.lister({ limite: 200 });
    expect(lignes.some((l) => l.action === "covoiturage.remboursement_echec")).toBe(true);
  });

  it("seul le conducteur annule son trajet, et pas après le départ", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    await expect(
      m.services.reservations.annulerTrajet(m.voyageur("Intrus"), t.id),
    ).rejects.toMatchObject({
      status: 404,
    });
    m.allerA(DEPART + 1);
    await expect(m.services.reservations.annulerTrajet(c, t.id)).rejects.toMatchObject({
      code: "TRAJET_COMMENCE",
    });
  });
});

describe("notes", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  it("on note une fois le trajet terminé, une fois chacun, et la réputation du conducteur suit", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication({ places: 3 }));
    const p1 = m.voyageur("Alice Mballa");
    const p2 = m.voyageur("Bertrand Nji");
    const r1 = await m.services.reservations.reserver(p1, t.id, 1);
    const r2 = await m.services.reservations.reserver(p2, t.id, 1);
    await m.services.reservations.confirmerPaiement(r1.id, "mtn_momo");
    await m.services.reservations.confirmerPaiement(r2.id, "mtn_momo");

    await expect(m.services.reputation.noter(p1, r1.id, 5, undefined)).rejects.toMatchObject({
      code: "PAS_ENCORE_TERMINEE",
    });
    m.allerA(ARRIVEE);
    await m.services.reservations.confirmerArrivee(p1, r1.id);
    await m.services.reservations.confirmerArrivee(p2, r2.id);

    await m.services.reputation.noter(p1, r1.id, 5, "Très ponctuel");
    await m.services.reputation.noter(p2, r2.id, 4, undefined);
    await expect(m.services.reputation.noter(p1, r1.id, 1, undefined)).rejects.toMatchObject({
      code: "DEJA_NOTE",
    });
    await m.services.reputation.noter(c, r1.id, 3, undefined); // le conducteur note le passager

    expect(await m.services.reputation.conducteur(c.id)).toEqual({ note: 4.5, trajets: 1 });
    expect(await m.services.reputation.notePassager(p1.id)).toBe(3);
    expect((await m.services.reservations.reservation(p1, r1.id)).note).toBe(true);
    await expect(
      m.services.reputation.noter(m.voyageur("Intrus"), r1.id, 5, undefined),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("mes réservations", () => {
  it("les plus utiles : payées et terminées ; pas celles qui n'ont jamais abouti", async () => {
    const m = monterCovoiturage();
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication({ places: 3 }));
    const p = m.voyageur("Alice Mballa");
    const r = await m.services.reservations.reserver(p, t.id, 1);
    expect(await m.services.reservations.mesReservations(p)).toHaveLength(1);
    await m.services.reservations.annulerReservation(p, r.id);
    expect(await m.services.reservations.mesReservations(p)).toHaveLength(0);
    const r2 = await m.services.reservations.reserver(p, t.id, 1);
    await m.services.reservations.confirmerPaiement(r2.id, "mtn_momo");
    const vues = await m.services.reservations.mesReservations(p);
    expect(vues).toHaveLength(1);
    expect(vues[0]).toMatchObject({
      id: r2.id,
      statut: "payee",
      total: 4250,
      peutConfirmerArrivee: false,
    });
    expect(vues[0]?.liberationAutomatiqueA).toBe(dans(ARRIVEE + 120));
  });
});
