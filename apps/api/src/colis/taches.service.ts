import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { ColisService, SYSTEME } from "./colis.service";
import { FichiersPhotos, PhotosColis } from "./ports";
import { GARDE_COLIS_JOURS } from "./regles";
import { ajouterJours } from "./temps";

const SYSTEME_ACTEUR = { id: SYSTEME, role: "afrimove", compagnieId: null, gareId: null } as const;

/** Une fois par quart d'heure : suffisant pour des délais de 7 et 90 jours. */
const PERIODE_MS = 15 * 60_000;

/**
 * Tâches de fond du module colis. Chacune est idempotente et peut être lancée à la main (tests,
 * administration) ou par une planification externe ; en dehors des tests, le module les lance aussi
 * toutes les 15 minutes dans le processus (sans effet de bord si plusieurs instances tournent : les
 * écritures sont atomiques et les actions refusées par la machine d'états sont ignorées).
 */
@Injectable()
export class TachesColis implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("TachesColis");
  private minuteur: NodeJS.Timeout | null = null;

  constructor(
    private readonly colis: ColisService,
    private readonly photos: PhotosColis,
    private readonly fichiers: FichiersPhotos,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.env === "test") return;
    this.minuteur = setInterval(() => {
      this.toutExecuter().catch((e: unknown) =>
        this.logger.error(`Tâches des colis en échec (${(e as Error).name})`),
      );
    }, PERIODE_MS);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  /** Supprime les photos prises il y a 90 jours ou plus (fichier d'abord, puis la trace). */
  async purgerPhotos(): Promise<number> {
    const maintenant = this.colis.maintenant();
    let supprimees = 0;
    for (const photo of await this.photos.expirees(maintenant)) {
      try {
        await this.fichiers.supprimer(photo.ref);
        await this.photos.marquerSupprimee(photo.ref, maintenant);
        supprimees += 1;
      } catch (e) {
        // Elle sera reprise au prochain passage.
        this.logger.warn(`Photo non supprimée (${(e as Error).name})`);
      }
    }
    return supprimees;
  }

  /** Passe en « non retiré » les colis disponibles ou en relais depuis 7 jours. */
  async marquerNonRetires(): Promise<number> {
    const limite = ajouterJours(this.colis.horloge.maintenant(), -GARDE_COLIS_JOURS);
    const colis = await this.colis.repo.lister({
      etats: ["disponible", "en_relais"],
      disponibleAvant: limite,
    });
    let marques = 0;
    for (const c of colis) {
      try {
        await this.colis.executer({
          acteur: SYSTEME_ACTEUR,
          colis: { id: c.id },
          action: "marquer_non_retire",
          motif: "garde de 7 jours écoulée",
        });
        marques += 1;
      } catch (e) {
        this.logger.warn(`Colis ${c.numero} non marqué « non retiré » (${(e as Error).name})`);
      }
    }
    return marques;
  }

  /** Souscrit les assurances que l'assureur partenaire n'avait pas pu enregistrer. */
  async rejouerAssurances(): Promise<number> {
    let souscrites = 0;
    for (const c of await this.colis.repo.lister({ assuranceEnAttente: true })) {
      if (c.paiement?.etat !== "paye") continue;
      const apres = await this.colis.souscrireAssurance(c);
      if (apres.assurance.police !== null) souscrites += 1;
    }
    return souscrites;
  }

  /** Renvoie aux destinataires les codes qui n'avaient pas pu partir (SMS en panne). */
  async renvoyerCodes(): Promise<number> {
    let envoyes = 0;
    for (const c of await this.colis.repo.lister({ codeNonEnvoye: true })) {
      if (["remis", "livre", "retourne"].includes(c.etat)) continue;
      if (await this.colis.envoyerCodeAuDestinataire(c, "sms")) envoyes += 1;
    }
    return envoyes;
  }

  async toutExecuter(): Promise<{
    photosSupprimees: number;
    colisNonRetires: number;
    assurancesSouscrites: number;
    codesRenvoyes: number;
  }> {
    return {
      photosSupprimees: await this.purgerPhotos(),
      colisNonRetires: await this.marquerNonRetires(),
      assurancesSouscrites: await this.rejouerAssurances(),
      codesRenvoyes: await this.renvoyerCodes(),
    };
  }
}
