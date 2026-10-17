import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ErreurColis } from "../colis/erreurs";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePersonnes } from "./annuaire";
import {
  FORMULAIRE_RELAIS,
  HORAIRES_PROPOSES,
  PROGRAMME_RELAIS,
  SUIVI_RELAIS,
  SUITE_FICHE_RELAIS,
  TAILLES_PROPOSEES,
  TYPES_BOUTIQUE,
} from "./contenu";
import type { BrouillonRelais, DemandeRelais, FicheRelais, PointRelaisStocke } from "./modele";
import {
  AttributionRoles,
  BrouillonsRelais,
  CompteursDossiers,
  DemandesRelaisRepository,
  Portefeuille,
  RelaisRepository,
} from "./ports";
import {
  CAPACITE_PAR_DEFAUT,
  GAIN_REMISE_RELAIS,
  GAIN_REPRISE_RELAIS,
  NOTE_INITIALE,
  codeDossier,
  codeVille,
  libelleOperateur,
  lireHoraires,
  lireTailleMaxKg,
  masquerMomo,
  normaliser,
  operateurProbable,
} from "./regles";
import { debutDeSemaine, enMs, versIsoDouala } from "./temps";
import type { ActivationRelais } from "./validation";

const MAX_TENTATIVES = 10;

/**
 * Inscription d'un commerçant comme point relais : programme, fiche en brouillon, dépôt, suivi, puis
 * la visite d'un agent AfriMove, l'activation (le compte reçoit le rôle `relais`, le dossier devient le
 * code du relais) ou le refus.
 */
@Injectable()
export class InscriptionRelaisService {
  constructor(
    private readonly relais: RelaisRepository,
    private readonly demandes: DemandesRelaisRepository,
    private readonly brouillons: BrouillonsRelais,
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

  /* -------------------------------------------------------------- page « Deviens point de relais » */

  /** `SchemaProgrammeRelais` : ce qu'on gagne, ce qu'il faut, les étapes ; les chiffres sont réels. */
  async programme() {
    const actifs = await this.relais.lister({ actif: true });
    const villes = new Set(actifs.map((r) => normaliser(r.ville))).size;
    const maintenant = this.maintenant();
    const cetteSemaine = debutDeSemaine(maintenant);
    const semaineDerniere = debutDeSemaine(enMs(cetteSemaine) - 1);
    const credits = await this.portefeuille.creditsPeriode("relais", semaineDerniere, cetteSemaine);

    const parRelais = new Map<string, { colis: number; gain: number }>();
    for (const c of credits) {
      const total = parRelais.get(c.partenaireId) ?? { colis: 0, gain: 0 };
      total.gain += c.montant;
      if (c.motif === "remise") total.colis += 1;
      parRelais.set(c.partenaireId, total);
    }
    const [meilleur] = [...parRelais.entries()].sort((a, b) => b[1].gain - a[1].gain);
    const exemple = meilleur ? await this.relais.trouver(meilleur[0]) : null;

    return {
      titre: PROGRAMME_RELAIS.titre,
      detail:
        villes > 0
          ? `${PROGRAMME_RELAIS.detail} · ${villes} ville${villes > 1 ? "s" : ""}`
          : PROGRAMME_RELAIS.detail,
      accroche: PROGRAMME_RELAIS.accroche,
      deroule: PROGRAMME_RELAIS.deroule,
      partParColis: GAIN_REMISE_RELAIS,
      partSiRepris: GAIN_REPRISE_RELAIS,
      relaisActifs: actifs.length,
      villes: Math.max(1, villes),
      exemple: {
        nom: exemple?.nom ?? "",
        colis: meilleur?.[1].colis ?? 0,
        gain: meilleur?.[1].gain ?? 0,
      },
      prerequis: [...PROGRAMME_RELAIS.prerequis],
      etapes: PROGRAMME_RELAIS.etapes.map((e) => ({ ...e })),
      mention: PROGRAMME_RELAIS.mention,
    };
  }

  /* -------------------------------------------------------------- la fiche */

  /** `SchemaFormulaireRelais` : les choix proposés, préremplis avec le brouillon et le compte. */
  async formulaire(utilisateur: Utilisateur) {
    const contact = await this.annuaire.contact(utilisateur.id);
    const brouillon = (await this.brouillons.lire(utilisateur.id))?.fiche ?? {};
    const momo = brouillon.momo ?? {
      telephone: contact.telephone,
      operateur: operateurProbable(contact.telephone) ?? "mtn",
    };
    const position = brouillon.position;
    const libelles = FORMULAIRE_RELAIS.libelles;
    return {
      titre: FORMULAIRE_RELAIS.titre,
      detail: FORMULAIRE_RELAIS.detail,
      fiche: {
        nom: brouillon.nom ?? "",
        type: {
          libelle: libelles.type,
          choix: [...TYPES_BOUTIQUE],
          valeur: brouillon.type ?? TYPES_BOUTIQUE[0],
        },
        ouvert: {
          libelle: libelles.ouvert,
          choix: [...HORAIRES_PROPOSES],
          valeur: brouillon.ouvert ?? HORAIRES_PROPOSES[0],
        },
        position: {
          libelle: libelles.position,
          valeur: position
            ? `${position.ville} · ${position.quartier}${position.repere ? `, ${position.repere}` : ""}`
            : "",
        },
        taille: {
          libelle: libelles.taille,
          choix: [...TAILLES_PROPOSEES],
          valeur: brouillon.tailleMax ?? TAILLES_PROPOSEES[0],
        },
        momo: {
          libelle: libelles.momo,
          valeurMasquee: `${masquerMomo(momo.telephone)} · ${libelleOperateur(momo.operateur)}`,
        },
      },
      pieces: [
        { ...FORMULAIRE_RELAIS.piecesFacade },
        {
          titre: `CNI · ${contact.nom}`,
          detail: FORMULAIRE_RELAIS.pieceIdentite.detail,
        },
      ],
      engagement: { ...FORMULAIRE_RELAIS.engagement },
      mention: FORMULAIRE_RELAIS.mention,
      etape: { ...FORMULAIRE_RELAIS.etape },
    };
  }

  /** `SchemaBrouillonEnregistre` : la fiche à moitié remplie est gardée, champ par champ. */
  async enregistrerBrouillon(utilisateur: Utilisateur, fiche: Partial<FicheRelais>) {
    const enregistreA = this.maintenant();
    const existant = await this.brouillons.lire(utilisateur.id);
    const brouillon: BrouillonRelais = {
      personneId: utilisateur.id,
      fiche: { ...(existant?.fiche ?? {}), ...fiche },
      enregistreA,
    };
    await this.brouillons.enregistrer(brouillon);
    return { enregistreLe: enregistreA };
  }

  private verifierFiche(fiche: FicheRelais): void {
    const erreurs: { chemin: string; message: string }[] = [];
    if (!(TYPES_BOUTIQUE as readonly string[]).includes(fiche.type)) {
      erreurs.push({ chemin: "type", message: "Type de boutique inconnu" });
    }
    if (lireHoraires(fiche.ouvert) === null) {
      erreurs.push({
        chemin: "ouvert",
        message: "Horaires illisibles (ex. « 7 h – 20 h · lun.–sam. »)",
      });
    }
    if (lireTailleMaxKg(fiche.tailleMax) === null) {
      erreurs.push({
        chemin: "tailleMax",
        message: "Taille de colis illisible (ex. « Tous (≤ 30 kg) »)",
      });
    }
    if (erreurs.length > 0) {
      throw new ErreurColis(422, "fiche_invalide", "La fiche est invalide", erreurs);
    }
  }

  /** `SchemaDemandeDeposee` : la fiche est envoyée, le dossier est ouvert. */
  async deposer(utilisateur: Utilisateur, fiche: FicheRelais) {
    this.verifierFiche(fiche);
    if (await this.relais.parPersonne(utilisateur.id)) {
      throw new ErreurColis(409, "deja_relais", "Vous êtes déjà point relais");
    }
    const contact = await this.annuaire.contact(utilisateur.id);
    const deposeeA = this.maintenant();
    const prefixe = `R-${codeVille(fiche.position.ville)}`;

    let dossier: string | null = null;
    for (let essai = 0; essai < MAX_TENTATIVES && dossier === null; essai++) {
      const candidat = codeDossier(prefixe, await this.compteurs.prochain(prefixe));
      const resultat = await this.demandes.ajouter({
        dossier: candidat,
        version: 1,
        personneId: utilisateur.id,
        fiche,
        etat: "recue",
        deposeeA,
        visite: null,
        decision: null,
        relaisId: null,
      });
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

    await this.brouillons.supprimer(utilisateur.id);
    await this.annuaire.prevenir(
      contact.telephone,
      `AfriMove : votre fiche « ${fiche.nom} » est bien reçue (dossier ${dossier}). ` +
        "Un agent vous rappelle sous 72 h.",
    );
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: "voyageur", compagnieId: null },
      action: "relais.demande_deposee",
      resultat: "succes",
      cible: { type: "demande", id: dossier },
      details: { dossier, ville: fiche.position.ville },
    });
    return { dossier, deposeeLe: deposeeA, suite: SUITE_FICHE_RELAIS };
  }

  /* -------------------------------------------------------------- suivi de la demande */

  private async demandeDe(
    utilisateur: Utilisateur,
    dossier: string | undefined,
  ): Promise<DemandeRelais> {
    const demande = dossier
      ? await this.demandes.trouver(dossier)
      : await this.demandes.derniereDe(utilisateur.id);
    // Le dossier d'un autre ne se distingue pas d'un dossier qui n'existe pas.
    if (!demande || demande.personneId !== utilisateur.id) {
      throw new ErreurColis(404, "demande_introuvable", "Aucune demande trouvée");
    }
    return demande;
  }

  /** `SchemaSuiviDemande` (type « relais ») : les jalons en direct, le code réservé, la suite. */
  async suivi(utilisateur: Utilisateur, dossier: string | undefined) {
    const demande = await this.demandeDe(utilisateur, dossier);
    const relais = demande.relaisId ? await this.relais.trouver(demande.relaisId) : null;
    const jalons = SUIVI_RELAIS.jalons;
    const activee = demande.etat === "activee";
    const refusee = demande.etat === "refusee";
    const { visite } = demande;
    const agent = visite ? { nom: visite.agent, creneau: visite.creneau } : null;

    return {
      type: "relais" as const,
      dossier: demande.dossier,
      statut: activee
        ? ("active" as const)
        : refusee
          ? ("refusee" as const)
          : ("en_cours" as const),
      titre: activee ? "Point relais actif" : refusee ? "Demande refusée" : SUIVI_RELAIS.titre,
      detail: activee
        ? `Ton code relais ${demande.dossier} est actif · l'app est en mode relais`
        : refusee
          ? (demande.decision?.motif ?? "Ta demande n'a pas été retenue")
          : SUIVI_RELAIS.detail(demande.dossier),
      etape: activee ? { courante: 3, total: 3 } : refusee ? null : { courante: 2, total: 3 },
      jalons: [
        {
          fait: true,
          libelle: jalons.fiche.libelle,
          detail: jalons.fiche.detail,
          a: demande.deposeeA,
        },
        {
          fait: visite !== null || activee,
          libelle: jalons.position.libelle,
          detail: jalons.position.detail,
          a: visite?.planifieeA ?? null,
        },
        {
          fait: activee,
          libelle: jalons.agent.libelle,
          detail: agent
            ? `${agent.nom} · ${agent.creneau} · ${jalons.agent.detail}`
            : jalons.agent.detail,
          a: activee ? (demande.decision?.a ?? null) : null,
        },
        {
          fait: activee,
          libelle: jalons.activation.libelle,
          detail: jalons.activation.detail,
          a: activee ? (demande.decision?.a ?? null) : null,
        },
        {
          fait: relais?.premierColisA != null,
          libelle: jalons.premierColis.libelle,
          detail: jalons.premierColis.detail,
          a: relais?.premierColisA ?? null,
        },
      ],
      reservation: {
        libelle: SUIVI_RELAIS.reservation.libelle,
        valeur: demande.dossier,
        activation: activee ? "actif" : SUIVI_RELAIS.reservation.activation,
      },
      demo: { ...SUIVI_RELAIS.demo },
      recit: {
        titre: SUIVI_RELAIS.recit.titre,
        texte: SUIVI_RELAIS.recit.texte(
          agent?.nom ?? "Un agent AfriMove",
          demande.fiche.nom,
          demande.fiche.position.quartier,
        ),
      },
      mention: SUIVI_RELAIS.mention,
      complement: null,
      agent,
    };
  }

  /* -------------------------------------------------------------- agents AfriMove */

  private async modifier(
    dossier: string,
    transformer: (demande: DemandeRelais) => DemandeRelais,
  ): Promise<DemandeRelais> {
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

  /** L'agent fixe la visite (ou l'appel vidéo) : la position et les horaires sont validés. */
  async planifierVisite(
    agent: Utilisateur,
    dossier: string,
    visite: { agent: string; creneau: string },
  ) {
    const planifieeA = this.maintenant();
    const demande = await this.modifier(dossier, (d) => {
      if (d.etat !== "recue" && d.etat !== "visite_planifiee") {
        throw new ErreurColis(409, "etat_incompatible", "Cette demande est déjà traitée");
      }
      return { ...d, etat: "visite_planifiee", visite: { ...visite, planifieeA } };
    });
    const contact = await this.annuaire.contact(demande.personneId);
    await this.annuaire.prevenir(
      contact.telephone,
      `AfriMove : un agent passe vous voir (${visite.creneau}). Dossier ${dossier}.`,
    );
    await this.audit.enregistrer({
      acteur: this.acteur(agent),
      action: "relais.visite_planifiee",
      resultat: "succes",
      cible: { type: "demande", id: dossier },
      details: { dossier },
    });
    return { dossier, etat: demande.etat, visite: demande.visite };
  }

  /**
   * L'agent active le relais après la visite : le point relais est créé (le dossier devient son code),
   * le compte reçoit le rôle `relais`. Rejouer l'activation ne crée pas un second relais.
   */
  async activer(agent: Utilisateur, dossier: string, details: ActivationRelais) {
    const lue = await this.demandes.trouver(dossier);
    if (!lue) throw new ErreurColis(404, "demande_introuvable", "Aucune demande trouvée");
    if (lue.etat === "activee") return this.reponseActivation(lue);
    if (lue.etat !== "visite_planifiee") {
      throw new ErreurColis(
        409,
        "etat_incompatible",
        lue.etat === "refusee"
          ? "Cette demande est refusée"
          : "La visite n'est pas encore planifiée",
      );
    }
    const a = this.maintenant();
    const relais: PointRelaisStocke = {
      id: randomUUID(),
      version: 1,
      code: lue.dossier,
      personneId: lue.personneId,
      nom: lue.fiche.nom,
      typeBoutique: lue.fiche.type,
      ville: lue.fiche.position.ville,
      quartier: lue.fiche.position.quartier,
      repere: lue.fiche.position.repere,
      position: details.position,
      ouvert: lue.fiche.ouvert,
      tailleMax: lue.fiche.tailleMax,
      capacite: details.capacite ?? CAPACITE_PAR_DEFAUT,
      particularite: details.particularite,
      momo: lue.fiche.momo,
      facadeRef: lue.fiche.facadeRef,
      actif: true,
      note: NOTE_INITIALE,
      creeA: a,
      premierColisA: null,
    };
    // Le code du relais est unique : de deux activations simultanées, une seule crée le relais.
    const cree = await this.relais.ajouter(relais);
    const retenu = cree ? relais : await this.relais.parPersonne(lue.personneId);
    if (!retenu || retenu.code !== lue.dossier) {
      throw new ErreurColis(409, "relais_existant", "Ce commerçant est déjà point relais");
    }

    let demande: DemandeRelais;
    try {
      demande = await this.modifier(dossier, (d) => {
        if (d.etat === "activee") return d;
        if (d.etat !== "visite_planifiee") {
          throw new ErreurColis(409, "etat_incompatible", "Cette demande vient d'être traitée");
        }
        return {
          ...d,
          etat: "activee",
          relaisId: retenu.id,
          decision: { a, par: agent.id, motif: null },
        };
      });
    } catch (e) {
      // La demande a été refusée entre-temps : le relais créé juste avant ne doit pas rester actif.
      if (cree) await this.relais.remplacer({ ...relais, actif: false }, relais.version);
      throw e;
    }
    await this.roles.ajouterRole(lue.personneId, "relais");
    const contact = await this.annuaire.contact(lue.personneId);
    await this.annuaire.prevenir(
      contact.telephone,
      `AfriMove : votre point relais ${lue.dossier} est actif. Ouvrez l'app, elle passe en mode relais.`,
    );
    await this.audit.enregistrer({
      acteur: this.acteur(agent),
      action: "relais.active",
      resultat: "succes",
      cible: { type: "relais", id: retenu.id },
      details: { dossier },
    });
    return this.reponseActivation(demande);
  }

  private reponseActivation(demande: DemandeRelais) {
    return { dossier: demande.dossier, etat: demande.etat, relaisId: demande.relaisId };
  }

  async refuser(agent: Utilisateur, dossier: string, motif: string) {
    const a = this.maintenant();
    const demande = await this.modifier(dossier, (d) => {
      if (d.etat !== "recue" && d.etat !== "visite_planifiee") {
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
      action: "relais.demande_refusee",
      resultat: "succes",
      cible: { type: "demande", id: dossier },
      details: { dossier },
    });
    return { dossier, etat: demande.etat };
  }
}
