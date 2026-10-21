import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { versIsoDouala } from "../../relais/temps";
import type { DemandeLivreur, LivreurStocke, MissionLivraison } from "../modele";
import type {
  DemandesLivreurRepository,
  Invitations,
  LivreursRepository,
  MissionsRepository,
  PartagesSuivi,
} from "../ports";

/**
 * Contrat des ports de stockage de la livraison moto : les mêmes tests passent sur la mémoire et sur
 * PostgreSQL. Un comportement que l'une a et que l'autre n'a pas fait échouer l'un des deux : c'est ce
 * qui prouve que la mémoire, sur laquelle tournent tous les autres tests, se comporte comme la base
 * (une mission ouverte par colis, une acceptation qui gagne, une demande ouverte par personne…).
 */

export interface BancLivraison {
  livreurs: LivreursRepository;
  demandes: DemandesLivreurRepository;
  missions: MissionsRepository;
  partages: PartagesSuivi;
  invitations: Invitations;
  /** Un compte (en base : une ligne `personne`). */
  personne(): Promise<string>;
  /** Un colis en mode « moto » (en base : une ligne `colis`). */
  colis(): Promise<{ id: string; numero: string }>;
  /** Un livreur écrit dans le dépôt (son compte et sa ligne existent). */
  livreur(over?: Partial<LivreurStocke>): Promise<LivreurStocke>;
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

export function unLivreur(personneId: string, o: Partial<LivreurStocke> = {}): LivreurStocke {
  const n = suivant();
  return {
    id: randomUUID(),
    version: 1,
    badge: `L-TST-${String(n).padStart(4, "0")}-${randomUUID().slice(0, 4)}`,
    numero: n,
    personneId,
    nom: "Éric T.",
    ville: "Bafoussam",
    deplacement: "moto",
    zone: "Bafoussam · Tamdja, Djeleng, centre",
    heures: "Soirs 17 h – 21 h",
    chargeMax: "10 kg · colis courants",
    momo: { telephone: "+237677112233", operateur: "mtn" },
    pieces: {
      permisRef: "photo:permis:1",
      assuranceRef: "photo:assurance:1",
      permisValideJusqua: "2030-06-30",
      assuranceExpireLe: "2027-12-31",
    },
    moto: "OU 517 MT",
    disponible: false,
    actif: true,
    note: 5,
    creeA: T0,
    ...o,
  };
}

export function uneDemandeLivreur(
  personneId: string,
  o: Partial<DemandeLivreur> = {},
): DemandeLivreur {
  const n = suivant();
  return {
    dossier: `L-TST-${String(n).padStart(4, "0")}-${randomUUID().slice(0, 4)}`,
    version: 1,
    personneId,
    numero: n,
    ville: "Bafoussam",
    deplacement: "moto",
    zone: "Bafoussam · Tamdja, Djeleng, centre",
    heures: "Soirs 17 h – 21 h",
    chargeMax: "10 kg · colis courants",
    momo: { telephone: "+237677112233", operateur: "mtn" },
    pieces: { permisRef: "photo:permis:1", assuranceRef: "photo:assurance:1" },
    deposeeA: T0,
    verifications: {
      identiteA: null,
      piecesA: null,
      permisValideJusqua: null,
      assuranceExpireLe: null,
      formationA: null,
    },
    etat: "recue",
    decision: null,
    livreurId: null,
    ...o,
  };
}

export function uneMission(
  colis: { id: string; numero: string },
  o: Partial<MissionLivraison> = {},
): MissionLivraison {
  return {
    id: randomUUID(),
    version: 1,
    colisId: colis.id,
    colisNumero: colis.numero,
    etat: "en_attente",
    livreurId: null,
    proposeeA: null,
    expireA: null,
    essais: [],
    tour: 1,
    prochaineA: null,
    creeA: T0,
    accepteeA: null,
    livreeA: null,
    trajet: {
      depart: "Gare de Bafoussam",
      arrivee: "Tamdja, face au marché",
      destinataire: "Thérèse",
    },
    distanceM: 3200,
    dureeMinutes: 11,
    prixLivraison: 1000,
    gain: 700,
    absence: null,
    repliA: null,
    ...o,
  };
}

export function contratPortsLivraison(
  titre: string,
  creerBanc: () => Promise<BancLivraison>,
): void {
  describe(titre, () => {
    let banc: BancLivraison | null = null;
    const obtenir = async (): Promise<BancLivraison> => (banc ??= await creerBanc());
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("LivreursRepository", () => {
      it("garde un livreur tel qu'il a été écrit, pièces et téléphone compris", async () => {
        const b = await obtenir();
        const l = unLivreur(await b.personne());
        expect(await b.livreurs.ajouter(l)).toBe(true);
        expect(await b.livreurs.trouver(l.id)).toEqual(l);
        expect(await b.livreurs.parPersonne(l.personneId)).toEqual(l);
        const aPied = unLivreur(await b.personne(), {
          deplacement: "pied",
          moto: null,
          pieces: {
            permisRef: null,
            assuranceRef: null,
            permisValideJusqua: null,
            assuranceExpireLe: null,
          },
        });
        await b.livreurs.ajouter(aPied);
        expect(await b.livreurs.trouver(aPied.id)).toEqual(aPied);
        expect(await b.livreurs.trouver(randomUUID())).toBeNull();
        expect(await b.livreurs.trouver("pas-un-uuid")).toBeNull();
        expect(await b.livreurs.parPersonne(randomUUID())).toBeNull();
      });

      it("refuse un identifiant, un badge ou un compte déjà pris", async () => {
        const b = await obtenir();
        const l = unLivreur(await b.personne());
        expect(await b.livreurs.ajouter(l)).toBe(true);
        expect(await b.livreurs.ajouter(l)).toBe(false);
        expect(await b.livreurs.ajouter(unLivreur(await b.personne(), { badge: l.badge }))).toBe(
          false,
        );
        expect(await b.livreurs.ajouter(unLivreur(l.personneId))).toBe(false);
      });

      it("liste par état, dans l'ordre des badges", async () => {
        const b = await obtenir();
        const ville = `Ville-${randomUUID().slice(0, 6)}`;
        const a = unLivreur(await b.personne(), {
          ville,
          badge: `L-ZZ-${String(suivant()).padStart(6, "0")}-a`,
        });
        const c = unLivreur(await b.personne(), {
          ville,
          badge: `L-ZZ-${String(suivant()).padStart(6, "0")}-b`,
          disponible: true,
        });
        const d = unLivreur(await b.personne(), {
          ville,
          badge: `L-ZZ-${String(suivant()).padStart(6, "0")}-c`,
          actif: false,
        });
        for (const l of [d, c, a]) await b.livreurs.ajouter(l);
        const tous = (await b.livreurs.lister()).filter((l) => l.ville === ville);
        expect(tous.map((l) => l.id)).toEqual([a.id, c.id, d.id]);
        const actifs = (await b.livreurs.lister({ actif: true })).filter((l) => l.ville === ville);
        expect(actifs.map((l) => l.id)).toEqual([a.id, c.id]);
        const dispos = (await b.livreurs.lister({ actif: true, disponible: true })).filter(
          (l) => l.ville === ville,
        );
        expect(dispos.map((l) => l.id)).toEqual([c.id]);
      });

      it("remplacer exige la version lue : de cinq écritures simultanées, une seule passe", async () => {
        const b = await obtenir();
        const l = await b.livreur();
        const lu = (await b.livreurs.trouver(l.id))!;
        const essais = await Promise.all(
          [1, 2, 3, 4, 5].map((i) => b.livreurs.remplacer({ ...lu, zone: `zone ${i}` }, 1)),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        const apresEcriture = (await b.livreurs.trouver(l.id))!;
        expect(apresEcriture.version).toBe(2);
        expect(await b.livreurs.remplacer({ ...apresEcriture, disponible: true }, 1)).toBe(false);
        expect(await b.livreurs.remplacer({ ...apresEcriture, disponible: true }, 2)).toBe(true);
        expect(await b.livreurs.remplacer(unLivreur(await b.personne()), 1)).toBe(false);
      });

      it("remplacer ne change ni le badge, ni le numéro, ni le compte", async () => {
        const b = await obtenir();
        const l = await b.livreur();
        const autre = await b.personne();
        expect(
          await b.livreurs.remplacer(
            { ...l, badge: "L-AUTRE-0001", numero: 9999, personneId: autre, nom: "Paul K." },
            1,
          ),
        ).toBe(true);
        expect(await b.livreurs.trouver(l.id)).toEqual({ ...l, version: 2, nom: "Paul K." });
      });
    });

    describe("DemandesLivreurRepository", () => {
      it("garde la demande telle quelle, vérifications et décision comprises", async () => {
        const b = await obtenir();
        const personneId = await b.personne();
        const d = uneDemandeLivreur(personneId, {
          verifications: {
            identiteA: apres(5),
            piecesA: apres(6),
            permisValideJusqua: "2030-06-30",
            assuranceExpireLe: "2027-12-31",
            formationA: apres(7),
          },
        });
        expect(await b.demandes.ajouter(d)).toBe("ajoutee");
        expect(await b.demandes.trouver(d.dossier)).toEqual(d);
        const refusee = uneDemandeLivreur(await b.personne(), {
          etat: "refusee",
          decision: { a: apres(10), par: randomUUID(), motif: "Pièces illisibles" },
        });
        await b.demandes.ajouter(refusee);
        expect(await b.demandes.trouver(refusee.dossier)).toEqual(refusee);
        expect(await b.demandes.trouver("L-INCONNU-0001")).toBeNull();
      });

      it("refuse un dossier déjà pris et une seconde demande ouverte de la même personne", async () => {
        const b = await obtenir();
        const personneId = await b.personne();
        const d = uneDemandeLivreur(personneId);
        expect(await b.demandes.ajouter(d)).toBe("ajoutee");
        expect(await b.demandes.ajouter(d)).toBe("dossier_pris");
        expect(await b.demandes.ajouter(uneDemandeLivreur(personneId))).toBe("demande_en_cours");
        // Un autre compte peut déposer la sienne.
        expect(await b.demandes.ajouter(uneDemandeLivreur(await b.personne()))).toBe("ajoutee");
      });

      it("cinq demandes simultanées de la même personne : une seule est ouverte", async () => {
        const b = await obtenir();
        const personneId = await b.personne();
        const rep = await Promise.all(
          [1, 2, 3, 4, 5].map(() => b.demandes.ajouter(uneDemandeLivreur(personneId))),
        );
        expect(rep.filter((r) => r === "ajoutee")).toHaveLength(1);
        expect(rep.filter((r) => r === "demande_en_cours")).toHaveLength(4);
      });

      it("une demande refusée ne bloque plus : la personne peut redéposer, et on retrouve la dernière", async () => {
        const b = await obtenir();
        const personneId = await b.personne();
        const premiere = uneDemandeLivreur(personneId, { deposeeA: apres(0) });
        await b.demandes.ajouter(premiere);
        const lue = (await b.demandes.trouver(premiere.dossier))!;
        expect(
          await b.demandes.remplacer(
            {
              ...lue,
              etat: "refusee",
              decision: { a: apres(30), par: randomUUID(), motif: "Non" },
            },
            1,
          ),
        ).toBe(true);
        const seconde = uneDemandeLivreur(personneId, { deposeeA: apres(60) });
        expect(await b.demandes.ajouter(seconde)).toBe("ajoutee");
        expect((await b.demandes.derniereDe(personneId))?.dossier).toBe(seconde.dossier);
        expect(await b.demandes.derniereDe(randomUUID())).toBeNull();
      });

      it("remplacer exige la version lue", async () => {
        const b = await obtenir();
        const d = uneDemandeLivreur(await b.personne());
        await b.demandes.ajouter(d);
        const essais = await Promise.all(
          [1, 2, 3].map((i) =>
            b.demandes.remplacer(
              { ...d, verifications: { ...d.verifications, identiteA: apres(i) } },
              1,
            ),
          ),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        expect((await b.demandes.trouver(d.dossier))?.version).toBe(2);
        expect(await b.demandes.remplacer({ ...d, etat: "activee" }, 1)).toBe(false);
      });

      it("l'activation rattache la demande au livreur créé", async () => {
        const b = await obtenir();
        const l = await b.livreur();
        const d = uneDemandeLivreur(l.personneId);
        await b.demandes.ajouter(d);
        expect(await b.demandes.remplacer({ ...d, etat: "activee", livreurId: l.id }, 1)).toBe(
          true,
        );
        expect(await b.demandes.trouver(d.dossier)).toMatchObject({
          etat: "activee",
          livreurId: l.id,
          version: 2,
        });
      });
    });

    describe("MissionsRepository", () => {
      it("garde la mission telle quelle : essais, trajet, absence", async () => {
        const b = await obtenir();
        const livreur = await b.livreur();
        const colis = await b.colis();
        const m = uneMission(colis, {
          etat: "acceptee",
          livreurId: livreur.id,
          proposeeA: apres(1),
          expireA: apres(1.5),
          accepteeA: apres(1.2),
          essais: [{ livreurId: randomUUID(), issue: "expiree", at: apres(0.5), tour: 1 }],
          absence: { debutA: apres(20), jusqua: apres(30), relaisId: randomUUID() },
        });
        expect(await b.missions.ajouter(m)).toBe("ajoutee");
        expect(await b.missions.trouver(m.id)).toEqual(m);
        expect(await b.missions.trouver(randomUUID())).toBeNull();
        expect(await b.missions.trouver("pas-un-uuid")).toBeNull();
      });

      it("un colis n'a qu'une mission ouverte, même créée en parallèle", async () => {
        const b = await obtenir();
        const colis = await b.colis();
        const rep = await Promise.all(
          [1, 2, 3, 4, 5].map(() => b.missions.ajouter(uneMission(colis))),
        );
        expect(rep.filter((r) => r === "ajoutee")).toHaveLength(1);
        expect(rep.filter((r) => r === "colis_deja_servi")).toHaveLength(4);
      });

      it("un colis dont la mission est finie ou annulée peut en recevoir une autre, et on retrouve la plus récente", async () => {
        const b = await obtenir();
        const livreur = await b.livreur();
        const colis = await b.colis();
        const premiere = uneMission(colis, {
          etat: "annulee",
          creeA: apres(0),
        });
        const seconde = uneMission(colis, {
          creeA: apres(10),
          etat: "livree",
          livreurId: livreur.id,
          livreeA: apres(30),
        });
        const troisieme = uneMission(colis, { creeA: apres(60) });
        expect(await b.missions.ajouter(premiere)).toBe("ajoutee");
        expect(await b.missions.ajouter(seconde)).toBe("ajoutee");
        expect((await b.missions.derniereDuColis(colis.id))?.id).toBe(seconde.id);
        expect(await b.missions.ajouter(troisieme)).toBe("ajoutee");
        expect((await b.missions.derniereDuColis(colis.id))?.id).toBe(troisieme.id);
        expect(await b.missions.derniereDuColis(randomUUID())).toBeNull();
        for (const ouverte of ["proposee", "acceptee"] as const) {
          const autre = await b.colis();
          expect(
            await b.missions.ajouter(uneMission(autre, { etat: ouverte, livreurId: livreur.id })),
          ).toBe("ajoutee");
          expect(await b.missions.ajouter(uneMission(autre))).toBe("colis_deja_servi");
        }
      });

      it("remplacer exige la version lue : deux livreurs qui acceptent en même temps, un seul gagne", async () => {
        const b = await obtenir();
        const un = await b.livreur();
        const deux = await b.livreur();
        const colis = await b.colis();
        const m = uneMission(colis, { etat: "proposee", livreurId: un.id, proposeeA: apres(1) });
        await b.missions.ajouter(m);
        const lue = (await b.missions.trouver(m.id))!;
        const [a, c] = await Promise.all([
          b.missions.remplacer({ ...lue, etat: "acceptee", accepteeA: apres(2) }, 1),
          b.missions.remplacer(
            { ...lue, etat: "acceptee", livreurId: deux.id, accepteeA: apres(2) },
            1,
          ),
        ]);
        expect([a, c].filter(Boolean)).toHaveLength(1);
        const finale = (await b.missions.trouver(m.id))!;
        expect(finale.version).toBe(2);
        expect(finale.etat).toBe("acceptee");
      });

      it("remplacer ne change ni le colis, ni son numéro, ni la date de création", async () => {
        const b = await obtenir();
        const colis = await b.colis();
        const autre = await b.colis();
        const m = uneMission(colis);
        await b.missions.ajouter(m);
        expect(
          await b.missions.remplacer(
            {
              ...m,
              colisId: autre.id,
              colisNumero: autre.numero,
              creeA: apres(500),
              etat: "sans_livreur",
              tour: 4,
            },
            1,
          ),
        ).toBe(true);
        expect(await b.missions.trouver(m.id)).toEqual({
          ...m,
          version: 2,
          etat: "sans_livreur",
          tour: 4,
        });
      });

      it("lit les missions par état, par livreur et les livraisons terminées depuis un instant", async () => {
        const b = await obtenir();
        const livreur = await b.livreur();
        const autreLivreur = await b.livreur();
        const base = `2030-02-0${(suivant() % 8) + 1}T08:00:00.000+01:00`;
        const faire = async (over: Partial<MissionLivraison>): Promise<MissionLivraison> => {
          const m = uneMission(await b.colis(), over);
          expect(await b.missions.ajouter(m)).toBe("ajoutee");
          return m;
        };
        const enAttente = await faire({ creeA: apres(0, base) });
        const livree = await faire({
          creeA: apres(1, base),
          etat: "livree",
          livreurId: livreur.id,
          livreeA: apres(40, base),
        });
        const repli = await faire({
          creeA: apres(2, base),
          etat: "repli",
          livreurId: livreur.id,
          repliA: apres(90, base),
        });
        const vieille = await faire({
          creeA: apres(3, base),
          etat: "livree",
          livreurId: livreur.id,
          livreeA: apres(-600, base),
        });
        const dAutrui = await faire({
          creeA: apres(4, base),
          etat: "livree",
          livreurId: autreLivreur.id,
          livreeA: apres(50, base),
        });
        const acceptee = await faire({
          creeA: apres(5, base),
          etat: "acceptee",
          livreurId: livreur.id,
        });

        const ids = (l: MissionLivraison[]): string[] => l.map((m) => m.id);
        const attente = ids(await b.missions.parEtats(["en_attente"])).filter(
          (i) => i === enAttente.id,
        );
        expect(attente).toEqual([enAttente.id]);
        const dansLOrdre = ids(
          await b.missions.parEtats(["en_attente", "livree", "repli", "acceptee"]),
        ).filter((i) =>
          [enAttente, livree, repli, vieille, dAutrui, acceptee].some((m) => m.id === i),
        );
        expect(dansLOrdre).toEqual(
          [enAttente, livree, repli, vieille, dAutrui, acceptee].map((m) => m.id),
        );
        expect(ids(await b.missions.deLivreur(livreur.id, ["acceptee"]))).toEqual([acceptee.id]);
        expect(new Set(ids(await b.missions.deLivreur(livreur.id, ["livree", "repli"])))).toEqual(
          new Set([livree.id, repli.id, vieille.id]),
        );
        expect(await b.missions.deLivreur(randomUUID(), ["acceptee"])).toEqual([]);
        expect(new Set(ids(await b.missions.terminees(livreur.id, apres(0, base))))).toEqual(
          new Set([livree.id, repli.id]),
        );
        expect(ids(await b.missions.terminees(livreur.id, apres(60, base)))).toEqual([repli.id]);
        expect(await b.missions.terminees(livreur.id, apres(200, base))).toEqual([]);
      });
    });

    describe("PartagesSuivi et Invitations", () => {
      it("garde le hachage d'un lien, sans jamais pouvoir remonter au jeton, et compte les liens d'un colis", async () => {
        const b = await obtenir();
        const colis = await b.colis();
        const autre = await b.colis();
        const lien = {
          jetonHache: `h-${randomUUID()}`,
          colisId: colis.id,
          creeA: T0,
          expireA: apres(24 * 60),
        };
        await b.partages.ajouter(lien);
        expect(await b.partages.trouver(lien.jetonHache)).toEqual(lien);
        expect(await b.partages.trouver("inconnu")).toBeNull();
        await b.partages.ajouter({ ...lien, jetonHache: `h-${randomUUID()}` });
        await b.partages.ajouter({ ...lien, jetonHache: `h-${randomUUID()}`, colisId: autre.id });
        expect(await b.partages.compter(colis.id)).toBe(2);
        expect(await b.partages.compter(autre.id)).toBe(1);
        expect(await b.partages.compter(randomUUID())).toBe(0);
      });

      it("compte les invitations d'un livreur depuis un instant", async () => {
        const b = await obtenir();
        const livreur = await b.livreur();
        const autre = await b.livreur();
        for (const minutes of [0, 30, 60]) {
          await b.invitations.ajouter({ livreurId: livreur.id, at: apres(minutes) });
        }
        await b.invitations.ajouter({ livreurId: autre.id, at: apres(10) });
        expect(await b.invitations.compterDepuis(livreur.id, apres(0))).toBe(3);
        expect(await b.invitations.compterDepuis(livreur.id, apres(1))).toBe(2);
        expect(await b.invitations.compterDepuis(livreur.id, apres(61))).toBe(0);
        expect(await b.invitations.compterDepuis(autre.id, apres(0))).toBe(1);
      });
    });
  });
}
