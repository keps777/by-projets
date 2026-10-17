import { describe, expect, it } from "vitest";
import { voyageur as c } from "../index";

const ISO = "2027-01-05T08:00:00.000+01:00";

const ligne = { code: "billet", libelle: "Billet", montant: 7500 };
const commande = {
  id: "cmd-1",
  type: "billet",
  libelle: "Billet Bêta Express VIP",
  lignes: [ligne],
  total: 7500,
  statut: "en_attente_paiement",
  creeeA: "2027-01-05T07:38:00.000+01:00",
  expireA: "2027-01-05T07:53:00.000+01:00",
  billetIds: [],
};

describe("montants en FCFA", () => {
  it("accepte les entiers, refuse les décimales et les chaînes", () => {
    expect(c.SchemaFcfa.safeParse(7500).success).toBe(true);
    expect(c.SchemaFcfa.safeParse(-250).success).toBe(true);
    expect(c.SchemaFcfa.safeParse(7500.5).success).toBe(false);
    expect(c.SchemaFcfa.safeParse("7500").success).toBe(false);
    expect(c.SchemaFcfaPositif.safeParse(-1).success).toBe(false);
  });

  it("refuse un total décimal dans une commande", () => {
    expect(c.SchemaCommande.safeParse(commande).success).toBe(true);
    expect(c.SchemaCommande.safeParse({ ...commande, total: 7500.5 }).success).toBe(false);
    expect(
      c.SchemaCommande.safeParse({ ...commande, lignes: [{ ...ligne, montant: 99.9 }] }).success,
    ).toBe(false);
  });
});

describe("heures ISO à Douala", () => {
  it("n'accepte que le décalage +01:00", () => {
    for (const ok of [ISO, "2027-01-05T08:00:00+01:00"]) {
      expect(c.SchemaIsoDouala.safeParse(ok).success, ok).toBe(true);
    }
    for (const ko of [
      "2027-01-05T08:00:00.000Z",
      "2027-01-05T07:00:00.000+00:00",
      "2027-01-05T08:00:00",
      "2027-01-05",
      "08:00",
    ]) {
      expect(c.SchemaIsoDouala.safeParse(ko).success, ko).toBe(false);
    }
  });

  it("refuse une commande dont l'expiration est en UTC", () => {
    expect(
      c.SchemaCommande.safeParse({ ...commande, expireA: "2027-01-05T06:53:00.000Z" }).success,
    ).toBe(false);
  });

  it("désigne le fuseau Africa/Douala", () => {
    expect(c.FUSEAU_VOYAGEUR).toBe("Africa/Douala");
  });
});

describe("compte", () => {
  it("normalise le numéro au format international", () => {
    expect(c.SchemaTelephone.safeParse("+237691221008").success).toBe(true);
    expect(c.SchemaTelephone.safeParse("6 91 22 10 08").success).toBe(false);
  });

  it("demande de code : SMS par défaut, WhatsApp ou USSD possibles", () => {
    expect(c.SchemaDemandeCode.safeParse({ telephone: "+237691221008" }).success).toBe(true);
    expect(
      c.SchemaDemandeCode.safeParse({ telephone: "+237691221008", canal: "fax" }).success,
    ).toBe(false);
  });

  it("le code de vérification a 4 chiffres", () => {
    expect(
      c.SchemaVerificationCode.safeParse({ telephone: "+237691221008", code: "4821" }).success,
    ).toBe(true);
    expect(
      c.SchemaVerificationCode.safeParse({ telephone: "+237691221008", code: "482" }).success,
    ).toBe(false);
    expect(
      c.SchemaVerificationCode.safeParse({ telephone: "+237691221008", code: "48a1" }).success,
    ).toBe(false);
  });
});

describe("plan de sièges en temps réel", () => {
  const plan = {
    departId: "d1",
    capacite: 2,
    sieges: [
      { numero: 1, etat: "libre" },
      { numero: 2, etat: "a_moi" },
    ],
    libres: 2,
    mon: { departId: "d1", siege: 2, jusqua: ISO },
    versionPlan: 1,
  };

  it("distingue l'instantané du changement de siège", () => {
    expect(c.SchemaMessagePlanSieges.safeParse({ type: "plan", plan }).success).toBe(true);
    expect(
      c.SchemaMessagePlanSieges.safeParse({
        type: "siege",
        departId: "d1",
        siege: 1,
        etat: "pris",
        versionPlan: 2,
      }).success,
    ).toBe(true);
    expect(c.SchemaMessagePlanSieges.safeParse({ type: "autre" }).success).toBe(false);
    expect(
      c.SchemaMessagePlanSieges.safeParse({
        type: "siege",
        departId: "d1",
        siege: 1,
        etat: "casse",
        versionPlan: 2,
      }).success,
    ).toBe(false);
  });
});

describe("commande, groupe et billet", () => {
  it("une commande a au moins un siège", () => {
    expect(
      c.SchemaCreerCommande.safeParse({ departId: "d1", sieges: [7], pour: "moi" }).success,
    ).toBe(true);
    expect(
      c.SchemaCreerCommande.safeParse({ departId: "d1", sieges: [], pour: "moi" }).success,
    ).toBe(false);
    expect(
      c.SchemaCreerCommande.safeParse({ departId: "d1", sieges: [7], pour: "tous" }).success,
    ).toBe(false);
  });

  it("un groupe compte de 2 à 12 voyageurs", () => {
    expect(
      c.SchemaCreerGroupe.safeParse({ departId: "d1", voyageurs: 6, mode: "groupe" }).success,
    ).toBe(true);
    expect(
      c.SchemaCreerGroupe.safeParse({ departId: "d1", voyageurs: 1, mode: "groupe" }).success,
    ).toBe(false);
    expect(
      c.SchemaCreerGroupe.safeParse({ departId: "d1", voyageurs: 13, mode: "groupe" }).success,
    ).toBe(false);
  });

  it("le code du billet a 4 chiffres et le paiement garde un montant entier", () => {
    const billet = {
      id: "b1",
      numero: "BEX-DLA-270105-0142",
      etat: "paye",
      smsEnvoye: true,
      compagnie: { id: "cie-bex", nom: "Bêta Express" },
      classe: "vip",
      departId: "d1",
      heureDepart: ISO,
      dureeMinutes: 210,
      origine: { ville: { code: "DLA", nom: "Douala" }, gare: "Douala Akwa" },
      destination: { ville: { code: "YDE", nom: "Yaoundé" }, gare: "Yaoundé Mvan" },
      siege: 7,
      prix: 7500,
      passager: { nom: "Aïcha Ngo", pieceQuatreDerniers: "4471" },
      qr: "AFM|BEX-DLA-270105-0142|7341",
      codeBillet: "7341",
      presenceQuaiMinutes: 20,
      annulationGratuiteJusqua: "2027-01-05T07:00:00.000+01:00",
    };
    expect(c.SchemaBilletVoyageur.safeParse(billet).success).toBe(true);
    expect(c.SchemaBilletVoyageur.safeParse({ ...billet, codeBillet: "73411" }).success).toBe(
      false,
    );
    expect(c.SchemaBilletVoyageur.safeParse({ ...billet, prix: 7500.5 }).success).toBe(false);
    expect(
      c.SchemaPaiement.safeParse({
        id: "p1",
        commandeId: "cmd-1",
        moyen: "mtn_momo",
        statut: "en_attente_confirmation",
        montant: 4250.5,
        creeA: ISO,
      }).success,
    ).toBe(false);
  });

  it("la conversion en devise étrangère est en unité mineure entière", () => {
    expect(
      c.SchemaConversion.safeParse({ devise: "CAD", montantMineur: 1290, approximatif: true })
        .success,
    ).toBe(true);
    expect(
      c.SchemaConversion.safeParse({ devise: "CAD", montantMineur: 12.9, approximatif: true })
        .success,
    ).toBe(false);
  });
});
