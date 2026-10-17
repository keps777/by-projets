import { patron as c } from "@afrimove/contrats";
import { heure } from "@afrimove/fixtures";
import { implementer } from "../../infra/scenarios";
import {
  OP_APERCU_EXPORT,
  OP_APPLIQUER_RAPPROCHEMENT,
  OP_CLOTURE,
  OP_CLOTURER,
  OP_COMPTABLE,
  OP_RAPPROCHEMENT,
} from "../operations";
import { conflit, creerJournal, introuvable, lireCommande } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, instantFrancais, montant, nombreAvant, pourcent, segments } from "./lecture";

/** Comptable : synthèse, aperçu d'un export, rapprochement MoMo, clôture (planches Comptable*). */

/** Le seul mois que les scénarios contiennent. */
export const MOIS_COMPTABLE = "2026-12";
const ID_EXPORTS: readonly c.IdExport[] = [
  "journal_ventes",
  "journal_caisse",
  "annulations",
  "ecritures_syscohada",
  "factures_afrimove",
];

function verifierMois(mois: string | undefined): void {
  if (mois && mois !== MOIS_COMPTABLE) {
    throw introuvable("Mois comptable", "MOIS_INDISPONIBLE", mois);
  }
}

interface EtatComptable {
  decisions: Map<string, c.ActionRapprochement>;
  clotureA: string | null;
  recuA: string | null;
}

function synthese(src: SourceFixtures, etat: EtatComptable): c.SyntheseComptable {
  const d = src.ecran("Comptable").donnees;
  const [libelle = "", cloture = ""] = segments(d.periode);
  const [destinataire = "", mensuel = "", envois = ""] = segments(d.cabinet.detail);
  return {
    mois: MOIS_COMPTABLE,
    libelle,
    jourDeCloture: Number(/le (\d+)/.exec(cloture)?.[1] ?? 5),
    moisDisponibles: d.mois.map((nom, i) => ({
      mois: i === 0 ? MOIS_COMPTABLE : `2026-${String(12 - i).padStart(2, "0")}`,
      libelle: nom,
    })),
    statut: etat.clotureA ? "cloture" : "ouvert",
    rapprochement: {
      tauxRapprochePct: pourcent(d.rapprochement.taux),
      ventesMomo: {
        nombre: d.rapprochement.ventes.nombre,
        montant: d.rapprochement.ventes.montant,
      },
      recuMarchand: d.rapprochement.recu.montant,
      sansCorrespondance: {
        transactions: nombreAvant(d.rapprochement.ecart.libelle, "transactions") ?? 0,
        montant: d.rapprochement.ecart.montant,
      },
    },
    exports: d.exports.liste.map((x, i) => ({
      id: ID_EXPORTS[i]!,
      nom: x.nom,
      description: x.detail,
      lignes: nombreAvant(x.detail, "lignes"),
      statut: x.telecharger === "à jour" ? "a_jour" : "disponible",
    })),
    cabinet: {
      destinataire,
      automatique: src.ecran("Comptable").visuel["envoiAutomatique"] === true,
      jourDEnvoi: Number(/le (\d+)/.exec(mensuel)?.[1] ?? 2),
      derniersEnvoisRecus: entier(/(\d+) derniers/.exec(envois)?.[1] ?? "0"),
    },
  };
}

function apercu(src: SourceFixtures, exportId: c.IdExport): c.ApercuExport {
  if (exportId !== "journal_ventes") {
    throw introuvable("Aperçu de l'export", "APERCU_INDISPONIBLE", exportId);
  }
  const e = src.ecran("ComptableApercu");
  const d = e.donnees;
  const taille = /([\d,]+)\s*Mo/.exec(d.export.detail);
  return {
    export: {
      id: exportId,
      format: d.export.format === "XLSX" ? "XLSX" : "CSV",
      nom: d.export.nom,
      lignes: nombreAvant(d.export.detail, "lignes") ?? 0,
      colonnes: nombreAvant(d.export.detail, "colonnes") ?? d.tableau.colonnes.length,
      tailleOctets: taille ? montant(`${taille[1]} M`) : 0,
      genereA: e.maintenant,
    },
    onglets: d.export.onglets.map((libelle) => ({
      id: libelle
        .split("·")[0]!
        .trim()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, "_"),
      libelle,
    })),
    tableau: {
      colonnes: [...d.tableau.colonnes],
      lignes: d.tableau.lignes.map((l) => [
        `2026-${l.date.split("/")[1]}-${l.date.split("/")[0]}`,
        l.heure,
        l.ligne,
        l.depart,
        l.siege === "—" ? null : l.siege,
        l.classe,
        l.prix,
        l.mode,
        l.guichet,
      ]),
      premiere: 1,
      derniere: d.tableau.lignes.length,
      total: nombreAvant(d.export.detail, "lignes") ?? 0,
      totalMontant: entier(d.tableau.total),
    },
    signe: d.garanties.some((g) => g.titre === "Signé"),
  };
}

const CAUSES: ReadonlyArray<readonly [RegExp, c.TransactionSansCorrespondance["cause"]]> = [
  [/payé 2 fois/, "doublon_paiement"],
  [/expiration/, "paiement_apres_expiration"],
  [/scan de dépôt manquant/, "scan_depot_manquant"],
];

function lignesRapprochement(
  src: SourceFixtures,
  etat: EtatComptable,
): c.TransactionSansCorrespondance[] {
  return src.ecran("ComptableRapprochement").donnees.lignes.map((l) => {
    const [date = "", telephone = "", operateur = ""] = segments(l.quand);
    const action = l.action.toLowerCase() as c.ActionRapprochement;
    return {
      reference: l.reference,
      recueA: instantFrancais(date),
      telephoneMasque: telephone,
      operateur: operateur.toLowerCase().startsWith("orange") ? "orange" : "mtn",
      montant: l.montant,
      cause: CAUSES.find(([re]) => re.test(l.cause))?.[1] ?? "inconnue",
      explication: l.cause,
      actionProposee: action,
      cibleSuggeree: /(C-[A-Z]{3}-[A-Z]{3}-\d{6}-\d{4})/.exec(l.cause)?.[1] ?? null,
      decision: etat.decisions.get(l.reference) ?? null,
    };
  });
}

function rapprochement(src: SourceFixtures, etat: EtatComptable): c.RapprochementMomo {
  const d = src.ecran("ComptableRapprochement").donnees;
  const lignes = lignesRapprochement(src, etat);
  return {
    mois: MOIS_COMPTABLE,
    libelle: segments(src.ecran("Comptable").donnees.periode)[0] ?? "",
    transactions: lignes.length,
    surTotalVentes: entier(/sur ([\d  ]+)/.exec(d.detail)![1]!),
    montantTotal: d.total.montant,
    partPct: pourcent(d.part),
    lignes,
  };
}

const FORMAT_FICHIER: Readonly<Record<string, "xlsx" | "csv" | "pdf">> = {
  xlsx: "xlsx",
  csv: "csv",
  pdf: "pdf",
};

function cloture(src: SourceFixtures, etat: EtatComptable): c.ClotureMois {
  const d = src.ecran("ComptableCloture").donnees;
  const clos = etat.clotureA !== null;
  const libelleMois = segments(src.ecran("Comptable").donnees.periode)[0] ?? "";
  return {
    mois: MOIS_COMPTABLE,
    libelle: libelleMois,
    statut: clos ? "cloture" : "ouvert",
    clotureA: etat.clotureA,
    encaisse: {
      total: d.encaisse.montant,
      cash: d.encaisse.cash.montant,
      momo: d.encaisse.momo.montant,
      ecart: d.encaisse.ecart.montant,
    },
    verrouille: clos,
    envoi: {
      destinataire: d.envoi.titre.replace(/^Envoyé à\s*/, ""),
      recuA: etat.recuA,
      fichiers: d.envoi.fichiers.map((f, i) => {
        const [format = "", taille = ""] = segments(f.format.replace(/\s*\.\s*$/, ""));
        const octets = /([\d,]+)\s*(Mo|ko)/.exec(taille);
        return {
          id: ID_EXPORTS[i]!,
          nom: f.nom,
          description: f.detail,
          format: FORMAT_FICHIER[format.split(" ")[0]!] ?? "csv",
          tailleOctets: octets ? montant(`${octets[1]} ${octets[2] === "Mo" ? "M" : "k"}`) : null,
          pages: /(\d+)\s*p\./.exec(f.format)?.[1]
            ? Number(/(\d+)\s*p\./.exec(f.format)![1])
            : null,
        };
      }),
    },
    apercuJournal: [...d.apercu.lignes],
  };
}

export function mockComptable(src: SourceFixtures): ContributionMock {
  const journal = creerJournal();
  const dejaClos = src.scenario === "ComptableCloture";
  const etat: EtatComptable = {
    decisions: new Map(),
    clotureA: dejaClos ? heure("09:12") : null,
    recuA: dejaClos ? heure("09:13") : null,
  };
  if (dejaClos) {
    // « Les 4 transactions sans correspondance sont traitées. »
    for (const l of lignesRapprochement(src, etat))
      etat.decisions.set(l.reference, l.actionProposee);
  }

  return {
    operations: [
      implementer(OP_COMPTABLE, ({ mois }) => {
        verifierMois(mois);
        return synthese(src, etat);
      }),
      implementer(OP_APERCU_EXPORT, ({ exportId, mois }) => {
        verifierMois(mois);
        return apercu(src, exportId);
      }),
      implementer(OP_RAPPROCHEMENT, ({ mois }) => {
        verifierMois(mois);
        return rapprochement(src, etat);
      }),
      implementer(OP_APPLIQUER_RAPPROCHEMENT, (params): c.RapprochementApplique => {
        const cmd = lireCommande(c.AppliquerRapprochementSchema, params);
        verifierMois(cmd.mois);
        if (etat.clotureA) throw conflit("Le mois est clôturé", "MOIS_DEJA_CLOTURE");
        const connues = new Set(lignesRapprochement(src, etat).map((l) => l.reference));
        for (const dec of cmd.decisions) {
          if (!connues.has(dec.reference)) {
            throw introuvable("Transaction", "TRANSACTION_INCONNUE", dec.reference);
          }
        }
        for (const dec of cmd.decisions) etat.decisions.set(dec.reference, dec.action);
        const compte = (a: c.ActionRapprochement): number =>
          [...etat.decisions.values()].filter((x) => x === a).length;
        return {
          ...journal(cmd.signature.signeA),
          mois: cmd.mois,
          remboursements: compte("rembourser"),
          rattachements: compte("rattacher"),
          reclamations: compte("demander"),
          lignesOuvertes: connues.size - etat.decisions.size,
        };
      }),
      implementer(OP_CLOTURE, ({ mois }) => {
        verifierMois(mois);
        return cloture(src, etat);
      }),
      implementer(OP_CLOTURER, (params, ctx): c.MoisCloture => {
        const cmd = lireCommande(c.CloturerMoisSchema, params);
        verifierMois(cmd.mois);
        if (etat.clotureA) throw conflit("Le mois est déjà clôturé", "MOIS_DEJA_CLOTURE");
        if (etat.decisions.size < lignesRapprochement(src, etat).length) {
          throw conflit(
            "Rien n'est clôturé tant qu'une ligne du rapprochement reste ouverte",
            "RAPPROCHEMENT_OUVERT",
          );
        }
        etat.clotureA = ctx.horloge.iso();
        etat.recuA = cmd.envoyerAuCabinet ? ctx.horloge.iso() : null;
        return { ...journal(cmd.signature.signeA), cloture: cloture(src, etat) };
      }),
    ],
    flux: [],
  };
}
