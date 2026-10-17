import type { patron as c } from "@afrimove/contrats";
import { ALPHA_DLA_BAF, ALPHA_DLA_YDE, ALPHA_YDE_BAF, BUS, BUS_LT207 } from "@afrimove/fixtures";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer } from "../../infra/scenarios";
import { OP_ANALYSES, OP_ANALYSE_BUS, OP_ANALYSE_LIGNE } from "../operations";
import { introuvable } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, minutes, montant, nombreAvant, pourcent, repartir, segments } from "./lecture";

/** Analyses : semaine, une ligne, un bus (planches Analyses, AnalysesLigne, AnalysesBus). */

const LIGNES_CONNUES: Readonly<Record<string, string>> = {
  "Douala → Yaoundé": ALPHA_DLA_YDE.id,
  "Douala → Bafoussam": ALPHA_DLA_BAF.id,
  "Yaoundé → Bafoussam": ALPHA_YDE_BAF.id,
};

/** Les lignes que le monde commun ne modélise pas reçoivent un identifiant stable dérivé du nom. */
function ligneIdDepuis(nom: string): string {
  return (
    LIGNES_CONNUES[nom] ??
    `ligne-alp-${nom
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, "-")}`
  );
}

function periodeIndisponible(periode: c.PeriodeAnalyse): ErreurHttp {
  return new ErreurHttp(
    404,
    `Ce scénario ne contient que la semaine (période « ${periode} » demandée)`,
    "PERIODE_INDISPONIBLE",
  );
}

/* ----------------------------------------------------------------------- semaine */

function analyses(src: SourceFixtures): c.Analyses {
  const e = src.ecran("Analyses");
  const d = e.donnees;
  const total = montant(d.recetteParJour.total);
  const hauteurs = e.visuel["recetteParJour"] as { hauteursPx: readonly number[] };
  const parts = repartir(total, hauteurs.hauteursPx);
  const [libelle = "", gares = ""] = segments(d.periode);
  const colis = d.lignes.liste.find((l) => "colis" in l);
  return {
    periode: "semaine",
    libelle,
    nbGares: entier(gares),
    recette: {
      total,
      variationPct: pourcent(d.recetteParJour.variation),
      serie: d.recetteParJour.jours.map((jour, i) => ({ libelle: jour, recette: parts[i]! })),
      lecture: d.recetteParJour.lecture,
    },
    lignes: d.lignes.liste.flatMap((l) =>
      "colis" in l
        ? []
        : [
            {
              ligneId: ligneIdDepuis(l.ligne),
              nom: l.ligne,
              remplissagePct: l.remplissage!,
              recette: montant(l.recette),
            },
          ],
    ),
    colis: {
      nombre: colis && "colis" in colis ? (colis.colis as number) : 0,
      recette: colis ? montant(colis.recette) : 0,
    },
    bus: d.bus.liste.map((b) => ({
      busId: BUS.find((x) => x.immatriculation === b.bus)!.id,
      immatriculation: b.bus,
      chauffeur: b.chauffeur.replace(/^·\s*/, ""),
      trajets: b.trajets,
      net: montant(b.net),
      incident: b.incident,
    })),
  };
}

/* ----------------------------------------------------------------------- une ligne */

function analyseLigne(src: SourceFixtures): c.AnalyseLigne {
  const e = src.ecran("AnalysesLigne");
  const d = e.donnees;
  const chiffre = (libelle: string) => d.chiffres.find((x) => x.libelle === libelle)!;
  const recette = chiffre("Recette");
  const total = montant(recette.valeur);
  const px = e.visuel["parJourPx"] as readonly number[];
  const parts = repartir(total, px);
  const enLigne = d.canaux[0]!;
  const enRoute = d.canaux[1]!;
  const [libelle = ""] = segments(d.periode);
  return {
    ligne: { id: ALPHA_DLA_BAF.id, nom: d.titre },
    periode: "semaine",
    libelle,
    departsParJour: nombreAvant(d.periode, "départs") ?? 0,
    recette: { total, variationPct: pourcent(recette.detail) },
    billets: {
      nombre: entier(chiffre("Billets").valeur),
      departs: entier(chiffre("Billets").detail),
    },
    remplissage: {
      pct: pourcent(chiffre("Rempl.").valeur),
      cible: entier(chiffre("Rempl.").detail),
    },
    colis: {
      nombre: entier(chiffre("Colis").valeur),
      variationPct: pourcent(chiffre("Colis").detail),
    },
    departs: d.departs.liste.map((dep) => {
      const infos = segments(dep.detail);
      const classe = infos.some((s) => s.toLowerCase() === "vip") ? "vip" : "classique";
      const prix = infos.find((s) => /^[\d  ]+$/.test(s));
      const bus = infos.find((s) => /^LT \d+ AB$/.test(s)) ?? null;
      const note =
        infos.find((s) => !/^(classique|vip)$/i.test(s) && s !== prix && s !== bus) ?? null;
      const concurrent =
        "concurrent" in dep
          ? /^(\S+) (\d{2}:\d{2}) à ([\d  ]+)$/.exec(dep.concurrent as string)
          : null;
      return {
        departId: dep._departId,
        heure: dep.heure,
        classe,
        prix: prix ? entier(prix) : 0,
        bus,
        note,
        remplissagePct: dep.remplissage,
        concurrent: concurrent
          ? { compagnie: concurrent[1]!, heure: concurrent[2]!, prix: entier(concurrent[3]!) }
          : null,
      };
    }),
    parJour: {
      serie: d.parJour.jours.map((jour, i) => ({ libelle: jour, recette: parts[i]! })),
      lecture: d.parJour.lecture,
    },
    canaux: {
      enLigne: {
        partPct: pourcent(enLigne.valeur),
        billets: nombreAvant(enLigne.detail, "billets") ?? 0,
        variationPts: Number(/\+\s*(\d+)\s*pts/.exec(enLigne.detail)?.[1] ?? 0),
      },
      enRoute: {
        billets: entier(enRoute.valeur),
        arrets:
          /\(([^)]+)\)/
            .exec(enRoute.libelle)?.[1]
            ?.split(",")
            .map((s) => s.trim()) ?? [],
        tousEnregistres: /tous enregistrés/.test(enRoute.detail),
      },
    },
  };
}

/* ----------------------------------------------------------------------- un bus */

const JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;

function analyseBus(src: SourceFixtures): c.AnalyseBus {
  const e = src.ecran("AnalysesBus");
  const d = e.donnees;
  const chiffre = (libelle: string) => d.chiffres.find((x) => x.libelle === libelle)!;
  const [, nomChauffeur = ""] = segments(d.titre);
  const [modele = "", ...suite] = segments(d.detail);
  const capacite = nombreAvant(modele, "places") ?? BUS_LT207.capacite;
  const recette = chiffre("Recette");
  const depenses = chiffre("Dépenses");
  const net = chiffre("Net");
  const px = e.visuel["netParSemainePx"] as readonly number[];
  const netSemaineCourante = montant(net.valeur);
  const unite = netSemaineCourante / px[px.length - 1]!;

  return {
    bus: {
      id: BUS_LT207.id,
      immatriculation: BUS_LT207.immatriculation,
      modele: modele.split(" ")[0] ?? "",
      capacite,
      annee: Number(/\b(20\d{2})\b/.exec(suite.join(" "))?.[1] ?? 0),
    },
    chauffeur: { id: d._chauffeurId, nom: nomChauffeur },
    statut: /SURVEILLER/.test(d.badge) ? "a_surveiller" : "ok",
    trajetsSemaine: nombreAvant(d.detail, "trajets") ?? 0,
    recette: {
      total: montant(recette.valeur),
      trajets: entier(recette.detail),
      remplissagePct: pourcent(segments(recette.detail)[1]!),
    },
    depenses: {
      total: montant(depenses.valeur),
      carburant: montant(`${/carburant\s*([\d,]+)/.exec(depenses.detail)![1]} M`),
      pannes: montant(`${/pannes\s*([\d,]+)/.exec(depenses.detail)![1]} M`),
    },
    net: netSemaineCourante,
    netMoyenFlotte: montant(/([+−-]\s*[\d,]+\s*M)/.exec(net.detail)![1]!),
    netParSemaine: {
      serie: d.netParSemaine.semaines.map((libelle, i) => ({
        libelle,
        net: Math.round(px[i]! * unite),
      })),
      variationPct: pourcent(d.netParSemaine.tendance),
      depuis: /depuis la (.+)$/.exec(d.netParSemaine.tendance)?.[1] ?? null,
    },
    trajets: d.trajets.liste.map((t) => {
      const [quand = "", trajet = ""] = segments(t.quand);
      const [jour = "", h = "00:00"] = quand.split(" ");
      const [origine = "", destination = ""] = trajet.split("→").map((s) => s.trim());
      const infos = segments(t.detail);
      let passagers: c.AnalyseBus["trajets"][number]["passagers"] = null;
      let recetteTrajet: number | null = null;
      let retard: number | null = null;
      let incident = null as c.AnalyseBus["trajets"][number]["incident"];
      for (const info of infos) {
        const plein = /^(\d+)\s*\/\s*(\d+)$/.exec(info);
        const garde = /^(\d+)\s+(replacés|gardés)$/.exec(info);
        if (plein) passagers = { remplis: Number(plein[1]), capacite: Number(plein[2]) };
        else if (garde) passagers = { remplis: Number(garde[1]), capacite };
        else if (/^[\d  ]+$/.test(info)) recetteTrajet = entier(info);
        else if (/^retard/.test(info)) retard = minutes(info);
        else if (/à l.heure/.test(info)) retard = 0;
        else if (/^panne/.test(info)) {
          incident = { nature: "panne", description: info, dureeMinutes: null };
        } else if (incident && minutes(info) !== null) {
          incident = { ...incident, dureeMinutes: minutes(info) };
        }
      }
      return {
        jour: JOURS.find((j) => j === jour.toLowerCase().slice(0, 3))!,
        heure: h,
        origine,
        destination,
        passagers,
        recette: recetteTrajet,
        retardMinutes: retard,
        incident,
        net: montant(t.net),
      };
    }),
    avisAssistant: d.assistant.texte,
  };
}

export function mockAnalyses(src: SourceFixtures): ContributionMock {
  return {
    operations: [
      implementer(OP_ANALYSES, ({ periode }) => {
        if (periode !== "semaine") throw periodeIndisponible(periode);
        return analyses(src);
      }),
      implementer(OP_ANALYSE_LIGNE, ({ ligneId, periode }) => {
        if (periode && periode !== "semaine") throw periodeIndisponible(periode);
        if (ligneId !== ALPHA_DLA_BAF.id) throw introuvable("Ligne", "LIGNE_INCONNUE", ligneId);
        return analyseLigne(src);
      }),
      implementer(OP_ANALYSE_BUS, ({ busId }) => {
        if (busId !== BUS_LT207.id) throw introuvable("Bus", "BUS_INCONNU", busId);
        return analyseBus(src);
      }),
    ],
    flux: [],
  };
}
