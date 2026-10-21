import { Injectable } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { Catalogue } from "../billetterie/ports";
import { conflit, introuvable } from "../caisse/erreurs";
import { IdempotenceService } from "../caisse/journal/idempotence.service";
import { JournalSigneService } from "../caisse/journal/journal.service";
import { aammjjDouala, MS_PAR_HEURE, MS_PAR_MINUTE, versIsoDouala } from "../caisse/temps";
import {
  AlertesSync,
  AppareilsSync,
  AttributionPlages,
  ControleNumeros,
  type AppareilSync,
  type Octroi,
  type TypeAlerte,
} from "../sync";
import { DEBLOCAGE_TEMPORAIRE_HEURES, LIMITE_HORS_LIGNE_HEURES } from "../sync/regles";
import { gareDe } from "./commun";
import { lireAppareilDebloque, type OptionDeblocage } from "./evenements";
import { SourceGare } from "./ports";
import { ValidationSuperviseurService } from "./validation.service";

export type EtatAppareil = "bloque" | "en_ligne" | "debloque_temporairement";

/** Les alertes de synchronisation qui expliquent un téléphone en panne ou mal réglé, avec leur constat. */
const CONSTAT_ALERTE: Readonly<Partial<Record<TypeAlerte, string>>> = {
  file_avec_trou: "File d'envoi avec un trou : des ventes manquent sur le serveur",
  file_reinitialisee: "File d'envoi repartie de zéro : l'application a été réinitialisée",
  trou_dans_la_plage: "Numéros manquants dans la plage du guichet",
  numero_en_double: "Un numéro de billet a été utilisé deux fois",
  numero_hors_plage: "Un numéro de billet est hors de la plage du guichet",
  horloge_en_avance: "L'horloge du téléphone est en avance",
};

const PREFIXE_CODE = { guichet: "GU", convoyeur: "CV", autre: "AP" } as const;

const heureCourte = (iso: string): string => /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? iso;

/** « 12 h 40 » : la durée hors ligne, telle que les diagnostics la disent. */
const dureeLisible = (minutes: number): string =>
  `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

/**
 * Les appareils bloqués vus par le superviseur de la gare (planche « SuperviseurDebloquer ») : la règle des
 * 12 h hors ligne, ce qui attend sur le téléphone, le diagnostic, et les trois façons de le débloquer
 * (synchroniser via le téléphone du superviseur, 4 h de plus, téléphone de secours). Le déblocage exige le
 * PIN du superviseur, laisse une entrée au journal signé et pose l'octroi que l'appareil lit à sa prochaine
 * synchronisation (même octroi que celui posé par `appareil.debloque` rejoué par `/sync`).
 *
 * Provisoire : le serveur ne voit pas la file locale de l'appareil. « En attente » (ventes, colis, cash)
 * vaut donc 0 et seuls les trous de la plage sont connus (numéros reçus du jour).
 */
@Injectable()
export class AppareilsService {
  constructor(
    private readonly appareils: AppareilsSync,
    private readonly attribution: AttributionPlages,
    private readonly numeros: ControleNumeros,
    private readonly alertes: AlertesSync,
    private readonly catalogue: Catalogue,
    private readonly source: SourceGare,
    private readonly validation: ValidationSuperviseurService,
    private readonly idem: IdempotenceService,
    private readonly journal: JournalSigneService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ lecture */

  /** L'appareil d'un téléphone de la gare du superviseur ; un appareil d'ailleurs reste inconnu. */
  private async deMaGare(appareilId: string, u: Utilisateur): Promise<AppareilSync> {
    const gareId = gareDe(u);
    const appareil = await this.appareils.trouver(appareilId);
    if (
      !appareil ||
      appareil.retire ||
      appareil.gareId !== gareId ||
      (appareil.compagnieId && u.compagnieId && appareil.compagnieId !== u.compagnieId)
    ) {
      throw introuvable("APPAREIL_INCONNU", "Appareil inconnu dans cette gare");
    }
    return appareil;
  }

  private etatDe(appareil: AppareilSync, maintenant: number): EtatAppareil {
    const o = appareil.octroi;
    if (
      o?.option === "debloquer_4h" &&
      o.debloqueJusqua !== null &&
      Date.parse(o.debloqueJusqua) > maintenant
    ) {
      return "debloque_temporairement";
    }
    const derniere = appareil.derniereSyncA === null ? null : Date.parse(appareil.derniereSyncA);
    if (derniere === null) return "bloque";
    return maintenant - derniere >= LIMITE_HORS_LIGNE_HEURES * MS_PAR_HEURE ? "bloque" : "en_ligne";
  }

  /** `agence.superviseur.appareil` : l'appareil, sa durée hors ligne, ce qui attend, le diagnostic, les options. */
  async lire(appareilId: string, u: Utilisateur) {
    const appareil = await this.deMaGare(appareilId, u);
    if (appareil.derniereSyncA === null) {
      throw conflit(
        "APPAREIL_JAMAIS_SYNCHRONISE",
        "Cet appareil ne s'est encore jamais synchronisé : rien à débloquer",
      );
    }
    const maintenant = this.horloge.maintenant().getTime();
    const etat = this.etatDe(appareil, maintenant);
    const horsLigneMinutes = Math.max(
      0,
      Math.floor((maintenant - Date.parse(appareil.derniereSyncA)) / MS_PAR_MINUTE),
    );
    const gareId = appareil.gareId as string;
    const plage = (await this.attribution.plageDe(appareil)) ?? { debut: 1, fin: 999 };
    let trous: number[] = [];
    try {
      trous = await this.numeros.trous(appareil.id, aammjjDouala(maintenant), "billet", plage);
    } catch {
      // Les trous sont une aide au diagnostic : sans eux, la planche reste lisible.
    }

    const bloque = etat === "bloque";
    const diagnostics: { niveau: "alerte" | "info"; constat: string }[] = [
      bloque
        ? {
            niveau: "alerte",
            constat: `Hors ligne depuis ${dureeLisible(horsLigneMinutes)}, au-delà de la limite de ${LIMITE_HORS_LIGNE_HEURES} h`,
          }
        : {
            niveau: "info",
            constat:
              etat === "debloque_temporairement"
                ? `Débloqué pour ${DEBLOCAGE_TEMPORAIRE_HEURES} h, hors ligne depuis ${dureeLisible(horsLigneMinutes)}`
                : `En ligne : dernière synchronisation à ${heureCourte(appareil.derniereSyncA)}`,
          },
    ];
    const ouvertes = await this.alertes.lister({ gareId, ouvertesSeulement: true });
    for (const a of ouvertes.filter((x) => x.appareilId === appareil.id)) {
      const constat = CONSTAT_ALERTE[a.type];
      if (constat && !diagnostics.some((d) => d.constat === constat)) {
        diagnostics.push({ niveau: "alerte", constat });
      }
    }

    return {
      appareil: {
        id: appareil.id,
        code: await this.code(appareil),
        guichetRang: appareil.rang ?? 1,
        gareId,
      },
      etat,
      derniereSyncA: appareil.derniereSyncA,
      horsLigneMinutes,
      limiteHeures: LIMITE_HORS_LIGNE_HEURES,
      // Provisoire : la file locale du téléphone n'est pas visible du serveur.
      enAttente: {
        ventes: 0,
        colis: 0,
        cash: 0,
        plage: { debut: plage.debut, fin: plage.fin, trous },
      },
      diagnostics,
      options: bloque
        ? (["synchroniser", "debloquer_4h", "telephone_secours"] as const).map((option, i) => ({
            rang: i + 1,
            option,
            recommande: i === 0,
          }))
        : [],
      // Aucun agent support n'est joignable depuis le serveur : on ne prétend pas l'avoir prévenu.
      rappelSupport: false,
    };
  }

  /** « GU3-DLA » : le genre de l'appareil, son rang, le code de la gare. */
  private async code(appareil: AppareilSync): Promise<string> {
    const gareId = appareil.gareId as string;
    const gare = await this.catalogue.gare(gareId);
    const lieu =
      gare?.code ?? ((await this.source.gare(gareId))?.nom ?? "GARE").slice(0, 3).toUpperCase();
    return `${PREFIXE_CODE[appareil.genre]}${appareil.rang ?? 1}-${lieu}`;
  }

  /* ------------------------------------------------------------------ écriture */

  /**
   * `appareil.debloque` : le superviseur choisit une option avec son PIN. L'octroi est posé sur la fiche de
   * l'appareil ; le téléphone le lit à sa prochaine synchronisation. Un appareil qui n'est pas bloqué
   * n'a rien à débloquer (409).
   */
  async debloquer(corps: unknown, u: Utilisateur) {
    const e = lireAppareilDebloque(corps);
    this.validation.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      const d = e.donnees;
      await this.validation.exiger(corps, d.validePar, u, e.type);
      const appareil = await this.deMaGare(d.appareilId, u);
      const maintenant = this.horloge.maintenant();
      if (this.etatDe(appareil, maintenant.getTime()) !== "bloque") {
        throw conflit("APPAREIL_NON_BLOQUE", "Cet appareil n'est pas bloqué");
      }
      const octroi: Octroi = {
        option: d.option,
        superviseurId: u.id,
        accordeA: versIsoDouala(maintenant),
        debloqueJusqua:
          d.option === "debloquer_4h"
            ? versIsoDouala(maintenant.getTime() + DEBLOCAGE_TEMPORAIRE_HEURES * MS_PAR_HEURE)
            : null,
      };
      await this.appareils.mettreAJour(appareil.id, {
        octroi,
        ...(d.option === "telephone_secours" ? { retire: true } : {}),
      });
      await this.audit.enregistrer({
        acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
        action: "sync.deblocage_accorde",
        resultat: "succes",
        cible: { type: "appareil", id: appareil.id },
        details: { option: d.option, debloqueJusqua: octroi.debloqueJusqua },
      });
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume: `Appareil ${await this.code(appareil)} : ${RESUME_OPTION[d.option]}`,
        validePar: d.validePar,
        gareId: appareil.gareId,
        compagnieId: appareil.compagnieId,
      });
      const apres = (await this.appareils.trouver(appareil.id)) ?? appareil;
      return {
        appareil: {
          id: appareil.id,
          etat: this.etatDe(apres, maintenant.getTime()),
          debloqueJusqua: octroi.debloqueJusqua,
          // Provisoire : les ventes sont envoyées par l'appareil lui-même, le serveur ne les compte pas ici.
          ventesSynchronisees: 0,
        },
      };
    });
  }
}

const RESUME_OPTION: Readonly<Record<OptionDeblocage, string>> = {
  synchroniser: "synchronisation demandée via le téléphone du superviseur",
  debloquer_4h: `débloqué ${DEBLOCAGE_TEMPORAIRE_HEURES} h de plus`,
  telephone_secours: "remplacé par le téléphone de secours",
};
