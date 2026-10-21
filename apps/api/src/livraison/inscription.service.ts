import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ErreurColis } from "../colis/erreurs";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePersonnes } from "../relais/annuaire";
import { AttributionRoles, CompteursDossiers, Portefeuille } from "../relais/ports";
import {
  NOTE_INITIALE,
  codeDossier,
  codeVille,
  libelleOperateur,
  masquerMomo,
  normaliser,
  operateurProbable,
} from "../relais/regles";
import { debutDeSemaine, enMs, versIsoDouala } from "../relais/temps";
import {
  CHARGES_PROPOSEES,
  DEPLACEMENTS_PROPOSES,
  HEURES_PROPOSEES,
  PROGRAMME_LIVREUR,
  SUIVI_LIVREUR,
  SUITE_DEMANDE_LIVREUR,
  ZONES_PROPOSEES,
} from "./contenu";
import type { MomoPartenaire } from "../relais/modele";
import type { DemandeLivreur, Deplacement, LivreurStocke } from "./modele";
import { DemandesLivreurRepository, LivreursRepository } from "./ports";
import { TARIFS, encoreValable, gainLivreur, lireChargeKg, lireHeures, lireZone } from "./regles";
import type { DemandeLivreurSaisie, VerificationLivreur } from "./validation";

const MAX_TENTATIVES = 10;

const LIBELLE_DEPLACEMENT: Record<Deplacement, string> = {
  moto: "Moto",
  velo: "Vélo",
  pied: "À pied",
  tricycle: "Tricycle · gros colis",
};

/**
 * Inscription d'un livreur : programme, dépôt de la demande, suivi, puis la vérification d'un agent
 * AfriMove (CNI et MoMo au même nom, permis et assurance, formation de 10 minutes) et l'activation
 * (le compte reçoit le rôle `livreur`, le dossier devient son badge) ou le refus.
 */
@Injectable()
export class InscriptionLivreurService {
  constructor(
    private readonly livreurs: LivreursRepository,
    private readonly demandes: DemandesLivreurRepository,
    private readonly compteurs: CompteursDossiers,
    private readonly portefeuille: Portefeuille,
    private readonly roles: AttributionRoles,
    private readonly annuaire: AnnuairePersonnes,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  private maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /* -------------------------------------------------------------- page « Deviens livreur » */

  /** `SchemaProgrammeLivreur` : gain par course, choix à faire, pièces, règles ; les chiffres sont réels. */
  async programme(utilisateur: Utilisateur) {
    const contact = await this.annuaire.contact(utilisateur.id);
    const actifs = await this.livreurs.lister({ actif: true });
    const villes = new Set(actifs.map((l) => normaliser(l.ville))).size;
    const maintenant = this.maintenant();
    const cetteSemaine = debutDeSemaine(maintenant);
    const semaineDerniere = debutDeSemaine(enMs(cetteSemaine) - 1);
    const credits = await this.portefeuille.creditsPeriode(
      "livreur",
      semaineDerniere,
      cetteSemaine,
    );

    const parLivreur = new Map<string, { courses: number; gain: number }>();
    for (const c of credits) {
      const total = parLivreur.get(c.partenaireId) ?? { courses: 0, gain: 0 };
      total.courses += 1;
      total.gain += c.montant;
      parLivreur.set(c.partenaireId, total);
    }
    const [meilleur] = [...parLivreur.entries()].sort((a, b) => b[1].gain - a[1].gain);
    const exemple = meilleur ? await this.livreurs.trouver(meilleur[0]) : null;
    const p = PROGRAMME_LIVREUR.particularites;
    const momo = this.momoDuCompte(contact.telephone);

    return {
      titre: PROGRAMME_LIVREUR.titre,
      detail: PROGRAMME_LIVREUR.detail,
      partParCourse: gainLivreur(TARIFS.livraison.minimum),
      livreursActifs: actifs.length,
      villes: Math.max(1, villes),
      exemple: {
        nom: exemple?.nom ?? "",
        courses: meilleur?.[1].courses ?? 0,
        gain: meilleur?.[1].gain ?? 0,
      },
      particularites: {
        titre: p.titre,
        deplacement: { libelle: p.deplacement, choix: [...DEPLACEMENTS_PROPOSES] },
        zone: { libelle: p.zone, choix: [...ZONES_PROPOSEES], valeur: ZONES_PROPOSEES[0] },
        heures: { libelle: p.heures, choix: [...HEURES_PROPOSEES], valeur: HEURES_PROPOSEES[0] },
        charge: { libelle: p.charge, choix: [...CHARGES_PROPOSEES], valeur: CHARGES_PROPOSEES[0] },
        momo: {
          libelle: p.momo,
          valeurMasquee: `${masquerMomo(momo.telephone)} · ${libelleOperateur(momo.operateur)}`,
        },
      },
      pieces: PROGRAMME_LIVREUR.pieces.map((x) => ({ ...x })),
      regles: { ...PROGRAMME_LIVREUR.regles },
      mention: PROGRAMME_LIVREUR.mention,
    };
  }

  /** Le MoMo du compte : son numéro, et l'opérateur que son préfixe laisse deviner (MTN à défaut). */
  private momoDuCompte(telephone: string): MomoPartenaire {
    return { telephone, operateur: operateurProbable(telephone) ?? "mtn" };
  }

  /* -------------------------------------------------------------- dépôt */

  private verifierDemande(saisie: DemandeLivreurSaisie): { ville: string } {
    const erreurs: { chemin: string; message: string }[] = [];
    const zone = lireZone(saisie.zone);
    if (!zone)
      erreurs.push({
        chemin: "zone",
        message: "Zone illisible (ex. « Bafoussam · toute la ville »)",
      });
    if (lireHeures(saisie.heures) === null) {
      erreurs.push({ chemin: "heures", message: "Heures illisibles (ex. « Soirs 17 h – 21 h »)" });
    }
    if (lireChargeKg(saisie.chargeMax) === null) {
      erreurs.push({
        chemin: "chargeMax",
        message: "Charge illisible (ex. « 10 kg · colis courants »)",
      });
    }
    if (saisie.deplacement === "moto") {
      if (saisie.pieces.permisRef === null) {
        erreurs.push({
          chemin: "pieces.permisRef",
          message: "La photo du permis est requise à moto",
        });
      }
      if (saisie.pieces.assuranceRef === null) {
        erreurs.push({
          chemin: "pieces.assuranceRef",
          message: "La photo de l'assurance est requise à moto",
        });
      }
    }
    if (erreurs.length > 0 || !zone) {
      throw new ErreurColis(422, "demande_invalide", "La demande est invalide", erreurs);
    }
    return { ville: zone.ville };
  }

  /** `SchemaDemandeDeposee` : la demande est envoyée, le dossier L-… est ouvert. */
  async deposer(utilisateur: Utilisateur, saisie: DemandeLivreurSaisie) {
    const { ville } = this.verifierDemande(saisie);
    if (await this.livreurs.parPersonne(utilisateur.id)) {
      throw new ErreurColis(409, "deja_livreur", "Vous êtes déjà livreur");
    }
    const contact = await this.annuaire.contact(utilisateur.id);
    const deposeeA = this.maintenant();
    const prefixe = `L-${codeVille(ville)}`;
    // Hors moto, il n'y a ni permis ni assurance à regarder : cette étape est faite d'office.
    const sansPieces = saisie.deplacement !== "moto";

    let dossier: string | null = null;
    for (let essai = 0; essai < MAX_TENTATIVES && dossier === null; essai++) {
      const numero = await this.compteurs.prochain(prefixe);
      const candidat = codeDossier(prefixe, numero);
      const demande: DemandeLivreur = {
        dossier: candidat,
        version: 1,
        personneId: utilisateur.id,
        numero,
        ville,
        deplacement: saisie.deplacement,
        zone: saisie.zone,
        heures: saisie.heures,
        chargeMax: saisie.chargeMax,
        // Sans MoMo dans la demande : celui du compte, le numéro que le formulaire proposait.
        momo: saisie.momo ?? this.momoDuCompte(contact.telephone),
        pieces: saisie.pieces,
        deposeeA,
        verifications: {
          identiteA: null,
          piecesA: sansPieces ? deposeeA : null,
          permisValideJusqua: null,
          assuranceExpireLe: null,
          formationA: null,
        },
        etat: "recue",
        decision: null,
        livreurId: null,
      };
      const resultat = await this.demandes.ajouter(demande);
      if (resultat === "demande_en_cours") {
        throw new ErreurColis(409, "demande_en_cours", "Une demande est déjà en cours");
      }
      if (resultat === "ajoutee") dossier = candidat;
    }
    if (dossier === null) {
      throw new ErreurColis(
        503,
        "dossier_indisponible",
        "Numéro de dossier indisponible, réessayez",
      );
    }

    await this.annuaire.prevenir(
      contact.telephone,
      `AfriMove : votre demande de livreur est bien reçue (dossier ${dossier}). ` +
        "Un agent vérifie vos pièces, puis 10 minutes de formation en vidéo.",
    );
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: "voyageur", compagnieId: null },
      action: "livreur.demande_deposee",
      resultat: "succes",
      cible: { type: "demande", id: dossier },
      details: { dossier, ville, deplacement: saisie.deplacement },
    });
    return { dossier, deposeeLe: deposeeA, suite: SUITE_DEMANDE_LIVREUR };
  }

  /* -------------------------------------------------------------- suivi de la demande */

  private async demandeDe(
    utilisateur: Utilisateur,
    dossier: string | undefined,
  ): Promise<DemandeLivreur> {
    const demande = dossier
      ? await this.demandes.trouver(dossier)
      : await this.demandes.derniereDe(utilisateur.id);
    // Le dossier d'un autre ne se distingue pas d'un dossier qui n'existe pas.
    if (!demande || demande.personneId !== utilisateur.id) {
      throw new ErreurColis(404, "demande_introuvable", "Aucune demande trouvée");
    }
    return demande;
  }

  /** `SchemaSuiviDemande` (type « livreur ») : les jalons en direct, le badge réservé, la première soirée. */
  async suivi(utilisateur: Utilisateur, dossier: string | undefined) {
    const demande = await this.demandeDe(utilisateur, dossier);
    const activee = demande.etat === "activee";
    const refusee = demande.etat === "refusee";
    const jalons = SUIVI_LIVREUR.jalons;
    const v = demande.verifications;
    const gain = gainLivreur(TARIFS.livraison.minimum);

    return {
      type: "livreur" as const,
      dossier: demande.dossier,
      statut: activee
        ? ("active" as const)
        : refusee
          ? ("refusee" as const)
          : ("en_cours" as const),
      titre: activee ? "Livreur actif" : refusee ? "Demande refusée" : SUIVI_LIVREUR.titre,
      detail: activee
        ? `Ton badge ${demande.dossier} est actif · l'app passe en mode livreur`
        : refusee
          ? (demande.decision?.motif ?? "Ta demande n'a pas été retenue")
          : `Dossier ${demande.dossier} · ${SUITE_DEMANDE_LIVREUR}`,
      etape: activee ? { courante: 3, total: 3 } : refusee ? null : { courante: 2, total: 3 },
      jalons: [
        {
          fait: true,
          libelle: jalons.fiche.libelle,
          detail: jalons.fiche.detail,
          a: demande.deposeeA,
        },
        {
          fait: v.identiteA !== null,
          libelle: jalons.identite.libelle,
          detail: jalons.identite.detail,
          a: v.identiteA,
        },
        {
          fait: v.piecesA !== null,
          libelle: jalons.pieces.libelle,
          detail: jalons.pieces.detail,
          a: v.piecesA,
        },
        {
          fait: v.formationA !== null,
          libelle: jalons.formation.libelle,
          detail: jalons.formation.detail,
          a: v.formationA,
        },
        {
          fait: activee,
          libelle: "Activation",
          detail: jalons.activation(demande.numero),
          a: activee ? (demande.decision?.a ?? null) : null,
        },
      ],
      reservation: {
        libelle: SUIVI_LIVREUR.badge.libelle,
        valeur: demande.dossier,
        activation: activee ? "actif" : SUIVI_LIVREUR.badge.activation,
      },
      demo: { ...SUIVI_LIVREUR.demo },
      recit: { titre: SUIVI_LIVREUR.recit.titre, texte: SUIVI_LIVREUR.recit.texte(gain) },
      mention: null,
      complement: {
        titre: SUIVI_LIVREUR.complement.titre,
        texte:
          `${LIBELLE_DEPLACEMENT[demande.deplacement]} · ${demande.zone} · ${demande.heures} · ` +
          `jusqu'à ${demande.chargeMax}`,
      },
      agent: null,
    };
  }

  /* -------------------------------------------------------------- agents AfriMove */

  private async modifier(
    dossier: string,
    transformer: (demande: DemandeLivreur) => DemandeLivreur,
  ): Promise<DemandeLivreur> {
    for (let essai = 0; essai < MAX_TENTATIVES; essai++) {
      const lue = await this.demandes.trouver(dossier);
      if (!lue) throw new ErreurColis(404, "demande_introuvable", "Aucune demande trouvée");
      const suivante = transformer(lue);
      if (await this.demandes.remplacer(suivante, lue.version)) {
        return { ...suivante, version: lue.version + 1 };
      }
    }
    throw new ErreurColis(
      409,
      "CONFLIT_ECRITURE",
      "La demande est modifiée en même temps, réessayez",
    );
  }

  private acteur(agent: Utilisateur) {
    return { id: agent.id, role: agent.role, compagnieId: agent.compagnieId };
  }

  /**
   * L'agent coche ce qu'il a vérifié : la CNI et le MoMo au même nom, le permis et l'assurance (avec leur
   * date de fin, elles doivent être valables), la formation. Rejouer une vérification ne change pas
   * l'heure déjà enregistrée.
   */
  async verifier(agent: Utilisateur, dossier: string, verification: VerificationLivreur) {
    const a = this.maintenant();
    if (verification.pieces) {
      const { permisValideJusqua, assuranceExpireLe } = verification.pieces;
      if (!encoreValable(permisValideJusqua, a) || !encoreValable(assuranceExpireLe, a)) {
        throw new ErreurColis(422, "piece_expiree", "Le permis ou l'assurance est expiré");
      }
    }
    const demande = await this.modifier(dossier, (d) => {
      if (d.etat !== "recue") {
        throw new ErreurColis(409, "etat_incompatible", "Cette demande est déjà traitée");
      }
      const v = d.verifications;
      return {
        ...d,
        verifications: {
          identiteA: v.identiteA ?? (verification.identite ? a : null),
          piecesA: verification.pieces ? (v.piecesA ?? a) : v.piecesA,
          permisValideJusqua: verification.pieces?.permisValideJusqua ?? v.permisValideJusqua,
          assuranceExpireLe: verification.pieces?.assuranceExpireLe ?? v.assuranceExpireLe,
          formationA: v.formationA ?? (verification.formation ? a : null),
        },
      };
    });
    await this.audit.enregistrer({
      acteur: this.acteur(agent),
      action: "livreur.verification",
      resultat: "succes",
      cible: { type: "demande", id: dossier },
      details: { dossier },
    });
    return { dossier, etat: demande.etat, verifications: demande.verifications };
  }

  /**
   * L'agent active le livreur quand tout est vérifié : le livreur est créé (le dossier devient son
   * badge), le compte reçoit le rôle `livreur`. Rejouer l'activation ne crée pas un second livreur.
   */
  async activer(agent: Utilisateur, dossier: string, details: { moto: string | null }) {
    const lue = await this.demandes.trouver(dossier);
    if (!lue) throw new ErreurColis(404, "demande_introuvable", "Aucune demande trouvée");
    if (lue.etat === "activee") return this.reponseActivation(lue);
    if (lue.etat === "refusee") {
      throw new ErreurColis(409, "etat_incompatible", "Cette demande est refusée");
    }
    const v = lue.verifications;
    if (v.identiteA === null || v.piecesA === null || v.formationA === null) {
      throw new ErreurColis(
        409,
        "verifications_incompletes",
        "La CNI, les pièces et la formation doivent être vérifiées avant l'activation",
      );
    }
    if (lue.deplacement === "moto" && details.moto === null) {
      throw new ErreurColis(422, "moto_requise", "Indiquez l'immatriculation de la moto");
    }
    const a = this.maintenant();
    const contact = await this.annuaire.contact(lue.personneId);
    const livreur: LivreurStocke = {
      id: randomUUID(),
      version: 1,
      badge: lue.dossier,
      numero: lue.numero,
      personneId: lue.personneId,
      nom: contact.nom,
      ville: lue.ville,
      deplacement: lue.deplacement,
      zone: lue.zone,
      heures: lue.heures,
      chargeMax: lue.chargeMax,
      momo: lue.momo,
      pieces: {
        permisRef: lue.pieces.permisRef,
        assuranceRef: lue.pieces.assuranceRef,
        permisValideJusqua: v.permisValideJusqua,
        assuranceExpireLe: v.assuranceExpireLe,
      },
      moto: details.moto,
      // Le livreur se met en ligne lui-même : on ne lui propose rien avant qu'il l'ait décidé.
      disponible: false,
      actif: true,
      note: NOTE_INITIALE,
      creeA: a,
    };
    const cree = await this.livreurs.ajouter(livreur);
    const retenu = cree ? livreur : await this.livreurs.parPersonne(lue.personneId);
    if (!retenu || retenu.badge !== lue.dossier) {
      throw new ErreurColis(409, "livreur_existant", "Cette personne est déjà livreur");
    }

    let demande: DemandeLivreur;
    try {
      demande = await this.modifier(dossier, (d) => {
        if (d.etat === "activee") return d;
        if (d.etat !== "recue") {
          throw new ErreurColis(409, "etat_incompatible", "Cette demande vient d'être traitée");
        }
        return {
          ...d,
          etat: "activee",
          livreurId: retenu.id,
          decision: { a, par: agent.id, motif: null },
        };
      });
    } catch (e) {
      // Refusée entre-temps : le livreur créé juste avant ne doit pas rester actif.
      if (cree) await this.livreurs.remplacer({ ...livreur, actif: false }, livreur.version);
      throw e;
    }
    await this.roles.ajouterRole(lue.personneId, "livreur");
    await this.annuaire.prevenir(
      contact.telephone,
      `AfriMove : votre badge livreur ${lue.dossier} est actif. Ouvrez l'app, elle passe en mode livreur.`,
    );
    await this.audit.enregistrer({
      acteur: this.acteur(agent),
      action: "livreur.active",
      resultat: "succes",
      cible: { type: "livreur", id: retenu.id },
      details: { dossier },
    });
    return this.reponseActivation(demande);
  }

  private reponseActivation(demande: DemandeLivreur) {
    return { dossier: demande.dossier, etat: demande.etat, livreurId: demande.livreurId };
  }

  async refuser(agent: Utilisateur, dossier: string, motif: string) {
    const a = this.maintenant();
    const demande = await this.modifier(dossier, (d) => {
      if (d.etat !== "recue") {
        throw new ErreurColis(409, "etat_incompatible", "Cette demande est déjà traitée");
      }
      return { ...d, etat: "refusee", decision: { a, par: agent.id, motif } };
    });
    const contact = await this.annuaire.contact(demande.personneId);
    await this.annuaire.prevenir(
      contact.telephone,
      `AfriMove : votre demande ${dossier} n'a pas été retenue. ${motif}`,
    );
    await this.audit.enregistrer({
      acteur: this.acteur(agent),
      action: "livreur.demande_refusee",
      resultat: "succes",
      cible: { type: "demande", id: dossier },
      details: { dossier },
    });
    return { dossier, etat: demande.etat };
  }
}
