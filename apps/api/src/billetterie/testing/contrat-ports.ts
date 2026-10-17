import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  Billet,
  Bus,
  Commande,
  Compagnie,
  Depart,
  Gare,
  Guichet,
  Ligne,
  PersonneRef,
  ScanStocke,
} from "../modeles";
import {
  Billets,
  Catalogue,
  Commandes,
  EvenementsTraites,
  Inventaire,
  PreferencesVoyageur,
  Scans,
} from "../ports";

/**
 * Contrat des ports de la billetterie : les mêmes tests s'exécutent sur les adaptateurs en mémoire et
 * sur les adaptateurs PostgreSQL. Un comportement que la mémoire a et que PostgreSQL n'a pas (ou
 * l'inverse) fait échouer l'un des deux. C'est ce qui prouve que la mémoire, sur laquelle tournent
 * tous les autres tests de la billetterie, se comporte comme la base : siège jamais vendu deux fois,
 * billet jamais scanné deux fois, événement jamais traité deux fois.
 *
 * Chaque test prend son propre réseau (compagnie, gares, ligne, départs) : on ne vide rien entre
 * deux tests.
 */

/** Une compagnie, ses deux gares, un guichet, sa ligne et un bus. */
export interface Reseau {
  compagnie: Compagnie;
  origine: Gare;
  destination: Gare;
  guichet: Guichet;
  ligne: Ligne;
  bus: Bus;
}

/** Ce que le banc sait fabriquer : en base, les lignes sont créées (clés étrangères). */
export interface MondeBilletterie {
  reseau(): Promise<Reseau>;
  depart(reseau: Reseau, surcharge?: Partial<Depart>): Promise<Depart>;
  personne(nom?: string): Promise<PersonneRef>;
  affecter(personneId: string, guichetId: string): Promise<void>;
}

export interface BancBilletterie {
  catalogue: Catalogue;
  billets: Billets;
  inventaire: Inventaire;
  commandes: Commandes;
  scans: Scans;
  traites: EvenementsTraites;
  preferences: PreferencesVoyageur;
  monde: MondeBilletterie;
  fermer(): Promise<void>;
}

let compteur = 0;
const suivant = (): number => {
  compteur += 1;
  return compteur;
};

const T0 = "2027-01-05T09:00:00.000+01:00";
const T15 = "2027-01-05T09:15:00.000+01:00";
const T16 = "2027-01-05T09:16:00.000+01:00";

/** Un départ du même réseau, 14 h le lendemain, tel que le banc le crée. */
const heure = (hhmm: string, jour = "2027-01-06"): string => `${jour}T${hhmm}:00.000+01:00`;

function billet(r: Reseau, depart: Depart, surcharge: Partial<Billet> = {}): Billet {
  const n = suivant();
  return {
    id: randomUUID(),
    numero: `${r.compagnie.code}-DLA-270105-${String(n).padStart(5, "0")}`,
    sequence: 1000 + n,
    compagnieId: r.compagnie.id,
    gareId: r.origine.id,
    departId: depart.id,
    siege: null,
    classe: "classique",
    prix: 4000,
    bagage: 500,
    canal: "guichet",
    guichetId: null,
    acheteurId: null,
    commandeId: null,
    passagerChiffre: "chiffre:Aïcha",
    passagerTelephoneIndex: `index-${n}`,
    codeBillet: String(1000 + n),
    qr: `AM1:test:${n}`,
    creeA: T0,
    etat: "paye",
    historique: [{ action: "payer", de: "reserve", vers: "paye", at: T0, par: "auteur" }],
    evenementId: null,
    appareilId: null,
    auteurId: null,
    paiement: null,
    aCompleterAuQuai: false,
    smsEnvoye: false,
    retardPrevenu: false,
    embarqueA: null,
    reporteDe: null,
    ...surcharge,
  };
}

function commande(
  voyageurId: string,
  departId: string,
  surcharge: Partial<Commande> = {},
): Commande {
  return {
    id: randomUUID(),
    voyageurId,
    departId,
    type: "billet",
    libelle: "Douala → Yaoundé",
    lignes: [
      { code: "billet", libelle: "Billet classique", montant: 4000 },
      { code: "frais", libelle: "Frais de service", montant: 250, montantBarre: 250 },
    ],
    total: 4250,
    conversion: null,
    statut: "en_attente_paiement",
    creeeA: T0,
    expireA: T15,
    sieges: [3, 4],
    passagersChiffre: "chiffre:passagers",
    billetIds: [],
    codePromo: null,
    moyenPaiement: null,
    ...surcharge,
  };
}

function scan(departId: string, surcharge: Partial<ScanStocke> = {}): ScanStocke {
  return {
    evenementId: randomUUID(),
    departId,
    billetId: randomUUID(),
    numero: "ALP-DLA-270105-0001",
    resultat: "monte",
    at: T0,
    siege: 12,
    classe: "classique",
    bagagesSoute: 2,
    premierScanA: null,
    appareilId: "tel-quai",
    auteurId: "auteur-quai",
    ...surcharge,
  };
}

export function contratPortsBilletterie(
  titre: string,
  creer: () => Promise<BancBilletterie>,
): void {
  describe(titre, () => {
    let banc: BancBilletterie;
    beforeAll(async () => {
      banc = await creer();
    });
    afterAll(async () => {
      await banc?.fermer();
    });

    /* ------------------------------------------------------------------ catalogue */

    describe("catalogue", () => {
      it("retrouve une compagnie, une gare et un guichet ; un inconnu ou un mauvais identifiant donne null", async () => {
        const r = await banc.monde.reseau();
        expect(await banc.catalogue.compagnie(r.compagnie.id)).toEqual(r.compagnie);
        expect(await banc.catalogue.gare(r.origine.id)).toEqual(r.origine);
        expect(await banc.catalogue.guichet(r.guichet.id)).toEqual(r.guichet);
        expect(await banc.catalogue.compagnie(randomUUID())).toBeNull();
        expect(await banc.catalogue.gare(randomUUID())).toBeNull();
        expect(await banc.catalogue.guichet(randomUUID())).toBeNull();
        expect(await banc.catalogue.compagnie("pas-un-uuid")).toBeNull();
        expect(await banc.catalogue.depart("pas-un-uuid")).toBeNull();
      });

      it("donne le nom d'une ville d'après son code", async () => {
        await banc.monde.reseau();
        expect(await banc.catalogue.ville("DLA")).toBe("Douala");
        expect(await banc.catalogue.ville("YDE")).toBe("Yaoundé");
        expect(await banc.catalogue.ville("ZZZ")).toBeNull();
      });

      it("donne le guichet où travaille une personne", async () => {
        const r = await banc.monde.reseau();
        const p = await banc.monde.personne("Marie Ngono");
        expect(await banc.catalogue.guichetDe(p.id)).toBeNull();
        await banc.monde.affecter(p.id, r.guichet.id);
        expect(await banc.catalogue.guichetDe(p.id)).toEqual(r.guichet);
        expect(await banc.catalogue.guichetDe(randomUUID())).toBeNull();
      });

      it("assemble un départ complet : ligne et arrêts dans l'ordre, compagnie, gares, bus, équipage", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r, {
          historique: [
            { action: "ouvrir_vente", de: "programme", vers: "en_vente", at: T0, par: "sup-1" },
          ],
        });
        const dc = await banc.catalogue.depart(d.id);
        expect(dc).toEqual({
          depart: d,
          ligne: r.ligne,
          compagnie: r.compagnie,
          origine: r.origine,
          destination: r.destination,
          bus: r.bus,
        });
        expect(dc?.ligne.arrets.map((a) => a.ordre)).toEqual([0, 1, 2]);
        expect(await banc.catalogue.depart(randomUUID())).toBeNull();
      });

      it("un départ sans bus ni équipage est rendu tel quel", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r, {
          busId: null,
          chauffeur: null,
          convoyeur: null,
          quai: null,
        });
        const dc = await banc.catalogue.depart(d.id);
        expect(dc?.bus).toBeNull();
        expect(dc?.depart).toEqual(d);
      });

      it("liste les départs filtrés, du plus tôt au plus tard", async () => {
        const r = await banc.monde.reseau();
        const autre = await banc.monde.reseau();
        const tard = await banc.monde.depart(r, { heureDepart: heure("17:00") });
        const tot = await banc.monde.depart(r, { heureDepart: heure("08:00") });
        const midi = await banc.monde.depart(r, { heureDepart: heure("12:00"), etat: "programme" });
        const ailleurs = await banc.monde.depart(autre, { heureDepart: heure("10:00") });

        const ids = async (f: Parameters<Catalogue["departs"]>[0]) =>
          (await banc.catalogue.departs(f)).map((x) => x.depart.id);

        expect(await ids({ compagnieId: r.compagnie.id })).toEqual([tot.id, midi.id, tard.id]);
        expect(await ids({ compagnieId: autre.compagnie.id })).toEqual([ailleurs.id]);
        expect(await ids({ compagnieId: r.compagnie.id, etats: ["en_vente"] })).toEqual([
          tot.id,
          tard.id,
        ]);
        expect(await ids({ ligneId: r.ligne.id })).toEqual([tot.id, midi.id, tard.id]);
        expect(await ids({ gareOrigineId: r.origine.id })).toEqual([tot.id, midi.id, tard.id]);
        expect(
          await ids({ compagnieId: r.compagnie.id, villeOrigine: "DLA", villeDestination: "YDE" }),
        ).toEqual([tot.id, midi.id, tard.id]);
        expect(await ids({ compagnieId: r.compagnie.id, villeOrigine: "YDE" })).toEqual([]);
        // [de, avant[ : le départ de 12 h est dedans, celui de 17 h (borne exclue) non.
        expect(
          await ids({ compagnieId: r.compagnie.id, de: heure("09:00"), avant: heure("17:00") }),
        ).toEqual([midi.id]);
      });

      it("change l'état d'un départ seulement s'il est encore dans l'état attendu", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const historique = [
          {
            action: "ouvrir_embarquement" as const,
            de: "en_vente" as const,
            vers: "embarquement" as const,
            at: T0,
          },
        ];
        const change = await banc.catalogue.changerDepart(d.id, "en_vente", {
          etat: "embarquement",
          historique,
          quai: 7,
          chauffeur: null,
        });
        expect(change).toEqual({
          ...d,
          etat: "embarquement",
          historique,
          quai: 7,
          chauffeur: null,
        });
        expect((await banc.catalogue.depart(d.id))?.depart).toEqual(change);
        // L'état n'est plus « en_vente » : rien ne change.
        expect(await banc.catalogue.changerDepart(d.id, "en_vente", { quai: 9 })).toBeNull();
        expect((await banc.catalogue.depart(d.id))?.depart.quai).toBe(7);
        expect(
          await banc.catalogue.changerDepart(randomUUID(), "en_vente", { quai: 1 }),
        ).toBeNull();
      });

      it("dix changements simultanés depuis le même état : un seul passe", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const reponses = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            banc.catalogue.changerDepart(d.id, "en_vente", { etat: "embarquement", quai: i + 1 }),
          ),
        );
        expect(reponses.filter((x) => x !== null)).toHaveLength(1);
      });

      it("change l'équipage, le bus, l'heure et la fusion", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const cible = await banc.monde.depart(r);
        const autreChauffeur = await banc.monde.personne("Paul Essomba");
        const change = await banc.catalogue.changerDepart(d.id, "en_vente", {
          etat: "fusionne",
          fusionneDansId: cible.id,
          chauffeur: autreChauffeur,
          busId: null,
          heureDepart: heure("18:30"),
        });
        expect(change).toMatchObject({
          etat: "fusionne",
          fusionneDansId: cible.id,
          chauffeur: autreChauffeur,
          busId: null,
          heureDepart: heure("18:30"),
          convoyeur: d.convoyeur,
        });
      });
    });

    /* ------------------------------------------------------------------ billets */

    describe("billets", () => {
      it("écrit un billet et le relit tel quel", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const acheteur = await banc.monde.personne();
        const auteur = await banc.monde.personne();
        const b = billet(r, d, {
          siege: 12,
          canal: "guichet",
          guichetId: r.guichet.id,
          acheteurId: acheteur.id,
          auteurId: auteur.id,
          evenementId: randomUUID(),
          appareilId: "tel-1",
          paiement: { mode: "momo", reference: "MP240105.1234" },
          aCompleterAuQuai: true,
          smsEnvoye: true,
          retardPrevenu: true,
          embarqueA: "2027-01-06T13:41:00.000+01:00",
        });
        expect(await banc.billets.ajouter(b)).toBe("ok");
        expect(await banc.billets.trouver(b.id)).toEqual(b);
        expect(await banc.billets.parNumero(b.numero)).toEqual(b);
        expect(await banc.billets.parEvenement(b.evenementId!)).toEqual(b);
        expect(await banc.billets.parCode(d.id, b.codeBillet)).toEqual(b);
      });

      it("un billet sans siège, sans événement et sans paiement est rendu tel quel", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const b = billet(r, d, { qr: "", passagerChiffre: "x", historique: [] });
        expect(await banc.billets.ajouter(b)).toBe("ok");
        expect(await banc.billets.trouver(b.id)).toEqual(b);
      });

      it("refuse un identifiant, un numéro ou un code déjà pris, et dit lequel", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const b = billet(r, d);
        expect(await banc.billets.ajouter(b)).toBe("ok");
        expect(await banc.billets.ajouter({ ...billet(r, d), id: b.id })).toBe("id_pris");
        expect(await banc.billets.ajouter({ ...billet(r, d), numero: b.numero })).toBe(
          "numero_pris",
        );
        expect(await banc.billets.ajouter({ ...billet(r, d), codeBillet: b.codeBillet })).toBe(
          "code_pris",
        );
        // Le même code dans un autre départ est permis.
        const autre = await banc.monde.depart(r);
        expect(await banc.billets.ajouter({ ...billet(r, autre), codeBillet: b.codeBillet })).toBe(
          "ok",
        );
      });

      it("le code d'un billet annulé est de nouveau disponible", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const b = billet(r, d);
        await banc.billets.ajouter(b);
        expect(await banc.billets.parCode(d.id, b.codeBillet)).not.toBeNull();
        await banc.billets.transitionner(b.id, ["paye"], { etat: "annule" });
        expect(await banc.billets.parCode(d.id, b.codeBillet)).toBeNull();
        expect(await banc.billets.ajouter({ ...billet(r, d), codeBillet: b.codeBillet })).toBe(
          "ok",
        );
        // Un billet annulé ne bloque pas non plus un autre billet annulé.
        expect(
          await banc.billets.ajouter({
            ...billet(r, d),
            codeBillet: b.codeBillet,
            etat: "annule",
          }),
        ).toBe("ok");
      });

      it("dix écritures simultanées du même code dans un départ : une seule passe", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const reponses = await Promise.all(
          Array.from({ length: 10 }, () =>
            banc.billets.ajouter(billet(r, d, { codeBillet: "4242" })),
          ),
        );
        expect(reponses.filter((x) => x === "ok")).toHaveLength(1);
        expect(reponses.filter((x) => x === "code_pris")).toHaveLength(9);
      });

      it("retrouve les billets d'un départ, d'un guichet et d'un jour, d'un acheteur", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const d2 = await banc.monde.depart(r);
        const acheteur = await banc.monde.personne();
        const a = billet(r, d, { guichetId: r.guichet.id, creeA: "2027-01-05T09:00:00.000+01:00" });
        const b = billet(r, d, {
          guichetId: r.guichet.id,
          acheteurId: acheteur.id,
          creeA: "2027-01-05T10:00:00.000+01:00",
        });
        const c = billet(r, d2, {
          guichetId: r.guichet.id,
          numero: `${r.compagnie.code}-DLA-270106-0001`,
        });
        for (const x of [a, b, c]) await banc.billets.ajouter(x);
        const ids = (l: Billet[]) => l.map((x) => x.id).sort();
        expect(ids(await banc.billets.duDepart(d.id))).toEqual(ids([a, b]));
        expect(ids(await banc.billets.duDepart(d2.id))).toEqual(ids([c]));
        expect(ids(await banc.billets.duGuichetEtJour(r.guichet.id, "270105"))).toEqual(
          ids([a, b]),
        );
        expect(ids(await banc.billets.duGuichetEtJour(r.guichet.id, "270106"))).toEqual(ids([c]));
        expect(await banc.billets.duGuichetEtJour(r.guichet.id, "270107")).toEqual([]);
        expect(ids(await banc.billets.deLAcheteur(acheteur.id))).toEqual(ids([b]));
        expect(await banc.billets.deLAcheteur(randomUUID())).toEqual([]);
      });

      it("un billet inconnu n'existe pas", async () => {
        expect(await banc.billets.trouver(randomUUID())).toBeNull();
        expect(await banc.billets.trouver("pas-un-uuid")).toBeNull();
        expect(await banc.billets.parNumero("ZZZ-ZZZ-000000-0000")).toBeNull();
        expect(await banc.billets.parEvenement(randomUUID())).toBeNull();
      });

      it("change l'état d'un billet seulement s'il est encore dans l'un des états attendus", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const b = billet(r, d, { siege: 5 });
        await banc.billets.ajouter(b);
        const embarque = await banc.billets.transitionner(b.id, ["paye", "reserve"], {
          etat: "embarque",
          embarqueA: "2027-01-06T13:41:00.000+01:00",
          historique: [
            ...b.historique,
            { action: "embarquer", de: "paye", vers: "embarque", at: T0 },
          ],
        });
        expect(embarque).toEqual({
          ...b,
          etat: "embarque",
          embarqueA: "2027-01-06T13:41:00.000+01:00",
          historique: [
            ...b.historique,
            { action: "embarquer", de: "paye", vers: "embarque", at: T0 },
          ],
        });
        // Il n'est plus « payé » : rien ne change.
        expect(await banc.billets.transitionner(b.id, ["paye"], { etat: "annule" })).toBeNull();
        expect((await banc.billets.trouver(b.id))?.etat).toBe("embarque");
        expect(
          await banc.billets.transitionner(randomUUID(), ["paye"], { etat: "annule" }),
        ).toBeNull();
      });

      it("deux appareils qui scannent le même billet au même instant : un seul passe (pas de double scan)", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const b = billet(r, d, { siege: 8 });
        await banc.billets.ajouter(b);
        const reponses = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            banc.billets.transitionner(b.id, ["paye"], {
              etat: "embarque",
              appareilId: `tel-${i}`,
              embarqueA: T0,
            }),
          ),
        );
        const gagnants = reponses.filter((x) => x !== null);
        expect(gagnants).toHaveLength(1);
        const final = await banc.billets.trouver(b.id);
        expect(final?.appareilId).toBe(gagnants[0]?.appareilId);
        expect(final?.numero).toBe(b.numero);
      });

      it("une transition peut déplacer le billet (départ, siège) et pose l'origine d'un report", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const cible = await banc.monde.depart(r);
        const b = billet(r, d, { siege: 3 });
        const origine = billet(r, d, { siege: 4 });
        await banc.billets.ajouter(b);
        await banc.billets.ajouter(origine);
        const deplace = await banc.billets.transitionner(b.id, ["paye"], {
          departId: cible.id,
          siege: 9,
          reporteDe: origine.id,
        });
        expect(deplace).toMatchObject({ departId: cible.id, siege: 9, reporteDe: origine.id });
        expect(await banc.billets.duDepart(cible.id)).toHaveLength(1);
      });
    });

    /* ------------------------------------------------------------------ inventaire */

    describe("inventaire des sièges", () => {
      const bloquer = (
        departId: string,
        siege: number,
        par: string,
        commandeId: string | null = null,
        jusqua = T15,
        maintenant = T0,
      ) => banc.inventaire.bloquer({ departId, siege, par, commandeId, jusqua, maintenant });

      const occuper = (
        departId: string,
        siege: number,
        billetId = randomUUID(),
        par: string | null = null,
        maintenant = T0,
      ) => banc.inventaire.occuper({ departId, siege, billetId, par, maintenant });

      const nouveauDepart = async () => (await banc.monde.depart(await banc.monde.reseau())).id;

      it("un départ neuf a un plan vide à la version 0 ; un inconnu aussi", async () => {
        expect(await banc.inventaire.plan(await nouveauDepart())).toEqual({
          occupes: {},
          bloques: {},
          version: 0,
        });
        expect(await banc.inventaire.plan(randomUUID())).toEqual({
          occupes: {},
          bloques: {},
          version: 0,
        });
      });

      it("un siège occupé ne peut plus être occupé ni bloqué ; un autre départ est indépendant", async () => {
        const d = await nouveauDepart();
        const d2 = await nouveauDepart();
        const b1 = randomUUID();
        expect((await occuper(d, 1, b1)).ok).toBe(true);
        expect(await occuper(d, 1)).toEqual({ ok: false, raison: "pris" });
        expect(await bloquer(d, 1, "v1")).toEqual({ ok: false, raison: "pris" });
        expect((await occuper(d2, 1)).ok).toBe(true);
        expect((await banc.inventaire.plan(d)).occupes).toEqual({ 1: b1 });
      });

      it("un siège bloqué est refusé à un autre, jusqu'à l'expiration du blocage", async () => {
        const d = await nouveauDepart();
        expect((await bloquer(d, 3, "v1")).ok).toBe(true);
        expect(await bloquer(d, 3, "v2")).toEqual({ ok: false, raison: "bloque_par_autre" });
        expect((await occuper(d, 3)).ok).toBe(false);
        // Après 15 minutes, le siège est libre pour tous.
        const apres = await bloquer(d, 3, "v2", null, "2027-01-05T09:31:00.000+01:00", T16);
        expect(apres.ok).toBe(true);
        expect((await banc.inventaire.plan(d)).bloques[3]).toMatchObject({ par: "v2" });
      });

      it("un blocage échu se vend, sans passer par l'expiration", async () => {
        const d = await nouveauDepart();
        await bloquer(d, 6, "v1");
        const vente = await occuper(d, 6, randomUUID(), null, T16);
        expect(vente.ok).toBe(true);
        expect((await banc.inventaire.plan(d)).bloques[6]).toBeUndefined();
      });

      it("le même voyageur repousse la fin de son blocage et change de commande", async () => {
        const d = await nouveauDepart();
        const commandeId = randomUUID();
        await bloquer(d, 2, "v1");
        const r = await bloquer(d, 2, "v1", commandeId, "2027-01-05T09:40:00.000+01:00");
        expect(r.ok).toBe(true);
        expect((await banc.inventaire.plan(d)).bloques[2]).toEqual({
          par: "v1",
          commandeId,
          jusqua: "2027-01-05T09:40:00.000+01:00",
        });
      });

      it("le détenteur d'un blocage consomme son siège en l'achetant ; un autre ne le peut pas", async () => {
        const d = await nouveauDepart();
        const b = randomUUID();
        await bloquer(d, 4, "v1");
        expect((await occuper(d, 4, b, "v2")).ok).toBe(false);
        expect((await occuper(d, 4, b, "v1")).ok).toBe(true);
        const plan = await banc.inventaire.plan(d);
        expect(plan.occupes[4]).toBe(b);
        expect(plan.bloques[4]).toBeUndefined();
      });

      it("la version du plan monte d'un à chaque changement, jamais en arrière", async () => {
        const d = await nouveauDepart();
        const r1 = await bloquer(d, 1, "v1");
        const r2 = await bloquer(d, 2, "v1");
        const r3 = await occuper(d, 5);
        expect([r1, r2, r3]).toEqual([
          { ok: true, version: 1 },
          { ok: true, version: 2 },
          { ok: true, version: 3 },
        ]);
        // Un refus ne fait pas monter la version.
        await bloquer(d, 5, "v9");
        expect((await banc.inventaire.plan(d)).version).toBe(3);
        const levees = await banc.inventaire.leverBlocages(d, "v1");
        expect(levees.map((l) => l.siege).sort()).toEqual([1, 2]);
        expect(levees.map((l) => l.version).sort()).toEqual([4, 5]);
        expect((await banc.inventaire.plan(d)).version).toBe(5);
      });

      it("choisir un autre siège lève le précédent, mais pas ceux d'une commande", async () => {
        const d = await nouveauDepart();
        const commandeId = randomUUID();
        await bloquer(d, 1, "v1");
        await bloquer(d, 2, "v1", commandeId);
        await bloquer(d, 3, "v1");
        const levees = await banc.inventaire.leverBlocages(d, "v1", [3]);
        expect(levees.map((l) => l.siege)).toEqual([1]);
        const plan = await banc.inventaire.plan(d);
        expect(Object.keys(plan.bloques).map(Number).sort()).toEqual([2, 3]);
        expect((await banc.inventaire.leverCommande(d, commandeId)).map((l) => l.siege)).toEqual([
          2,
        ]);
        expect(await banc.inventaire.leverCommande(d, commandeId)).toEqual([]);
        // Un autre voyageur n'est pas touché.
        expect(await banc.inventaire.leverBlocages(d, "autre")).toEqual([]);
      });

      it("libérer ne rend le siège qu'à son billet", async () => {
        const d = await nouveauDepart();
        const b = randomUUID();
        await occuper(d, 1, b);
        expect(await banc.inventaire.liberer(d, 1, randomUUID())).toBeNull();
        expect((await banc.inventaire.plan(d)).occupes[1]).toBe(b);
        expect(await banc.inventaire.liberer(d, 1, b)).toEqual({ version: 2 });
        expect((await banc.inventaire.plan(d)).occupes[1]).toBeUndefined();
        expect(await banc.inventaire.liberer(d, 1, b)).toBeNull();
        // Le siège est de nouveau à vendre.
        expect((await occuper(d, 1)).ok).toBe(true);
      });

      it("libérer un siège bloqué (et non occupé) ne fait rien", async () => {
        const d = await nouveauDepart();
        await bloquer(d, 1, "v1");
        expect(await banc.inventaire.liberer(d, 1, randomUUID())).toBeNull();
        expect((await banc.inventaire.plan(d)).bloques[1]).toBeDefined();
      });

      it("l'expiration supprime les blocages échus de tous les départs et dit lesquels", async () => {
        const d = await nouveauDepart();
        const d2 = await nouveauDepart();
        const c = randomUUID();
        await bloquer(d, 1, "v1");
        await bloquer(d, 2, "v2", c);
        await bloquer(d2, 7, "v3");
        await occuper(d2, 8);
        expect(await banc.inventaire.expirer(T0)).toEqual([]);
        const expires = (await banc.inventaire.expirer(T16)).filter(
          (e) => e.departId === d || e.departId === d2,
        );
        expect(expires.map((e) => `${e.departId === d ? "d" : "d2"}:${e.siege}`).sort()).toEqual([
          "d2:7",
          "d:1",
          "d:2",
        ]);
        expect(expires.find((e) => e.siege === 2)).toMatchObject({
          par: "v2",
          commandeId: c,
          departId: d,
        });
        expect(expires.find((e) => e.siege === 7)).toMatchObject({ par: "v3", commandeId: null });
        expect((await banc.inventaire.plan(d)).bloques).toEqual({});
        // Les versions se suivent : d a eu 2 blocages puis 2 expirations.
        expect(
          expires
            .filter((e) => e.departId === d)
            .map((e) => e.version)
            .sort(),
        ).toEqual([3, 4]);
        expect((await banc.inventaire.plan(d2)).occupes).toHaveProperty("8");
        // Rien d'autre à expirer.
        expect((await banc.inventaire.expirer(T16)).filter((e) => e.departId === d)).toEqual([]);
      });

      it("cinquante demandes simultanées du même siège (blocages et ventes) : une seule est servie", async () => {
        const d = await nouveauDepart();
        const r = await Promise.all(
          Array.from({ length: 50 }, (_, i) =>
            i % 2 === 0 ? bloquer(d, 9, `v${i}`) : occuper(d, 9),
          ),
        );
        expect(r.filter((x) => x.ok)).toHaveLength(1);
        expect((await banc.inventaire.plan(d)).version).toBe(1);
      });

      it("vingt ventes simultanées de cinq sièges : un billet par siège, des versions toutes différentes", async () => {
        const d = await nouveauDepart();
        const r = await Promise.all(Array.from({ length: 20 }, (_, i) => occuper(d, (i % 5) + 1)));
        const ok = r.filter((x): x is { ok: true; version: number } => x.ok);
        expect(ok).toHaveLength(5);
        expect(ok.map((x) => x.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        const plan = await banc.inventaire.plan(d);
        expect(Object.keys(plan.occupes)).toHaveLength(5);
        expect(plan.version).toBe(5);
      });

      it("la vente et l'expiration d'un même blocage se croisent sans perdre ni doubler le siège", async () => {
        const d = await nouveauDepart();
        for (let siege = 1; siege <= 6; siege++) await bloquer(d, siege, "v1");
        const [expires, ...ventes] = await Promise.all([
          banc.inventaire.expirer(T16),
          ...[1, 2, 3, 4, 5, 6].map((s) => occuper(d, s, randomUUID(), "v1", T0)),
        ]);
        const plan = await banc.inventaire.plan(d);
        // Quel que soit l'ordre, chaque siège finit vendu une fois, et aucun n'est à la fois vendu
        // et bloqué : la vente consomme le blocage, ou l'expiration le supprime avant la vente.
        const expiresIci = expires.filter((e) => e.departId === d).length;
        expect(ventes.filter((v) => v.ok)).toHaveLength(6);
        expect(Object.keys(plan.occupes)).toHaveLength(6);
        expect(Object.keys(plan.bloques)).toHaveLength(0);
        expect(expiresIci).toBeLessThanOrEqual(6);
        // 6 blocages + 6 ventes + les expirations qui ont eu lieu : chaque changement a sa version.
        expect(plan.version).toBe(12 + expiresIci);
      });
    });

    /* ------------------------------------------------------------------ commandes */

    describe("commandes", () => {
      it("écrit une commande et la relit telle quelle", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const v = await banc.monde.personne();
        const c = commande(v.id, d.id, {
          conversion: { devise: "CAD", montantMineur: 1290, approximatif: true },
          codePromo: "JOURJ",
          type: "proche",
        });
        await banc.commandes.ajouter(c);
        expect(await banc.commandes.trouver(c.id)).toEqual(c);
        expect(await banc.commandes.trouver(randomUUID())).toBeNull();
        expect(await banc.commandes.trouver("pas-un-uuid")).toBeNull();
      });

      it("liste les commandes d'un départ par statut", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const d2 = await banc.monde.depart(r);
        const v = await banc.monde.personne();
        const a = commande(v.id, d.id);
        const b = commande(v.id, d.id, { statut: "payee" });
        const c = commande(v.id, d2.id);
        for (const x of [a, b, c]) await banc.commandes.ajouter(x);
        expect(
          (await banc.commandes.duDepart(d.id, "en_attente_paiement")).map((x) => x.id),
        ).toEqual([a.id]);
        expect((await banc.commandes.duDepart(d.id, "payee")).map((x) => x.id)).toEqual([b.id]);
        expect(await banc.commandes.duDepart(d.id, "expiree")).toEqual([]);
      });

      it("retrouve les commandes en attente dont l'échéance est passée", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const v = await banc.monde.personne();
        const echue = commande(v.id, d.id, { expireA: "2027-01-05T09:10:00.000+01:00" });
        const vivante = commande(v.id, d.id, { expireA: "2027-01-05T09:50:00.000+01:00" });
        const payee = commande(v.id, d.id, {
          expireA: "2027-01-05T09:10:00.000+01:00",
          statut: "payee",
        });
        for (const x of [echue, vivante, payee]) await banc.commandes.ajouter(x);
        const ids = (await banc.commandes.enAttenteExpirees("2027-01-05T09:30:00.000+01:00")).map(
          (x) => x.id,
        );
        expect(ids).toContain(echue.id);
        expect(ids).not.toContain(vivante.id);
        expect(ids).not.toContain(payee.id);
        // L'échéance elle-même compte comme échue.
        expect(
          (await banc.commandes.enAttenteExpirees("2027-01-05T09:50:00.000+01:00")).map(
            (x) => x.id,
          ),
        ).toContain(vivante.id);
      });

      it("change le statut d'une commande seulement s'il est encore l'un des statuts attendus", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const v = await banc.monde.personne();
        const c = commande(v.id, d.id);
        await banc.commandes.ajouter(c);
        const billetId = randomUUID();
        const payee = await banc.commandes.transitionner(c.id, ["en_attente_paiement"], {
          statut: "payee",
          billetIds: [billetId],
          moyenPaiement: "mtn_momo",
        });
        expect(payee).toEqual({
          ...c,
          statut: "payee",
          billetIds: [billetId],
          moyenPaiement: "mtn_momo",
        });
        expect(
          await banc.commandes.transitionner(c.id, ["en_attente_paiement"], { statut: "expiree" }),
        ).toBeNull();
        expect((await banc.commandes.trouver(c.id))?.statut).toBe("payee");
        expect(
          await banc.commandes.transitionner(randomUUID(), ["en_attente_paiement"], {
            statut: "expiree",
          }),
        ).toBeNull();
      });

      it("un paiement et une expiration simultanés : un seul des deux passe", async () => {
        const r = await banc.monde.reseau();
        const d = await banc.monde.depart(r);
        const v = await banc.monde.personne();
        const c = commande(v.id, d.id);
        await banc.commandes.ajouter(c);
        const reponses = await Promise.all([
          ...Array.from({ length: 5 }, () =>
            banc.commandes.transitionner(c.id, ["en_attente_paiement"], { statut: "payee" }),
          ),
          ...Array.from({ length: 5 }, () =>
            banc.commandes.transitionner(c.id, ["en_attente_paiement"], { statut: "expiree" }),
          ),
        ]);
        expect(reponses.filter((x) => x !== null)).toHaveLength(1);
        const final = await banc.commandes.trouver(c.id);
        expect(final?.statut).toBe(reponses.find((x) => x !== null)?.statut);
      });
    });

    /* ------------------------------------------------------------------ scans */

    describe("scans", () => {
      it("écrit un scan et le relit tel quel, avec ses valeurs vides", async () => {
        const departId = randomUUID();
        const s = scan(departId, {
          premierScanA: "2027-01-06T13:00:00.000+01:00",
          resultat: "deja_scanne",
        });
        const vide = scan(departId, {
          billetId: null,
          numero: null,
          siege: null,
          classe: null,
          bagagesSoute: 0,
          resultat: "introuvable",
        });
        await banc.scans.ajouter(s);
        await banc.scans.ajouter(vide);
        expect(await banc.scans.parEvenement(s.evenementId)).toEqual(s);
        expect(await banc.scans.parEvenement(vide.evenementId)).toEqual(vide);
        expect(await banc.scans.parEvenement(randomUUID())).toBeNull();
        expect(await banc.scans.parEvenement("pas-un-uuid")).toBeNull();
      });

      it("un scan rejoué n'est écrit qu'une fois, même simultané ; le premier fait foi", async () => {
        const departId = randomUUID();
        const s = scan(departId);
        await Promise.all([
          ...Array.from({ length: 8 }, () => banc.scans.ajouter(s)),
          banc.scans.ajouter({ ...s, resultat: "annule" }),
        ]);
        const lignes = await banc.scans.duDepart(departId);
        expect(lignes).toHaveLength(1);
      });

      it("liste les scans d'un départ dans l'ordre où ils ont eu lieu", async () => {
        const departId = randomUUID();
        const tard = scan(departId, { at: "2027-01-06T13:30:00.000+01:00" });
        const tot = scan(departId, { at: "2027-01-06T13:10:00.000+01:00" });
        await banc.scans.ajouter(tard);
        await banc.scans.ajouter(tot);
        await banc.scans.ajouter(scan(randomUUID()));
        expect((await banc.scans.duDepart(departId)).map((x) => x.evenementId)).toEqual([
          tot.evenementId,
          tard.evenementId,
        ]);
      });
    });

    /* ------------------------------------------------------------------ événements traités */

    describe("événements traités", () => {
      it("mémorise la réponse d'un événement et la rend telle quelle", async () => {
        const e = {
          id: randomUUID(),
          type: "billet.vendu",
          recuA: T0,
          reponseChiffree: "v1:chiffre:réponse",
        };
        expect(await banc.traites.trouver(e.id)).toBeNull();
        expect(await banc.traites.memoriser(e)).toBe(true);
        expect(await banc.traites.trouver(e.id)).toEqual(e);
        expect(await banc.traites.trouver("pas-un-uuid")).toBeNull();
      });

      it("rejouer ne remplace rien ; vingt requêtes simultanées : une seule mémorise", async () => {
        const id = randomUUID();
        const e = { id, type: "billet.vendu", recuA: T0, reponseChiffree: "premiere" };
        const reponses = await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            banc.traites.memoriser({ ...e, reponseChiffree: i === 0 ? "premiere" : `autre-${i}` }),
          ),
        );
        expect(reponses.filter(Boolean)).toHaveLength(1);
        const gardee = await banc.traites.trouver(id);
        expect(gardee?.reponseChiffree).toBeDefined();
        expect(await banc.traites.memoriser(e)).toBe(false);
        expect((await banc.traites.trouver(id))?.reponseChiffree).toBe(gardee?.reponseChiffree);
      });
    });

    /* ------------------------------------------------------------------ préférences */

    describe("préférences du voyageur", () => {
      it("marque et retire une compagnie préférée, sans doublon", async () => {
        const v = await banc.monde.personne();
        const c1 = randomUUID();
        const c2 = randomUUID();
        expect(await banc.preferences.compagniesPreferees(v.id)).toEqual(new Set());
        await banc.preferences.definirPreferee(v.id, c1, true);
        await banc.preferences.definirPreferee(v.id, c1, true);
        await banc.preferences.definirPreferee(v.id, c2, true);
        expect(await banc.preferences.compagniesPreferees(v.id)).toEqual(new Set([c1, c2]));
        await banc.preferences.definirPreferee(v.id, c1, false);
        await banc.preferences.definirPreferee(v.id, c1, false);
        expect(await banc.preferences.compagniesPreferees(v.id)).toEqual(new Set([c2]));
        // Un autre voyageur n'est pas concerné.
        const autre = await banc.monde.personne();
        expect(await banc.preferences.compagniesPreferees(autre.id)).toEqual(new Set());
      });

      it("mémorise les filtres d'un trajet, les remplace, et ne les mélange pas avec un autre trajet", async () => {
        const v = await banc.monde.personne();
        expect(await banc.preferences.filtres(v.id, "DLA", "YDE")).toBeNull();
        const f1 = { matin: true, prixMax: 5000 } as never;
        const f2 = { coteACote: true } as never;
        await banc.preferences.enregistrerFiltres(v.id, "DLA", "YDE", f1);
        expect(await banc.preferences.filtres(v.id, "DLA", "YDE")).toEqual(f1);
        await banc.preferences.enregistrerFiltres(v.id, "DLA", "YDE", f2);
        expect(await banc.preferences.filtres(v.id, "DLA", "YDE")).toEqual(f2);
        expect(await banc.preferences.filtres(v.id, "YDE", "DLA")).toBeNull();
        expect(
          await banc.preferences.filtres((await banc.monde.personne()).id, "DLA", "YDE"),
        ).toBeNull();
      });
    });
  });
}
