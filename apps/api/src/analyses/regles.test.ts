import { describe, expect, it } from "vitest";
import {
  CADENCE_SANS_NOM_MINIMUM,
  FUITE_JOURS,
  busASurveiller,
  cadenceSansNom,
  concurrentMoinsCher,
  creuxDuJour,
  detecter,
  ecartsRepetes,
  pannesRepetees,
} from "./regles";
import {
  AKWA,
  AUJOURDHUI,
  BUS_207,
  BUS_330,
  DLA_BAF,
  DLA_YDE,
  ESSONO,
  JOSEPH,
  cadence,
  contexteRegles,
  depart,
  ecart,
  genererLigne,
} from "./testing/montage";
import type { OffrePublique } from "./modele";
import { jourParJour } from "./periodes";

const PANNE = { nature: "panne" as const, description: "panne", dureeMinutes: 90 };

describe("écarts répétés d'un agent", () => {
  it("trois écarts négatifs de la même personne en dix jours : un constat chiffré, daté, avec ses actions", () => {
    const [c] = ecartsRepetes(
      contexteRegles({
        ecarts: [
          ecart({ jour: "2026-12-29" }),
          ecart({ jour: "2027-01-02", ecart: -1_500 }),
          ecart({ jour: "2027-01-04", ecart: -1_500 }),
        ],
      }),
    );
    expect(c).toMatchObject({
      id: "fuite:ecarts:agent-joseph",
      regle: "ecarts_repetes_agent",
      periodeJours: FUITE_JOURS,
      montantTotal: -4_500,
      joursConcernes: [4, 8, 10],
      constat: "Guichet 2 d'Akwa : 3 écarts négatifs, toujours Joseph.",
    });
    expect(c!.explication).toMatch(/^Total − 4 500\. Petit, mais régulier\./);
    expect(c!.sources).toEqual([expect.objectContaining({ type: "ecarts_caisse", nombre: 3 })]);
    expect(c!.actions.map((a) => a.libelle)).toEqual(["Contrôle inopiné lundi"]);
  });

  it("« toujours le mardi » quand au moins deux écarts sur trois tombent le même jour de la semaine", () => {
    // Jeudi 7 janvier : les dix derniers jours contiennent deux mardis (29 déc. et 5 janv.).
    const [c] = ecartsRepetes(
      contexteRegles({
        aujourdhui: "2027-01-07",
        ecarts: [
          ecart({ jour: "2026-12-29", ecart: -2_000 }),
          ecart({ jour: "2027-01-02", ecart: -1_500 }),
          ecart({ jour: "2027-01-05", ecart: -1_500 }),
        ],
      }),
    );
    expect(c!.constat).toBe(
      "Guichet 2 d'Akwa : 3 écarts négatifs, toujours le mardi, toujours Joseph.",
    );
    expect(c!.actions[0]!.libelle).toBe("Contrôle inopiné mardi");
  });

  it("les billets de cadence sans numéro vendus par le même agent ces jours-là sont cités, avec l'action qui les empêche", () => {
    const [c] = ecartsRepetes(
      contexteRegles({
        ecarts: [
          ecart({ jour: "2026-12-29" }),
          ecart({ jour: "2027-01-02" }),
          ecart({ jour: "2027-01-04" }),
        ],
        cadence: [
          cadence({ jour: "2026-12-29", sansNom: 6 }),
          cadence({ jour: "2027-01-04", sansNom: 5 }),
          cadence({ jour: "2027-01-03", sansNom: 9 }), // un autre jour : ne compte pas
          cadence({ jour: "2027-01-04", agentId: ESSONO.id, sansNom: 8 }), // un autre agent
        ],
      }),
    );
    expect(c!.explication).toContain(
      "le 05:30 Yaoundé est en mode cadence et 11 billets ont été vendus sans numéro de téléphone.",
    );
    expect(c!.sources.map((s) => s.type)).toEqual(["ecarts_caisse", "billets_cadence"]);
    expect(c!.actions.map((a) => a.type)).toEqual(["controle_inopine", "regle_cadence_numero"]);
  });

  it("deux écarts ne font pas une répétition", () => {
    expect(
      ecartsRepetes(
        contexteRegles({ ecarts: [ecart({ jour: "2026-12-29" }), ecart({ jour: "2027-01-04" })] }),
      ),
    ).toEqual([]);
  });

  it("ne compte que les écarts négatifs au-delà de la tolérance, validés, dans les dix derniers jours", () => {
    const jours = ["2026-12-29", "2027-01-02", "2027-01-04"];
    const base = jours.map((jour) => ecart({ jour }));
    const cas: Array<[string, ReturnType<typeof ecart>[]]> = [
      ["dans la tolérance", base.map((e) => ({ ...e, ecart: -800 }))],
      ["en plus", base.map((e) => ({ ...e, ecart: 1_500 }))],
      ["caisse non validée", base.map((e) => ({ ...e, validee: false }))],
      ["trop anciens", jours.map((_, i) => ecart({ jour: `2026-12-1${i}` }))],
      ["aujourd'hui, jour entamé", jours.map(() => ecart({ jour: AUJOURDHUI }))],
    ];
    for (const [nom, ecarts] of cas) {
      expect(ecartsRepetes(contexteRegles({ ecarts }))).toEqual([]);
      void nom;
    }
  });

  it("l'écart pile à la tolérance n'est pas hors tolérance", () => {
    const ecarts = ["2026-12-29", "2027-01-02", "2027-01-04"].map((jour) =>
      ecart({ jour, ecart: -1_000, tolerance: 1_000 }),
    );
    expect(ecartsRepetes(contexteRegles({ ecarts }))).toEqual([]);
  });

  it("deux agents sont deux constats ; le plus coûteux passe en premier", () => {
    const ecarts = [
      ...["2026-12-29", "2027-01-02", "2027-01-04"].map((jour) => ecart({ jour, ecart: -1_500 })),
      ...["2026-12-28", "2027-01-01", "2027-01-03"].map((jour) =>
        ecart({ jour, agentId: ESSONO.id, gareId: "gare-mvan", ecart: -30_000 }),
      ),
    ];
    const { fuites } = detecter(contexteRegles({ ecarts }));
    expect(fuites.map((f) => f.id)).toEqual([
      "fuite:ecarts:agent-essono",
      "fuite:ecarts:agent-joseph",
    ]);
    expect(fuites[0]!.explication).toMatch(/^Total − 90 000\. Régulier, et ça compte\./);
  });
});

describe("pannes répétées", () => {
  it("deux pannes du même bus en dix jours : un constat chiffré du coût des pannes", () => {
    const [c] = pannesRepetees(
      contexteRegles({
        departs: [
          depart({ jour: "2026-12-29", busId: BUS_207.id, incident: PANNE, coutPanne: 310_000 }),
          depart({ jour: "2027-01-02", busId: BUS_207.id, incident: PANNE, coutPanne: 45_000 }),
        ],
      }),
    );
    expect(c).toMatchObject({
      id: "fuite:pannes:bus-lt207",
      constat: "LT 207 AB : 2 pannes en 10 jours.",
      montantTotal: -355_000,
      joursConcernes: [4, 8],
    });
    expect(c!.explication).toContain("355 000 F");
    expect(c!.sources[0]).toMatchObject({ type: "pannes", nombre: 2 });
  });

  it("une panne seule, ou deux pannes sur deux bus différents, ne sont pas une répétition", () => {
    expect(
      pannesRepetees(
        contexteRegles({
          departs: [
            depart({ jour: "2027-01-02", busId: BUS_207.id, incident: PANNE }),
            depart({ jour: "2027-01-03", busId: BUS_330.id, incident: PANNE }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("deux pannes trop éloignées dans le temps ne comptent pas", () => {
    const departs = [
      depart({ jour: "2026-12-10", busId: BUS_207.id, incident: PANNE }),
      depart({ jour: "2027-01-03", busId: BUS_207.id, incident: PANNE }),
    ];
    expect(pannesRepetees(contexteRegles({ departs }))).toEqual([]);
    expect(busASurveiller(departs, BUS_207.id, AUJOURDHUI)).toBe(false);
  });

  it("un départ annulé ne compte pas, et une panne sans coût connu n'invente pas de montant", () => {
    const [c] = pannesRepetees(
      contexteRegles({
        departs: [
          depart({ jour: "2027-01-01", busId: BUS_207.id, incident: PANNE }),
          depart({ jour: "2027-01-02", busId: BUS_207.id, incident: PANNE }),
          depart({ jour: "2027-01-03", busId: BUS_207.id, incident: PANNE, annule: true }),
        ],
      }),
    );
    expect(c!.montantTotal).toBeNull();
    expect(c!.sources[0]!.nombre).toBe(2);
  });
});

describe("billets de cadence sans nom", () => {
  it("à partir de cinq billets sans numéro dans les dix jours, sur un agent qui n'a pas déjà un constat", () => {
    const ctx = contexteRegles({
      cadence: [
        cadence({ jour: "2027-01-02", sansNom: 3 }),
        cadence({ jour: "2027-01-04", sansNom: CADENCE_SANS_NOM_MINIMUM - 3 }),
      ],
    });
    const [c] = cadenceSansNom(ctx, new Set());
    expect(c).toMatchObject({
      id: "fuite:cadence:agent-joseph",
      montantTotal: null,
      constat: "Joseph d'Akwa : 5 billets vendus sans numéro de téléphone en cadence.",
    });
    expect(c!.actions.map((a) => a.type)).toEqual(["regle_cadence_numero"]);
    expect(cadenceSansNom(ctx, new Set([JOSEPH.id]))).toEqual([]);
  });

  it("quatre billets, c'est un oubli : pas de constat", () => {
    expect(
      cadenceSansNom(
        contexteRegles({ cadence: [cadence({ jour: "2027-01-04", sansNom: 4 })] }),
        new Set(),
      ),
    ).toEqual([]);
  });

  it("un agent déjà cité avec ses écarts n'est pas cité deux fois", () => {
    const { fuites } = detecter(
      contexteRegles({
        ecarts: ["2026-12-29", "2027-01-02", "2027-01-04"].map((jour) => ecart({ jour })),
        cadence: [cadence({ jour: "2027-01-04", sansNom: 11 })],
      }),
    );
    expect(fuites.map((f) => f.regle)).toEqual(["ecarts_repetes_agent"]);
  });
});

function planche(over: { offres?: OffrePublique[]; remplissage10h?: number } = {}) {
  const du = "2026-12-06";
  const departs = genererLigne(DLA_BAF, du, "2027-01-04", [
    { heure: "06:00", remplissage: () => 94 },
    { heure: "08:15", remplissage: () => 88 },
    { heure: "10:00", remplissage: () => over.remplissage10h ?? 55 },
    { heure: "13:00", remplissage: () => 76 },
  ]);
  const offres =
    over.offres ??
    jourParJour(du, "2027-01-04").map((jour) => ({
      compagnie: "Oméga",
      ligneCode: "DLABAF",
      jour,
      heure: "09:30",
      prix: 3_000,
    }));
  return contexteRegles({ departs, offres });
}

describe("concurrent moins cher sur un créneau", () => {
  it("un départ en retrait face à un concurrent moins cher et plus tôt : décaler juste avant lui, simulation à l'appui", () => {
    const [g] = concurrentMoinsCher(planche());
    expect(g).toMatchObject({ regle: "concurrent_moins_cher", periodeJours: 30 });
    expect(g!.actions).toEqual([
      expect.objectContaining({
        type: "decaler_depart",
        libelle: "Décaler le 10:00 à 09:15 dès lundi",
      }),
    ]);
    expect(g!.constat).toBe(
      "Oméga part à 09:30 à 3 000 F, moins cher que ton 10:00 (3 500 F) : ton 10:00 remplit environ 12 voyageurs de moins que tes autres départs. Décale-le à 09:15.",
    );
    expect(g!.simulation).toMatchObject({
      scenarios: [
        { libelle: "aujourd'hui", remplis: 22, capacite: 40 },
        { libelle: "à 09:15", remplis: 33, capacite: 40 },
      ],
    });
    expect(g!.simulation!.gainMensuel).toBe(11 * 3_500 * 30);
    expect(g!.sources.map((s) => s.type)).toEqual(["departs", "offres_publiques"]);
  });

  it("n'agit pas quand le départ remplit autant que les autres", () => {
    expect(concurrentMoinsCher(planche({ remplissage10h: 80 }))).toEqual([]);
  });

  it("n'agit pas quand le concurrent n'est pas moins cher", () => {
    const ctx = planche();
    const offres = ctx.offres.map((o) => ({ ...o, prix: 3_500 }));
    expect(concurrentMoinsCher({ ...ctx, offres })).toEqual([]);
  });

  it("n'agit pas quand le concurrent part après nous : on ne peut pas le devancer", () => {
    const ctx = planche();
    const offres = ctx.offres.map((o) => ({ ...o, heure: "10:20" }));
    expect(concurrentMoinsCher({ ...ctx, offres })).toEqual([]);
  });

  it("n'agit pas sur un concurrent vu seulement quelques jours", () => {
    const ctx = planche();
    expect(concurrentMoinsCher({ ...ctx, offres: ctx.offres.slice(0, 10) })).toEqual([]);
  });

  it("n'agit pas quand l'horaire proposé serait trop près d'un autre départ de la ligne", () => {
    const ctx = planche();
    // Concurrent à 08:40 : 08:25 serait à 10 minutes du 08:15.
    const offres = ctx.offres.map((o) => ({ ...o, heure: "09:00" }));
    const [g] = concurrentMoinsCher({ ...ctx, offres });
    // 08:45 est à 30 minutes du 08:15 : accepté, mais jamais à moins de 30 minutes.
    expect(g?.actions[0]?.libelle ?? "").not.toContain("08:30");
    const serre = ctx.offres.map((o) => ({ ...o, heure: "08:40" }));
    expect(concurrentMoinsCher({ ...ctx, offres: serre })).toEqual([]);
  });

  it("ne nomme pas le concurrent quand la configuration le demande", () => {
    const ctx = { ...planche(), nommerConcurrents: false };
    const [g] = concurrentMoinsCher(ctx);
    expect(JSON.stringify(g)).not.toContain("Oméga");
    expect(g!.constat).toMatch(/^Une autre compagnie part à 09:30/);
  });

  it("cite la moyenne anonyme du réseau quand elle existe sur le créneau", () => {
    const ctx = {
      ...planche(),
      reseau: [
        {
          ligneCode: "DLABAF",
          creneau: "09:00",
          compagnies: 4,
          remplissageMoyenPct: 61,
          jours: 30,
        },
      ],
    };
    const [g] = concurrentMoinsCher(ctx);
    expect(g!.sources.map((s) => s.type)).toContain("reseau_anonyme");
    expect(g!.simulation!.base).toContain("moyenne anonyme de 4 autres compagnies");
  });
});

describe("creux d'un jour", () => {
  /** Mardi à 95 %, mercredi à 30 %, le reste à 80 % : le marché a changé de jour. */
  function creux() {
    return contexteRegles({
      departs: genererLigne(DLA_BAF, "2026-12-06", "2027-01-04", [
        { heure: "07:00", remplissage: (j) => (j === 2 ? 95 : j === 3 ? 30 : 80) },
        { heure: "17:00", remplissage: (j) => (j === 2 ? 97 : j === 3 ? 30 : 80) },
      ]),
    });
  }

  it("le mercredi à 30 % pour 70 % de moyenne : un constat chiffré, avec le départ à ajouter la veille", () => {
    const [c] = creuxDuJour(creux());
    expect(c).toMatchObject({ regle: "creux_jour", periodeJours: 30 });
    expect(c!.constat).toMatch(
      /^Douala → Bafoussam : le mercredi ne remplit qu'à 30 % \(moyenne 7\d %\)\.$/,
    );
    expect(c!.montantTotal).toBeLessThan(0);
    expect(c!.explication).toContain("Le mardi, la même ligne remplit à");
    expect(c!.actions.map((a) => a.libelle)).toEqual([
      "Ajouter un départ mardi 17:00",
      "Voir la ligne en détail",
    ]);
    expect(c!.joursConcernes.every((n) => n >= 1 && n <= 30)).toBe(true);
  });

  it("pas de creux quand tous les jours se ressemblent", () => {
    const ctx = contexteRegles({
      departs: genererLigne(DLA_BAF, "2026-12-06", "2027-01-04", [{ heure: "07:00" }]),
    });
    expect(creuxDuJour(ctx)).toEqual([]);
  });

  it("pas de creux sur moins de trois jours observés", () => {
    const ctx = contexteRegles({
      departs: [
        ...genererLigne(DLA_BAF, "2027-01-01", "2027-01-04", [
          { heure: "07:00", remplissage: (j) => (j === 3 ? 10 : 90) },
        ]),
      ],
    });
    expect(creuxDuJour(ctx)).toEqual([]);
  });

  it("sans veille pleine, seul « Voir la ligne » est proposé", () => {
    const ctx = contexteRegles({
      departs: genererLigne(DLA_BAF, "2026-12-06", "2027-01-04", [
        { heure: "07:00", remplissage: (j) => (j === 3 ? 20 : 80) },
      ]),
    });
    const [c] = creuxDuJour(ctx);
    expect(c!.actions.map((a) => a.type)).toEqual(["voir_ligne"]);
  });

  it("une autre ligne n'influence pas la moyenne", () => {
    const ctx = contexteRegles({
      departs: [
        ...genererLigne(DLA_YDE, "2026-12-06", "2027-01-04", [
          { heure: "07:00", remplissage: () => 99 },
        ]),
        ...genererLigne(DLA_BAF, "2026-12-06", "2027-01-04", [{ heure: "07:00" }]),
      ],
    });
    expect(creuxDuJour(ctx)).toEqual([]);
  });
});

describe("detecter", () => {
  it("sans aucune donnée : rien, et pas d'erreur", () => {
    expect(detecter(contexteRegles())).toEqual({ fuites: [], gains: [] });
  });

  it("chaque constat cite ses sources, et chaque source dit combien d'enregistrements elle a lues", () => {
    const ctx = planche();
    const resultat = detecter({
      ...ctx,
      ecarts: ["2026-12-29", "2027-01-02", "2027-01-04"].map((jour) => ecart({ jour })),
      departs: [
        ...ctx.departs,
        depart({ jour: "2027-01-01", busId: BUS_207.id, incident: PANNE, coutPanne: 1_000 }),
        depart({ jour: "2027-01-02", busId: BUS_207.id, incident: PANNE, coutPanne: 1_000 }),
      ],
    });
    const tous = [...resultat.fuites, ...resultat.gains];
    expect(tous.length).toBeGreaterThanOrEqual(3);
    for (const c of tous) {
      expect(c.sources.length).toBeGreaterThan(0);
      for (const s of c.sources) {
        expect(s.description.length).toBeGreaterThan(0);
        expect(s.nombre).toBeGreaterThan(0);
        expect(s.du <= s.au).toBe(true);
      }
    }
    // Et les fuites les citent aussi dans leur texte (le contrat n'a pas de champ « sources »).
    for (const f of resultat.fuites) expect(f.explication).toContain("Sources : ");
  });

  it("les gains sont classés du plus gros au plus petit", () => {
    const ctx = planche();
    const gains = detecter(ctx).gains.map((g) => g.simulation!.gainMensuel);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });

  it("mêmes faits, mêmes constats", () => {
    const ctx = planche();
    expect(detecter(ctx)).toEqual(detecter(ctx));
  });

  it("le gare citée est celle de l'écart, pas une autre", () => {
    const [c] = ecartsRepetes(
      contexteRegles({
        ecarts: ["2026-12-29", "2027-01-02", "2027-01-04"].map((jour) =>
          ecart({ jour, gareId: AKWA.id, guichet: "Guichet 4" }),
        ),
      }),
    );
    expect(c!.constat.startsWith("Guichet 4 d'Akwa")).toBe(true);
  });
});
