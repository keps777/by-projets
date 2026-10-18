import { describe, expect, it } from "vitest";
import { configTest } from "../socle/testing/app-test";
import type { DepartComplet } from "../billetterie/modeles";
import { VerificationPortsBord } from "./bord.module";
import {
  ControlesBordMemoire,
  DepensesBordMemoire,
  IncidentsBordMemoire,
  PassagesRouteMemoire,
  RetardsDepartMemoire,
  VentesEnRouteMemoire,
} from "./memoire";
import type { PassageRoute } from "./modeles";
import {
  arretDeMonteeProposee,
  arretNomme,
  comptesDe,
  constatsEffectifs,
  dansLaPlageBord,
  debutDeSemaine,
  dernierArretAtteint,
  descriptionIncident,
  heureDePassage,
  kmDeLaLigne,
  natureDeDepense,
  natureDeIncident,
  paiementCoherent,
  prixDuTrajetPartiel,
  prochainArret,
  tetesComptees,
  verifierTrajetPartiel,
} from "./regles";
import { departType } from "./testing/app-bord-test";

const arrets = [
  { id: "a0", nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
  { id: "a1", nom: "Édéa", ordre: 1, kmDepuisOrigine: 65, montee: true },
  { id: "a2", nom: "Yaoundé", ordre: 2, kmDepuisOrigine: 250, montee: false },
];

const dc = {
  depart: departType("d1", { heureDepart: "2026-11-02T08:30:00+01:00" }),
  ligne: { dureeMinutes: 270, tarifs: { classique: 4000, vip: 6000, bagage: 500 }, arrets },
} as unknown as DepartComplet;

const arrivee = (arret: string): PassageRoute => ({
  id: arret,
  genre: "arrivee",
  departId: "d1",
  auteurId: "c1",
  arret,
  billetId: null,
  resultat: null,
  position: null,
  at: "2026-11-02T09:00:00+01:00",
});

describe("plage et paiement du bord", () => {
  it("la plage du bord est 3001 à 3999", () => {
    expect([3000, 3001, 3500, 3999, 4000, 1001, 3001.5].map(dansLaPlageBord)).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("cash : le reçu couvre le prix et la monnaie est exacte", () => {
    expect(paiementCoherent({ mode: "cash", recu: 1000, rendu: 0 }, 1000)).toBe(true);
    expect(paiementCoherent({ mode: "cash", recu: 2000, rendu: 1000 }, 1000)).toBe(true);
    expect(paiementCoherent({ mode: "cash", recu: 500, rendu: 0 }, 1000)).toBe(false);
    expect(paiementCoherent({ mode: "cash", recu: 2000, rendu: 500 }, 1000)).toBe(false);
  });

  it("mobile : montant exact, reçu 0 ou égal au prix, rien à rendre", () => {
    expect(paiementCoherent({ mode: "momo", recu: 0, rendu: 0 }, 1000)).toBe(true);
    expect(paiementCoherent({ mode: "momo", recu: 1000, rendu: 0 }, 1000)).toBe(true);
    expect(paiementCoherent({ mode: "momo", recu: 1500, rendu: 0 }, 1000)).toBe(false);
    expect(paiementCoherent({ mode: "momo", recu: 1000, rendu: 100 }, 1000)).toBe(false);
  });
});

describe("arrêts de la ligne", () => {
  it("retrouve un arrêt sans tenir compte des majuscules ni des espaces", () => {
    expect(arretNomme(dc, "  édéa ")?.id).toBe("a1");
    expect(arretNomme(dc, "Kribi")).toBeUndefined();
  });

  it("vérifie montée et descente : dans l'ordre, et on monte à la montée", () => {
    expect(verifierTrajetPartiel(dc, "Douala", "Édéa")).toMatchObject({ montee: { id: "a0" } });
    expect(verifierTrajetPartiel(dc, "Douala", "Kribi")).toEqual({ probleme: "ARRET_INCONNU" });
    expect(verifierTrajetPartiel(dc, "Édéa", "Douala")).toEqual({ probleme: "ARRETS_INVALIDES" });
    expect(verifierTrajetPartiel(dc, "Yaoundé", "Yaoundé")).toEqual({
      probleme: "ARRETS_INVALIDES",
    });
  });

  it("prix du tronçon : prorata des kilomètres arrondi à 100 F", () => {
    const [a0, a1, a2] = arrets as [(typeof arrets)[0], (typeof arrets)[0], (typeof arrets)[0]];
    expect(prixDuTrajetPartiel(dc, a0, a2)).toBe(4000);
    expect(prixDuTrajetPartiel(dc, a0, a1)).toBe(1000);
    expect(prixDuTrajetPartiel(dc, a1, a2)).toBe(3000);
  });

  it("dernier et prochain arrêt suivent les arrivées notées", () => {
    expect(dernierArretAtteint(dc, []).nom).toBe("Douala");
    expect(prochainArret(dc, []).nom).toBe("Édéa");
    expect(dernierArretAtteint(dc, [arrivee("Édéa")]).nom).toBe("Édéa");
    expect(prochainArret(dc, [arrivee("Édéa")]).nom).toBe("Yaoundé");
    expect(prochainArret(dc, [arrivee("Édéa"), arrivee("Yaoundé")]).nom).toBe("Yaoundé");
  });

  it("propose de monter à l'arrêt où le bus est arrivé, jamais à la destination", () => {
    expect(arretDeMonteeProposee(dc, []).nom).toBe("Douala");
    expect(arretDeMonteeProposee(dc, [arrivee("Édéa")]).nom).toBe("Édéa");
    expect(arretDeMonteeProposee(dc, [arrivee("Édéa"), arrivee("Yaoundé")]).nom).toBe("Édéa");
  });

  it("heure de passage : le temps de la ligne réparti selon les kilomètres, plus le retard", () => {
    expect(heureDePassage(dc, arrets[0]!)).toBe("2026-11-02T08:30:00.000+01:00");
    expect(heureDePassage(dc, arrets[2]!)).toBe("2026-11-02T13:00:00.000+01:00");
    expect(heureDePassage(dc, arrets[2]!, 25)).toBe("2026-11-02T13:25:00.000+01:00");
    expect(kmDeLaLigne(dc)).toBe(250);
  });
});

describe("dépenses et incidents : ce qui est rangé en base", () => {
  it("le péage et l'autre sont des « autre » en base, le carburant reste carburant", () => {
    expect(natureDeDepense("carburant")).toBe("carburant");
    expect(natureDeDepense("peage")).toBe("autre");
    expect(natureDeDepense("autre")).toBe("autre");
  });

  it("accident et route coupée sont des « autre » en base", () => {
    expect(natureDeIncident("panne")).toBe("panne");
    expect(natureDeIncident("accident")).toBe("autre");
    expect(natureDeIncident("route_coupee")).toBe("autre");
  });

  it("la description est la note du chauffeur, sinon le libellé de la nature", () => {
    expect(descriptionIncident("panne", "  Pneu éclaté ")).toBe("Pneu éclaté");
    expect(descriptionIncident("panne", null)).toBe("Panne");
    expect(descriptionIncident("route_coupee", "   ")).toBe("Route coupée");
  });
});

describe("semaine du chauffeur", () => {
  it("commence le lundi à minuit, heure de Douala", () => {
    // Mercredi 4 novembre 2026, 10:00 Douala -> lundi 2 novembre 2026, 00:00 Douala.
    const mercredi = Date.parse("2026-11-04T10:00:00+01:00");
    expect(new Date(debutDeSemaine(mercredi)).toISOString()).toBe("2026-11-01T23:00:00.000Z");
    // Le lundi lui-même, et le dimanche soir, restent dans leur semaine.
    expect(new Date(debutDeSemaine(Date.parse("2026-11-02T00:30:00+01:00"))).toISOString()).toBe(
      "2026-11-01T23:00:00.000Z",
    );
    expect(new Date(debutDeSemaine(Date.parse("2026-11-08T23:30:00+01:00"))).toISOString()).toBe(
      "2026-11-01T23:00:00.000Z",
    );
  });
});

describe("contrôle inopiné : les comptes", () => {
  it("l'écart est toujours têtes moins liste", () => {
    expect(comptesDe(30, 31)).toEqual({ liste: 30, tetes: 31, ecart: 1 });
    expect(comptesDe(30, 28)).toEqual({ liste: 30, tetes: 28, ecart: -2 });
  });

  it("le constat posé l'emporte ; sinon un billet valide donne « scanné », un siège sans billet « libre »", () => {
    const sieges = constatsEffectifs(
      4,
      [{ siege: 1 }, { siege: 2 }, { siege: null }],
      new Map([
        [2, "libre" as const],
        [3, "sans_billet" as const],
      ]),
    );
    expect(sieges).toEqual([
      { numero: 1, constat: "scanne" },
      { numero: 2, constat: "libre" },
      { numero: 3, constat: "sans_billet" },
      { numero: 4, constat: "libre" },
    ]);
    expect(tetesComptees(sieges)).toBe(2);
  });
});

describe("garde de production du module", () => {
  const ports = () =>
    [
      new VentesEnRouteMemoire(),
      new PassagesRouteMemoire(),
      new DepensesBordMemoire(),
      new IncidentsBordMemoire(),
      new RetardsDepartMemoire(),
      new ControlesBordMemoire(),
    ] as const;
  const garde = (env: "production" | "test") =>
    new VerificationPortsBord({ ...configTest(), env }, ...ports());

  it("refuse de démarrer en production tant qu'un port est en mémoire, en les nommant", () => {
    expect(() => garde("production").onModuleInit()).toThrow(
      /VentesEnRoute, PassagesRoute, DepensesBord, IncidentsBord, RetardsDepart, ControlesBord/,
    );
  });

  it("laisse démarrer hors production", () => {
    expect(() => garde("test").onModuleInit()).not.toThrow();
  });

  it("laisse démarrer en production quand tous les ports sont durables", () => {
    const durables = ports().map((p) =>
      Object.assign(p, { durable: true }),
    ) as unknown as ReturnType<typeof ports>;
    expect(() =>
      new VerificationPortsBord({ ...configTest(), env: "production" }, ...durables).onModuleInit(),
    ).not.toThrow();
  });
});
