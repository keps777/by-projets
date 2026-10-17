import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recetteTotale, remplissagePct, vivants } from "../analyses/agregats";
import { dateCourte, jourSemaine } from "../analyses/periodes";
import { detecter } from "../analyses/regles";
import {
  AUJOURDHUI,
  BUS_207,
  COMPAGNIE,
  DLA_BAF,
  DLA_YDE,
  depart,
  ecart,
} from "../analyses/testing/montage";
import { decalerJour } from "../rapport/temps";
import { interpreter } from "./interpretation";
import type { Brouillon, ContexteConversation } from "./modele";
import { phraseSources, prochainJour, questionsSuggerees, repondre } from "./moteur";
import {
  DEBUT_RECENT,
  dernierDepart,
  genererDynamique,
  monterAssistant,
  peuplerBafoussam,
  type MontageAssistant,
} from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

async function demander(
  m: MontageAssistant,
  question: string,
  precedent: ContexteConversation | null = null,
): Promise<Brouillon> {
  const ctx = await m.service.contexte(COMPAGNIE);
  return repondre(interpreter(question, ctx.lignes, ctx.aujourdhui), {
    ctx,
    analyses: m.service,
    constats: () => detecter(ctx),
    precedent,
  });
}

const DU = decalerJour(AUJOURDHUI, -30);
const AU = decalerJour(AUJOURDHUI, -1);
const pct = (n: number) => `${Math.round(n)} %`;
const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/[  ]/g, " ");

function planche(): MontageAssistant {
  const m = monterAssistant();
  peuplerBafoussam(m);
  return m;
}

describe("« Pourquoi Bafoussam baisse ? »", () => {
  it("le résumé donne la variation de la recette sur deux semaines et ce qui pèse, avec le nom complet de la ligne", async () => {
    const m = planche();
    const faits = vivants(await m.departs.entre(COMPAGNIE, DU, AU));
    const recette = (du: string, au: string) =>
      faits.filter((d) => d.jour >= du && d.jour <= au).reduce((s, d) => s + d.recetteBillets, 0);
    const recent = recette(DEBUT_RECENT, AU);
    const avant = recette(decalerJour(DEBUT_RECENT, -14), decalerJour(DEBUT_RECENT, -1));
    const variation = Math.round(((recent - avant) / avant) * 1000) / 10;
    expect(variation).toBeLessThan(-5);

    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.intention).toBe("pourquoi_ligne");
    expect(b.resume).toBe(
      `Douala → Bafoussam fait − ${fmt(Math.abs(variation)).replace(".", ",")} % sur deux semaines. Ce qui pèse : le mercredi et le 10:00.`,
    );
    expect(b.motsObligatoires).toEqual(["Douala → Bafoussam"]);
  });

  it("explique avec des points numérotés : recette, mercredis, 10:00 face au concurrent public, colis", async () => {
    const m = planche();
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.points).toHaveLength(4);
    expect(b.points.map((p) => p.slice(0, 3))).toEqual(["1. ", "2. ", "3. ", "4. "]);

    const faits = vivants(await m.departs.entre(COMPAGNIE, DU, AU));
    const mercredis = faits.filter((d) => jourSemaine(d.jour) === 3 && d.jour >= DEBUT_RECENT);
    const avantMercredis = faits.filter(
      (d) =>
        jourSemaine(d.jour) === 3 &&
        d.jour < DEBUT_RECENT &&
        d.jour >= decalerJour(DEBUT_RECENT, -14),
    );
    expect(b.points[0]).toMatch(
      /^1\. Les billets de la ligne ont rapporté [\d ]+ F ces 14 derniers jours, contre [\d ]+ F les 14 jours d'avant\.$/,
    );
    expect(b.points[1]).toContain(
      `Les 2 mercredis sont à ${pct(remplissagePct(mercredis))} de remplissage`,
    );
    expect(b.points[1]).toContain(`(${pct(remplissagePct(avantMercredis))} les mercredis d'avant)`);
    // Les mardis : tous les départs pleins sauf le 10:00 (55 %) → (4 × 40 + 22) / 200 = 91 %.
    expect(b.points[1]).toContain(
      "Le mardi, la ligne remplit à 91 % : la demande semble s'être déplacée vers la veille.",
    );
    expect(b.points[2]).toContain("Le 10:00 part à");
    expect(b.points[2]).toContain("Il était à 80 % les 14 jours d'avant.");
    expect(b.points[2]).toContain("Oméga part à 09:30 à 3 500 F, 500 F de moins que toi.");
    expect(b.points[3]).toBe("4. Les colis montent : + 9 % sur la même période.");
  });

  it("propose d'ajouter un départ la veille du creux, de décaler le 10:00 devant le concurrent, et de voir la ligne", async () => {
    const m = planche();
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.actions.map((a) => a.type)).toEqual([
      "ajouter_depart",
      "decaler_depart",
      "voir_ligne",
    ]);
    expect(b.actions[0]!.libelle).toBe("Ajouter un départ mardi 06:00");
    expect(b.actions[1]!.libelle).toBe("Décaler le 10:00 à 09:15 dès lundi");
    expect(b.actions[2]!.parametres).toEqual({ type: "voir_ligne", ligneId: DLA_BAF.id });
  });

  it("cite ses sources, sans jamais le nom d'un autre que le concurrent public ni un chiffre qui ne vient pas de l'agence", async () => {
    const m = planche();
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.sources.map((s) => s.type)).toEqual(["ventes", "offres_publiques", "colis"]);
    const phrase = phraseSources(b.sources)!;
    expect(phrase).toMatch(
      /^Sources : tes ventes de billets \(\d+ départs, du \d+ \S+ au \d+ \S+\), l'horaire et le prix publics d'Oméga, tes colis \(.*\)\. Jamais les chiffres d'une autre compagnie\.$/,
    );
    expect(phraseSources([])).toBeNull();
  });

  it("garde en mémoire la ligne et le 10:00 dont il parlait", async () => {
    const m = planche();
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.contexte).toEqual({ ligneId: DLA_BAF.id, departId: await dernierDepart(m, "10:00") });
  });

  it("une ligne qui ne baisse pas le dit, sans inventer de cause", async () => {
    const m = monterAssistant();
    m.referentiel.ajouterLigne(COMPAGNIE, DLA_BAF);
    m.departs.ajouter(
      COMPAGNIE,
      ...genererDynamique(DLA_BAF.id, DU, AU, [{ heure: "08:00", remplissage: () => 70 }]),
    );
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.resume).toBe("Douala → Bafoussam ne baisse pas : 0 % sur deux semaines.");
    expect(b.points).toHaveLength(1);
    expect(b.actions.map((a) => a.type)).toEqual(["voir_ligne"]);
  });

  it("une ligne qui baisse sans jour ni départ en cause dit qu'il ne voit pas pourquoi", async () => {
    const m = monterAssistant();
    m.referentiel.ajouterLigne(COMPAGNIE, DLA_BAF);
    m.departs.ajouter(
      COMPAGNIE,
      ...genererDynamique(DLA_BAF.id, DU, AU, [
        { heure: "08:00", remplissage: (j) => (j >= DEBUT_RECENT ? 60 : 70) },
      ]),
    );
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.resume).toMatch(
      /^Douala → Bafoussam fait − \d+(,\d)? % sur deux semaines\. Je ne vois ni un jour ni un départ qui l'explique clairement\.$/,
    );
  });

  it("trop peu de départs : il refuse de comparer plutôt que d'inventer", async () => {
    const m = monterAssistant();
    m.referentiel.ajouterLigne(COMPAGNIE, DLA_BAF);
    m.departs.ajouter(
      COMPAGNIE,
      ...genererDynamique(DLA_BAF.id, decalerJour(AU, -5), AU, [
        { heure: "08:00", remplissage: () => 70 },
      ]),
    );
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.resume).toContain("Je n'ai pas assez de départs de Douala → Bafoussam");
    expect(b.figee).toBe(true);
    expect(b.points).toEqual([]);
  });

  it("sans nommer les concurrents, l'offre publique reste anonyme", async () => {
    const m = monterAssistant();
    (m.config as { nommerConcurrents: boolean }).nommerConcurrents = false;
    peuplerBafoussam(m);
    const b = await demander(m, "Pourquoi Bafoussam baisse ?");
    expect(b.points[2]).toContain("Une autre compagnie part à 09:30");
    expect(JSON.stringify(b)).not.toContain("Oméga");
  });
});

describe("« Quel bus coûte le plus ? »", () => {
  it("classe les bus par dépenses des 30 derniers jours, pannes comprises, et cite le chauffeur habituel du premier", async () => {
    const m = planche();
    m.departs.ajouter(
      COMPAGNIE,
      depart({
        busId: BUS_207.id,
        ligneId: DLA_BAF.id,
        jour: "2027-01-02",
        heure: "20:00",
        coutPanne: 2_500_000,
        incident: { nature: "panne", description: "embrayage", dureeMinutes: 200 },
      }),
    );
    const b = await demander(m, "Quel bus coûte le plus ?");
    // LT 207 : 30 départs de 08:15 + 1 départ de 20:00 à 30 000 F de carburant, et 2 500 000 F de panne.
    expect(b.resume).toBe(
      "LT 207 AB est le bus qui coûte le plus : 3 430 000 F de dépenses en 30 jours, dont 930 000 F de carburant et 2 500 000 F de pannes.",
    );
    expect(b.points).toHaveLength(3);
    expect(b.points[0]).toMatch(
      /^1\. LT 207 AB : 3 430 000 F pour 31 trajets, soit 110 645 F par trajet \(net .* F\)\. Chauffeur habituel : Nana\.$/,
    );
    expect(b.points[1]).toMatch(/^2\. LT 330 AB : 2 700 000 F pour 90 trajets/);
    expect(b.points[2]).toMatch(/^3\. LT 412 AB : 900 000 F pour 30 trajets/);
    expect(b.actions).toEqual([]);
    expect(b.sources[0]!.description).toContain("tes dépenses de carburant");
  });

  it("sans trajet, il ne désigne personne", async () => {
    const m = monterAssistant();
    m.referentiel.ajouterBus(COMPAGNIE, BUS_207);
    const b = await demander(m, "Quel bus coûte le plus ?");
    expect(b.resume).toContain("Je n'ai aucun trajet de bus");
    expect(b.figee).toBe(true);
  });
});

describe("« Prévision de samedi »", () => {
  it("la prévision est la moyenne des derniers samedis, avec la fourchette observée", async () => {
    const m = planche();
    const faits = vivants(await m.departs.entre(COMPAGNIE, DU, AU));
    const parSamedi = new Map<string, number>();
    for (const d of faits.filter((x) => jourSemaine(x.jour) === 6)) {
      parSamedi.set(d.jour, (parSamedi.get(d.jour) ?? 0) + recetteTotale(d));
    }
    const recettes = [...parSamedi.values()];
    expect(recettes).toHaveLength(4);
    const moyenne = Math.round(recettes.reduce((s, x) => s + x, 0) / 4);

    const b = await demander(m, "Prévision de samedi");
    expect(b.intention).toBe("prevision_jour");
    const prochain = prochainJour(AUJOURDHUI, 6);
    expect(prochain).toBe("2027-01-09");
    expect(b.resume).toBe(
      `Samedi ${dateCourte(prochain)} : environ ${fmt(moyenne)} F de recette, d'après les 4 derniers samedis ` +
        `(de ${fmt(Math.min(...recettes))} F à ${fmt(Math.max(...recettes))} F).`,
    );
    expect(b.points[0]).toMatch(
      /^1\. Remplissage moyen les samedis : \d+ %, soit [+−] ?.*% de recette par rapport à un jour moyen\.$|^1\. Remplissage moyen les samedis : \d+ %, comme un jour moyen\.$/,
    );
    expect(b.points[1]).toMatch(/^2\. Douala → Bafoussam : environ [\d ]+ F, remplissage \d+ %\.$/);
  });

  it("aujourd'hui compte : mardi est « aujourd'hui » un mardi, mercredi est demain", () => {
    expect(prochainJour(AUJOURDHUI, 2)).toBe(AUJOURDHUI);
    expect(prochainJour(AUJOURDHUI, 3)).toBe("2027-01-06");
    expect(prochainJour(AUJOURDHUI, 1)).toBe("2027-01-11");
  });

  it("avec moins de deux jours observés, il ne prévoit pas", async () => {
    const m = monterAssistant();
    m.referentiel.ajouterLigne(COMPAGNIE, DLA_BAF);
    m.departs.ajouter(
      COMPAGNIE,
      ...genererDynamique(DLA_BAF.id, decalerJour(AU, -3), AU, [
        { heure: "08:00", remplissage: () => 70 },
      ]),
    );
    const b = await demander(m, "Prévision de lundi");
    expect(b.resume).toMatch(
      /^Je n'ai que 1 lundi dans les 30 derniers jours : c'est trop peu pour prévoir le lundi \(11 janv\.\)\.$/,
    );
    expect(b.figee).toBe(true);
  });
});

describe("« Et si je baisse à 3 500 moi aussi ? »", () => {
  async function apresPourquoi(m: MontageAssistant) {
    const avant = await demander(m, "Pourquoi Bafoussam baisse ?");
    return avant.contexte;
  }

  it("à 3 500 le 10:00 : les passagers en plus pour s'y retrouver, la simulation du prix, et le déplacement à 09:15 comme meilleure piste", async () => {
    const m = planche();
    const contexte = await apresPourquoi(m);
    const departId = await dernierDepart(m, "10:00");
    const prix = await m.service.simuler(COMPAGNIE, { type: "prix", departId, nouveauPrix: 3_500 });
    const horaire = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    });
    expect(prix.simulation.gainMensuel).toBeLessThan(0);
    expect(horaire.simulation.gainMensuel).toBeGreaterThan(0);

    const b = await demander(m, "Et si je baisse à 3 500 moi aussi ?", contexte);
    expect(b.intention).toBe("et_si_prix");
    expect(b.points).toEqual([]);
    expect(b.resume).toContain(
      `Le 10:00 de Douala → Bafoussam : à 3 500 F, il te faut ${prix.simulation.passagersPourEquilibrer} passagers de plus par départ pour gagner la même chose.`,
    );
    expect(b.resume).toContain(
      "Sur 30 jours, tu n'y es arrivé en moyenne aucun jour de la semaine.",
    );
    expect(b.resume).toContain(
      `Au prix de 3 500 F, la simulation donne − ${fmt(Math.abs(prix.simulation.gainMensuel))} F par mois.`,
    );
    expect(b.resume).toContain(
      `Je ne changerais pas le prix : je déplacerais le 10:00 à 09:15, la simulation donne + ${fmt(horaire.simulation.gainMensuel)} F par mois.`,
    );
    expect(b.resume).toContain(
      "C'est une hypothèse, pas une mesure : 0,8 % de voyageurs en plus pour 1 % de baisse de prix.",
    );
    expect(b.simulation).toEqual([
      { libelle: "09:15", gainMensuel: horaire.simulation.gainMensuel },
      { libelle: "3 500 F", gainMensuel: prix.simulation.gainMensuel },
    ]);
    expect(b.actions.map((a) => a.type)).toEqual(["decaler_depart", "voir_ligne"]);
    expect(b.contexte).toEqual({ ligneId: DLA_BAF.id, departId });
  });

  it("quand le départ n'a atteint l'objectif que certains jours, il les nomme du lundi au dimanche", async () => {
    const m = monterAssistant();
    m.referentiel.ajouterLigne(COMPAGNIE, DLA_BAF);
    m.departs.ajouter(
      COMPAGNIE,
      ...genererDynamique(DLA_BAF.id, DU, AU, [
        { heure: "10:00", remplissage: (j) => ([5, 6].includes(jourSemaine(j)) ? 95 : 40) },
      ]),
    );
    const b = await demander(m, "Et si je baisse le 10:00 de Douala → Bafoussam à 3 500 ?");
    expect(b.resume).toContain(
      "Sur 30 jours, tu n'y es arrivé en moyenne que les vendredis et samedis.",
    );
  });

  it("monter le prix : le gain par billet, mais moins de voyageurs", async () => {
    const m = planche();
    const contexte = await apresPourquoi(m);
    const b = await demander(m, "Et si je monte à 4 500 ?", contexte);
    expect(b.resume).toMatch(
      /^Le 10:00 de Douala → Bafoussam : à 4 500 F, chaque billet rapporte 500 F de plus, mais la simulation prévoit \d+ voyageurs? par départ au lieu de \d+\./,
    );
    expect(b.resume).toContain("Au prix de 4 500 F, la simulation donne");
  });

  it("sans question avant, il demande de quel départ on parle", async () => {
    const m = planche();
    const b = await demander(m, "Et si je baisse à 3 500 ?");
    expect(b.resume).toMatch(
      /^De quel départ parles-tu \? Donne la ligne et l'heure, par exemple « Et si je baisse le 10:00 de Douala → Bafoussam à 3 500 F \? »\.$/,
    );
    expect(b.figee).toBe(true);
  });

  it("une heure sans ligne ni contexte : il demande la ligne ; une heure sans départ : il le dit", async () => {
    const m = planche();
    expect((await demander(m, "Et si je baisse le 10:00 à 3 500 ?")).resume).toMatch(
      /^Sur quelle ligne \?/,
    );
    const b = await demander(m, "Et si je baisse le 22:00 de Douala → Bafoussam à 3 500 ?");
    expect(b.resume).toBe(
      "Je ne trouve pas de départ à 22:00 sur Douala → Bafoussam dans les 30 derniers jours.",
    );
  });

  it("le prix actuel n'est pas une simulation : le message de l'API est repris tel quel", async () => {
    const m = planche();
    const b = await demander(m, "Et si je baisse le 10:00 de Douala → Bafoussam à 4 000 ?");
    expect(b.resume).toBe("Le départ est déjà à ce prix");
    expect(b.figee).toBe(true);
  });
});

describe("« Où part mon argent ? »", () => {
  it("reprend les constats d'analyses : fuites chiffrées, pistes de gain, actions et sources", async () => {
    const m = planche();
    m.caisse.ajouterEcart(
      COMPAGNIE,
      ecart({ jour: "2026-12-29" }),
      ecart({ jour: "2027-01-02" }),
      ecart({ jour: "2027-01-04" }),
    );
    const b = await demander(m, "Où part mon argent ?");
    expect(b.intention).toBe("ou_part_argent");
    expect(b.resume).toBe(
      "1 fuite repérée sur tes 10 derniers jours, − 4 500 F au total chiffré. 1 piste pour gagner de l'argent.",
    );
    expect(b.points).toHaveLength(2);
    expect(b.points[0]).toContain("3 écarts négatifs");
    expect(b.points[1]).toContain("Décale-le à 09:15");
    expect(b.actions.map((a) => a.type)).toEqual(["controle_inopine", "decaler_depart"]);
    expect(b.sources.length).toBeGreaterThan(1);
  });

  it("rien à signaler : il le dit, et dit quand la caisse n'a pas pu être lue", async () => {
    const m = monterAssistant();
    m.referentiel.ajouterLigne(COMPAGNIE, DLA_BAF);
    m.departs.ajouter(
      COMPAGNIE,
      ...genererDynamique(DLA_BAF.id, DU, AU, [{ heure: "08:00", remplissage: () => 70 }]),
    );
    const sain = await demander(m, "Où part mon argent ?");
    expect(sain.resume).toBe(
      "Je ne vois pas de fuite sur tes 10 derniers jours, ni d'argent à gagner dans tes 30 derniers jours.",
    );
    m.caisse.enPanne = true;
    const aveugle = await demander(m, "Où part mon argent ?");
    expect(aveugle.resume).toContain(
      "La caisse est indisponible : je n'ai pas pu regarder les écarts.",
    );
  });
});

describe("questions ambiguës ou inconnues", () => {
  it("deux lignes possibles : il les nomme et demande laquelle", async () => {
    const m = planche();
    const b = await demander(m, "Pourquoi Douala baisse ?");
    expect(b.intention).toBe("ambigue");
    expect(b.resume).toContain("Plusieurs lignes correspondent : ");
    expect(b.resume).toContain("Douala → Bafoussam");
    expect(b.resume).toContain("Douala → Yaoundé");
    expect(b.sources).toEqual([]);
  });

  it("une question inconnue propose les questions qu'il sait traiter", async () => {
    const m = planche();
    const b = await demander(m, "Raconte-moi une blague");
    expect(b.intention).toBe("inconnue");
    expect(b.resume).toBe(
      "Je ne sais pas répondre à cette question avec tes chiffres. Tu peux demander par exemple : « Pourquoi Bafoussam baisse ? », « Quel bus coûte le plus ? », « Prévision de mardi ».",
    );
    expect(b.figee).toBe(true);
    expect(b.actions).toEqual([]);
  });
});

describe("questions suggérées", () => {
  it("viennent des chiffres, et l'assistant sait toutes y répondre", async () => {
    const m = planche();
    const ctx = await m.service.contexte(COMPAGNIE);
    const questions = questionsSuggerees(ctx);
    expect(questions).toEqual([
      "Pourquoi Bafoussam baisse ?",
      "Quel bus coûte le plus ?",
      "Prévision de mardi",
    ]);
    for (const q of questions) {
      expect(interpreter(q, ctx.lignes, ctx.aujourdhui).intention).not.toBe("inconnue");
    }
  });

  it("sans donnée, aucune question n'est suggérée", async () => {
    const m = monterAssistant();
    expect(questionsSuggerees(await m.service.contexte(COMPAGNIE))).toEqual([]);
  });

  it("deux lignes vers la même ville : la question porte le nom complet", async () => {
    const m = monterAssistant();
    const autre = {
      ...DLA_YDE,
      id: "ligne-yde-baf",
      nom: "Yaoundé → Bafoussam",
      code: "YDEBAF",
      origine: "Yaoundé",
      destination: "Bafoussam",
    };
    m.referentiel.ajouterLigne(COMPAGNIE, DLA_BAF).ajouterLigne(COMPAGNIE, autre);
    m.departs.ajouter(
      COMPAGNIE,
      ...genererDynamique(DLA_BAF.id, DU, AU, [
        { heure: "08:00", remplissage: (j) => (j >= DEBUT_RECENT ? 40 : 80) },
      ]),
    );
    const ctx = await m.service.contexte(COMPAGNIE);
    const [q] = questionsSuggerees(ctx);
    expect(q).toBe("Pourquoi Douala → Bafoussam baisse ?");
    expect(interpreter(q!, ctx.lignes, ctx.aujourdhui)).toMatchObject({ ligneIds: [DLA_BAF.id] });
  });
});
