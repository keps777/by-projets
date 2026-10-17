import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Role } from "../socle/auth/roles";
import { ColisService, SYSTEME } from "./colis.service";
import { ErreurColis } from "./erreurs";
import type { Acteur, ColisStocke, Indemnisation, ReclamationStockee } from "./modele";
import { AssureurPartenaire, ReclamationsRepository } from "./ports";
import {
  DELAI_REPONSE_RECLAMATION_JOURS_OUVRES,
  peutAppliquer,
  plafondIndemnisation,
} from "./regles";
import { aammjjDouala, ajouterJoursOuvres } from "./temps";
import type { DecisionReclamation } from "./validation";

/** Une base32 sans caractères ambigus : « R-270105-K7Q2MX ». */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

function referenceAleatoire(jour: string): string {
  const octets = randomBytes(6);
  return `R-${jour}-${[...octets].map((o) => ALPHABET[o % ALPHABET.length]).join("")}`;
}

/** Réclamations des expéditeurs et indemnisation (assureur partenaire, ou 10 × le port). */
@Injectable()
export class ReclamationsService {
  constructor(
    private readonly colis: ColisService,
    private readonly repo: ReclamationsRepository,
    private readonly assureur: AssureurPartenaire,
  ) {}

  /** Réclamation en une touche : réponse sous 2 jours ouvrés. Une réclamation ouverte n'est pas doublée. */
  async ouvrir(
    utilisateurId: string,
    colisId: string,
    demande: { motif: "perdu" | "abime" | "retard" | "autre"; message: string | undefined },
  ) {
    const { colis } = await this.colis.colisDuVoyageur(utilisateurId, colisId);
    const existantes = await this.repo.parColis(colis.id);
    const doublon = existantes.find((r) => r.statut === "ouverte" && r.motif === demande.motif);
    if (doublon) return this.versOuverte(doublon);

    const ouverteA = this.colis.maintenant();
    const reclamation: ReclamationStockee = {
      reference: referenceAleatoire(aammjjDouala(ouverteA)),
      colisId: colis.id,
      colisNumero: colis.numero,
      compagnieId: colis.compagnieId,
      auteurId: utilisateurId,
      motif: demande.motif,
      message: demande.message ?? null,
      ouverteA,
      reponseAvant: ajouterJoursOuvres(ouverteA, DELAI_REPONSE_RECLAMATION_JOURS_OUVRES),
      statut: "ouverte",
      decision: null,
    };
    while (!(await this.repo.ajouter(reclamation))) {
      reclamation.reference = referenceAleatoire(aammjjDouala(ouverteA));
    }
    // Un colis perdu ou abîmé passe en litige : la responsabilité se joue, les scans restent possibles.
    // Un colis déjà déclaré perdu le reste : c'est la preuve de la perte qui ouvre l'indemnisation.
    if (
      (demande.motif === "perdu" || demande.motif === "abime") &&
      colis.etat !== "perdu" &&
      peutAppliquer(colis.etat, "ouvrir_litige")
    ) {
      await this.colis.executer({
        acteur: { id: SYSTEME, role: "afrimove", compagnieId: null, gareId: null },
        colis: { id: colis.id },
        action: "ouvrir_litige",
        motif: `réclamation ${reclamation.reference}`,
      });
    }
    await this.colis.audit.enregistrer({
      acteur: { id: utilisateurId, role: "voyageur", compagnieId: null },
      action: "reclamation.ouverte",
      resultat: "succes",
      cible: { type: "colis", id: colis.id },
      details: { reclamation: reclamation.reference, motif: demande.motif },
    });
    return this.versOuverte(reclamation);
  }

  private versOuverte(r: ReclamationStockee) {
    return {
      reference: r.reference,
      colisId: r.colisId,
      motif: r.motif,
      ouverteLe: r.ouverteA,
      reponseAvant: r.reponseAvant,
    };
  }

  /** Les réclamations de la compagnie (patron, superviseur) ou toutes (AfriMove). */
  async lister(acteur: Acteur, statut?: ReclamationStockee["statut"]) {
    const compagnieId = acteur.role === "afrimove" ? undefined : acteur.compagnieId;
    const lignes = await this.repo.lister({
      ...(compagnieId !== undefined ? { compagnieId } : {}),
      ...(statut !== undefined ? { statut } : {}),
    });
    return lignes.map((r) => this.vueGestion(r));
  }

  private vueGestion(r: ReclamationStockee) {
    return {
      reference: r.reference,
      colisId: r.colisId,
      colis: r.colisNumero,
      motif: r.motif,
      message: r.message,
      ouverteLe: r.ouverteA,
      reponseAvant: r.reponseAvant,
      statut: r.statut,
      decision: r.decision
        ? { le: r.decision.a, indemnisation: r.decision.indemnisation, motif: r.decision.motif }
        : null,
    };
  }

  /**
   * Décide d'une réclamation.
   *
   * - Perte prouvée par le suivi (colis déclaré perdu par un scan) : indemnisation pleine, soit la
   *   valeur assurée (déclarée à l'assureur partenaire), soit 10 × le port.
   * - Autre cas : un geste commercial dont le montant est donné par la personne qui décide, jamais
   *   au-delà de ce plafond.
   */
  async decider(acteur: Acteur, reference: string, decision: DecisionReclamation) {
    const rec = await this.repo.trouver(reference);
    if (
      !rec ||
      (acteur.role !== "afrimove" &&
        (rec.compagnieId === null || rec.compagnieId !== acteur.compagnieId))
    ) {
      throw new ErreurColis(404, "reclamation_introuvable", "Réclamation introuvable");
    }
    if (rec.statut !== "ouverte") {
      throw new ErreurColis(409, "reclamation_close", "Cette réclamation a déjà reçu une réponse");
    }
    const a = this.colis.maintenant();
    let indemnisation: Indemnisation | null = null;
    let declarer: ColisStocke | null = null;

    if (decision.decision === "acceptee") {
      const colis = await this.colis.repo.trouver(rec.colisId);
      if (!colis) throw new ErreurColis(404, "colis_introuvable", "Colis introuvable");
      const plafond = plafondIndemnisation(colis);
      const perteProuvee = rec.motif === "perdu" && colis.etat === "perdu";
      if (!perteProuvee && decision.montant === undefined) {
        throw new ErreurColis(
          422,
          "perte_non_prouvee",
          "La perte n'est pas prouvée par le suivi : déclarez le colis perdu ou indiquez un montant",
        );
      }
      const montant = Math.min(decision.montant ?? plafond.montant, plafond.montant);
      indemnisation = {
        type: perteProuvee ? plafond.type : "geste_commercial",
        montant,
        dossierAssureur: null,
      };
      // L'assureur n'est saisi que pour un sinistre (perte prouvée ou colis abîmé), pas pour un geste commercial.
      const sinistre = perteProuvee || rec.motif === "abime";
      declarer =
        sinistre && colis.assure && colis.assurance.police !== null && montant > 0 ? colis : null;
    }

    const decidee: ReclamationStockee = {
      ...rec,
      statut: decision.decision,
      decision: { a, par: acteur.id, indemnisation, motif: decision.motif ?? null },
    };
    // La décision est posée d'abord, d'un seul coup : deux décisions simultanées ne déclarent pas
    // deux fois le sinistre à l'assureur.
    if (!(await this.repo.remplacer(decidee, "ouverte"))) {
      throw new ErreurColis(409, "reclamation_close", "Cette réclamation a déjà reçu une réponse");
    }
    if (declarer && indemnisation) {
      try {
        const { dossier } = await this.assureur.declarerSinistre({
          police: declarer.assurance.police!,
          numeroColis: declarer.numero,
          montant: indemnisation.montant,
          motif: rec.motif,
        });
        indemnisation.dossierAssureur = dossier;
        await this.repo.remplacer(decidee, decision.decision);
      } catch {
        await this.repo.remplacer(rec, decision.decision);
        throw new ErreurColis(502, "assureur_indisponible", "L'assureur partenaire ne répond pas");
      }
    }
    await this.colis.audit.enregistrer({
      acteur: { id: acteur.id, role: acteur.role as Role, compagnieId: acteur.compagnieId },
      action: "reclamation.decidee",
      resultat: "succes",
      cible: { type: "colis", id: rec.colisId },
      details: {
        reclamation: rec.reference,
        decision: decision.decision,
        montant: indemnisation?.montant ?? 0,
      },
    });
    return this.vueGestion(decidee);
  }
}
