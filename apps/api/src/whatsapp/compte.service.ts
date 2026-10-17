import { Inject, Injectable, Logger } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { CONFIG_WHATSAPP, type ConfigWhatsApp } from "./config";
import {
  FournisseurWhatsApp,
  type EtatCompteFournisseur,
  type StatutGabaritCompte,
} from "./fournisseur";
import { GABARITS, TYPES_GABARIT, type TypeGabarit } from "./gabarits";
import { JournalWhatsApp } from "./journal";
import { PasserelleWhatsAppService, type EtatPasserelle } from "./passerelle.service";
import { SourceRapportSoir } from "./ports";

/** L'état du compte chez WhatsApp change rarement : on ne le relit qu'une fois toutes les 5 minutes. */
const DUREE_CACHE_MS = 5 * 60_000;

/** Médiane (moyenne des deux valeurs centrales si le nombre est pair) ; `null` si vide. */
export function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 === 1 ? t[m]! : Math.round((t[m - 1]! + t[m]!) / 2);
}

/**
 * « répond en 2 min » : le délai médian arrondi à la minute (1 min au moins), en heures au-delà de
 * 59 minutes. `null` quand le compte n'a pas encore répondu à personne.
 */
export function libelleDelaiReponse(ms: number | null): string | null {
  if (ms === null) return null;
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `répond en ${minutes} min`;
  const heures = Math.round(minutes / 60);
  return heures < 24 ? `répond en ${heures} h` : "répond en plus d'un jour";
}

export interface VueCompteWhatsApp {
  /** « AfriMove · Alpha Voyages ». */
  nom: string;
  /** « compte vérifié · répond en 2 min » : la ligne sous le nom, dans l'en-tête de la conversation. */
  detail: string;
  /** Nom d'affichage vérifié par WhatsApp ; `null` si l'état du compte n'a pas pu être lu. */
  verifie: boolean | null;
  /** Délai médian de réponse aux messages reçus, en ms ; `null` sans réponse mesurée. */
  delaiReponseMedianMs: number | null;
  reponsesMesurees: number;
  qualite: EtatCompteFournisseur["qualite"];
  mode: EtatPasserelle["mode"];
}

export interface GabaritSuivi {
  type: TypeGabarit;
  nom: string;
  langue: string;
  categorie: string;
  /** Statut chez WhatsApp ; `absent` : pas soumis ; `inconnu` : WhatsApp n'a pas répondu. */
  statut: StatutGabaritCompte | "absent" | "inconnu";
  /** Texte à soumettre à WhatsApp, mot pour mot. */
  corps: string;
  bouton: { libelle: string; urlModele: string } | null;
}

export interface EtatDetailleWhatsApp extends VueCompteWhatsApp {
  numeroAffiche: string | null;
  gabarits: GabaritSuivi[];
  /** Gabarits que WhatsApp n'a pas approuvés : leur envoi échouera (puis repli par SMS). */
  gabaritsNonApprouves: string[];
  passerelle: EtatPasserelle;
}

/**
 * Compte WhatsApp Business vu par l'application : vérifié ou non, délai de réponse (« répond en
 * 2 min »), gabarits approuvés, mode de la passerelle. Le délai est **mesuré** (du message reçu à
 * notre réponse en texte libre), pas déclaré.
 */
@Injectable()
export class CompteWhatsAppService {
  private readonly logger = new Logger("WhatsAppCompte");
  private cache: { at: number; etat: EtatCompteFournisseur } | null = null;

  constructor(
    private readonly fournisseur: FournisseurWhatsApp,
    private readonly journal: JournalWhatsApp,
    private readonly passerelle: PasserelleWhatsAppService,
    private readonly source: SourceRapportSoir,
    private readonly horloge: Horloge,
    @Inject(CONFIG_WHATSAPP) private readonly config: ConfigWhatsApp,
  ) {}

  /** L'état chez WhatsApp ; l'ancienne valeur si WhatsApp ne répond pas ; `null` sans valeur connue. */
  private async compteFournisseur(): Promise<EtatCompteFournisseur | null> {
    const maintenant = this.horloge.maintenant().getTime();
    if (this.cache && maintenant - this.cache.at < DUREE_CACHE_MS) return this.cache.etat;
    try {
      const etat = await this.fournisseur.etatCompte();
      this.cache = { at: maintenant, etat };
      return etat;
    } catch (e) {
      this.logger.warn(
        `État du compte illisible (${e instanceof Error ? e.name : "erreur"}) : ` +
          (this.cache ? "dernière valeur connue" : "aucune valeur connue"),
      );
      return this.cache?.etat ?? null;
    }
  }

  private async delais(): Promise<number[]> {
    const depuis = new Date(
      this.horloge.maintenant().getTime() - this.config.fenetreDelaiReponseMs,
    );
    return this.journal.delaisReponse(depuis);
  }

  /** Ce que lit l'écran du rapport : nom, « compte vérifié · répond en 2 min ». */
  async vue(compagnieId: string | null): Promise<VueCompteWhatsApp> {
    const [compte, delais, passerelle] = await Promise.all([
      this.compteFournisseur(),
      this.delais(),
      this.passerelle.etat(),
    ]);
    const delaiMs = mediane(delais);
    const compagnie = compagnieId ? await this.source.compagnie(compagnieId) : null;
    const verifie = compte?.verifie ?? null;
    const parties = [
      verifie === true ? "compte vérifié" : verifie === false ? "compte non vérifié" : null,
      libelleDelaiReponse(delaiMs),
    ].filter((p): p is string => p !== null);
    return {
      nom: compagnie ? `AfriMove · ${compagnie.nom}` : "AfriMove",
      detail: parties.length > 0 ? parties.join(" · ") : "compte WhatsApp",
      verifie,
      delaiReponseMedianMs: delaiMs,
      reponsesMesurees: delais.length,
      qualite: compte?.qualite ?? "inconnue",
      mode: passerelle.mode,
    };
  }

  /** Vue d'administration : gabarits soumis et approuvés, état de la passerelle. */
  async detail(compagnieId: string | null): Promise<EtatDetailleWhatsApp> {
    const [vue, compte, passerelle] = await Promise.all([
      this.vue(compagnieId),
      this.compteFournisseur(),
      this.passerelle.etat(),
    ]);
    const gabarits: GabaritSuivi[] = TYPES_GABARIT.map((type) => {
      const g = GABARITS[type];
      const chez = compte?.gabarits.find(
        (x) => x.nom === g.nom && x.langue.startsWith(this.config.langue.slice(0, 2)),
      );
      return {
        type,
        nom: g.nom,
        langue: this.config.langue,
        categorie: g.categorie,
        statut: chez?.statut ?? (compte ? "absent" : "inconnu"),
        corps: g.corps,
        bouton: g.bouton,
      };
    });
    return {
      ...vue,
      numeroAffiche: compte?.numeroAffiche ?? null,
      gabarits,
      gabaritsNonApprouves: gabarits
        .filter((g) => g.statut !== "approuve" && g.statut !== "inconnu")
        .map((g) => g.nom),
      passerelle,
    };
  }
}
