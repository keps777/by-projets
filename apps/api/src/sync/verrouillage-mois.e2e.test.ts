import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cloture } from "../comptable/modele";
import { Clotures } from "../comptable/ports";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  creerAppSyncTest,
  type AppSyncTest,
} from "./testing/app-sync-test";
import { AppareilTest, installerAppareil, type EvenementBrut } from "./testing/outils";

/**
 * Un appareil resté hors ligne envoie, après la clôture d'octobre, des gestes datés d'octobre :
 * ils sont journalisés (jamais perdus) et le patron est alerté.
 */

let t: AppSyncTest;
let a: AppareilTest;
let numero = 0;

beforeEach(async () => {
  t = await creerAppSyncTest();
  a = await installerAppareil(t, "terrain-1");
  numero = 0;
});
afterEach(() => t.fermer());

const fermer = (compagnieId: string, mois: string) =>
  t.app.get(Clotures).verrouiller({ compagnieId, mois } as unknown as Cloture);

async function envoyer(evenements: EvenementBrut[]) {
  const lot = await a.lot(evenements, { envoyeA: t.horloge.maintenant().getTime() });
  const rep = await t
    .http()
    .post("/sync/evenements")
    .set("Authorization", `Bearer ${a.jeton}`)
    .send(lot);
  expect(rep.status, JSON.stringify(rep.body)).toBe(200);
  return rep.body as { resultats: { statut: string }[] };
}

const alertesMoisClos = () => t.alertes.lignes.filter((l) => l.type === "evenement_mois_clos");
const octobre = new Date("2026-10-20T08:00:00.000Z");

describe("synchronisation et mois clôturés", () => {
  it("une vente datée d'un mois clôturé est acceptée, journalisée, et signalée par une alerte", async () => {
    await fermer(COMPAGNIE, "2026-10");
    const vente = a.vente({ at: octobre, numeroPlage: ++numero });

    const rep = await envoyer([vente]);
    expect(rep.resultats[0]!.statut).toBe("accepte");
    expect(t.journal.lignes.some((l) => l.evenement.id === vente.id)).toBe(true);
    // Le billet existe aussi (A6) : une vente déjà faite n'est pas perdue, elle garde la date de l'appareil.
    expect([...t.billets.lignes.values()].map((b) => b.evenementId)).toEqual([vente.id]);

    expect(alertesMoisClos()).toHaveLength(1);
    expect(alertesMoisClos()[0]).toMatchObject({
      gravite: "alerte",
      appareilId: a.id,
      evenementId: vente.id,
      compagnieId: COMPAGNIE,
      details: { type: "billet.vendu", mois: "2026-10" },
    });
  });

  it("un geste de caisse daté d'un mois clôturé est signalé aussi", async () => {
    await fermer(COMPAGNIE, "2026-10");
    const evt = a.autre("caisse.ouverte", octobre);
    await envoyer([evt]);
    expect(alertesMoisClos().map((l) => l.evenementId)).toEqual([evt.id]);
  });

  it("mois ouvert : aucune alerte", async () => {
    await fermer(COMPAGNIE, "2026-09");
    await envoyer([a.vente({ at: octobre, numeroPlage: ++numero })]);
    expect(alertesMoisClos()).toHaveLength(0);
  });

  it("la clôture d'une autre agence ne déclenche rien", async () => {
    await fermer(AUTRE_COMPAGNIE, "2026-10");
    await envoyer([a.vente({ at: octobre, numeroPlage: ++numero })]);
    expect(alertesMoisClos()).toHaveLength(0);
  });

  it("un événement qui ne touche pas à l'argent (équipe) n'alerte pas, même daté d'un mois clos", async () => {
    await fermer(COMPAGNIE, "2026-10");
    await envoyer([a.autre("equipe.pin_renouvele", octobre, {}, { type: "personne", id: "p-1" })]);
    expect(alertesMoisClos()).toHaveLength(0);
  });

  it("rejouer le lot après coup ne double pas l'alerte", async () => {
    await fermer(COMPAGNIE, "2026-10");
    const vente = a.vente({ at: octobre, numeroPlage: ++numero });
    await envoyer([vente]);
    const rejeu = await envoyer([vente]);
    expect(rejeu.resultats[0]!.statut).toBe("deja_recu");
    expect(alertesMoisClos()).toHaveLength(1);
  });
});
