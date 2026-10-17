import { createHash, randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { VerrouillageMois } from "../comptable/verrouillage.service";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import {
  lireLot,
  validerEvenement,
  type CodeRejet,
  type EvenementRecu,
  type LigneLotRecue,
} from "./protocole";
import {
  AlertesSync,
  AppareilsSync,
  AttributionPlages,
  ControleNumeros,
  JournalSync,
  ProvisionnementSync,
  SiegesSync,
  type AlerteSync,
  type AppareilSync,
  type ConflitStocke,
  type Octroi,
  type TypeAlerte,
} from "./ports";
import {
  DEBLOCAGE_TEMPORAIRE_HEURES,
  ROLES_PAR_TYPE,
  TOLERANCE_HORLOGE_MS,
  TYPES_NUMEROTES,
  genreDeNumero,
} from "./regles";
import { cleValide, verifierSignature } from "./signature";
import {
  annulationAcceptee,
  resoudreSiege,
  siegeLibere,
  siegeOccupe,
  type OperationSiege,
} from "./sieges";
import { MS_PAR_HEURE, aammjjDouala, versIsoDouala } from "./temps";

export interface ResultatEvenement {
  evenementId: string;
  statut: "accepte" | "deja_recu" | "rejete";
  recuA: string;
  code?: string;
  message?: string;
}

export interface ConflitReponse {
  evenementId: string;
  billetId: string;
  departId: string;
  siege: number;
  gagnantBilletId: string;
  detecteA: string;
  motif: "siege_deja_pris";
}

export interface ReponseLot {
  serveurA: string;
  resultats: ResultatEvenement[];
  appareil: {
    derniereSyncA: string;
    plage: { debut: number; fin: number } | null;
    partsHorsLigne: Record<string, number[]>;
    octroi: Octroi | null;
    verificateursPin: { superviseurId: string; sel: string; iterations: number; hache: string }[];
  };
  conflits: ConflitReponse[];
}

/** Les événements qui touchent l'argent : ventes, colis, caisses, annulations (pas l'équipe ni les appareils). */
const TYPES_COMPTABLES: readonly string[] = [
  "billet.",
  "colis.",
  "route.",
  "controle.",
  "caisse.",
  "annulation.",
];

/** Un octroi plus vieux que 24 h n'est plus renvoyé : un appareil réinstallé ne doit pas le rejouer. */
const VALIDITE_OCTROI_MS = 24 * MS_PAR_HEURE;
/** Les billets « à replacer » restent annoncés à l'appareil 72 h. */
const MEMOIRE_CONFLITS_MS = 72 * MS_PAR_HEURE;

/** UUID déterministe : rejouer le même effet écrit le même événement (idempotence côté serveur). */
export function uuidDeterministe(graine: string): string {
  const h = createHash("sha256").update(graine).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Rejeu des événements reçus des appareils.
 *
 * Pour chaque événement, dans l'ordre de la file de l'appareil :
 * 1. l'enveloppe est validée ; un événement invalide est refusé **seul** (le lot continue) ;
 * 2. un UUID déjà connu répond `deja_recu` sans rien refaire (idempotence) ;
 * 3. la signature de l'appareil, l'auteur (le compte connecté) et le rôle sont vérifiés ;
 * 4. les effets sont appliqués de façon idempotente (siège pris, conflit, déblocage, numéro) ;
 * 5. l'événement est écrit dans le journal, en dernier : c'est le point de validation. Si le
 *    serveur tombe entre les deux, le rejeu refait les effets, qui sont sans conséquence.
 *
 * Une vente déjà imprimée n'est jamais refusée pour un motif métier : un conflit de siège, un numéro
 * en double ou hors plage produisent une alerte nominative, jamais une perte.
 */
@Injectable()
export class RejeuService {
  constructor(
    private readonly appareils: AppareilsSync,
    private readonly journal: JournalSync,
    private readonly sieges: SiegesSync,
    private readonly alertes: AlertesSync,
    private readonly provisionnement: ProvisionnementSync,
    private readonly numeros: ControleNumeros,
    private readonly attribution: AttributionPlages,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
    private readonly verrou: VerrouillageMois,
  ) {}

  /* -------------------------------------------------------------- réception */

  async recevoir(corps: unknown, utilisateur: Utilisateur): Promise<ReponseLot> {
    const lot = lireLot(corps);
    const maintenant = this.horloge.maintenant();
    const recuA = versIsoDouala(maintenant);

    const appareil = await this.appareils.trouver(lot.appareilId);
    if (!appareil) {
      throw new NotFoundException({ code: "APPAREIL_INCONNU", message: "Appareil inconnu" });
    }
    if (!appareil.cle) {
      throw new ConflictException({
        code: "APPAREIL_NON_ENROLE",
        message: "Appareil sans clé : enregistrer sa clé publique avant d'envoyer des événements",
      });
    }
    this.verifierAppartenance(appareil, utilisateur);

    const ecartHorloge = Date.parse(lot.envoyeA) - maintenant.getTime();
    const contexte: ContexteLot = {
      appareil,
      utilisateur,
      maintenant,
      recuA,
      alertesHorloge: false,
    };

    const lignes = [...lot.evenements].sort((a, b) => a.ordre - b.ordre);
    await this.surveillerFile(lignes, appareil, utilisateur, recuA);

    const resultats: ResultatEvenement[] = [];
    let ordreMax = appareil.dernierOrdre;
    for (const ligne of lignes) {
      const resultat = await this.traiter(ligne, contexte);
      resultats.push(resultat);
      ordreMax = Math.max(ordreMax, ligne.ordre); // reçu, même refusé : le rang ne doit plus manquer
    }
    if (ecartHorloge > TOLERANCE_HORLOGE_MS && lignes.length > 0) {
      await this.alerter(appareil, utilisateur, recuA, "horloge_en_avance", "alerte", null, {
        ecartMinutes: Math.round(ecartHorloge / 60_000),
        envoyeA: lot.envoyeA,
      });
    }
    await this.appareils.mettreAJour(appareil.id, { derniereSyncA: recuA, dernierOrdre: ordreMax });

    const frais = (await this.appareils.trouver(appareil.id)) ?? appareil;
    const conflits = await this.sieges.conflitsDeAppareil(
      appareil.id,
      versIsoDouala(maintenant.getTime() - MEMOIRE_CONFLITS_MS),
    );
    const octroi =
      frais.octroi && maintenant.getTime() - Date.parse(frais.octroi.accordeA) < VALIDITE_OCTROI_MS
        ? frais.octroi
        : null;
    return {
      serveurA: recuA,
      resultats,
      appareil: {
        derniereSyncA: recuA,
        plage: await this.attribution.plageDe(frais),
        partsHorsLigne: await this.provisionnement.partsHorsLigne(frais),
        octroi,
        verificateursPin: await this.provisionnement.verificateursPin(frais),
      },
      conflits: conflits.map((c) => ({
        evenementId: c.evenementId,
        billetId: c.billetId,
        departId: c.departId,
        siege: c.siege,
        gagnantBilletId: c.gagnantBilletId,
        detecteA: c.detecteA,
        motif: "siege_deja_pris" as const,
      })),
    };
  }

  /** Enregistre la clé publique d'un appareil déclaré. Une clé déjà posée ne change que par un superviseur. */
  async enregistrerCle(appareilId: string, cle: unknown, utilisateur: Utilisateur): Promise<void> {
    const appareil = await this.appareils.trouver(appareilId);
    if (!appareil) {
      throw new NotFoundException({ code: "APPAREIL_INCONNU", message: "Appareil inconnu" });
    }
    this.verifierAppartenance(appareil, utilisateur);
    const propre = await cleValide(cle);
    if (!propre) {
      throw new ConflictException({
        code: "CLE_INVALIDE",
        message: "Clé publique ECDSA P-256 (JWK) attendue",
      });
    }
    if (appareil.cle && utilisateur.role !== "superviseur") {
      throw new ConflictException({
        code: "CLE_DEJA_ENREGISTREE",
        message: "Cet appareil a déjà une clé : seul un superviseur peut la remplacer",
      });
    }
    await this.appareils.enregistrerCle(appareilId, propre);
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: appareil.cle ? "sync.cle_remplacee" : "sync.cle_enregistree",
      resultat: "succes",
      cible: { type: "appareil", id: appareilId },
    });
  }

  async listerAlertes(utilisateur: Utilisateur): Promise<AlerteSync[]> {
    // Un compte sans gare (superviseur) ou sans compagnie (patron) ne voit rien : jamais « tout ».
    const portee = utilisateur.role === "patron" ? utilisateur.compagnieId : utilisateur.gareId;
    if (!portee) return [];
    const brut =
      utilisateur.role === "patron"
        ? await this.alertes.lister({ compagnieId: portee, ouvertesSeulement: true })
        : await this.alertes.lister({ gareId: portee, ouvertesSeulement: true });
    return brut.sort((a, b) => b.creeeA.localeCompare(a.creeeA));
  }

  private verifierAppartenance(appareil: AppareilSync, utilisateur: Utilisateur): void {
    const autreCompagnie =
      appareil.compagnieId &&
      utilisateur.compagnieId &&
      appareil.compagnieId !== utilisateur.compagnieId;
    const autreGare =
      appareil.gareId && utilisateur.gareId && appareil.gareId !== utilisateur.gareId;
    if (autreCompagnie || autreGare) {
      throw new ForbiddenException({
        code: "APPAREIL_AUTRE_GARE",
        message: "Cet appareil n'appartient pas à votre gare",
      });
    }
  }

  /* -------------------------------------------------------------- un événement */

  private async traiter(ligne: LigneLotRecue, ctx: ContexteLot): Promise<ResultatEvenement> {
    const { appareil, utilisateur, recuA } = ctx;
    const idBrut = (ligne.evenement as { id?: unknown } | null)?.id;
    const evenementId = typeof idBrut === "string" ? idBrut : "";
    const rejeter = async (code: CodeRejet, message: string): Promise<ResultatEvenement> => {
      await this.audit.enregistrer({
        acteur: {
          id: utilisateur.id,
          role: utilisateur.role,
          compagnieId: utilisateur.compagnieId,
        },
        action: "sync.evenement_rejete",
        resultat: "refus",
        cible: { type: "appareil", id: appareil.id },
        details: { evenementId, code, message },
      });
      await this.alerter(
        appareil,
        utilisateur,
        recuA,
        "evenement_rejete",
        "alerte",
        evenementId || null,
        {
          code,
          message,
        },
      );
      return { evenementId, statut: "rejete", recuA, code, message };
    };

    const valide = validerEvenement(ligne.evenement);
    if (!valide.ok) return rejeter(valide.code, valide.message);
    const e = valide.evenement;
    if (e.appareilId !== appareil.id) {
      return rejeter("appareil_incoherent", "L'événement porte un autre appareil que le lot");
    }
    if (await this.journal.existe(e.id)) return { evenementId: e.id, statut: "deja_recu", recuA };

    if (e.auteurId !== utilisateur.id) {
      return rejeter("auteur_incoherent", "L'auteur de l'événement n'est pas le compte connecté");
    }
    const signature = typeof ligne.signature === "string" ? ligne.signature : "";
    if (!(await verifierSignature(appareil.cle!, ligne.evenement, signature))) {
      return rejeter("signature_invalide", "Signature de l'appareil invalide");
    }
    const roles = ROLES_PAR_TYPE[e.type];
    if (roles && !roles.includes(utilisateur.role)) {
      return rejeter(
        "role_non_autorise",
        `Le rôle ${utilisateur.role} ne peut pas écrire ${e.type}`,
      );
    }

    await this.appliquer(e, ctx);
    const ecrit = await this.journal.ajouter({
      evenement: e,
      recuA,
      ordreAppareil: ligne.ordre,
      origine: "appareil",
    });
    return { evenementId: e.id, statut: ecrit ? "accepte" : "deja_recu", recuA };
  }

  /* -------------------------------------------------------------- effets (idempotents) */

  private async appliquer(e: EvenementRecu, ctx: ContexteLot): Promise<void> {
    const { appareil, utilisateur, maintenant, recuA } = ctx;

    if (Date.parse(e.at) - maintenant.getTime() > TOLERANCE_HORLOGE_MS && !ctx.alertesHorloge) {
      ctx.alertesHorloge = true;
      await this.alerter(appareil, utilisateur, recuA, "horloge_en_avance", "alerte", e.id, {
        at: e.at,
        recuA,
      });
    }

    await this.signalerMoisClos(e, ctx);

    if (e.numeroPlage !== null && (TYPES_NUMEROTES as readonly string[]).includes(e.type)) {
      const anomalies = await this.numeros.enregistrer({
        appareilId: appareil.id,
        jour: aammjjDouala(e.at),
        genre: genreDeNumero(e.type),
        numeroPlage: e.numeroPlage,
        evenementId: e.id,
        plage: await this.attribution.plageDe(appareil),
      });
      for (const anomalie of anomalies) {
        await this.alerter(appareil, utilisateur, recuA, anomalie.type, "alerte", e.id, {
          numeroPlage: anomalie.numeroPlage,
          type: e.type,
          ...(anomalie.evenementIdExistant
            ? { evenementIdExistant: anomalie.evenementIdExistant }
            : {}),
        });
      }
    }

    const prend = siegeOccupe(e);
    if (prend) {
      await this.sieges.definirBillet(prend.billetId, prend.departId, prend.siege);
      await this.sieges.ajouterOperation(prend.departId, prend.siege, {
        evenementId: e.id,
        billetId: prend.billetId,
        kind: "prend",
        at: Date.parse(e.at),
        appareilId: e.appareilId,
        auteurId: e.auteurId,
      });
      await this.recalculerSiege(prend.departId, prend.siege, ctx);
    }
    const libere = siegeLibere(e);
    if (libere) {
      await this.liberer(e, libere.departId, libere.siege, libere.billetId, ctx);
    }
    const annulee = annulationAcceptee(e);
    if (annulee) {
      const billet = await this.sieges.billet(annulee);
      if (billet) await this.liberer(e, billet.departId, billet.siege, annulee, ctx);
    }
    if (e.type === "appareil.debloque") await this.debloquer(e, ctx);
  }

  /**
   * Un appareil resté hors ligne peut envoyer une vente, un colis, une caisse ou une annulation datés d'un
   * mois déjà clôturé par le comptable. Comme pour tout geste déjà fait sur le terrain (billet imprimé,
   * argent encaissé), l'événement n'est jamais refusé : il est journalisé, et une alerte nominative
   * prévient l'agence. Les écritures comptables (billets, caisse) qui en découlent s'inscrivent, elles,
   * dans le premier mois ouvert (`VerrouillageMois.premierInstantOuvert`) : le mois clos ne bouge pas.
   */
  private async signalerMoisClos(e: EvenementRecu, ctx: ContexteLot): Promise<void> {
    if (!TYPES_COMPTABLES.some((prefixe) => e.type.startsWith(prefixe))) return;
    const compagnieId = ctx.appareil.compagnieId ?? ctx.utilisateur.compagnieId;
    if (!compagnieId) return;
    if (!(await this.verrou.estVerrouille(compagnieId, new Date(e.at)))) return;
    await this.alerter(
      ctx.appareil,
      ctx.utilisateur,
      ctx.recuA,
      "evenement_mois_clos",
      "alerte",
      e.id,
      {
        type: e.type,
        at: e.at,
        mois: versIsoDouala(Date.parse(e.at)).slice(0, 7),
        message: "Événement daté d'un mois déjà clôturé : il s'inscrit dans le premier mois ouvert",
      },
    );
  }

  private async liberer(
    e: EvenementRecu,
    departId: string,
    siege: number,
    billetId: string,
    ctx: ContexteLot,
  ): Promise<void> {
    await this.sieges.ajouterOperation(departId, siege, {
      evenementId: e.id,
      billetId,
      kind: "libere",
      at: Date.parse(e.at),
      appareilId: e.appareilId,
      auteurId: e.auteurId,
    });
    await this.recalculerSiege(departId, siege, ctx);
  }

  /**
   * Rejoue les opérations du siège par heure du geste et met les conflits d'équerre : les billets
   * qui perdent passent « à replacer », ceux qui ne perdent plus (une libération arrivée en retard
   * mais datée d'avant) sont levés.
   */
  private async recalculerSiege(departId: string, siege: number, ctx: ContexteLot): Promise<void> {
    const operations = await this.sieges.operations(departId, siege);
    const { perdants } = resoudreSiege(operations);
    const connus = await this.sieges.conflitsDuSiege(departId, siege);

    for (const perdant of perdants) {
      if (connus.some((c) => c.evenementId === perdant.evenementId)) continue;
      const conflit: ConflitStocke = {
        evenementId: perdant.evenementId,
        billetId: perdant.billetId,
        departId,
        siege,
        gagnantBilletId: perdant.gagnantBilletId,
        appareilId: perdant.appareilId,
        auteurId: perdant.auteurId,
        detecteA: ctx.recuA,
      };
      // Deux rejeux qui se croisent détectent le même conflit : seul le premier l'écrit et le signale.
      if (!(await this.sieges.enregistrerConflit(conflit))) continue;
      await this.journal.ajouter({
        evenement: {
          id: uuidDeterministe(`billet.a_replacer:${perdant.evenementId}`),
          type: "billet.a_replacer",
          at: ctx.recuA,
          appareilId: null,
          auteurId: null,
          cible: { type: "billet", id: perdant.billetId },
          numeroPlage: null,
          donnees: {
            billetId: perdant.billetId,
            departId,
            siege,
            gagnantBilletId: perdant.gagnantBilletId,
            evenementId: perdant.evenementId,
            motif: "siege_deja_pris",
          },
        },
        recuA: ctx.recuA,
        ordreAppareil: null,
        origine: "serveur",
      });
      const gagnant = operations.find(
        (o) => o.kind === "prend" && o.billetId === perdant.gagnantBilletId,
      );
      const appareilPerdant = (await this.appareils.trouver(perdant.appareilId)) ?? ctx.appareil;
      await this.alerter(
        appareilPerdant,
        { id: perdant.auteurId },
        ctx.recuA,
        "siege_en_conflit",
        "alerte",
        perdant.evenementId,
        {
          departId,
          siege,
          aReplacer: {
            billetId: perdant.billetId,
            auteurId: perdant.auteurId,
            appareilId: perdant.appareilId,
          },
          gagnant: gagnant
            ? {
                billetId: gagnant.billetId,
                auteurId: gagnant.auteurId,
                appareilId: gagnant.appareilId,
                at: versIsoDouala(gagnant.at),
              }
            : { billetId: perdant.gagnantBilletId },
        },
      );
      await this.audit.enregistrer({
        acteur: {
          id: ctx.utilisateur.id,
          role: ctx.utilisateur.role,
          compagnieId: ctx.utilisateur.compagnieId,
        },
        action: "sync.siege_en_conflit",
        resultat: "succes",
        cible: { type: "billet", id: perdant.billetId },
        details: {
          departId,
          siege,
          gagnantBilletId: perdant.gagnantBilletId,
          appareilId: perdant.appareilId,
        },
      });
    }

    for (const ancien of connus) {
      if (perdants.some((p) => p.evenementId === ancien.evenementId)) continue;
      if (!(await this.sieges.leverConflit(ancien.evenementId))) continue;
      await this.alerter(
        ctx.appareil,
        ctx.utilisateur,
        ctx.recuA,
        "conflit_leve",
        "info",
        ancien.evenementId,
        {
          departId,
          siege,
          billetId: ancien.billetId,
        },
      );
    }
  }

  /** Un superviseur débloque un appareil (option choisie sur la planche « Débloquer »). */
  private async debloquer(e: EvenementRecu, ctx: ContexteLot): Promise<void> {
    const { utilisateur, appareil, maintenant, recuA } = ctx;
    const donnees = e.donnees as {
      appareilId: string;
      option: Octroi["option"];
      validePar: { superviseurId: string };
    };
    const cible = await this.appareils.trouver(donnees.appareilId);
    const autorise =
      utilisateur.role === "superviseur" &&
      donnees.validePar.superviseurId === utilisateur.id &&
      cible !== null &&
      !(
        cible.compagnieId &&
        utilisateur.compagnieId &&
        cible.compagnieId !== utilisateur.compagnieId
      ) &&
      !(cible.gareId && utilisateur.gareId && cible.gareId !== utilisateur.gareId);
    if (!autorise || !cible) {
      // Déblocage fait sur l'appareil lui-même (PIN contrôlé sans réseau) : on le journalise et on
      // le signale, le serveur ne peut pas le vérifier.
      await this.alerter(appareil, utilisateur, recuA, "deblocage_sur_place", "info", e.id, {
        appareilId: donnees.appareilId,
        option: donnees.option,
        superviseurId: donnees.validePar.superviseurId,
        validePar: donnees.validePar,
      });
      return;
    }
    const octroi: Octroi = {
      option: donnees.option,
      superviseurId: utilisateur.id,
      accordeA: recuA,
      debloqueJusqua:
        donnees.option === "debloquer_4h"
          ? versIsoDouala(maintenant.getTime() + DEBLOCAGE_TEMPORAIRE_HEURES * MS_PAR_HEURE)
          : null,
    };
    await this.appareils.mettreAJour(cible.id, {
      octroi,
      ...(donnees.option === "telephone_secours" ? { retire: true } : {}),
    });
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: "sync.deblocage_accorde",
      resultat: "succes",
      cible: { type: "appareil", id: cible.id },
      details: { option: donnees.option, debloqueJusqua: octroi.debloqueJusqua },
    });
  }

  /** La file d'un appareil est numérotée sans trou : un saut ou un retour en arrière se signale. */
  private async surveillerFile(
    lignes: LigneLotRecue[],
    appareil: AppareilSync,
    utilisateur: Utilisateur,
    recuA: string,
  ): Promise<void> {
    const premier = lignes[0]?.ordre;
    if (premier === undefined) return;
    if (premier > appareil.dernierOrdre + 1) {
      await this.alerter(appareil, utilisateur, recuA, "file_avec_trou", "alerte", null, {
        attendu: appareil.dernierOrdre + 1,
        recu: premier,
      });
    }
    for (let i = 1; i < lignes.length; i++) {
      const avant = lignes[i - 1]!.ordre;
      if (lignes[i]!.ordre > avant + 1) {
        await this.alerter(appareil, utilisateur, recuA, "file_avec_trou", "alerte", null, {
          attendu: avant + 1,
          recu: lignes[i]!.ordre,
        });
      }
    }
    // Un événement neuf dont le rang est ≤ au dernier connu : la base de l'appareil a été vidée.
    if (premier <= appareil.dernierOrdre) {
      const connu = await this.journal.existe((lignes[0]!.evenement as { id?: string })?.id ?? "");
      if (!connu) {
        await this.alerter(appareil, utilisateur, recuA, "file_reinitialisee", "alerte", null, {
          dernierOrdreConnu: appareil.dernierOrdre,
          recu: premier,
        });
      }
    }
  }

  private async alerter(
    appareil: AppareilSync,
    acteur: { id: string; role?: string; gareId?: string | null; compagnieId?: string | null },
    creeeA: string,
    type: TypeAlerte,
    gravite: AlerteSync["gravite"],
    evenementId: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.alertes.ajouter({
      id: randomUUID(),
      type,
      gravite,
      creeeA,
      appareilId: appareil.id,
      auteurId: acteur.id,
      evenementId,
      gareId: appareil.gareId,
      compagnieId: appareil.compagnieId,
      details,
      resolueA: null,
    });
  }
}

interface ContexteLot {
  appareil: AppareilSync;
  utilisateur: Utilisateur;
  maintenant: Date;
  recuA: string;
  alertesHorloge: boolean;
}

export type { OperationSiege };
