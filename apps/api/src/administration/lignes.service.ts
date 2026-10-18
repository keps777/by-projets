import { HttpException, Injectable } from "@nestjs/common";
import { jourDouala, versIsoDouala } from "../billetterie/temps";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { VerificateurSignature } from "../modules/signature";
import {
  compagnieDe,
  conflit,
  introuvable,
  invalide,
  lireCommande,
  lireSignature,
} from "./commande";
import type {
  ClasseDepart,
  EtatLigne,
  GareAdmin,
  HoraireModifie,
  Jour,
  LigneAdmin,
  PlanLigne,
  ReglageLigne,
  SectionsLigne,
} from "./modeles";
import { AnnuaireAdmin, HoraireEnDouble, HoraireInconnu, Lignes, ParcBus } from "./ports";
import {
  codeDeLigne,
  compterModifications,
  controlerEtat,
  disposerArrets,
  fusionner,
  joursTries,
  nomDeLigne,
  planParDefaut,
  prorataDe,
} from "./regles";
import { creerLigne, modifierLigne } from "./schemas";

/* ------------------------------------------------------------------ formes des réponses (contrats patron) */

/** `DepartEditable` des contrats patron. */
export interface DepartEditableReponse {
  id: string | null;
  heure: string;
  heureInitiale: string | null;
  classe: ClasseDepart;
  prix: number;
  actif: boolean;
  note: string | null;
  jours: Jour[];
  nouveau: boolean;
}

/** `LigneEditable` des contrats patron. */
export interface LigneEditableReponse {
  id: string;
  nom: string;
  departs: DepartEditableReponse[];
  tarifs: { classique: number; vip: number; bagage: number };
  arrets: { nom: string; prorata: number; montee: boolean }[];
  plan: PlanLigne;
  options: { venteEnLigne: boolean; fusionAuto: boolean };
  brouillon: { modifications: number; publicationA: string | null };
}

/** `LignePubliee` des contrats patron. */
export interface LignePublieeReponse {
  journalId: string;
  signeA: string;
  signePar: string;
  ligne: LigneEditableReponse;
}

/** Une ligne de la liste `GET /admin/lignes`. */
export interface LigneCatalogue {
  id: string;
  code: string;
  origineGareId: string;
  destinationGareId: string;
  tarifs: { classique: number; vip: number; bagage: number };
  dureeMinutes: number;
  /** Origine et terminus compris. */
  arrets: string[];
}

export const ACTION_LIGNE_CREER = "ligne.creer";
export const ACTION_LIGNE_PUBLIER = "ligne.publier";
export const ACTION_LIGNE_PROGRAMMER = "ligne.programmer";
export const ACTION_LIGNE_BROUILLON_APPLIQUE = "ligne.brouillon_applique";

/** Capacité supposée d'une ligne dont la compagnie n'a encore aucun bus de la classe. */
export const CAPACITE_PAR_DEFAUT = 70;

const OPTIONS_PAR_DEFAUT = { venteEnLigne: true, fusionAuto: false } as const;

/**
 * Lignes d'une compagnie : création et réglages (planche « Config », `/patron/reglages/lignes`).
 *
 * Un état de ligne = tarifs, arrêts en route, horaires récurrents, plan de sièges, options. « Publier »
 * l'écrit d'un coup, immédiatement ou dès un jour futur (`effetDu`) : dans ce cas les sections modifiées sont
 * gardées en brouillon et s'appliquent d'elles-mêmes à la première lecture ou génération de ce jour-là.
 */
@Injectable()
export class LignesService {
  constructor(
    private readonly annuaire: AnnuaireAdmin,
    private readonly lignes: Lignes,
    private readonly bus: ParcBus,
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ lecture */

  async lire(u: Utilisateur, ligneId: string): Promise<LigneEditableReponse> {
    const ligne = await this.chargerLigne(u, ligneId);
    await this.appliquerSiEchu(ligne);
    return this.vue(await this.relire(ligne));
  }

  /** Les lignes de l'agence (un superviseur : celles qui partent de sa gare). */
  async catalogue(u: Utilisateur): Promise<LigneCatalogue[]> {
    const lignes = await this.lignes.lister(compagnieDe(u));
    return lignes
      .filter((l) => u.role !== "superviseur" || l.origineGareId === u.gareId)
      .map((l) => ({
        id: l.id,
        code: l.code,
        origineGareId: l.origineGareId,
        destinationGareId: l.destinationGareId,
        tarifs: l.tarifs,
        dureeMinutes: l.dureeMinutes,
        arrets: l.arrets.map((a) => a.nom),
      }));
  }

  /** Les gares de l'agence (identifiants à donner pour créer une ligne ou déclarer un appareil). */
  async gares(u: Utilisateur): Promise<GareAdmin[]> {
    return this.annuaire.gares(compagnieDe(u));
  }

  /** Les lignes d'une compagnie (génération des départs). */
  lignesDe(compagnieId: string): Promise<LigneAdmin[]> {
    return this.lignes.lister(compagnieId);
  }

  /** La ligne d'une compagnie, ou 404. */
  async chargerLigne(u: Utilisateur, ligneId: string): Promise<LigneAdmin> {
    const compagnieId = compagnieDe(u);
    const ligne = await this.lignes.trouver(ligneId);
    if (!ligne || ligne.compagnieId !== compagnieId) {
      throw introuvable("LIGNE_INCONNUE", `Ligne « ${ligneId} » inconnue`);
    }
    return ligne;
  }

  /* ------------------------------------------------------------------ création */

  async creer(u: Utilisateur, corps: unknown): Promise<LignePublieeReponse> {
    const signature = lireSignature(corps);
    const cmd = lireCommande(creerLigne, corps);
    await this.verifier(u, signature, ACTION_LIGNE_CREER, null);
    const compagnieId = compagnieDe(u);

    const origine = await this.gareDeLaCompagnie(compagnieId, cmd.origineGareId);
    const destination = await this.gareDeLaCompagnie(compagnieId, cmd.destinationGareId);
    if (origine.id === destination.id) {
      throw invalide("GARES_IDENTIQUES", "L'origine et la destination d'une ligne sont deux gares");
    }
    const arrets = cmd.arrets.map((nom) => ({ nom: nom.trim(), montee: true }));
    const erreur = controlerEtat({
      tarifs: cmd.tarifs,
      arrets,
      horaires: [],
      plan: planParDefaut(cmd.capacite),
      options: { ...OPTIONS_PAR_DEFAUT },
    });
    if (erreur) throw invalide(erreur.code, erreur.message);

    const creee = await this.lignes.creer({
      compagnieId,
      code: codeDeLigne(origine, destination),
      origineGareId: origine.id,
      destinationGareId: destination.id,
      tarifs: cmd.tarifs,
      dureeMinutes: 0,
      arrets: disposerArrets([], arrets, origine.ville, destination.ville),
      plan: planParDefaut(cmd.capacite),
      options: { ...OPTIONS_PAR_DEFAUT },
    });
    if (!creee) {
      throw conflit(
        "LIGNE_EXISTANTE",
        `La ligne ${codeDeLigne(origine, destination)} existe déjà : modifiez-la plutôt que d'en créer une seconde`,
      );
    }
    const ligne = await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_LIGNE_CREER,
      resultat: "succes",
      cible: { type: "ligne", id: creee.id },
      // Pas de clé `code` : le journal masque les clés qui commencent par « code ».
      details: { ligne: creee.code, capacite: cmd.capacite, arrets: arrets.length },
    });
    return this.accuse(u, ligne.id, await this.vue(await this.relire(creee)));
  }

  /* ------------------------------------------------------------------ publication */

  async modifier(u: Utilisateur, ligneIdUrl: string, corps: unknown): Promise<LignePublieeReponse> {
    const signature = lireSignature(corps);
    const cmd = lireCommande(modifierLigne, corps);
    if (cmd.ligneId !== ligneIdUrl) {
      throw invalide("COMMANDE_INVALIDE", "La ligne du corps diffère de celle de l'URL");
    }
    await this.verifier(u, signature, ACTION_LIGNE_PUBLIER, ligneIdUrl);
    const ligne = await this.chargerLigne(u, ligneIdUrl);
    await this.appliquerSiEchu(ligne);

    const courante = await this.relire(ligne);
    const connus = new Set(courante.publie.horaires.map((h) => h.id));
    for (const d of cmd.departs ?? []) {
      if (d.id !== null && !connus.has(d.id)) {
        throw introuvable("HORAIRE_INCONNU", `Départ « ${d.id} » inconnu sur cette ligne`);
      }
    }
    const sections: SectionsLigne = {
      ...(cmd.tarifs ? { tarifs: cmd.tarifs } : {}),
      ...(cmd.arrets
        ? { arrets: cmd.arrets.map((a) => ({ nom: a.nom.trim(), montee: a.montee })) }
        : {}),
      ...(cmd.departs ? { horaires: cmd.departs.map(versHoraire) } : {}),
      ...(cmd.plan ? { plan: cmd.plan } : {}),
      ...(cmd.options ? { options: cmd.options } : {}),
    };
    const voulu = fusionner(courante.travail, sections);
    const erreur = controlerEtat(voulu);
    if (erreur) throw invalide(erreur.code, erreur.message);

    const aujourdHui = jourDouala(this.horloge.maintenant());
    const modifications = compterModifications(courante.publie, voulu);
    const differentes = sectionsDifferentes(courante.publie, voulu);
    const effetDu = cmd.effetDu !== undefined && cmd.effetDu > aujourdHui ? cmd.effetDu : null;
    const plusTard = effetDu !== null && differentes !== null;
    try {
      if (plusTard) {
        await this.lignes.programmer(
          ligne.id,
          differentes,
          effetDu,
          courante.publie.plan,
          courante.publie.options,
        );
      } else {
        await this.publier(ligne, voulu);
      }
    } catch (e) {
      throw this.traduire(e);
    }
    const entree = await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: plusTard ? ACTION_LIGNE_PROGRAMMER : ACTION_LIGNE_PUBLIER,
      resultat: "succes",
      cible: { type: "ligne", id: ligne.id },
      details: {
        modifications,
        sections: Object.keys(differentes ?? {}),
        ...(plusTard ? { effetDu } : {}),
      },
    });
    return this.accuse(
      u,
      entree.id,
      await this.vue(await this.relire(await this.chargerLigne(u, ligne.id))),
    );
  }

  /**
   * Applique le brouillon d'une ligne dont le jour d'effet est arrivé. Appelée avant toute lecture ou génération :
   * aucun planificateur n'est nécessaire pour qu'un « dès lundi » prenne effet.
   */
  async appliquerSiEchu(ligne: LigneAdmin): Promise<boolean> {
    const reglage = await this.lignes.reglage(ligne.id);
    if (!reglage?.brouillon || !reglage.effetDu) return false;
    if (reglage.effetDu > jourDouala(this.horloge.maintenant())) return false;
    const { publie } = await this.relire(ligne);
    await this.publier(ligne, fusionner(publie, reglage.brouillon));
    await this.audit.enregistrer({
      acteur: null,
      action: ACTION_LIGNE_BROUILLON_APPLIQUE,
      resultat: "succes",
      cible: { type: "ligne", id: ligne.id },
      details: { effetDu: reglage.effetDu, sections: Object.keys(reglage.brouillon) },
    });
    return true;
  }

  /* ------------------------------------------------------------------ états et vue */

  /** L'état publié de la ligne (ce que la billetterie voit) et son état de travail (avec le brouillon). */
  async relire(ligne: LigneAdmin): Promise<{
    ligne: LigneAdmin;
    publie: EtatLigne;
    travail: EtatLigne;
    reglage: ReglageLigne | null;
  }> {
    const frais = (await this.lignes.trouver(ligne.id)) ?? ligne;
    const [horaires, reglage] = await Promise.all([
      this.lignes.horaires(frais.id),
      this.lignes.reglage(frais.id),
    ]);
    const capacite =
      reglage?.plan.capacite ??
      (await this.bus.capaciteMax(frais.compagnieId, "classique")) ??
      CAPACITE_PAR_DEFAUT;
    const publie: EtatLigne = {
      tarifs: { ...frais.tarifs },
      arrets: frais.arrets.slice(1, -1).map((a) => ({ nom: a.nom, montee: a.montee })),
      horaires: horaires.map((h) => ({
        id: h.id,
        heure: h.heure,
        classe: h.classe,
        actif: h.actif,
        note: h.note,
        jours: joursTries(h.jours),
      })),
      plan: reglage?.plan ?? planParDefaut(capacite),
      options: reglage?.options ?? { ...OPTIONS_PAR_DEFAUT },
    };
    return {
      ligne: frais,
      publie,
      travail: fusionner(publie, reglage?.brouillon ?? null),
      reglage,
    };
  }

  private async vue(
    etat: Awaited<ReturnType<LignesService["relire"]>>,
  ): Promise<LigneEditableReponse> {
    const { ligne, publie, travail, reglage } = etat;
    const [origine, destination] = await Promise.all([
      this.annuaire.gare(ligne.origineGareId),
      this.annuaire.gare(ligne.destinationGareId),
    ]);
    const complets = disposerArrets(
      ligne.arrets,
      travail.arrets,
      origine?.ville ?? ligne.arrets[0]?.nom ?? "",
      destination?.ville ?? ligne.arrets[ligne.arrets.length - 1]?.nom ?? "",
    );
    const heureAvant = new Map(publie.horaires.map((h) => [h.id, h.heure]));
    const departs = [...travail.horaires]
      .sort((a, b) => a.heure.localeCompare(b.heure))
      .map((h): DepartEditableReponse => {
        const avant = h.id === null ? undefined : heureAvant.get(h.id);
        return {
          id: h.id,
          heure: h.heure,
          heureInitiale: avant !== undefined && avant !== h.heure ? avant : null,
          classe: h.classe,
          prix: travail.tarifs[h.classe],
          actif: h.actif,
          note: h.note,
          jours: h.jours,
          nouveau: h.id === null,
        };
      });
    const enAttente = reglage?.brouillon && reglage.effetDu ? reglage : null;
    return {
      id: ligne.id,
      nom: origine && destination ? nomDeLigne(origine, destination) : ligne.code,
      departs,
      tarifs: travail.tarifs,
      arrets: travail.arrets.map((a, i) => ({
        nom: a.nom,
        prorata: prorataDe(complets, i + 1, travail.tarifs.classique),
        montee: a.montee,
      })),
      plan: travail.plan,
      options: travail.options,
      brouillon: {
        modifications: enAttente ? compterModifications(publie, travail) : 0,
        publicationA: enAttente ? `${enAttente.effetDu}T00:00:00.000+01:00` : null,
      },
    };
  }

  /* ------------------------------------------------------------------ internes */

  private async publier(ligne: LigneAdmin, voulu: EtatLigne): Promise<void> {
    const [origine, destination] = await Promise.all([
      this.annuaire.gare(ligne.origineGareId),
      this.annuaire.gare(ligne.destinationGareId),
    ]);
    const frais = (await this.lignes.trouver(ligne.id)) ?? ligne;
    await this.lignes.publier(ligne.id, {
      tarifs: voulu.tarifs,
      horaires: voulu.horaires,
      plan: voulu.plan,
      options: voulu.options,
      arrets: disposerArrets(
        frais.arrets,
        voulu.arrets,
        frais.arrets[0]?.nom ?? origine?.ville ?? "",
        frais.arrets[frais.arrets.length - 1]?.nom ?? destination?.ville ?? "",
      ),
    });
  }

  private traduire(e: unknown): unknown {
    if (e instanceof HoraireEnDouble) {
      return invalide(
        "HORAIRE_EN_DOUBLE",
        `Deux départs actifs à ${e.heure} sur cette ligne : un seul par heure`,
      );
    }
    if (e instanceof HoraireInconnu) {
      return introuvable("HORAIRE_INCONNU", `Départ « ${e.horaireId} » inconnu sur cette ligne`);
    }
    return e;
  }

  private async gareDeLaCompagnie(compagnieId: string, gareId: string): Promise<GareAdmin> {
    const gare = await this.annuaire.gare(gareId);
    if (!gare || gare.compagnieId !== compagnieId) {
      throw introuvable("GARE_INCONNUE", `Gare « ${gareId} » inconnue dans votre agence`);
    }
    return gare;
  }

  private accuse(
    u: Utilisateur,
    journalId: string,
    ligne: LigneEditableReponse,
  ): LignePublieeReponse {
    return {
      journalId,
      signeA: versIsoDouala(this.horloge.maintenant()),
      signePar: u.id,
      ligne,
    };
  }

  /** Vérifie le PIN ; un refus (PIN faux, compte bloqué…) entre au journal d'audit. */
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
          cible: cibleId ? { type: "ligne", id: cibleId } : null,
          details: { statut: e.getStatus(), methode: signature.methode },
        });
      }
      throw e;
    }
  }
}

function versHoraire(d: {
  id: string | null;
  heure: string;
  classe: ClasseDepart;
  actif: boolean;
  note: string | null;
  jours: Jour[];
}): HoraireModifie {
  return {
    id: d.id,
    heure: d.heure,
    classe: d.classe,
    actif: d.actif,
    note: d.note === null || d.note === "" ? null : d.note,
    jours: joursTries(d.jours),
  };
}

/** Les horaires dans un ordre qui ne dépend pas de celui de la saisie. */
const canon = (horaires: readonly HoraireModifie[]): HoraireModifie[] =>
  [...horaires].sort(
    (a, b) => a.heure.localeCompare(b.heure) || (a.id ?? "").localeCompare(b.id ?? ""),
  );

/** Les sections qui diffèrent de l'état publié, ou `null` s'il n'y en a aucune. */
function sectionsDifferentes(publie: EtatLigne, voulu: EtatLigne): SectionsLigne | null {
  const sections: SectionsLigne = {};
  if (JSON.stringify(publie.tarifs) !== JSON.stringify(voulu.tarifs))
    sections.tarifs = voulu.tarifs;
  if (JSON.stringify(publie.arrets) !== JSON.stringify(voulu.arrets))
    sections.arrets = voulu.arrets;
  if (JSON.stringify(canon(publie.horaires)) !== JSON.stringify(canon(voulu.horaires))) {
    sections.horaires = voulu.horaires;
  }
  if (JSON.stringify(publie.plan) !== JSON.stringify(voulu.plan)) sections.plan = voulu.plan;
  if (JSON.stringify(publie.options) !== JSON.stringify(voulu.options))
    sections.options = voulu.options;
  return Object.keys(sections).length > 0 ? sections : null;
}
