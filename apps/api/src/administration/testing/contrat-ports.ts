import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  CommandeAppareil,
  CompagnieAdmin,
  GareAdmin,
  LigneAdmin,
  NouveauDepart,
  RapportEffacement,
} from "../modeles";
import {
  AnnuaireAdmin,
  HoraireEnDouble,
  HoraireInconnu,
  Lignes,
  OrdresAppareils,
  ParcBus,
  Programme,
  RegistreAppareils,
  type PublicationLigne,
} from "../ports";

/**
 * Contrat des ports de l'administration : les mêmes tests s'exécutent sur les adaptateurs en mémoire et sur les
 * adaptateurs PostgreSQL. Un comportement que la mémoire a et que PostgreSQL n'a pas (ou l'inverse) fait échouer
 * l'un des deux. Chaque test prend ses propres agences : on ne vide rien entre deux tests.
 */

export interface AgenceDeTest {
  compagnie: CompagnieAdmin;
  origine: GareAdmin;
  destination: GareAdmin;
}

export interface BancAdministration {
  annuaire: AnnuaireAdmin;
  lignes: Lignes;
  parc: ParcBus;
  programme: Programme;
  registre: RegistreAppareils;
  ordres: OrdresAppareils;
  /** Une agence neuve avec deux gares (en base, les lignes sont créées : clés étrangères). */
  nouvelleAgence(): Promise<AgenceDeTest>;
  /** Une personne (chauffeur) de cette agence. */
  nouvellePersonne(compagnieId: string): Promise<string>;
  /** Une fiche d'appareil de synchronisation (clé étrangère des appareils enrôlés et des ordres). */
  nouvelAppareilSync(agence: AgenceDeTest): Promise<string>;
  fermer(): Promise<void>;
}

const TARIFS = { classique: 4000, vip: 6000, bagage: 500 };
const PLAN = { capacite: 70, disposition: "2+2", rangees: 18 };
const OPTIONS = { venteEnLigne: true, fusionAuto: false };

const horaire = (
  heure: string,
  surcharge: Partial<PublicationLigne["horaires"][number]> = {},
): PublicationLigne["horaires"][number] => ({
  id: null,
  heure,
  classe: "classique",
  actif: true,
  note: null,
  jours: [],
  ...surcharge,
});

export function contratPortsAdministration(
  titre: string,
  creerBanc: () => Promise<BancAdministration>,
): void {
  describe(titre, () => {
    let banc: BancAdministration;
    beforeAll(async () => {
      banc = await creerBanc();
    }, 120_000);
    afterAll(async () => {
      await banc?.fermer();
    });

    async function ligne(agence: AgenceDeTest): Promise<LigneAdmin> {
      const creee = await banc.lignes.creer({
        compagnieId: agence.compagnie.id,
        code: `${agence.origine.code}${agence.destination.code}`,
        origineGareId: agence.origine.id,
        destinationGareId: agence.destination.id,
        tarifs: TARIFS,
        dureeMinutes: 240,
        arrets: [
          { nom: agence.origine.ville, kmDepuisOrigine: 0, montee: true },
          { nom: "Édéa", kmDepuisOrigine: 60, montee: true },
          { nom: agence.destination.ville, kmDepuisOrigine: 240, montee: false },
        ],
        plan: PLAN,
        options: OPTIONS,
      });
      expect(creee).not.toBeNull();
      return creee!;
    }

    const depart = (
      l: LigneAdmin,
      heure: string,
      surcharge: Partial<NouveauDepart> = {},
    ): NouveauDepart => ({
      id: randomUUID(),
      numero: `T${randomUUID().slice(0, 8)}-${heure}`,
      ligneId: l.id,
      busId: null,
      classe: "classique",
      heureDepart: `2027-03-02T${heure}:00.000+01:00`,
      etat: "en_vente",
      quai: null,
      chauffeurId: null,
      convoyeurId: null,
      historique: [],
      ...surcharge,
    });

    describe("annuaire", () => {
      it("retrouve la compagnie et ses gares, et rien d'une autre agence", async () => {
        const a = await banc.nouvelleAgence();
        const b = await banc.nouvelleAgence();
        expect(await banc.annuaire.compagnie(a.compagnie.id)).toEqual(a.compagnie);
        expect(await banc.annuaire.gare(a.origine.id)).toEqual(a.origine);
        expect((await banc.annuaire.gares(a.compagnie.id)).map((g) => g.id).sort()).toEqual(
          [a.origine.id, a.destination.id].sort(),
        );
        expect((await banc.annuaire.gares(b.compagnie.id)).map((g) => g.id)).not.toContain(
          a.origine.id,
        );
        expect(await banc.annuaire.compagnie(randomUUID())).toBeNull();
        expect(await banc.annuaire.gare("pas-un-uuid")).toBeNull();
      });
    });

    describe("lignes", () => {
      it("crée une ligne avec son plan, refuse un second code identique dans l'agence", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        expect(l).toMatchObject({
          code: `${a.origine.code}${a.destination.code}`,
          dureeMinutes: 240,
          tarifs: TARIFS,
        });
        expect(l.arrets.map((x) => x.nom)).toEqual([a.origine.ville, "Édéa", a.destination.ville]);
        expect(await banc.lignes.trouver(l.id)).toEqual(l);
        expect(await banc.lignes.reglage(l.id)).toMatchObject({
          plan: PLAN,
          options: OPTIONS,
          brouillon: null,
          effetDu: null,
        });
        const double = await banc.lignes.creer({
          compagnieId: a.compagnie.id,
          code: l.code,
          origineGareId: a.origine.id,
          destinationGareId: a.destination.id,
          tarifs: TARIFS,
          dureeMinutes: 0,
          arrets: l.arrets,
          plan: PLAN,
          options: OPTIONS,
        });
        expect(double).toBeNull();
        expect((await banc.lignes.lister(a.compagnie.id)).map((x) => x.id)).toEqual([l.id]);
        expect(await banc.lignes.trouver(randomUUID())).toBeNull();
      });

      it("publie des horaires : crée, modifie, supprime ce qui n'est plus dans la liste", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const base = { tarifs: TARIFS, arrets: l.arrets, plan: PLAN, options: OPTIONS };
        await banc.lignes.publier(l.id, {
          ...base,
          horaires: [
            horaire("05:30"),
            horaire("08:00", { classe: "vip", jours: ["lun", "ven"], note: "express" }),
          ],
        });
        const lus = await banc.lignes.horaires(l.id);
        expect(lus.map((h) => [h.heure, h.classe, h.jours, h.note])).toEqual([
          ["05:30", "classique", [], null],
          ["08:00", "vip", ["lun", "ven"], "express"],
        ]);
        const [matin, huit] = lus;
        // Déplacer l'un, supprimer l'autre, en ajouter un.
        await banc.lignes.publier(l.id, {
          ...base,
          tarifs: { ...TARIFS, classique: 4500 },
          horaires: [{ ...matin!, heure: "06:00" }, horaire("12:00")],
        });
        const apres = await banc.lignes.horaires(l.id);
        expect(apres.map((h) => h.heure)).toEqual(["06:00", "12:00"]);
        expect(apres.find((h) => h.heure === "06:00")!.id).toBe(matin!.id);
        expect(apres.some((h) => h.id === huit!.id)).toBe(false);
        expect((await banc.lignes.trouver(l.id))!.tarifs.classique).toBe(4500);
      });

      it("refuse un horaire inconnu et deux horaires actifs à la même heure, sans rien changer", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const base = { tarifs: TARIFS, arrets: l.arrets, plan: PLAN, options: OPTIONS };
        await banc.lignes.publier(l.id, { ...base, horaires: [horaire("05:30")] });
        const avant = await banc.lignes.horaires(l.id);
        await expect(
          banc.lignes.publier(l.id, {
            ...base,
            tarifs: { ...TARIFS, vip: 9999 },
            horaires: [horaire("07:00", { id: randomUUID() })],
          }),
        ).rejects.toBeInstanceOf(HoraireInconnu);
        await expect(
          banc.lignes.publier(l.id, {
            ...base,
            tarifs: { ...TARIFS, vip: 9999 },
            horaires: [horaire("07:00"), horaire("07:00", { classe: "vip" })],
          }),
        ).rejects.toBeInstanceOf(HoraireEnDouble);
        expect(await banc.lignes.horaires(l.id)).toEqual(avant);
        expect((await banc.lignes.trouver(l.id))!.tarifs.vip).toBe(6000);
        // Deux horaires à la même heure dont un désactivé : permis.
        await banc.lignes.publier(l.id, {
          ...base,
          horaires: [horaire("07:00"), horaire("07:00", { classe: "vip", actif: false })],
        });
        expect(await banc.lignes.horaires(l.id)).toHaveLength(2);
      });

      it("deux publications simultanées de la même heure : une seule garde sa place, jamais deux actifs", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const base = { tarifs: TARIFS, arrets: l.arrets, plan: PLAN, options: OPTIONS };
        const resultats = await Promise.allSettled([
          banc.lignes.publier(l.id, { ...base, horaires: [horaire("09:00")] }),
          banc.lignes.publier(l.id, { ...base, horaires: [horaire("09:00", { classe: "vip" })] }),
        ]);
        expect(resultats.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
        const actifs = (await banc.lignes.horaires(l.id)).filter(
          (h) => h.actif && h.heure === "09:00",
        );
        expect(actifs).toHaveLength(1);
      });

      it("garde un brouillon pour plus tard, et le publier l'efface", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        await banc.lignes.programmer(
          l.id,
          { tarifs: { ...TARIFS, classique: 5000 }, horaires: [horaire("10:00")] },
          "2027-03-09",
          PLAN,
          OPTIONS,
        );
        const r = await banc.lignes.reglage(l.id);
        expect(r).toMatchObject({ effetDu: "2027-03-09", plan: PLAN });
        expect(r!.brouillon).toEqual({
          tarifs: { ...TARIFS, classique: 5000 },
          horaires: [horaire("10:00")],
        });
        await banc.lignes.publier(l.id, {
          tarifs: TARIFS,
          arrets: l.arrets,
          plan: { ...PLAN, capacite: 60, rangees: 15 },
          options: OPTIONS,
          horaires: [],
        });
        expect(await banc.lignes.reglage(l.id)).toMatchObject({
          plan: { ...PLAN, capacite: 60, rangees: 15 },
          brouillon: null,
          effetDu: null,
        });
      });

      it("liste les lignes dont le brouillon est échu (toutes agences), et l'abandon le retire sans toucher à la ligne", async () => {
        const a = await banc.nouvelleAgence();
        const b = await banc.nouvelleAgence();
        const la = await ligne(a);
        const lb = await ligne(b);
        await banc.lignes.programmer(
          la.id,
          { tarifs: { ...TARIFS, classique: 5000 } },
          "2027-03-09",
          PLAN,
          OPTIONS,
        );
        await banc.lignes.programmer(
          lb.id,
          { tarifs: { ...TARIFS, classique: 5500 } },
          "2027-03-20",
          PLAN,
          OPTIONS,
        );
        const echues = async (jour: string) =>
          (await banc.lignes.echues(jour)).filter((e) => [la.id, lb.id].includes(e.ligneId));

        expect(await echues("2027-03-08")).toEqual([]);
        expect(await echues("2027-03-09")).toEqual([
          { compagnieId: a.compagnie.id, ligneId: la.id },
        ]);
        expect(await echues("2027-03-31")).toEqual([
          { compagnieId: a.compagnie.id, ligneId: la.id },
          { compagnieId: b.compagnie.id, ligneId: lb.id },
        ]);
        expect(await banc.lignes.echues("pas un jour")).toEqual([]);

        await banc.lignes.abandonnerBrouillon(la.id);
        expect(await banc.lignes.reglage(la.id)).toMatchObject({
          plan: PLAN,
          brouillon: null,
          effetDu: null,
        });
        expect((await banc.lignes.trouver(la.id))!.tarifs).toEqual(TARIFS);
        expect(await echues("2027-03-31")).toEqual([
          { compagnieId: b.compagnie.id, ligneId: lb.id },
        ]);
        // Publier une ligne efface aussi son brouillon : elle n'est plus échue.
        await banc.lignes.publier(lb.id, {
          tarifs: TARIFS,
          arrets: lb.arrets,
          plan: PLAN,
          options: OPTIONS,
          horaires: [],
        });
        expect(await echues("2027-03-31")).toEqual([]);
        // Une ligne sans réglage, ou inconnue : rien à abandonner, pas d'erreur.
        await banc.lignes.abandonnerBrouillon(randomUUID());
      });

      it("republier l'état par défaut d'une ligne sans réglage crée son réglage", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        await banc.lignes.publier(l.id, {
          tarifs: TARIFS,
          arrets: l.arrets,
          plan: PLAN,
          options: { venteEnLigne: false, fusionAuto: true },
          horaires: [],
        });
        expect((await banc.lignes.reglage(l.id))!.options).toEqual({
          venteEnLigne: false,
          fusionAuto: true,
        });
      });
    });

    describe("bus", () => {
      it("crée un bus, refuse la même plaque dans l'agence mais l'accepte dans une autre", async () => {
        const a = await banc.nouvelleAgence();
        const b = await banc.nouvelleAgence();
        const neuf = {
          compagnieId: a.compagnie.id,
          immatriculation: "LT 1 AA",
          capacite: 70,
          capaciteSoute: 20,
          classe: "classique" as const,
          modele: "Yutong",
          annee: 2022,
        };
        const bus = await banc.parc.creer(neuf);
        expect(bus).toMatchObject({
          immatriculation: "LT 1 AA",
          capacite: 70,
          capaciteSoute: 20,
          modele: "Yutong",
          annee: 2022,
        });
        expect(await banc.parc.creer(neuf)).toBeNull();
        expect(await banc.parc.creer({ ...neuf, compagnieId: b.compagnie.id })).not.toBeNull();
        expect((await banc.parc.lister(a.compagnie.id)).map((x) => x.id)).toEqual([bus!.id]);
        expect(await banc.parc.trouver(bus!.id)).toEqual(bus);
      });

      it("modifie la fiche ; une plaque déjà prise ou un bus inconnu sont signalés", async () => {
        const a = await banc.nouvelleAgence();
        const base = {
          compagnieId: a.compagnie.id,
          capacite: 50,
          capaciteSoute: 0,
          classe: "vip" as const,
          modele: "",
          annee: 0,
        };
        const un = (await banc.parc.creer({ ...base, immatriculation: "LT 2 AA" }))!;
        const deux = (await banc.parc.creer({ ...base, immatriculation: "LT 3 AA" }))!;
        expect(
          await banc.parc.modifier(un.id, { capacite: 55, modele: "King Long" }),
        ).toMatchObject({ capacite: 55, modele: "King Long", immatriculation: "LT 2 AA" });
        expect(await banc.parc.modifier(un.id, { immatriculation: "LT 3 AA" })).toBe(
          "immatriculation_prise",
        );
        expect(await banc.parc.modifier(un.id, { immatriculation: "LT 2 AA" })).toMatchObject({
          id: un.id,
        });
        expect(await banc.parc.modifier(randomUUID(), { capacite: 1 })).toBeNull();
        expect((await banc.parc.trouver(deux.id))!.immatriculation).toBe("LT 3 AA");
      });

      it("donne la plus grande capacité d'une classe", async () => {
        const a = await banc.nouvelleAgence();
        const base = { compagnieId: a.compagnie.id, capaciteSoute: 0, modele: "", annee: 0 };
        expect(await banc.parc.capaciteMax(a.compagnie.id, "classique")).toBeNull();
        await banc.parc.creer({
          ...base,
          immatriculation: "A1",
          capacite: 50,
          classe: "classique",
        });
        await banc.parc.creer({
          ...base,
          immatriculation: "A2",
          capacite: 70,
          classe: "classique",
        });
        await banc.parc.creer({ ...base, immatriculation: "A3", capacite: 90, classe: "vip" });
        expect(await banc.parc.capaciteMax(a.compagnie.id, "classique")).toBe(70);
        expect(await banc.parc.capaciteMax(a.compagnie.id, "vip")).toBe(90);
      });
    });

    describe("départs", () => {
      it("crée un départ, refuse un numéro déjà pris, le retrouve avec sa ligne", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const d = depart(l, "06:00");
        expect(await banc.programme.creer(d, a.compagnie.id)).toEqual({ ok: true });
        expect(await banc.programme.creer({ ...d, id: randomUUID() }, a.compagnie.id)).toEqual({
          ok: false,
          raison: "numero_pris",
        });
        const lu = await banc.programme.trouver(d.id);
        expect(lu).toMatchObject({
          id: d.id,
          numero: d.numero,
          ligneId: l.id,
          ligneCode: l.code,
          origineGareId: a.origine.id,
          compagnieId: a.compagnie.id,
          etat: "en_vente",
          classe: "classique",
          heureDepart: d.heureDepart,
          busId: null,
          billetsVendus: 0,
        });
        expect(await banc.programme.trouver(randomUUID())).toBeNull();
      });

      it("liste les départs d'une compagnie par ligne, gare d'origine et intervalle (début inclus, fin exclue)", async () => {
        const a = await banc.nouvelleAgence();
        const autre = await banc.nouvelleAgence();
        const l = await ligne(a);
        const lAutre = await ligne(autre);
        const matin = depart(l, "06:00");
        const midi = depart(l, "12:00");
        await banc.programme.creer(matin, a.compagnie.id);
        await banc.programme.creer(midi, a.compagnie.id);
        await banc.programme.creer(depart(lAutre, "06:00"), autre.compagnie.id);
        const tous = await banc.programme.lister({ compagnieId: a.compagnie.id });
        expect(tous.map((d) => d.id)).toEqual([matin.id, midi.id]);
        expect(
          (await banc.programme.lister({ compagnieId: a.compagnie.id, ligneId: l.id })).length,
        ).toBe(2);
        expect(
          (
            await banc.programme.lister({
              compagnieId: a.compagnie.id,
              origineGareId: a.destination.id,
            })
          ).length,
        ).toBe(0);
        expect(
          (
            await banc.programme.lister({
              compagnieId: a.compagnie.id,
              origineGareId: a.origine.id,
            })
          ).length,
        ).toBe(2);
        const matinSeul = await banc.programme.lister({
          compagnieId: a.compagnie.id,
          du: "2027-03-02T06:00:00.000+01:00",
          au: "2027-03-02T12:00:00.000+01:00",
        });
        expect(matinSeul.map((d) => d.id)).toEqual([matin.id]);
        expect((await banc.programme.lister({ compagnieId: randomUUID() })).length).toBe(0);
      });

      it("refuse un bus ou un chauffeur déjà pris par un départ qui chevauche, à la création et au rééquipement", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const bus = (await banc.parc.creer({
          compagnieId: a.compagnie.id,
          immatriculation: "LT 9 ZZ",
          capacite: 70,
          capaciteSoute: 0,
          classe: "classique",
          modele: "",
          annee: 0,
        }))!;
        const chauffeur = await banc.nouvellePersonne(a.compagnie.id);
        const premier = depart(l, "06:00", { busId: bus.id, chauffeurId: chauffeur });
        expect(await banc.programme.creer(premier, a.compagnie.id)).toEqual({ ok: true });
        // 8 h : la ligne dure 4 h, le premier départ est encore en route.
        const chevauche = depart(l, "08:00", { busId: bus.id });
        expect(await banc.programme.creer(chevauche, a.compagnie.id)).toEqual({
          ok: false,
          raison: "occupe",
          ressource: "bus",
          departNumero: premier.numero,
        });
        expect(await banc.programme.trouver(chevauche.id)).toBeNull();
        const libre = depart(l, "07:00");
        expect(await banc.programme.creer(libre, a.compagnie.id)).toEqual({ ok: true });
        const r = await banc.programme.equiper(libre.id, { chauffeurId: chauffeur });
        expect(r).toMatchObject({
          ok: false,
          raison: "occupe",
          ressource: "chauffeur",
          departNumero: premier.numero,
        });
        // Après l'arrivée du premier, le bus est libre.
        const tard = depart(l, "10:00", { busId: bus.id });
        expect(await banc.programme.creer(tard, a.compagnie.id)).toEqual({ ok: true });
      });

      it("rééquipe un départ (bus, chauffeur, quai), seules les clés présentes changent", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const bus = (await banc.parc.creer({
          compagnieId: a.compagnie.id,
          immatriculation: "LT 8 ZZ",
          capacite: 70,
          capaciteSoute: 0,
          classe: "classique",
          modele: "",
          annee: 0,
        }))!;
        const chauffeur = await banc.nouvellePersonne(a.compagnie.id);
        const d = depart(l, "06:00", { quai: 2 });
        await banc.programme.creer(d, a.compagnie.id);
        const r = await banc.programme.equiper(d.id, { busId: bus.id, chauffeurId: chauffeur });
        expect(r).toMatchObject({
          ok: true,
          depart: { busId: bus.id, chauffeurId: chauffeur, quai: 2 },
        });
        const r2 = await banc.programme.equiper(d.id, { quai: null, busId: null });
        expect(r2).toMatchObject({
          ok: true,
          depart: { busId: null, chauffeurId: chauffeur, quai: null },
        });
        expect(await banc.programme.equiper(randomUUID(), { quai: 1 })).toEqual({
          ok: false,
          raison: "inconnu",
        });
      });

      it("ne change plus l'équipage d'un départ parti, arrivé ou annulé", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        for (const [i, etat] of (["parti", "arrive", "annule"] as const).entries()) {
          const d = depart(l, `0${6 + i}:00`, { etat });
          await banc.programme.creer(d, a.compagnie.id);
          expect(await banc.programme.equiper(d.id, { quai: 4 })).toEqual({
            ok: false,
            raison: "etat",
            etat,
          });
        }
      });

      it("un départ arrivé ou annulé libère son bus ; un départ parti le retient jusqu'à son arrivée", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const bus = (await banc.parc.creer({
          compagnieId: a.compagnie.id,
          immatriculation: "LT 7 ZZ",
          capacite: 70,
          capaciteSoute: 0,
          classe: "classique",
          modele: "",
          annee: 0,
        }))!;
        await banc.programme.creer(
          depart(l, "06:00", { busId: bus.id, etat: "annule" }),
          a.compagnie.id,
        );
        expect(
          await banc.programme.creer(depart(l, "07:00", { busId: bus.id }), a.compagnie.id),
        ).toEqual({ ok: true });
        // Parti à 13 h pour 4 h : à 15 h le bus est encore en route.
        const bus2 = (await banc.parc.creer({
          compagnieId: a.compagnie.id,
          immatriculation: "LT 6 ZZ",
          capacite: 70,
          capaciteSoute: 0,
          classe: "classique",
          modele: "",
          annee: 0,
        }))!;
        const parti2 = depart(l, "13:00", { busId: bus2.id, etat: "parti" });
        expect(await banc.programme.creer(parti2, a.compagnie.id)).toEqual({ ok: true });
        const suivant = depart(l, "15:00", { busId: bus2.id });
        expect(await banc.programme.creer(suivant, a.compagnie.id)).toMatchObject({
          ok: false,
          raison: "occupe",
          ressource: "bus",
        });
      });

      it("compte les départs à venir d'un bus (programmé, en vente, embarquement, retardé)", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const bus = (await banc.parc.creer({
          compagnieId: a.compagnie.id,
          immatriculation: "LT 5 ZZ",
          capacite: 70,
          capaciteSoute: 0,
          classe: "classique",
          modele: "",
          annee: 0,
        }))!;
        expect(await banc.programme.departsAVenirDuBus(bus.id)).toBe(0);
        await banc.programme.creer(
          depart(l, "06:00", { busId: bus.id, etat: "programme" }),
          a.compagnie.id,
        );
        await banc.programme.creer(
          depart(l, "11:00", { busId: bus.id, etat: "embarquement" }),
          a.compagnie.id,
        );
        await banc.programme.creer(
          depart(l, "16:00", { busId: bus.id, etat: "arrive" }),
          a.compagnie.id,
        );
        await banc.programme.creer(
          depart(l, "21:00", { busId: bus.id, etat: "annule" }),
          a.compagnie.id,
        );
        expect(await banc.programme.departsAVenirDuBus(bus.id)).toBe(2);
      });

      it("deux créations simultanées du même bus sur des départs qui se chevauchent : une seule passe", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const bus = (await banc.parc.creer({
          compagnieId: a.compagnie.id,
          immatriculation: "LT 4 ZZ",
          capacite: 70,
          capaciteSoute: 0,
          classe: "classique",
          modele: "",
          annee: 0,
        }))!;
        const r = await Promise.all([
          banc.programme.creer(depart(l, "06:00", { busId: bus.id }), a.compagnie.id),
          banc.programme.creer(depart(l, "07:00", { busId: bus.id }), a.compagnie.id),
          banc.programme.creer(depart(l, "08:00", { busId: bus.id }), a.compagnie.id),
        ]);
        expect(r.filter((x) => x.ok)).toHaveLength(1);
      });

      it("deux générations simultanées du même numéro : un seul départ", async () => {
        const a = await banc.nouvelleAgence();
        const l = await ligne(a);
        const numero = `GEN-${randomUUID().slice(0, 8)}`;
        const r = await Promise.all(
          [1, 2, 3].map(() => banc.programme.creer(depart(l, "06:00", { numero }), a.compagnie.id)),
        );
        expect(r.filter((x) => x.ok)).toHaveLength(1);
        expect(r.filter((x) => !x.ok && x.raison === "numero_pris")).toHaveLength(2);
      });
    });

    describe("appareils enrôlés", () => {
      const declaration = async (agence: AgenceDeTest, code = `code-${randomUUID()}`) => {
        const appareilId = await banc.nouvelAppareilSync(agence);
        return {
          appareilId,
          codeHache: code,
          declaration: {
            appareilId,
            compagnieId: agence.compagnie.id,
            gareId: agence.origine.id,
            libelle: "Guichet 1",
            codeHache: code,
            codeExpireA: "2027-03-03T09:00:00.000+01:00",
            creePar: null,
            creeA: "2027-03-02T09:00:00.000+01:00",
          },
        };
      };

      it("déclare, liste par agence et par gare, retrouve l'appareil", async () => {
        const a = await banc.nouvelleAgence();
        const b = await banc.nouvelleAgence();
        const d = await declaration(a);
        await banc.registre.declarer(d.declaration);
        await banc.registre.declarer((await declaration(b)).declaration);
        expect(await banc.registre.trouver(d.appareilId)).toEqual({
          appareilId: d.appareilId,
          compagnieId: a.compagnie.id,
          gareId: a.origine.id,
          libelle: "Guichet 1",
          codeExpireA: "2027-03-03T09:00:00.000+01:00",
          enroleA: null,
          actif: false,
          creeA: "2027-03-02T09:00:00.000+01:00",
        });
        expect(
          (await banc.registre.lister({ compagnieId: a.compagnie.id })).map((x) => x.appareilId),
        ).toEqual([d.appareilId]);
        expect(
          await banc.registre.lister({ compagnieId: a.compagnie.id, gareId: a.destination.id }),
        ).toEqual([]);
        expect(await banc.registre.trouver("inconnu")).toBeNull();
      });

      it("enrôle avec le code, une seule fois, avant son échéance", async () => {
        const a = await banc.nouvelleAgence();
        const d = await declaration(a);
        await banc.registre.declarer(d.declaration);
        const trop_tard = await banc.registre.enroler(
          d.codeHache,
          "secret-1",
          "2027-03-03T09:00:00.000+01:00",
        );
        expect(trop_tard).toEqual({ ok: false, raison: "expire" });
        const ok = await banc.registre.enroler(
          d.codeHache,
          "secret-1",
          "2027-03-02T10:00:00.000+01:00",
        );
        expect(ok).toMatchObject({
          ok: true,
          enrolement: { appareilId: d.appareilId, actif: true, codeExpireA: null },
        });
        expect(
          await banc.registre.enroler(d.codeHache, "secret-2", "2027-03-02T10:01:00.000+01:00"),
        ).toEqual({ ok: false, raison: "inconnu" });
        expect(await banc.registre.secretValide(d.appareilId, "secret-1")).toBe(true);
        expect(await banc.registre.secretValide(d.appareilId, "secret-2")).toBe(false);
        expect(await banc.registre.secretValide("inconnu", "secret-1")).toBe(false);
      });

      it("deux enrôlements simultanés avec le même code : un seul passe", async () => {
        const a = await banc.nouvelleAgence();
        const d = await declaration(a);
        await banc.registre.declarer(d.declaration);
        const r = await Promise.all(
          [1, 2, 3, 4].map((i) =>
            banc.registre.enroler(d.codeHache, `secret-${i}`, "2027-03-02T10:00:00.000+01:00"),
          ),
        );
        expect(r.filter((x) => x.ok)).toHaveLength(1);
      });

      it("un nouveau code remplace l'ancien ; un nouvel enrôlement remplace le secret", async () => {
        const a = await banc.nouvelleAgence();
        const d = await declaration(a);
        await banc.registre.declarer(d.declaration);
        await banc.registre.enroler(d.codeHache, "ancien", "2027-03-02T10:00:00.000+01:00");
        const nouveau = `nouveau-${randomUUID()}`;
        expect(
          await banc.registre.nouveauCode(d.appareilId, nouveau, "2027-03-04T09:00:00.000+01:00"),
        ).toBe(true);
        expect(
          await banc.registre.nouveauCode("inconnu", nouveau, "2027-03-04T09:00:00.000+01:00"),
        ).toBe(false);
        expect(
          await banc.registre.enroler(d.codeHache, "x", "2027-03-02T10:00:00.000+01:00"),
        ).toEqual({ ok: false, raison: "inconnu" });
        expect(
          await banc.registre.enroler(nouveau, "secours", "2027-03-03T10:00:00.000+01:00"),
        ).toMatchObject({ ok: true });
        expect(await banc.registre.secretValide(d.appareilId, "ancien")).toBe(false);
        expect(await banc.registre.secretValide(d.appareilId, "secours")).toBe(true);
      });

      it("retire l'appareil : plus de secret, plus de code", async () => {
        const a = await banc.nouvelleAgence();
        const d = await declaration(a);
        await banc.registre.declarer(d.declaration);
        await banc.registre.enroler(d.codeHache, "s", "2027-03-02T10:00:00.000+01:00");
        const code2 = `c-${randomUUID()}`;
        await banc.registre.nouveauCode(d.appareilId, code2, "2027-03-04T09:00:00.000+01:00");
        await banc.registre.retirer(d.appareilId);
        expect(await banc.registre.secretValide(d.appareilId, "s")).toBe(false);
        expect(await banc.registre.enroler(code2, "t", "2027-03-02T11:00:00.000+01:00")).toEqual({
          ok: false,
          raison: "inconnu",
        });
        expect(await banc.registre.trouver(d.appareilId)).toMatchObject({
          actif: false,
          codeExpireA: null,
        });
      });

      it("serialise les travaux exclusifs d'une même compagnie", async () => {
        const a = await banc.nouvelleAgence();
        let enCours = 0;
        let maxi = 0;
        const travail = async () => {
          enCours += 1;
          maxi = Math.max(maxi, enCours);
          await new Promise((r) => setTimeout(r, 15));
          enCours -= 1;
          return "fait";
        };
        const r = await Promise.all(
          [1, 2, 3, 4].map(() => banc.registre.exclusif(a.compagnie.id, travail)),
        );
        expect(r).toEqual(["fait", "fait", "fait", "fait"]);
        expect(maxi).toBe(1);
        await expect(
          banc.registre.exclusif(a.compagnie.id, async () => Promise.reject(new Error("boum"))),
        ).rejects.toThrow("boum");
        expect(await banc.registre.exclusif(a.compagnie.id, async () => 42)).toBe(42);
      });
    });

    describe("ordres envoyés aux appareils", () => {
      const ordre = (appareilId: string): CommandeAppareil => ({
        id: randomUUID(),
        appareilId,
        type: "effacer",
        emiseA: "2027-03-02T09:00:00.000+01:00",
        emisePar: null,
        motif: "Téléphone volé",
        acquitteeA: null,
      });
      const rapport: RapportEffacement = {
        effaceA: "2027-03-02T09:00:20.000+01:00",
        complet: true,
        etapes: [
          { nom: "localStorage", ok: true },
          { nom: "indexedDB", ok: false, detail: "base ouverte" },
        ],
      };

      it("émet un ordre, le rend en attente, refuse un second ordre tant que le premier attend", async () => {
        const a = await banc.nouvelleAgence();
        const id = await banc.nouvelAppareilSync(a);
        const o = ordre(id);
        expect(await banc.ordres.emettre(o)).toEqual(o);
        expect(await banc.ordres.emettre(ordre(id))).toBe("deja_en_attente");
        expect(await banc.ordres.enAttente(id)).toEqual(o);
        expect(await banc.ordres.trouver(o.id)).toEqual(o);
        expect(await banc.ordres.dernier(id)).toEqual(o);
        expect(await banc.ordres.enAttente(await banc.nouvelAppareilSync(a))).toBeNull();
        expect(await banc.ordres.trouver(randomUUID())).toBeNull();
      });

      it("l'accusé ne s'écrit qu'une fois, puis un nouvel ordre peut être émis", async () => {
        const a = await banc.nouvelleAgence();
        const id = await banc.nouvelAppareilSync(a);
        const o = ordre(id);
        await banc.ordres.emettre(o);
        expect(await banc.ordres.acquitter(o.id, "2027-03-02T09:01:00.000+01:00", rapport)).toBe(
          "ok",
        );
        expect(
          await banc.ordres.acquitter(o.id, "2027-03-02T09:02:00.000+01:00", {
            ...rapport,
            complet: false,
          }),
        ).toBe("deja_acquittee");
        expect(
          await banc.ordres.acquitter(randomUUID(), "2027-03-02T09:02:00.000+01:00", rapport),
        ).toBe("inconnue");
        expect(await banc.ordres.enAttente(id)).toBeNull();
        expect(await banc.ordres.trouver(o.id)).toMatchObject({
          acquitteeA: "2027-03-02T09:01:00.000+01:00",
        });
        const suivant = ordre(id);
        expect(
          await banc.ordres.emettre({ ...suivant, emiseA: "2027-03-02T10:00:00.000+01:00" }),
        ).toMatchObject({ id: suivant.id });
        expect((await banc.ordres.dernier(id))!.id).toBe(suivant.id);
        expect((await banc.ordres.enAttente(id))!.id).toBe(suivant.id);
      });

      it("deux émissions simultanées pour un même appareil : un seul ordre", async () => {
        const a = await banc.nouvelleAgence();
        const id = await banc.nouvelAppareilSync(a);
        const r = await Promise.all(
          [ordre(id), ordre(id), ordre(id)].map((o) => banc.ordres.emettre(o)),
        );
        expect(r.filter((x) => x !== "deja_en_attente")).toHaveLength(1);
      });

      it("deux accusés simultanés du même ordre : un seul est enregistré", async () => {
        const a = await banc.nouvelleAgence();
        const id = await banc.nouvelAppareilSync(a);
        const o = ordre(id);
        await banc.ordres.emettre(o);
        const r = await Promise.all(
          [1, 2, 3].map(() =>
            banc.ordres.acquitter(o.id, "2027-03-02T09:01:00.000+01:00", rapport),
          ),
        );
        expect(r.filter((x) => x === "ok")).toHaveLength(1);
        expect(r.filter((x) => x === "deja_acquittee")).toHaveLength(2);
      });
    });
  });
}
