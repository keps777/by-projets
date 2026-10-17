import { HttpException, Injectable } from "@nestjs/common";
import { AuditService, type EntreeAudit } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { CATALOGUE_MODULES, moduleDuCatalogue, type ModuleCatalogue } from "./catalogue";
import {
  erreurApi,
  lireChangement,
  lireSignature,
  texteOptionnel,
  type ChangementModule,
} from "./commande";
import {
  cleVille,
  etatAgence,
  etatDans,
  etatHerite,
  memePortee,
  type ContexteModule,
  type Portee,
  type PorteeException,
  type ReglageModule,
} from "./portee";
import { AnnuaireAgences, DetailsModules, ReglagesModules, type GareAnnuaire } from "./ports";
import { VerificateurSignature } from "./signature";
import { versIsoDouala } from "./temps";

/* ------------------------------------------------------------------ formes des réponses (contrats patron) */

export type PorteeReponse =
  | { type: "agence" }
  | { type: "gare"; id: string }
  | { type: "ville"; nom: string };

/** `ModuleAgence` des contrats patron. */
export interface ModuleAgenceReponse {
  code: string;
  nom: string;
  actif: boolean;
  socle: boolean;
  detail: string;
  exceptions: { portee: PorteeReponse; actif: boolean }[];
}

/** `ModulesAgence` des contrats patron. */
export interface ModulesAgenceReponse {
  modules: ModuleAgenceReponse[];
  actifs: number;
  total: number;
}

/** `ModuleChange` des contrats patron. */
export interface ModuleChangeReponse {
  journalId: string;
  signeA: string;
  signePar: string;
  module: ModuleAgenceReponse;
}

/** Ce que les apps lisent pour afficher ou masquer leurs entrées. */
export interface ModulesActifsReponse {
  agenceId: string;
  gareId: string | null;
  ville: string | null;
  calculeA: string;
  modules: { code: string; actif: boolean }[];
}

export interface RequeteModulesActifs {
  agence?: unknown;
  gare?: unknown;
  ville?: unknown;
}

export const ACTION_CHANGER_MODULE = "module.changer";

/**
 * Moteur des modules : quels modules sont allumés, pour qui, et qui a changé quoi.
 *
 * Règles : douze modules fixes ; l'agence règle chaque module, avec des exceptions par gare ou par
 * ville (la gare prime sur la ville, la ville sur l'agence) ; « Guichet et caisse » est le socle et
 * ne s'éteint jamais ; masquer un module ne supprime aucune donnée (seule la visibilité change) ;
 * chaque changement, accepté ou refusé, entre au journal d'audit.
 */
@Injectable()
export class ModulesService {
  constructor(
    private readonly reglages: ReglagesModules,
    private readonly annuaire: AnnuaireAgences,
    private readonly details: DetailsModules,
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ patron : lire et régler */

  async lister(utilisateur: Utilisateur): Promise<ModulesAgenceReponse> {
    const agenceId = this.agenceDe(utilisateur);
    const reglages = await this.reglages.lire(agenceId);
    const modules = await Promise.all(
      CATALOGUE_MODULES.map((def) => this.vue(agenceId, def, reglages.get(def.code))),
    );
    return {
      modules,
      actifs: modules.filter((m) => m.actif).length,
      total: modules.length,
    };
  }

  async changer(
    utilisateur: Utilisateur,
    codeUrl: string,
    corps: unknown,
  ): Promise<ModuleChangeReponse> {
    const agenceId = this.agenceDe(utilisateur);
    const signature = lireSignature(corps);
    const commande = lireChangement(corps, signature);
    if (commande.code !== codeUrl) {
      throw erreurApi(422, "COMMANDE_INVALIDE", "Le code du corps diffère de celui de l'URL");
    }
    try {
      await this.signature.verifier(utilisateur, signature);
    } catch (e) {
      await this.tracerRefus(utilisateur, commande, e);
      throw e;
    }
    try {
      return await this.appliquer(utilisateur, agenceId, commande);
    } catch (e) {
      if (e instanceof HttpException) await this.tracerRefus(utilisateur, commande, e);
      throw e;
    }
  }

  private async appliquer(
    utilisateur: Utilisateur,
    agenceId: string,
    commande: ChangementModule,
  ): Promise<ModuleChangeReponse> {
    const def = moduleDuCatalogue(commande.code);
    if (!def) {
      throw erreurApi(404, "MODULE_INCONNU", `Module « ${commande.code} » inconnu`);
    }
    if (def.socle && !commande.actif) {
      throw erreurApi(409, "MODULE_SOCLE", "Le socle guichet et caisse ne peut pas être masqué");
    }
    const gares = await this.annuaire.gares(agenceId);
    const portee = this.resoudrePortee(commande.portee, gares);

    const avant = (await this.reglages.lire(agenceId)).get(def.code);
    const villeDeLaGare =
      portee.type === "gare" ? (gares.find((g) => g.id === portee.id)?.ville ?? null) : null;
    let etatAvant: boolean;
    if (portee.type === "agence") {
      etatAvant = etatAgence(def, avant);
    } else {
      const propre = avant?.exceptions.find((e) => memePortee(e.portee, portee));
      etatAvant = propre?.actif ?? etatHerite(def, avant, portee, villeDeLaGare);
    }

    if (def.socle) {
      // Toujours actif à toute portée : rien à enregistrer, mais la demande est tracée.
    } else if (portee.type === "agence") {
      await this.reglages.definirAgence(agenceId, def.code, commande.actif);
    } else if (etatHerite(def, avant, portee, villeDeLaGare) === commande.actif) {
      // Même valeur que la règle dont elle hérite : la gare ou la ville revient à cette règle.
      await this.reglages.retirerException(agenceId, def.code, portee);
    } else {
      await this.reglages.poserException(agenceId, def.code, { portee, actif: commande.actif });
    }

    const apres = (await this.reglages.lire(agenceId)).get(def.code);
    const module = await this.vue(agenceId, def, apres);
    const ligne = await this.audit.enregistrer({
      ...this.entreeAudit(utilisateur, commande, "succes"),
      details: {
        ...this.detailsAudit(commande),
        avant: etatAvant,
        apres: commande.actif,
        exceptionsAvant: avant?.exceptions.length ?? 0,
        exceptionsApres: module.exceptions.length,
      },
    });
    return {
      journalId: ligne.id,
      signeA: versIsoDouala(this.horloge.maintenant()),
      signePar: utilisateur.id,
      module,
    };
  }

  /* ------------------------------------------------------------------ toutes les apps : ce qui est visible */

  /**
   * Les modules actifs vus de la gare ou de la ville demandée. Un compte d'une agence ne lit que
   * la sienne (sa gare par défaut) ; un voyageur ou AfriMove, sans agence, la nomme avec `agence`.
   */
  async actifs(
    utilisateur: Utilisateur,
    requete: RequeteModulesActifs,
  ): Promise<ModulesActifsReponse> {
    const demandee = texteOptionnel(requete.agence, "agence");
    let agenceId: string;
    if (utilisateur.compagnieId !== null) {
      if (demandee !== null && demandee !== utilisateur.compagnieId) {
        throw erreurApi(
          403,
          "AGENCE_INTERDITE",
          "Vous ne pouvez lire que les modules de votre agence",
        );
      }
      agenceId = utilisateur.compagnieId;
    } else {
      if (demandee === null) {
        throw erreurApi(400, "AGENCE_REQUISE", "Précisez l'agence (paramètre « agence »)");
      }
      if (!(await this.annuaire.agenceExiste(demandee))) {
        throw erreurApi(404, "AGENCE_INCONNUE", `Agence « ${demandee} » inconnue`);
      }
      agenceId = demandee;
    }

    const gares = await this.annuaire.gares(agenceId);
    const gareDemandee = texteOptionnel(requete.gare, "gare") ?? utilisateur.gareId;
    const villeDemandee = texteOptionnel(requete.ville, "ville");
    let gareId: string | null = null;
    let ville: string | null =
      villeDemandee === null ? null : this.villeCanonique(villeDemandee, gares);
    if (gareDemandee !== null) {
      const gare = gares.find((g) => g.id === gareDemandee);
      if (!gare) throw erreurApi(404, "GARE_INCONNUE", `Gare « ${gareDemandee} » inconnue`);
      gareId = gare.id;
      ville = gare.ville; // la gare est dans sa ville : elle fait foi
    }

    const contexte: ContexteModule = { gareId, ville };
    const reglages = await this.reglages.lire(agenceId);
    return {
      agenceId,
      gareId,
      ville,
      calculeA: versIsoDouala(this.horloge.maintenant()),
      modules: CATALOGUE_MODULES.map((def) => ({
        code: def.code,
        actif: etatDans(def, reglages.get(def.code), contexte),
      })),
    };
  }

  /**
   * Ce module est-il visible pour cette agence, vu de cette gare ou de cette ville ? À appeler par
   * les autres modules de l'API (voir `ModuleRequis`). Un code inconnu est refusé : une faute de
   * frappe ne doit pas laisser passer un module masqué.
   */
  async estActif(
    agenceId: string,
    code: string,
    contexte: { gareId?: string | null; ville?: string | null } = {},
  ): Promise<boolean> {
    const def = moduleDuCatalogue(code);
    if (!def) throw new Error(`Module inconnu : ${code}`);
    if (def.socle) return true;
    const reglage = (await this.reglages.lire(agenceId)).get(code);
    let ville = contexte.ville ?? null;
    const gareId = contexte.gareId ?? null;
    if (gareId !== null) {
      const gare = (await this.annuaire.gares(agenceId)).find((g) => g.id === gareId);
      if (gare) ville = gare.ville;
    }
    return etatDans(def, reglage, { gareId, ville });
  }

  /* ------------------------------------------------------------------ internes */

  private agenceDe(utilisateur: Utilisateur): string {
    if (utilisateur.compagnieId === null) {
      throw erreurApi(403, "AGENCE_REQUISE", "Ce compte n'est rattaché à aucune agence");
    }
    return utilisateur.compagnieId;
  }

  private async vue(
    agenceId: string,
    def: ModuleCatalogue,
    reglage: ReglageModule | undefined,
  ): Promise<ModuleAgenceReponse> {
    const exceptions = def.socle ? [] : [...(reglage?.exceptions ?? [])];
    exceptions.sort((a, b) => cle(a.portee).localeCompare(cle(b.portee), "fr"));
    const actif = etatAgence(def, reglage);
    return {
      code: def.code,
      nom: def.nom,
      actif,
      socle: def.socle,
      detail:
        (await this.details.detail(agenceId, def.code)) ??
        phraseEtat(def, actif, exceptions.length),
      exceptions: exceptions.map((e) => ({ portee: e.portee, actif: e.actif })),
    };
  }

  /** Vérifie que la gare est à l'agence et donne à la ville son écriture officielle. */
  private resoudrePortee(portee: Portee, gares: readonly GareAnnuaire[]): Portee {
    if (portee.type === "gare") {
      if (!gares.some((g) => g.id === portee.id)) {
        throw erreurApi(404, "GARE_INCONNUE", `Gare « ${portee.id} » inconnue dans cette agence`);
      }
      return portee;
    }
    if (portee.type === "ville") {
      const ville = gares.find((g) => cleVille(g.ville) === cleVille(portee.nom))?.ville;
      if (ville === undefined) {
        throw erreurApi(404, "VILLE_INCONNUE", `Aucune gare de l'agence à « ${portee.nom} »`);
      }
      return { type: "ville", nom: ville };
    }
    return portee;
  }

  private villeCanonique(nom: string, gares: readonly GareAnnuaire[]): string {
    return gares.find((g) => cleVille(g.ville) === cleVille(nom))?.ville ?? nom;
  }

  private entreeAudit(
    utilisateur: Utilisateur,
    commande: ChangementModule,
    resultat: EntreeAudit["resultat"],
  ): Pick<EntreeAudit, "acteur" | "action" | "resultat" | "cible"> {
    return {
      acteur: {
        id: utilisateur.id,
        role: utilisateur.role,
        compagnieId: utilisateur.compagnieId,
      },
      action: ACTION_CHANGER_MODULE,
      resultat,
      cible: { type: "module", id: commande.code },
    };
  }

  /** Le PIN n'y figure jamais : seulement la façon de signer et l'heure déclarée par l'appareil. */
  private detailsAudit(commande: ChangementModule): Record<string, unknown> {
    return {
      module: commande.code,
      demande: commande.actif,
      portee: commande.portee,
      signature: commande.signature.methode,
      signeAAppareil: commande.signature.signeA,
    };
  }

  private async tracerRefus(
    utilisateur: Utilisateur,
    commande: ChangementModule,
    erreur: unknown,
  ): Promise<void> {
    const reponse = erreur instanceof HttpException ? erreur.getResponse() : null;
    const cause =
      typeof reponse === "object" && reponse !== null && "code" in reponse
        ? String((reponse as { code: unknown }).code)
        : "erreur";
    await this.audit.enregistrer({
      ...this.entreeAudit(utilisateur, commande, "refus"),
      details: { ...this.detailsAudit(commande), cause },
    });
  }
}

function cle(portee: PorteeException): string {
  return portee.type === "gare" ? `0 ${portee.id}` : `1 ${cleVille(portee.nom)}`;
}

/** Phrase d'état quand le module concerné n'en fournit pas (voir `DetailsModules`). */
function phraseEtat(def: ModuleCatalogue, actif: boolean, nbExceptions: number): string {
  if (def.socle) return "socle · toujours actif";
  const base = actif ? "actif dans l'agence" : "masqué dans l'agence";
  if (nbExceptions === 0) return base;
  return `${base} · ${nbExceptions} ${nbExceptions === 1 ? "exception" : "exceptions"}`;
}
