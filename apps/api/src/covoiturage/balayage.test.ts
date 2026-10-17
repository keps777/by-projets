import { describe, expect, it } from "vitest";
import { MINUTE, monterCovoiturage } from "./testing/montage";

const DEPART = 24 * 60 + 30;

describe("balayage", () => {
  it("rattrape tout ce qui dépend du temps, dans l'ordre, et rend un bilan", async () => {
    const m = monterCovoiturage();
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication({ places: 3, regulier: true }));
    const payeur = m.voyageur("Alice Mballa");
    const abandon = m.voyageur("Bertrand Nji");
    const commande = await m.services.reservations.reserver(payeur, t.id, 1);
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    await m.services.reservations.reserver(abandon, t.id, 1);
    await m.services.demandes.creer(m.voyageur("Chantal Eto"), {
      depart: "Douala",
      arrivee: "Kribi",
      jour: "2027-01-05",
      places: 1,
    });

    m.avancer(20 * MINUTE);
    expect(await m.services.balayage.balayer()).toMatchObject({
      reservationsExpirees: 1,
      argentLibere: 0,
    });

    m.allerA(DEPART + 150 + 121);
    const bilan = await m.services.balayage.balayer();
    expect(bilan).toEqual({
      reservationsExpirees: 0,
      argentLibere: 1,
      versementsRepris: 0,
      trajetsTermines: 1,
      trajetsRenouveles: 1,
      demandesExpirees: 1,
    });
    expect(m.ports.passerelle.envois).toHaveLength(1);

    // un second passage ne refait rien
    expect(await m.services.balayage.balayer()).toEqual({
      reservationsExpirees: 0,
      argentLibere: 0,
      versementsRepris: 0,
      trajetsTermines: 0,
      trajetsRenouveles: 0,
      demandesExpirees: 0,
    });
  });

  it("deux balayages en même temps ne se chevauchent pas", async () => {
    const m = monterCovoiturage();
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const commande = await m.services.reservations.reserver(p, t.id, 1);
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    m.allerA(DEPART + 150 + 121);
    const bilans = await Promise.all([
      m.services.balayage.balayer(),
      m.services.balayage.balayer(),
    ]);
    expect(bilans.reduce((s, b) => s + b.argentLibere, 0)).toBe(1);
    expect(m.ports.passerelle.envois).toHaveLength(1);
  });
});
