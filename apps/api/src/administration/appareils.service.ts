import { randomBytes, randomUUID } from "node:crypto";
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { versIsoDouala } from "../billetterie/temps";
import { VerificateurSignature } from "../modules/signature";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge } from "../socle/horloge";
import { AppareilInvalide } from "../sync/postgres";
import { AppareilsSync, type AppareilSync } from "../sync/ports";
import { plageConvoyeur, plageGuichet, type Plage } from "../sync/regles";
import {
  compagnieDe,
  conflit,
  introuvable,
  invalide,
  lireCommande,
  lireSignature,
  refuse,
} from "./commande";
import type { CommandeAppareil, EnrolementAppareil, GenreAppareil } from "./modeles";
import { AnnuaireAdmin, OrdresAppareils, RegistreAppareils } from "./ports";
import { commandeSigneeSeule, declarerAppareil, effacerAppareil } from "./schemas";
import { genererCode, hacherCode, normaliserCode } from "./secrets-appareil";

export const ACTION_APPAREIL_DECLARER = "appareil.declarer";
export const ACTION_APPAREIL_NOUVEAU_CODE = "appareil.nouveau_code";
export const ACTION_APPAREIL_RETIRER = "appareil.retirer";
export const ACTION_APPAREIL_EFFACER = "appareil.effacer";

/** Un code d'enrôlement se saisit dans les 24 heures qui suivent sa création. */
export const VALIDITE_CODE_MS = 24 * 3_600_000;

export interface AppareilReponse {
  id: string;
  genre: GenreAppareil;
  rang: number | null;
  nbConvoyeurs: number | null;
  plage: Plage | null;
  gareId: string | null;
  libelle: string | null;
  /** Un téléphone est enrôlé et son secret en vigueur. */
  enrole: boolean;
  enroleA: string | null;
  /** Un code d'enrôlement attend d'être saisi, jusqu'à cette date. */
  codeExpireA: string | null;
  retire: boolean;
  derniereSyncA: string | null;
  /** Le dernier ordre émis (effacement) et son accusé. */
  derniereCommande: {
    id: string;
    type: "effacer";
    emiseA: string;
    acquitteeA: string | null;
  } | null;
}

export interface DeclarationReponse {
  appareil: AppareilReponse;
  /** Affiché une seule fois : seule son empreinte est gardée. */
  codeEnrolement: string;
  codeExpireA: string;
}

export interface EffacementReponse {
  commandeId: string;
  appareilId: string;
  emiseA: string;
}

/** Plage de numéros que cet appareil recevra (`null` pour un appareil qui ne vend pas de billets numérotés). */
export function plageDe(
  a: Pick<AppareilSync, "genre" | "rang" | "nbConvoyeurs" | "plage">,
): Plage | null {
  if (a.plage) return a.plage;
  try {
    if (a.genre === "guichet" && a.rang !== null) return plageGuichet(a.rang);
    if (a.genre === "convoyeur" && a.rang !== null && a.nbConvoyeurs !== null) {
      return plageConvoyeur(a.rang, a.nbConvoyeurs);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Appareils de l'agence : déclaration (fiche de synchronisation + code d'enrôlement), nouveau code pour un
 * téléphone de secours, retrait, effacement à distance. Toutes les écritures sont signées par le PIN du compte
 * et tracées au journal d'audit. Un superviseur n'agit que sur les appareils de sa gare.
 */
@Injectable()
export class AppareilsService {
  constructor(
    private readonly annuaire: AnnuaireAdmin,
    private readonly registre: RegistreAppareils,
    private readonly ordres: OrdresAppareils,
    private readonly sync: AppareilsSync,
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /* ------------------------------------------------------------------ lecture */

  async lister(u: Utilisateur): Promise<AppareilReponse[]> {
    const compagnieId = compagnieDe(u);
    const fiches = await this.registre.lister({
      compagnieId,
      ...(u.role === "superviseur" && u.gareId ? { gareId: u.gareId } : {}),
    });
    return Promise.all(fiches.map((f) => this.vue(f)));
  }

  /* ------------------------------------------------------------------ déclaration */

  async declarer(u: Utilisateur, corps: unknown): Promise<DeclarationReponse> {
    const signature = lireSignature(corps);
    const cmd = lireCommande(declarerAppareil, corps);
    await this.verifier(u, signature, ACTION_APPAREIL_DECLARER, null);
    const compagnieId = compagnieDe(u);
    const gare = await this.annuaire.gare(cmd.gareId);
    if (!gare || gare.compagnieId !== compagnieId) {
      throw introuvable("GARE_INCONNUE", `Gare « ${cmd.gareId} » inconnue dans votre agence`);
    }
    if (u.role === "superviseur" && gare.id !== u.gareId) {
      throw refuse("Vous ne déclarez des appareils que pour votre gare");
    }
    const genre = cmd.genre;
    const rang = cmd.rang ?? null;
    const nbConvoyeurs = cmd.nbConvoyeurs ?? null;
    this.controlerNumerotation(genre, rang, nbConvoyeurs);

    const maintenant = this.horloge.maintenant();
    const code = genererCode();
    const expire = versIsoDouala(new Date(maintenant.getTime() + VALIDITE_CODE_MS));
    const appareilId = `appareil-${gare.code.toLowerCase()}-${genre}${rang ?? ""}-${randomBytes(4).toString("hex")}`;

    await this.registre.exclusif(compagnieId, async () => {
      await this.controlerRang(compagnieId, gare.id, genre, rang, nbConvoyeurs);
      try {
        await this.sync.declarer({
          id: appareilId,
          genre,
          rang,
          nbConvoyeurs,
          gareId: gare.id,
          compagnieId,
        });
      } catch (e) {
        if (e instanceof AppareilInvalide) throw invalide("APPAREIL_INVALIDE", e.message);
        throw e;
      }
      await this.registre.declarer({
        appareilId,
        compagnieId,
        gareId: gare.id,
        libelle: cmd.libelle?.trim() || null,
        codeHache: hacherCode(this.config.cleIndexAveugle, normaliserCode(code)!),
        codeExpireA: expire,
        creePar: u.id,
        creeA: versIsoDouala(maintenant),
      });
    });
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_APPAREIL_DECLARER,
      resultat: "succes",
      cible: { type: "appareil", id: appareilId },
      details: { genre, rang, gare: gare.code },
    });
    const fiche = (await this.registre.trouver(appareilId))!;
    return { appareil: await this.vue(fiche), codeEnrolement: code, codeExpireA: expire };
  }

  /**
   * Nouveau code d'enrôlement pour un appareil déjà déclaré (téléphone remplacé ou code perdu). Quand le nouveau
   * téléphone s'enrôle, l'ancien secret est remplacé : l'ancien téléphone ne lit plus d'ordres.
   */
  async nouveauCode(
    u: Utilisateur,
    appareilId: string,
    corps: unknown,
  ): Promise<DeclarationReponse> {
    const signature = lireSignature(corps);
    lireCommande(commandeSigneeSeule, corps);
    await this.verifier(u, signature, ACTION_APPAREIL_NOUVEAU_CODE, appareilId);
    const fiche = await this.fiche(u, appareilId);
    const sync = await this.sync.trouver(appareilId);
    if (sync?.retire) {
      throw conflit(
        "APPAREIL_RETIRE",
        "Cet appareil est retiré du service : déclarez-en un nouveau plutôt que de le réactiver",
      );
    }
    const maintenant = this.horloge.maintenant();
    const code = genererCode();
    const expire = versIsoDouala(new Date(maintenant.getTime() + VALIDITE_CODE_MS));
    await this.registre.nouveauCode(
      appareilId,
      hacherCode(this.config.cleIndexAveugle, normaliserCode(code)!),
      expire,
    );
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_APPAREIL_NOUVEAU_CODE,
      resultat: "succes",
      cible: { type: "appareil", id: appareilId },
      details: { gareId: fiche.gareId },
    });
    return {
      appareil: await this.vue((await this.registre.trouver(appareilId))!),
      codeEnrolement: code,
      codeExpireA: expire,
    };
  }

  /** Retire l'appareil du service : plus de code, plus de secret, et la synchronisation le refuse. */
  async retirer(u: Utilisateur, appareilId: string, corps: unknown): Promise<AppareilReponse> {
    const signature = lireSignature(corps);
    lireCommande(commandeSigneeSeule, corps);
    await this.verifier(u, signature, ACTION_APPAREIL_RETIRER, appareilId);
    await this.fiche(u, appareilId);
    await this.registre.retirer(appareilId);
    await this.sync.mettreAJour(appareilId, { retire: true });
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_APPAREIL_RETIRER,
      resultat: "succes",
      cible: { type: "appareil", id: appareilId },
    });
    return this.vue((await this.registre.trouver(appareilId))!);
  }

  /**
   * Émet l'ordre « effacer » : l'appareil le lit à sa prochaine consultation (au plus 30 secondes plus tard, application
   * ouverte et en ligne). Un seul ordre attend à la fois par appareil.
   */
  async effacer(u: Utilisateur, appareilId: string, corps: unknown): Promise<EffacementReponse> {
    const signature = lireSignature(corps);
    const cmd = lireCommande(effacerAppareil, corps);
    await this.verifier(u, signature, ACTION_APPAREIL_EFFACER, appareilId);
    const fiche = await this.fiche(u, appareilId);
    if (!fiche.actif) {
      throw conflit(
        "APPAREIL_NON_ENROLE",
        "Cet appareil n'est pas enrôlé : il ne peut pas recevoir d'ordre (retirez-le du service)",
      );
    }
    const ordre: CommandeAppareil = {
      id: randomUUID(),
      appareilId,
      type: "effacer",
      emiseA: versIsoDouala(this.horloge.maintenant()),
      emisePar: u.id,
      motif: cmd.motif?.trim() || null,
      acquitteeA: null,
    };
    const emis = await this.ordres.emettre(ordre);
    if (emis === "deja_en_attente") {
      throw conflit("EFFACEMENT_EN_COURS", "Un effacement est déjà en attente de cet appareil");
    }
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_APPAREIL_EFFACER,
      resultat: "succes",
      cible: { type: "appareil", id: appareilId },
      details: { commandeId: emis.id, motif: emis.motif },
    });
    return { commandeId: emis.id, appareilId, emiseA: emis.emiseA };
  }

  /* ------------------------------------------------------------------ internes */

  /** La fiche d'un appareil de la compagnie (et de la gare du superviseur), ou 404. */
  private async fiche(u: Utilisateur, appareilId: string): Promise<EnrolementAppareil> {
    const compagnieId = compagnieDe(u);
    const fiche = await this.registre.trouver(appareilId);
    if (!fiche || fiche.compagnieId !== compagnieId) {
      throw introuvable("APPAREIL_INCONNU", `Appareil « ${appareilId} » inconnu`);
    }
    if (u.role === "superviseur" && fiche.gareId !== u.gareId) {
      throw refuse("Cet appareil n'est pas rattaché à votre gare");
    }
    return fiche;
  }

  private async vue(f: EnrolementAppareil): Promise<AppareilReponse> {
    const [sync, dernier] = await Promise.all([
      this.sync.trouver(f.appareilId),
      this.ordres.dernier(f.appareilId),
    ]);
    return {
      id: f.appareilId,
      genre: sync?.genre ?? "autre",
      rang: sync?.rang ?? null,
      nbConvoyeurs: sync?.nbConvoyeurs ?? null,
      plage: sync ? plageDe(sync) : null,
      gareId: f.gareId,
      libelle: f.libelle,
      enrole: f.actif,
      enroleA: f.enroleA,
      codeExpireA: f.codeExpireA,
      retire: sync?.retire ?? false,
      derniereSyncA: sync?.derniereSyncA ?? null,
      derniereCommande: dernier
        ? {
            id: dernier.id,
            type: dernier.type,
            emiseA: dernier.emiseA,
            acquitteeA: dernier.acquitteeA,
          }
        : null,
    };
  }

  /** Un guichet a un rang de 1 à 3 (plages 0001–2999) ; un convoyeur un rang dans le nombre de convoyeurs. */
  private controlerNumerotation(
    genre: GenreAppareil,
    rang: number | null,
    nb: number | null,
  ): void {
    if (genre === "autre") {
      if (rang !== null || nb !== null) {
        throw invalide(
          "APPAREIL_INVALIDE",
          "Un appareil « autre » n'a ni rang ni nombre de convoyeurs",
        );
      }
      return;
    }
    if (rang === null) throw invalide("RANG_REQUIS", "Le rang de l'appareil est requis");
    if (genre === "guichet") {
      if (nb !== null)
        throw invalide("APPAREIL_INVALIDE", "Un guichet n'a pas de nombre de convoyeurs");
      try {
        plageGuichet(rang);
      } catch {
        throw invalide("RANG_INVALIDE", "Un guichet est le numéro 1, 2 ou 3 de sa gare");
      }
      return;
    }
    if (nb === null)
      throw invalide("NB_CONVOYEURS_REQUIS", "Le nombre de convoyeurs de la gare est requis");
    try {
      plageConvoyeur(rang, nb);
    } catch {
      throw invalide(
        "RANG_INVALIDE",
        "Le rang du convoyeur est compris entre 1 et le nombre de convoyeurs",
      );
    }
  }

  /**
   * Deux appareils en service ne partagent ni rang de guichet ni rang de convoyeur dans une gare : ils auraient la
   * même plage de numéros de billets. Les convoyeurs d'une gare se partagent 3001–3999 : le nombre doit être le même.
   */
  private async controlerRang(
    compagnieId: string,
    gareId: string,
    genre: GenreAppareil,
    rang: number | null,
    nb: number | null,
  ): Promise<void> {
    if (genre === "autre") return;
    const fiches = await this.registre.lister({ compagnieId, gareId });
    for (const f of fiches) {
      const s = await this.sync.trouver(f.appareilId);
      if (!s || s.retire || s.genre !== genre) continue;
      if (s.rang === rang) {
        throw conflit(
          "RANG_PRIS",
          genre === "guichet"
            ? `Le guichet ${rang} de cette gare a déjà un appareil : retirez-le d'abord`
            : `Le convoyeur ${rang} de cette gare a déjà un appareil : retirez-le d'abord`,
        );
      }
      if (genre === "convoyeur" && s.nbConvoyeurs !== nb) {
        throw conflit(
          "NB_CONVOYEURS_DIFFERENT",
          `Les convoyeurs de cette gare sont ${s.nbConvoyeurs ?? "?"} : le nombre doit être le même pour partager 3001–3999`,
        );
      }
    }
  }

  private async verifier(
    u: Utilisateur,
    signature: ReturnType<typeof lireSignature>,
    action: string,
    cibleId: string | null,
  ): Promise<void> {
    try {
      await this.signature.verifier(u, signature);
    } catch (e) {
      if (e instanceof HttpException) {
        await this.audit.enregistrer({
          acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
          action,
          resultat: "refus",
          cible: cibleId ? { type: "appareil", id: cibleId } : null,
          details: { statut: e.getStatus(), methode: signature.methode },
        });
      }
      throw e;
    }
  }
}
