import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { DemandeRelais, FicheRelais, PointRelaisStocke } from "../modele";
import type {
  AttributionRoles,
  BrouillonsRelais,
  CompteursDossiers,
  DemandesRelaisRepository,
  Lieux,
  Portefeuille,
  ReceptionsRelais,
  RelaisRepository,
} from "../ports";
import type { Point } from "../regles";
import { versIsoDouala } from "../temps";

/**
 * Contrat des ports de stockage des points relais et du portefeuille : les mêmes tests passent sur la
 * mémoire et sur PostgreSQL. Un comportement que l'une a et que l'autre n'a pas fait échouer l'un des
 * deux : c'est ce qui prouve que la mémoire, sur laquelle tournent tous les autres tests, se comporte
 * comme la base (un gain compté une fois, un solde jamais dépensé deux fois, un dossier jamais pris deux fois…).
 */

export interface BancRelais {
  relais: RelaisRepository;
  demandes: DemandesRelaisRepository;
  brouillons: BrouillonsRelais;
  compteurs: CompteursDossiers;
  receptions: ReceptionsRelais;
  portefeuille: Portefeuille;
  lieux: Lieux;
  roles: AttributionRoles;
  /** Un compte (en base : une ligne `personne`). */
  personne(): Promise<string>;
  /** Un colis (en base : une ligne `colis`). */
  colis(): Promise<string>;
  /** Une gare (en base : une ligne `gare`), et ses coordonnées si on les donne. */
  gare(point?: Point): Promise<string>;
  poserAdresse(adresse: string, ville: string, point: Point): Promise<void>;
  /** Les rôles du compte, tels que la base les garde. */
  rolesDe(personneId: string): Promise<string[]>;
  fermer(): Promise<void>;
}

const T0 = "2027-01-05T09:00:00.000+01:00";
const apres = (minutes: number, depuis = T0): string =>
  versIsoDouala(Date.parse(depuis) + minutes * 60_000);

let compteur = 0;
const suivant = (): number => {
  compteur += 1;
  return compteur;
};

export function unRelais(
  personneId: string,
  o: Partial<PointRelaisStocke> = {},
): PointRelaisStocke {
  const n = suivant();
  return {
    id: randomUUID(),
    version: 1,
    code: `R-TST-${String(n).padStart(4, "0")}-${randomUUID().slice(0, 4)}`,
    personneId,
    nom: "Boutique Chez Mama Rose",
    typeBoutique: "Boutique · alimentation",
    ville: "Bafoussam",
    quartier: "Tamdja",
    repere: "En face de la pharmacie",
    position: { lat: 5.4737, lon: 10.4179 },
    ouvert: "7 h – 20 h · lun.–sam.",
    tailleMax: "Petits et moyens (≤ 10 kg)",
    capacite: 30,
    particularite: null,
    momo: { telephone: "+237677112233", operateur: "mtn" },
    facadeRef: "photo:facade:1",
    actif: true,
    note: 5,
    creeA: T0,
    premierColisA: null,
    ...o,
  };
}

export function uneFiche(o: Partial<FicheRelais> = {}): FicheRelais {
  return {
    nom: "Boutique Chez Mama Rose",
    type: "Boutique · alimentation",
    ouvert: "7 h – 20 h · lun.–sam.",
    position: { ville: "Bafoussam", quartier: "Tamdja", repere: null },
    tailleMax: "Petits et moyens (≤ 10 kg)",
    momo: { telephone: "+237677112233", operateur: "mtn" },
    facadeRef: "photo:facade:1",
    ...o,
  };
}

export function uneDemande(personneId: string, o: Partial<DemandeRelais> = {}): DemandeRelais {
  const n = suivant();
  return {
    dossier: `R-TST-${String(n).padStart(4, "0")}-${randomUUID().slice(0, 4)}`,
    version: 1,
    personneId,
    fiche: uneFiche(),
    etat: "recue",
    deposeeA: T0,
    visite: null,
    decision: null,
    relaisId: null,
    ...o,
  };
}

export function contratPortsRelais(titre: string, creerBanc: () => Promise<BancRelais>): void {
  describe(titre, () => {
    let banc: BancRelais | null = null;
    const obtenir = async (): Promise<BancRelais> => (banc ??= await creerBanc());
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("RelaisRepository", () => {
      it("garde un relais tel qu'il a été écrit, position et téléphone compris", async () => {
        const b = await obtenir();
        const r = unRelais(await b.personne(), { particularite: "frigo pour médicaments" });
        expect(await b.relais.ajouter(r)).toBe(true);
        expect(await b.relais.trouver(r.id)).toEqual(r);
        expect(await b.relais.parPersonne(r.personneId)).toEqual(r);
        const sansPosition = unRelais(await b.personne(), { position: null, repere: null });
        await b.relais.ajouter(sansPosition);
        expect(await b.relais.trouver(sansPosition.id)).toEqual(sansPosition);
        expect(await b.relais.trouver(randomUUID())).toBeNull();
        expect(await b.relais.trouver("pas-un-uuid")).toBeNull();
        expect(await b.relais.parPersonne(randomUUID())).toBeNull();
      });

      it("refuse un identifiant ou un code déjà pris", async () => {
        const b = await obtenir();
        const r = unRelais(await b.personne());
        expect(await b.relais.ajouter(r)).toBe(true);
        expect(await b.relais.ajouter({ ...r, code: "autre" })).toBe(false);
        expect(await b.relais.ajouter(unRelais(await b.personne(), { code: r.code }))).toBe(false);
      });

      it("liste par ville et par état, dans l'ordre des codes", async () => {
        const b = await obtenir();
        const ville = `Ville${randomUUID().slice(0, 6)}`;
        const z = unRelais(await b.personne(), { ville, code: `Z-${randomUUID().slice(0, 6)}` });
        const a = unRelais(await b.personne(), { ville, code: `A-${randomUUID().slice(0, 6)}` });
        const suspendu = unRelais(await b.personne(), {
          ville,
          code: `M-${randomUUID().slice(0, 6)}`,
          actif: false,
        });
        for (const r of [z, a, suspendu]) await b.relais.ajouter(r);
        expect((await b.relais.lister({ ville })).map((r) => r.id)).toEqual([
          a.id,
          suspendu.id,
          z.id,
        ]);
        expect((await b.relais.lister({ ville, actif: true })).map((r) => r.id)).toEqual([
          a.id,
          z.id,
        ]);
        expect((await b.relais.lister({ ville, actif: false })).map((r) => r.id)).toEqual([
          suspendu.id,
        ]);
      });

      it("remplacer exige la version lue : de cinq écritures simultanées, une seule passe", async () => {
        const b = await obtenir();
        const r = unRelais(await b.personne());
        await b.relais.ajouter(r);
        const resultats = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            b.relais.remplacer({ ...r, nom: `Nom ${i}`, actif: false }, 1),
          ),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
        const apresEcriture = await b.relais.trouver(r.id);
        expect(apresEcriture).toMatchObject({ version: 2, actif: false });
        expect(await b.relais.remplacer(r, 1)).toBe(false);
      });

      it("remplacer ne change ni le code ni le compte du relais", async () => {
        const b = await obtenir();
        const r = unRelais(await b.personne());
        await b.relais.ajouter(r);
        const autre = await b.personne();
        expect(
          await b.relais.remplacer(
            { ...r, code: "AUTRE", personneId: autre, position: null, premierColisA: apres(5) },
            1,
          ),
        ).toBe(true);
        expect(await b.relais.trouver(r.id)).toMatchObject({
          code: r.code,
          personneId: r.personneId,
          position: null,
          premierColisA: apres(5),
        });
      });
    });

    describe("DemandesRelaisRepository", () => {
      it("garde la demande telle quelle, MoMo compris", async () => {
        const b = await obtenir();
        const d = uneDemande(await b.personne(), {
          etat: "visite_planifiee",
          visite: { agent: "Agent Biyiha", creneau: "mardi 10 h", planifieeA: apres(3) },
        });
        expect(await b.demandes.ajouter(d)).toBe("ajoutee");
        expect(await b.demandes.trouver(d.dossier)).toEqual(d);
        expect(await b.demandes.trouver("R-INCONNU")).toBeNull();
      });

      it("refuse un dossier déjà pris et une seconde demande ouverte de la même personne", async () => {
        const b = await obtenir();
        const personne = await b.personne();
        const d = uneDemande(personne);
        expect(await b.demandes.ajouter(d)).toBe("ajoutee");
        expect(await b.demandes.ajouter({ ...d, personneId: await b.personne() })).toBe(
          "dossier_pris",
        );
        expect(await b.demandes.ajouter(uneDemande(personne))).toBe("demande_en_cours");
        expect(await b.demandes.ajouter(uneDemande(personne, { etat: "visite_planifiee" }))).toBe(
          "demande_en_cours",
        );
      });

      it("cinq demandes simultanées de la même personne : une seule est ouverte", async () => {
        const b = await obtenir();
        const personne = await b.personne();
        const resultats = await Promise.all(
          Array.from({ length: 5 }, () => b.demandes.ajouter(uneDemande(personne))),
        );
        expect(resultats.filter((r) => r === "ajoutee")).toHaveLength(1);
        expect(resultats.filter((r) => r === "demande_en_cours")).toHaveLength(4);
      });

      it("une demande refusée ne bloque plus : la personne peut redéposer, et on retrouve la dernière", async () => {
        const b = await obtenir();
        const personne = await b.personne();
        const premiere = uneDemande(personne);
        await b.demandes.ajouter(premiere);
        await b.demandes.remplacer(
          {
            ...premiere,
            etat: "refusee",
            decision: { a: apres(2), par: "agent", motif: "Photo floue" },
          },
          1,
        );
        const deuxieme = uneDemande(personne, { deposeeA: apres(60) });
        expect(await b.demandes.ajouter(deuxieme)).toBe("ajoutee");
        expect((await b.demandes.derniereDe(personne))?.dossier).toBe(deuxieme.dossier);
        expect(await b.demandes.derniereDe(await b.personne())).toBeNull();
        expect(await b.demandes.trouver(premiere.dossier)).toMatchObject({
          etat: "refusee",
          version: 2,
          decision: { motif: "Photo floue" },
        });
      });

      it("remplacer exige la version lue", async () => {
        const b = await obtenir();
        const d = uneDemande(await b.personne());
        await b.demandes.ajouter(d);
        const resultats = await Promise.all(
          Array.from({ length: 4 }, () =>
            b.demandes.remplacer({ ...d, etat: "visite_planifiee" }, 1),
          ),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
        expect(await b.demandes.remplacer(d, 7)).toBe(false);
      });
    });

    describe("BrouillonsRelais", () => {
      it("garde, remplace et supprime le brouillon d'une personne", async () => {
        const b = await obtenir();
        const personne = await b.personne();
        expect(await b.brouillons.lire(personne)).toBeNull();
        const un = {
          personneId: personne,
          fiche: {
            nom: "Chez Rose",
            momo: { telephone: "+237677112233", operateur: "mtn" as const },
          },
          enregistreA: T0,
        };
        await b.brouillons.enregistrer(un);
        expect(await b.brouillons.lire(personne)).toEqual(un);
        const deux = { personneId: personne, fiche: { nom: "Chez Rose 2" }, enregistreA: apres(5) };
        await b.brouillons.enregistrer(deux);
        expect(await b.brouillons.lire(personne)).toEqual(deux);
        await b.brouillons.supprimer(personne);
        expect(await b.brouillons.lire(personne)).toBeNull();
      });
    });

    describe("CompteursDossiers", () => {
      it("donne 1, 2, 3… par préfixe, sans trou ni doublon même demandé en parallèle", async () => {
        const b = await obtenir();
        const prefixe = `R-T${randomUUID().slice(0, 5).toUpperCase()}`;
        const autre = `L-T${randomUUID().slice(0, 5).toUpperCase()}`;
        expect(await b.compteurs.prochain(prefixe)).toBe(1);
        const numeros = await Promise.all(
          Array.from({ length: 20 }, () => b.compteurs.prochain(prefixe)),
        );
        expect([...numeros].sort((x, y) => x - y)).toEqual(
          Array.from({ length: 20 }, (_, i) => i + 2),
        );
        expect(await b.compteurs.prochain(autre)).toBe(1);
      });
    });

    describe("ReceptionsRelais", () => {
      async function relaisEtColis() {
        const b = await obtenir();
        const relais = unRelais(await b.personne());
        await b.relais.ajouter(relais);
        return { b, relais, colisId: await b.colis() };
      }

      it("un colis n'a qu'une réception, même enregistrée en parallèle", async () => {
        const { b, relais, colisId } = await relaisEtColis();
        const r = {
          colisId,
          relaisId: relais.id,
          recuA: T0,
          rappelEnvoyeA: null,
          remiseOuverteA: null,
        };
        const crees = await Promise.all(Array.from({ length: 4 }, () => b.receptions.ajouter(r)));
        expect(crees.filter(Boolean)).toHaveLength(1);
        expect(await b.receptions.trouver(colisId)).toEqual(r);
        expect(await b.receptions.trouver(randomUUID())).toBeNull();
        expect(await b.receptions.lister(relais.id)).toEqual([r]);
      });

      it("le rappel ne part qu'une fois, la remise s'ouvre et se referme", async () => {
        const { b, relais, colisId } = await relaisEtColis();
        await b.receptions.ajouter({
          colisId,
          relaisId: relais.id,
          recuA: T0,
          rappelEnvoyeA: null,
          remiseOuverteA: null,
        });
        const marques = await Promise.all(
          Array.from({ length: 5 }, () => b.receptions.marquerRappel(colisId, apres(60))),
        );
        expect(marques.filter(Boolean)).toHaveLength(1);
        expect((await b.receptions.trouver(colisId))?.rappelEnvoyeA).toBe(apres(60));
        await b.receptions.ouvrirRemise(colisId, apres(70));
        expect((await b.receptions.trouver(colisId))?.remiseOuverteA).toBe(apres(70));
        await b.receptions.ouvrirRemise(colisId, null);
        expect((await b.receptions.trouver(colisId))?.remiseOuverteA).toBeNull();
        expect(await b.receptions.marquerRappel(randomUUID(), T0)).toBe(false);
      });
    });

    describe("Portefeuille", () => {
      const credit = (partenaireId: string, o: Record<string, unknown> = {}) => ({
        cle: `remise:${randomUUID()}`,
        type: "relais" as const,
        partenaireId,
        montant: 200,
        motif: "remise" as const,
        reference: randomUUID(),
        at: T0,
        ...o,
      });
      const reservation = (partenaireId: string, o: Record<string, unknown> = {}) => ({
        cle: `retrait:${randomUUID()}`,
        type: "relais" as const,
        partenaireId,
        montant: 1000,
        motif: "retrait" as const,
        at: apres(10),
        soldeMinimum: 0,
        operateur: "mtn" as const,
        telephone: "+237677112233",
        libelle: "Retrait",
        ...o,
      });

      it("un gain n'est compté qu'une fois, même crédité en parallèle", async () => {
        const b = await obtenir();
        const p = randomUUID();
        const c = credit(p);
        const resultats = await Promise.all(
          Array.from({ length: 6 }, () => b.portefeuille.crediter(c)),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
        expect(await b.portefeuille.solde("relais", p)).toBe(200);
        expect(await b.portefeuille.solde("livreur", p)).toBe(0);
        expect(await b.portefeuille.solde("relais", randomUUID())).toBe(0);
      });

      it("réserve sur le solde, refuse au-delà, et respecte le solde minimum", async () => {
        const b = await obtenir();
        const p = randomUUID();
        for (let i = 0; i < 5; i++) await b.portefeuille.crediter(credit(p, { montant: 1000 }));
        expect(await b.portefeuille.reserver(reservation(p, { montant: 6000 }))).toBe(
          "solde_insuffisant",
        );
        expect(
          await b.portefeuille.reserver(reservation(p, { montant: 1000, soldeMinimum: 5001 })),
        ).toBe("solde_insuffisant");
        const cle = `retrait:${randomUUID()}`;
        expect(
          await b.portefeuille.reserver(reservation(p, { cle, montant: 2000, soldeMinimum: 5000 })),
        ).toBe("reserve");
        expect(await b.portefeuille.solde("relais", p)).toBe(3000);
        expect(await b.portefeuille.reserver(reservation(p, { cle, montant: 2000 }))).toBe(
          "existe",
        );
        expect(await b.portefeuille.solde("relais", p)).toBe(3000);
        expect(await b.portefeuille.reserver(reservation(p, { montant: 0 }))).toBe(
          "solde_insuffisant",
        );
      });

      it("dix retraits simultanés de 1 000 F sur un solde de 3 500 F : trois seulement passent", async () => {
        const b = await obtenir();
        const p = randomUUID();
        await b.portefeuille.crediter(credit(p, { montant: 3500 }));
        const resultats = await Promise.all(
          Array.from({ length: 10 }, () => b.portefeuille.reserver(reservation(p))),
        );
        expect(resultats.filter((r) => r === "reserve")).toHaveLength(3);
        expect(resultats.filter((r) => r === "solde_insuffisant")).toHaveLength(7);
        expect(await b.portefeuille.solde("relais", p)).toBe(500);
      });

      it("un échec de l'opérateur rend le solde, un versement confirmé ne revient jamais", async () => {
        const b = await obtenir();
        const p = randomUUID();
        await b.portefeuille.crediter(credit(p, { montant: 4000 }));
        const echec = `versement:relais:${p}:a`;
        const reussi = `versement:relais:${p}:b`;
        await b.portefeuille.reserver(
          reservation(p, { cle: echec, montant: 1500, motif: "versement" }),
        );
        await b.portefeuille.reserver(
          reservation(p, { cle: reussi, montant: 1000, motif: "versement" }),
        );
        expect(await b.portefeuille.solde("relais", p)).toBe(1500);
        const enAttente = (await b.portefeuille.debitsEnAttente()).filter(
          (d) => d.partenaireId === p,
        );
        expect(enAttente.map((d) => d.cle).sort()).toEqual([echec, reussi].sort());
        expect(enAttente[0]).toMatchObject({
          telephone: "+237677112233",
          operateur: "mtn",
          reference: null,
        });

        await b.portefeuille.annuler(echec);
        expect(await b.portefeuille.solde("relais", p)).toBe(3000);
        await b.portefeuille.confirmer(reussi, "MM-1");
        await b.portefeuille.annuler(reussi);
        expect(await b.portefeuille.solde("relais", p)).toBe(3000);
        expect(
          (await b.portefeuille.debitsEnAttente()).filter((d) => d.partenaireId === p),
        ).toEqual([]);
        // Rejouer la clé d'un versement fait n'en crée pas un second.
        expect(await b.portefeuille.reserver(reservation(p, { cle: reussi, montant: 1000 }))).toBe(
          "existe",
        );
      });

      it("les crédits se lisent par partenaire et par période", async () => {
        const b = await obtenir();
        const p = randomUUID();
        const tot = credit(p, { at: apres(0), montant: 200 });
        const milieu = credit(p, { at: apres(60), montant: 100, motif: "reprise" });
        const tard = credit(p, { at: apres(120), montant: 300 });
        for (const c of [tard, tot, milieu]) await b.portefeuille.crediter(c);
        expect((await b.portefeuille.credits("relais", p, apres(0))).map((c) => c.cle)).toEqual([
          tot.cle,
          milieu.cle,
          tard.cle,
        ]);
        expect(
          (await b.portefeuille.credits("relais", p, apres(1), apres(120))).map((c) => c.cle),
        ).toEqual([milieu.cle]);
        expect((await b.portefeuille.credits("livreur", p, apres(0))).length).toBe(0);
        const periode = await b.portefeuille.creditsPeriode("relais", apres(60), apres(121));
        expect(periode.filter((c) => c.partenaireId === p).map((c) => c.cle)).toEqual([
          milieu.cle,
          tard.cle,
        ]);
        expect((await b.portefeuille.credits("relais", p, apres(0)))[1]).toEqual(milieu);
      });

      it("liste les soldes positifs d'un type, en tenant compte des débits", async () => {
        const b = await obtenir();
        const riche = randomUUID();
        const vide = randomUUID();
        const livreur = randomUUID();
        await b.portefeuille.crediter(credit(riche, { montant: 700 }));
        await b.portefeuille.crediter(credit(vide, { montant: 500 }));
        await b.portefeuille.crediter(
          credit(livreur, { type: "livreur", montant: 900, motif: "livraison" }),
        );
        await b.portefeuille.reserver(reservation(vide, { montant: 500 }));
        const relais = await b.portefeuille.soldesPositifs("relais");
        expect(relais.find((s) => s.partenaireId === riche)).toEqual({
          partenaireId: riche,
          solde: 700,
        });
        expect(relais.find((s) => s.partenaireId === vide)).toBeUndefined();
        expect(relais.find((s) => s.partenaireId === livreur)).toBeUndefined();
        expect(
          (await b.portefeuille.soldesPositifs("livreur")).find((s) => s.partenaireId === livreur),
        ).toEqual({
          partenaireId: livreur,
          solde: 900,
        });
      });
    });

    describe("Lieux et AttributionRoles", () => {
      it("connaît les coordonnées des gares et des adresses déjà géocodées", async () => {
        const b = await obtenir();
        const point = { lat: 4.0511, lon: 9.7679 };
        const gare = await b.gare(point);
        expect(await b.lieux.pointDeLaGare(gare)).toEqual(point);
        expect(await b.lieux.pointDeLaGare(await b.gare())).toBeNull();
        expect(await b.lieux.pointDeLaGare(randomUUID())).toBeNull();
        const adresse = `Rue ${randomUUID().slice(0, 6)}`;
        await b.poserAdresse(adresse, "Douala", { lat: 4.06, lon: 9.71 });
        expect(await b.lieux.pointDeLAdresse(adresse, "Douala")).toEqual({ lat: 4.06, lon: 9.71 });
        expect(await b.lieux.pointDeLAdresse(adresse.toUpperCase(), "DOUALA")).toEqual({
          lat: 4.06,
          lon: 9.71,
        });
        expect(await b.lieux.pointDeLAdresse(adresse, "Yaoundé")).toBeNull();
      });

      it("ajoute le rôle de relais ou de livreur une seule fois, sans retirer les autres", async () => {
        const b = await obtenir();
        const p = await b.personne();
        const avant = await b.rolesDe(p);
        await Promise.all([
          b.roles.ajouterRole(p, "relais"),
          b.roles.ajouterRole(p, "relais"),
          b.roles.ajouterRole(p, "relais"),
        ]);
        await b.roles.ajouterRole(p, "livreur");
        const apresRoles = await b.rolesDe(p);
        expect(apresRoles.filter((r) => r === "relais")).toHaveLength(1);
        expect(apresRoles.filter((r) => r === "livreur")).toHaveLength(1);
        for (const r of avant) expect(apresRoles).toContain(r);
      });
    });
  });
}
