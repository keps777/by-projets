import { Inject, Injectable } from "@nestjs/common";
import { Refus } from "../billetterie/erreurs";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AgregateurAbsent } from "./agregateur-absent";
import { CONFIG_PAIEMENTS, type ConfigPaiements } from "./config";
import { GardeAgregateur } from "./garde-agregateur";
import type { RaisonModeDegrade } from "./modeles";
import { ReglagesPaiements } from "./ports";
import { TEXTES } from "./regles";

export interface EtatModeDegrade {
  degrade: boolean;
  raison: RaisonModeDegrade | null;
  /** Mot de la personne d'AfriMove qui a activé le mode (réglage manuel). */
  motif: string | null;
  /** Ce que l'écran dit au voyageur. */
  consigne: string | null;
  /** Depuis quand (réglage manuel seulement). */
  depuis: Date | null;
}

/**
 * Mode dégradé : « réservation puis paiement au guichet ou MoMo marchand de l'agence ».
 *
 * Il est actif quand :
 *  - AfriMove l'a activé par réglage (`PUT /paiements/mode-degrade`, ou `PAIEMENTS_MODE_DEGRADE=true`
 *    tant qu'aucun réglage n'a été enregistré) ;
 *  - aucun agrégateur n'est configuré (compte pas encore ouvert) ;
 *  - le disjoncteur de l'agrégateur est ouvert (panne constatée), jusqu'à ce qu'un appel d'essai réussisse.
 */
@Injectable()
export class ModeDegradeService {
  constructor(
    private readonly reglages: ReglagesPaiements,
    private readonly garde: GardeAgregateur,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
  ) {}

  async etat(): Promise<EtatModeDegrade> {
    const reglage = await this.reglages.lire();
    const manuel = reglage ? reglage.degrade : this.config.modeDegradeInitial;
    let raison: RaisonModeDegrade | null = null;
    if (this.garde.agregateur instanceof AgregateurAbsent) raison = "agregateur_absent";
    else if (manuel) raison = "reglage";
    else if (this.garde.disjoncteur.etat() === "ouvert") raison = "agregateur_indisponible";
    return {
      degrade: raison !== null,
      raison,
      motif: manuel ? (reglage?.motif ?? null) : null,
      consigne: raison !== null ? TEXTES.modeDegrade : null,
      depuis: manuel ? (reglage?.at ?? null) : null,
    };
  }

  /** Refuse (503 `MODE_DEGRADE`) si le paiement en ligne est indisponible. */
  async exigerEnLigne(): Promise<void> {
    const etat = await this.etat();
    if (etat.degrade) throw this.refus(etat.raison);
  }

  /** Refuse (409 `MODE_NORMAL`) si le paiement en ligne fonctionne : l'encaissement à la gare est réservé au mode dégradé. */
  async exigerDegrade(): Promise<EtatModeDegrade> {
    const etat = await this.etat();
    if (!etat.degrade) {
      throw new Refus(
        409,
        "MODE_NORMAL",
        "Le paiement en ligne fonctionne : le voyageur doit payer en ligne",
      );
    }
    return etat;
  }

  refus(raison: RaisonModeDegrade | null): Refus {
    return new Refus(503, "MODE_DEGRADE", TEXTES.modeDegrade, { raison });
  }

  /** Active ou désactive le mode dégradé (AfriMove). Journalisé. */
  async definir(
    acteur: Utilisateur,
    actif: boolean,
    motif: string | null,
  ): Promise<EtatModeDegrade> {
    const at = this.horloge.maintenant();
    await this.reglages.definir({ degrade: actif, motif, parId: acteur.id, at });
    await this.audit.enregistrer({
      acteur: { id: acteur.id, role: acteur.role, compagnieId: acteur.compagnieId },
      action: "paiement.mode_degrade",
      resultat: "succes",
      details: { actif, motif },
      at,
    });
    return this.etat();
  }
}
