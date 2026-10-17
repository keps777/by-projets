import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Role } from "../socle/auth/roles";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { ComptesService } from "../socle/comptes/comptes.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import { emettreCodeRetrait, poivreCodeRetrait, verifierCodeRetrait } from "./codes";
import {
  ErreurColis,
  codeBloque,
  codeInvalide,
  colisInconnuAgence,
  colisIntrouvable,
  departIntrouvable,
  transitionInterdite,
} from "./erreurs";
import type { Acteur, ColisStocke, PhotoColis } from "./modele";
import {
  AnalysePhotoColis,
  AssureurPartenaire,
  ColisRepository,
  DiffusionSuivi,
  NotificationsColis,
  NumerotationColis,
  PaiementRefuse,
  PaiementsColis,
  PhotosColis,
  ReferentielColis,
  type EvenementNotification,
} from "./ports";
import {
  ESSAIS_CODE_MAX,
  TARIFS,
  TransitionInterdite,
  devisColis,
  etatSuivant,
  expirationPhoto,
  limiteRetraitColis,
  primeAssurance,
  supplementMode,
  type ActionColis,
  type Devis,
  type EntreeHistorique,
} from "./regles";
import { aammjjDouala, versIsoDouala } from "./temps";
import type { DemandeCreation, DemandeDevis } from "./validation";
import {
  masquerTelephone,
  messageSuivi,
  modeModifiable,
  vuePartenaire,
  vueProprietaire,
} from "./vues";

export const SYSTEME = "systeme";

const contexteCode = (colisId: string): string => `colis.code_retrait:${colisId}`;
export const pad4 = (n: number): string => String(n).padStart(4, "0");

/**
 * Qui peut appliquer quelle action. Les rôles `relais` et `livreur` n'ont pas de route ici (ce sont
 * les modules AM-148) : ils appellent `ColisService.executer` avec leur propre rôle.
 */
export const ROLES_PAR_ACTION: Readonly<Record<ActionColis, readonly string[]>> = {
  charger: ["guichetier", "convoyeur"],
  expedier: ["convoyeur", "chauffeur"],
  decharger: ["convoyeur", "guichetier"],
  rendre_disponible: ["guichetier", "superviseur"],
  envoyer_en_relais: ["guichetier", "relais"],
  mettre_en_livraison: ["guichetier", "livreur"],
  livrer: ["livreur"],
  remettre: ["guichetier", "relais"],
  marquer_non_retire: ["superviseur"],
  retourner: ["guichetier", "superviseur"],
  declarer_perdu: ["superviseur"],
  ouvrir_litige: ["guichetier", "superviseur"],
};

/** Rôles rattachés à une compagnie : ils ne touchent qu'aux colis de leur compagnie. */
const ROLES_DE_COMPAGNIE: readonly string[] = [
  "guichetier",
  "convoyeur",
  "chauffeur",
  "superviseur",
  "patron",
  "comptable",
];

/** Le guichetier travaille dans une gare : il ne scanne que les colis qui y partent ou y arrivent. */
const GARE_ATTENDUE: Readonly<Partial<Record<ActionColis, "origine" | "destination">>> = {
  charger: "origine",
  decharger: "destination",
  rendre_disponible: "destination",
  envoyer_en_relais: "destination",
  mettre_en_livraison: "destination",
  remettre: "destination",
  retourner: "destination",
};

const EVENEMENT_DE_ACTION: Readonly<Record<ActionColis, EvenementNotification>> = {
  charger: "charge",
  expedier: "en_route",
  decharger: "decharge",
  rendre_disponible: "disponible",
  envoyer_en_relais: "en_relais",
  mettre_en_livraison: "en_livraison",
  livrer: "livre",
  remettre: "remis",
  marquer_non_retire: "non_retire",
  retourner: "retourne",
  declarer_perdu: "perdu",
  ouvrir_litige: "litige",
};

export interface DemandeAction {
  acteur: Acteur;
  colis: { id?: string; numero?: string };
  action: ActionColis;
  /** Le code que le client a donné (remise). Jamais journalisé. */
  code?: string;
  pieceVerifiee?: boolean;
  photoRef?: string;
  relaisId?: string;
  motif?: string;
}

/** Applique une action de la machine d'états : l'ancienne entité n'est pas modifiée. */
export function transiter(
  colis: ColisStocke,
  action: ActionColis,
  meta: { at: string; par?: string; motif?: string },
): ColisStocke {
  const vers = etatSuivant(colis.etat, action);
  const entree: EntreeHistorique = {
    action,
    de: colis.etat,
    vers,
    at: meta.at,
    ...(meta.par !== undefined ? { par: meta.par } : {}),
    ...(meta.motif !== undefined ? { motif: meta.motif } : {}),
  };
  const suivant: ColisStocke = {
    ...colis,
    etat: vers,
    historique: [...colis.historique, entree],
  };
  // L'arrivée en « disponible » démarre les 7 jours de garde.
  if (vers === "disponible" && colis.etat !== "disponible") suivant.disponibleDepuis = meta.at;
  return suivant;
}

/** « C-ALP-DLA-270105-0017 » (lu sur l'écran du client) → « C-DLA-270105-0017 » (numéro du domaine). */
export function normaliserNumero(saisi: string): string | null {
  const m = /^C-(?:[A-Z0-9]{2,8}-)?([A-Z0-9]{2,8})-(\d{6})-(\d{4})$/.exec(
    saisi.trim().toUpperCase(),
  );
  return m ? `C-${m[1]}-${m[2]}-${m[3]}` : null;
}

@Injectable()
export class ColisService {
  private readonly logger = new Logger("ColisService");
  private readonly poivre: string;

  constructor(
    readonly repo: ColisRepository,
    readonly photos: PhotosColis,
    readonly referentiel: ReferentielColis,
    private readonly numerotation: NumerotationColis,
    private readonly paiements: PaiementsColis,
    private readonly assureur: AssureurPartenaire,
    private readonly notifications: NotificationsColis,
    private readonly diffusion: DiffusionSuivi,
    private readonly analyse: AnalysePhotoColis,
    private readonly chiffrement: ChiffrementService,
    private readonly comptes: ComptesService,
    private readonly personnes: PersonnesRepository,
    readonly horloge: Horloge,
    readonly audit: AuditService,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.poivre = poivreCodeRetrait(config.poivre);
  }

  /** L'instant courant, en heure de Douala. */
  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /* -------------------------------------------------------------- écriture concurrente */

  /**
   * Relit le colis, applique `transformer` (qui peut lever une erreur), puis écrit si personne n'a
   * modifié le colis entre-temps ; sinon recommence. Les compteurs d'essais ne se perdent donc jamais.
   */
  async modifier<T>(
    id: string,
    transformer: (colis: ColisStocke) => { colis: ColisStocke; resultat: T },
    introuvable: () => ErreurColis = colisIntrouvable,
  ): Promise<{ colis: ColisStocke; resultat: T }> {
    for (let tentative = 0; tentative < 10; tentative++) {
      const actuel = await this.repo.trouver(id);
      if (!actuel) throw introuvable();
      const { colis, resultat } = transformer(actuel);
      if (colis === actuel) return { colis: actuel, resultat };
      if (await this.repo.remplacer(colis, actuel.version)) {
        return { colis: { ...colis, version: actuel.version + 1 }, resultat };
      }
    }
    throw new ErreurColis(409, "CONFLIT_ECRITURE", "Le colis est modifié en même temps, réessayez");
  }

  /**
   * Tire un code de retrait au hasard. Le code lui-même n'est gardé nulle part en clair : on garde son
   * haché salé (vérification de la remise) et son chiffré AES-GCM lié au colis (renvoi au destinataire
   * et affichage à l'expéditeur).
   */
  nouveauCode(colisId: string): ColisStocke["code"] {
    const emis = emettreCodeRetrait(this.poivre);
    return {
      hache: emis.hache,
      sel: emis.sel,
      chiffre: this.chiffrement.chiffrer(emis.code, contexteCode(colisId)),
      essais: 0,
      bloque: false,
      envoyeA: null,
      smsDestinataire: "au_retour_du_reseau",
    };
  }

  /* -------------------------------------------------------------- identité */

  private async voyageur(id: string): Promise<{ id: string; nom: string; telephone: string }> {
    const personne = await this.personnes.trouverParId(id);
    if (!personne) throw new ErreurColis(404, "compte_introuvable", "Compte introuvable");
    return { id, nom: personne.nom, telephone: this.comptes.telephoneEnClair(personne) };
  }

  /** Le colis d'un voyageur : le sien (expéditeur) ou celui qu'il reçoit (destinataire). */
  async colisDuVoyageur(
    utilisateurId: string,
    colisId: string,
  ): Promise<{ colis: ColisStocke; role: "expediteur" | "destinataire" }> {
    const colis = await this.repo.trouver(colisId);
    // Un colis déposé au guichet n'est pas visible dans l'app : le schéma de la vue exige le code
    // de retrait, que le guichet n'envoie qu'au destinataire (voir README).
    if (!colis || colis.canal !== "app") throw colisIntrouvable();
    if (colis.expediteurId === utilisateurId) return { colis, role: "expediteur" };
    const moi = await this.voyageur(utilisateurId);
    if (colis.destinataire.telephone === moi.telephone) return { colis, role: "destinataire" };
    throw colisIntrouvable();
  }

  /* -------------------------------------------------------------- voyageur : envoyer un colis */

  async optionsEnvoi(utilisateurId: string, ville: string | undefined) {
    const mes = await this.repo.lister({ expediteurId: utilisateurId });
    const dernier = mes[mes.length - 1] ?? null;
    const villeCible = ville ?? dernier?.gareDestination.ville ?? null;
    const departs = (
      await this.referentiel.departsOuverts({
        gareOrigineId: null,
        compagnieId: null,
        villeDestination: villeCible,
        apres: this.maintenant(),
      })
    ).slice(0, 10);
    return {
      suggestion: dernier
        ? {
            surnom: dernier.destinataire.surnom ?? dernier.destinataire.nom,
            telephone: dernier.destinataire.telephone,
            destination: {
              ville: dernier.gareDestination.ville,
              gare: dernier.gareDestination.nom,
            },
          }
        : null,
      departs: departs.map((d, i) => ({
        departId: d.id,
        compagnie: d.compagnieNom,
        heureDepart: d.heureDepart,
        retrait: `gare de ${d.gareDestination.ville}`,
        arriveePrevue: d.arriveePrevue,
        port: d.portColis,
        recommande: i === 0,
      })),
      modes: [
        { mode: "gare" as const, detail: "Retrait à la gare", supplement: 0 },
        {
          mode: "relais" as const,
          detail: "Remis chez un commerçant près du destinataire · 7 h–20 h",
          supplement: supplementMode("relais"),
        },
        {
          mode: "moto" as const,
          detail: "Livré à sa porte par un livreur vérifié, photo à la remise",
          supplement: supplementMode("moto"),
        },
      ],
      assurance: {
        tauxPct: TARIFS.assurance.tauxPct,
        minimum: TARIFS.assurance.minimum,
        plafondValeur: TARIFS.assurance.plafondValeur,
        assureur: this.assureur.nom,
      },
      interdits: "argent, armes, périssables non emballés",
    };
  }

  async estimerPhoto(photoRef: string) {
    const estimation = await this.analyse.estimer(photoRef);
    await this.enregistrerPhoto(photoRef, null, "envoi");
    return { photoRef, taille: estimation.taille, poidsKg: estimation.poidsKg };
  }

  async devis(demande: DemandeDevis): Promise<Devis> {
    const depart = await this.referentiel.depart(demande.departId);
    if (!depart) throw departIntrouvable();
    try {
      return devisColis({
        port: depart.portColis,
        canal: "app",
        mode: demande.mode,
        valeurAssuree: demande.valeurAssuree,
        ...(demande.prixLivraison !== undefined ? { prixLivraison: demande.prixLivraison } : {}),
      });
    } catch (e) {
      throw new ErreurColis(422, "devis_invalide", (e as Error).message);
    }
  }

  async creer(utilisateurId: string, demande: DemandeCreation) {
    const depart = await this.referentiel.depart(demande.departId);
    if (!depart) throw departIntrouvable();
    if (!depart.ouvertAuColis) {
      throw new ErreurColis(422, "depart_ferme", "Ce départ n'accepte plus de colis");
    }
    if (demande.mode === "relais") {
      if (!demande.relaisId)
        throw new ErreurColis(422, "relais_requis", "Choisissez un point relais");
      const relais = await this.referentiel.relais(demande.relaisId);
      if (!relais?.actif)
        throw new ErreurColis(404, "relais_introuvable", "Point relais introuvable");
    }
    if (demande.mode === "moto" && !demande.adresseLivraison) {
      throw new ErreurColis(422, "adresse_requise", "Indiquez l'adresse de livraison");
    }
    if (demande.paiement.moyen !== "carte" && !demande.paiement.numero) {
      throw new ErreurColis(422, "numero_paiement_requis", "Indiquez le numéro à débiter");
    }
    if (demande.assurer && demande.valeurDeclaree <= 0) {
      throw new ErreurColis(422, "valeur_requise", "Indiquez la valeur du colis pour l'assurer");
    }
    const valeurAssuree = demande.assurer
      ? primeAssurance(demande.valeurDeclaree).valeurAssuree
      : 0;
    const devis = devisColis({
      port: depart.portColis,
      canal: "app",
      mode: demande.mode,
      valeurAssuree,
    });
    const expediteur = await this.voyageur(utilisateurId);

    let paiement: { reference: string; etat: "paye" | "en_attente" };
    try {
      paiement = await this.paiements.encaisser({
        cleIdempotence: randomUUID(),
        moyen: demande.paiement.moyen,
        numero: demande.paiement.numero ?? null,
        montant: devis.total,
        libelle: `Colis vers ${depart.gareDestination.ville}`,
        payeurId: utilisateurId,
      });
    } catch (e) {
      if (e instanceof PaiementRefuse) {
        throw new ErreurColis(402, "paiement_refuse", "Le paiement a été refusé");
      }
      throw e;
    }

    const id = randomUUID();
    const maintenant = this.maintenant();
    const jour = aammjjDouala(maintenant);
    let colis: ColisStocke;
    try {
      let sequence: number;
      try {
        sequence = await this.numerotation.prochainEnLigne({
          gareId: depart.gareOrigine.id,
          compagnieId: depart.compagnieId,
          at: maintenant,
          reference: id,
        });
      } catch (e) {
        if (e instanceof RangeError) {
          throw new ErreurColis(503, "plage_epuisee", "Plus de numéro disponible aujourd'hui");
        }
        throw e;
      }
      colis = {
        id,
        version: 1,
        numero: `C-${depart.gareOrigine.code}-${jour}-${pad4(sequence)}`,
        sequence,
        jour,
        canal: "app",
        mode: demande.mode,
        compagnieId: depart.compagnieId,
        gareOrigine: depart.gareOrigine,
        gareDestination: depart.gareDestination,
        departId: depart.id,
        heureDepart: depart.heureDepart,
        arriveePrevue: depart.arriveePrevue,
        expediteurId: utilisateurId,
        expediteur: { nom: expediteur.nom, telephone: expediteur.telephone },
        destinataire: {
          nom: demande.destinataire.nom,
          telephone: demande.destinataire.telephone,
          surnom: demande.destinataire.nom,
        },
        contenu: demande.contenu,
        poidsKg: demande.poidsKg,
        valeurDeclaree: demande.valeurDeclaree,
        assure: demande.assurer,
        valeurAssuree,
        assurance: { police: null, enAttente: demande.assurer },
        relaisId: demande.mode === "relais" ? (demande.relaisId ?? null) : null,
        adresseLivraison: demande.mode === "moto" ? (demande.adresseLivraison ?? null) : null,
        port: depart.portColis,
        devis: devis.lignes,
        prixTotal: devis.total,
        complementPoids: 0,
        paiement: {
          reference: paiement.reference,
          moyen: demande.paiement.moyen,
          etat: paiement.etat,
          montant: devis.total,
          numero: demande.paiement.numero ?? null,
        },
        code: this.nouveauCode(id),
        creeA: maintenant,
        disponibleDepuis: null,
        depose: null,
        remise: null,
        etat: "enregistre",
        historique: [],
        evenementIds: [],
      };
      const ajout = await this.repo.ajouter(colis);
      if (ajout !== "ajoute") throw new Error(`Colis non enregistré (${ajout})`);
    } catch (e) {
      // L'argent est pris et le colis n'existe pas : à rapprocher à la main (AM-114).
      await this.audit.enregistrer({
        acteur: { id: utilisateurId, role: "voyageur", compagnieId: null },
        action: "colis.creation_echouee_apres_paiement",
        resultat: "echec",
        details: { paiement: paiement.reference, montant: devis.total },
      });
      throw e;
    }

    await this.enregistrerPhoto(demande.photoRef, id, "envoi");
    let courant = colis;
    if (paiement.etat === "paye") courant = await this.apresPaiement(colis);
    await this.audit.enregistrer({
      acteur: { id: utilisateurId, role: "voyageur", compagnieId: null },
      action: "colis.cree",
      resultat: "succes",
      cible: { type: "colis", id },
      details: { colis: colis.numero, canal: "app", total: devis.total },
    });
    return {
      colis: vueProprietaire(courant, "expediteur", this.lireCode(courant)),
      devis,
      paiement: {
        reference: paiement.reference,
        moyen: demande.paiement.moyen,
        etat: paiement.etat,
        montant: devis.total,
      },
      etiquettePrete: true,
    };
  }

  /** Assurance et code au destinataire : seulement quand le colis est payé. */
  private async apresPaiement(colis: ColisStocke): Promise<ColisStocke> {
    let courant = colis;
    if (courant.assure) courant = await this.souscrireAssurance(courant);
    await this.envoyerCodeAuDestinataire(courant, "sms");
    return (await this.repo.trouver(colis.id)) ?? courant;
  }

  /** Le paiement en attente est confirmé par l'opérateur (AM-165). */
  async confirmerPaiement(colisId: string): Promise<void> {
    const { colis, resultat } = await this.modifier(colisId, (c) => {
      if (!c.paiement || c.paiement.etat === "paye") return { colis: c, resultat: false };
      return { colis: { ...c, paiement: { ...c.paiement, etat: "paye" } }, resultat: true };
    });
    if (resultat) await this.apresPaiement(colis);
  }

  /* -------------------------------------------------------------- voyageur : lire, envoyer le code, mode */

  /** Le code de retrait en clair, pour l'expéditeur et le destinataire seulement. */
  private lireCode(colis: ColisStocke): string {
    return this.chiffrement.dechiffrer(colis.code.chiffre, contexteCode(colis.id));
  }

  async lire(utilisateurId: string, colisId: string) {
    const { colis, role } = await this.colisDuVoyageur(utilisateurId, colisId);
    return vueProprietaire(colis, role, this.lireCode(colis));
  }

  async envoyerCode(utilisateurId: string, colisId: string, canal: "sms" | "whatsapp") {
    const { colis, role } = await this.colisDuVoyageur(utilisateurId, colisId);
    if (role !== "expediteur") throw colisIntrouvable();
    if (["remis", "livre", "retourne"].includes(colis.etat)) {
      throw new ErreurColis(409, "colis_termine", "Ce colis est déjà remis");
    }
    const now = this.horloge.maintenant().getTime();
    if (colis.code.envoyeA !== null && now - Date.parse(colis.code.envoyeA) < 60_000) {
      throw new ErreurColis(
        429,
        "code_deja_envoye",
        "Le code vient d'être envoyé, patientez une minute",
      );
    }
    const envoi = await this.envoyerCodeAuDestinataire(colis, canal);
    if (!envoi) {
      throw new ErreurColis(503, "envoi_impossible", "Le message n'a pas pu partir, réessayez");
    }
    return {
      colisId,
      canal: envoi.canal,
      envoyeA: masquerTelephone(colis.destinataire.telephone),
      envoyeLe: envoi.envoyeA,
    };
  }

  /** Envoie le code au destinataire seul. Une panne n'arrête rien : le colis reste « au retour du réseau ». */
  async envoyerCodeAuDestinataire(
    colis: ColisStocke,
    canal: "sms" | "whatsapp",
  ): Promise<{ canal: "sms" | "whatsapp"; envoyeA: string } | null> {
    try {
      const utilise = await this.notifications.envoyerCodeDestinataire({
        telephone: colis.destinataire.telephone,
        destinataireNom: colis.destinataire.nom,
        expediteurNom: colis.expediteur.nom,
        numeroColis: colis.numero,
        code: this.lireCode(colis),
        canal,
      });
      const a = this.maintenant();
      await this.modifier(colis.id, (c) => ({
        colis: { ...c, code: { ...c.code, envoyeA: a, smsDestinataire: "envoye" } },
        resultat: null,
      }));
      return { canal: utilise, envoyeA: a };
    } catch (e) {
      this.logger.warn(`Code du colis ${colis.numero} non envoyé (${(e as Error).name})`);
      return null;
    }
  }

  async changerMode(
    utilisateurId: string,
    colisId: string,
    demande: { mode: "relais" | "moto"; relaisId: string | undefined; adresse: string | undefined },
  ) {
    const { colis: lu, role } = await this.colisDuVoyageur(utilisateurId, colisId);
    if (role !== "expediteur") throw colisIntrouvable();
    if (!modeModifiable(lu)) {
      throw new ErreurColis(409, "mode_non_modifiable", "Le mode de retrait ne peut plus changer");
    }
    if (demande.mode === "relais") {
      if (!demande.relaisId)
        throw new ErreurColis(422, "relais_requis", "Choisissez un point relais");
      const relais = await this.referentiel.relais(demande.relaisId);
      if (!relais?.actif)
        throw new ErreurColis(404, "relais_introuvable", "Point relais introuvable");
    }
    if (demande.mode === "moto" && !demande.adresse) {
      throw new ErreurColis(422, "adresse_requise", "Indiquez l'adresse de livraison");
    }
    const identique =
      lu.mode === demande.mode &&
      (demande.mode === "relais"
        ? lu.relaisId === demande.relaisId
        : lu.adresseLivraison === demande.adresse);
    if (identique) {
      return { colisId, mode: lu.mode, supplement: 0, devis: { total: lu.prixTotal } };
    }
    // Le supplément est la différence entre les deux options (on ne rembourse pas un relais déjà payé).
    const supplement = Math.max(0, supplementMode(demande.mode) - supplementMode(lu.mode));
    if (supplement > 0 && lu.paiement) {
      try {
        await this.paiements.encaisser({
          cleIdempotence: randomUUID(),
          moyen: lu.paiement.moyen,
          numero: lu.paiement.numero,
          montant: supplement,
          libelle: `Changement de mode du colis`,
          payeurId: utilisateurId,
        });
      } catch (e) {
        if (e instanceof PaiementRefuse) {
          throw new ErreurColis(402, "paiement_refuse", "Le paiement a été refusé");
        }
        throw e;
      }
    }
    const { colis } = await this.modifier(colisId, (c) => {
      if (!modeModifiable(c)) {
        throw new ErreurColis(
          409,
          "mode_non_modifiable",
          "Le mode de retrait ne peut plus changer",
        );
      }
      const lignes = c.devis.filter((l) => l.code !== "relais" && l.code !== "livraison");
      if (demande.mode === "relais") {
        lignes.push({
          code: "relais",
          libelle: "Retrait en point relais",
          montant: supplementMode("relais"),
        });
      } else {
        lignes.push({
          code: "livraison",
          libelle: "Livraison moto",
          montant: supplementMode("moto"),
        });
      }
      const prixTotal = lignes.reduce((s, l) => s + l.montant, 0) + c.complementPoids;
      return {
        colis: {
          ...c,
          mode: demande.mode,
          relaisId: demande.mode === "relais" ? (demande.relaisId ?? null) : null,
          adresseLivraison: demande.mode === "moto" ? (demande.adresse ?? null) : null,
          devis: lignes,
          prixTotal,
        },
        resultat: null,
      };
    });
    await this.audit.enregistrer({
      acteur: { id: utilisateurId, role: "voyageur", compagnieId: null },
      action: "colis.mode_change",
      resultat: "succes",
      cible: { type: "colis", id: colisId },
      details: { colis: colis.numero, mode: demande.mode, supplement },
    });
    return { colisId, mode: colis.mode, supplement, devis: { total: colis.prixTotal } };
  }

  /** Les messages du suivi en direct (la passerelle WebSocket de `/colis/:id/direct` s'y abonne). */
  async suivreEnDirect(
    utilisateurId: string,
    colisId: string,
    ecouteur: Parameters<DiffusionSuivi["souscrire"]>[1],
  ): Promise<() => void> {
    await this.colisDuVoyageur(utilisateurId, colisId);
    return this.diffusion.souscrire(colisId, ecouteur);
  }

  /* -------------------------------------------------------------- assurance, photos */

  /** Souscrit l'assurance chez l'assureur partenaire ; s'il est injoignable, le colis reste « en attente ». */
  async souscrireAssurance(colis: ColisStocke): Promise<ColisStocke> {
    if (!colis.assure || colis.assurance.police !== null) return colis;
    const prime = colis.devis.find((l) => l.code === "assurance")?.montant ?? 0;
    try {
      const { police } = await this.assureur.souscrire({
        colisId: colis.id,
        numeroColis: colis.numero,
        valeurAssuree: colis.valeurAssuree,
        prime,
        contenu: colis.contenu,
      });
      const { colis: maj } = await this.modifier(colis.id, (c) => ({
        colis: { ...c, assurance: { police, enAttente: false } },
        resultat: null,
      }));
      return maj;
    } catch (e) {
      this.logger.warn(`Assurance du colis ${colis.numero} en attente (${(e as Error).name})`);
      return colis;
    }
  }

  async enregistrerPhoto(
    ref: string,
    colisId: string | null,
    genre: PhotoColis["genre"],
  ): Promise<PhotoColis> {
    const priseA = this.maintenant();
    return this.photos.enregistrer({
      ref,
      colisId,
      genre,
      priseA,
      expireA: expirationPhoto(priseA),
      supprimeeA: null,
    });
  }

  /* -------------------------------------------------------------- états et scans */

  private async trouverPourAction(colis: { id?: string; numero?: string }): Promise<ColisStocke> {
    const trouve = colis.id
      ? await this.repo.trouver(colis.id)
      : colis.numero
        ? await this.repo.trouverParNumero(normaliserNumero(colis.numero) ?? colis.numero)
        : null;
    if (!trouve) throw colisInconnuAgence();
    return trouve;
  }

  /**
   * Applique une action de la machine d'états à un colis (chargement, expédition, déchargement,
   * relais, livraison, remise…), notifie l'expéditeur, diffuse le suivi et journalise.
   *
   * C'est le point d'entrée des autres modules (point relais, livreur, inter-agences) : ils passent
   * leur rôle et reçoivent les mêmes contrôles. Une remise exige le code de retrait : trois essais
   * faux bloquent le colis (423), même avec le bon code ensuite.
   */
  async executer(demande: DemandeAction): Promise<ColisStocke> {
    const { acteur, action } = demande;
    const systeme = acteur.id === SYSTEME;
    const lu = await this.trouverPourAction(demande.colis);

    if (!systeme && !ROLES_PAR_ACTION[action].includes(acteur.role)) {
      throw new ErreurColis(403, "ACTION_NON_AUTORISEE", "Votre rôle ne peut pas faire ce scan");
    }
    if (
      !systeme &&
      ROLES_DE_COMPAGNIE.includes(acteur.role) &&
      lu.compagnieId !== null &&
      acteur.compagnieId !== lu.compagnieId
    ) {
      throw colisInconnuAgence();
    }
    const gareAttendue = GARE_ATTENDUE[action];
    if (!systeme && acteur.role === "guichetier" && gareAttendue) {
      const gare = gareAttendue === "origine" ? lu.gareOrigine : lu.gareDestination;
      if (acteur.gareId !== gare.id) {
        throw new ErreurColis(403, "AUTRE_GARE", "Ce colis n'est pas géré par votre gare");
      }
    }

    const remise = action === "remettre" || action === "livrer";
    if (remise) {
      if (!demande.code) throw new ErreurColis(422, "code_requis", "Le code de retrait est requis");
      if (demande.pieceVerifiee !== true) {
        throw new ErreurColis(422, "piece_non_verifiee", "Vérifiez la pièce d'identité du client");
      }
      if (!demande.photoRef) {
        throw new ErreurColis(422, "photo_requise", "La photo de la remise est requise");
      }
    }
    if (action === "envoyer_en_relais" && demande.relaisId) {
      const relais = await this.referentiel.relais(demande.relaisId);
      if (!relais?.actif)
        throw new ErreurColis(404, "relais_introuvable", "Point relais introuvable");
    }

    const at = this.maintenant();
    type Issue = "ok" | "bloque" | { restants: number };
    let colis: ColisStocke;
    let issue: Issue;
    try {
      ({ colis, resultat: issue } = await this.modifier<Issue>(
        lu.id,
        (c) => {
          etatSuivant(c.etat, action); // refuse d'abord les états interdits (409), code ou non
          if (remise) {
            if (c.code.bloque) return { colis: c, resultat: "bloque" };
            if (!verifierCodeRetrait(demande.code!, c.code.hache, c.code.sel, this.poivre)) {
              const essais = c.code.essais + 1;
              const bloque = essais >= ESSAIS_CODE_MAX;
              return {
                colis: { ...c, code: { ...c.code, essais, bloque } },
                resultat: bloque ? "bloque" : { restants: ESSAIS_CODE_MAX - essais },
              };
            }
          }
          const suivant = transiter(c, action, {
            at,
            par: acteur.id,
            ...(demande.motif !== undefined ? { motif: demande.motif } : {}),
          });
          if (remise) {
            suivant.remise = { a: at, par: acteur.id, photoRef: demande.photoRef ?? null };
          }
          if (action === "envoyer_en_relais" && demande.relaisId)
            suivant.relaisId = demande.relaisId;
          return { colis: suivant, resultat: "ok" };
        },
        colisInconnuAgence,
      ));
    } catch (e) {
      if (e instanceof TransitionInterdite) throw transitionInterdite(e);
      throw e;
    }

    const acteurAudit = systeme
      ? null
      : { id: acteur.id, role: acteur.role as Role, compagnieId: acteur.compagnieId };
    if (issue !== "ok") {
      await this.audit.enregistrer({
        acteur: acteurAudit,
        action: issue === "bloque" ? "colis.code_bloque" : "colis.code_faux",
        resultat: "refus",
        cible: { type: "colis", id: colis.id },
        details: { colis: colis.numero, essais: colis.code.essais },
      });
      throw issue === "bloque" ? codeBloque() : codeInvalide(issue.restants);
    }

    if (remise && demande.photoRef)
      await this.enregistrerPhoto(demande.photoRef, colis.id, "remise");
    await this.audit.enregistrer({
      acteur: acteurAudit,
      action: `colis.${action}`,
      resultat: "succes",
      cible: { type: "colis", id: colis.id },
      details: { colis: colis.numero, de: lu.etat, vers: colis.etat },
    });
    await this.apresTransition(colis, action, at);
    return colis;
  }

  /** Notifie l'expéditeur (et le destinataire quand le colis l'attend) et diffuse le suivi. */
  private async apresTransition(
    colis: ColisStocke,
    action: ActionColis,
    at: string,
  ): Promise<void> {
    this.diffusion.publier(messageSuivi(colis, at));
    const evenement = EVENEMENT_DE_ACTION[action];
    try {
      await this.notifications.notifierExpediteur({
        telephone: colis.expediteur.telephone,
        numeroColis: colis.numero,
        evenement,
      });
    } catch (e) {
      this.logger.warn(`Expéditeur du colis ${colis.numero} non prévenu (${(e as Error).name})`);
    }
    if (
      action === "rendre_disponible" ||
      action === "envoyer_en_relais" ||
      action === "marquer_non_retire"
    ) {
      const lieu =
        action === "envoyer_en_relais"
          ? ((colis.relaisId && (await this.referentiel.relais(colis.relaisId))?.nom) ??
            "point relais")
          : `gare ${colis.gareDestination.nom}, ${colis.gareDestination.ville}`;
      try {
        await this.notifications.notifierDestinataire({
          telephone: colis.destinataire.telephone,
          numeroColis: colis.numero,
          evenement:
            action === "rendre_disponible"
              ? "disponible"
              : action === "envoyer_en_relais"
                ? "en_relais"
                : "non_retire",
          lieu,
        });
      } catch (e) {
        this.logger.warn(
          `Destinataire du colis ${colis.numero} non prévenu (${(e as Error).name})`,
        );
      }
    }
  }

  /** Un superviseur débloque un colis dont le code a été refusé trois fois. */
  async debloquerCode(acteur: Acteur, colisId: string): Promise<void> {
    const lu = await this.trouverPourAction({ id: colisId });
    if (lu.compagnieId !== null && acteur.compagnieId !== lu.compagnieId)
      throw colisInconnuAgence();
    await this.modifier(
      colisId,
      (c) => ({ colis: { ...c, code: { ...c.code, essais: 0, bloque: false } }, resultat: null }),
      colisInconnuAgence,
    );
    await this.audit.enregistrer({
      acteur: { id: acteur.id, role: acteur.role as Role, compagnieId: acteur.compagnieId },
      action: "colis.code_debloque",
      resultat: "succes",
      cible: { type: "colis", id: colisId },
      details: { colis: lu.numero },
    });
  }

  /** Le colis tel que le voient les partenaires (relais, livreur, guichet) : jamais de code. */
  async lirePartenaire(colis: { id?: string; numero?: string }) {
    const c = await this.trouverPourAction(colis);
    return vuePartenaire(c, c.disponibleDepuis ? limiteRetraitColis(c.disponibleDepuis) : null);
  }
}
