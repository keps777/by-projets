import { patron } from "@afrimove/contrats";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CORPS_RAPPORT_SOIR,
  LONGUEUR_CORPS_MAX,
  erreursRapport,
  formaterRapport,
  grouper,
  remplirCorps,
} from "../whatsapp/rapport";
import {
  PlanificateurRapportSoir,
  RapportSoirWhatsAppService,
} from "../whatsapp/rapport-soir.service";
import {
  PATRON,
  SUPERVISEUR_AKWA,
  SUPERVISEUR_MVAN,
  monterWhatsApp,
} from "../whatsapp/testing/montage";
import { SourceRapportSoirPourWhatsApp } from "./source-whatsapp";
import {
  AKWA,
  COMPAGNIE,
  GARES,
  JOUR,
  VINGT_ET_UNE_HEURES,
  billet,
  caisse,
  instant,
  monterRapport,
  peuplerPlanche,
} from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

describe("conformité au contrat RapportSoir de @afrimove/contrats", () => {
  it("le rapport de la planche est accepté par le schéma strict du contrat, tel quel", async () => {
    const m = monterRapport();
    peuplerPlanche(m);
    m.allerA(VINGT_ET_UNE_HEURES);
    const { rapport } = await m.service.generer(COMPAGNIE, JOUR);
    const lu = patron.RapportSoirSchema.parse(JSON.parse(JSON.stringify(rapport)));
    expect(lu).toEqual(rapport);
  });

  it("un jour sans aucune activité, une source en panne et une gare inconnue restent conformes", async () => {
    const vide = monterRapport();
    const r1 = (await vide.service.generer(COMPAGNIE, JOUR)).rapport;
    expect(patron.RapportSoirSchema.safeParse(r1).success).toBe(true);
    expect(r1.chiffres).toMatchObject({ billets: 0, recette: 0, cash: 0, momo: 0 });

    const panne = monterRapport();
    peuplerPlanche(panne);
    panne.caisses.enPanne = true;
    panne.controles.enPanne = true;
    panne.annulations.enPanne = true;
    panne.departs.enPanne = true;
    panne.ventes.ajouter(COMPAGNIE, billet({ gareId: "gare-fantome" }));
    const r2 = (await panne.service.generer(COMPAGNIE, JOUR)).rapport;
    expect(patron.RapportSoirSchema.safeParse(r2).success).toBe(true);
  });

  it("la forme du module et celle du contrat portent les mêmes champs", async () => {
    const m = monterRapport();
    peuplerPlanche(m);
    const { rapport } = await m.service.generer(COMPAGNIE, JOUR);
    const cles = (o: object): string[] => Object.keys(o).sort();
    expect(cles(rapport)).toEqual(cles(patron.RapportSoirSchema.shape));
    expect(cles(rapport.chiffres)).toEqual(cles(patron.RapportSoirSchema.shape.chiffres.shape));
    expect(cles(rapport.gares[0]!)).toEqual(cles(patron.RapportGareSchema.shape));
    expect(cles(rapport.enRoute)).toEqual(cles(patron.RapportSoirSchema.shape.enRoute.shape));
  });
});

describe("mise en forme WhatsApp : le rapport passe la validation du gabarit sans conversion", () => {
  it("la planche : aucune erreur, quinze variables, corps sous la limite", async () => {
    const m = monterRapport();
    peuplerPlanche(m);
    m.allerA(VINGT_ET_UNE_HEURES);
    const { rapport } = await m.service.generer(COMPAGNIE, JOUR);
    expect(erreursRapport(rapport)).toEqual([]);
    const f = formaterRapport("Oméga", rapport);
    expect(f.parametres).toHaveLength(15);
    const corps = remplirCorps(CORPS_RAPPORT_SOIR, f.parametres);
    expect(corps.length).toBeLessThanOrEqual(LONGUEUR_CORPS_MAX);
    expect(corps).toContain(`Billets : ${grouper(1004)} (+6 % vs hier)`);
    expect(corps).toContain("Recette : 4,41 M F (cash 2,9 M F · MoMo 1,51 M F)");
    expect(corps).toContain("3 guichets clôturés · guichet 2, validé par Essono");
    expect(corps).toContain("Colis : 312 (0 litige)");
    expect(corps).toContain("Signé : Essono (Akwa), Tchinda (Mvan), Fosso (Bafoussam)");
  });

  it("un rapport chargé (50 gares, trous partout, 20 superviseurs) reste valide pour WhatsApp", async () => {
    const m = monterRapport();
    const gares = Array.from({ length: 50 }, (_, i) => ({
      id: `gare-${i}`,
      nom: `Gare numéro ${i} de la compagnie avec un nom beaucoup trop long pour tenir`,
    }));
    m.referentiel.ajouter({ id: "grosse", nom: "Grosse Compagnie" }, gares);
    for (const g of gares) {
      m.ventes.ajouter("grosse", billet({ gareId: g.id }));
      m.trous.ajouter(
        "grosse",
        JOUR,
        ...Array.from({ length: 15 }, (_, i) => ({
          gareId: g.id,
          message: `Trou ${i} `.repeat(30),
        })),
      );
      m.caisses.ajouter(
        "grosse",
        JOUR,
        ...Array.from({ length: 2 }, (_, i) =>
          caisse({
            gareId: g.id,
            guichetRang: i + 1,
            validation: {
              superviseurId: `s-${g.id}-${i}`,
              superviseurNom: `Superviseur ${i}`,
              at: instant("19:00"),
            },
          }),
        ),
      );
    }
    m.controles.ajouter(
      "grosse",
      JOUR,
      ...Array.from({ length: 80 }, (_, i) => ({
        controleId: `k${i}`,
        lieu: `Lieu ${i}`,
        regularisations: 1,
        ventesNonEnregistrees: 1,
      })),
    );
    const { rapport } = await m.service.generer("grosse", JOUR);
    expect(rapport.signatures.length).toBeLessThanOrEqual(20);
    expect(erreursRapport(rapport)).toEqual([]);
    expect(patron.RapportSoirSchema.safeParse(rapport).success).toBe(true);
    expect(formaterRapport("Grosse Compagnie", rapport).parametres).toHaveLength(15);
  });
});

describe("envoi WhatsApp à 21 h avec la passerelle AM-167", () => {
  /** Le rapport et la passerelle, chacun avec son horloge, mis à 21:00 ensemble. */
  function monter() {
    const rapport = monterRapport();
    peuplerPlanche(rapport);
    // Une caisse d'Akwa n'est pas validée à 21 h : le rapport doit partir quand même.
    rapport.caisses.ajouter(
      COMPAGNIE,
      JOUR,
      caisse({ gareId: AKWA, guichetRang: 4, etat: "cloturee", ecart: -500, validation: null }),
    );
    const wa = monterWhatsApp();
    wa.annuaire.definir(COMPAGNIE, [PATRON, SUPERVISEUR_AKWA, SUPERVISEUR_MVAN]);
    const source = new SourceRapportSoirPourWhatsApp(rapport.referentiel, rapport.service);
    const rapports = new RapportSoirWhatsAppService(wa.passerelle, source, wa.annuaire, wa.journal);
    const maintenant = () => {
      rapport.allerA(VINGT_ET_UNE_HEURES);
      wa.horloge.avancer(VINGT_ET_UNE_HEURES.getTime() - wa.horloge.maintenant().getTime());
    };
    return { rapport, wa, source, rapports, maintenant };
  }

  it("le patron et les superviseurs reçoivent le rapport, caisse non validée signalée", async () => {
    const t = monter();
    t.maintenant();
    const resume = await t.rapports.envoyerRapport(COMPAGNIE, JOUR);
    expect(resume).toMatchObject({ destinataires: 3, envoyes: 3, echecs: [] });
    await t.wa.vider();

    expect(t.wa.fournisseur.envoyes.map((e) => e.destinataire).sort()).toEqual(
      [PATRON, SUPERVISEUR_AKWA, SUPERVISEUR_MVAN].map((p) => p.telephone).sort(),
    );
    const texte = t.wa.fournisseur.envoyes[0]!.texte;
    expect(texte).toContain("Rapport du mardi 5 janvier · 3 gares");
    expect(texte).toContain(`Billets : ${grouper(1004)} (+6 % vs hier)`);
    expect(texte).toContain("guichet 4, caisse non validée");
    expect(texte).toContain("le 09:30 Oméga part à 55 %");
  });

  it("le planificateur de la passerelle, à 21:00, arrête le rapport et l'envoie sans validation", async () => {
    const t = monter();
    expect(await t.rapport.service.lire(COMPAGNIE, JOUR)).toBeNull();
    // Le planificateur de la passerelle lit la source de son montage : on lui donne la nôtre.
    const reel = new PlanificateurRapportSoir(
      t.rapports,
      t.source,
      t.wa.journal,
      t.wa.audit,
      t.wa.horloge,
      t.wa.config,
    );

    expect(await reel.tick()).toEqual([]); // 08:00 : pas l'heure
    t.maintenant();
    const traites = await reel.tick();
    expect(traites).toContain(COMPAGNIE);
    await t.wa.vider();

    // le rapport a été arrêté à 21:00 par l'envoi lui-même, et c'est celui que l'application lira
    const stocke = await t.rapport.service.lire(COMPAGNIE, JOUR);
    expect(stocke).not.toBeNull();
    expect(stocke!.envoyeA).toBe("2027-01-05T21:00:00.000+01:00");
    expect(t.wa.fournisseur.envoyes).toHaveLength(3);
    expect(t.wa.fournisseur.envoyes[0]!.texte).toContain("Rapport du mardi 5 janvier");

    // un second passage n'envoie rien de plus
    expect(await reel.tick()).toEqual([]);
    await t.wa.vider();
    expect(t.wa.fournisseur.envoyes).toHaveLength(3);
  });

  it("relancer l'envoi renvoie le même rapport et n'envoie rien en double", async () => {
    const t = monter();
    t.maintenant();
    await t.rapports.envoyerRapport(COMPAGNIE, JOUR);
    await t.wa.vider();
    const avant = await t.rapport.service.lire(COMPAGNIE, JOUR);
    t.rapport.ventes.ajouter(COMPAGNIE, billet({ venduA: instant("22:00") }));
    const deuxieme = await t.rapports.envoyerRapport(COMPAGNIE, JOUR);
    expect(deuxieme).toMatchObject({ envoyes: 0, dejaEnvoyes: 3 });
    expect(await t.rapport.service.lire(COMPAGNIE, JOUR)).toEqual(avant);
  });

  it("répond « pas de rapport » avant l'heure, pour un jour futur ou une compagnie inconnue", async () => {
    const t = monter(); // 08:00
    expect(await t.source.rapport(COMPAGNIE, JOUR)).toBeNull();
    t.maintenant();
    expect(await t.source.rapport(COMPAGNIE, "2027-01-06")).toBeNull();
    expect(await t.source.rapport("inconnue", JOUR)).toBeNull();
    expect(await t.source.rapport(COMPAGNIE, JOUR)).not.toBeNull();
    expect(await t.source.compagnie(COMPAGNIE)).toEqual({ id: COMPAGNIE, nom: "Oméga" });
    expect((await t.source.compagnies()).map((c) => c.id)).toContain(COMPAGNIE);
    expect(t.source.reel).toBe(true);
    expect(GARES).toHaveLength(3);
  });
});
