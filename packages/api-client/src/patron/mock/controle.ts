import type { patron as c } from "@afrimove/contrats";
import { ALPHA, GARES, JOUR, heure } from "@afrimove/fixtures";
import { ajouterMinutes } from "@afrimove/domain";
import { implementer, simulerFlux } from "../../infra/scenarios";
import { CANAL_DIRECT_CONTROLE, OP_SALLE_DE_CONTROLE } from "../operations";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, montant, minutes, pourcent, repartir, segments } from "./lecture";
import { BILLET_SIMULE, PERIODE_DIRECT_MS } from "./aujourdhui";

/** Salle de contrôle (planche « Controle », 1280 px) : le direct des trois gares. */

/** Première heure de la série des ventes par heure (05 h). */
const PREMIERE_HEURE = 5;

const nombreApres = (texte: string, re: RegExp): number => Number(re.exec(texte)?.[1] ?? 0);

function chiffres(src: SourceFixtures): c.ChiffresControle {
  const d = src.ecran("Controle").donnees;
  const par = (libelle: string) => d.chiffres.find((x) => x.libelle === libelle)!;
  const recette = par("Recette du jour");
  const billets = par("Billets");
  const colis = par("Colis");
  const remplissage = par("Remplissage");
  const ecarts = par("Écarts de caisse");
  const caisses = /(\d+) caisse sur (\d+)/.exec(ecarts.detail);
  return {
    recette: montant(recette.valeur),
    variationPct: pourcent(recette.detail),
    billets: entier(billets.valeur),
    billetsEnLigne: nombreApres(billets.detail, /dont (\d+) en ligne/),
    billetsEnRoute: nombreApres(billets.detail, /(\d+) en route/),
    colis: entier(colis.valeur),
    colisEnCorrespondance: nombreApres(colis.detail, /(\d+) en correspondance/),
    litiges: nombreApres(colis.detail, /(\d+) litige/),
    remplissagePct: pourcent(remplissage.valeur),
    departs: nombreApres(remplissage.detail, /(\d+) départs/),
    departsFusionnes: nombreApres(remplissage.detail, /(\d+) fusionnés/),
    ecartsDeCaisse: {
      total: entier(ecarts.valeur),
      caissesEnEcart: Number(caisses?.[1] ?? 0),
      caisses: Number(caisses?.[2] ?? 0),
    },
  };
}

function lignesGares(src: SourceFixtures): c.GareControle[] {
  return src.ecran("Controle").donnees.gares.lignes.map((g) => {
    const gare = GARES.find((x) => x.compagnieId === ALPHA.id && x.nom === g.gare)!;
    const [qui = "", etat = ""] = segments(g.superviseur);
    const enLigne = etat === "en ligne";
    const plein = /(\d+)\/(\d+)/.exec(g.prochain.detail);
    return {
      gareId: gare.id,
      nom: g.gare,
      billets: g.billets,
      colis: g.colis,
      cashAttendu: g.cashAttendu,
      ecart: g.ecart,
      prochainDepart: {
        heure: g.prochain.heure,
        destination: segments(g.prochain.detail)[0] ?? "",
        remplis: Number(plein?.[1] ?? 0),
        capacite: Number(plein?.[2] ?? 1),
      },
      superviseur: {
        nom: qui,
        enLigne,
        horsLigneDepuisMinutes: enLigne ? null : minutes(etat),
      },
    };
  });
}

const TYPES_A_TRAITER: ReadonlyArray<readonly [RegExp, c.ATraiter["type"]]> = [
  [/^Clôture/, "cloture_en_attente"],
  [/arrêté/, "bus_arrete"],
  [/colis/, "correspondance"],
  [/assistant/i, "proposition_assistant"],
];

function aTraiter(src: SourceFixtures): c.ATraiter[] {
  return src.ecran("Controle").donnees.atraiter.liste.map((x, i) => ({
    id: `a-traiter-${i + 1}`,
    type: TYPES_A_TRAITER.find(([re]) => re.test(x.texte))?.[1] ?? "cloture_en_attente",
    texte: x.texte,
    quand: heure(x.quand),
  }));
}

function salle(src: SourceFixtures): c.SalleDeControle {
  const e = src.ecran("Controle");
  const d = e.donnees;
  const ch = chiffres(src);
  const [, compagnie = ""] = segments(d.titre);
  const [gares = "", bus = ""] = segments(d.sousTitre);
  const sync = /(\d+)\s*\/\s*(\d+)/.exec(d.statut);
  const alerte = segments(d.carte.alerte);
  const hauteurs = e.visuel["ventesParHeure"] as readonly number[];
  const heureMaintenant = Number(e.maintenant.slice(11, 13));
  const realisees = hauteurs.filter((_h, i) => PREMIERE_HEURE + i < heureMaintenant);
  const montants = repartir(ch.recette, realisees);
  const sommeRealisee = realisees.reduce((a, b) => a + b, 0);
  const rapport = d.rapport.texte;
  const destinataires = /à (M\.\s*\S+) et aux (\d+) superviseurs/.exec(rapport);

  return {
    compagnie,
    jour: JOUR,
    instant: e.maintenant,
    nbGares: entier(gares),
    nbBus: entier(bus),
    synchro: { garesSynchronisees: Number(sync?.[1] ?? 0), gares: Number(sync?.[2] ?? 0) },
    chiffres: ch,
    carte: {
      busEnRoute: entier(d.carte.titre),
      villes: [...d.carte.villes],
      alerte: {
        immatriculation: alerte[0] ?? "",
        arretMinutes: minutes(alerte[1] ?? "") ?? 0,
        soupcon: /panne/.test(alerte[2] ?? "") ? "panne" : "autre",
      },
    },
    gares: lignesGares(src),
    aTraiter: aTraiter(src),
    ventesParHeure: {
      heures: hauteurs.map((h, i) => ({
        heure: PREMIERE_HEURE + i,
        montant: i < realisees.length ? montants[i]! : Math.round((h * ch.recette) / sommeRealisee),
        prevu: i >= realisees.length,
      })),
      previsionCloture: montant(
        /Prévision de clôture : ([\d,]+ M)/.exec(d.ventesParHeure.lecture)![1]!,
      ),
      lecture: d.ventesParHeure.lecture,
    },
    rapport: {
      envoiA: heure(/à (\d{2}:\d{2})/.exec(rapport)![1]!),
      destinataires: {
        patron: destinataires?.[1] ?? "",
        superviseurs: Number(destinataires?.[2] ?? 0),
      },
      caissesAValider: nombreApres(rapport, /Il en reste (\d+)/),
    },
  };
}

export function mockControle(src: SourceFixtures): ContributionMock {
  const e = src.ecran("Controle");
  return {
    operations: [implementer(OP_SALLE_DE_CONTROLE, () => salle(src))],
    flux: [
      // Le direct repart des chiffres de la planche, puis une vente toutes les 30 s.
      simulerFlux(CANAL_DIRECT_CONTROLE, (_p, ctx) => {
        let valeurs = chiffres(src);
        let instant = e.maintenant;
        const emettre = (): void => {
          const message: c.MessageDirectControle = { type: "chiffres", instant, chiffres: valeurs };
          ctx.emettre(message);
        };
        const avancer = (): void => {
          instant = ajouterMinutes(instant, PERIODE_DIRECT_MS / 60_000);
          valeurs = {
            ...valeurs,
            billets: valeurs.billets + 1,
            recette: valeurs.recette + BILLET_SIMULE,
          };
          emettre();
          ctx.planifier(PERIODE_DIRECT_MS, avancer);
        };
        emettre();
        ctx.planifier(PERIODE_DIRECT_MS, avancer);
      }),
    ],
  };
}
