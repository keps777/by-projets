import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { LienPaiement, Paiement, ReglageMode, Remboursement } from "../modeles";
import type {
  ComptesReversement,
  LiensPaiement,
  NotificationsTraitees,
  Paiements,
  ReglagesPaiements,
  Remboursements,
} from "../ports";

/**
 * Contrat des six ports de stockage des paiements : les mêmes tests s'exécutent sur la mémoire
 * (toujours) et sur PostgreSQL (quand `DATABASE_URL_TEST` est donnée). Y compris les scénarios
 * simultanés : sur la mémoire ils passent par construction, sur PostgreSQL ils prouvent que les
 * index uniques et les mises à jour conditionnelles font le travail.
 *
 * Chaque test prend ses propres identifiants : la base n'est pas vidée entre deux tests.
 */

export interface BancPaiements {
  paiements: Paiements;
  remboursements: Remboursements;
  notifications: NotificationsTraitees;
  liens: LiensPaiement;
  comptes: ComptesReversement;
  reglages: ReglagesPaiements;
}

const T0 = new Date("2027-01-05T08:00:00.000Z");
export const apres = (ms: number): Date => new Date(T0.getTime() + ms);

export function unPaiement(surcharge: Partial<Paiement> = {}): Paiement {
  const id = surcharge.id ?? randomUUID();
  return {
    id,
    cle: null,
    origine: "voyageur",
    commandeId: randomUUID(),
    voyageurId: randomUUID(),
    compagnieId: randomUUID(),
    moyen: "mtn_momo",
    operateur: "mtn",
    montant: 4250,
    devise: null,
    repartition: [
      { beneficiaire: "compagnie", compteId: "compte-alpha", montant: 4000 },
      { beneficiaire: "afrimove", compteId: "compte-afrimove", montant: 250 },
    ],
    statut: "en_attente",
    confirmation: "a_faire",
    telephoneChiffre: `chiffre-${id}`,
    telephoneMasque: "+237 ••••• 345",
    fournisseur: null,
    idFournisseur: null,
    referenceOperateur: null,
    urlAuthentification: null,
    cause: null,
    billetIds: [],
    creeA: T0,
    expireA: new Date((surcharge.creeA ?? T0).getTime() + 180_000),
    termineA: null,
    ...surcharge,
  };
}

export function unRemboursement(
  paiementId: string,
  surcharge: Partial<Remboursement> = {},
): Remboursement {
  const id = surcharge.id ?? randomUUID();
  return {
    id,
    paiementId,
    cle: `billet-annule:${id}`,
    cause: "billet_annule",
    billetId: randomUUID(),
    lignes: [{ beneficiaire: "compagnie", montant: 1000 }],
    montant: 1000,
    statut: "demande",
    idFournisseur: null,
    referenceOperateur: null,
    tentatives: 0,
    prochainEssaiA: apres(60_000),
    derniereErreur: null,
    creeA: T0,
    termineA: null,
    ...surcharge,
  };
}

export const empreinte = (): string => createHash("sha256").update(randomUUID()).digest("hex");

export function unLien(commandeId: string, surcharge: Partial<LienPaiement> = {}): LienPaiement {
  return {
    id: randomUUID(),
    commandeId,
    empreinte: empreinte(),
    creePar: randomUUID(),
    creeA: T0,
    expireA: apres(900_000),
    envoyeA: "+237 ••••• 345",
    revoqueA: null,
    ...surcharge,
  };
}

const PLAFONDS = { compagnie: 4000, afrimove: 250 } as const;

export function contratStockagePaiements(nom: string, creer: () => Promise<BancPaiements>): void {
  describe(`stockage des paiements : ${nom}`, () => {
    describe("Paiements", () => {
      it("ouvre un paiement et le relit tel qu'il a été écrit, devise et répartition comprises", async () => {
        const { paiements } = await creer();
        const p = unPaiement({
          cle: `guichet:${randomUUID()}`,
          origine: "guichet",
          moyen: "carte",
          operateur: null,
          devise: { code: "CAD", montantMineur: 1290 },
          fournisseur: "agregateur",
          idFournisseur: `ext-${randomUUID()}`,
          referenceOperateur: "MP2701.1234",
          urlAuthentification: "https://3ds.example/auth",
          cause: "attente",
          billetIds: [randomUUID(), randomUUID()],
        });
        expect(await paiements.ouvrir(p)).toEqual({ cree: true });
        expect(await paiements.trouver(p.id)).toEqual(p);
        expect(await paiements.parCle(p.cle!)).toEqual(p);
        expect(await paiements.parIdFournisseur("agregateur", p.idFournisseur!)).toEqual(p);
        expect(await paiements.trouver(randomUUID())).toBeNull();
        expect(await paiements.trouver("paiement-inconnu")).toBeNull();
        expect(await paiements.parCle("cle-inconnue")).toBeNull();
        expect(await paiements.parIdFournisseur("agregateur", "ext-inconnu")).toBeNull();
      });

      it("refuse un deuxième paiement en attente pour la même commande, rend celui qui gêne", async () => {
        const { paiements } = await creer();
        const premier = unPaiement();
        await paiements.ouvrir(premier);
        const second = await paiements.ouvrir(unPaiement({ commandeId: premier.commandeId }));
        expect(second).toEqual({ cree: false, raison: "en_cours", existant: premier });
        // Une autre commande n'est pas gênée ; un paiement sans commande (guichet) non plus.
        expect((await paiements.ouvrir(unPaiement())).cree).toBe(true);
        expect(
          (await paiements.ouvrir(unPaiement({ commandeId: null, origine: "guichet" }))).cree,
        ).toBe(true);
        expect(
          (await paiements.ouvrir(unPaiement({ commandeId: null, origine: "guichet" }))).cree,
        ).toBe(true);
      });

      it("refuse une clé d'idempotence déjà connue avant de regarder la commande", async () => {
        const { paiements } = await creer();
        const cle = `agence:${randomUUID()}`;
        const premier = unPaiement({ cle });
        await paiements.ouvrir(premier);
        const rejeu = await paiements.ouvrir(unPaiement({ cle }));
        expect(rejeu).toEqual({ cree: false, raison: "cle_connue", existant: premier });
      });

      it("rouvre un paiement pour la commande quand le précédent n'est plus en attente", async () => {
        const { paiements } = await creer();
        const premier = unPaiement();
        await paiements.ouvrir(premier);
        await paiements.transitionner(premier.id, ["en_attente"], { statut: "echoue" });
        expect((await paiements.ouvrir(unPaiement({ commandeId: premier.commandeId }))).cree).toBe(
          true,
        );
        expect(await paiements.duCommande(premier.commandeId!)).toHaveLength(2);
      });

      it("liste les paiements d'une commande du plus ancien au plus récent", async () => {
        const { paiements } = await creer();
        const commandeId = randomUUID();
        const a = unPaiement({ commandeId, creeA: apres(0), statut: "echoue" });
        const b = unPaiement({ commandeId, creeA: apres(1000), statut: "echoue" });
        const c = unPaiement({ commandeId, creeA: apres(2000) });
        for (const p of [a, b, c]) await paiements.ouvrir(p);
        expect((await paiements.duCommande(commandeId)).map((p) => p.id)).toEqual([
          a.id,
          b.id,
          c.id,
        ]);
        expect(await paiements.duCommande(randomUUID())).toEqual([]);
        expect(await paiements.duCommande("commande-inconnue")).toEqual([]);
      });

      it("ne change le statut que depuis les statuts permis : comparer et remplacer", async () => {
        const { paiements } = await creer();
        const p = unPaiement();
        await paiements.ouvrir(p);
        const recu = await paiements.transitionner(p.id, ["en_attente", "expire"], {
          statut: "reussi",
          termineA: apres(5000),
          referenceOperateur: "MP.1",
          idFournisseur: `ext-${p.id}`,
          fournisseur: "agregateur",
        });
        expect(recu).toMatchObject({ statut: "reussi", referenceOperateur: "MP.1" });
        expect(recu?.termineA).toEqual(apres(5000));
        // Le même webhook une seconde fois : le paiement n'est plus en attente.
        expect(
          await paiements.transitionner(p.id, ["en_attente"], { statut: "echoue" }),
        ).toBeNull();
        expect((await paiements.trouver(p.id))?.statut).toBe("reussi");
        expect(await paiements.transitionner(randomUUID(), ["en_attente"], {})).toBeNull();
      });

      it("change la devise, la répartition et les billets par une modification", async () => {
        const { paiements } = await creer();
        const p = unPaiement({ devise: { code: "EUR", montantMineur: 650 } });
        await paiements.ouvrir(p);
        const billetIds = [randomUUID()];
        const maj = await paiements.modifier(p.id, {
          devise: null,
          cause: "montant_inattendu",
          billetIds,
          repartition: [{ beneficiaire: "compagnie", compteId: "c", montant: 4250 }],
        });
        expect(maj).toMatchObject({ devise: null, cause: "montant_inattendu", billetIds });
        expect(maj?.repartition).toHaveLength(1);
        expect(await paiements.modifier(randomUUID(), { cause: "x" })).toBeNull();
      });

      it("confirme la commande une fois : un deuxième paiement de la même commande est refusé", async () => {
        const { paiements } = await creer();
        const commandeId = randomUUID();
        const a = unPaiement({ commandeId, statut: "reussi" });
        const b = unPaiement({ commandeId, statut: "reussi", creeA: apres(1000) });
        await paiements.ouvrir(a);
        await paiements.ouvrir(b);
        const billets = [randomUUID()];
        expect(await paiements.confirmer(a.id, billets)).toBe(true);
        expect(await paiements.confirmer(a.id, billets)).toBe(false); // déjà faite
        expect(await paiements.confirmer(b.id, [randomUUID()])).toBe(false); // doublon
        expect(await paiements.trouver(a.id)).toMatchObject({
          confirmation: "faite",
          billetIds: billets,
        });
        expect(await paiements.trouver(b.id)).toMatchObject({
          confirmation: "a_faire",
          billetIds: [],
        });
        expect(await paiements.confirmer(randomUUID(), [])).toBe(false);
      });

      it("ne confirme pas un paiement sans commande (guichet)", async () => {
        const { paiements } = await creer();
        const p = unPaiement({ commandeId: null, origine: "guichet", confirmation: "sans_objet" });
        await paiements.ouvrir(p);
        expect(await paiements.confirmer(p.id, [])).toBe(false);
      });

      it("trouve les paiements à balayer et ceux dont les billets restent à émettre, les plus anciens d'abord", async () => {
        const { paiements } = await creer();
        // Des instants que personne d'autre n'utilise : on retrouve les nôtres par leur identifiant.
        const base = Date.parse("2031-06-01T00:00:00.000Z");
        const at = (ms: number) => new Date(base + ms);
        const vieux = unPaiement({ creeA: at(0) });
        const recent = unPaiement({ creeA: at(60_000) });
        const reussiAFaire = unPaiement({ creeA: at(10_000), statut: "reussi" });
        const reussiFait = unPaiement({
          creeA: at(20_000),
          statut: "reussi",
          confirmation: "faite",
        });
        for (const p of [recent, vieux, reussiAFaire, reussiFait]) await paiements.ouvrir(p);
        const attente = await paiements.enAttenteDepuis(at(30_000), 1000);
        const ids = attente.map((p) => p.id);
        expect(ids).toContain(vieux.id);
        expect(ids).not.toContain(recent.id); // trop récent
        expect(ids).not.toContain(reussiAFaire.id);
        const afaire = (await paiements.aConfirmer(1000)).map((p) => p.id);
        expect(afaire).toContain(reussiAFaire.id);
        expect(afaire).not.toContain(reussiFait.id);
        expect(afaire).not.toContain(vieux.id);
        expect(await paiements.aConfirmer(0)).toEqual([]);
      });

      it("liste par compagnie, statut et période, le plus récent d'abord, bornée", async () => {
        const { paiements } = await creer();
        const compagnieId = randomUUID();
        const p1 = unPaiement({ compagnieId, creeA: apres(0) });
        const p2 = unPaiement({ compagnieId, creeA: apres(1000), statut: "reussi" });
        const p3 = unPaiement({ compagnieId, creeA: apres(2000) });
        const autre = unPaiement({ creeA: apres(1500) });
        for (const p of [p1, p2, p3, autre]) await paiements.ouvrir(p);
        const tous = await paiements.lister({ compagnieId, limite: 10 });
        expect(tous.map((p) => p.id)).toEqual([p3.id, p2.id, p1.id]);
        expect((await paiements.lister({ compagnieId, limite: 2 })).map((p) => p.id)).toEqual([
          p3.id,
          p2.id,
        ]);
        expect(
          (await paiements.lister({ compagnieId, statut: "reussi", limite: 10 })).map((p) => p.id),
        ).toEqual([p2.id]);
        // du inclus, au exclu.
        expect(
          (
            await paiements.lister({ compagnieId, du: apres(1000), au: apres(2000), limite: 10 })
          ).map((p) => p.id),
        ).toEqual([p2.id]);
        expect(await paiements.lister({ compagnieId: "inconnue", limite: 10 })).toEqual([]);
      });

      it("dix demandes simultanées pour la même commande : un seul paiement est ouvert", async () => {
        const { paiements } = await creer();
        const commandeId = randomUUID();
        const resultats = await Promise.all(
          Array.from({ length: 10 }, () => paiements.ouvrir(unPaiement({ commandeId }))),
        );
        expect(resultats.filter((r) => r.cree)).toHaveLength(1);
        expect(resultats.filter((r) => !r.cree && r.raison === "en_cours")).toHaveLength(9);
        expect(await paiements.duCommande(commandeId)).toHaveLength(1);
      });

      it("dix demandes simultanées avec la même clé : un seul paiement, les autres reçoivent le même", async () => {
        const { paiements } = await creer();
        const cle = `guichet:${randomUUID()}`;
        const resultats = await Promise.all(
          Array.from({ length: 10 }, () => paiements.ouvrir(unPaiement({ cle, commandeId: null }))),
        );
        expect(resultats.filter((r) => r.cree)).toHaveLength(1);
        const existants = resultats.flatMap((r) => (r.cree ? [] : [r.existant.id]));
        expect(new Set(existants).size).toBe(1);
      });

      it("le même webhook en huit exemplaires : le paiement n'est reçu qu'une fois", async () => {
        const { paiements } = await creer();
        const p = unPaiement();
        await paiements.ouvrir(p);
        const resultats = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            paiements.transitionner(p.id, ["en_attente", "echoue", "expire"], {
              statut: "reussi",
              referenceOperateur: `ref-${i}`,
            }),
          ),
        );
        // La mémoire et la base laissent passer ceux qui partent d'un statut permis ; ce qui compte
        // pour le service, c'est qu'un seul parte de « en attente » : ceux qui suivent partent de
        // « reussi », qui n'est pas dans la liste.
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
      });

      it("deux paiements réussis de la même commande qui confirment en même temps : un seul jeu de billets", async () => {
        const { paiements } = await creer();
        for (let tour = 0; tour < 5; tour++) {
          const commandeId = randomUUID();
          const a = unPaiement({ commandeId, statut: "reussi" });
          const b = unPaiement({ commandeId, statut: "reussi" });
          await paiements.ouvrir(a);
          await paiements.ouvrir(b);
          const [ra, rb] = await Promise.all([
            paiements.confirmer(a.id, [randomUUID()]),
            paiements.confirmer(b.id, [randomUUID()]),
          ]);
          expect([ra, rb].filter(Boolean)).toHaveLength(1);
          const lignes = await paiements.duCommande(commandeId);
          expect(lignes.filter((p) => p.confirmation === "faite")).toHaveLength(1);
        }
      });
    });

    describe("Remboursements", () => {
      async function avecPaiement(b: BancPaiements) {
        const p = unPaiement({ statut: "reussi" });
        await b.paiements.ouvrir(p);
        return p;
      }

      it("enregistre un remboursement et le relit tel quel", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const r = unRemboursement(p.id, {
          idFournisseur: `rb-${randomUUID()}`,
          referenceOperateur: "RB.1",
          derniereErreur: "delai_depasse",
        });
        expect(await banc.remboursements.ajouter(r, PLAFONDS)).toBe("ok");
        expect(await banc.remboursements.trouver(r.id)).toEqual(r);
        expect(await banc.remboursements.parCle(r.cle)).toEqual(r);
        expect(await banc.remboursements.parIdFournisseur(r.idFournisseur!)).toEqual(r);
        expect(await banc.remboursements.dePaiement(p.id)).toEqual([r]);
        expect(await banc.remboursements.trouver(randomUUID())).toBeNull();
        expect(await banc.remboursements.trouver("rb-inconnu")).toBeNull();
        expect(await banc.remboursements.parCle("cle-inconnue")).toBeNull();
        expect(await banc.remboursements.dePaiement("paiement-inconnu")).toEqual([]);
      });

      it("refuse une clé déjà connue, avant même de regarder les plafonds", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const r = unRemboursement(p.id);
        expect(await banc.remboursements.ajouter(r, PLAFONDS)).toBe("ok");
        const rejeu = unRemboursement(p.id, {
          cle: r.cle,
          lignes: [{ beneficiaire: "compagnie", montant: 99999 }],
        });
        expect(await banc.remboursements.ajouter(rejeu, PLAFONDS)).toBe("cle_connue");
        expect(await banc.remboursements.dePaiement(p.id)).toHaveLength(1);
      });

      it("tient un plafond par bénéficiaire, sans compter les remboursements échoués", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const compagnie = (montant: number, surcharge: Partial<Remboursement> = {}) =>
          unRemboursement(p.id, {
            lignes: [{ beneficiaire: "compagnie", montant }],
            montant,
            ...surcharge,
          });
        const premier = compagnie(3000);
        expect(await banc.remboursements.ajouter(premier, PLAFONDS)).toBe("ok");
        expect(await banc.remboursements.ajouter(compagnie(1500), PLAFONDS)).toBe(
          "plafond_depasse",
        );
        expect(await banc.remboursements.ajouter(compagnie(1000), PLAFONDS)).toBe("ok");
        // Les frais d'AfriMove ont leur propre plafond.
        const frais = unRemboursement(p.id, {
          lignes: [{ beneficiaire: "afrimove", montant: 250 }],
          montant: 250,
        });
        expect(await banc.remboursements.ajouter(frais, PLAFONDS)).toBe("ok");
        // Un remboursement échoué libère sa part.
        await banc.remboursements.transitionner(premier.id, ["demande"], { statut: "echoue" });
        expect(await banc.remboursements.ajouter(compagnie(3000), PLAFONDS)).toBe("ok");
      });

      it("un remboursement à deux lignes dépasse si une seule ligne dépasse", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const r = unRemboursement(p.id, {
          lignes: [
            { beneficiaire: "compagnie", montant: 100 },
            { beneficiaire: "afrimove", montant: 251 },
          ],
          montant: 351,
        });
        expect(await banc.remboursements.ajouter(r, PLAFONDS)).toBe("plafond_depasse");
      });

      it("change le statut depuis les statuts permis seulement", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const r = unRemboursement(p.id);
        await banc.remboursements.ajouter(r, PLAFONDS);
        const fait = await banc.remboursements.transitionner(r.id, ["demande"], {
          statut: "reussi",
          termineA: apres(9000),
          prochainEssaiA: null,
          tentatives: 1,
          referenceOperateur: "RB.9",
        });
        expect(fait).toMatchObject({ statut: "reussi", tentatives: 1, prochainEssaiA: null });
        expect(fait?.termineA).toEqual(apres(9000));
        expect(
          await banc.remboursements.transitionner(r.id, ["demande"], { statut: "echoue" }),
        ).toBeNull();
        expect(await banc.remboursements.transitionner(randomUUID(), ["demande"], {})).toBeNull();
      });

      it("rend les remboursements à reprendre, échus, du plus ancien au plus récent", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const base = Date.parse("2032-01-01T00:00:00.000Z");
        const at = (ms: number) => new Date(base + ms);
        const echu1 = unRemboursement(p.id, {
          creeA: at(0),
          prochainEssaiA: at(1000),
          lignes: [{ beneficiaire: "compagnie", montant: 1 }],
          montant: 1,
        });
        const echu2 = unRemboursement(p.id, {
          creeA: at(10),
          prochainEssaiA: at(2000),
          lignes: [{ beneficiaire: "compagnie", montant: 1 }],
          montant: 1,
        });
        const futur = unRemboursement(p.id, {
          creeA: at(20),
          prochainEssaiA: at(99_000),
          lignes: [{ beneficiaire: "compagnie", montant: 1 }],
          montant: 1,
        });
        const sans = unRemboursement(p.id, {
          creeA: at(30),
          prochainEssaiA: null,
          lignes: [{ beneficiaire: "compagnie", montant: 1 }],
          montant: 1,
        });
        const fait = unRemboursement(p.id, {
          creeA: at(40),
          statut: "reussi",
          prochainEssaiA: at(500),
          lignes: [{ beneficiaire: "compagnie", montant: 1 }],
          montant: 1,
        });
        for (const r of [echu2, futur, echu1, sans, fait]) {
          expect(await banc.remboursements.ajouter(r, { compagnie: 100, afrimove: 100 })).toBe(
            "ok",
          );
        }
        const ids = (await banc.remboursements.aReprendre(at(5000), 1000)).map((r) => r.id);
        expect(
          ids.filter((id) => [echu1.id, echu2.id, futur.id, sans.id, fait.id].includes(id)),
        ).toEqual([echu1.id, echu2.id]);
        expect(await banc.remboursements.aReprendre(at(5000), 0)).toEqual([]);
      });

      it("dix demandes simultanées de 1 000 F pour 4 000 F encaissés : quatre passent, pas une de plus", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const resultats = await Promise.all(
          Array.from({ length: 10 }, () =>
            banc.remboursements.ajouter(unRemboursement(p.id), PLAFONDS),
          ),
        );
        expect(resultats.filter((r) => r === "ok")).toHaveLength(4);
        expect(resultats.filter((r) => r === "plafond_depasse")).toHaveLength(6);
        const total = (await banc.remboursements.dePaiement(p.id)).reduce(
          (s, r) => s + r.montant,
          0,
        );
        expect(total).toBe(4000);
      });

      it("la même clé demandée dix fois en même temps : un seul remboursement", async () => {
        const banc = await creer();
        const p = await avecPaiement(banc);
        const cle = `afrimove:${randomUUID()}`;
        const resultats = await Promise.all(
          Array.from({ length: 10 }, () =>
            banc.remboursements.ajouter(unRemboursement(p.id, { cle }), PLAFONDS),
          ),
        );
        expect(resultats.filter((r) => r === "ok")).toHaveLength(1);
        expect(resultats.filter((r) => r === "cle_connue")).toHaveLength(9);
      });
    });

    describe("NotificationsTraitees", () => {
      it("mémorise un événement une fois et le reconnaît ensuite", async () => {
        const { notifications } = await creer();
        const evt = `evt-${randomUUID()}`;
        expect(await notifications.connue("agregateur", evt)).toBe(false);
        expect(await notifications.memoriser("agregateur", evt, T0)).toBe(true);
        expect(await notifications.memoriser("agregateur", evt, T0)).toBe(false);
        expect(await notifications.connue("agregateur", evt)).toBe(true);
        // Un autre fournisseur peut réutiliser le même identifiant.
        expect(await notifications.connue("autre", evt)).toBe(false);
        expect(await notifications.memoriser("autre", evt, T0)).toBe(true);
      });

      it("douze exemplaires simultanés du même événement : un seul est nouveau", async () => {
        const { notifications } = await creer();
        const evt = `evt-${randomUUID()}`;
        const resultats = await Promise.all(
          Array.from({ length: 12 }, () => notifications.memoriser("agregateur", evt, T0)),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
      });
    });

    describe("LiensPaiement", () => {
      it("enregistre un lien et le retrouve par l'empreinte de son jeton", async () => {
        const { liens } = await creer();
        const lien = unLien(randomUUID());
        await liens.remplacer(lien);
        expect(await liens.parEmpreinte(lien.empreinte)).toEqual(lien);
        expect(await liens.parEmpreinte(empreinte())).toBeNull();
      });

      it("un nouveau lien révoque le précédent de la commande, pas ceux des autres", async () => {
        const { liens } = await creer();
        const commandeId = randomUUID();
        const autre = unLien(randomUUID());
        const premier = unLien(commandeId, { creeA: apres(0) });
        const second = unLien(commandeId, { creeA: apres(5000) });
        await liens.remplacer(autre);
        await liens.remplacer(premier);
        await liens.remplacer(second);
        expect((await liens.parEmpreinte(premier.empreinte))?.revoqueA).toEqual(apres(5000));
        expect((await liens.parEmpreinte(second.empreinte))?.revoqueA).toBeNull();
        expect((await liens.parEmpreinte(autre.empreinte))?.revoqueA).toBeNull();
      });

      it("huit liens demandés en même temps pour la même commande : un seul reste vivant", async () => {
        const { liens } = await creer();
        const commandeId = randomUUID();
        const tous = Array.from({ length: 8 }, (_, i) => unLien(commandeId, { creeA: apres(i) }));
        await Promise.all(tous.map((l) => liens.remplacer(l)));
        const lus = await Promise.all(tous.map((l) => liens.parEmpreinte(l.empreinte)));
        expect(lus.filter((l) => l !== null && l.revoqueA === null)).toHaveLength(1);
        expect(lus.filter((l) => l !== null)).toHaveLength(8);
      });
    });

    describe("ComptesReversement", () => {
      it("définit, remplace et retire le compte d'une compagnie", async () => {
        const { comptes } = await creer();
        const compagnieId = randomUUID();
        expect(await comptes.compte(compagnieId)).toBeNull();
        await comptes.definir(compagnieId, "compte-1");
        expect(await comptes.compte(compagnieId)).toBe("compte-1");
        await comptes.definir(compagnieId, "compte-2");
        expect(await comptes.compte(compagnieId)).toBe("compte-2");
        await comptes.definir(compagnieId, null);
        expect(await comptes.compte(compagnieId)).toBeNull();
        await comptes.definir(compagnieId, null); // retirer un compte absent ne lève rien
        expect(await comptes.compte("compagnie-inconnue")).toBeNull();
      });

      it("dix définitions simultanées : une seule ligne, aucune erreur", async () => {
        const { comptes } = await creer();
        const compagnieId = randomUUID();
        await Promise.all(
          Array.from({ length: 10 }, (_, i) => comptes.definir(compagnieId, `compte-${i}`)),
        );
        expect(await comptes.compte(compagnieId)).toMatch(/^compte-\d$/);
      });
    });

    describe("ReglagesPaiements", () => {
      it("garde le dernier réglage, une seule ligne", async () => {
        const { reglages } = await creer();
        const parId = randomUUID();
        const a: ReglageMode = { degrade: true, motif: "agrégateur en panne", parId, at: T0 };
        await reglages.definir(a);
        expect(await reglages.lire()).toEqual(a);
        const b: ReglageMode = { degrade: false, motif: null, parId: null, at: null };
        await reglages.definir(b);
        expect(await reglages.lire()).toEqual(b);
      });
    });
  });
}
