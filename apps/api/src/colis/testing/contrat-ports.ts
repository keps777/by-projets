import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColisStocke, GareRef, PhotoColis, ReclamationStockee } from "../modele";
import { ColisRepository, NumerotationColis, PhotosColis, ReclamationsRepository } from "../ports";
import { ESSAIS_CODE_MAX } from "../regles";

/**
 * Contrat des ports de persistance du module colis : les mêmes tests s'exécutent sur les adaptateurs
 * en mémoire et sur les adaptateurs PostgreSQL. Un comportement que la mémoire a et que PostgreSQL
 * n'a pas (ou l'inverse) fait échouer l'un des deux : c'est ce qui garantit que la mémoire, sur
 * laquelle tournent les autres tests, se comporte comme la base.
 *
 * Chaque test prend son propre contexte (compagnie, gares, voyageur, départ) : les colis ont des
 * numéros uniques et les photos des références uniques, on ne vide rien entre deux tests.
 */

export interface ContexteColis {
  compagnieId: string;
  origine: GareRef;
  destination: GareRef;
  /** Le voyageur qui envoie des colis depuis l'app. */
  expediteurId: string;
  /** Une personne qui écrit des réclamations. */
  auteurId: string;
  departId: string;
}

export interface BancColis {
  colis: ColisRepository;
  photos: PhotosColis;
  reclamations: ReclamationsRepository;
  numerotation: NumerotationColis;
  /** Une compagnie, deux gares, un voyageur et un départ neufs. En base, les lignes sont créées. */
  nouveauContexte(): Promise<ContexteColis>;
  /** Prend tous les numéros en ligne de la gare pour ce jour, sauf 9999 (`at` : l'instant du jour). */
  remplirNumerosEnLigne(contexte: ContexteColis, at: string): Promise<void>;
  fermer(): Promise<void>;
}

let compteur = 0;
const pad4 = (n: number): string => String(n).padStart(4, "0");

export function unColis(c: ContexteColis, surcharge: Partial<ColisStocke> = {}): ColisStocke {
  compteur += 1;
  const sequence = surcharge.sequence ?? compteur;
  const jour = surcharge.jour ?? "270105";
  return {
    id: randomUUID(),
    version: 1,
    numero: `C-${c.origine.code}-${jour}-${pad4(sequence)}-${compteur}`,
    sequence,
    jour,
    canal: "app",
    mode: "gare",
    compagnieId: c.compagnieId,
    gareOrigine: c.origine,
    gareDestination: c.destination,
    departId: c.departId,
    heureDepart: "2027-01-05T10:00:00.000+01:00",
    arriveePrevue: "2027-01-05T15:30:00.000+01:00",
    expediteurId: c.expediteurId,
    expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
    destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822", surnom: "Tantine" },
    contenu: "Vêtements et pagnes",
    poidsKg: 4.5,
    valeurDeclaree: 25_000,
    assure: true,
    valeurAssuree: 25_000,
    assurance: { police: null, enAttente: true },
    relaisId: null,
    adresseLivraison: null,
    port: 1500,
    devis: [
      { code: "port", libelle: "Port", montant: 1500 },
      { code: "assurance", libelle: "Assurance", montant: 500 },
    ],
    prixTotal: 2200,
    complementPoids: 0,
    paiement: {
      reference: "PAY-AB12CD34",
      moyen: "momo",
      etat: "paye",
      montant: 2200,
      numero: "+237691221008",
    },
    code: {
      hache: "a".repeat(64),
      sel: "b".repeat(32),
      chiffre: "enc:v1:k1:nonce:tag:chiffre",
      essais: 0,
      bloque: false,
      envoyeA: null,
      smsDestinataire: "au_retour_du_reseau",
    },
    creeA: "2027-01-05T09:00:00.000+01:00",
    disponibleDepuis: null,
    depose: null,
    remise: null,
    etat: "enregistre",
    historique: [],
    evenementIds: [],
    ...surcharge,
  };
}

function unePhoto(colisId: string | null, surcharge: Partial<PhotoColis> = {}): PhotoColis {
  return {
    ref: `photo-${randomUUID()}`,
    colisId,
    genre: "envoi",
    priseA: "2027-01-05T09:00:00.000+01:00",
    expireA: "2027-04-05T09:00:00.000+01:00",
    supprimeeA: null,
    ...surcharge,
  };
}

function uneReclamation(
  c: ContexteColis,
  colis: ColisStocke,
  surcharge: Partial<ReclamationStockee> = {},
): ReclamationStockee {
  compteur += 1;
  return {
    reference: `R-270105-${randomUUID().slice(0, 6).toUpperCase()}`,
    colisId: colis.id,
    colisNumero: colis.numero,
    compagnieId: c.compagnieId,
    auteurId: c.auteurId,
    motif: "perdu",
    message: "Le colis n'est jamais arrivé à Bafoussam.",
    ouverteA: "2027-01-06T09:00:00.000+01:00",
    reponseAvant: "2027-01-08T09:00:00.000+01:00",
    statut: "ouverte",
    decision: null,
    ...surcharge,
  };
}

/**
 * Une tentative de code faux telle que `ColisService.executer` la fait : relire, compter, écrire si
 * personne n'est passé entre-temps, sinon recommencer. Un colis bloqué ne compte plus rien.
 */
async function tenterCodeFaux(
  repo: ColisRepository,
  id: string,
): Promise<"bloque" | "faux" | "conflit"> {
  for (let tentative = 0; tentative < 10; tentative++) {
    const actuel = await repo.trouver(id);
    if (!actuel) throw new Error("colis introuvable");
    if (actuel.code.bloque) return "bloque";
    const essais = actuel.code.essais + 1;
    const suivant: ColisStocke = {
      ...actuel,
      code: { ...actuel.code, essais, bloque: essais >= ESSAIS_CODE_MAX },
    };
    if (await repo.remplacer(suivant, actuel.version)) {
      return suivant.code.bloque ? "bloque" : "faux";
    }
  }
  return "conflit";
}

export function contratPortsColis(nom: string, monter: () => Promise<BancColis>) {
  describe(nom, () => {
    let banc: BancColis;
    beforeAll(async () => {
      banc = await monter();
    }, 120_000);
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("colis", () => {
      it("ajoute un colis et le relit tel quel, par identifiant et par numéro", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        expect(await banc.colis.ajouter(colis)).toBe("ajoute");
        expect(await banc.colis.trouver(colis.id)).toEqual(colis);
        expect(await banc.colis.trouverParNumero(colis.numero)).toEqual(colis);
        expect(await banc.colis.trouver(randomUUID())).toBeNull();
        expect(await banc.colis.trouver("pas-un-identifiant")).toBeNull();
        expect(await banc.colis.trouverParNumero("C-XXX-000000-0000")).toBeNull();
      });

      it("garde un colis du guichet : sans expéditeur voyageur, sans paiement d'app, déposé et remis", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx, {
          canal: "agence",
          expediteurId: null,
          departId: null,
          heureDepart: null,
          arriveePrevue: null,
          compagnieId: null,
          destinataire: { nom: "Paul Mbarga", telephone: "+237677000222", surnom: null },
          assure: false,
          valeurAssuree: 0,
          assurance: { police: null, enAttente: false },
          paiement: null,
          depose: {
            a: "2027-01-05T09:00:00.000+01:00",
            poidsReleveKg: 5.25,
            photoRef: "photo-depot",
            par: "agent-1",
          },
          remise: { a: "2027-01-06T10:00:00.000+01:00", par: "agent-2", photoRef: null },
          disponibleDepuis: "2027-01-05T18:00:00.000+01:00",
          etat: "remis",
          historique: [
            {
              action: "remettre",
              de: "disponible",
              vers: "remis",
              at: "2027-01-06T10:00:00.000+01:00",
              par: "agent-2",
              motif: "pièce vérifiée",
            },
          ],
          evenementIds: [randomUUID(), randomUUID()],
        });
        expect(await banc.colis.ajouter(colis)).toBe("ajoute");
        expect(await banc.colis.trouver(colis.id)).toEqual(colis);
      });

      it("refuse un identifiant ou un numéro déjà pris, sans rien écraser", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        expect(await banc.colis.ajouter({ ...colis, contenu: "Autre chose" })).toBe("id_existe");
        expect(
          await banc.colis.ajouter({ ...colis, id: randomUUID(), contenu: "Autre chose" }),
        ).toBe("numero_pris");
        expect((await banc.colis.trouver(colis.id))?.contenu).toBe(colis.contenu);
      });

      it("dix ajouts simultanés du même colis : un seul passe", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        const resultats = await Promise.all(
          Array.from({ length: 10 }, () => banc.colis.ajouter(colis)),
        );
        expect(resultats.filter((r) => r === "ajoute")).toHaveLength(1);
        expect(resultats.filter((r) => r === "id_existe")).toHaveLength(9);
      });

      it("deux colis différents avec le même numéro, en même temps : un seul passe", async () => {
        const ctx = await banc.nouveauContexte();
        const modele = unColis(ctx);
        const resultats = await Promise.all(
          Array.from({ length: 6 }, () => banc.colis.ajouter({ ...modele, id: randomUUID() })),
        );
        expect(resultats.filter((r) => r === "ajoute")).toHaveLength(1);
        expect(resultats.filter((r) => r === "numero_pris")).toHaveLength(5);
      });

      it("remplace un colis si sa version est celle qu'on a lue, et monte la version", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const modifie = { ...colis, etat: "charge" as const, complementPoids: 300 };
        expect(await banc.colis.remplacer(modifie, 1)).toBe(true);
        expect(await banc.colis.trouver(colis.id)).toEqual({ ...modifie, version: 2 });
      });

      it("refuse de remplacer un colis dont la version a changé, et ne touche à rien", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        await banc.colis.remplacer({ ...colis, complementPoids: 100 }, 1);
        expect(await banc.colis.remplacer({ ...colis, complementPoids: 999 }, 1)).toBe(false);
        expect((await banc.colis.trouver(colis.id))?.complementPoids).toBe(100);
        expect(await banc.colis.remplacer({ ...colis, id: randomUUID() }, 1)).toBe(false);
      });

      it("ne change jamais le numéro, la séquence, le jour ni la date de création", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        await banc.colis.remplacer(
          {
            ...colis,
            numero: "C-ZZZ-000000-9999",
            sequence: 9999,
            jour: "300101",
            creeA: "2030-01-01T00:00:00.000+01:00",
            contenu: "Modifié",
          },
          1,
        );
        const relu = await banc.colis.trouver(colis.id);
        expect(relu).toMatchObject({
          numero: colis.numero,
          sequence: colis.sequence,
          jour: colis.jour,
          creeA: colis.creeA,
          contenu: "Modifié",
        });
      });

      it("douze modifications simultanées, avec relecture : aucune n'est perdue", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const ajouterUnFranc = async (): Promise<void> => {
          for (let essai = 0; essai < 30; essai++) {
            const actuel = (await banc.colis.trouver(colis.id))!;
            const suivant = { ...actuel, complementPoids: actuel.complementPoids + 1 };
            if (await banc.colis.remplacer(suivant, actuel.version)) return;
          }
          throw new Error("trop de conflits");
        };
        await Promise.all(Array.from({ length: 12 }, ajouterUnFranc));
        const relu = (await banc.colis.trouver(colis.id))!;
        expect(relu.complementPoids).toBe(12);
        expect(relu.version).toBe(13);
      });

      it("les essais de code faux sont comptés exactement et le colis se bloque au troisième", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx, { etat: "disponible" });
        await banc.colis.ajouter(colis);
        // Dix personnes devinent en même temps.
        const issues = await Promise.all(
          Array.from({ length: 10 }, () => tenterCodeFaux(banc.colis, colis.id)),
        );
        const relu = (await banc.colis.trouver(colis.id))!;
        expect(relu.code.essais).toBe(ESSAIS_CODE_MAX);
        expect(relu.code.bloque).toBe(true);
        // Exactement deux « faux » (1er et 2e essai), puis le blocage pour tous les autres.
        expect(issues.filter((i) => i === "faux")).toHaveLength(ESSAIS_CODE_MAX - 1);
        expect(issues.filter((i) => i === "bloque")).toHaveLength(10 - (ESSAIS_CODE_MAX - 1));
        expect(issues).not.toContain("conflit");
        // Une version par essai compté, aucune de plus.
        expect(relu.version).toBe(1 + ESSAIS_CODE_MAX);
      });

      it("liste par expéditeur, destinataire, compagnie, départ et états, du plus ancien au plus récent", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const a = unColis(ctx, { creeA: "2027-01-05T09:00:00.000+01:00" });
        const b = unColis(ctx, {
          creeA: "2027-01-05T08:00:00.000+01:00",
          etat: "charge",
          destinataire: { nom: "Paul", telephone: "+237677000333", surnom: null },
        });
        const c = unColis(autre);
        for (const x of [a, b, c]) await banc.colis.ajouter(x);

        const ids = async (f: Parameters<ColisRepository["lister"]>[0]) =>
          (await banc.colis.lister(f)).map((x) => x.id);
        expect(await ids({ expediteurId: ctx.expediteurId })).toEqual([b.id, a.id]);
        expect(await ids({ compagnieId: autre.compagnieId })).toEqual([c.id]);
        expect(await ids({ departId: ctx.departId })).toEqual([b.id, a.id]);
        expect(await ids({ expediteurId: ctx.expediteurId, etats: ["charge", "remis"] })).toEqual([
          b.id,
        ]);
        expect(await ids({ destinataireTelephone: "+237677000333" })).toEqual([b.id]);
        expect(
          await ids({ destinataireTelephone: "+237699401822", compagnieId: ctx.compagnieId }),
        ).toEqual([a.id]);
        expect(await ids({ destinataireTelephone: "+237600000000" })).toEqual([]);
      });

      it("liste les colis d'une gare, déposés par une personne, depuis un moment donné (accueil du guichet)", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const agent = randomUUID();
        const depot = (par: string, a: string) => ({
          a,
          poidsReleveKg: 2,
          photoRef: "photo-1",
          par,
        });
        const tot = unColis(ctx, { depose: depot(agent, "2027-01-05T07:30:00.000+01:00") });
        const tard = unColis(ctx, { depose: depot(agent, "2027-01-05T10:00:00.000+01:00") });
        const collegue = unColis(ctx, {
          depose: depot(randomUUID(), "2027-01-05T11:00:00.000+01:00"),
        });
        const sansDepot = unColis(ctx, { depose: null });
        const ailleurs = unColis(autre, { depose: depot(agent, "2027-01-05T12:00:00.000+01:00") });
        for (const x of [tot, tard, collegue, sansDepot, ailleurs]) await banc.colis.ajouter(x);

        const ids = async (f: Parameters<ColisRepository["lister"]>[0]) =>
          (await banc.colis.lister(f)).map((x) => x.id);
        expect(await ids({ gareOrigineId: ctx.origine.id, deposePar: agent })).toEqual([
          tot.id,
          tard.id,
        ]);
        expect(
          await ids({
            gareOrigineId: ctx.origine.id,
            deposePar: agent,
            deposeApres: "2027-01-05T08:00:00.000+01:00",
          }),
        ).toEqual([tard.id]);
        // Sans personne : tous les colis déposés depuis ce moment dans cette gare (pas celui qui n'est pas déposé).
        expect(
          await ids({
            gareOrigineId: ctx.origine.id,
            deposeApres: "2027-01-05T08:00:00.000+01:00",
          }),
        ).toEqual([tard.id, collegue.id]);
        expect(await ids({ gareOrigineId: autre.origine.id })).toEqual([ailleurs.id]);
        expect(await ids({ gareOrigineId: "pas-un-uuid" })).toEqual([]);
      });

      it("liste les colis disponibles depuis un moment donné (garde de 7 jours)", async () => {
        const ctx = await banc.nouveauContexte();
        const ancien = unColis(ctx, {
          etat: "disponible",
          disponibleDepuis: "2027-01-01T10:00:00.000+01:00",
        });
        const recent = unColis(ctx, {
          etat: "disponible",
          disponibleDepuis: "2027-01-05T10:00:00.000+01:00",
        });
        const jamais = unColis(ctx, { etat: "charge" });
        for (const x of [ancien, recent, jamais]) await banc.colis.ajouter(x);
        const trouves = await banc.colis.lister({
          expediteurId: ctx.expediteurId,
          disponibleAvant: "2027-01-03T00:00:00.000+01:00",
        });
        expect(trouves.map((x) => x.id)).toEqual([ancien.id]);
      });

      it("liste les colis dont l'assurance est en attente et ceux dont le code n'est pas parti", async () => {
        const ctx = await banc.nouveauContexte();
        const enAttente = unColis(ctx, {
          assurance: { police: null, enAttente: true },
          code: { ...unColis(ctx).code, smsDestinataire: "envoye" },
        });
        const assure = unColis(ctx, {
          assurance: { police: "POL-000001", enAttente: false },
          code: { ...unColis(ctx).code, smsDestinataire: "au_retour_du_reseau" },
        });
        const impaye = unColis(ctx, {
          paiement: {
            reference: "P",
            moyen: "momo",
            etat: "en_attente",
            montant: 2200,
            numero: null,
          },
          assurance: { police: null, enAttente: false },
          code: { ...unColis(ctx).code, smsDestinataire: "au_retour_du_reseau" },
        });
        for (const x of [enAttente, assure, impaye]) await banc.colis.ajouter(x);
        const dans = async (f: Parameters<ColisRepository["lister"]>[0]) =>
          (await banc.colis.lister({ expediteurId: ctx.expediteurId, ...f })).map((x) => x.id);
        expect(await dans({ assuranceEnAttente: true })).toEqual([enAttente.id]);
        expect((await dans({ assuranceEnAttente: false })).sort()).toEqual(
          [assure.id, impaye.id].sort(),
        );
        // Payé et code pas encore parti : seul `assure`. Un colis impayé n'est jamais « à renvoyer ».
        expect(await dans({ codeNonEnvoye: true })).toEqual([assure.id]);
        expect((await dans({ codeNonEnvoye: false })).sort()).toEqual(
          [enAttente.id, impaye.id].sort(),
        );
      });

      it("rend la plus grande séquence de la gare ce jour-là, dans la plage demandée", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const plage = { debut: 1, fin: 999 };
        expect(await banc.colis.plusGrandeSequence(ctx.origine.id, "270105", plage)).toBeNull();
        for (const [sequence, jour] of [
          [3, "270105"],
          [12, "270105"],
          [500, "270106"],
          [4005, "270105"],
        ] as const) {
          await banc.colis.ajouter(unColis(ctx, { sequence, jour }));
        }
        await banc.colis.ajouter(unColis(autre, { sequence: 77, jour: "270105" }));
        expect(await banc.colis.plusGrandeSequence(ctx.origine.id, "270105", plage)).toBe(12);
        expect(await banc.colis.plusGrandeSequence(ctx.origine.id, "270106", plage)).toBe(500);
        expect(
          await banc.colis.plusGrandeSequence(ctx.origine.id, "270105", { debut: 4001, fin: 9999 }),
        ).toBe(4005);
        expect(await banc.colis.plusGrandeSequence(autre.origine.id, "270105", plage)).toBe(77);
        expect(await banc.colis.plusGrandeSequence("pas-un-uuid", "270105", plage)).toBeNull();
      });
    });

    describe("photos", () => {
      it("enregistre une photo et la retrouve par référence et par colis", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const p = unePhoto(colis.id, { genre: "depot" });
        expect(await banc.photos.enregistrer(p)).toEqual(p);
        expect(await banc.photos.trouver(p.ref)).toEqual(p);
        expect(await banc.photos.parColis(colis.id)).toEqual([p]);
        expect(await banc.photos.trouver("inconnue")).toBeNull();
        expect(await banc.photos.parColis(randomUUID())).toEqual([]);
      });

      it("une photo téléversée avant le colis garde sa première date, puis se lie au colis", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const avant = unePhoto(null, { genre: "envoi" });
        await banc.photos.enregistrer(avant);
        const lie = await banc.photos.enregistrer({
          ...avant,
          colisId: colis.id,
          priseA: "2027-01-09T09:00:00.000+01:00",
          expireA: "2027-04-09T09:00:00.000+01:00",
        });
        expect(lie).toEqual({ ...avant, colisId: colis.id });
        expect(await banc.photos.parColis(colis.id)).toHaveLength(1);
      });

      it("une référence n'appartient qu'à un colis : la première liaison l'emporte", async () => {
        const ctx = await banc.nouveauContexte();
        const un = unColis(ctx);
        const deux = unColis(ctx);
        await banc.colis.ajouter(un);
        await banc.colis.ajouter(deux);
        const p = unePhoto(un.id);
        await banc.photos.enregistrer(p);
        const apres = await banc.photos.enregistrer({ ...p, colisId: deux.id, genre: "remise" });
        expect(apres.colisId).toBe(un.id);
        expect(apres.genre).toBe("remise");
        expect(await banc.photos.parColis(deux.id)).toEqual([]);
      });

      it("liste les photos expirées non supprimées et marque la suppression", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const echue = unePhoto(colis.id, { expireA: "2027-04-05T09:00:00.000+01:00" });
        const future = unePhoto(colis.id, {
          priseA: "2027-03-01T09:00:00.000+01:00",
          expireA: "2027-05-30T09:00:00.000+01:00",
        });
        await banc.photos.enregistrer(echue);
        await banc.photos.enregistrer(future);
        const maintenant = "2027-04-06T00:00:00.000+01:00";
        const refs = async () =>
          (await banc.photos.expirees(maintenant))
            .map((p) => p.ref)
            .filter((r) => r === echue.ref || r === future.ref);
        expect(await refs()).toEqual([echue.ref]);
        await banc.photos.marquerSupprimee(echue.ref, "2027-04-06T00:15:00.000+01:00");
        expect(await refs()).toEqual([]);
        expect((await banc.photos.trouver(echue.ref))?.supprimeeA).toBe(
          "2027-04-06T00:15:00.000+01:00",
        );
        await banc.photos.marquerSupprimee("inconnue", "2027-04-06T00:15:00.000+01:00");
      });
    });

    describe("réclamations", () => {
      it("ajoute une réclamation et la retrouve par référence, par colis et par liste", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const r = uneReclamation(ctx, colis);
        expect(await banc.reclamations.ajouter(r)).toBe(true);
        expect(await banc.reclamations.ajouter({ ...r, message: "Autre" })).toBe(false);
        expect(await banc.reclamations.trouver(r.reference)).toEqual(r);
        expect(await banc.reclamations.parColis(colis.id)).toEqual([r]);
        expect(await banc.reclamations.trouver("R-INCONNUE")).toBeNull();
        expect(await banc.reclamations.lister({ compagnieId: ctx.compagnieId })).toEqual([r]);
      });

      it("liste par compagnie et par statut, de la plus ancienne à la plus récente", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const c1 = unColis(ctx);
        const c2 = unColis(ctx);
        const c3 = unColis(autre);
        for (const x of [c1, c2, c3]) await banc.colis.ajouter(x);
        const recente = uneReclamation(ctx, c1, { ouverteA: "2027-01-07T09:00:00.000+01:00" });
        const ancienne = uneReclamation(ctx, c2, {
          ouverteA: "2027-01-06T09:00:00.000+01:00",
          statut: "refusee",
          decision: {
            a: "2027-01-07T10:00:00.000+01:00",
            par: ctx.auteurId,
            indemnisation: null,
            motif: "Le colis est arrivé.",
          },
        });
        const dAutre = uneReclamation(autre, c3);
        for (const x of [recente, ancienne, dAutre]) await banc.reclamations.ajouter(x);
        const refs = async (f: Parameters<ReclamationsRepository["lister"]>[0]) =>
          (await banc.reclamations.lister(f)).map((x) => x.reference);
        expect(await refs({ compagnieId: ctx.compagnieId })).toEqual([
          ancienne.reference,
          recente.reference,
        ]);
        expect(await refs({ compagnieId: ctx.compagnieId, statut: "ouverte" })).toEqual([
          recente.reference,
        ]);
        expect(await refs({ compagnieId: autre.compagnieId })).toEqual([dAutre.reference]);
      });

      it("remplace une réclamation si son statut est celui attendu, et garde la décision", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const r = uneReclamation(ctx, colis);
        await banc.reclamations.ajouter(r);
        const decidee: ReclamationStockee = {
          ...r,
          statut: "acceptee",
          decision: {
            a: "2027-01-07T10:00:00.000+01:00",
            par: ctx.auteurId,
            indemnisation: { type: "valeur_assuree", montant: 25_000, dossierAssureur: null },
            motif: null,
          },
        };
        expect(await banc.reclamations.remplacer(decidee, "ouverte")).toBe(true);
        expect(await banc.reclamations.trouver(r.reference)).toEqual(decidee);
        // Le statut a changé : une seconde décision, partie de « ouverte », est refusée.
        expect(
          await banc.reclamations.remplacer({ ...decidee, statut: "refusee" }, "ouverte"),
        ).toBe(false);
        expect((await banc.reclamations.trouver(r.reference))?.statut).toBe("acceptee");
        // Compléter la décision (dossier de l'assureur) part du nouveau statut.
        const complete = {
          ...decidee,
          decision: {
            ...decidee.decision!,
            indemnisation: {
              type: "valeur_assuree" as const,
              montant: 25_000,
              dossierAssureur: "SIN-000001",
            },
          },
        };
        expect(await banc.reclamations.remplacer(complete, "acceptee")).toBe(true);
        expect(
          (await banc.reclamations.trouver(r.reference))?.decision?.indemnisation?.dossierAssureur,
        ).toBe("SIN-000001");
        // La remettre à « ouverte » (l'assureur n'a pas répondu) efface la décision.
        expect(await banc.reclamations.remplacer(r, "acceptee")).toBe(true);
        expect(await banc.reclamations.trouver(r.reference)).toEqual(r);
      });

      it("huit décisions simultanées sur la même réclamation : une seule passe", async () => {
        const ctx = await banc.nouveauContexte();
        const colis = unColis(ctx);
        await banc.colis.ajouter(colis);
        const r = uneReclamation(ctx, colis);
        await banc.reclamations.ajouter(r);
        const resultats = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            banc.reclamations.remplacer(
              {
                ...r,
                statut: i % 2 === 0 ? "acceptee" : "refusee",
                decision: {
                  a: "2027-01-07T10:00:00.000+01:00",
                  par: `decideur-${i}`,
                  indemnisation: null,
                  motif: null,
                },
              },
              "ouverte",
            ),
          ),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
      });
    });

    describe("numéros des colis de l'app (4001–9999)", () => {
      const AT = "2027-01-05T09:00:00.000+01:00";
      const prendre = (
        ctx: ContexteColis,
        reference: string,
        surcharge: { at?: string; gareId?: string } = {},
      ) =>
        banc.numerotation.prochainEnLigne({
          gareId: surcharge.gareId ?? ctx.origine.id,
          compagnieId: ctx.compagnieId,
          at: surcharge.at ?? AT,
          reference,
        });

      it("prend les numéros dans l'ordre à partir de 4001", async () => {
        const ctx = await banc.nouveauContexte();
        expect(await prendre(ctx, randomUUID())).toBe(4001);
        expect(await prendre(ctx, randomUUID())).toBe(4002);
        expect(await prendre(ctx, randomUUID())).toBe(4003);
      });

      it("chaque gare et chaque jour ont leur propre compteur", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        expect(await prendre(ctx, randomUUID())).toBe(4001);
        expect(await prendre(autre, randomUUID())).toBe(4001);
        expect(await prendre(ctx, randomUUID(), { at: "2027-01-06T09:00:00.000+01:00" })).toBe(
          4001,
        );
        expect(await prendre(ctx, randomUUID())).toBe(4002);
      });

      it("le jour est celui de Douala : 00 h 30 le 6 est déjà le 6", async () => {
        const ctx = await banc.nouveauContexte();
        expect(await prendre(ctx, randomUUID(), { at: "2027-01-05T23:30:00.000+01:00" })).toBe(
          4001,
        );
        expect(await prendre(ctx, randomUUID(), { at: "2027-01-06T00:30:00.000+01:00" })).toBe(
          4001,
        );
        expect(await prendre(ctx, randomUUID(), { at: "2027-01-05T22:00:00.000+01:00" })).toBe(
          4002,
        );
      });

      it("rend le même numéro à la même référence (réessai après une erreur réseau)", async () => {
        const ctx = await banc.nouveauContexte();
        const reference = randomUUID();
        const premier = await prendre(ctx, reference);
        expect(await prendre(ctx, reference)).toBe(premier);
        expect(await prendre(ctx, randomUUID())).toBe(premier + 1);
      });

      it("cinquante créations simultanées : cinquante numéros distincts, consécutifs, sans trou", async () => {
        const ctx = await banc.nouveauContexte();
        const pris = await Promise.all(
          Array.from({ length: 50 }, () => prendre(ctx, randomUUID())),
        );
        expect([...pris].sort((a, b) => a - b)).toEqual(
          Array.from({ length: 50 }, (_, i) => 4001 + i),
        );
      });

      it("lève RangeError quand la plage est épuisée, sauf pour une référence déjà servie", async () => {
        const ctx = await banc.nouveauContexte();
        await banc.remplirNumerosEnLigne(ctx, AT);
        const dernier = randomUUID();
        expect(await prendre(ctx, dernier)).toBe(9999);
        await expect(prendre(ctx, randomUUID())).rejects.toBeInstanceOf(RangeError);
        expect(await prendre(ctx, dernier)).toBe(9999);
      }, 60_000);
    });
  });
}
