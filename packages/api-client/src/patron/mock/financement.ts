import { patron as c } from "@afrimove/contrats";
import { ajouterHeures } from "@afrimove/domain";
import { heure, jourDecale } from "@afrimove/fixtures";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer } from "../../infra/scenarios";
import {
  OP_DEMANDER_AVANCE,
  OP_DOSSIER_FINANCEMENT,
  OP_OFFRE_FINANCEMENT,
  OP_RETIRER_DEMANDE,
} from "../operations";
import { conflit, creerJournal, introuvable, lireCommande } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, montant, segments } from "./lecture";

/** Financement : offre, dossier d'avance, demande et retrait (planches Financement, FinancementDemande). */

const PLACEHOLDER = /^\[.*\]$/;
/** Le partenaire n'est pas nommé tant que la convention n'est pas signée : la maquette garde un crochet. */
const partenaire = (texte: string | undefined): string | null =>
  texte && !PLACEHOLDER.test(texte.trim()) ? texte.trim() : null;

function conditions(
  valeurs: ReadonlyArray<{ libelle: string; valeur: string }>,
): c.DossierFinancement["conditions"] {
  const v = (libelle: string): string => valeurs.find((x) => x.libelle === libelle)!.valeur;
  const cout = v("coût total");
  return {
    remboursementPctVentesMomo: entier(v("remboursé par")),
    dureeEstimeeSemaines: entier(v("durée estimée")),
    coutTotalPct: /^\[.*\]/.test(cout) ? null : entier(cout),
  };
}

function offre(src: SourceFixtures): c.OffreFinancement {
  const d = src.ecran("Financement").donnees;
  const [credit, paie] = d.autres;
  const mensualites = /(\d+)\s*×\s*([\d  ]+)/.exec(credit!.conditions)!;
  return {
    partenaire: partenaire(/Avec (\[.*\]|.+?) ·/.exec(d.sousTitre)?.[1]),
    conventionSignee: !/n'est pas signée/.test(d.action.reserve),
    avance: {
      statut: "eligible",
      plafond: montant(d.avance.plafond),
      equivalentJoursDeVentes: entier(d.avance.equivalence),
      montantPropose: montant(d.avance.montant.valeur),
      conditions: conditions(d.avance.conditions),
      versementSousHeures: Number(/en (\d+) h/.exec(d.avance.garantie)?.[1] ?? 24),
    },
    creditMateriel: {
      description: credit!.detail,
      montantTotal: montant(credit!.conditions),
      mensualites: Number(mensualites[1]),
      montantMensualite: entier(mensualites[2]!),
    },
    paie: {
      nbSalaires: entier(paie!.detail),
      jourDeVersement: /le (\w+)$/.exec(paie!.detail)?.[1] ?? "",
    },
    billetEnDeuxFois: {
      actif: src.ecran("Financement").visuel["paiementEnDeuxFois"] === true,
      exemple: {
        prixBillet: d.voyageurs.exemple.billetVip,
        reservation: d.voyageurs.exemple.reservation,
        veille: d.voyageurs.exemple.veille,
      },
    },
  };
}

function dossierInitial(src: SourceFixtures): c.DossierFinancement {
  const d = src.ecran("FinancementDemande").donnees;
  const etapes = d.suivi.etapes;
  return {
    id: /n° (AV-\d{4}-\d{4})/.exec(d.detail)![1]!,
    produit: "avance",
    statut: "en_analyse",
    partenaire: partenaire(segments(d.detail)[1]),
    montant: d.demande.montant,
    envoyeA: heure("10:04"),
    reponseAvant: heure("10:04", jourDecale(1)),
    conditions: conditions(
      d.demande.conditions.map((x) => ({ ...x, valeur: x.valeur.replace(/\s*·.*$/, "") })),
    ),
    pieces: d.pieces.liste.map((p) => ({
      nom: p.nom,
      detail: p.detail,
      format: p.format === "csv" ? "csv" : "pdf",
    })),
    suivi: [
      {
        code: "envoye",
        libelle: "etape" in etapes[0]! ? (etapes[0].etape as string) : "Envoyé",
        detail: etapes[0]!.detail.replace(/^·\s*/, ""),
        at: heure("10:04"),
        etat: "fait",
      },
      {
        code: "analyse",
        libelle: "etape" in etapes[1]! ? (etapes[1].etape as string) : "Analyse",
        detail: etapes[1]!.detail.replace(/^·\s*/, ""),
        at: null,
        etat: "en_cours",
      },
      {
        code: "versement",
        libelle: "Versement",
        detail: etapes[2]!.detail,
        at: null,
        etat: "a_venir",
      },
    ],
    retirable: true,
  };
}

export function mockFinancement(src: SourceFixtures): ContributionMock {
  const journal = creerJournal();
  const base = dossierInitial(src);
  const dossiers = new Map<string, c.DossierFinancement>([[base.id, base]]);
  let compteur = Number(base.id.slice(-4));

  return {
    operations: [
      implementer(OP_OFFRE_FINANCEMENT, () => offre(src)),
      implementer(OP_DOSSIER_FINANCEMENT, ({ dossierId }) => {
        const dossier = dossiers.get(dossierId);
        if (!dossier) throw introuvable("Dossier", "DOSSIER_INCONNU", dossierId);
        return dossier;
      }),
      implementer(OP_DEMANDER_AVANCE, (params, ctx): c.AvanceDemandee => {
        const cmd = lireCommande(c.DemanderAvanceSchema, params);
        const plafond = offre(src).avance.plafond;
        if (cmd.montant > plafond) {
          throw new ErreurHttp(
            422,
            `Le montant dépasse le plafond d'éligibilité (${plafond} F)`,
            "AU_DESSUS_DU_PLAFOND",
          );
        }
        const maintenant = ctx.horloge.iso();
        const dossier: c.DossierFinancement = {
          ...base,
          id: `AV-2027-${String(++compteur).padStart(4, "0")}`,
          statut: "envoye",
          montant: cmd.montant,
          envoyeA: maintenant,
          reponseAvant: ajouterHeures(maintenant, 24),
          suivi: base.suivi.map((e, i) => ({
            ...e,
            at: i === 0 ? maintenant : null,
            etat: i === 0 ? "fait" : i === 1 ? "en_cours" : "a_venir",
          })),
          retirable: true,
        };
        dossiers.set(dossier.id, dossier);
        return { ...journal(cmd.signature.signeA), dossier };
      }),
      implementer(OP_RETIRER_DEMANDE, (params): c.DemandeRetiree => {
        const cmd = lireCommande(c.RetirerDemandeSchema, params);
        const dossier = dossiers.get(cmd.dossierId);
        if (!dossier) throw introuvable("Dossier", "DOSSIER_INCONNU", cmd.dossierId);
        if (!dossier.retirable) {
          throw conflit("Le dossier n'est plus retirable", "DOSSIER_NON_RETIRABLE");
        }
        const retire: c.DossierFinancement = { ...dossier, statut: "retire", retirable: false };
        dossiers.set(retire.id, retire);
        return { ...journal(cmd.signature.signeA), dossier: retire };
      }),
    ],
    flux: [],
  };
}
