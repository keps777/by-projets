import { HttpException } from "@nestjs/common";
import type { AuditService, EntreeAudit } from "../../socle/audit/audit.service";
import type { Utilisateur } from "../../socle/auth/decorateurs";
import type { VerificateurSignature } from "../../modules/signature";
import type { Classe, DepartFait } from "../../analyses/modele";
import { jourParJour, jourSemaine } from "../../analyses/periodes";
import {
  AUJOURDHUI,
  COMPAGNIE,
  BUS_207,
  BUS_330,
  BUS_412,
  DLA_BAF,
  depart,
  monterAnalyses,
  peuplerReferentiel,
  type MontageAnalyses,
} from "../../analyses/testing/montage";
import { decalerJour } from "../../rapport/temps";
import { AssistantService } from "../assistant.service";
import { chargerConfigAssistant, type ConfigAssistant } from "../config";
import { AppliquerActionsMemoire, ConversationsMemoire, PropositionsMemoire } from "../memoire";
import { ModeleAucun } from "../modele-langage";
import {
  ModeleLangage,
  type ChoixInterpretation,
  type DemandeRedaction,
  type Redige,
} from "../ports";

export { AUJOURDHUI, COMPAGNIE };

export const PATRON: Utilisateur = {
  id: "patron-alpha",
  role: "patron",
  compagnieId: COMPAGNIE,
  gareId: null,
};

/** Le jour où commence la période récente de deux semaines (la planche : du mardi 22 déc. au lundi 4 janv.). */
export const DEBUT_RECENT = decalerJour(AUJOURDHUI, -14);

/** Une signature PIN valide pour l'instant donné (l'instant du serveur de test). */
export function signature(signeA = "2027-01-05T08:00:00.000+01:00") {
  return { pin: "482915", methode: "pin" as const, signeA };
}

/* ------------------------------------------------------------------ modèle de langage de test */

/** Un modèle de langage que le test pilote : il garde les demandes reçues et rend ce qu'on lui dit. */
export class ModeleScenario extends ModeleLangage {
  readonly nom = "modele-de-test";
  readonly actif = true;
  readonly demandes: DemandeRedaction[] = [];
  readonly interpretations: Array<{ question: string; lignes: readonly string[] }> = [];
  /** Ce que `rediger` rend ; une fonction pour construire la réponse à partir de la demande. */
  reponse: ((demande: DemandeRedaction) => Redige | null) | Redige | null = null;
  choix: ChoixInterpretation | null = null;
  erreur: Error | null = null;
  /** Fait attendre `rediger` (pour tester le délai maximal). */
  attenteMs = 0;

  async rediger(demande: DemandeRedaction): Promise<Redige | null> {
    this.demandes.push(structuredClone(demande));
    if (this.attenteMs > 0) await new Promise((r) => setTimeout(r, this.attenteMs));
    if (this.erreur) throw this.erreur;
    const r = this.reponse;
    return typeof r === "function" ? r(demande) : r;
  }

  async interpreter(
    question: string,
    lignes: readonly string[],
  ): Promise<ChoixInterpretation | null> {
    this.interpretations.push({ question, lignes: [...lignes] });
    if (this.erreur) throw this.erreur;
    return this.choix;
  }
}

/* ------------------------------------------------------------------ montage du service */

export interface MontageAssistant extends MontageAnalyses {
  assistant: AssistantService;
  assistantConfig: ConfigAssistant;
  conversations: ConversationsMemoire;
  propositions: PropositionsMemoire;
  actions: AppliquerActionsMemoire;
  modele: ModeleLangage;
  /** Le journal d'audit du test. */
  audit: { lignes: EntreeAudit[]; enPanne: boolean };
  /** La vérification du PIN du test : `echec` la fait refuser. */
  pin: { appels: number; echec: Error | null };
}

export interface OptionsAssistant {
  env?: Record<string, string>;
  modele?: ModeleLangage;
}

/** Le service de l'assistant branché sur les adaptateurs en mémoire, sans HTTP. */
export function monterAssistant(options: OptionsAssistant = {}): MontageAssistant {
  const analyses = monterAnalyses();
  const assistantConfig = chargerConfigAssistant(options.env ?? {});
  const conversations = new ConversationsMemoire();
  const propositions = new PropositionsMemoire();
  const actions = new AppliquerActionsMemoire(analyses.horloge);
  const modele = options.modele ?? new ModeleAucun();
  const audit = { lignes: [] as EntreeAudit[], enPanne: false };
  const pin = { appels: 0, echec: null as Error | null };
  const faussaire = {
    enregistrer: async (entree: EntreeAudit) => {
      if (audit.enPanne) throw new Error("journal indisponible");
      audit.lignes.push(structuredClone(entree));
      return { id: `audit-${audit.lignes.length}` };
    },
  } as unknown as AuditService;
  const verificateur = {
    verifier: async () => {
      pin.appels += 1;
      if (pin.echec) throw pin.echec;
    },
  } as unknown as VerificateurSignature;
  const assistant = new AssistantService(
    analyses.service,
    conversations,
    propositions,
    actions,
    modele,
    verificateur,
    faussaire,
    analyses.horloge,
    assistantConfig,
  );
  return {
    ...analyses,
    assistant,
    assistantConfig,
    conversations,
    propositions,
    actions,
    modele,
    audit,
    pin,
  };
}

/* ------------------------------------------------------------------ la planche « Pourquoi Bafoussam baisse ? » */

interface SerieDynamique {
  heure: string;
  classe?: Classe;
  prix?: number;
  /** Remplissage en % de ce départ, ce jour-là. */
  remplissage: (jour: string) => number;
  recetteColis?: (jour: string) => number;
  busId?: string | null;
}

/** Des départs jour après jour dont le remplissage dépend du jour (ce que `genererLigne` ne sait pas faire). */
export function genererDynamique(
  ligneId: string,
  du: string,
  au: string,
  seriesDeLaLigne: readonly SerieDynamique[],
  capacite = 40,
): DepartFait[] {
  const sortie: DepartFait[] = [];
  for (const jour of jourParJour(du, au)) {
    for (const s of seriesDeLaLigne) {
      const billets = Math.round((capacite * s.remplissage(jour)) / 100);
      const prix = s.prix ?? 4_000;
      sortie.push(
        depart({
          ligneId,
          jour,
          heure: s.heure,
          classe: s.classe ?? "classique",
          prix,
          capacite,
          billets,
          recetteBillets: billets * prix,
          recetteColis: s.recetteColis?.(jour) ?? 0,
          busId: s.busId === undefined ? BUS_330.id : s.busId,
        }),
      );
    }
  }
  return sortie;
}

const MERCREDI = 3;
const MARDI = 2;
const estRecent = (jour: string): boolean => jour >= DEBUT_RECENT;

/**
 * Douala → Bafoussam sur 30 jours, comme la planche : le mercredi s'effondre depuis deux semaines (42 %),
 * le mardi est plein (100 %), le 10:00 passe de 80 % à 55 % depuis que « Oméga » part à 09:30 à 3 500 F (500 F de moins que nous),
 * et les colis montent. `DLA_YDE` n'a aucun départ. Trois bus, deux agents, deux chauffeurs.
 */
export function peuplerBafoussam(m: MontageAnalyses): void {
  peuplerReferentiel(m);
  const du = decalerJour(AUJOURDHUI, -30);
  const au = decalerJour(AUJOURDHUI, -1);
  const base = (pctNormal: number) => (jour: string) => {
    const j = jourSemaine(jour);
    if (j === MERCREDI && estRecent(jour)) return 42;
    if (j === MARDI) return 100;
    return pctNormal;
  };
  m.departs.ajouter(
    COMPAGNIE,
    ...genererDynamique(DLA_BAF.id, du, au, [
      {
        heure: "06:00",
        remplissage: base(92),
        recetteColis: (j) => (estRecent(j) ? 5_450 : 5_000),
      },
      { heure: "08:15", remplissage: base(88), busId: BUS_207.id },
      {
        heure: "10:00",
        remplissage: (jour) => {
          const j = jourSemaine(jour);
          if (j === MERCREDI && estRecent(jour)) return 42;
          return estRecent(jour) ? 55 : 80;
        },
      },
      { heure: "13:00", remplissage: base(76), busId: BUS_412.id },
      { heure: "16:30", classe: "vip", prix: 6_000, remplissage: base(80) },
    ]),
  );
  for (const jour of jourParJour(du, au)) {
    m.offres.publier("autre", {
      compagnie: "Oméga",
      ligneCode: "DLABAF",
      jour,
      heure: "09:30",
      prix: 3_500,
    });
  }
}

/** Le `departId` du dernier départ d'une heure donnée sur la ligne (celui qu'on décale ou dont on change le prix). */
export async function dernierDepart(
  m: MontageAnalyses,
  heure: string,
  classe: Classe = "classique",
): Promise<string> {
  const faits = await m.departs.entre(
    COMPAGNIE,
    decalerJour(AUJOURDHUI, -30),
    decalerJour(AUJOURDHUI, -1),
  );
  const tous = faits
    .filter((d) => d.heure === heure && d.classe === classe)
    .sort((a, b) => a.jour.localeCompare(b.jour));
  return tous[tous.length - 1]!.departId;
}

/** Les erreurs HTTP de l'API sous forme comparable : `{ statut, code }`. */
export function codeDe(erreur: unknown): { statut: number; code: string } | null {
  if (!(erreur instanceof HttpException)) return null;
  const r = erreur.getResponse() as { code?: string };
  return { statut: erreur.getStatus(), code: r.code ?? "" };
}
