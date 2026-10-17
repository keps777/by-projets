import { randomUUID } from "node:crypto";
import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { AnalysesService } from "../analyses/analyses.service";
import { erreurApi } from "../analyses/erreurs";
import { dateCourte } from "../analyses/periodes";
import type { ActionProposee, Constat, LigneRef } from "../analyses/modele";
import { detecter, type Detections } from "../analyses/regles";
import { BASE_JOURS } from "../analyses/simulation";
import { MS_PAR_JOUR, jourDouala, versIsoDouala } from "../rapport/temps";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { lireSignature } from "../modules/commande";
import { VerificateurSignature } from "../modules/signature";
import { CONFIG_ASSISTANT, type ConfigAssistant } from "./config";
import { depuisChoix, interpreter, type Interpretation } from "./interpretation";
import type {
  ActionVue,
  Brouillon,
  ContexteConversation,
  ConversationVue,
  DemandeSimulationVue,
  EchangeStocke,
  FuiteVue,
  GainVue,
  InsightsVue,
  PropositionAppliqueeVue,
  Redaction,
  ReponseVue,
  ResultatSimulationVue,
} from "./modele";
import { phraseSources, questionsSuggerees, repondre } from "./moteur";
import {
  AppliquerActions,
  ConversationsAssistant,
  ModeleLangage,
  PropositionsAssistant,
  type DemandeRedaction,
} from "./ports";
import { Pseudonymes } from "./pseudonymes";
import { verifierRedaction } from "./redaction";
import { lireProposition } from "./validation";

export const ACTION_QUESTION = "assistant.question";
export const ACTION_APPLIQUER = "assistant.proposition.appliquer";

const vueAction = (a: ActionProposee): ActionVue => ({
  id: a.id,
  libelle: a.libelle,
  type: a.type,
});

function vueFuite(c: Constat): FuiteVue {
  return {
    id: c.id,
    periodeJours: c.periodeJours,
    constat: c.constat,
    explication: c.explication,
    montantTotal: c.montantTotal,
    joursConcernes: c.joursConcernes,
    actions: c.actions.map(vueAction),
  };
}

/** Un « argent à gagner » porte une simulation et une action ; sans l'une des deux, il ne sort pas. */
function vueGain(c: Constat): GainVue[] {
  const action = c.actions[0];
  if (!c.simulation || !action) return [];
  return [
    {
      id: c.id,
      constat: c.constat,
      simulation: {
        scenarios: c.simulation.scenarios.map((s) => ({ ...s })),
        gainMensuel: c.simulation.gainMensuel,
      },
      base: c.simulation.base,
      action: vueAction(action),
    },
  ];
}

const uniques = (actions: readonly ActionProposee[]): ActionProposee[] => [
  ...new Map(actions.map((a) => [a.id, a])).values(),
];

/** Attend au plus `ms` : au-delà, lève une erreur (le modèle est abandonné, les règles répondent). */
async function avecDelai<T>(promesse: Promise<T>, ms: number): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesse,
      new Promise<never>((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error("délai dépassé")), ms);
      }),
    ]);
  } finally {
    clearTimeout(minuteur);
  }
}

const memoiser = <T>(calcul: () => T): (() => T) => {
  let valeur: { v: T } | null = null;
  return () => (valeur ??= { v: calcul() }).v;
};

/**
 * L'assistant du patron : il lit les chiffres de sa compagnie (module `analyses`), répond à ses questions
 * en français avec ses sources, propose des actions et, sur signature PIN, applique celles qu'il accepte.
 *
 * Ce qui part vers le modèle de langage : la question (sans nom de personne ni numéro de téléphone) et
 * les phrases chiffrées que l'API a elle-même calculées. Jamais un billet, un voyageur, ni un chiffre
 * d'une autre compagnie ; les noms des agents et chauffeurs sont remplacés par des pseudonymes.
 */
@Injectable()
export class AssistantService {
  private readonly journal = new Logger("Assistant");
  private readonly questions = new Map<string, number[]>();

  constructor(
    private readonly analyses: AnalysesService,
    private readonly conversations: ConversationsAssistant,
    private readonly propositions: PropositionsAssistant,
    private readonly appliquerActions: AppliquerActions,
    private readonly modele: ModeleLangage,
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_ASSISTANT) private readonly config: ConfigAssistant,
  ) {}

  /* ------------------------------------------------------------------ insights */

  async insights(compagnieId: string): Promise<InsightsVue> {
    const { contexte, constats } = await this.analyses.constats(compagnieId);
    if (contexte.indisponibles.length > 0) {
      this.journal.warn(`Insights calculés sans : ${contexte.indisponibles.join(", ")}`);
    }
    await this.proposer(compagnieId, [
      ...constats.fuites.flatMap((c) => c.actions),
      ...constats.gains.flatMap((c) => c.actions),
    ]);
    return {
      fuites: constats.fuites.map(vueFuite),
      gains: constats.gains.flatMap(vueGain),
      questionsSuggerees: questionsSuggerees(contexte),
    };
  }

  /** Le patron ne peut appliquer que ce que l'API lui a montré : on le note au moment de le montrer. */
  private async proposer(compagnieId: string, actions: readonly ActionProposee[]): Promise<void> {
    const aProposer = uniques(actions);
    if (aProposer.length === 0) return;
    const maintenant = this.horloge.maintenant();
    const expire = new Date(maintenant.getTime() + this.config.peremptionJours * MS_PAR_JOUR);
    try {
      await this.propositions.proposer(compagnieId, aProposer, maintenant, expire);
    } catch (e) {
      this.journal.error(`Propositions indisponibles : ${(e as Error).message}`);
      throw erreurApi(
        503,
        "SOURCE_INDISPONIBLE",
        "Les propositions de l'assistant sont indisponibles",
      );
    }
  }

  /* ------------------------------------------------------------------ conversation */

  async conversation(compagnieId: string, utilisateurId: string): Promise<ConversationVue> {
    let echanges: EchangeStocke[];
    try {
      echanges = await this.conversations.derniers(
        compagnieId,
        utilisateurId,
        this.config.echangesGardes,
      );
    } catch (e) {
      this.journal.error(`Conversation indisponible : ${(e as Error).message}`);
      throw erreurApi(
        503,
        "SOURCE_INDISPONIBLE",
        "La conversation de l'assistant est indisponible",
      );
    }
    return {
      id: `conversation-${utilisateurId}`,
      baseJours: BASE_JOURS,
      echanges: echanges.map((e) => e.reponse),
    };
  }

  /* ------------------------------------------------------------------ question libre */

  async poserQuestion(
    utilisateur: Utilisateur,
    compagnieId: string,
    question: string,
  ): Promise<ReponseVue> {
    this.limiter(utilisateur.id);
    const debut = performance.now();
    const ctx = await this.analyses.contexte(compagnieId);
    const precedent = await this.contexteDuDernierEchange(compagnieId, utilisateur.id);

    const pseudonymes = new Pseudonymes([
      ...ctx.agents.map((a) => ({ nom: a.nom, genre: "Agent" as const })),
      ...ctx.bus.map((b) => ({ nom: b.chauffeurNom, genre: "Chauffeur" as const })),
    ]);

    let interpretation: Interpretation = interpreter(question, ctx.lignes, ctx.aujourdhui);
    if (interpretation.intention === "inconnue" && this.modele.actif) {
      interpretation =
        (await this.interpreterParModele(question, ctx.lignes, pseudonymes)) ?? interpretation;
    }

    const constats = memoiser<Detections>(() => detecter(ctx));
    const brouillon = repondre(interpretation, {
      ctx,
      analyses: this.analyses,
      constats,
      precedent,
    });
    const texte = await this.rediger(brouillon, question, pseudonymes);

    const reponse: ReponseVue = {
      question,
      repondueA: versIsoDouala(this.horloge.maintenant()),
      dureeSecondes: Math.max(1, Math.ceil((performance.now() - debut) / 1000)),
      resume: texte.resume,
      points: texte.points,
      actions: brouillon.actions.map(vueAction),
      sources: phraseSources(brouillon.sources),
      simulation:
        brouillon.simulation && brouillon.simulation.length > 0
          ? { options: brouillon.simulation.map((o) => ({ ...o })) }
          : null,
    };

    // Les actions montrées doivent pouvoir être appliquées : si on ne peut pas les noter, on ne répond pas.
    await this.proposer(compagnieId, brouillon.actions);
    await this.garder(compagnieId, utilisateur, brouillon, reponse, texte.redaction);
    await this.tracerQuestion(utilisateur, brouillon, texte.redaction, performance.now() - debut);
    return reponse;
  }

  private async contexteDuDernierEchange(
    compagnieId: string,
    utilisateurId: string,
  ): Promise<ContexteConversation | null> {
    try {
      const [dernier] = await this.conversations.derniers(compagnieId, utilisateurId, 1);
      return dernier?.contexte ?? null;
    } catch (e) {
      // Sans mémoire, la question est traitée seule : « et si… » demandera de préciser le départ.
      this.journal.warn(`Conversation illisible : ${(e as Error).message}`);
      return null;
    }
  }

  private async interpreterParModele(
    question: string,
    lignes: readonly LigneRef[],
    pseudonymes: Pseudonymes,
  ): Promise<Interpretation | null> {
    try {
      const choix = await avecDelai(
        this.modele.interpreter(
          pseudonymes.masquerQuestion(question),
          lignes.map((l) => l.nom),
        ),
        this.config.modele.delaiMs,
      );
      return choix ? depuisChoix(choix, lignes) : null;
    } catch (e) {
      this.journal.warn(`Interprétation par le modèle impossible : ${(e as Error).message}`);
      return null;
    }
  }

  /** Le texte de la réponse : celui du modèle s'il est sûr, sinon celui des règles. */
  private async rediger(
    brouillon: Brouillon,
    question: string,
    pseudonymes: Pseudonymes,
  ): Promise<{ resume: string; points: string[]; redaction: Redaction }> {
    const regles = {
      resume: brouillon.resume,
      points: brouillon.points,
      redaction: "regles" as const,
    };
    if (!this.modele.actif || brouillon.figee || brouillon.faits.length === 0) return regles;
    const demande: DemandeRedaction = {
      intention: brouillon.intention,
      question: pseudonymes.masquerQuestion(question),
      faits: brouillon.faits.map((f) => pseudonymes.masquer(f)),
      avecPoints: brouillon.points.length > 0,
      motsObligatoires: brouillon.motsObligatoires.map((m) => pseudonymes.masquer(m)),
    };
    try {
      const brut = await avecDelai(this.modele.rediger(demande), this.config.modele.delaiMs);
      const verifie = verifierRedaction(brut, demande);
      if (!verifie) {
        this.journal.warn("Réponse du modèle écartée (forme, chiffre ou texte obligatoire)");
        return regles;
      }
      return {
        resume: pseudonymes.demasquer(verifie.resume),
        points: verifie.points.map((p) => pseudonymes.demasquer(p)),
        redaction: "modele",
      };
    } catch (e) {
      this.journal.warn(`Modèle de langage indisponible : ${(e as Error).message}`);
      return regles;
    }
  }

  private async garder(
    compagnieId: string,
    utilisateur: Utilisateur,
    brouillon: Brouillon,
    reponse: ReponseVue,
    redaction: Redaction,
  ): Promise<void> {
    try {
      await this.conversations.ajouter({
        id: randomUUID(),
        compagnieId,
        utilisateurId: utilisateur.id,
        intention: brouillon.intention,
        redaction,
        reponse,
        contexte: brouillon.contexte,
        creeLe: reponse.repondueA,
      });
    } catch (e) {
      // La réponse part quand même : seul l'historique de la conversation en pâtit.
      this.journal.error(`Échange non gardé : ${(e as Error).message}`);
    }
  }

  /** Ni la question ni la réponse n'entrent dans le journal d'audit : l'échange est dans `assistant_echange`. */
  private async tracerQuestion(
    utilisateur: Utilisateur,
    brouillon: Brouillon,
    redaction: Redaction,
    dureeMs: number,
  ): Promise<void> {
    try {
      await this.audit.enregistrer({
        acteur: {
          id: utilisateur.id,
          role: utilisateur.role,
          compagnieId: utilisateur.compagnieId,
        },
        action: ACTION_QUESTION,
        resultat: "succes",
        details: {
          intention: brouillon.intention,
          redaction,
          modele: redaction === "modele" ? this.modele.nom : "regles",
          dureeMs: Math.round(dureeMs),
        },
      });
    } catch (e) {
      this.journal.error(`Question non tracée : ${(e as Error).message}`);
    }
  }

  /** Le modèle est payant : au plus `questionsParMinute` questions par patron. */
  private limiter(utilisateurId: string): void {
    const maintenant = this.horloge.maintenant().getTime();
    if (this.questions.size > 1_000) {
      for (const [id, instants] of this.questions) {
        if (instants.every((t) => maintenant - t >= 60_000)) this.questions.delete(id);
      }
    }
    const recentes = (this.questions.get(utilisateurId) ?? []).filter(
      (t) => maintenant - t < 60_000,
    );
    if (recentes.length >= this.config.questionsParMinute) {
      throw erreurApi(
        429,
        "TROP_DE_QUESTIONS",
        "Trop de questions d'affilée : réessaie dans une minute",
      );
    }
    recentes.push(maintenant);
    this.questions.set(utilisateurId, recentes);
  }

  /* ------------------------------------------------------------------ simulation */

  async simuler(
    compagnieId: string,
    demande: DemandeSimulationVue,
  ): Promise<ResultatSimulationVue> {
    const r = await this.analyses.simuler(compagnieId, demande);
    return {
      demande: r.demande,
      simulation: {
        scenarios: r.simulation.scenarios.map((s) => ({ ...s })),
        gainMensuel: r.simulation.gainMensuel,
      },
      base: r.base,
    };
  }

  /* ------------------------------------------------------------------ appliquer */

  /**
   * Applique une proposition de l'assistant. Réglage modifié donc signature PIN obligatoire (comme les
   * modules) ; la proposition doit avoir été faite à cette compagnie, ne pas être périmée ni déjà
   * appliquée ; l'application est tracée au journal d'audit (`journalId` = sa ligne).
   */
  async appliquer(
    utilisateur: Utilisateur,
    compagnieId: string,
    corps: unknown,
  ): Promise<PropositionAppliqueeVue> {
    const signature = lireSignature(corps);
    const { actionId } = lireProposition(corps);
    try {
      await this.signature.verifier(utilisateur, signature);
    } catch (e) {
      await this.tracerRefus(utilisateur, actionId, e);
      throw e;
    }
    try {
      return await this.appliquerSignee(utilisateur, compagnieId, actionId, signature);
    } catch (e) {
      if (e instanceof HttpException) await this.tracerRefus(utilisateur, actionId, e);
      throw e;
    }
  }

  private async appliquerSignee(
    utilisateur: Utilisateur,
    compagnieId: string,
    actionId: string,
    signature: { methode: "pin" | "empreinte"; signeA: string },
  ): Promise<PropositionAppliqueeVue> {
    const maintenant = this.horloge.maintenant();
    let proposition;
    try {
      proposition = await this.propositions.trouver(compagnieId, actionId);
    } catch (e) {
      this.journal.error(`Propositions indisponibles : ${(e as Error).message}`);
      throw erreurApi(
        503,
        "SOURCE_INDISPONIBLE",
        "Les propositions de l'assistant sont indisponibles",
      );
    }
    if (!proposition) {
      throw erreurApi(404, "PROPOSITION_INCONNUE", `Proposition « ${actionId} » inconnue`);
    }
    if (Date.parse(proposition.expireLe) <= maintenant.getTime()) {
      throw erreurApi(
        410,
        "PROPOSITION_PERIMEE",
        `Cette proposition date de plus de ${this.config.peremptionJours} jours : ouvre l'assistant pour la voir de nouveau`,
      );
    }
    if (proposition.application) {
      throw this.dejaAppliquee(proposition.application.a);
    }
    if (proposition.action.type === "voir_ligne") {
      throw erreurApi(
        422,
        "ACTION_NON_APPLICABLE",
        "Cette action ouvre un écran : elle ne change aucun réglage",
      );
    }
    if (!(await this.propositions.reserver(compagnieId, actionId, utilisateur.id, maintenant))) {
      throw this.dejaAppliquee(maintenant.toISOString());
    }

    let effet: { effetA: string };
    try {
      effet = await this.appliquerActions.appliquer({
        compagnieId,
        action: proposition.action,
        par: { id: utilisateur.id, role: utilisateur.role },
        a: maintenant,
      });
    } catch (e) {
      await this.propositions.liberer(compagnieId, actionId).catch(() => undefined);
      if (e instanceof HttpException) throw e;
      this.journal.error(`Application impossible (${actionId}) : ${(e as Error).message}`);
      throw erreurApi(
        502,
        "APPLICATION_IMPOSSIBLE",
        "Le réglage n'a pas pu être appliqué : rien n'a changé, réessaie",
      );
    }

    // À partir d'ici le réglage est posé : il reste réservé même si la suite échoue (jamais deux fois).
    const ligne = await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: ACTION_APPLIQUER,
      resultat: "succes",
      cible: { type: "proposition", id: actionId },
      details: {
        action: proposition.action.type,
        libelle: proposition.action.libelle,
        parametres: proposition.action.parametres,
        effetA: effet.effetA,
        signature: signature.methode,
        signeAAppareil: signature.signeA,
      },
    });
    await this.propositions
      .confirmer(compagnieId, actionId, ligne.id, effet.effetA)
      .catch((e: Error) =>
        this.journal.error(`Application non notée (${actionId}) : ${e.message}`),
      );
    return {
      journalId: ligne.id,
      signeA: versIsoDouala(maintenant),
      signePar: utilisateur.id,
      actionId,
      effetA: effet.effetA,
    };
  }

  private dejaAppliquee(quand: string): HttpException {
    return erreurApi(
      409,
      "PROPOSITION_DEJA_APPLIQUEE",
      `Cette proposition a déjà été appliquée le ${dateCourte(jourDouala(quand))}`,
    );
  }

  private async tracerRefus(
    utilisateur: Utilisateur,
    actionId: string,
    erreur: unknown,
  ): Promise<void> {
    const reponse = erreur instanceof HttpException ? erreur.getResponse() : null;
    const cause =
      typeof reponse === "object" && reponse !== null && "code" in reponse
        ? String((reponse as { code: unknown }).code)
        : "erreur";
    try {
      await this.audit.enregistrer({
        acteur: {
          id: utilisateur.id,
          role: utilisateur.role,
          compagnieId: utilisateur.compagnieId,
        },
        action: ACTION_APPLIQUER,
        resultat: "refus",
        cible: { type: "proposition", id: actionId },
        details: { cause },
      });
    } catch (e) {
      this.journal.error(`Refus non tracé : ${(e as Error).message}`);
    }
  }
}
