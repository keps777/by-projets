import type { voyageur as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  delaiDepasse,
  emplacementDe,
  estMoyenAffiche,
  formaterDuree,
  formaterMontant,
  formaterTelephone,
  heureDouala,
  issuePaiement,
  siegesIndisponibles,
} from "./calculs";

describe("formats de la planche", () => {
  it("groupe les milliers avec une espace : 7500 -> « 7 500 »", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(250)).toBe("250");
    expect(formaterMontant(7500)).toBe("7 500");
    expect(formaterMontant(1234567)).toBe("1 234 567");
  });

  it("écrit le numéro camerounais comme la planche et laisse les autres tels quels", () => {
    expect(formaterTelephone("+237691221008")).toBe("6 91 22 10 08");
    expect(formaterTelephone("+14165550123")).toBe("+14165550123");
    expect(formaterTelephone("+23769122100")).toBe("+23769122100");
  });

  it("lit l'heure de Douala dans l'instant ISO", () => {
    expect(heureDouala("2027-01-05T08:00:00.000+01:00")).toBe("08:00");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("écrit la durée : 210 -> « 3 h 30 », 125 -> « 2 h 05 », 120 -> « 2 h », 45 -> « 45 min »", () => {
    expect(formaterDuree(210)).toBe("3 h 30");
    expect(formaterDuree(125)).toBe("2 h 05");
    expect(formaterDuree(120)).toBe("2 h");
    expect(formaterDuree(45)).toBe("45 min");
  });
});

describe("délai", () => {
  const limite = "2027-01-05T07:53:00.000+01:00";
  it("est dépassé à l'instant de la limite et après, pas avant", () => {
    expect(delaiDepasse(limite, new Date("2027-01-05T07:52:59+01:00"))).toBe(false);
    expect(delaiDepasse(limite, new Date("2027-01-05T07:53:00+01:00"))).toBe(true);
    expect(delaiDepasse(limite, new Date("2027-01-05T08:10:00+01:00"))).toBe(true);
  });

  it("n'est jamais dépassé pour une limite illisible", () => {
    expect(delaiDepasse("bientôt", new Date("2027-01-05T08:10:00+01:00"))).toBe(false);
  });
});

describe("moyens de paiement affichés", () => {
  it("garde MTN MoMo, Orange Money et la carte, pas « demander à un proche »", () => {
    expect(estMoyenAffiche("mtn_momo")).toBe(true);
    expect(estMoyenAffiche("orange_money")).toBe(true);
    expect(estMoyenAffiche("carte")).toBe(true);
    expect(estMoyenAffiche("proche")).toBe(false);
  });
});

describe("plan de sièges", () => {
  const plan: contrats.PlanSiegesVue = {
    departId: "dep-1",
    capacite: 5,
    sieges: [
      { numero: 1, etat: "pris" },
      { numero: 2, etat: "libre" },
      { numero: 3, etat: "bloque" },
      { numero: 4, etat: "a_moi", emplacement: "côté fenêtre · près de la porte" },
      { numero: 5, etat: "libre" },
    ],
    libres: 3,
    versionPlan: 1,
  };

  it("rend indisponibles les sièges pris ou bloqués par un autre, pas le mien", () => {
    expect(siegesIndisponibles(plan)).toEqual([1, 3]);
  });

  it("donne l'emplacement du siège quand l'API le connaît", () => {
    expect(emplacementDe(plan, 4)).toBe("côté fenêtre · près de la porte");
    expect(emplacementDe(plan, 2)).toBeUndefined();
    expect(emplacementDe(plan, 99)).toBeUndefined();
  });
});

describe("issue d'un paiement", () => {
  it("attend tant qu'aucun statut définitif n'est connu et que la commande n'a pas expiré", () => {
    expect(issuePaiement([undefined, undefined], false)).toBe("attente");
    expect(issuePaiement(["en_attente_confirmation", "en_attente_confirmation"], false)).toBe(
      "attente",
    );
  });

  it("reconnaît la réussite, l'échec et l'expiration", () => {
    expect(issuePaiement(["en_attente_confirmation", "reussi"], false)).toBe("reussi");
    expect(issuePaiement(["echoue", undefined], false)).toBe("echoue");
    expect(issuePaiement([undefined, "expire"], false)).toBe("expire");
  });

  it("clôt l'attente quand la commande a expiré", () => {
    expect(issuePaiement(["en_attente_confirmation"], true)).toBe("expire");
  });

  it("garde la réussite même si la commande vient d'expirer (le billet est déjà émis)", () => {
    expect(issuePaiement(["reussi"], true)).toBe("reussi");
  });
});
