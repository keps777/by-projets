import { describe, expect, it } from "vitest";
import type { AppConfig } from "../socle/config/config";
import { calculerEmpreinte, canonique } from "./journal/journal.service";
import { francs, initiales, nomAbrege, nombre, sequence4, uuidDeterministe } from "./format";
import { exigerStockageDurable } from "./stockage";
import { Lecteur } from "./validation";
import { EvenementInvalide, lireEvenement } from "./validation";
import { DEF_CAISSE_CLOTUREE } from "./evenements";

describe("format des montants et des noms", () => {
  it("espace les milliers, met un vrai moins suivi d'une espace", () => {
    expect(nombre(0)).toBe("0");
    expect(nombre(999)).toBe("999");
    expect(nombre(7_500)).toBe("7 500");
    expect(nombre(1_234_567)).toBe("1 234 567");
    expect(nombre(-1_000)).toBe("− 1 000");
    expect(francs(-500)).toBe("− 500 F");
    expect(francs(25_000)).toBe("25 000 F");
  });

  it("abrège un nom en « Prénom N. », sans planter sur un nom vide ou d'un seul mot", () => {
    expect(nomAbrege("Joseph Mbarga")).toBe("Joseph M.");
    expect(nomAbrege("  Paul   Biya  Essomba ")).toBe("Paul E.");
    expect(nomAbrege("Marie")).toBe("Marie");
    expect(nomAbrege("   ")).toBe("Inconnu");
    expect(nomAbrege("Étienne éyinga")).toBe("Étienne É.");
  });

  it("initiales : trois lettres au plus", () => {
    expect(initiales("Joseph Mbarga")).toBe("JM");
    expect(initiales("Jean Paul Marie Dupont")).toBe("JPM");
    expect(initiales("")).toBe("?");
  });

  it("numéro de billet sur quatre chiffres", () => {
    expect(sequence4(7)).toBe("0007");
    expect(sequence4(171)).toBe("0171");
    expect(sequence4(9_999)).toBe("9999");
  });

  it("l'UUID déterministe est stable, distinct selon la graine, et valide pour le contrat", () => {
    const a = uuidDeterministe("cloture-auto-s1");
    expect(uuidDeterministe("cloture-auto-s1")).toBe(a);
    expect(uuidDeterministe("cloture-auto-s2")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("lecteur d'événements", () => {
  it("accumule tous les problèmes avec leur chemin au lieu de s'arrêter au premier", () => {
    const l = new Lecteur();
    l.texte("", "a");
    l.entier(1.5, "b");
    l.entier(-1, "c", 0);
    l.booleen("oui", "d");
    l.uuid("x", "e");
    l.iso("2026-11-02T09:00:00Z", "f");
    l.choix("z", "g", ["a", "b"] as const);
    l.liste("x", "h", () => 1);
    expect(l.problemes.map((p) => p.chemin)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("refuse les entiers non sûrs, les textes trop longs, les listes trop longues", () => {
    const l = new Lecteur();
    expect(l.entier(Number.MAX_SAFE_INTEGER + 1, "x")).toBeUndefined();
    expect(l.texte("a".repeat(11), "y", 10)).toBeUndefined();
    expect(l.liste([1, 2, 3], "z", (x) => x as number, 2)).toBeUndefined();
    expect(l.problemes).toHaveLength(3);
  });

  it("une liste dont un élément est invalide est refusée en entier", () => {
    const l = new Lecteur();
    const lu = l.liste([1, "x", 3], "l", (x, chemin) =>
      typeof x === "number" ? x : l.echec(chemin, "nombre attendu"),
    );
    expect(lu).toBeUndefined();
    expect(l.problemes).toEqual([{ chemin: "l[1]", message: "nombre attendu" }]);
  });

  it("une valeur nulle passe par nullable, un texte libre peut être vide", () => {
    const l = new Lecteur();
    expect(l.nullable(null, () => 1)).toBeNull();
    expect(l.nullable("x", (v) => String(v))).toBe("x");
    expect(l.texteLibre("", "t")).toBe("");
    expect(l.texteLibre(3, "t")).toBeUndefined();
  });

  it("lireEvenement lève 422 EVENEMENT_INVALIDE avec la liste des chemins", () => {
    try {
      lireEvenement({ id: "x", type: "caisse.cloturee", donnees: {} }, DEF_CAISSE_CLOTUREE);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EvenementInvalide);
      const corps = (e as EvenementInvalide).getResponse() as {
        code: string;
        details: { chemin: string }[];
      };
      expect(corps.code).toBe("EVENEMENT_INVALIDE");
      expect(corps.details.map((d) => d.chemin)).toEqual(
        expect.arrayContaining([
          "id",
          "at",
          "appareilId",
          "auteurId",
          "cible",
          "numeroPlage",
          "donnees.sessionId",
          "donnees.ecart",
        ]),
      );
    }
    expect(() => lireEvenement("pas un objet", DEF_CAISSE_CLOTUREE)).toThrow(EvenementInvalide);
  });
});

describe("journal : JSON canonique et empreinte", () => {
  it("le JSON canonique ne dépend ni de l'ordre des clés ni des valeurs indéfinies", () => {
    expect(canonique({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe(
      canonique({ a: { c: undefined, d: [3, { x: 2, y: 1 }] }, b: 1 }),
    );
    expect(canonique({ a: undefined })).toBe("{}");
    expect(canonique([2, 1])).not.toBe(canonique([1, 2]));
  });

  const entree = {
    evenementId: "e1",
    type: "caisse.ouverte",
    at: "2026-11-02T09:00:00.000+01:00",
    gareId: "g",
    compagnieId: "c",
    auteur: { id: "a", nom: "Joseph" },
    appareilId: "GU2",
    cible: { type: "session", id: "s1" },
    numeroPlage: null,
    resume: "Ouverture",
    validePar: null,
  };

  it("l'empreinte change dès qu'un champ signé, la clé ou l'entrée précédente change", () => {
    const cle = Buffer.from("cle-de-test-cle-de-test-cle-de-test");
    const base = calculerEmpreinte(cle, entree, null);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(calculerEmpreinte(cle, { ...entree }, null)).toBe(base);
    expect(calculerEmpreinte(cle, entree, "ab".repeat(32))).not.toBe(base);
    expect(
      calculerEmpreinte(Buffer.from("autre-cle-autre-cle-autre-cle-autre"), entree, null),
    ).not.toBe(base);
    for (const [champ, valeur] of Object.entries({
      evenementId: "e2",
      type: "caisse.comptee",
      at: "2026-11-02T09:00:01.000+01:00",
      gareId: "g2",
      compagnieId: "c2",
      auteur: { id: "b", nom: "Joseph" },
      appareilId: "GU3",
      cible: { type: "session", id: "s2" },
      numeroPlage: 3,
      resume: "Ouverture !",
      validePar: { superviseurId: "s", methode: "pin" as const, signature: "ab".repeat(8) },
    })) {
      expect(calculerEmpreinte(cle, { ...entree, [champ]: valeur }, null), champ).not.toBe(base);
    }
  });
});

describe("stockage durable", () => {
  const ports: [string, unknown][] = [
    ["Sessions", { durable: false }],
    ["Journal", { durable: true }],
    ["Autre", { durable: false }],
  ];

  it("refuse de démarrer en production avec un port en mémoire, et les nomme", () => {
    expect(() =>
      exigerStockageDurable("CaisseModule", { env: "production" } as AppConfig, ports),
    ).toThrow(/CaisseModule : Sessions, Autre sont en mémoire/);
  });

  it("accepte la mémoire hors production et les ports durables en production", () => {
    expect(() =>
      exigerStockageDurable("CaisseModule", { env: "development" } as AppConfig, ports),
    ).not.toThrow();
    expect(() =>
      exigerStockageDurable("CaisseModule", { env: "test" } as AppConfig, ports),
    ).not.toThrow();
    expect(() =>
      exigerStockageDurable("CaisseModule", { env: "production" } as AppConfig, [
        ["Journal", { durable: true }],
      ]),
    ).not.toThrow();
  });
});
