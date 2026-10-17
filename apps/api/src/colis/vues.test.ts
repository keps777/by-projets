import { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import type { ColisStocke } from "./modele";
import {
  etapesSuivi,
  jalonCourant,
  masquerTelephone,
  modeModifiable,
  optionsDeRetrait,
  vuePartenaire,
  vueProprietaire,
} from "./vues";

const GARE = (code: string, ville: string) => ({
  id: `00000000-0000-4000-8000-0000000000${code === "DLA" ? "a1" : "a2"}`,
  code,
  nom: `Alpha ${ville}`,
  ville,
});

function colis(over: Partial<ColisStocke> = {}): ColisStocke {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    version: 3,
    numero: "C-DLA-261102-4001",
    sequence: 4001,
    jour: "261102",
    canal: "app",
    mode: "gare",
    compagnieId: "00000000-0000-4000-8000-0000000000c1",
    gareOrigine: GARE("DLA", "Douala"),
    gareDestination: GARE("BAF", "Bafoussam"),
    departId: "dep-1",
    heureDepart: "2026-11-02T10:00:00.000+01:00",
    arriveePrevue: "2026-11-02T15:00:00.000+01:00",
    expediteurId: "u1",
    expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
    destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822", surnom: null },
    contenu: "Vêtements",
    poidsKg: 2,
    valeurDeclaree: 25000,
    assure: true,
    valeurAssuree: 25000,
    assurance: { police: "POL-000001", enAttente: false },
    relaisId: null,
    adresseLivraison: null,
    port: 1500,
    devis: [],
    prixTotal: 2200,
    complementPoids: 0,
    paiement: null,
    code: {
      hache: "a".repeat(64),
      sel: "b".repeat(32),
      chiffre: "enc:v1:xxxx",
      essais: 0,
      bloque: false,
      envoyeA: null,
      smsDestinataire: "envoye",
    },
    creeA: "2026-11-02T09:00:00.000+01:00",
    disponibleDepuis: null,
    depose: null,
    remise: null,
    etat: "enregistre",
    historique: [],
    evenementIds: [],
    ...over,
  };
}

describe("vues du colis", () => {
  it("masque le téléphone comme les étiquettes : « ···· 18 22 »", () => {
    expect(masquerTelephone("+237699401822")).toBe("···· 18 22");
    expect(masquerTelephone("+237 6 99 40 18 22")).toBe("···· 18 22");
  });

  it("la vue partenaire respecte le schéma strict et ne porte aucun champ du code", () => {
    const c = colis({ etat: "disponible", disponibleDepuis: "2026-11-02T15:30:00.000+01:00" });
    const vue = vuePartenaire(c, "2026-11-09T15:30:00.000+01:00");
    expect(contrats.SchemaColisPartenaire.safeParse(vue).success).toBe(true);
    expect(contrats.fuitesCodeRetrait(vue, ["482913"])).toEqual([]);
    expect(JSON.stringify(vue)).not.toContain(c.code.hache);
    expect(JSON.stringify(vue)).not.toContain(c.code.sel);
    expect(JSON.stringify(vue)).not.toContain("0691221008");
    expect(vue.valeurAssuree).toBe(25000);
    expect(vuePartenaire(colis({ assure: false }), null).valeurAssuree).toBe(0);
  });

  it("la vue du propriétaire est la seule qui porte le code, et respecte son schéma", () => {
    const c = colis({
      etat: "charge",
      historique: [
        {
          action: "charger",
          de: "enregistre",
          vers: "charge",
          at: "2026-11-02T09:30:00.000+01:00",
        },
      ],
    });
    const vue = vueProprietaire(c, "expediteur", "482913");
    expect(contrats.SchemaColisProprietaire.safeParse(vue).success).toBe(true);
    expect(vue.retrait.code).toBe("482913");
    expect(vue.options.length).toBe(2);
    expect(vueProprietaire(c, "destinataire", "482913").options).toEqual([]);
    expect(JSON.stringify(vue)).not.toContain(c.code.hache);
  });

  it("estime l'arrivée tant que le colis n'est pas disponible, puis donne l'heure réelle", () => {
    const enRoute = colis({
      etat: "en_route",
      historique: [
        {
          action: "charger",
          de: "enregistre",
          vers: "charge",
          at: "2026-11-02T09:30:00.000+01:00",
        },
        { action: "expedier", de: "charge", vers: "en_route", at: "2026-11-02T10:05:00.000+01:00" },
      ],
    });
    const etapes = etapesSuivi(enRoute);
    expect(etapes.map((e) => e.fait)).toEqual([true, true, true, false, false]);
    expect(etapes[3]).toMatchObject({
      jalon: "disponible",
      estimee: true,
      a: "2026-11-02T15:00:00.000+01:00",
    });
    expect(jalonCourant(enRoute)).toBe("en_route");

    const dispo = colis({
      etat: "disponible",
      disponibleDepuis: "2026-11-02T15:20:00.000+01:00",
      historique: enRoute.historique,
    });
    expect(etapesSuivi(dispo)[3]).toMatchObject({
      estimee: false,
      fait: true,
      a: "2026-11-02T15:20:00.000+01:00",
    });
    expect(jalonCourant(dispo)).toBe("disponible");
  });

  it("propose relais et moto tant que le mode peut changer, et rien ensuite", () => {
    expect(optionsDeRetrait(colis()).map((o) => o.mode)).toEqual(["moto", "relais"]);
    expect(optionsDeRetrait(colis({ mode: "relais" })).map((o) => o.mode)).toEqual(["moto"]);
    expect(optionsDeRetrait(colis({ mode: "moto" })).map((o) => o.mode)).toEqual(["relais"]);
    for (const etat of ["remis", "en_relais", "en_livraison", "perdu", "litige"] as const) {
      expect(modeModifiable(colis({ etat })), etat).toBe(false);
      expect(optionsDeRetrait(colis({ etat })), etat).toEqual([]);
    }
  });
});
