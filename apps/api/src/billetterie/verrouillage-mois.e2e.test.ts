import { agence } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cloture } from "../comptable/modele";
import { Clotures } from "../comptable/ports";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART,
  avec,
  creerAppBilletterieTest,
  especes,
  evenement,
  heure,
  type AppBilletterieTest,
} from "./testing/app-billetterie-test";

/**
 * Une vente faite hors ligne, synchronisée après la clôture de son mois : elle n'est jamais refusée
 * (le billet est imprimé, l'argent encaissé) mais ne s'écrit pas dans le mois figé.
 */

let t: AppBilletterieTest;
let jeton: string;
let agentId: string;
let plage = 0;

beforeEach(async () => {
  t = await creerAppBilletterieTest();
  const g = await t.guichetier();
  jeton = g.jeton;
  agentId = g.id;
  plage = 0;
});
afterEach(() => t.fermer());

const fermer = (compagnieId: string, mois: string) =>
  t.app.get(Clotures).verrouiller({ compagnieId, mois } as unknown as Cloture);

/** Une vente au guichet datée de `at` (l'heure de l'appareil, pas celle du serveur). */
async function vendreLe(at: string, siege: number) {
  const evt = evenement(
    agence.EVENEMENT_BILLET_VENDU,
    agentId,
    at,
    {
      billetId: crypto.randomUUID(),
      departId: DEPART,
      siege,
      classe: "classique",
      prix: 4000,
      bagage: 0,
      passager: { nom: "Aminatou Fotso", telephone: "+237691221008", pieceQuatreDerniers: "4821" },
      paiement: especes(4000),
      codeBillet: String(2000 + siege),
      sms: false,
    },
    { numeroPlage: ++plage },
  );
  const r = await t.http().post("/agence/billets").set(avec(jeton)).send(evt);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return agence.SchemaResultatVente.parse(r.body).billet.billetId;
}

describe("vente hors ligne et mois clôturé", () => {
  it("mois ouvert : la date de l'appareil est conservée", async () => {
    const at = heure("10:00", "2026-10-20");
    const id = await vendreLe(at, 1);
    expect(t.billets.lignes.get(id)!.creeA).toBe(at);
  });

  it("mois clôturé : le billet est accepté mais daté du début du premier mois ouvert", async () => {
    await fermer(COMPAGNIE, "2026-10");
    const at = heure("10:00", "2026-10-20");
    const id = await vendreLe(at, 2);

    const billet = t.billets.lignes.get(id)!;
    // 1er novembre 00:00 à Douala = 31 octobre 23:00 UTC.
    expect(billet.creeA).toBe("2026-10-31T23:00:00.000Z");
    // Le numéro imprimé ne change pas, et l'historique garde la vraie heure du geste.
    expect(billet.numero).toMatch(/^ALP-DLA-261020-\d{4}$/);
    expect(billet.historique[0]!.at).toBe(at);
    expect(billet.etat).toBe("paye");
  });

  it("plusieurs mois clôturés de suite : le billet va au premier mois ouvert", async () => {
    await fermer(COMPAGNIE, "2026-09");
    await fermer(COMPAGNIE, "2026-10");
    const id = await vendreLe(heure("10:00", "2026-09-28"), 3);
    expect(t.billets.lignes.get(id)!.creeA).toBe("2026-10-31T23:00:00.000Z");
  });

  it("la clôture d'une autre agence ne change rien", async () => {
    await fermer(AUTRE_COMPAGNIE, "2026-10");
    const at = heure("10:00", "2026-10-20");
    const id = await vendreLe(at, 4);
    expect(t.billets.lignes.get(id)!.creeA).toBe(at);
  });

  it("rejouer la vente après la clôture rend le même billet sans rien réécrire", async () => {
    const at = heure("10:00", "2026-10-20");
    const evt = evenement(
      agence.EVENEMENT_BILLET_VENDU,
      agentId,
      at,
      {
        billetId: crypto.randomUUID(),
        departId: DEPART,
        siege: 5,
        classe: "classique",
        prix: 4000,
        bagage: 0,
        passager: { nom: "Paul", telephone: null, pieceQuatreDerniers: "1234" },
        paiement: especes(4000),
        codeBillet: "2105",
        sms: false,
      },
      { numeroPlage: 50 },
    );
    const premiere = await t.http().post("/agence/billets").set(avec(jeton)).send(evt);
    expect(premiere.status).toBe(200);
    await fermer(COMPAGNIE, "2026-10");
    const rejeu = await t.http().post("/agence/billets").set(avec(jeton)).send(evt);
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
    expect(t.billets.lignes.size).toBe(1);
    expect([...t.billets.lignes.values()][0]!.creeA).toBe(at);
  });
});
