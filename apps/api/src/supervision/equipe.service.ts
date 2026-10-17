import { Injectable } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { HachageService } from "../socle/auth/hachage.service";
import { ComptesService } from "../socle/comptes/comptes.service";
import {
  PersonnesRepository,
  type PersonneEnregistree,
} from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { conflit, interdit, introuvable, invalide, serviceIndisponible } from "../caisse/erreurs";
import { initiales, nomAbrege } from "../caisse/format";
import { IdempotenceService } from "../caisse/journal/idempotence.service";
import { JournalSigneService } from "../caisse/journal/journal.service";
import { AlertesPatron, GuichetsAgence, SessionsCaisse } from "../caisse/ports";
import { BLOCAGE_PIN_MINUTES, ESSAIS_PIN_MAX, PIN_PROVISOIRE_MINUTES } from "../caisse/regles";
import {
  debutJourDoualaMs,
  jourMoisCourt,
  MS_PAR_JOUR,
  MS_PAR_MINUTE,
  versIsoDouala,
} from "../caisse/temps";
import { gareDe } from "./commun";
import {
  lireAffectation,
  lireCompteDesactive,
  lirePersonneDebloquee,
  lirePinRenouvele,
} from "./evenements";
import { genererPinProvisoire } from "./pin.service";
import { EquipeGare, PinsEquipe, SourceGare, type MembreEquipe, type RoleEquipe } from "./ports";
import { ValidationSuperviseurService } from "./validation.service";

type EtatPin = "ok" | "a_renouveler" | "bloque";

const ACTIONS_FICHE = [
  "renouveler_pin",
  "changer_affectation",
  "voir_journal",
  "desactiver",
] as const;

/** Écarts non nuls sur 10 jours à partir desquels l'équipe signale la personne. */
export const SEUIL_ALERTE_ECARTS = 3;
const JOURS_ALERTE = 10;

const LIBELLES_ROLE: Readonly<Record<RoleEquipe, [string, string]>> = {
  guichetier: ["guichetier", "guichetiers"],
  convoyeur: ["convoyeur", "convoyeurs"],
  chauffeur: ["chauffeur", "chauffeurs"],
  controleur: ["contrôleur", "contrôleurs"],
  superviseur: ["superviseur", "superviseurs"],
};

/**
 * L'équipe de la gare : un compte et un PIN chacun. Le superviseur renouvelle un PIN (provisoire,
 * valable 1 h, envoyé par SMS), change une affectation, désactive un compte, débloque une personne
 * après 3 PIN faux. Chaque action exige la preuve de son PIN et laisse une entrée au journal.
 *
 * Un PIN n'est jamais lisible : on ne conserve que son haché argon2id (avec le poivre du serveur),
 * le PIN provisoire n'existe qu'une fraction de seconde en mémoire puis dans le SMS, et il n'entre ni
 * dans une réponse, ni dans le journal, ni dans l'audit.
 */
@Injectable()
export class EquipeService {
  constructor(
    private readonly equipe: EquipeGare,
    private readonly source: SourceGare,
    private readonly pins: PinsEquipe,
    private readonly personnes: PersonnesRepository,
    private readonly comptes: ComptesService,
    private readonly hachage: HachageService,
    private readonly sms: SmsGateway,
    private readonly sessions: SessionsCaisse,
    private readonly guichets: GuichetsAgence,
    private readonly alertes: AlertesPatron,
    private readonly journal: JournalSigneService,
    private readonly idem: IdempotenceService,
    private readonly validation: ValidationSuperviseurService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ lecture */

  /** `agence.superviseur.equipe` : l'équipe de la gare et la fiche de la personne choisie. */
  async lire(params: { gareId?: string; personneId?: string }, u: Utilisateur) {
    const gareId = gareDe(u, params.gareId);
    const gare = await this.source.gare(gareId);
    if (!gare) throw introuvable("GARE_INCONNUE", "Gare inconnue");
    const lignes = await Promise.all((await this.equipe.lister(gareId)).map((m) => this.ligne(m)));
    const enService = lignes.filter((l) => l.membre.situationDuJour !== "hors_service");
    const horsService = lignes.filter((l) => l.membre.situationDuJour === "hors_service");

    // Sans `personneId`, la fiche s'ouvre sur la première personne qui demande de l'attention.
    let choisie = lignes.find((l) => l.membre.personneId === params.personneId);
    if (params.personneId && !choisie) {
      throw introuvable("PERSONNE_INCONNUE", "Personne inconnue dans cette gare");
    }
    choisie ??=
      lignes.find((l) => l.pin === "a_renouveler") ?? lignes.find((l) => l.pin === "bloque");

    return {
      gare: { id: gare.id, nom: gare.nom },
      effectif: lignes.length,
      enService: enService.map((l) => l.personne),
      autres: {
        nombre: horsService.length,
        detail: detailAutres(horsService.map((l) => l.membre.role)),
      },
      fiche: choisie
        ? {
            personneId: choisie.membre.personneId,
            nom: choisie.nomComplet,
            role: choisie.membre.role,
            depuisLibelle: `depuis le ${jourMoisCourt(choisie.membre.depuis)}`,
            billets: choisie.membre.billets,
            actions: [...ACTIONS_FICHE],
            personnesADebloquer: lignes
              .filter(
                (l) => l.pin === "bloque" && l.membre.personneId !== choisie.membre.personneId,
              )
              .map((l) => ({ id: l.membre.personneId, nom: l.nomComplet })),
          }
        : null,
      pinProvisoireMinutes: PIN_PROVISOIRE_MINUTES,
    };
  }

  /** Une ligne de l'équipe : la personne du socle, son PIN, ses alertes. */
  private async ligne(m: MembreEquipe) {
    const p = await this.personnes.trouverParId(m.personneId);
    const pin = await this.etatPin(m.personneId, p);
    const maintenant = this.horloge.maintenant();
    const bloque = pin === "bloque";
    const nom = p?.nom || "Inconnu";
    return {
      membre: m,
      pin,
      personne: {
        personneId: m.personneId,
        initiales: initiales(nom),
        nom: nomAbrege(nom),
        role: m.role,
        affectation: m.affectation,
        statut: bloque
          ? ("bloquee" as const)
          : m.situationDuJour === "a_bord"
            ? ("a_bord" as const)
            : ("en_service" as const),
        pin: {
          etat: pin,
          fauxEssais: bloque ? ESSAIS_PIN_MAX : (p?.echecsConnexion ?? 0),
          bloqueA:
            bloque && p?.bloqueJusqua
              ? versIsoDouala(p.bloqueJusqua.getTime() - BLOCAGE_PIN_MINUTES * MS_PAR_MINUTE)
              : null,
        },
        alerte: bloque ? null : await this.alerteEcarts(m.personneId, maintenant),
        situation: m.situation,
      },
      nomComplet: nom,
    };
  }

  /** « 3 écarts en 10 jours » quand l'agent a trois caisses (ou plus) qui ne tombent pas juste. */
  private async alerteEcarts(personneId: string, maintenant: Date): Promise<string | null> {
    const depuis = versIsoDouala(debutJourDoualaMs(maintenant) - (JOURS_ALERTE - 1) * MS_PAR_JOUR);
    const sessions = (await this.sessions.deAgent(personneId, depuis)).filter(
      (s) => s.cloture && s.cloture.ecart !== 0,
    );
    return sessions.length >= SEUIL_ALERTE_ECARTS
      ? `${sessions.length} écarts en ${JOURS_ALERTE} jours`
      : null;
  }

  private async etatPin(personneId: string, p?: PersonneEnregistree | null): Promise<EtatPin> {
    const personne = p === undefined ? await this.personnes.trouverParId(personneId) : p;
    if (personne?.bloqueJusqua && personne.bloqueJusqua > this.horloge.maintenant())
      return "bloque";
    const etat = await this.pins.lire(personneId);
    return etat.provisoireJusqua ? "a_renouveler" : "ok";
  }

  /* ------------------------------------------------------------------ actions */

  /** Un PIN provisoire, valable 1 h, part par SMS : la personne le remplace à sa prochaine connexion. */
  async renouvelerPin(corps: unknown, u: Utilisateur) {
    const e = lirePinRenouvele(corps);
    this.validation.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      await this.validation.exiger(corps, e.donnees.validePar, u, e.type);
      const cible = await this.cible(e.donnees.personneId, u);
      const personne = await this.personnes.trouverParId(cible.personneId);
      if (!personne) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");

      const pin = genererPinProvisoire();
      const jusqua = new Date(
        this.horloge.maintenant().getTime() + PIN_PROVISOIRE_MINUTES * MS_PAR_MINUTE,
      );
      await this.pins.definirProvisoire(cible.personneId, await this.hachage.hacher(pin), jusqua);
      // Un nouveau PIN lève aussi un blocage : la personne n'a plus l'ancien en tête.
      await this.personnes.enregistrerEchec(cible.personneId, 0, null);
      try {
        await this.sms.envoyer(
          this.comptes.telephoneEnClair(personne),
          `AfriMove : votre PIN provisoire est ${pin}. Il est valable ${PIN_PROVISOIRE_MINUTES / 60} h. ` +
            "Changez-le à votre prochaine connexion. Ne le donnez à personne.",
        );
      } catch {
        throw serviceIndisponible(
          "SMS_ECHEC",
          "Le SMS du PIN provisoire n'a pas pu partir : renouvelez le PIN pour réessayer",
        );
      }
      await this.audit.enregistrer({
        acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
        action: "equipe.pin_renouvele",
        resultat: "succes",
        cible: { type: "personne", id: cible.personneId },
      });
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume: `PIN provisoire de ${personne.nom || "la personne"} envoyé par SMS (valable ${PIN_PROVISOIRE_MINUTES / 60} h)`,
        validePar: e.donnees.validePar,
        gareId: cible.gareId,
        compagnieId: cible.compagnieId,
      });
      return this.resultat(cible.personneId, true, true);
    });
  }

  async changerAffectation(corps: unknown, u: Utilisateur) {
    const e = lireAffectation(corps);
    this.validation.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      const d = e.donnees;
      await this.validation.exiger(corps, d.validePar, u, e.type);
      if (d.guichetId === null && d.role === null) {
        throw invalide("AFFECTATION_VIDE", "Précisez un guichet ou un rôle");
      }
      if (d.role === "superviseur") {
        throw interdit("ROLE_INTERDIT", "Seul le patron nomme un superviseur");
      }
      const cible = await this.cible(d.personneId, u);
      let rang: number | null = null;
      if (d.guichetId !== null) {
        const guichet = await this.guichets.trouver(d.guichetId);
        if (!guichet || guichet.gareId !== cible.gareId) {
          throw introuvable("GUICHET_INCONNU", "Guichet inconnu dans cette gare");
        }
        rang = guichet.rang;
      }
      await this.equipe.changerAffectation(cible.personneId, {
        guichetId: d.guichetId,
        role: d.role,
      });
      const personne = await this.personnes.trouverParId(cible.personneId);
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume:
          `Affectation de ${personne?.nom || "la personne"} changée` +
          (rang !== null ? ` · guichet ${rang}` : "") +
          (d.role !== null ? ` · rôle ${LIBELLES_ROLE[d.role][0]}` : ""),
        validePar: d.validePar,
        gareId: cible.gareId,
        compagnieId: cible.compagnieId,
      });
      return this.resultat(cible.personneId, true, false);
    });
  }

  /** Désactiver un compte : immédiat, le patron est prévenu. */
  async desactiver(corps: unknown, u: Utilisateur) {
    const e = lireCompteDesactive(corps);
    this.validation.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      await this.validation.exiger(corps, e.donnees.validePar, u, e.type);
      if (e.donnees.personneId === u.id) {
        throw interdit("AUTO_DESACTIVATION", "Vous ne pouvez pas désactiver votre propre compte");
      }
      const cible = await this.cible(e.donnees.personneId, u);
      const personne = await this.personnes.trouverParId(cible.personneId);
      await this.equipe.desactiver(cible.personneId);
      await this.audit.enregistrer({
        acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
        action: "equipe.compte_desactive",
        resultat: "succes",
        cible: { type: "personne", id: cible.personneId },
      });
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume: `Compte de ${personne?.nom || "la personne"} désactivé`,
        validePar: e.donnees.validePar,
        gareId: cible.gareId,
        compagnieId: cible.compagnieId,
      });
      await this.alertes.alerter({
        type: "compte_desactive",
        compagnieId: cible.compagnieId,
        gareId: cible.gareId,
        message: `Le compte de ${personne?.nom || "une personne"} a été désactivé par un superviseur.`,
        details: { personneId: cible.personneId, parId: u.id },
      });
      return this.resultat(cible.personneId, false, false);
    });
  }

  /** Débloquer une personne dont le compte est bloqué après 3 PIN faux. */
  async debloquer(corps: unknown, u: Utilisateur) {
    const e = lirePersonneDebloquee(corps);
    this.validation.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      await this.validation.exiger(corps, e.donnees.validePar, u, e.type);
      const cible = await this.cible(e.donnees.personneId, u);
      const personne = await this.personnes.trouverParId(cible.personneId);
      if (!personne?.bloqueJusqua || personne.bloqueJusqua <= this.horloge.maintenant()) {
        throw conflit("COMPTE_NON_BLOQUE", "Ce compte n'est pas bloqué");
      }
      await this.personnes.enregistrerEchec(cible.personneId, 0, null);
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume: `Compte de ${personne.nom || "la personne"} débloqué après 3 PIN faux`,
        validePar: e.donnees.validePar,
        gareId: cible.gareId,
        compagnieId: cible.compagnieId,
      });
      return this.resultat(cible.personneId, true, false);
    });
  }

  /* ------------------------------------------------------------------ outils */

  /** La personne visée : de ma gare, active, et jamais un autre superviseur. */
  private async cible(personneId: string, u: Utilisateur): Promise<MembreEquipe> {
    const gareId = gareDe(u);
    const membre = await this.equipe.trouver(personneId);
    if (!membre || membre.gareId !== gareId || !membre.actif) {
      throw introuvable("PERSONNE_INCONNUE", "Personne inconnue dans cette gare");
    }
    if (membre.role === "superviseur") {
      throw interdit("ROLE_PROTEGE", "Les superviseurs sont gérés par le patron");
    }
    return membre;
  }

  private async resultat(personneId: string, actif: boolean, smsProvisoireEnvoye: boolean) {
    return {
      personne: { personneId, actif, pin: await this.etatPin(personneId), smsProvisoireEnvoye },
    };
  }
}

/** « 2 convoyeurs, 2 chauffeurs, 1 guichetier » : les personnes hors service, par rôle. */
export function detailAutres(roles: readonly RoleEquipe[]): string | null {
  if (roles.length === 0) return null;
  const ordre = Object.keys(LIBELLES_ROLE) as RoleEquipe[];
  return ordre
    .map((r) => [r, roles.filter((x) => x === r).length] as const)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${LIBELLES_ROLE[r][n > 1 ? 1 : 0]}`)
    .join(", ");
}
