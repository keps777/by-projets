import { describe, expect, it } from "vitest";
import { analyserTexte } from "../sms/gsm";
import { versIsoDouala } from "./temps";
import {
  ETAT_VIERGE,
  appliquerEchec,
  codeCorrespond,
  decider,
  dureeBlocageMs,
  estBloque,
  formatWebOtp,
  genererCode,
  hacherCode,
  indexTelephone,
  texteSms,
  type EtatLimite,
} from "./regles";

const POIVRE = Buffer.from("poivre-de-test-poivre-de-test-ok");
const T0 = new Date("2027-01-05T08:00:00.000Z");
const apres = (ms: number, de: Date = T0): Date => new Date(de.getTime() + ms);
const MIN = 60_000;

describe("genererCode", () => {
  it("fabrique 4 chiffres, zéros de tête compris", () => {
    const codes = Array.from({ length: 3000 }, () => genererCode());
    expect(codes.every((c) => /^\d{4}$/.test(c))).toBe(true);
    // 10 % des codes commencent par 0 : ne jamais en voir sur 3000 tirages serait un bug de formatage.
    expect(codes.some((c) => c.startsWith("0"))).toBe(true);
  });

  it("ne tire pas toujours le même code", () => {
    expect(new Set(Array.from({ length: 200 }, () => genererCode())).size).toBeGreaterThan(100);
  });
});

describe("hacherCode et indexTelephone", () => {
  it("ne contient pas le code et dépend de l'identifiant, du code et du poivre", () => {
    const h = hacherCode(POIVRE, "id-1", "4821");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("4821");
    expect(hacherCode(POIVRE, "id-1", "4821")).toBe(h);
    expect(hacherCode(POIVRE, "id-2", "4821")).not.toBe(h);
    expect(hacherCode(POIVRE, "id-1", "4822")).not.toBe(h);
    expect(hacherCode(Buffer.from("autre-poivre-autre-poivre-autre"), "id-1", "4821")).not.toBe(h);
  });

  it("codeCorrespond accepte le bon code et refuse tout autre", () => {
    const h = hacherCode(POIVRE, "id-1", "0042");
    expect(codeCorrespond(POIVRE, h, "id-1", "0042")).toBe(true);
    expect(codeCorrespond(POIVRE, h, "id-1", "0043")).toBe(false);
    expect(codeCorrespond(POIVRE, h, "id-2", "0042")).toBe(false);
    expect(codeCorrespond(POIVRE, "pas-un-hache", "id-1", "0042")).toBe(false);
  });

  it("l'index du numéro est stable, sans le numéro et propre à ce service", () => {
    const i = indexTelephone(POIVRE, "+237691221008");
    expect(i).toMatch(/^[0-9a-f]{64}$/);
    expect(i).not.toContain("691221008");
    expect(indexTelephone(POIVRE, "+237691221008")).toBe(i);
    expect(indexTelephone(POIVRE, "+237691221009")).not.toBe(i);
  });
});

describe("texteSms : format WebOTP", () => {
  const texte = texteSms("4821", 5, "afrimove.app");

  it("se termine par « @domaine #code » sur une ligne à part", () => {
    expect(texte.endsWith("\n\n@afrimove.app #4821")).toBe(true);
    expect(formatWebOtp(texte, "afrimove.app", "4821")).toBe(true);
    expect(formatWebOtp(texte, "afrimove.app", "4822")).toBe(false);
    expect(formatWebOtp(texte, "autre.app", "4821")).toBe(false);
  });

  it("garde le code, la durée et la consigne de sécurité en français", () => {
    expect(texte).toContain("ton code est 4821");
    expect(texte).toContain("Valable 5 min");
    expect(texte).toContain("Personne d'AfriMove ne te le demandera jamais");
  });

  it("tient en un seul SMS, en alphabet GSM (12 F, pas 36)", () => {
    const analyse = analyserTexte(texte);
    expect(analyse.encodage).toBe("gsm7");
    expect(analyse.segments).toBe(1);
  });

  it("le code n'apparaît qu'aux deux endroits voulus", () => {
    expect(texte.split("4821")).toHaveLength(3);
  });

  it("refuse un format qui n'est pas la dernière ligne", () => {
    expect(formatWebOtp("code 4821 @afrimove.app #4821 merci", "afrimove.app", "4821")).toBe(false);
    expect(formatWebOtp(`${texte}\nmerci`, "afrimove.app", "4821")).toBe(false);
  });
});

describe("appliquerEchec", () => {
  const regles = {
    essaisMax: 5,
    fenetreEchecsMs: 60 * MIN,
    blocageBaseMs: 15 * MIN,
    blocageMaxMs: 24 * 60 * MIN,
  };

  function echouer(n: number, depart: EtatLimite = ETAT_VIERGE, pas = 1000): EtatLimite {
    let etat = depart;
    for (let i = 0; i < n; i++) etat = appliquerEchec(etat, apres(i * pas), regles);
    return etat;
  }

  it("compte jusqu'à 4 erreurs sans bloquer", () => {
    for (let n = 1; n <= 4; n++) {
      const etat = echouer(n);
      expect(etat.echecs).toBe(n);
      expect(estBloque(etat, apres(n * 1000))).toBe(false);
    }
  });

  it("bloque à la 5e erreur, 15 minutes, et remet le compteur à zéro", () => {
    const etat = echouer(5);
    expect(etat).toEqual({
      echecs: 0,
      blocages: 1,
      bloqueJusqua: apres(4000 + 15 * MIN),
      dernierEchecA: apres(4000),
    });
    expect(estBloque(etat, apres(4000 + 15 * MIN - 1))).toBe(true);
    expect(estBloque(etat, apres(4000 + 15 * MIN))).toBe(false);
  });

  it("ne change rien tant que le numéro est bloqué", () => {
    const etat = echouer(5);
    expect(appliquerEchec(etat, apres(10_000), regles)).toBe(etat);
  });

  it("la durée double à chaque blocage, jusqu'à 24 h", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => dureeBlocageMs(n, 15 * MIN, 24 * 60 * MIN)),
    ).toEqual([15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440].map((m) => m * MIN));
  });

  it("enchaîne les blocages quand les erreurs continuent après chaque attente", () => {
    let etat = echouer(5);
    let at = etat.bloqueJusqua!;
    for (let attendu = 2; attendu <= 3; attendu++) {
      for (let i = 0; i < 5; i++) etat = appliquerEchec(etat, apres(i, at), regles);
      expect(etat.blocages).toBe(attendu);
      expect(etat.bloqueJusqua!.getTime() - (at.getTime() + 4)).toBe(
        dureeBlocageMs(attendu, 15 * MIN, 24 * 60 * MIN),
      );
      at = etat.bloqueJusqua!;
    }
  });

  it("une heure de calme efface les erreurs, pas les blocages", () => {
    const etat = echouer(3);
    const plusTard = appliquerEchec(etat, apres(61 * MIN), regles);
    expect(plusTard.echecs).toBe(1);

    const bloque = echouer(5);
    const repris = appliquerEchec(bloque, apres(30 * MIN), regles);
    expect(repris).toMatchObject({ echecs: 1, blocages: 1 });
  });

  it("24 h de calme effacent aussi les blocages", () => {
    const bloque = echouer(5);
    const repris = appliquerEchec(bloque, apres(25 * 60 * MIN), regles);
    expect(repris).toMatchObject({ echecs: 1, blocages: 0 });
  });

  it("la limite suit essaisMax", () => {
    const trois = { ...regles, essaisMax: 3 };
    let etat: EtatLimite = ETAT_VIERGE;
    for (let i = 0; i < 3; i++) etat = appliquerEchec(etat, apres(i), trois);
    expect(etat.bloqueJusqua).not.toBeNull();
  });
});

describe("decider : un envoi par 40 s, cinq par heure", () => {
  const regles = { intervalleMs: 40_000, maxParFenetre: 5, fenetreMs: 60 * MIN };

  it("permet le premier envoi", () => {
    expect(decider([], T0, regles)).toEqual({ permis: true });
  });

  it("refuse avant 40 s, permet à 40 s pile", () => {
    expect(decider([T0], apres(39_999), regles)).toEqual({
      permis: false,
      raison: "trop_tot",
      reessayerA: apres(40_000),
    });
    expect(decider([T0], apres(40_000), regles)).toEqual({ permis: true });
  });

  it("refuse le sixième envoi de l'heure et dit quand le plus ancien expire", () => {
    const envois = [0, 1, 2, 3, 4].map((i) => apres(i * MIN));
    expect(decider(envois, apres(5 * MIN), regles)).toEqual({
      permis: false,
      raison: "quota",
      reessayerA: apres(60 * MIN),
    });
  });

  it("l'ordre de la liste n'a pas d'importance", () => {
    const envois = [apres(4 * MIN), apres(0), apres(2 * MIN), apres(MIN), apres(3 * MIN)];
    expect(decider(envois, apres(5 * MIN), regles)).toMatchObject({ raison: "quota" });
  });
});

describe("versIsoDouala", () => {
  it("écrit l'heure de Douala avec le décalage +01:00 attendu par les contrats", () => {
    expect(versIsoDouala(new Date("2027-01-05T07:30:00.000Z"))).toBe(
      "2027-01-05T08:30:00.000+01:00",
    );
    expect(versIsoDouala(new Date("2027-01-05T23:30:00.000Z"))).toBe(
      "2027-01-06T00:30:00.000+01:00",
    );
  });
});
