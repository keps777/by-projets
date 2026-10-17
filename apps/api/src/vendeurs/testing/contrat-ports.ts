import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { versIsoDouala } from "../../relais/temps";
import type { Agrement, CreditCommission, Vendeur, Vente } from "../modele";
import type {
  AgrementsRepository,
  CommissionsVendeurs,
  NumerosVendeurs,
  VendeursRepository,
  VentesRepository,
} from "../ports";

/**
 * Contrat des ports de stockage des vendeurs ambulants : les mêmes tests passent sur la mémoire et sur
 * PostgreSQL. Un comportement que l'une a et que l'autre n'a pas fait échouer l'un des deux : c'est ce
 * qui prouve que la mémoire, sur laquelle tournent tous les autres tests, se comporte comme la base
 * (une seule vente en attente par vendeur, un voisin jamais servi deux fois, un versement jamais doublé…).
 */

export interface BancVendeurs {
  vendeurs: VendeursRepository;
  agrements: AgrementsRepository;
  numeros: NumerosVendeurs;
  ventes: VentesRepository;
  commissions: CommissionsVendeurs;
  /** Un compte (en base : une ligne `personne`). */
  personne(): Promise<string>;
  /** Une agence (en base : une ligne `compagnie`). */
  compagnie(): Promise<string>;
  /** Un départ d'une agence (en base : la ligne `depart` et ce qu'elle suppose). */
  depart(): Promise<{ departId: string; compagnieId: string }>;
  /** Un vendeur déjà écrit dans le dépôt (son compte existe). */
  vendeur(over?: Partial<Vendeur>): Promise<Vendeur>;
  fermer(): Promise<void>;
}

export const T0 = "2027-01-05T09:00:00.000+01:00";
export const apres = (minutes: number, depuis = T0): string =>
  versIsoDouala(Date.parse(depuis) + minutes * 60_000);

let compteur = 0;
const suivant = (): number => {
  compteur += 1;
  return compteur;
};

export function unVendeur(id: string, o: Partial<Vendeur> = {}): Vendeur {
  const n = suivant();
  return {
    id,
    version: 1,
    numero: `V-T${String(n).padStart(6, "0")}-${randomUUID().slice(0, 4)}`,
    nom: "Paul Ekani",
    telephone: "+237677112233",
    quartier: "Mokolo",
    ville: "Yaoundé",
    momo: { telephone: "+237677112233", operateur: "mtn" },
    actif: true,
    creeA: T0,
    ...o,
  };
}

export function unAgrement(
  vendeurId: string,
  compagnieId: string,
  accordePar: string,
  o: Partial<Agrement> = {},
): Agrement {
  return {
    vendeurId,
    compagnieId,
    compagnieNom: "Alpha Voyages",
    etat: "actif",
    commissionClassique: 100,
    commissionVip: 150,
    accordeLe: T0,
    accordePar,
    retireLe: null,
    ...o,
  };
}

export function uneVente(
  vendeurId: string,
  depart: { departId: string; compagnieId: string },
  o: Partial<Vente> = {},
): Vente {
  const n = suivant();
  return {
    id: randomUUID(),
    version: 1,
    vendeurId,
    compagnieId: depart.compagnieId,
    departId: depart.departId,
    billetId: randomUUID(),
    billetNumero: null,
    siege: 7,
    voisin: { nom: "Marie Nkoa", telephone: `+2376990${String(10000 + n)}` },
    voisinIndex: `idx-${randomUUID()}`,
    empreinte: `emp-${randomUUID()}`,
    origine: { code: "DLA", ville: "Douala" },
    destination: { code: "YDE", ville: "Yaoundé" },
    classe: "classique",
    departA: apres(180),
    prix: 4500,
    commission: 100,
    moyen: "mtn_momo",
    etat: "en_attente",
    creeA: T0,
    expireA: apres(10),
    reference: null,
    regleeA: null,
    cause: null,
    termineeA: null,
    majA: T0,
    ...o,
  };
}

export function contratPortsVendeurs(titre: string, creerBanc: () => Promise<BancVendeurs>): void {
  describe(titre, () => {
    let banc: BancVendeurs | null = null;
    const obtenir = async (): Promise<BancVendeurs> => (banc ??= await creerBanc());
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("VendeursRepository", () => {
      it("garde un vendeur tel qu'il a été écrit, noms et téléphones compris", async () => {
        const b = await obtenir();
        const v = unVendeur(await b.personne(), {
          nom: "Éloïse Tchamba",
          momo: { telephone: "+237699887766", operateur: "orange" },
        });
        expect(await b.vendeurs.ajouter(v)).toBe(true);
        expect(await b.vendeurs.trouver(v.id)).toEqual(v);
        expect(await b.vendeurs.trouver(randomUUID())).toBeNull();
        expect(await b.vendeurs.trouver("pas-un-uuid")).toBeNull();
      });

      it("refuse un identifiant ou un numéro déjà pris", async () => {
        const b = await obtenir();
        const v = unVendeur(await b.personne());
        expect(await b.vendeurs.ajouter(v)).toBe(true);
        expect(await b.vendeurs.ajouter(v)).toBe(false);
        expect(await b.vendeurs.ajouter(unVendeur(await b.personne(), { numero: v.numero }))).toBe(
          false,
        );
      });

      it("liste par identifiants, dans l'ordre des numéros", async () => {
        const b = await obtenir();
        const un = await b.vendeur({ numero: `V-L${String(suivant()).padStart(6, "0")}-a` });
        const deux = await b.vendeur({ numero: `V-L${String(suivant()).padStart(6, "0")}-b` });
        const trois = await b.vendeur({ numero: `V-L${String(suivant()).padStart(6, "0")}-c` });
        const lus = await b.vendeurs.lister({ ids: [trois.id, un.id, deux.id, randomUUID()] });
        expect(lus.map((v) => v.id)).toEqual([un.id, deux.id, trois.id]);
        expect(await b.vendeurs.lister({ ids: [] })).toEqual([]);
        expect((await b.vendeurs.lister()).length).toBeGreaterThanOrEqual(3);
      });

      it("remplacer exige la version lue : de cinq écritures simultanées, une seule passe", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const essais = await Promise.all(
          [1, 2, 3, 4, 5].map((i) => b.vendeurs.remplacer({ ...v, quartier: `Quartier ${i}` }, 1)),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        const lu = (await b.vendeurs.trouver(v.id))!;
        expect(lu.version).toBe(2);
        expect(await b.vendeurs.remplacer({ ...lu, actif: false }, 1)).toBe(false);
        expect(await b.vendeurs.remplacer({ ...lu, actif: false }, 2)).toBe(true);
        expect(await b.vendeurs.remplacer(unVendeur(await b.personne()), 1)).toBe(false);
      });

      it("remplacer ne change pas le numéro", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        expect(await b.vendeurs.remplacer({ ...v, numero: "V-AUTRE", nom: "Paul K." }, 1)).toBe(
          true,
        );
        expect(await b.vendeurs.trouver(v.id)).toEqual({ ...v, version: 2, nom: "Paul K." });
      });
    });

    describe("AgrementsRepository", () => {
      it("garde un agrément, le remplace par la même clé et le lit par vendeur et par agence", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const agence = await b.compagnie();
        const autre = await b.compagnie();
        const par = await b.personne();
        const a = unAgrement(v.id, agence, par, { compagnieNom: "Étoile du Sud" });
        const c = unAgrement(v.id, autre, par, { compagnieNom: "Alpha Voyages" });
        await b.agrements.enregistrer(a);
        await b.agrements.enregistrer(c);
        expect(await b.agrements.trouver(v.id, agence)).toEqual(a);
        expect(await b.agrements.trouver(v.id, randomUUID())).toBeNull();
        expect(await b.agrements.trouver("pas-un-uuid", agence)).toBeNull();
        // Par ordre alphabétique français, accents compris : « Alpha » avant « Étoile ».
        expect((await b.agrements.deVendeur(v.id)).map((x) => x.compagnieId)).toEqual([
          autre,
          agence,
        ]);
        expect((await b.agrements.deCompagnie(agence)).map((x) => x.vendeurId)).toContain(v.id);

        // Un agrément retiré est redonné par une mise à jour de la même ligne.
        const retire = { ...a, etat: "retire" as const, retireLe: apres(60) };
        await b.agrements.enregistrer(retire);
        expect(await b.agrements.trouver(v.id, agence)).toEqual(retire);
        const redonne = { ...a, accordeLe: apres(120), commissionVip: 300 };
        await b.agrements.enregistrer(redonne);
        expect(await b.agrements.trouver(v.id, agence)).toEqual(redonne);
        expect(await b.agrements.deVendeur(v.id)).toHaveLength(2);
      });
    });

    describe("NumerosVendeurs", () => {
      it("donne des numéros sans trou ni doublon, même demandés en parallèle", async () => {
        const b = await obtenir();
        const numeros = await Promise.all(Array.from({ length: 12 }, () => b.numeros.prochain()));
        expect(new Set(numeros).size).toBe(12);
        expect(Math.max(...numeros) - Math.min(...numeros)).toBe(11);
        expect(Math.min(...numeros)).toBeGreaterThanOrEqual(1);
        expect(await b.numeros.prochain()).toBe(Math.max(...numeros) + 1);
      });
    });

    describe("VentesRepository", () => {
      it("garde une vente telle qu'elle a été écrite, voisin compris", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const vente = uneVente(v.id, await b.depart(), {
          voisin: { nom: "Éloïse Ngo", telephone: "+237699887766" },
          classe: "vip",
          prix: 9000,
          commission: 150,
          moyen: "orange_money",
        });
        expect(await b.ventes.ajouter(vente)).toEqual({ resultat: "ajoutee" });
        expect(await b.ventes.trouver(vente.id)).toEqual(vente);
        expect(await b.ventes.trouver(randomUUID())).toBeNull();
        expect(await b.ventes.trouver("pas-un-uuid")).toBeNull();
      });

      it("refuse un billet déjà pris, un voisin déjà servi sur ce départ et une seconde vente en attente", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const depart = await b.depart();
        const premiere = uneVente(v.id, depart);
        expect(await b.ventes.ajouter(premiere)).toEqual({ resultat: "ajoutee" });

        expect(
          await b.ventes.ajouter(uneVente(v.id, await b.depart(), { billetId: premiere.billetId })),
        ).toEqual({ resultat: "billet_pris" });
        // Même voisin sur le même départ.
        const doublon = await b.ventes.ajouter(
          uneVente(v.id, depart, { empreinte: premiere.empreinte }),
        );
        expect(doublon).toMatchObject({ resultat: "doublon" });
        expect(doublon.resultat === "doublon" && doublon.existante.id).toBe(premiere.id);
        // Un autre voisin, un autre départ : le vendeur a déjà une vente qui attend son règlement.
        const enCours = await b.ventes.ajouter(uneVente(v.id, await b.depart()));
        expect(enCours).toMatchObject({ resultat: "vente_en_cours" });
        expect(enCours.resultat === "vente_en_cours" && enCours.existante.id).toBe(premiere.id);
        // Un autre vendeur n'est pas concerné.
        const autre = await b.vendeur();
        expect(await b.ventes.ajouter(uneVente(autre.id, depart))).toEqual({ resultat: "ajoutee" });
      });

      it("cinq ventes simultanées du même vendeur : une seule attend son règlement", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const departs = await Promise.all([1, 2, 3, 4, 5].map(() => b.depart()));
        const rep = await Promise.all(departs.map((d) => b.ventes.ajouter(uneVente(v.id, d))));
        expect(rep.filter((r) => r.resultat === "ajoutee")).toHaveLength(1);
        expect(rep.filter((r) => r.resultat === "vente_en_cours")).toHaveLength(4);
      });

      it("une vente réglée libère le vendeur, mais le voisin reste servi ; une vente refusée libère aussi le voisin", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const depart = await b.depart();
        const vente = uneVente(v.id, depart);
        await b.ventes.ajouter(vente);
        const reglee = await b.ventes.transitionner(vente.id, ["en_attente"], {
          etat: "reglee",
          regleeA: apres(2),
          reference: "MM-REG-1",
          majA: apres(2),
        });
        expect(reglee).toMatchObject({ etat: "reglee", version: 2, reference: "MM-REG-1" });
        // Libre d'en vendre une autre ailleurs…
        const suivante = uneVente(v.id, await b.depart());
        expect(await b.ventes.ajouter(suivante)).toEqual({ resultat: "ajoutee" });
        // …mais pas au même voisin sur le même départ.
        expect(
          await b.ventes.ajouter(uneVente(v.id, depart, { empreinte: vente.empreinte })),
        ).toMatchObject({ resultat: "doublon" });
        // Refusée : le voisin peut racheter sur ce départ (après avoir libéré la vente en attente).
        await b.ventes.transitionner(suivante.id, ["en_attente"], { etat: "refusee" });
        await b.ventes.transitionner(vente.id, ["reglee"], { etat: "refusee" });
        expect(
          await b.ventes.ajouter(uneVente(v.id, depart, { empreinte: vente.empreinte })),
        ).toEqual({ resultat: "ajoutee" });
      });

      it("transitionner ne s'applique que depuis les états attendus, et une seule fois sous concurrence", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const vente = uneVente(v.id, await b.depart());
        await b.ventes.ajouter(vente);
        expect(
          await b.ventes.transitionner(vente.id, ["reglee", "terminee"], { etat: "terminee" }),
        ).toBeNull();
        expect(
          await b.ventes.transitionner(randomUUID(), ["en_attente"], { etat: "reglee" }),
        ).toBeNull();
        expect(
          await b.ventes.transitionner("pas-un-uuid", ["en_attente"], { etat: "reglee" }),
        ).toBeNull();
        const rep = await Promise.all(
          [1, 2, 3, 4, 5].map((i) =>
            b.ventes.transitionner(vente.id, ["en_attente"], {
              etat: "reglee",
              reference: `MM-${i}`,
              regleeA: apres(i),
            }),
          ),
        );
        expect(rep.filter((r) => r !== null)).toHaveLength(1);
        const lue = (await b.ventes.trouver(vente.id))!;
        expect(lue.version).toBe(2);
        expect(lue.etat).toBe("reglee");
        // La fin d'une vente : billet, numéro, instants.
        const finie = await b.ventes.transitionner(vente.id, ["reglee"], {
          etat: "terminee",
          billetNumero: "BIL-0001",
          termineeA: apres(30),
          siege: null,
          cause: null,
        });
        expect(finie).toMatchObject({
          etat: "terminee",
          billetNumero: "BIL-0001",
          siege: null,
          version: 3,
          vendeurId: v.id,
          voisin: vente.voisin,
        });
        expect(finie?.termineeA).toBe(apres(30));
      });

      it("lit les ventes d'un vendeur par état et par période, et les ventes par état", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const base = "2031-03-10T08:00:00.000+01:00";
        const faire = async (over: Partial<Vente>): Promise<Vente> => {
          const vente = uneVente(v.id, await b.depart(), over);
          expect(await b.ventes.ajouter(vente)).toEqual({ resultat: "ajoutee" });
          return vente;
        };
        const a = await faire({ creeA: apres(0, base), etat: "terminee" });
        const c = await faire({ creeA: apres(60, base), etat: "refusee" });
        const d = await faire({ creeA: apres(120, base), etat: "terminee" });
        const ids = (l: Vente[]): string[] => l.map((x) => x.id);
        expect(ids(await b.ventes.duVendeur(v.id))).toEqual([a.id, c.id, d.id]);
        expect(ids(await b.ventes.duVendeur(v.id, { etats: ["terminee"] }))).toEqual([a.id, d.id]);
        expect(
          ids(await b.ventes.duVendeur(v.id, { depuis: apres(30, base), avant: apres(120, base) })),
        ).toEqual([c.id]);
        expect(ids(await b.ventes.duVendeur(v.id, { depuis: apres(120, base) }))).toEqual([d.id]);
        expect(await b.ventes.duVendeur(randomUUID())).toEqual([]);
        const refusees = (await b.ventes.parEtats(["refusee"])).map((x) => x.id);
        expect(refusees).toContain(c.id);
        expect(refusees).not.toContain(a.id);
      });
    });

    describe("CommissionsVendeurs", () => {
      const credit = async (
        b: BancVendeurs,
        v: Vendeur,
        o: Partial<CreditCommission> = {},
      ): Promise<CreditCommission> => {
        const depart = await b.depart();
        const vente = uneVente(v.id, depart, { etat: "terminee" });
        expect(await b.ventes.ajouter(vente)).toEqual({ resultat: "ajoutee" });
        return {
          cle: `commission:${vente.id}`,
          vendeurId: v.id,
          compagnieId: depart.compagnieId,
          montant: 100,
          venteId: vente.id,
          at: T0,
          ...o,
        };
      };
      const reservation = (
        v: Vendeur,
        o: Partial<Parameters<CommissionsVendeurs["reserver"]>[0]> = {},
      ) => ({
        cle: `commissions:${v.id}:${randomUUID()}`,
        vendeurId: v.id,
        montant: 1000,
        at: apres(60),
        operateur: "mtn" as const,
        telephone: "+237677112233",
        libelle: "Commissions de la semaine",
        ...o,
      });

      it("une commission n'est comptée qu'une fois, même créditée en parallèle", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const c = await credit(b, v, { montant: 150 });
        const rep = await Promise.all([1, 2, 3, 4, 5].map(() => b.commissions.crediter(c)));
        expect(rep.filter(Boolean)).toHaveLength(1);
        expect(await b.commissions.solde(v.id)).toBe(150);
        expect(await b.commissions.crediter(c)).toBe(false);
        expect(await b.commissions.solde(randomUUID())).toBe(0);
        expect(await b.commissions.solde("pas-un-uuid")).toBe(0);
      });

      it("réserve sur le solde, refuse au-delà et rejoue une clé sans la compter deux fois", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        for (const montant of [600, 400])
          await b.commissions.crediter(await credit(b, v, { montant }));
        const r = reservation(v, { montant: 700 });
        expect(await b.commissions.reserver(r)).toBe("reserve");
        expect(await b.commissions.solde(v.id)).toBe(300);
        expect(await b.commissions.reserver(r)).toBe("existe");
        expect(await b.commissions.reserver(reservation(v, { montant: 301 }))).toBe(
          "solde_insuffisant",
        );
        expect(await b.commissions.reserver(reservation(v, { montant: 0 }))).toBe(
          "solde_insuffisant",
        );
        expect(await b.commissions.reserver(reservation(v, { montant: 300 }))).toBe("reserve");
        expect(await b.commissions.solde(v.id)).toBe(0);
      });

      it("dix versements simultanés de 1 000 F sur un solde de 3 500 F : trois seulement passent", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        for (const montant of [1500, 1000, 1000]) {
          await b.commissions.crediter(await credit(b, v, { montant }));
        }
        const rep = await Promise.all(
          Array.from({ length: 10 }, () => b.commissions.reserver(reservation(v))),
        );
        expect(rep.filter((r) => r === "reserve")).toHaveLength(3);
        expect(rep.filter((r) => r === "solde_insuffisant")).toHaveLength(7);
        expect(await b.commissions.solde(v.id)).toBe(500);
      });

      it("un échec de l'opérateur rend le solde, un versement confirmé ne revient jamais", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        await b.commissions.crediter(await credit(b, v, { montant: 2000 }));
        const rate = reservation(v, { montant: 800 });
        const reussi = reservation(v, { montant: 900 });
        expect(await b.commissions.reserver(rate)).toBe("reserve");
        expect(await b.commissions.reserver(reussi)).toBe("reserve");
        const attente = (await b.commissions.debitsEnAttente()).filter((d) => d.vendeurId === v.id);
        expect(attente.map((d) => d.cle).sort()).toEqual([rate.cle, reussi.cle].sort());
        expect(attente.find((d) => d.cle === rate.cle)).toMatchObject({
          montant: 800,
          etat: "en_attente",
          operateur: "mtn",
          telephone: "+237677112233",
          libelle: "Commissions de la semaine",
          reference: null,
        });

        await b.commissions.annuler(rate.cle);
        expect(await b.commissions.solde(v.id)).toBe(1100);
        await b.commissions.confirmer(reussi.cle, "MM-42");
        await b.commissions.annuler(reussi.cle);
        expect(await b.commissions.solde(v.id)).toBe(1100);
        expect((await b.commissions.debitsEnAttente()).filter((d) => d.vendeurId === v.id)).toEqual(
          [],
        );
        // Une clé annulée peut être réservée à nouveau ; une clé confirmée reste « existe ».
        expect(await b.commissions.reserver(rate)).toBe("reserve");
        expect(await b.commissions.reserver(reussi)).toBe("existe");
      });

      it("lit les crédits par vendeur et par période, et les soldes positifs", async () => {
        const b = await obtenir();
        const v = await b.vendeur();
        const autre = await b.vendeur();
        const base = "2032-04-05T08:00:00.000+01:00";
        const tot = await credit(b, v, { at: apres(0, base), montant: 200 });
        const milieu = await credit(b, v, { at: apres(60, base), montant: 100 });
        const tard = await credit(b, v, { at: apres(120, base), montant: 300 });
        for (const c of [tard, tot, milieu]) await b.commissions.crediter(c);
        const rien = await credit(b, autre, { at: apres(10, base), montant: 50 });
        await b.commissions.crediter(rien);
        expect((await b.commissions.credits(v.id, apres(0, base))).map((c) => c.cle)).toEqual([
          tot.cle,
          milieu.cle,
          tard.cle,
        ]);
        expect(
          (await b.commissions.credits(v.id, apres(1, base), apres(120, base))).map((c) => c.cle),
        ).toEqual([milieu.cle]);
        expect(await b.commissions.credits(randomUUID(), apres(0, base))).toEqual([]);
        expect((await b.commissions.credits(v.id, apres(0, base)))[0]).toEqual(tot);

        await b.commissions.reserver(reservation(autre, { montant: 50 }));
        const positifs = await b.commissions.soldesPositifs();
        expect(positifs.find((s) => s.vendeurId === v.id)?.solde).toBe(600);
        expect(positifs.find((s) => s.vendeurId === autre.id)).toBeUndefined();
      });
    });
  });
}
