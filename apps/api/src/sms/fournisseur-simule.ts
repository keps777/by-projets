import { Logger } from "@nestjs/common";
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  FournisseurSms,
  lireCorpsRecus,
  signerRecu,
  verifierSignatureRecu,
  type DemandeFournisseur,
  type EtatRecu,
  type ReponseFournisseur,
  type RecuLivraison,
  type RequeteRecu,
} from "./fournisseur";

/** Ce que le simulateur fait au prochain appel d'envoi. */
export type ScenarioEnvoi =
  | { type: "ok" }
  | { type: "temporaire"; code?: string }
  | { type: "definitif"; code?: string }
  /** Le fournisseur accepte le message, mais la réponse se perd : l'appelant voit un délai dépassé. */
  | { type: "reponse_perdue" };

export interface OptionsFournisseurSimule {
  nom?: string;
  secretWebhook?: string;
  /** Attente simulée : en test, avance l'horloge fixe au lieu de dormir. */
  dormir?: (ms: number) => Promise<void> | void;
  maintenant?: () => Date;
  /** Écrit le texte des messages dans le journal (développement seulement, jamais en production). */
  journaliserContenu?: boolean;
}

export interface MessageSimule {
  reference: string;
  expediteur: string;
  destinataire: string;
  texte: string;
  idFournisseur: string;
  at: Date;
}

/**
 * Fournisseur simulé, programmable : sert au développement (aucun SMS ne part) et aux tests
 * (pannes, délais, réponse perdue, accusés signés). Respecte la règle d'idempotence du port : une
 * même `reference` rend toujours le même identifiant et n'est comptée qu'une fois dans `envoyes`.
 */
export class FournisseurSimule extends FournisseurSms {
  readonly nom: string;
  readonly reel = false;
  /** Messages acceptés, du plus ancien au plus récent. */
  readonly envoyes: MessageSimule[] = [];
  /** Nombre d'appels à `envoyer`, réussis ou non. */
  appels = 0;
  /** Durée simulée d'un appel, en millisecondes. */
  latenceMs = 0;

  private readonly logger = new Logger("FournisseurSimule");
  private readonly secret: string;
  private readonly dormir: (ms: number) => Promise<void> | void;
  private readonly maintenant: () => Date;
  private readonly journaliserContenu: boolean;
  private readonly scenarios: ScenarioEnvoi[] = [];
  private panne: { code: string; definitive: boolean } | null = null;
  private readonly parReference = new Map<string, string>();
  private compteur = 0;

  constructor(options: OptionsFournisseurSimule = {}) {
    super();
    this.nom = options.nom ?? "simule";
    this.secret = options.secretWebhook ?? "secret-simule-pour-les-tests-uniquement";
    this.dormir = options.dormir ?? (() => undefined);
    this.maintenant = options.maintenant ?? (() => new Date());
    this.journaliserContenu = options.journaliserContenu ?? false;
  }

  /** Programme les réponses des prochains appels (une par appel, dans l'ordre). */
  programmer(...scenarios: ScenarioEnvoi[]): this {
    this.scenarios.push(...scenarios);
    return this;
  }

  /** Tous les appels échouent (temporairement par défaut) jusqu'à `retablir`. */
  mettreEnPanne(code = "fournisseur_indisponible", definitive = false): this {
    this.panne = { code, definitive };
    return this;
  }

  retablir(): this {
    this.panne = null;
    return this;
  }

  async envoyer(demande: DemandeFournisseur): Promise<ReponseFournisseur> {
    this.appels += 1;
    if (this.latenceMs > 0) await this.dormir(this.latenceMs);
    const scenario = this.scenarios.shift();

    if (scenario?.type === "temporaire") {
      throw new ErreurFournisseurTemporaire(scenario.code ?? "fournisseur_indisponible");
    }
    if (scenario?.type === "definitif") {
      throw new ErreurFournisseurDefinitive(scenario.code ?? "destinataire_invalide");
    }
    if (!scenario && this.panne) {
      if (this.panne.definitive) throw new ErreurFournisseurDefinitive(this.panne.code);
      throw new ErreurFournisseurTemporaire(this.panne.code);
    }

    const connu = this.parReference.get(demande.reference);
    const idFournisseur = connu ?? `${this.nom}-${++this.compteur}`;
    if (connu === undefined) {
      this.parReference.set(demande.reference, idFournisseur);
      this.envoyes.push({ ...demande, idFournisseur, at: this.maintenant() });
      if (this.journaliserContenu) {
        this.logger.log(`SMS simulé vers ${demande.destinataire} : ${demande.texte}`);
      } else {
        this.logger.log(`SMS simulé accepté (${idFournisseur}, contenu non journalisé)`);
      }
    }
    if (scenario?.type === "reponse_perdue") {
      throw new ErreurFournisseurTemporaire("delai_depasse", "réponse perdue");
    }
    return { idFournisseur };
  }

  lireRecus(requete: RequeteRecu): RecuLivraison[] {
    return lireCorpsRecus(verifierSignatureRecu(this.secret, requete));
  }

  /** Fabrique l'appel que ferait le fournisseur pour signaler l'état d'un message. */
  fabriquerRecu(
    recus: ReadonlyArray<{
      idFournisseur: string;
      etat: EtatRecu;
      reference?: string;
      at?: Date;
      code?: string;
    }>,
    options: { horodatage?: Date; secret?: string } = {},
  ): Pick<RequeteRecu, "entetes" | "corpsBrut"> {
    const corpsBrut = JSON.stringify({
      messages: recus.map((r) => ({
        id: r.idFournisseur,
        ...(r.reference ? { reference: r.reference } : {}),
        etat: r.etat,
        at: (r.at ?? this.maintenant()).toISOString(),
        ...(r.code ? { code: r.code } : {}),
      })),
    });
    const horodatage = Math.floor((options.horodatage ?? this.maintenant()).getTime() / 1000);
    return {
      corpsBrut,
      entetes: {
        [ENTETE_HORODATAGE]: String(horodatage),
        [ENTETE_SIGNATURE]: signerRecu(options.secret ?? this.secret, horodatage, corpsBrut),
        "content-type": "application/json",
      },
    };
  }
}
