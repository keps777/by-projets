import { randomUUID } from "node:crypto";
import { agence, colis as contrats } from "@afrimove/contrats";
import * as domaine from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import {
  emettreCodeRetrait,
  estCodeRetrait,
  genererCodeRetrait,
  genererSel,
  hacherCodeRetrait,
  poivreCodeRetrait,
  verifierCodeRetrait,
} from "./codes";
import * as regles from "./regles";
import { aammjjDouala, ajouterJours, versIsoDouala } from "./temps";
import {
  lireChangementMode,
  lireColisDecharges,
  lireColisDepose,
  lireColisEnregistre,
  lireDemandeCreation,
  lireDemandeDevis,
  lireEnvoiCode,
  lirePhoto,
  lireReclamation,
} from "./validation";

/**
 * L'API ne peut pas importer le domaine ni les contrats à l'exécution (paquets non compilés, API en
 * CommonJS) : elle en recopie les règles. Ces tests les comparent aux sources, pour qu'une règle
 * modifiée d'un seul côté fasse échouer la CI.
 */

/** Une suite d'instants pseudo-aléatoires mais stable. */
function alea(graine: number): () => number {
  let x = graine;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

describe("parité avec @afrimove/domain : machine d'états", () => {
  it("mêmes états, mêmes actions, même état initial", () => {
    expect([...regles.ETATS_COLIS]).toEqual([...domaine.ETATS_COLIS]);
    expect([...regles.ACTIONS_COLIS]).toEqual([...domaine.ACTIONS_COLIS]);
    expect(regles.ETAT_INITIAL).toBe(domaine.MACHINE_COLIS.initial);
  });

  it("mêmes transitions pour chaque couple (état, action), autorisées ou interdites", () => {
    for (const etat of domaine.ETATS_COLIS) {
      expect(regles.actionsPossibles(etat), etat).toEqual(
        domaine.actionsPossibles(domaine.MACHINE_COLIS, etat),
      );
      for (const action of domaine.ACTIONS_COLIS) {
        const attendu = domaine.peutAppliquer(domaine.MACHINE_COLIS, etat, action);
        expect(regles.peutAppliquer(etat, action), `${etat} + ${action}`).toBe(attendu);
        if (attendu) {
          expect(regles.etatSuivant(etat, action)).toBe(
            domaine.etatSuivant(domaine.MACHINE_COLIS, etat, action),
          );
        } else {
          expect(() => regles.etatSuivant(etat, action)).toThrow(regles.TransitionInterdite);
        }
      }
    }
  });
});

describe("parité avec @afrimove/domain : tarifs", () => {
  it("mêmes tarifs", () => {
    expect(regles.TARIFS.fraisColisApp).toBe(domaine.TARIFS.fraisColisApp);
    expect(regles.TARIFS.fraisAgenceColis).toBe(domaine.TARIFS.fraisAgenceColis);
    expect(regles.TARIFS.assurance).toEqual(domaine.TARIFS.assurance);
    expect(regles.TARIFS.relais).toEqual(domaine.TARIFS.relais);
    expect(regles.TARIFS.livraison).toEqual(domaine.TARIFS.livraison);
  });

  it("même prime d'assurance, du minimum de 500 F au plafond de 500 000 F", () => {
    for (const valeur of [
      1, 100, 24_999, 25_000, 25_001, 99_999, 250_000, 500_000, 500_001, 2_000_000,
    ]) {
      expect(regles.primeAssurance(valeur), String(valeur)).toEqual(domaine.primeAssurance(valeur));
    }
    expect(() => regles.primeAssurance(0)).toThrow(RangeError);
    expect(() => domaine.primeAssurance(0)).toThrow(RangeError);
  });

  it("même devis pour toutes les combinaisons de canal, de mode, d'assurance et de livraison", () => {
    for (const canal of ["agence", "app"] as const) {
      for (const mode of ["gare", "relais", "moto"] as const) {
        for (const valeurAssuree of [undefined, 0, 1000, 25_000, 600_000]) {
          for (const prixLivraison of [undefined, 1000, 2500]) {
            const p = {
              port: 1500,
              canal,
              mode,
              ...(valeurAssuree !== undefined ? { valeurAssuree } : {}),
              ...(prixLivraison !== undefined ? { prixLivraison } : {}),
            };
            expect(regles.devisColis(p), JSON.stringify(p)).toEqual(domaine.devisColis(p));
          }
        }
      }
    }
    expect(() =>
      regles.devisColis({ port: 1500, canal: "app", mode: "moto", prixLivraison: 999 }),
    ).toThrow(RangeError);
    expect(() =>
      domaine.devisColis({ port: 1500, canal: "app", mode: "moto", prixLivraison: 999 }),
    ).toThrow(RangeError);
    expect(() => regles.devisColis({ port: -1, canal: "app", mode: "gare" })).toThrow(RangeError);
  });

  it("même répartition du relais et de la livraison", () => {
    expect(regles.repartitionRelais()).toEqual(domaine.repartitionRelais());
    for (const prix of [1000, 1234, 1500, 2500, 9999]) {
      expect(regles.repartitionLivraison(prix), String(prix)).toEqual(
        domaine.repartitionLivraison(prix),
      );
    }
  });

  it("même supplément selon le mode de retrait", () => {
    expect(regles.supplementMode("gare")).toBe(0);
    expect(regles.supplementMode("relais")).toBe(domaine.TARIFS.relais.supplement);
    expect(regles.supplementMode("moto")).toBe(
      domaine.devisColis({ port: 0, canal: "agence", mode: "moto" }).total,
    );
    expect(regles.supplementMode("moto", 2500)).toBe(
      domaine.devisColis({ port: 0, canal: "agence", mode: "moto", prixLivraison: 2500 }).total,
    );
  });
});

describe("parité avec @afrimove/domain : garde, numérotation, temps", () => {
  it("garde de 7 jours et date limite de retrait", () => {
    expect(regles.GARDE_COLIS_JOURS).toBe(domaine.GARDE_COLIS_JOURS);
    for (const debut of [
      "2026-11-02T09:00:00.000+01:00",
      "2026-12-28T23:59:00.000+01:00",
      "2028-02-25T00:00:00Z",
    ]) {
      expect(regles.limiteRetraitColis(debut)).toBe(domaine.limiteRetraitColis(debut));
      for (const decalage of [0, 6.9, 7, 7.0001, 30]) {
        const maintenant = new Date(new Date(debut).getTime() + decalage * 86_400_000);
        expect(regles.colisNonRetire(debut, maintenant), `${debut} +${decalage} j`).toBe(
          domaine.colisNonRetire(debut, maintenant),
        );
      }
    }
  });

  it("plage des colis de l'app", () => {
    expect(regles.PLAGE_EN_LIGNE).toEqual(domaine.PLAGE_EN_LIGNE);
  });

  it("numéro de colis : C-GARE-AAMMJJ-NNNN", () => {
    for (const [gare, at, sequence] of [
      ["DLA", "2026-11-02T09:00:00.000+01:00", 1],
      ["BAF", "2026-12-31T23:59:59.000+01:00", 4001],
      ["YDE", "2027-01-01T00:00:00.000+01:00", 9999],
    ] as const) {
      expect(`C-${gare}-${aammjjDouala(at)}-${String(sequence).padStart(4, "0")}`).toBe(
        domaine.numeroColis({ gare, at, sequence }),
      );
    }
  });

  it("heures de Douala", () => {
    const tirage = alea(7);
    for (let i = 0; i < 200; i += 1) {
      const instant = new Date(Date.UTC(2026, 0, 1) + Math.floor(tirage() * 900 * 86_400_000));
      expect(versIsoDouala(instant)).toBe(domaine.versIsoDouala(instant));
      expect(aammjjDouala(instant)).toBe(domaine.aammjjDouala(instant));
      const jours = Math.floor(tirage() * 100) - 10;
      expect(ajouterJours(instant, jours)).toBe(domaine.ajouterJours(instant, jours));
    }
  });
});

describe("parité avec @afrimove/domain : code de retrait", () => {
  it("même tirage du code et du sel pour la même source d'aléa", () => {
    for (const graine of [1, 2, 3, 99]) {
      expect(genererCodeRetrait(alea(graine))).toBe(domaine.genererCodeRetrait(alea(graine)));
      expect(genererSel(alea(graine))).toBe(domaine.genererSel(alea(graine)));
    }
    expect(estCodeRetrait("482913")).toBe(domaine.estCodeRetrait("482913"));
    for (const faux of ["48291", "4829133", "48291a", "", " 482913"]) {
      expect(estCodeRetrait(faux), faux).toBe(domaine.estCodeRetrait(faux));
    }
  });

  it("même haché, avec ou sans poivre, et même émission", async () => {
    for (const poivre of ["", "poivre-du-serveur"]) {
      const interne = emettreCodeRetrait(poivre, alea(5));
      const source = await domaine.emettreCodeRetrait(alea(5), poivre);
      expect(interne).toEqual(source);
      expect(hacherCodeRetrait(source.code, source.sel, poivre)).toBe(source.hache);
      expect(verifierCodeRetrait(source.code, source.hache, source.sel, poivre)).toBe(true);
      expect(await domaine.verifierCodeRetrait(source.code, source.hache, source.sel, poivre)).toBe(
        true,
      );
      const faux = source.code === "000000" ? "000001" : "000000";
      expect(verifierCodeRetrait(faux, source.hache, source.sel, poivre)).toBe(false);
      expect(verifierCodeRetrait(source.code, source.hache, source.sel, `${poivre}x`)).toBe(false);
    }
  });

  it("dérive un poivre stable et distinct du secret du serveur", () => {
    const secret = Buffer.from("secret-du-serveur-qui-fait-32-octets");
    expect(poivreCodeRetrait(secret)).toBe(poivreCodeRetrait(secret));
    expect(poivreCodeRetrait(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(poivreCodeRetrait(secret)).not.toBe(poivreCodeRetrait(Buffer.from("autre-secret")));
  });
});

describe("parité avec @afrimove/contrats : listes de valeurs", () => {
  it("motifs de réclamation et modes de retrait", () => {
    expect([...regles.MOTIFS_RECLAMATION]).toEqual([...contrats.MOTIFS_RECLAMATION]);
    expect([...regles.MOTIFS_RECLAMATION]).toEqual([
      ...contrats.SchemaDemandeReclamation.shape.motif.options,
    ]);
  });
});

/* -------------------------------------------------------------------------------------------- */

/** Valeurs qu'on glisse à la place de chaque champ d'une demande valide. */
const INTRUS: readonly unknown[] = [
  null,
  "",
  " ",
  "x",
  "+237691221008",
  "+23769",
  "2026-11-02T09:05:00.000+01:00",
  "2026-11-02T09:05:00Z",
  "482913",
  "00000000-0000-4000-8000-0000000000c1",
  0,
  -1,
  1,
  1.5,
  2,
  1e9,
  true,
  false,
  [],
  ["a"],
  {},
  "x".repeat(1001),
];

function chemins(valeur: unknown, base: (string | number)[] = []): (string | number)[][] {
  if (valeur === null || typeof valeur !== "object") return [base];
  const sous = Object.entries(valeur).flatMap(([cle, v]) => chemins(v, [...base, cle]));
  return [base, ...sous];
}

function remplacer(
  base: unknown,
  chemin: (string | number)[],
  valeur: unknown,
  supprimer: boolean,
): unknown {
  const copie = structuredClone(base) as Record<string, unknown>;
  if (chemin.length === 0) return valeur;
  let courant = copie;
  for (const cle of chemin.slice(0, -1)) courant = courant[cle] as Record<string, unknown>;
  const dernier = chemin[chemin.length - 1]!;
  if (supprimer && Array.isArray(courant)) (courant as unknown[]).splice(Number(dernier), 1);
  else if (supprimer) delete courant[dernier];
  else courant[dernier] = valeur;
  return copie;
}

/**
 * Compare le verdict (accepté / refusé) du lecteur écrit à la main et celui du schéma zod, sur la
 * demande valide, puis sur chaque champ supprimé ou remplacé par des valeurs hostiles.
 */
function memeVerdict(
  nom: string,
  base: unknown,
  zod: { safeParse(v: unknown): { success: boolean } },
  lecteur: (v: unknown) => unknown,
  ecartVoulu: (chemin: string, intrus: unknown) => boolean = () => false,
): void {
  const accepte = (v: unknown): boolean => {
    try {
      lecteur(v);
      return true;
    } catch {
      return false;
    }
  };
  expect(zod.safeParse(base).success, `${nom} : la base doit être valide pour zod`).toBe(true);
  expect(accepte(base), `${nom} : la base doit être valide pour le lecteur`).toBe(true);

  const ecarts: string[] = [];
  let compares = 0;
  for (const chemin of chemins(base)) {
    const cas: [unknown, boolean][] = [
      [undefined, true],
      ...INTRUS.map((v): [unknown, boolean] => [v, false]),
    ];
    for (const [intrus, supprimer] of cas) {
      const candidat = remplacer(base, chemin, intrus, supprimer);
      const attendu = zod.safeParse(candidat).success;
      const obtenu = accepte(candidat);
      compares += 1;
      if (attendu !== obtenu) {
        const nomChemin = chemin.join(".") || "(racine)";
        if (ecartVoulu(nomChemin, supprimer ? undefined : intrus)) continue;
        const valeur = supprimer ? "(absent)" : (JSON.stringify(intrus) ?? "").slice(0, 40);
        ecarts.push(
          `${nomChemin} = ${valeur} : zod ${attendu ? "accepte" : "refuse"}, lecteur ${obtenu ? "accepte" : "refuse"}`,
        );
      }
    }
  }
  expect(compares).toBeGreaterThan(20);
  expect(ecarts, `${nom} : verdicts différents`).toEqual([]);
}

const TEL = "+237699401822";

/**
 * Écart voulu : le contrat accepte n'importe quel texte pour `colisId`, le lecteur exige un UUID (le
 * colis et son événement sont créés par l'appareil avec un UUID ; le journal des événements et la
 * colonne `id` de la table ne prennent que cela). Dans tous les autres cas, les verdicts sont égaux.
 */
const ecartIdentifiantUuid = (chemin: string, intrus: unknown): boolean =>
  chemin === "donnees.colisId" &&
  typeof intrus === "string" &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intrus);

describe("parité avec @afrimove/contrats : les lecteurs écrits à la main disent comme zod", () => {
  it("création d'un colis (SchemaDemandeCreationColis)", () => {
    memeVerdict(
      "création",
      {
        departId: "dep-alp-dlabaf-261102-1000",
        photoRef: "photos/colis-1.jpg",
        destinataire: { nom: "Ngo Thérèse", telephone: TEL },
        contenu: "Médicaments",
        poidsKg: 2,
        valeurDeclaree: 25000,
        assurer: true,
        mode: "gare",
        paiement: { moyen: "mtn_momo", numero: TEL },
      },
      contrats.SchemaDemandeCreationColis,
      lireDemandeCreation,
    );
  });

  it("création en mode relais avec adresse et sans numéro de paiement", () => {
    memeVerdict(
      "création relais",
      {
        departId: "d1",
        photoRef: "p",
        destinataire: { nom: "A", telephone: TEL },
        contenu: "c",
        poidsKg: 0.5,
        valeurDeclaree: 0,
        assurer: false,
        mode: "relais",
        relaisId: "relais-1",
        adresseLivraison: "Quartier Tamdja",
        paiement: { moyen: "carte" },
      },
      contrats.SchemaDemandeCreationColis,
      lireDemandeCreation,
    );
  });

  // Le colis visé est dans l'adresse (`/colis/:colisId/…`), pas dans le corps : on compare le reste.
  it("photo, envoi du code, réclamation et changement de mode", () => {
    memeVerdict("photo", { photoRef: "photos/1.jpg" }, contrats.SchemaDemandePhoto, lirePhoto);
    memeVerdict(
      "envoi du code",
      { canal: "whatsapp" },
      contrats.SchemaEnvoiCodeColis.omit({ colisId: true }),
      lireEnvoiCode,
      // Écart voulu : sans corps du tout, le code part par SMS (canal par défaut du contrat).
      (chemin, intrus) => chemin === "(racine)" && (intrus === undefined || intrus === null),
    );
    memeVerdict(
      "réclamation",
      { motif: "retard", message: "Il devait arriver hier" },
      contrats.SchemaDemandeReclamation.omit({ colisId: true }),
      lireReclamation,
    );
    memeVerdict(
      "changement de mode",
      { mode: "relais", relaisId: "relais-1", adresse: "Tamdja" },
      contrats.SchemaChangementMode.omit({ colisId: true }),
      lireChangementMode,
    );
  });

  it("devis (paramètres de requête lus comme du texte)", () => {
    const zod = contrats.SchemaDemandeDevisColis;
    for (const requete of [
      { departId: "d1", mode: "gare", valeurAssuree: "25000" },
      { departId: "d1", mode: "moto", valeurAssuree: "0", prixLivraison: "1500" },
      { departId: "d1", mode: "avion", valeurAssuree: "0" },
      { departId: "d1", mode: "gare", valeurAssuree: "abc" },
      { departId: "d1", mode: "gare", valeurAssuree: "-5" },
      { departId: "d1", mode: "gare" },
      { mode: "gare", valeurAssuree: "10" },
    ]) {
      const attendu = zod.safeParse({
        ...requete,
        valeurAssuree:
          requete.valeurAssuree === undefined ? undefined : Number(requete.valeurAssuree),
        ...("prixLivraison" in requete ? { prixLivraison: Number(requete.prixLivraison) } : {}),
      }).success;
      let obtenu = true;
      try {
        lireDemandeDevis(requete);
      } catch {
        obtenu = false;
      }
      expect(obtenu, JSON.stringify(requete)).toBe(attendu);
    }
  });

  it("événement « colis.enregistre » (EVENEMENT_COLIS_ENREGISTRE)", () => {
    const colisId = randomUUID();
    memeVerdict(
      "colis.enregistre",
      {
        id: randomUUID(),
        type: "colis.enregistre",
        at: "2026-11-02T09:05:00.000+01:00",
        appareilId: "appareil-guichet-2",
        auteurId: randomUUID(),
        cible: { type: "colis", id: colisId },
        numeroPlage: 1001,
        donnees: {
          colisId,
          departId: "dep-alp-dlabaf-261102-1000",
          expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
          destinataire: { nom: "Ngo Thérèse", telephone: TEL },
          contenu: "Médicaments",
          poidsKg: 2,
          valeurDeclaree: 25000,
          assure: true,
          photoRef: "photos/guichet-1.jpg",
          paiement: { mode: "cash", montant: 2000 },
        },
      },
      agence.EVENEMENT_COLIS_ENREGISTRE.schema,
      lireColisEnregistre,
      ecartIdentifiantUuid,
    );
  });

  it("événement « colis.depose » (EVENEMENT_COLIS_DEPOSE)", () => {
    const colisId = randomUUID();
    memeVerdict(
      "colis.depose",
      {
        id: randomUUID(),
        type: "colis.depose",
        at: "2026-11-02T09:10:00.000+01:00",
        appareilId: "appareil-guichet-2",
        auteurId: randomUUID(),
        cible: { type: "colis", id: colisId },
        numeroPlage: null,
        donnees: { colisId, poidsReleveKg: 2.1, photoRef: "photos/depot-1.jpg", complement: 0 },
      },
      agence.EVENEMENT_COLIS_DEPOSE.schema,
      lireColisDepose,
    );
  });

  it("événement « route.colis_decharges » (EVENEMENT_ROUTE_COLIS_DECHARGES)", () => {
    memeVerdict(
      "route.colis_decharges",
      {
        id: randomUUID(),
        type: "route.colis_decharges",
        at: "2026-11-02T14:30:00.000+01:00",
        appareilId: "appareil-convoyeur-1",
        auteurId: randomUUID(),
        cible: { type: "depart", id: "dep-alp-dlabaf-261102-1000" },
        numeroPlage: null,
        donnees: {
          departId: "dep-alp-dlabaf-261102-1000",
          arret: "Bafoussam",
          colisIds: [randomUUID()],
        },
      },
      agence.EVENEMENT_ROUTE_COLIS_DECHARGES.schema,
      lireColisDecharges,
    );
  });
});
