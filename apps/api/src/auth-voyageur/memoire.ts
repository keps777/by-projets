import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { CanalIndisponible } from "./erreurs";
import {
  ComptesVoyageur,
  EmetteurSession,
  EnvoiCodeSms,
  EnvoiCodeWhatsApp,
  FichesVoyageur,
  StockageConnexion,
  type CodeEmis,
  type CompteVoyageur,
  type DemandeEnvoiCode,
  type FicheVoyageur,
  type ReservationEnvoi,
  type SessionEmise,
} from "./ports";
import {
  ETAT_VIERGE,
  appliquerEchec,
  decider,
  type EtatLimite,
  type ReglesEnvoi,
  type ReglesEssais,
} from "./regles";

/** Adaptateurs en mémoire des ports : tests, démonstration, développement sans base. */

/* ------------------------------------------------------------------------------------ stockage */

export class StockageConnexionMemoire extends StockageConnexion {
  readonly durable = false;
  readonly codes = new Map<string, CodeEmis>();
  readonly limites = new Map<string, EtatLimite>();

  async reserverEnvoi(code: CodeEmis, regles: ReglesEnvoi): Promise<ReservationEnvoi> {
    const emis = [...this.codes.values()]
      .filter((c) => c.telephoneIndex === code.telephoneIndex)
      .map((c) => c.creeA);
    const decision = decider(emis, code.creeA, regles);
    if (!decision.permis) {
      return { ok: false, raison: decision.raison, reessayerA: decision.reessayerA };
    }
    this.codes.set(code.id, { ...code });
    return { ok: true };
  }

  async annulerEnvoi(codeId: string): Promise<void> {
    this.codes.delete(codeId);
  }

  async dernierCode(telephoneIndex: string): Promise<CodeEmis | null> {
    let dernier: CodeEmis | null = null;
    for (const c of this.codes.values()) {
      if (c.telephoneIndex === telephoneIndex && (!dernier || c.creeA >= dernier.creeA)) {
        dernier = c;
      }
    }
    return dernier ? { ...dernier } : null; // copie : comme une ligne relue en base
  }

  async consommer(codeId: string, at: Date): Promise<boolean> {
    const c = this.codes.get(codeId);
    if (!c || c.consommeA !== null) return false;
    c.consommeA = at;
    return true;
  }

  async etat(telephoneIndex: string): Promise<EtatLimite> {
    return { ...(this.limites.get(telephoneIndex) ?? ETAT_VIERGE) };
  }

  async noterEchec(telephoneIndex: string, at: Date, regles: ReglesEssais): Promise<EtatLimite> {
    const suivant = appliquerEchec(this.limites.get(telephoneIndex) ?? ETAT_VIERGE, at, regles);
    this.limites.set(telephoneIndex, suivant);
    return { ...suivant };
  }

  async effacerEchecs(telephoneIndex: string): Promise<void> {
    this.limites.delete(telephoneIndex);
  }
}

/* ------------------------------------------------------------------------------------ envoi */

export interface CodeRecu {
  telephone: string;
  code: string;
  texte: string;
  cle: string;
}

/**
 * Boîte de réception simulée : garde les codes « envoyés » pour les tests. Le texte n'est écrit dans
 * les journaux que sur demande (`journaliserTexte`, hors production : comme `SMS_MOCK_LOG_CODES`).
 */
class BoiteDeCodes {
  readonly boite: CodeRecu[] = [];
  private panne: Error | null = null;
  private readonly logger = new Logger(this.constructor.name);

  constructor(private readonly journaliserTexte: boolean) {}

  /** Test : le prochain envoi échoue (jusqu'à `retablir`). */
  tomberEnPanne(erreur: Error): void {
    this.panne = erreur;
  }

  retablir(): void {
    this.panne = null;
  }

  recevoir(demande: DemandeEnvoiCode): void {
    if (this.panne) throw this.panne;
    // Même clé : même message (idempotence de la passerelle).
    if (this.boite.some((m) => m.cle === demande.cle)) return;
    this.boite.push({
      telephone: demande.telephone,
      code: demande.code,
      texte: demande.texte,
      cle: demande.cle,
    });
    if (this.boite.length > 100) this.boite.shift();
    // Comme SMS_MOCK_LOG_CODES : le texte (donc le code) n'est écrit que sur demande, jamais en production.
    if (this.journaliserTexte) {
      this.logger.log(`Message simulé vers ${demande.telephone} : ${demande.texte}`);
    }
  }

  dernier(): CodeRecu | undefined {
    return this.boite[this.boite.length - 1];
  }

  /** Le code du dernier message. */
  dernierCode(): string {
    const m = this.dernier();
    if (!m) throw new Error("Aucun code envoyé");
    return m.code;
  }
}

export class EnvoiCodeSmsMemoire extends EnvoiCodeSms {
  readonly reel = false;
  private readonly corps: BoiteDeCodes;

  constructor(journaliserTexte = false) {
    super();
    this.corps = new BoiteDeCodes(journaliserTexte);
  }

  /** Messages « reçus », du plus ancien au plus récent (les tests peuvent la vider). */
  get boite(): CodeRecu[] {
    return this.corps.boite;
  }

  async envoyer(demande: DemandeEnvoiCode): Promise<void> {
    this.corps.recevoir(demande);
  }

  dernier = (): CodeRecu | undefined => this.corps.dernier();
  dernierCode = (): string => this.corps.dernierCode();
  tomberEnPanne = (erreur: Error = new CanalIndisponible("sms")): void =>
    this.corps.tomberEnPanne(erreur);
  retablir = (): void => this.corps.retablir();
}

export class EnvoiCodeWhatsAppMemoire extends EnvoiCodeWhatsApp {
  readonly reel = false;
  readonly branche = true;
  private readonly corps: BoiteDeCodes;

  constructor(journaliserTexte = false) {
    super();
    this.corps = new BoiteDeCodes(journaliserTexte);
  }

  get boite(): CodeRecu[] {
    return this.corps.boite;
  }

  async envoyer(demande: DemandeEnvoiCode): Promise<void> {
    this.corps.recevoir(demande);
  }

  dernier = (): CodeRecu | undefined => this.corps.dernier();
  dernierCode = (): string => this.corps.dernierCode();
  tomberEnPanne = (erreur: Error = new CanalIndisponible("whatsapp")): void =>
    this.corps.tomberEnPanne(erreur);
  retablir = (): void => this.corps.retablir();
}

/**
 * WhatsApp n'est pas branché (pas de gabarit d'authentification, pas de fournisseur) : toute demande
 * WhatsApp se replie sur le SMS. C'est l'adaptateur par défaut du module.
 */
export class EnvoiCodeWhatsAppAbsent extends EnvoiCodeWhatsApp {
  readonly reel = false;
  readonly branche = false;

  async envoyer(): Promise<void> {
    throw new CanalIndisponible("whatsapp");
  }
}

/* ------------------------------------------------------------------------------------ compte */

export class ComptesVoyageurMemoire extends ComptesVoyageur {
  readonly comptes = new Map<string, CompteVoyageur & { telephone: string }>();

  async trouver(telephone: string): Promise<CompteVoyageur | null> {
    return this.comptes.get(telephone) ?? null;
  }

  async creer(telephone: string): Promise<{ compte: CompteVoyageur; cree: boolean }> {
    const existant = this.comptes.get(telephone);
    if (existant) return { compte: existant, cree: false };
    const compte = { id: randomUUID(), nom: "", eligible: true, telephone };
    this.comptes.set(telephone, compte);
    return { compte, cree: true };
  }

  /** Test : renomme, désactive… */
  modifier(telephone: string, changement: Partial<CompteVoyageur>): void {
    const c = this.comptes.get(telephone);
    if (!c) throw new Error("compte inconnu");
    this.comptes.set(telephone, { ...c, ...changement });
  }
}

export class FichesVoyageurMemoire extends FichesVoyageur {
  readonly durable = false;
  readonly fiches = new Map<string, FicheVoyageur>();

  async ouvrir(personneId: string, at: Date): Promise<FicheVoyageur> {
    let fiche = this.fiches.get(personneId);
    if (!fiche) {
      fiche = {
        personneId,
        inscritA: at,
        langue: "fr",
        pieceVerifiee: false,
        pieceQuatreDerniers: null,
      };
      this.fiches.set(personneId, fiche);
    }
    return { ...fiche };
  }
}

/* ------------------------------------------------------------------------------------ session */

export class EmetteurSessionMemoire extends EmetteurSession {
  private compteur = 0;

  constructor(
    private readonly maintenant: () => Date = () => new Date(),
    private readonly dureeMs = 60 * 60_000,
  ) {
    super();
  }

  async emettre(compte: CompteVoyageur): Promise<SessionEmise> {
    this.compteur += 1;
    return {
      jeton: `jeton-${compte.id}-${this.compteur}`,
      expireA: new Date(this.maintenant().getTime() + this.dureeMs),
    };
  }
}
