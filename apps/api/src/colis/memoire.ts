import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  ColisStocke,
  DepartColis,
  GareRef,
  GuichetRef,
  PhotoColis,
  ReclamationStockee,
  RelaisRef,
} from "./modele";
import {
  AnalysePhotoColis,
  AssureurPartenaire,
  ColisRepository,
  DiffusionSuivi,
  FichiersPhotos,
  NotificationsColis,
  NumerotationColis,
  PaiementRefuse,
  PaiementsColis,
  PhotosColis,
  ReclamationsRepository,
  ReferentielColis,
  type AnalysePhoto,
  type DemandePaiementColis,
  type EvenementNotification,
  type FiltreColis,
  type MessageSuivi,
  type ResultatAjoutColis,
  type Volatil,
} from "./ports";
import { PLAGE_EN_LIGNE } from "./regles";
import { aammjjDouala, enMs } from "./temps";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `ColisModule` refuse de démarrer en production avec elles (`durable = false`).
 * Les lignes sont copiées à l'entrée et à la sortie, comme une base : modifier l'objet lu ne change
 * rien tant qu'on ne l'a pas renvoyé par `remplacer`.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

@Injectable()
export class ColisMemoire extends ColisRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ColisStocke>();

  async ajouter(colis: ColisStocke): Promise<ResultatAjoutColis> {
    if (this.lignes.has(colis.id)) return "id_existe";
    for (const l of this.lignes.values()) if (l.numero === colis.numero) return "numero_pris";
    this.lignes.set(colis.id, copie({ ...colis, version: 1 }));
    return "ajoute";
  }

  async trouver(id: string) {
    const c = this.lignes.get(id);
    return c ? copie(c) : null;
  }

  async trouverParNumero(numero: string) {
    for (const c of this.lignes.values()) if (c.numero === numero) return copie(c);
    return null;
  }

  async remplacer(colis: ColisStocke, versionAttendue: number) {
    const actuel = this.lignes.get(colis.id);
    if (!actuel || actuel.version !== versionAttendue) return false;
    // Ce qui identifie le colis ne change jamais (comme en base, où `remplacer` n'y touche pas).
    this.lignes.set(
      colis.id,
      copie({
        ...colis,
        numero: actuel.numero,
        sequence: actuel.sequence,
        jour: actuel.jour,
        creeA: actuel.creeA,
        version: versionAttendue + 1,
      }),
    );
    return true;
  }

  async lister(filtre: FiltreColis) {
    return [...this.lignes.values()]
      .filter((c) => filtre.expediteurId === undefined || c.expediteurId === filtre.expediteurId)
      .filter(
        (c) =>
          filtre.destinataireTelephone === undefined ||
          c.destinataire.telephone === filtre.destinataireTelephone,
      )
      .filter((c) => filtre.compagnieId === undefined || c.compagnieId === filtre.compagnieId)
      .filter((c) => filtre.departId === undefined || c.departId === filtre.departId)
      .filter((c) => filtre.etats === undefined || filtre.etats.includes(c.etat))
      .filter(
        (c) =>
          filtre.disponibleAvant === undefined ||
          (c.disponibleDepuis !== null && enMs(c.disponibleDepuis) <= enMs(filtre.disponibleAvant)),
      )
      .filter(
        (c) =>
          filtre.assuranceEnAttente === undefined ||
          c.assurance.enAttente === filtre.assuranceEnAttente,
      )
      .filter(
        (c) =>
          filtre.codeNonEnvoye === undefined ||
          (c.paiement?.etat === "paye" && c.code.smsDestinataire !== "envoye") ===
            filtre.codeNonEnvoye,
      )
      .sort((a, b) => enMs(a.creeA) - enMs(b.creeA) || a.numero.localeCompare(b.numero))
      .map(copie);
  }

  async plusGrandeSequence(gareId: string, jour: string, plage: { debut: number; fin: number }) {
    const sequences = [...this.lignes.values()]
      .filter((c) => c.gareOrigine.id === gareId && c.jour === jour)
      .map((c) => c.sequence)
      .filter((s) => s >= plage.debut && s <= plage.fin);
    return sequences.length === 0 ? null : Math.max(...sequences);
  }
}

@Injectable()
export class PhotosMemoire extends PhotosColis implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, PhotoColis>();

  async enregistrer(photo: PhotoColis) {
    const existante = this.lignes.get(photo.ref);
    const fusion: PhotoColis = existante
      ? { ...existante, colisId: existante.colisId ?? photo.colisId, genre: photo.genre }
      : { ...photo };
    this.lignes.set(photo.ref, fusion);
    return copie(fusion);
  }

  async trouver(ref: string) {
    const p = this.lignes.get(ref);
    return p ? copie(p) : null;
  }

  async parColis(colisId: string) {
    return [...this.lignes.values()].filter((p) => p.colisId === colisId).map(copie);
  }

  async expirees(maintenant: string) {
    return [...this.lignes.values()]
      .filter((p) => p.supprimeeA === null && enMs(p.expireA) <= enMs(maintenant))
      .map(copie);
  }

  async marquerSupprimee(ref: string, a: string) {
    const p = this.lignes.get(ref);
    if (p) this.lignes.set(ref, { ...p, supprimeeA: a });
  }
}

@Injectable()
export class FichiersPhotosMemoire extends FichiersPhotos implements Volatil {
  readonly durable = false as const;
  /** Fichiers présents (référence → vrai). Un test y dépose ce qu'il veut voir supprimé. */
  readonly presents = new Set<string>();
  readonly supprimes: string[] = [];

  async supprimer(ref: string) {
    this.presents.delete(ref);
    this.supprimes.push(ref);
  }
}

@Injectable()
export class ReclamationsMemoire extends ReclamationsRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ReclamationStockee>();

  async ajouter(reclamation: ReclamationStockee) {
    if (this.lignes.has(reclamation.reference)) return false;
    this.lignes.set(reclamation.reference, copie(reclamation));
    return true;
  }

  async trouver(reference: string) {
    const r = this.lignes.get(reference);
    return r ? copie(r) : null;
  }

  async remplacer(reclamation: ReclamationStockee, statutAttendu: ReclamationStockee["statut"]) {
    if (this.lignes.get(reclamation.reference)?.statut !== statutAttendu) return false;
    this.lignes.set(reclamation.reference, copie(reclamation));
    return true;
  }

  async parColis(colisId: string) {
    return [...this.lignes.values()].filter((r) => r.colisId === colisId).map(copie);
  }

  async lister(filtre: { compagnieId?: string | null; statut?: ReclamationStockee["statut"] }) {
    return [...this.lignes.values()]
      .filter((r) => filtre.compagnieId === undefined || r.compagnieId === filtre.compagnieId)
      .filter((r) => filtre.statut === undefined || r.statut === filtre.statut)
      .sort((a, b) => enMs(a.ouverteA) - enMs(b.ouverteA))
      .map(copie);
  }
}

@Injectable()
export class NumerotationMemoire extends NumerotationColis implements Volatil {
  readonly durable = false as const;
  private readonly compteurs = new Map<string, number>();
  private readonly parReference = new Map<string, number>();

  async prochainEnLigne(demande: {
    gareId: string;
    compagnieId: string | null;
    at: string;
    reference: string;
  }) {
    const jour = aammjjDouala(demande.at);
    const cleReference = `${demande.gareId}:${jour}:${demande.reference}`;
    const deja = this.parReference.get(cleReference);
    if (deja !== undefined) return deja;
    const cle = `${demande.gareId}:${jour}`;
    const prochain = (this.compteurs.get(cle) ?? PLAGE_EN_LIGNE.debut - 1) + 1;
    if (prochain > PLAGE_EN_LIGNE.fin) {
      throw new RangeError(
        `Plage de numéros épuisée (${PLAGE_EN_LIGNE.debut}–${PLAGE_EN_LIGNE.fin})`,
      );
    }
    this.compteurs.set(cle, prochain);
    this.parReference.set(cleReference, prochain);
    return prochain;
  }
}

@Injectable()
export class AnalysePhotoMemoire extends AnalysePhotoColis implements Volatil {
  readonly durable = false as const;
  resultat: AnalysePhoto = { taille: "petit carton", poidsKg: 2 };

  async estimer() {
    return { ...this.resultat };
  }
}

@Injectable()
export class PaiementsMemoire extends PaiementsColis implements Volatil {
  readonly durable = false as const;
  readonly demandes: DemandePaiementColis[] = [];
  /** Test : l'opérateur refuse. */
  refuser = false;
  /** Test : l'opérateur n'a pas encore confirmé (code PIN à saisir sur le téléphone). */
  enAttente = false;
  private readonly parCle = new Map<string, { reference: string; etat: "paye" | "en_attente" }>();

  async encaisser(demande: DemandePaiementColis) {
    this.demandes.push({ ...demande });
    const deja = this.parCle.get(demande.cleIdempotence);
    if (deja) return { ...deja };
    if (this.refuser) throw new PaiementRefuse("Paiement refusé par l'opérateur");
    const resultat = {
      reference: `PAY-${randomUUID().slice(0, 8).toUpperCase()}`,
      etat: this.enAttente ? ("en_attente" as const) : ("paye" as const),
    };
    this.parCle.set(demande.cleIdempotence, resultat);
    return { ...resultat };
  }
}

@Injectable()
export class AssureurMemoire extends AssureurPartenaire implements Volatil {
  readonly durable = false as const;
  readonly nom = "assureur partenaire";
  readonly polices: {
    police: string;
    numeroColis: string;
    valeurAssuree: number;
    prime: number;
  }[] = [];
  readonly sinistres: { dossier: string; police: string; montant: number; motif: string }[] = [];
  /** Test : l'assureur est injoignable. */
  indisponible = false;

  async souscrire(demande: {
    colisId: string;
    numeroColis: string;
    valeurAssuree: number;
    prime: number;
  }) {
    if (this.indisponible) throw new Error("Assureur injoignable");
    const police = `POL-${String(this.polices.length + 1).padStart(6, "0")}`;
    this.polices.push({
      police,
      numeroColis: demande.numeroColis,
      valeurAssuree: demande.valeurAssuree,
      prime: demande.prime,
    });
    return { police };
  }

  async declarerSinistre(declaration: {
    police: string;
    numeroColis: string;
    montant: number;
    motif: string;
  }) {
    if (this.indisponible) throw new Error("Assureur injoignable");
    const dossier = `SIN-${String(this.sinistres.length + 1).padStart(6, "0")}`;
    this.sinistres.push({
      dossier,
      police: declaration.police,
      montant: declaration.montant,
      motif: declaration.motif,
    });
    return { dossier };
  }
}

export interface CodeEnvoye {
  telephone: string;
  numeroColis: string;
  canal: "sms" | "whatsapp";
  /** Gardé pour que les tests relisent le code que le destinataire a reçu. */
  code: string;
}

@Injectable()
export class NotificationsMemoire extends NotificationsColis implements Volatil {
  readonly durable = false as const;
  readonly codes: CodeEnvoye[] = [];
  readonly expediteur: {
    telephone: string;
    numeroColis: string;
    evenement: EvenementNotification;
  }[] = [];
  readonly destinataire: { telephone: string; numeroColis: string; lieu: string }[] = [];
  /** Test : le fournisseur de SMS est en panne. */
  enPanne = false;

  async envoyerCodeDestinataire(message: {
    telephone: string;
    numeroColis: string;
    code: string;
    canal: "sms" | "whatsapp";
  }) {
    if (this.enPanne) throw new Error("Fournisseur de SMS indisponible");
    this.codes.push({
      telephone: message.telephone,
      numeroColis: message.numeroColis,
      canal: message.canal,
      code: message.code,
    });
    return message.canal;
  }

  async notifierExpediteur(message: {
    telephone: string;
    numeroColis: string;
    evenement: EvenementNotification;
  }) {
    if (this.enPanne) throw new Error("Fournisseur de SMS indisponible");
    this.expediteur.push({ ...message });
  }

  async notifierDestinataire(message: { telephone: string; numeroColis: string; lieu: string }) {
    if (this.enPanne) throw new Error("Fournisseur de SMS indisponible");
    this.destinataire.push({
      telephone: message.telephone,
      numeroColis: message.numeroColis,
      lieu: message.lieu,
    });
  }
}

@Injectable()
export class DiffusionMemoire extends DiffusionSuivi implements Volatil {
  readonly durable = false as const;
  private readonly ecouteurs = new Map<string, Set<(m: MessageSuivi) => void>>();
  readonly publies: MessageSuivi[] = [];

  publier(message: MessageSuivi) {
    this.publies.push({ ...message });
    for (const e of this.ecouteurs.get(message.colisId) ?? []) e({ ...message });
  }

  souscrire(colisId: string, ecouteur: (message: MessageSuivi) => void) {
    const ensemble = this.ecouteurs.get(colisId) ?? new Set();
    ensemble.add(ecouteur);
    this.ecouteurs.set(colisId, ensemble);
    return () => {
      ensemble.delete(ecouteur);
    };
  }
}

/** Annuaire de départ, de gares, de guichets et de relais que les tests remplissent à la main. */
@Injectable()
export class ReferentielMemoire extends ReferentielColis implements Volatil {
  readonly durable = false as const;
  readonly departs = new Map<string, DepartColis>();
  readonly gares = new Map<string, GareRef>();
  readonly guichets = new Map<string, GuichetRef>();
  readonly lesRelais = new Map<string, RelaisRef>();
  interAgences = true;

  async departsOuverts(critere: {
    gareOrigineId: string | null;
    compagnieId: string | null;
    villeDestination: string | null;
    apres: string;
  }) {
    return [...this.departs.values()]
      .filter((d) => d.ouvertAuColis && enMs(d.heureDepart) > enMs(critere.apres))
      .filter((d) => critere.gareOrigineId === null || d.gareOrigine.id === critere.gareOrigineId)
      .filter((d) => critere.compagnieId === null || d.compagnieId === critere.compagnieId)
      .filter(
        (d) =>
          critere.villeDestination === null ||
          d.gareDestination.ville.toLowerCase() === critere.villeDestination.toLowerCase(),
      )
      .sort((a, b) => enMs(a.heureDepart) - enMs(b.heureDepart))
      .map(copie);
  }

  async depart(id: string) {
    const d = this.departs.get(id);
    return d ? copie(d) : null;
  }

  async gare(id: string) {
    const g = this.gares.get(id);
    return g ? { ...g } : null;
  }

  async guichet(critere: {
    guichetId: string | null;
    utilisateurId: string;
    gareId: string | null;
  }) {
    if (critere.guichetId !== null) {
      const g = this.guichets.get(critere.guichetId);
      return g ? copie(g) : null;
    }
    const duGare = [...this.guichets.values()].filter(
      (g) => critere.gareId === null || g.gare.id === critere.gareId,
    );
    const premier = duGare.sort((a, b) => a.rang - b.rang)[0];
    return premier ? copie(premier) : null;
  }

  async relais(id: string) {
    const r = this.lesRelais.get(id);
    return r ? { ...r } : null;
  }

  async interAgencesDisponible() {
    return this.interAgences;
  }
}
