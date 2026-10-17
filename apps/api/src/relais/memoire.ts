import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { BrouillonRelais, DemandeRelais, PointRelaisStocke, ReceptionRelais } from "./modele";
import {
  AttributionRoles,
  BrouillonsRelais,
  CompteursDossiers,
  DemandesRelaisRepository,
  Lieux,
  Portefeuille,
  ReceptionsRelais,
  RelaisRepository,
  VersementRefuse,
  VersementsMobile,
  type Credit,
  type Debit,
  type DemandeVersement,
  type ResultatAjoutDemande,
  type ResultatReservation,
  type TypePartenaire,
  type Volatil,
} from "./ports";
import type { Point } from "./regles";
import { enMs } from "./temps";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `RelaisModule` refuse de démarrer en production avec elles (`durable = false`).
 * Les lignes sont copiées à l'entrée et à la sortie, comme une base.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

@Injectable()
export class RelaisMemoire extends RelaisRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, PointRelaisStocke>();

  async ajouter(relais: PointRelaisStocke): Promise<boolean> {
    if (this.lignes.has(relais.id)) return false;
    for (const l of this.lignes.values()) if (l.code === relais.code) return false;
    this.lignes.set(relais.id, copie({ ...relais, version: 1 }));
    return true;
  }

  async trouver(id: string) {
    const r = this.lignes.get(id);
    return r ? copie(r) : null;
  }

  async parPersonne(personneId: string) {
    for (const r of this.lignes.values()) if (r.personneId === personneId) return copie(r);
    return null;
  }

  async lister(filtre: { ville?: string; actif?: boolean } = {}) {
    return [...this.lignes.values()]
      .filter((r) => filtre.ville === undefined || r.ville === filtre.ville)
      .filter((r) => filtre.actif === undefined || r.actif === filtre.actif)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(copie);
  }

  async remplacer(relais: PointRelaisStocke, versionAttendue: number) {
    const actuel = this.lignes.get(relais.id);
    if (!actuel || actuel.version !== versionAttendue) return false;
    this.lignes.set(
      relais.id,
      copie({
        ...relais,
        code: actuel.code,
        personneId: actuel.personneId,
        version: versionAttendue + 1,
      }),
    );
    return true;
  }
}

@Injectable()
export class DemandesRelaisMemoire extends DemandesRelaisRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, DemandeRelais>();

  async ajouter(demande: DemandeRelais): Promise<ResultatAjoutDemande> {
    if (this.lignes.has(demande.dossier)) return "dossier_pris";
    for (const d of this.lignes.values()) {
      if (
        d.personneId === demande.personneId &&
        (d.etat === "recue" || d.etat === "visite_planifiee")
      ) {
        return "demande_en_cours";
      }
    }
    this.lignes.set(demande.dossier, copie({ ...demande, version: 1 }));
    return "ajoutee";
  }

  async trouver(dossier: string) {
    const d = this.lignes.get(dossier);
    return d ? copie(d) : null;
  }

  async derniereDe(personneId: string) {
    const siennes = [...this.lignes.values()]
      .filter((d) => d.personneId === personneId)
      .sort((a, b) => enMs(b.deposeeA) - enMs(a.deposeeA) || b.dossier.localeCompare(a.dossier));
    return siennes[0] ? copie(siennes[0]) : null;
  }

  async remplacer(demande: DemandeRelais, versionAttendue: number) {
    const actuelle = this.lignes.get(demande.dossier);
    if (!actuelle || actuelle.version !== versionAttendue) return false;
    this.lignes.set(demande.dossier, copie({ ...demande, version: versionAttendue + 1 }));
    return true;
  }
}

@Injectable()
export class BrouillonsRelaisMemoire extends BrouillonsRelais implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, BrouillonRelais>();

  async lire(personneId: string) {
    const b = this.lignes.get(personneId);
    return b ? copie(b) : null;
  }

  async enregistrer(brouillon: BrouillonRelais) {
    this.lignes.set(brouillon.personneId, copie(brouillon));
  }

  async supprimer(personneId: string) {
    this.lignes.delete(personneId);
  }
}

@Injectable()
export class CompteursDossiersMemoire extends CompteursDossiers implements Volatil {
  readonly durable = false as const;
  private readonly compteurs = new Map<string, number>();

  async prochain(prefixe: string) {
    const suivant = (this.compteurs.get(prefixe) ?? 0) + 1;
    this.compteurs.set(prefixe, suivant);
    return suivant;
  }

  /** Test : le compteur repart de ce numéro (le prochain dossier sera `dernier + 1`). */
  regler(prefixe: string, dernier: number): void {
    this.compteurs.set(prefixe, dernier);
  }
}

@Injectable()
export class ReceptionsRelaisMemoire extends ReceptionsRelais implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ReceptionRelais>();

  async ajouter(reception: ReceptionRelais) {
    if (this.lignes.has(reception.colisId)) return false;
    this.lignes.set(reception.colisId, copie(reception));
    return true;
  }

  async trouver(colisId: string) {
    const r = this.lignes.get(colisId);
    return r ? copie(r) : null;
  }

  async lister(relaisId: string) {
    return [...this.lignes.values()].filter((r) => r.relaisId === relaisId).map(copie);
  }

  async marquerRappel(colisId: string, a: string) {
    const r = this.lignes.get(colisId);
    if (!r || r.rappelEnvoyeA !== null) return false;
    r.rappelEnvoyeA = a;
    return true;
  }

  async ouvrirRemise(colisId: string, a: string | null) {
    const r = this.lignes.get(colisId);
    if (r) r.remiseOuverteA = a;
  }
}

/** Coordonnées que les tests posent à la main. */
@Injectable()
export class LieuxMemoire extends Lieux implements Volatil {
  readonly durable = false as const;
  readonly gares = new Map<string, Point>();
  /** Clé : « <ville>|<adresse> » en minuscules. */
  readonly adresses = new Map<string, Point>();

  async pointDeLaGare(gareId: string) {
    return this.gares.get(gareId) ?? null;
  }

  async pointDeLAdresse(adresse: string, ville: string) {
    return this.adresses.get(`${ville}|${adresse}`.toLowerCase()) ?? null;
  }

  poserAdresse(adresse: string, ville: string, point: Point): void {
    this.adresses.set(`${ville}|${adresse}`.toLowerCase(), point);
  }
}

/** Valeur par défaut : aucune coordonnée connue. Les distances restent inconnues. */
@Injectable()
export class LieuxInconnus extends Lieux implements Volatil {
  readonly durable = false as const;

  async pointDeLaGare() {
    return null;
  }

  async pointDeLAdresse() {
    return null;
  }
}

@Injectable()
export class PortefeuilleMemoire extends Portefeuille implements Volatil {
  readonly durable = false as const;
  readonly creditsLignes = new Map<string, Credit>();
  readonly debitsLignes = new Map<string, Debit>();

  async crediter(credit: Credit) {
    if (this.creditsLignes.has(credit.cle)) return false;
    this.creditsLignes.set(credit.cle, copie(credit));
    return true;
  }

  private soldeSync(type: TypePartenaire, partenaireId: string): number {
    let solde = 0;
    for (const c of this.creditsLignes.values()) {
      if (c.type === type && c.partenaireId === partenaireId) solde += c.montant;
    }
    for (const d of this.debitsLignes.values()) {
      if (d.type === type && d.partenaireId === partenaireId) solde -= d.montant;
    }
    return solde;
  }

  async solde(type: TypePartenaire, partenaireId: string) {
    return this.soldeSync(type, partenaireId);
  }

  async reserver(demande: {
    cle: string;
    type: TypePartenaire;
    partenaireId: string;
    montant: number;
    motif: Debit["motif"];
    at: string;
    soldeMinimum: number;
    operateur: Debit["operateur"];
    telephone: string;
    libelle: string;
  }): Promise<ResultatReservation> {
    if (this.debitsLignes.has(demande.cle)) return "existe";
    const solde = this.soldeSync(demande.type, demande.partenaireId);
    if (demande.montant <= 0 || solde < Math.max(demande.montant, demande.soldeMinimum)) {
      return "solde_insuffisant";
    }
    this.debitsLignes.set(demande.cle, {
      cle: demande.cle,
      type: demande.type,
      partenaireId: demande.partenaireId,
      montant: demande.montant,
      motif: demande.motif,
      at: demande.at,
      etat: "en_attente",
      operateur: demande.operateur,
      telephone: demande.telephone,
      libelle: demande.libelle,
      reference: null,
    });
    return "reserve";
  }

  async confirmer(cle: string, reference: string) {
    const d = this.debitsLignes.get(cle);
    if (d) {
      d.etat = "verse";
      d.reference = reference;
    }
  }

  async annuler(cle: string) {
    const d = this.debitsLignes.get(cle);
    if (d?.etat === "en_attente") this.debitsLignes.delete(cle);
  }

  async debitsEnAttente() {
    return [...this.debitsLignes.values()].filter((d) => d.etat === "en_attente").map(copie);
  }

  async credits(type: TypePartenaire, partenaireId: string, depuis: string, avant?: string) {
    return [...this.creditsLignes.values()]
      .filter((c) => c.type === type && c.partenaireId === partenaireId)
      .filter(
        (c) => enMs(c.at) >= enMs(depuis) && (avant === undefined || enMs(c.at) < enMs(avant)),
      )
      .map(copie);
  }

  async creditsPeriode(type: TypePartenaire, depuis: string, avant: string) {
    return [...this.creditsLignes.values()]
      .filter((c) => c.type === type && enMs(c.at) >= enMs(depuis) && enMs(c.at) < enMs(avant))
      .map(copie);
  }

  async soldesPositifs(type: TypePartenaire) {
    const ids = new Set<string>();
    for (const c of this.creditsLignes.values()) if (c.type === type) ids.add(c.partenaireId);
    return [...ids]
      .map((partenaireId) => ({ partenaireId, solde: this.soldeSync(type, partenaireId) }))
      .filter((s) => s.solde > 0);
  }
}

/** Opérateur simulé : garde les versements, idempotent par clé. Les tests peuvent le mettre en panne. */
@Injectable()
export class VersementsMemoire extends VersementsMobile implements Volatil {
  readonly durable = false as const;
  readonly envoyes: (DemandeVersement & { reference: string })[] = [];
  /** Test : l'opérateur ne répond pas (résultat inconnu). */
  enPanne = false;
  /** Test : l'opérateur refuse pour de bon. */
  refuse = false;

  async verser(demande: DemandeVersement) {
    const deja = this.envoyes.find((v) => v.cle === demande.cle);
    if (deja) return { reference: deja.reference };
    if (this.refuse) throw new VersementRefuse();
    if (this.enPanne) throw new Error("Opérateur injoignable");
    const reference = `MM-${randomUUID().slice(0, 8)}`;
    this.envoyes.push({ ...demande, reference });
    return { reference };
  }
}

/** Garde la liste des rôles attribués ; les tests d'intégration la remplacent par un vrai compte. */
@Injectable()
export class AttributionRolesMemoire extends AttributionRoles implements Volatil {
  readonly durable = false as const;
  readonly attributions: { personneId: string; role: "relais" | "livreur" }[] = [];

  async ajouterRole(personneId: string, role: "relais" | "livreur") {
    this.attributions.push({ personneId, role });
  }
}
