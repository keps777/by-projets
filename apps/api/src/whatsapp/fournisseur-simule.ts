import { Logger } from "@nestjs/common";
import {
  ENTETE_SIGNATURE,
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  FournisseurWhatsApp,
  lireCorpsWebhookMeta,
  signerWebhook,
  verifierAbonnementMeta,
  verifierSignatureWebhook,
  type ContenuFournisseur,
  type DemandeAbonnement,
  type DemandeFournisseur,
  type EtatCompteFournisseur,
  type EtatRecu,
  type EvenementsWebhook,
  type ReponseFournisseur,
  type RequeteWebhook,
} from "./fournisseur";
import { GABARITS, TYPES_GABARIT } from "./gabarits";
import { remplirCorps } from "./rapport";

/** Ce que le simulateur fait au prochain appel d'envoi. */
export type ScenarioEnvoi =
  | { type: "ok" }
  | { type: "temporaire"; code?: string }
  | { type: "definitif"; code?: string }
  /** WhatsApp accepte le message, mais la réponse se perd : l'appelant voit un délai dépassé. */
  | { type: "reponse_perdue" };

export interface OptionsFournisseurSimule {
  secretApplication?: string;
  jetonVerification?: string;
  /** Attente simulée : en test, avance l'horloge fixe au lieu de dormir. */
  dormir?: (ms: number) => Promise<void> | void;
  maintenant?: () => Date;
  /** Écrit le texte des messages dans le journal (développement seulement, jamais en production). */
  journaliserContenu?: boolean;
}

export interface MessageSimule {
  reference: string;
  destinataire: string;
  contenu: ContenuFournisseur;
  /** Le message tel que la personne le lit (corps du gabarit rempli). */
  texte: string;
  idFournisseur: string;
  at: Date;
}

export const SECRET_SIMULE = "secret-application-simule-pour-les-tests";
export const JETON_VERIFICATION_SIMULE = "jeton-verification-simule-tests";

/** Compte vérifié, qualité haute, tous les gabarits d'AfriMove approuvés. */
export function compteSimuleParDefaut(langue = "fr"): EtatCompteFournisseur {
  return {
    verifie: true,
    nomAffiche: "AfriMove",
    numeroAffiche: "+237 6 00 00 00 00",
    qualite: "haute",
    gabarits: TYPES_GABARIT.map((t) => ({
      nom: GABARITS[t].nom,
      langue,
      statut: "approuve" as const,
    })),
  };
}

/**
 * Fournisseur simulé, programmable : sert au développement (aucun message ne part) et aux tests
 * (pannes, délais, réponse perdue, accusés et messages reçus signés). Respecte la règle
 * d'idempotence du port : une même `reference` rend toujours le même identifiant et n'est comptée
 * qu'une fois dans `envoyes`.
 */
export class FournisseurWhatsAppSimule extends FournisseurWhatsApp {
  readonly nom = "simule";
  readonly reel = false;
  /** Messages acceptés, du plus ancien au plus récent. */
  readonly envoyes: MessageSimule[] = [];
  /** Nombre d'appels à `envoyer`, réussis ou non. */
  appels = 0;
  /** Durée simulée d'un appel, en millisecondes. */
  latenceMs = 0;
  /** Ce que `etatCompte` rend ; modifiable par les tests. */
  compte: EtatCompteFournisseur = compteSimuleParDefaut();
  /** `etatCompte` échoue (fournisseur injoignable). */
  compteInjoignable = false;

  private readonly logger = new Logger("FournisseurWhatsAppSimule");
  private readonly secret: string;
  private readonly jeton: string;
  private readonly dormir: (ms: number) => Promise<void> | void;
  private readonly maintenant: () => Date;
  private readonly journaliserContenu: boolean;
  private readonly scenarios: ScenarioEnvoi[] = [];
  private panne: { code: string; definitive: boolean } | null = null;
  private readonly parReference = new Map<string, string>();
  private compteur = 0;

  constructor(options: OptionsFournisseurSimule = {}) {
    super();
    this.secret = options.secretApplication ?? SECRET_SIMULE;
    this.jeton = options.jetonVerification ?? JETON_VERIFICATION_SIMULE;
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
      throw new ErreurFournisseurDefinitive(scenario.code ?? "pas_sur_whatsapp");
    }
    if (!scenario && this.panne) {
      if (this.panne.definitive) throw new ErreurFournisseurDefinitive(this.panne.code);
      throw new ErreurFournisseurTemporaire(this.panne.code);
    }

    const connu = this.parReference.get(demande.reference);
    const idFournisseur = connu ?? `wamid.simule-${++this.compteur}`;
    if (connu === undefined) {
      this.parReference.set(demande.reference, idFournisseur);
      const texte = this.lire(demande.contenu);
      this.envoyes.push({
        reference: demande.reference,
        destinataire: demande.destinataire,
        contenu: demande.contenu,
        texte,
        idFournisseur,
        at: this.maintenant(),
      });
      if (this.journaliserContenu) {
        this.logger.log(`WhatsApp simulé vers ${demande.destinataire} : ${texte}`);
      } else {
        this.logger.log(`WhatsApp simulé accepté (${idFournisseur}, contenu non journalisé)`);
      }
    }
    if (scenario?.type === "reponse_perdue") {
      throw new ErreurFournisseurTemporaire("delai_depasse", "réponse perdue");
    }
    return { idFournisseur };
  }

  private lire(contenu: ContenuFournisseur): string {
    if (contenu.type === "texte") return contenu.texte;
    const gabarit = TYPES_GABARIT.map((t) => GABARITS[t]).find((g) => g.nom === contenu.nom);
    return gabarit ? remplirCorps(gabarit.corps, contenu.parametres) : contenu.parametres.join(" ");
  }

  lireWebhook(requete: RequeteWebhook): EvenementsWebhook {
    return lireCorpsWebhookMeta(verifierSignatureWebhook(this.secret, requete));
  }

  verifierAbonnement(demande: DemandeAbonnement): string {
    return verifierAbonnementMeta(this.jeton, demande);
  }

  async etatCompte(): Promise<EtatCompteFournisseur> {
    if (this.compteInjoignable) throw new ErreurFournisseurTemporaire("fournisseur_indisponible");
    return structuredClone(this.compte);
  }

  /** Fabrique l'appel que ferait WhatsApp : accusés de livraison et/ou messages reçus, signés. */
  fabriquerWebhook(
    contenu: {
      statuts?: ReadonlyArray<{
        idFournisseur: string;
        etat: EtatRecu;
        reference?: string;
        at?: Date;
        code?: number | string;
      }>;
      messages?: ReadonlyArray<{
        idFournisseur: string;
        de: string;
        texte?: string | null;
        type?: string;
        at?: Date;
      }>;
    },
    options: { secret?: string } = {},
  ): Pick<RequeteWebhook, "entetes" | "corpsBrut"> {
    const ETATS = { envoye: "sent", remis: "delivered", lu: "read", echec: "failed" } as const;
    const seconde = (d: Date | undefined): string =>
      String(Math.floor((d ?? this.maintenant()).getTime() / 1000));
    const valeur = {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "237600000000", phone_number_id: "109876543210" },
      ...(contenu.statuts
        ? {
            statuses: contenu.statuts.map((s) => ({
              id: s.idFournisseur,
              status: ETATS[s.etat],
              timestamp: seconde(s.at),
              recipient_id: "237655012345",
              ...(s.reference ? { biz_opaque_callback_data: s.reference } : {}),
              ...(s.etat === "echec"
                ? { errors: [{ code: s.code ?? 131026, title: "Message undeliverable" }] }
                : {}),
            })),
          }
        : {}),
      ...(contenu.messages
        ? {
            contacts: contenu.messages.map((m) => ({ wa_id: m.de, profile: { name: "Contact" } })),
            messages: contenu.messages.map((m) => ({
              id: m.idFournisseur,
              from: m.de,
              timestamp: seconde(m.at),
              type: m.type ?? "text",
              ...((m.type ?? "text") === "text" ? { text: { body: m.texte ?? "" } } : {}),
            })),
          }
        : {}),
    };
    const corpsBrut = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "123456789", changes: [{ field: "messages", value: valeur }] }],
    });
    return {
      corpsBrut,
      entetes: {
        [ENTETE_SIGNATURE]: signerWebhook(options.secret ?? this.secret, corpsBrut),
        "content-type": "application/json",
      },
    };
  }
}
