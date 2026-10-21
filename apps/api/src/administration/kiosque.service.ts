import { Inject, Injectable } from "@nestjs/common";
import { versIsoDouala } from "../billetterie/temps";
import { AuditService } from "../socle/audit/audit.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge } from "../socle/horloge";
import { AppareilsSync } from "../sync/ports";
import { plageDe } from "./appareils.service";
import { erreurApi, introuvable, lireCommande } from "./commande";
import { AnnuaireAdmin, OrdresAppareils, RegistreAppareils } from "./ports";
import { enrolerAppareil, rapportEffacement } from "./schemas";
import {
  egaux,
  genererSecretAppareil,
  hacherCode,
  hacherSecret,
  jetonBearer,
  normaliserCode,
  secretAcquittement,
} from "./secrets-appareil";

export const ACTION_APPAREIL_ENROLER = "appareil.enroler";
export const ACTION_APPAREIL_ACQUITTER = "appareil.acquitter";

export interface EnrolementReponse {
  appareilId: string;
  /** Le secret de l'appareil, donné une seule fois : l'appareil le garde et le présente en `Authorization: Bearer`. */
  secret: string;
  compagnieId: string;
  gareId: string | null;
  libelle: string | null;
  /** Code agence de 3 lettres (ALP, DEM…), tel que le client le garde dans son identité d'appareil. */
  agence: string | null;
  /** Code gare de 3 lettres (DLA, YDE…). */
  gare: string | null;
  genre: "guichet" | "convoyeur" | "autre";
  rang: number | null;
  /** Plage de numéros que l'appareil reçoit, `null` s'il ne vend pas de billets numérotés. */
  plage: { debut: number; fin: number } | null;
}

/** `CommandeAppareil` du kiosque (`apps/web/src/kiosque/canal.ts`). */
export interface OrdreReponse {
  id: string;
  type: "effacer";
  emiseA: string;
  secretAcquittement: string;
}

/**
 * Côté appareil : enrôlement par code, lecture des ordres, accusé de réception de l'effacement à distance.
 *
 * Ces routes sont publiques (aucun compte n'est connecté sur un téléphone effacé) : chacune prouve l'appareil
 * par un secret qui lui est propre. Le secret de l'appareil (donné à l'enrôlement) ouvre la lecture des ordres ;
 * le secret d'acquittement (donné avec un ordre, lié à lui seul) ouvre son accusé, seule preuve que l'appareil
 * puisse encore présenter une fois ses données effacées.
 */
@Injectable()
export class KiosqueService {
  constructor(
    private readonly annuaire: AnnuaireAdmin,
    private readonly registre: RegistreAppareils,
    private readonly ordres: OrdresAppareils,
    private readonly sync: AppareilsSync,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Échange le code d'enrôlement contre le secret de l'appareil. Un code ne sert qu'une fois. */
  async enroler(corps: unknown): Promise<EnrolementReponse> {
    const { code } = lireCommande(enrolerAppareil, corps);
    const normalise = normaliserCode(code);
    if (normalise === null) {
      throw erreurApi(404, "CODE_INCONNU", "Ce code d'enrôlement n'existe pas");
    }
    const secret = genererSecretAppareil();
    const maintenant = this.horloge.maintenant();
    const r = await this.registre.enroler(
      hacherCode(this.config.cleIndexAveugle, normalise),
      hacherSecret(secret),
      versIsoDouala(maintenant),
    );
    if (!r.ok) {
      await this.audit.enregistrer({
        acteur: null,
        action: ACTION_APPAREIL_ENROLER,
        resultat: "refus",
        details: { raison: r.raison },
      });
      if (r.raison === "expire") {
        throw erreurApi(
          410,
          "CODE_EXPIRE",
          "Ce code d'enrôlement a expiré : demandez-en un nouveau",
        );
      }
      throw erreurApi(404, "CODE_INCONNU", "Ce code d'enrôlement n'existe pas ou a déjà servi");
    }
    const e = r.enrolement;
    // Un téléphone de secours qui s'enrôle sur un appareil déjà connu ne change pas sa fiche de synchronisation.
    await this.audit.enregistrer({
      acteur: null,
      action: ACTION_APPAREIL_ENROLER,
      resultat: "succes",
      cible: { type: "appareil", id: e.appareilId },
      details: { compagnieId: e.compagnieId, gareId: e.gareId },
    });
    const [compagnie, gare, fiche] = await Promise.all([
      this.annuaire.compagnie(e.compagnieId),
      e.gareId ? this.annuaire.gare(e.gareId) : Promise.resolve(null),
      this.sync.trouver(e.appareilId),
    ]);
    return {
      appareilId: e.appareilId,
      secret,
      compagnieId: e.compagnieId,
      gareId: e.gareId,
      libelle: e.libelle,
      agence: compagnie?.code ?? null,
      gare: gare?.code ?? null,
      genre: fiche?.genre ?? "autre",
      rang: fiche?.rang ?? null,
      plage: fiche ? plageDe(fiche) : null,
    };
  }

  /**
   * Le prochain ordre en attente de cet appareil, ou `null`. L'appareil prouve son identité par son secret ;
   * un appareil retiré (ou un secret remplacé par celui d'un téléphone de secours) reçoit 401.
   */
  async prochaineCommande(
    appareilId: string,
    authorization: string | string[] | undefined,
  ): Promise<{ commande: OrdreReponse | null }> {
    await this.authentifier(appareilId, authorization);
    const ordre = await this.ordres.enAttente(appareilId);
    if (!ordre) return { commande: null };
    return {
      commande: {
        id: ordre.id,
        type: ordre.type,
        emiseA: ordre.emiseA,
        secretAcquittement: secretAcquittement(this.config.cleIndexAveugle, appareilId, ordre.id),
      },
    };
  }

  /**
   * Accusé de réception de l'effacement. Le secret d'acquittement de l'ordre fait foi. L'accusé ne s'écrit qu'une
   * fois : un second répond 409 (le client l'accepte). Après un accusé, le secret de l'appareil est révoqué et sa
   * synchronisation refusée : un téléphone effacé n'est pas rendu à son usage sans nouvelle déclaration.
   */
  async acquitter(
    appareilId: string,
    commandeId: string,
    authorization: string | string[] | undefined,
    corps: unknown,
  ): Promise<{ enregistre: true }> {
    const fourni = jetonBearer(authorization);
    const ordre = await this.ordres.trouver(commandeId);
    if (!ordre || ordre.appareilId !== appareilId) {
      throw introuvable("COMMANDE_INCONNUE", "Cet ordre n'existe pas");
    }
    const attendu = secretAcquittement(this.config.cleIndexAveugle, appareilId, commandeId);
    if (fourni === null || !egaux(fourni, attendu)) {
      await this.audit.enregistrer({
        acteur: null,
        action: ACTION_APPAREIL_ACQUITTER,
        resultat: "refus",
        cible: { type: "appareil", id: appareilId },
        details: { commandeId, raison: "secret" },
      });
      throw erreurApi(401, "SECRET_ACQUITTEMENT_INVALIDE", "Secret d'acquittement invalide");
    }
    const rapport = lireCommande(rapportEffacement, corps);
    const resultat = await this.ordres.acquitter(
      commandeId,
      versIsoDouala(this.horloge.maintenant()),
      rapport,
    );
    if (resultat === "inconnue") throw introuvable("COMMANDE_INCONNUE", "Cet ordre n'existe pas");
    if (resultat === "deja_acquittee") {
      throw erreurApi(409, "DEJA_ACQUITTEE", "Cet ordre est déjà acquitté");
    }
    await this.registre.retirer(appareilId);
    await this.sync.mettreAJour(appareilId, { retire: true });
    await this.audit.enregistrer({
      acteur: null,
      action: ACTION_APPAREIL_ACQUITTER,
      resultat: rapport.complet ? "succes" : "echec",
      cible: { type: "appareil", id: appareilId },
      details: {
        commandeId,
        complet: rapport.complet,
        etapesEnEchec: rapport.etapes.filter((e) => !e.ok).map((e) => e.nom),
      },
    });
    return { enregistre: true };
  }

  /** Le secret de l'appareil est-il celui qui est en vigueur ? Sinon 401, sans dire si l'appareil existe. */
  private async authentifier(
    appareilId: string,
    authorization: string | string[] | undefined,
  ): Promise<void> {
    const secret = jetonBearer(authorization);
    if (secret === null || !(await this.registre.secretValide(appareilId, hacherSecret(secret)))) {
      throw erreurApi(401, "APPAREIL_NON_AUTHENTIFIE", "Appareil non authentifié");
    }
  }
}
