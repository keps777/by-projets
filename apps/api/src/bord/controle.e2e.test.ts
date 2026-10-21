import { randomUUID } from "node:crypto";
import { agence } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEPART_AUTRE_COMPAGNIE,
  DEPART_AUTRE_EQUIPAGE,
  DEPART_EMBARQUEMENT,
  DEPART_EN_VENTE,
  DEPART_ROUTE,
  avec,
  creerAppBordTest,
  especes,
  evenement,
  type AppBordTest,
} from "./testing/app-bord-test";

/**
 * Le contrôle inopiné à bord de bout en bout : ouverture, constat des sièges, régularisation, signalement du
 * convoyeur, clôture. Chaque réponse est relue avec le schéma de `@afrimove/contrats`.
 */

let t: AppBordTest;
let jeton: string;
let controleurId: string;
let plage = 3100;
let code = 6000;

beforeAll(async () => {
  t = await creerAppBordTest();
  jeton = t.equipage.controleur.jeton;
  controleurId = t.equipage.controleur.id;
  // Trois voyageurs au billet valide, sur les sièges 1 à 3.
  for (const siege of [1, 2, 3]) await t.billetPaye(DEPART_ROUTE, siege, { aBord: true });
});
afterAll(async () => t.fermer());

const poster = (chemin: string, corps: unknown, j = jeton) =>
  t
    .http()
    .post(chemin)
    .set(avec(j))
    .send(corps as object);
const lire = (chemin: string, j = jeton) => t.http().get(chemin).set(avec(j));

const ev = (
  definition: Parameters<typeof evenement>[0],
  donnees: unknown,
  o: { id?: string; plage?: number; auteur?: string } = {},
) =>
  evenement(definition, o.auteur ?? controleurId, t.maintenant(), donnees, {
    appareilId: "appareil-controle-1",
    ...(o.id ? { id: o.id } : {}),
    ...(o.plage !== undefined ? { numeroPlage: o.plage } : {}),
  });

const siegeEvt = (
  controleId: string,
  siege: number,
  constat: "scanne" | "sans_billet" | "libre",
  departId = DEPART_ROUTE,
) => ev(agence.EVENEMENT_CONTROLE_SIEGE_VERIFIE, { controleId, departId, siege, constat });

const regulEvt = (
  controleId: string,
  siege: number,
  o: { prix?: number; billetId?: string; departId?: string; plage?: number; id?: string } = {},
) => {
  const prix = o.prix ?? 1000;
  return ev(
    agence.EVENEMENT_CONTROLE_REGULARISE,
    {
      controleId,
      billetId: o.billetId ?? randomUUID(),
      departId: o.departId ?? DEPART_ROUTE,
      siege,
      prix,
      paiement: especes(prix),
      codeBillet: String(++code),
      passager: { nom: "Njoya Marie", pieceQuatreDerniers: "1234" },
    },
    { plage: o.plage ?? ++plage, ...(o.id ? { id: o.id } : {}) },
  );
};

const signalEvt = (
  controleId: string,
  siege: number,
  o: { convoyeurId?: string; montant?: number; departId?: string } = {},
) =>
  ev(agence.EVENEMENT_CONTROLE_CONVOYEUR_SIGNALE, {
    controleId,
    departId: o.departId ?? DEPART_ROUTE,
    convoyeurId: o.convoyeurId ?? t.equipage.convoyeur.id,
    siege,
    montantDeclare: o.montant ?? 1000,
    note: "Dit avoir payé en montant à Édéa",
  });

const clotureEvt = (controleId: string, comptes = { liste: 0, tetes: 0, ecart: 0 }, id?: string) =>
  ev(
    agence.EVENEMENT_CONTROLE_CLOTURE,
    { controleId, departId: DEPART_ROUTE, ...comptes },
    { ...(id ? { id } : {}) },
  );

let controleId = "";
const evtCloture = () => clotureEvt(controleId, { liste: 5, tetes: 5, ecart: 0 });
let cloture: ReturnType<typeof evtCloture>;

describe("GET /agence/controle/inopine", () => {
  it("ouvre un contrôle sur le bus en route et compte la liste et les têtes", async () => {
    const r = await lire("/agence/controle/inopine");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vue = agence.SchemaControleInopine.parse(r.body);
    controleId = vue.controleId;
    expect(vue.departId).toBe(DEPART_ROUTE);
    expect(vue.controleur).toEqual({ id: controleurId, nom: "Aïcha Nkoulou" });
    expect(vue.bus.immatriculation).toBe("LT 214 AB");
    expect(vue.lieu).toBe("Douala");
    expect(vue.comptes).toEqual({ liste: 3, tetes: 3, ecart: 0 });
    expect(vue.sieges).toHaveLength(40);
    expect(vue.sieges.filter((s) => s.constat === "scanne").map((s) => s.numero)).toEqual([
      1, 2, 3,
    ]);
    expect(vue.sansBillet).toBeNull();
  });

  it("relit le même contrôle tant qu'il est ouvert, quel que soit le bus demandé", async () => {
    const encore = agence.SchemaControleInopine.parse(
      (await lire("/agence/controle/inopine")).body,
    );
    expect(encore.controleId).toBe(controleId);
    const autre = agence.SchemaControleInopine.parse(
      (await lire(`/agence/controle/inopine?departId=${DEPART_EMBARQUEMENT}`)).body,
    );
    expect(autre.controleId).toBe(controleId);
    expect(await t.controles.duDepart(DEPART_ROUTE)).toHaveLength(1);
  });

  it("refuse l'autre compagnie, un bus en vente, un autre rôle et l'absence de jeton", async () => {
    const autre = await t.compte("controleur");
    expect(
      (await lire(`/agence/controle/inopine?departId=${DEPART_AUTRE_COMPAGNIE}`, autre.jeton))
        .status,
    ).toBe(404);
    const enVente = await lire(`/agence/controle/inopine?departId=${DEPART_EN_VENTE}`, autre.jeton);
    expect(enVente.status).toBe(409);
    expect(enVente.body.code).toBe("DEPART_HORS_ROUTE");
    expect((await lire("/agence/controle/inopine", t.equipage.convoyeur.jeton)).status).toBe(403);
    expect((await lire("/agence/controle/inopine", t.equipage.chauffeur.jeton)).status).toBe(403);
    expect((await t.http().get("/agence/controle/inopine")).status).toBe(401);
  });

  it("un autre contrôleur a son propre contrôle ; personne ne lit celui d'un autre", async () => {
    const autre = await t.compte("controleur");
    const vue = agence.SchemaControleInopine.parse(
      (await lire("/agence/controle/inopine", autre.jeton)).body,
    );
    expect(vue.controleId).not.toBe(controleId);
    const volé = await lire(`/agence/controle/inopine?controleId=${controleId}`, autre.jeton);
    expect(volé.status).toBe(404);
    expect(volé.body.code).toBe("CONTROLE_INCONNU");
    expect((await lire(`/agence/controle/inopine?controleId=${vue.controleId}`)).status).toBe(404);
  });
});

describe("controle.siege_verifie : POST /agence/controle/sieges", () => {
  it("pose le constat d'un siège : un occupé sans billet ajoute une tête", async () => {
    const r = await poster("/agence/controle/sieges", siegeEvt(controleId, 10, "sans_billet"));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const res = agence.SchemaResultatControle.parse(r.body);
    expect(res.accuse.statut).toBe("accepte");
    expect(res.controle).toEqual({
      controleId,
      comptes: { liste: 3, tetes: 4, ecart: 1 },
      clos: false,
      envoyeAuPatron: false,
    });
    const vue = agence.SchemaControleInopine.parse((await lire("/agence/controle/inopine")).body);
    expect(vue.sansBillet).toMatchObject({
      siege: 10,
      lieu: "Douala",
      montantDeclare: 4000,
      venteEnRouteTrouvee: false,
    });
  });

  it("remplace le constat d'un siège : un siège déclaré libre retire une tête", async () => {
    const r = await poster("/agence/controle/sieges", siegeEvt(controleId, 3, "libre"));
    expect(agence.SchemaResultatControle.parse(r.body).controle.comptes).toEqual({
      liste: 3,
      tetes: 3,
      ecart: 0,
    });
    const remis = await poster("/agence/controle/sieges", siegeEvt(controleId, 3, "scanne"));
    expect(agence.SchemaResultatControle.parse(remis.body).controle.comptes.tetes).toBe(4);
  });

  it("rejoue le même constat : deja_recu", async () => {
    const evt = siegeEvt(controleId, 11, "libre");
    await poster("/agence/controle/sieges", evt);
    const b = await poster("/agence/controle/sieges", evt);
    expect(b.status).toBe(200);
    expect(b.body.accuse.statut).toBe("deja_recu");
  });

  it("refuse un siège hors du bus, un contrôle inconnu, un autre départ, un autre contrôleur", async () => {
    expect(
      (await poster("/agence/controle/sieges", siegeEvt(controleId, 41, "libre"))).status,
    ).toBe(404);
    const inconnu = await poster("/agence/controle/sieges", siegeEvt(randomUUID(), 5, "libre"));
    expect(inconnu.status).toBe(404);
    expect(inconnu.body.code).toBe("CONTROLE_INCONNU");
    const depart = await poster(
      "/agence/controle/sieges",
      siegeEvt(controleId, 5, "libre", DEPART_AUTRE_EQUIPAGE),
    );
    expect(depart.status).toBe(422);
    expect(depart.body.code).toBe("DEPART_INCOHERENT");
    const autre = await t.compte("controleur");
    expect(
      (await poster("/agence/controle/sieges", siegeEvt(controleId, 5, "libre"), autre.jeton))
        .status,
    ).toBe(403);
    const usurpe = siegeEvt(controleId, 5, "libre");
    expect((await poster("/agence/controle/sieges", usurpe, autre.jeton)).body.code).toBe(
      "AUTEUR_INCOHERENT",
    );
    const mauvais = siegeEvt(controleId, 5, "libre");
    (mauvais.donnees as { constat: string }).constat = "fantome";
    expect((await poster("/agence/controle/sieges", mauvais)).status).toBe(400);
  });
});

describe("controle.convoyeur_signale : POST /agence/controle/signalements", () => {
  it("signale le convoyeur et prévient le patron par SMS", async () => {
    const evt = signalEvt(controleId, 10, { montant: 1000 });
    const r = await poster("/agence/controle/signalements", evt);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(agence.SchemaResultatControle.parse(r.body).controle.clos).toBe(false);
    const stockes = await t.controles.signalements(controleId);
    expect(stockes).toHaveLength(1);
    expect(stockes[0]).toMatchObject({
      convoyeurId: t.equipage.convoyeur.id,
      siege: 10,
      montantDeclare: 1000,
      patronPrevenu: true,
    });
    expect(t.messages.constats.at(-1)?.texte).toContain("Joël Ndzana est signalé");
    expect(t.messages.constats.at(-1)?.texte).toContain("siège 10");
  });

  it("rejoue le même signalement : un seul SMS, une seule ligne", async () => {
    const evt = signalEvt(controleId, 12);
    const avant = t.messages.constats.length;
    await poster("/agence/controle/signalements", evt);
    const b = await poster("/agence/controle/signalements", evt);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(t.messages.constats.length).toBe(avant + 1);
    expect(await t.controles.signalements(controleId)).toHaveLength(2);
  });

  it("accepte l'identifiant provisoire que l'écran envoie, refuse un autre convoyeur", async () => {
    const provisoire = signalEvt(controleId, 13, {
      convoyeurId: `convoyeur-du-depart-${DEPART_ROUTE}`,
    });
    expect((await poster("/agence/controle/signalements", provisoire)).status).toBe(200);
    const autre = await poster(
      "/agence/controle/signalements",
      signalEvt(controleId, 13, { convoyeurId: t.equipage.autreConvoyeur.id }),
    );
    expect(autre.status).toBe(422);
    expect(autre.body.code).toBe("CONVOYEUR_INCOHERENT");
  });

  it("garde le signalement quand le SMS ne part pas", async () => {
    t.messages.echec = true;
    try {
      const evt = signalEvt(controleId, 14);
      expect((await poster("/agence/controle/signalements", evt)).status).toBe(200);
      const ligne = (await t.controles.signalements(controleId)).find(
        (s) => s.evenementId === evt.id,
      );
      expect(ligne?.patronPrevenu).toBe(false);
    } finally {
      t.messages.echec = false;
    }
  });
});

describe("controle.regularise : POST /agence/controle/regularisations", () => {
  it("vend un billet au voyageur sans billet : numéro du bord, siège occupé, liste à jour", async () => {
    const evt = regulEvt(controleId, 10, { prix: 1000, plage: 3200 });
    const r = await poster("/agence/controle/regularisations", evt);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const res = agence.SchemaResultatRegularisation.parse(r.body);
    expect(res.billet).toMatchObject({ prix: 1000 });
    expect(res.billet.numero).toBe("ALP-DLA-261102-3200");
    expect(res.controle.comptes.liste).toBe(4);
    expect(res.controle.comptes.tetes).toBe(
      res.controle.comptes.liste + res.controle.comptes.ecart,
    );
    const billet = await t.billets.trouver(res.billet.billetId);
    expect(billet).toMatchObject({
      etat: "embarque",
      siege: 10,
      canal: "convoyeur",
      sequence: 3200,
    });
    expect(await t.controles.regularisations(controleId)).toHaveLength(1);
    // Le siège est maintenant « scanné » : plus de voyageur sans billet à traiter.
    const vue = agence.SchemaControleInopine.parse((await lire("/agence/controle/inopine")).body);
    expect(vue.sansBillet).toBeNull();
    expect(vue.sieges.find((s) => s.numero === 10)?.constat).toBe("scanne");
  });

  it("rejoue la même régularisation : deja_recu, un seul billet", async () => {
    const evt = regulEvt(controleId, 15, { plage: 3201 });
    const a = await poster("/agence/controle/regularisations", evt);
    const b = await poster("/agence/controle/regularisations", evt);
    expect(b.status).toBe(200);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(b.body.billet).toEqual(a.body.billet);
    expect(
      (await t.controles.regularisations(controleId)).filter((x) => x.siege === 15),
    ).toHaveLength(1);
  });

  it("refuse un siège pris, un prix au-dessus du tarif, un numéro hors plage, un paiement faux", async () => {
    const pris = await poster("/agence/controle/regularisations", regulEvt(controleId, 1));
    expect(pris.status).toBe(409);
    expect(pris.body.code).toBe("SIEGE_PRIS");
    const cher = await poster(
      "/agence/controle/regularisations",
      regulEvt(controleId, 16, { prix: 4500 }),
    );
    expect(cher.status).toBe(422);
    expect(cher.body.code).toBe("PRIX_INCOHERENT");
    const plageGuichet = await poster(
      "/agence/controle/regularisations",
      regulEvt(controleId, 16, { plage: 1002 }),
    );
    expect(plageGuichet.body.code).toBe("NUMERO_HORS_PLAGE");
    const faux = regulEvt(controleId, 16);
    (faux.donnees as { paiement: unknown }).paiement = {
      mode: "cash",
      recu: 1000,
      rendu: 300,
      reference: null,
    };
    expect((await poster("/agence/controle/regularisations", faux)).body.code).toBe(
      "PAIEMENT_INVALIDE",
    );
  });

  it("n'est ouverte qu'au contrôleur", async () => {
    const evt = regulEvt(controleId, 17);
    expect(
      (await poster("/agence/controle/regularisations", evt, t.equipage.convoyeur.jeton)).status,
    ).toBe(403);
    expect(
      (await poster("/agence/controle/regularisations", evt, t.equipage.chauffeur.jeton)).status,
    ).toBe(403);
  });
});

describe("controle.cloture : POST /agence/controle/clotures", () => {
  it("fige les comptes du serveur, remet le constat au patron et rend le contrôle immuable", async () => {
    cloture = evtCloture();
    const avant = t.messages.constats.length;
    const r = await poster("/agence/controle/clotures", cloture);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const res = agence.SchemaResultatControle.parse(r.body);
    expect(res.controle.clos).toBe(true);
    expect(res.controle.envoyeAuPatron).toBe(true);
    // Les comptes sont ceux du serveur, pas ceux du téléphone : liste = billets valides, écart = têtes − liste.
    expect(res.controle.comptes.liste).toBe(5);
    expect(res.controle.comptes.ecart).toBe(
      res.controle.comptes.tetes - res.controle.comptes.liste,
    );
    // Un convoyeur a été signalé : le patron reçoit aussi un SMS de synthèse.
    expect(t.messages.constats.length).toBe(avant + 1);
    expect(t.messages.constats.at(-1)?.texte).toContain("Convoyeur signalé 4 fois");

    const stocke = await t.controles.trouver(controleId);
    expect(stocke).toMatchObject({ envoyeAuPatron: true, liste: 5 });
    expect(stocke?.clotureA).not.toBeNull();
  });

  it("rejoue la même clôture : deja_recu, aucun nouveau SMS", async () => {
    const avant = t.messages.constats.length;
    const r = await poster("/agence/controle/clotures", cloture);
    expect(r.status).toBe(200);
    expect(r.body.accuse.statut).toBe("deja_recu");
    expect(agence.SchemaResultatControle.parse(r.body).controle.clos).toBe(true);
    expect(t.messages.constats.length).toBe(avant);
  });

  it("refuse toute écriture sur un contrôle clos : 409 CONTROLE_CLOS", async () => {
    const memes = [
      poster("/agence/controle/clotures", clotureEvt(controleId)),
      poster("/agence/controle/sieges", siegeEvt(controleId, 20, "libre")),
      poster("/agence/controle/signalements", signalEvt(controleId, 20)),
      poster("/agence/controle/regularisations", regulEvt(controleId, 20)),
    ];
    for (const r of await Promise.all(memes)) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("CONTROLE_CLOS");
    }
  });

  it("relit un contrôle clos avec ses comptes figés, puis ouvre un nouveau contrôle", async () => {
    const clos = agence.SchemaControleInopine.parse(
      (await lire(`/agence/controle/inopine?controleId=${controleId}`)).body,
    );
    expect(clos.comptes.liste).toBe(5);
    expect(clos.sansBillet).toBeNull();
    const nouveau = agence.SchemaControleInopine.parse(
      (await lire("/agence/controle/inopine")).body,
    );
    expect(nouveau.controleId).not.toBe(controleId);
    expect(nouveau.comptes.liste).toBe(5);
  });
});

describe("clôtures concurrentes", () => {
  it("deux clôtures simultanées sous deux identifiants : une seule passe", async () => {
    const vue = agence.SchemaControleInopine.parse((await lire("/agence/controle/inopine")).body);
    const reponses = await Promise.all([
      poster("/agence/controle/clotures", clotureEvt(vue.controleId)),
      poster("/agence/controle/clotures", clotureEvt(vue.controleId)),
    ]);
    expect(reponses.map((r) => r.status).sort()).toEqual([200, 409]);
    // Aucun écart, aucun signalement : pas de SMS de synthèse mais le constat est tout de même noté envoyé.
    const stocke = await t.controles.trouver(vue.controleId);
    expect(stocke?.envoyeAuPatron).toBe(true);
  });
});
