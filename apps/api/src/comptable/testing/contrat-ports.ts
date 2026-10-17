import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IDS_EXPORT,
  type Cloture,
  type DecisionRapprochement,
  type EnvoiCabinet,
  type FichierFige,
  type FichierGenere,
  type IdExport,
  type LigneReleve,
  type ParametresComptables,
} from "../modele";
import type {
  Clotures,
  DecisionsRapprochement,
  EnvoisCabinet,
  FacturesPayees,
  FichiersApercus,
  ParametresRepository,
  RelevesOperateur,
} from "../ports";

/**
 * Contrat des ports d'écriture du module comptable (réglages, clôtures, décisions, aperçus, envois) et
 * des deux ports alimentés par d'autres modules (relevés des opérateurs, factures payées) : les mêmes
 * tests s'exécutent sur les adaptateurs en mémoire et sur les adaptateurs PostgreSQL. Un comportement
 * que la mémoire a et que la base n'a pas (ou l'inverse) fait échouer l'un des deux.
 */

export interface BancComptable {
  parametres: ParametresRepository;
  clotures: Clotures;
  decisions: DecisionsRapprochement;
  apercus: FichiersApercus;
  envois: EnvoisCabinet;
  releves: RelevesOperateur;
  factures: FacturesPayees;
  /** Écrit des réglages (sur PostgreSQL : chiffre l'adresse du cabinet). */
  definirParametres(p: ParametresComptables): Promise<void>;
  /** Importe des lignes de relevé pour la compagnie. */
  importerReleves(compagnieId: string, lignes: readonly LigneReleve[]): Promise<void>;
  /** La facture de la semaine qui finit ce dimanche est payée ce jour-là. */
  payerFacture(compagnieId: string, dimanche: string, jour: string): Promise<void>;
  /** Une compagnie neuve (sur PostgreSQL : une ligne qui existe). */
  nouvelleCompagnie(): Promise<string>;
  fermer(): Promise<void>;
}

export const iso = (jour: string, heure = "12:00:00"): string => `${jour}T${heure}.000+01:00`;

/** Un fichier figé au contenu déterministe (l'empreinte est celle du contenu : 64 chiffres hexadécimaux). */
export function unFichier(id: IdExport, mois: string, octets = 40): FichierFige {
  const contenu = Buffer.alloc(octets, id.length);
  const format = id === "factures_afrimove" ? "PDF" : id === "ecritures_syscohada" ? "CSV" : "XLSX";
  return {
    id,
    format,
    nom: `${id} · ${mois}`,
    nomFichier: `${id}-${mois}.${format.toLowerCase()}`,
    typeMime: "application/octet-stream",
    contenu,
    empreinte: createHash("sha256").update(contenu).update(id).digest("hex"),
    genereA: iso(`${mois}-28`, "18:00:00"),
    colonnes: 12,
    lignes: format === "PDF" ? null : 7,
    pages: format === "PDF" ? 3 : null,
    tableauGz: Buffer.from([0x1f, 0x8b, 8, 0, 1, 2, 3, 4, ...Buffer.from(id)]),
  };
}

export function uneCloture(
  compagnieId: string,
  mois: string,
  surcharge: Partial<Cloture> = {},
): Cloture {
  return {
    compagnieId,
    mois,
    clotureA: iso(`${mois}-28`, "19:00:00"),
    parId: randomUUID(),
    parNom: "Marie Ngo Bayiha",
    journalId: randomUUID(),
    encaisse: { total: 1_250_000, cash: 700_000, momo: 500_000, carte: 50_000, ecart: -16_000 },
    rapprochement: {
      tauxRapprochePct: 96.8,
      ventesMobile: { nombre: 120, montant: 500_000 },
      recuMarchand: 516_000,
      sansCorrespondance: { transactions: 0, montant: 0 },
    },
    lignes: [],
    exports: IDS_EXPORT.map((id) => ({
      id,
      nom: id,
      description: `Export ${id}`,
      lignes: 7,
      statut: "disponible" as const,
      format: "XLSX" as const,
      tailleOctets: 40,
      pages: null,
    })),
    apercuJournal: ["numero;date;montant", "ALP-DLA-261201-0001;2026-12-01;8000"],
    destinataire: "cabinet.mbarga@exemple.cm",
    envoiDemande: false,
    envoiRecuA: null,
    fichiers: IDS_EXPORT.map((id) => unFichier(id, mois)),
    ...surcharge,
  };
}

export function uneDecision(
  compagnieId: string,
  mois: string,
  surcharge: Partial<DecisionRapprochement> = {},
): DecisionRapprochement {
  return {
    compagnieId,
    mois,
    reference: `MP${mois.replace("-", "").slice(2)}.1142.${randomUUID().slice(0, 6).toUpperCase()}`,
    action: "rembourser",
    cible: null,
    montant: 5_000,
    operateur: "mtn",
    telephoneMasque: "+237 6•• •• •• 41",
    cause: "doublon_paiement",
    explication: "Même montant payé deux fois à 11 h 42.",
    decideA: iso(`${mois}-20`, "10:00:00"),
    parId: randomUUID(),
    parNom: "Patron Alpha",
    journalId: randomUUID(),
    methode: "pin",
    execution: "en_attente",
    referenceExecution: null,
    ...surcharge,
  };
}

export function uneLigneReleve(surcharge: Partial<LigneReleve> = {}): LigneReleve {
  return {
    reference: `MP261201.0800.${randomUUID().slice(0, 6).toUpperCase()}`,
    recueA: iso("2026-12-01", "08:00:00"),
    telephone: "+237677123441",
    operateur: "mtn",
    montant: 5_000,
    ...surcharge,
  };
}

export function unEnvoi(
  compagnieId: string,
  mois: string,
  surcharge: Partial<EnvoiCabinet> = {},
): EnvoiCabinet {
  return {
    cle: `auto:${compagnieId}:${mois}:${randomUUID().slice(0, 4)}`,
    compagnieId,
    mois,
    nature: "automatique",
    definitif: false,
    destinataire: "cabinet.mbarga@exemple.cm",
    envoyeA: iso(`${mois}-02`, "08:00:00"),
    recuA: null,
    ...surcharge,
  };
}

export function unApercu(id: IdExport, mois: string, surcharge: Partial<FichierGenere> = {}) {
  const { tableauGz: _ignore, ...fichier } = unFichier(id, mois);
  void _ignore;
  return { ...fichier, ...surcharge } satisfies FichierGenere;
}

export function contratPortsComptable(nom: string, creer: () => Promise<BancComptable>): void {
  describe(nom, () => {
    let banc: BancComptable;
    beforeAll(async () => {
      banc = await creer();
    }, 120_000);
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("réglages", () => {
      it("rend null pour une compagnie sans réglages, puis ce qui a été défini, adresse du cabinet comprise", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        expect(await banc.parametres.lire(compagnieId)).toBeNull();
        const p: ParametresComptables = {
          compagnieId,
          nomAgence: "Alpha Voyages",
          emailCabinet: "cabinet.mbarga@exemple.cm",
          envoiAutomatique: true,
          jourDEnvoi: 3,
          jourDeCloture: 6,
        };
        await banc.definirParametres(p);
        expect(await banc.parametres.lire(compagnieId)).toEqual(p);
        expect((await banc.parametres.toutes()).find((x) => x.compagnieId === compagnieId)).toEqual(
          p,
        );
        // Sans cabinet : l'adresse reste nulle.
        await banc.definirParametres({ ...p, emailCabinet: null, envoiAutomatique: false });
        expect((await banc.parametres.lire(compagnieId))?.emailCabinet).toBeNull();
      });
    });

    describe("clôtures", () => {
      it("une clôture se retrouve telle quelle, avec ses cinq fichiers dans l'ordre des exports", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const c = uneCloture(compagnieId, "2026-12");
        expect(await banc.clotures.trouver(compagnieId, "2026-12")).toBeNull();
        expect(await banc.clotures.existe(compagnieId, "2026-12")).toBe(false);
        expect(await banc.clotures.verrouiller(c)).toBe(true);
        expect(await banc.clotures.existe(compagnieId, "2026-12")).toBe(true);
        expect(await banc.clotures.existe(compagnieId, "2026-11")).toBe(false);
        const lue = (await banc.clotures.trouver(compagnieId, "2026-12"))!;
        expect(lue).toEqual(c);
        expect(lue.fichiers.map((f) => f.id)).toEqual([...IDS_EXPORT]);
        expect(Buffer.compare(lue.fichiers[0]!.contenu, c.fichiers[0]!.contenu)).toBe(0);
        expect(Buffer.compare(lue.fichiers[0]!.tableauGz, c.fichiers[0]!.tableauGz)).toBe(0);
      });

      it("un mois ne se clôture qu'une fois : la deuxième clôture est refusée et la première reste", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const premiere = uneCloture(compagnieId, "2026-12");
        expect(await banc.clotures.verrouiller(premiere)).toBe(true);
        const seconde = uneCloture(compagnieId, "2026-12", { parNom: "Quelqu'un d'autre" });
        expect(await banc.clotures.verrouiller(seconde)).toBe(false);
        expect((await banc.clotures.trouver(compagnieId, "2026-12"))?.parNom).toBe(
          "Marie Ngo Bayiha",
        );
      });

      it("dix clôtures simultanées du même mois : une seule gagne", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const reponses = await Promise.all(
          Array.from({ length: 10 }, () =>
            banc.clotures.verrouiller(uneCloture(compagnieId, "2027-01")),
          ),
        );
        expect(reponses.filter(Boolean)).toHaveLength(1);
        expect(await banc.clotures.mois(compagnieId)).toEqual(["2027-01"]);
      });

      it("liste les mois clôturés du plus récent au plus ancien, sans mélanger les compagnies", async () => {
        const a = await banc.nouvelleCompagnie();
        const b = await banc.nouvelleCompagnie();
        for (const mois of ["2026-10", "2026-12", "2026-11"]) {
          await banc.clotures.verrouiller(uneCloture(a, mois));
        }
        await banc.clotures.verrouiller(uneCloture(b, "2026-09"));
        expect(await banc.clotures.mois(a)).toEqual(["2026-12", "2026-11", "2026-10"]);
        expect(await banc.clotures.mois(b)).toEqual(["2026-09"]);
        expect(await banc.clotures.trouver(b, "2026-12")).toBeNull();
      });

      it("l'accusé de réception du cabinet s'écrit une seule fois et la clôture sort des envois en attente", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        await banc.clotures.verrouiller(uneCloture(compagnieId, "2026-12", { envoiDemande: true }));
        await banc.clotures.verrouiller(
          uneCloture(compagnieId, "2026-11", { envoiDemande: false }),
        );
        const attente = () =>
          banc.clotures
            .envoisEnAttente(1000)
            .then((l) => l.filter((c) => c.compagnieId === compagnieId).map((c) => c.mois));
        expect(await attente()).toEqual(["2026-12"]);
        await banc.clotures.marquerRecu(compagnieId, "2026-12", iso("2027-01-06", "09:00:00"));
        await banc.clotures.marquerRecu(compagnieId, "2026-12", iso("2027-01-07", "09:00:00"));
        expect((await banc.clotures.trouver(compagnieId, "2026-12"))?.envoiRecuA).toBe(
          iso("2027-01-06", "09:00:00"),
        );
        expect(await attente()).toEqual([]);
      });

      it("les envois en attente sortent par ordre de clôture, dans la limite demandée", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        await banc.clotures.verrouiller(
          uneCloture(compagnieId, "2026-12", { envoiDemande: true, clotureA: iso("2027-01-05") }),
        );
        await banc.clotures.verrouiller(
          uneCloture(compagnieId, "2026-10", { envoiDemande: true, clotureA: iso("2026-11-05") }),
        );
        await banc.clotures.verrouiller(
          uneCloture(compagnieId, "2026-11", { envoiDemande: true, clotureA: iso("2026-12-05") }),
        );
        const tous = (await banc.clotures.envoisEnAttente(10_000)).filter(
          (c) => c.compagnieId === compagnieId,
        );
        expect(tous.map((c) => c.mois)).toEqual(["2026-10", "2026-11", "2026-12"]);
        expect(await banc.clotures.envoisEnAttente(1)).toHaveLength(1);
      });
    });

    describe("décisions du rapprochement", () => {
      it("enregistre une décision, la retrouve telle quelle, et la liste par heure de décision", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const tard = uneDecision(compagnieId, "2026-12", {
          decideA: iso("2026-12-22", "10:00:00"),
        });
        const tot = uneDecision(compagnieId, "2026-12", {
          decideA: iso("2026-12-21", "10:00:00"),
          action: "rattacher",
          cible: "C-ALP-DLA-261217-0141",
          cause: "scan_depot_manquant",
        });
        expect((await banc.decisions.enregistrer(tard)).resultat).toBe("ok");
        expect((await banc.decisions.enregistrer(tot)).resultat).toBe("ok");
        expect(await banc.decisions.trouver(compagnieId, "2026-12", tot.reference)).toEqual(tot);
        expect(await banc.decisions.lister(compagnieId, "2026-12")).toEqual([tot, tard]);
        expect(await banc.decisions.lister(compagnieId, "2026-11")).toEqual([]);
        expect(await banc.decisions.trouver(compagnieId, "2026-12", "inconnue")).toBeNull();
      });

      it("une décision est définitive : la deuxième sur la même référence rend la première", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const d = uneDecision(compagnieId, "2026-12");
        await banc.decisions.enregistrer(d);
        const autre = { ...d, action: "demander" as const, parNom: "Autre patron" };
        const r = await banc.decisions.enregistrer(autre);
        expect(r).toEqual({ resultat: "existe", existante: d });
        expect(await banc.decisions.lister(compagnieId, "2026-12")).toEqual([d]);
      });

      it("dix décisions simultanées sur la même référence : une seule entre", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const d = uneDecision(compagnieId, "2026-12");
        const reponses = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            banc.decisions.enregistrer({ ...d, parNom: `Patron ${i}` }),
          ),
        );
        expect(reponses.filter((r) => r.resultat === "ok")).toHaveLength(1);
        expect(reponses.filter((r) => r.resultat === "existe")).toHaveLength(9);
        expect(await banc.decisions.lister(compagnieId, "2026-12")).toHaveLength(1);
      });

      it("un mois clôturé refuse toute décision", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        await banc.clotures.verrouiller(uneCloture(compagnieId, "2026-12"));
        const r = await banc.decisions.enregistrer(uneDecision(compagnieId, "2026-12"));
        expect(r).toEqual({ resultat: "mois_verrouille" });
        expect(await banc.decisions.lister(compagnieId, "2026-12")).toEqual([]);
        // Le mois suivant reste ouvert.
        expect(
          (await banc.decisions.enregistrer(uneDecision(compagnieId, "2027-01"))).resultat,
        ).toBe("ok");
      });

      it("confirmer passe l'exécution à « faite » une seule fois", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const d = uneDecision(compagnieId, "2026-12");
        await banc.decisions.enregistrer(d);
        await banc.decisions.confirmer(compagnieId, "2026-12", d.reference, "REMBOURSE-1");
        await banc.decisions.confirmer(compagnieId, "2026-12", d.reference, "REMBOURSE-2");
        expect(await banc.decisions.trouver(compagnieId, "2026-12", d.reference)).toEqual({
          ...d,
          execution: "faite",
          referenceExecution: "REMBOURSE-1",
        });
      });

      it("retirer n'efface qu'une décision encore en attente", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const attente = uneDecision(compagnieId, "2026-12");
        const faite = uneDecision(compagnieId, "2026-12");
        await banc.decisions.enregistrer(attente);
        await banc.decisions.enregistrer(faite);
        await banc.decisions.confirmer(compagnieId, "2026-12", faite.reference, "OP-1");
        await banc.decisions.retirer(compagnieId, "2026-12", attente.reference);
        await banc.decisions.retirer(compagnieId, "2026-12", faite.reference);
        expect(await banc.decisions.trouver(compagnieId, "2026-12", attente.reference)).toBeNull();
        expect(
          (await banc.decisions.trouver(compagnieId, "2026-12", faite.reference))?.execution,
        ).toBe("faite");
      });

      it("les décisions en attente sortent des plus anciennes aux plus récentes, sans les exécutées", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const decisions = [3, 1, 2].map((jour) =>
          uneDecision(compagnieId, "2026-12", { decideA: iso(`2026-12-0${jour}`) }),
        );
        for (const d of decisions) await banc.decisions.enregistrer(d);
        await banc.decisions.confirmer(compagnieId, "2026-12", decisions[1]!.reference, "OP-1");
        const attente = (await banc.decisions.enAttente(10_000)).filter(
          (d) => d.compagnieId === compagnieId,
        );
        expect(attente.map((d) => d.decideA)).toEqual([iso("2026-12-02"), iso("2026-12-03")]);
        expect(await banc.decisions.enAttente(1)).toHaveLength(1);
      });
    });

    describe("aperçus de fichiers", () => {
      it("le dernier aperçu mémorisé est celui que le téléchargement retrouve", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        expect(await banc.apercus.dernier(compagnieId, "2026-12", "journal_ventes")).toBeNull();
        const premier = unApercu("journal_ventes", "2026-12");
        await banc.apercus.memoriser(compagnieId, "2026-12", premier);
        expect(await banc.apercus.dernier(compagnieId, "2026-12", "journal_ventes")).toEqual(
          premier,
        );
        const second = unApercu("journal_ventes", "2026-12", {
          contenu: Buffer.from("autre contenu"),
          empreinte: "a".repeat(64),
          genereA: iso("2027-01-05", "09:30:00"),
        });
        await banc.apercus.memoriser(compagnieId, "2026-12", second);
        expect(await banc.apercus.dernier(compagnieId, "2026-12", "journal_ventes")).toEqual(
          second,
        );
      });

      it("un aperçu est propre à son mois, à son export et à sa compagnie", async () => {
        const a = await banc.nouvelleCompagnie();
        const b = await banc.nouvelleCompagnie();
        await banc.apercus.memoriser(a, "2026-12", unApercu("journal_caisse", "2026-12"));
        expect(await banc.apercus.dernier(a, "2026-11", "journal_caisse")).toBeNull();
        expect(await banc.apercus.dernier(a, "2026-12", "journal_ventes")).toBeNull();
        expect(await banc.apercus.dernier(b, "2026-12", "journal_caisse")).toBeNull();
      });
    });

    describe("envois au cabinet", () => {
      it("un envoi ne s'enregistre qu'une fois par clé", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const e = unEnvoi(compagnieId, "2026-12");
        expect(await banc.envois.enregistrer(e)).toBe(true);
        expect(await banc.envois.enregistrer({ ...e, destinataire: "autre@exemple.cm" })).toBe(
          false,
        );
        expect(await banc.envois.trouver(e.cle)).toEqual(e);
        expect(await banc.envois.trouver("inconnue")).toBeNull();
      });

      it("dix enregistrements simultanés de la même clé : un seul passe", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const e = unEnvoi(compagnieId, "2026-12");
        const reponses = await Promise.all(
          Array.from({ length: 10 }, () => banc.envois.enregistrer(e)),
        );
        expect(reponses.filter(Boolean)).toHaveLength(1);
      });

      it("les derniers envois sortent du plus récent au plus ancien, limités, propres à la compagnie", async () => {
        const a = await banc.nouvelleCompagnie();
        const b = await banc.nouvelleCompagnie();
        const envois = ["2026-10", "2026-12", "2026-11"].map((mois) =>
          unEnvoi(a, mois, { envoyeA: iso(`${mois}-02`, "08:00:00") }),
        );
        for (const e of envois) await banc.envois.enregistrer(e);
        await banc.envois.enregistrer(unEnvoi(b, "2026-12"));
        expect((await banc.envois.derniers(a, 10)).map((e) => e.mois)).toEqual([
          "2026-12",
          "2026-11",
          "2026-10",
        ]);
        expect(await banc.envois.derniers(a, 2)).toHaveLength(2);
        expect(await banc.envois.derniers(b, 10)).toHaveLength(1);
      });

      it("l'accusé de réception s'écrit une seule fois", async () => {
        const compagnieId = await banc.nouvelleCompagnie();
        const e = unEnvoi(compagnieId, "2026-12");
        await banc.envois.enregistrer(e);
        await banc.envois.marquerRecu(e.cle, iso("2027-01-03", "09:00:00"));
        await banc.envois.marquerRecu(e.cle, iso("2027-01-04", "09:00:00"));
        expect((await banc.envois.trouver(e.cle))?.recuA).toBe(iso("2027-01-03", "09:00:00"));
      });
    });

    describe("relevés des opérateurs et factures payées", () => {
      it("rend les lignes du relevé reçues dans la fenêtre, par heure, avec le numéro du payeur", async () => {
        const a = await banc.nouvelleCompagnie();
        const b = await banc.nouvelleCompagnie();
        const l1 = uneLigneReleve({ recueA: iso("2026-12-03", "11:42:00"), montant: 5_000 });
        const l2 = uneLigneReleve({
          recueA: iso("2026-12-09", "06:58:00"),
          operateur: "orange",
          telephone: "+237699000002",
          montant: 7_500,
        });
        const hors = uneLigneReleve({ recueA: iso("2027-01-02", "10:00:00") });
        await banc.importerReleves(a, [l2, l1, hors]);
        await banc.importerReleves(b, [uneLigneReleve({ recueA: iso("2026-12-04", "10:00:00") })]);
        const lues = await banc.releves.lignes(
          a,
          iso("2026-12-01", "00:00:00"),
          iso("2027-01-01", "00:00:00"),
        );
        expect(lues).toEqual([l1, l2]);
      });

      it("rend la date de paiement des factures demandées, et seulement celles-là", async () => {
        const a = await banc.nouvelleCompagnie();
        const b = await banc.nouvelleCompagnie();
        await banc.payerFacture(a, "2026-12-06", "2026-12-09");
        await banc.payerFacture(a, "2026-12-13", "2026-12-14");
        await banc.payerFacture(b, "2026-12-06", "2026-12-20");
        const payees = await banc.factures.payees(a, ["2026-12-06", "2026-12-20"]);
        expect([...payees]).toEqual([["2026-12-06", "2026-12-09"]]);
        expect((await banc.factures.payees(a, [])).size).toBe(0);
      });
    });
  });
}
