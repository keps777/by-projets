import { Injectable, Logger } from "@nestjs/common";
import { EvenementsService } from "../socle/evenements/evenements.service";
import { plageGuichet } from "../sync/regles";
import { ColisService, normaliserNumero, pad4 } from "./colis.service";
import { ErreurColis, colisInconnuAgence } from "./erreurs";
import type { Acteur, ColisStocke } from "./modele";
import {
  SEUIL_DEPASSEMENT_KG,
  complementPoidsRequis,
  devisColis,
  primeAssurance,
  type Devis,
} from "./regles";
import { aammjjDouala } from "./temps";
import {
  RE_UUID,
  lireColisDecharges,
  lireColisDepose,
  lireColisEnregistre,
  type Enveloppe,
} from "./validation";
import { vueColisEnregistre } from "./vues";

/**
 * Colis au guichet (planches « GuichetColis » et « Depot ») et déchargement en route.
 * Toutes les écritures sont des événements d'agence : l'UUID de l'événement est la clé d'idempotence
 * (rejouer un événement répond `deja_recu` sans rien refaire).
 */
@Injectable()
export class GuichetColisService {
  private readonly logger = new Logger("GuichetColisService");

  constructor(
    private readonly colis: ColisService,
    private readonly evenements: EvenementsService,
  ) {}

  private accuse(evenementId: string, statut: "accepte" | "deja_recu") {
    return { evenementId, statut, recuA: this.colis.maintenant() };
  }

  private verifierEnveloppe(acteur: Acteur, e: Enveloppe): void {
    if (e.auteurId !== acteur.id) {
      throw new ErreurColis(
        403,
        "AUTEUR_INCOHERENT",
        "L'auteur de l'événement n'est pas la personne connectée",
      );
    }
  }

  /** Journal des événements métier, en dernier : si le serveur tombe avant, le rejeu refait l'effet. */
  private async journaliser(
    e: Enveloppe,
    cible: { type: "colis" | "depart"; id: string },
    donnees: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.evenements.enregistrer({
        id: e.id,
        type: e.type,
        at: new Date(e.at),
        appareilId: e.appareilId,
        auteurId: e.auteurId,
        cible,
        numeroPlage: e.numeroPlage,
        donnees,
      });
    } catch (err) {
      this.logger.warn(`Événement ${e.type} non journalisé (${(err as Error).name})`);
    }
  }

  private exigerGuichetier(acteur: Acteur): { gareId: string; compagnieId: string } {
    if (!acteur.gareId || !acteur.compagnieId) {
      throw new ErreurColis(403, "PROFIL_INCOMPLET", "Votre compte n'est rattaché à aucune gare");
    }
    return { gareId: acteur.gareId, compagnieId: acteur.compagnieId };
  }

  /* -------------------------------------------------------------- lectures */

  /** Tout ce qu'il faut pour enregistrer un colis au guichet (`SchemaColisFormulaire`). */
  async formulaire(acteur: Acteur, guichetId: string | undefined) {
    const guichet = await this.colis.referentiel.guichet({
      guichetId: guichetId ?? null,
      utilisateurId: acteur.id,
      gareId: acteur.gareId,
    });
    if (!guichet || (acteur.compagnieId && guichet.compagnieId !== acteur.compagnieId)) {
      throw new ErreurColis(404, "GUICHET_INCONNU", "Guichet inconnu");
    }
    const maintenant = this.colis.maintenant();
    const jour = aammjjDouala(maintenant);
    let plage: { debut: number; fin: number };
    try {
      plage = plageGuichet(guichet.rang);
    } catch {
      throw new ErreurColis(409, "GUICHET_SANS_PLAGE", "Ce guichet n'a pas de plage de numéros");
    }
    const derniere = await this.colis.repo.plusGrandeSequence(guichet.gare.id, jour, plage);
    const sequence = derniere === null ? plage.debut : derniere + 1;
    if (sequence > plage.fin) {
      throw new ErreurColis(409, "PLAGE_EPUISEE", "La plage de numéros du guichet est épuisée");
    }
    const departs = await this.colis.referentiel.departsOuverts({
      gareOrigineId: guichet.gare.id,
      compagnieId: guichet.compagnieId,
      villeDestination: null,
      apres: maintenant,
    });
    const premier = departs[0];
    const devis: Devis = premier
      ? devisColis({ port: premier.portColis, canal: "agence", mode: "gare" })
      : { lignes: [], total: 0 };
    return {
      prochainNumero: {
        sequence,
        numero: `C-${guichet.gare.code}-${jour}-${pad4(sequence)}`,
      },
      guichet: { id: guichet.id, rang: guichet.rang },
      departs: departs.map((d) => ({
        departId: d.id,
        heureDepart: d.heureDepart,
        destination: d.gareDestination.ville,
        soutePct: d.soutePct,
      })),
      autreVilleDisponible: await this.colis.referentiel.interAgencesDisponible(
        guichet.compagnieId,
      ),
      // L'état de l'imprimante est connu de l'appareil, pas du serveur : voir README.
      imprimante: { etat: "ok" as const, nom: null },
      devis,
      etiquette: {
        largeurMm: 58,
        hauteurMm: 40,
        trajet: {
          origine: guichet.gare.code,
          destination: premier?.gareDestination.code ?? "···",
        },
        destinataireMasque: "···· ·· ··",
        poidsKg: 1,
        heureDepart: premier?.heureDepart ?? maintenant,
      },
      // Le brouillon est gardé sur l'appareil (il survit à une coupure) : rien à relire ici.
      brouillon: null,
    };
  }

  /** Retrouve le colis prépayé que le client montre à l'écran (`SchemaColisDepot`). */
  async depot(acteur: Acteur, codeLu: string) {
    const { gareId, compagnieId } = this.exigerGuichetier(acteur);
    const numero = normaliserNumero(codeLu);
    const colis = numero ? await this.colis.repo.trouverParNumero(numero) : null;
    if (!colis || colis.canal !== "app" || colis.compagnieId !== compagnieId) {
      throw colisInconnuAgence();
    }
    if (colis.gareOrigine.id !== gareId) {
      throw new ErreurColis(403, "AUTRE_GARE", "Ce colis part d'une autre gare");
    }
    const depart = colis.departId ? await this.colis.referentiel.depart(colis.departId) : null;
    const complement = colis.depose
      ? complementPoidsRequis(colis.poidsKg, colis.depose.poidsReleveKg)
      : null;
    return {
      colisId: colis.id,
      numero: colis.numero,
      codeLu: codeLu.trim(),
      etat: colis.etat,
      payeDansApp: colis.paiement?.etat === "paye" ? colis.paiement.montant : 0,
      trouveA: this.colis.maintenant(),
      expediteur: { nom: colis.expediteur.nom, telephone: colis.expediteur.telephone },
      destinataire: {
        nom: colis.destinataire.nom,
        destination: `${colis.gareDestination.ville} gare`,
      },
      declare: {
        contenu: colis.contenu,
        poidsKg: colis.poidsKg,
        valeurDeclaree: colis.valeurDeclaree,
        assure: colis.assure,
      },
      depart: {
        departId: colis.departId ?? "",
        heureDepart: colis.heureDepart ?? colis.creeA,
        destination: colis.gareDestination.ville,
        soutePct: depart?.soutePct ?? 0,
      },
      verifications: {
        poidsReleveKg: colis.depose?.poidsReleveKg ?? null,
        poidsConforme: complement === null ? null : !complement,
        photoRequise: colis.depose === null,
        seuilDepassementKg: SEUIL_DEPASSEMENT_KG,
      },
    };
  }

  /* -------------------------------------------------------------- écritures (événements) */

  /** `colis.enregistre` : photo, étiquette, encaissement au guichet. */
  async enregistrer(acteur: Acteur, brut: unknown) {
    const e = lireColisEnregistre(brut);
    this.verifierEnveloppe(acteur, e);
    const { gareId, compagnieId } = this.exigerGuichetier(acteur);
    const d = e.donnees;

    const existant = await this.colis.repo.trouver(d.colisId);
    if (existant) {
      if (existant.evenementIds.includes(e.id)) {
        return { accuse: this.accuse(e.id, "deja_recu"), colis: vueColisEnregistre(existant) };
      }
      throw new ErreurColis(409, "COLIS_DEJA_ENREGISTRE", "Ce colis est déjà enregistré");
    }

    const depart = await this.colis.referentiel.depart(d.departId);
    if (!depart || depart.compagnieId !== compagnieId) {
      throw new ErreurColis(404, "DEPART_INCONNU", "Départ inconnu");
    }
    if (depart.gareOrigine.id !== gareId) {
      throw new ErreurColis(403, "AUTRE_GARE", "Ce départ n'est pas celui de votre gare");
    }
    if (!depart.ouvertAuColis) {
      throw new ErreurColis(422, "DEPART_FERME", "Ce départ n'accepte plus de colis");
    }
    if (d.assure && d.valeurDeclaree <= 0) {
      throw new ErreurColis(422, "VALEUR_REQUISE", "Indiquez la valeur du colis pour l'assurer");
    }

    // En agence, les 150 F de frais sont à la charge de l'agence : port + assurance seulement.
    const valeurAssuree = d.assure ? primeAssurance(d.valeurDeclaree).valeurAssuree : 0;
    const devis = devisColis({
      port: depart.portColis,
      canal: "agence",
      mode: "gare",
      valeurAssuree,
    });
    if (d.paiement.montant !== devis.total) {
      throw new ErreurColis(
        422,
        "PAIEMENT_INVALIDE",
        "Le montant encaissé n'est pas le prix du colis",
        {
          attendu: devis.total,
        },
      );
    }

    const jour = aammjjDouala(e.at);
    const colis: ColisStocke = {
      id: d.colisId,
      version: 1,
      numero: `C-${depart.gareOrigine.code}-${jour}-${pad4(e.numeroPlage)}`,
      sequence: e.numeroPlage,
      jour,
      canal: "agence",
      mode: "gare",
      compagnieId,
      gareOrigine: depart.gareOrigine,
      gareDestination: depart.gareDestination,
      departId: depart.id,
      heureDepart: depart.heureDepart,
      arriveePrevue: depart.arriveePrevue,
      expediteurId: null,
      expediteur: d.expediteur,
      destinataire: { ...d.destinataire, surnom: null },
      contenu: d.contenu,
      poidsKg: d.poidsKg,
      valeurDeclaree: d.valeurDeclaree,
      assure: d.assure,
      valeurAssuree,
      assurance: { police: null, enAttente: d.assure },
      relaisId: null,
      adresseLivraison: null,
      port: depart.portColis,
      devis: devis.lignes,
      prixTotal: devis.total,
      complementPoids: 0,
      paiement: {
        reference: `GUICHET-${jour}-${pad4(e.numeroPlage)}`,
        moyen: d.paiement.mode,
        etat: "paye",
        montant: devis.total,
        numero: null,
      },
      code: this.colis.nouveauCode(d.colisId),
      creeA: e.at,
      disponibleDepuis: null,
      // Au guichet, le colis est déposé à l'instant où il est enregistré, avec sa photo.
      depose: { a: e.at, poidsReleveKg: d.poidsKg, photoRef: d.photoRef, par: acteur.id },
      remise: null,
      etat: "enregistre",
      historique: [],
      evenementIds: [e.id],
    };
    const ajout = await this.colis.repo.ajouter(colis);
    if (ajout === "numero_pris") {
      // Le numéro est déjà imprimé sur une étiquette : AM-161 en fait une alerte nominative.
      throw new ErreurColis(409, "NUMERO_PRIS", "Ce numéro de colis est déjà attribué");
    }
    if (ajout === "id_existe") {
      throw new ErreurColis(409, "COLIS_DEJA_ENREGISTRE", "Ce colis est déjà enregistré");
    }

    await this.colis.enregistrerPhoto(d.photoRef, colis.id, "depot");
    let courant = colis;
    if (colis.assure) courant = await this.colis.souscrireAssurance(courant);
    await this.colis.envoyerCodeAuDestinataire(courant, "sms");
    courant = (await this.colis.repo.trouver(colis.id)) ?? courant;
    await this.colis.audit.enregistrer({
      acteur: { id: acteur.id, role: "guichetier", compagnieId },
      action: "colis.enregistre",
      resultat: "succes",
      cible: { type: "colis", id: colis.id },
      details: { colis: colis.numero, canal: "agence", total: devis.total },
    });
    await this.journaliser(
      e,
      { type: "colis", id: colis.id },
      {
        colisId: colis.id,
        departId: d.departId,
        contenu: d.contenu,
        poidsKg: d.poidsKg,
        valeurDeclaree: d.valeurDeclaree,
        assure: d.assure,
        photoRef: d.photoRef,
        paiement: d.paiement,
      },
    );
    return { accuse: this.accuse(e.id, "accepte"), colis: vueColisEnregistre(courant) };
  }

  /** `colis.depose` : le guichet accepte le colis prépayé (poids relevé, photo, complément éventuel). */
  async deposer(acteur: Acteur, brut: unknown) {
    const e = lireColisDepose(brut);
    this.verifierEnveloppe(acteur, e);
    const { gareId, compagnieId } = this.exigerGuichetier(acteur);
    const d = e.donnees;

    const lu = await this.colis.repo.trouver(d.colisId);
    if (!lu || lu.canal !== "app" || lu.compagnieId !== compagnieId) throw colisInconnuAgence();
    if (lu.evenementIds.includes(e.id)) {
      return {
        accuse: this.accuse(e.id, "deja_recu"),
        colis: vueColisEnregistre(lu),
        complementDemande: lu.complementPoids,
      };
    }
    if (lu.gareOrigine.id !== gareId) {
      throw new ErreurColis(403, "AUTRE_GARE", "Ce colis part d'une autre gare");
    }
    if (lu.paiement?.etat !== "paye") {
      throw new ErreurColis(402, "PAIEMENT_EN_ATTENTE", "Le paiement du colis n'est pas confirmé");
    }
    const requis = complementPoidsRequis(lu.poidsKg, d.poidsReleveKg);
    if (requis && d.complement === 0) {
      throw new ErreurColis(422, "COMPLEMENT_REQUIS", "Complément de poids à payer", {
        seuilDepassementKg: SEUIL_DEPASSEMENT_KG,
      });
    }
    if (!requis && d.complement > 0) {
      throw new ErreurColis(422, "COMPLEMENT_INDU", "Aucun complément de poids n'est dû");
    }

    const { colis } = await this.colis.modifier(
      d.colisId,
      (c) => {
        if (c.evenementIds.includes(e.id)) return { colis: c, resultat: null };
        if (c.depose !== null || c.etat !== "enregistre") {
          throw new ErreurColis(409, "DEJA_DEPOSE", "Ce colis est déjà déposé");
        }
        const devis =
          d.complement > 0
            ? [
                ...c.devis,
                { code: "complement_poids", libelle: "Complément de poids", montant: d.complement },
              ]
            : c.devis;
        return {
          colis: {
            ...c,
            depose: {
              a: e.at,
              poidsReleveKg: d.poidsReleveKg,
              photoRef: d.photoRef,
              par: acteur.id,
            },
            complementPoids: d.complement,
            devis,
            prixTotal: c.prixTotal + d.complement,
            evenementIds: [...c.evenementIds, e.id],
          },
          resultat: null,
        };
      },
      colisInconnuAgence,
    );
    await this.colis.enregistrerPhoto(d.photoRef, colis.id, "depot");
    // Le code est parti à la création du colis ; s'il n'a pas pu partir, on réessaie maintenant.
    let courant = colis;
    if (colis.code.smsDestinataire !== "envoye") {
      await this.colis.envoyerCodeAuDestinataire(colis, "sms");
      courant = (await this.colis.repo.trouver(colis.id)) ?? colis;
    }
    await this.colis.audit.enregistrer({
      acteur: { id: acteur.id, role: "guichetier", compagnieId },
      action: "colis.depose",
      resultat: "succes",
      cible: { type: "colis", id: colis.id },
      details: { colis: colis.numero, poidsReleveKg: d.poidsReleveKg, complement: d.complement },
    });
    await this.journaliser(e, { type: "colis", id: colis.id }, { ...d });
    return {
      accuse: this.accuse(e.id, "accepte"),
      colis: vueColisEnregistre(courant),
      complementDemande: d.complement,
    };
  }

  /** `route.colis_decharges` : le convoyeur décharge les colis destinés à un arrêt. */
  async decharger(acteur: Acteur, brut: unknown) {
    const e = lireColisDecharges(brut);
    this.verifierEnveloppe(acteur, e);
    const { departId, colisIds } = e.donnees;

    const lus: ColisStocke[] = [];
    for (const id of new Set(colisIds)) {
      const c = await this.colis.repo.trouver(id);
      if (!c || (c.compagnieId !== null && c.compagnieId !== acteur.compagnieId)) {
        throw colisInconnuAgence();
      }
      if (c.departId !== departId) {
        throw new ErreurColis(422, "COLIS_AUTRE_DEPART", "Ce colis n'est pas sur ce départ");
      }
      lus.push(c);
    }

    let changes = 0;
    for (const c of lus) {
      let etat = c.etat;
      // Un convoyeur hors ligne peut décharger un colis dont le départ n'a jamais été scanné.
      if (etat === "charge") {
        await this.colis.executer({
          acteur,
          colis: { id: c.id },
          action: "expedier",
          motif: "départ non scanné",
        });
        etat = "en_route";
        changes += 1;
      }
      if (etat === "en_route") {
        await this.colis.executer({
          acteur,
          colis: { id: c.id },
          action: "decharger",
          motif: e.donnees.arret,
        });
        changes += 1;
      }
      // Déjà déchargé (ou plus loin) : le rejeu ne refait rien.
    }
    const restants = await this.colis.repo.lister({
      departId,
      etats: ["charge", "en_route"],
    });
    // Le journal ne garde que des cibles UUID : un départ à identifiant textuel est rattaché au premier colis.
    const cible = RE_UUID.test(departId)
      ? ({ type: "depart", id: departId } as const)
      : ({ type: "colis", id: lus[0]!.id } as const);
    await this.journaliser(e, cible, { ...e.donnees });
    return {
      accuse: this.accuse(e.id, changes === 0 ? "deja_recu" : "accepte"),
      colisRestants: restants.length,
    };
  }
}
