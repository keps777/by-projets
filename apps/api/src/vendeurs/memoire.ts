import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { enMs } from "../relais/temps";
import type { Agrement, CreditCommission, DebitCommission, Vendeur, Vente } from "./modele";
import {
  AgrementsRepository,
  CommissionsVendeurs,
  ComptesVendeurs,
  MessagesVendeurs,
  NumerosVendeurs,
  ReglementsAgence,
  VendeursRepository,
  VentesRepository,
  type DemandeReglement,
  type DemandeSmsBillet,
  type EtatReglement,
  type ResultatAjoutVente,
  type ResultatReservation,
  type Volatil,
} from "./ports";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `VendeursModule` refuse de démarrer en production avec elles (`durable = false`).
 * Les lignes sont copiées à l'entrée et à la sortie, comme une base.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

@Injectable()
export class VendeursMemoire extends VendeursRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, Vendeur>();

  async ajouter(vendeur: Vendeur) {
    if (this.lignes.has(vendeur.id)) return false;
    for (const l of this.lignes.values()) if (l.numero === vendeur.numero) return false;
    this.lignes.set(vendeur.id, copie({ ...vendeur, version: 1 }));
    return true;
  }

  async trouver(id: string) {
    const v = this.lignes.get(id);
    return v ? copie(v) : null;
  }

  async lister(filtre: { ids?: readonly string[] } = {}) {
    return [...this.lignes.values()]
      .filter((v) => filtre.ids === undefined || filtre.ids.includes(v.id))
      .sort((a, b) => a.numero.localeCompare(b.numero))
      .map(copie);
  }

  async remplacer(vendeur: Vendeur, versionAttendue: number) {
    const actuel = this.lignes.get(vendeur.id);
    if (!actuel || actuel.version !== versionAttendue) return false;
    // Le numéro ne change jamais.
    this.lignes.set(
      vendeur.id,
      copie({ ...vendeur, numero: actuel.numero, version: versionAttendue + 1 }),
    );
    return true;
  }
}

@Injectable()
export class AgrementsMemoire extends AgrementsRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, Agrement>();

  private cle = (vendeurId: string, compagnieId: string) => `${vendeurId}|${compagnieId}`;

  async enregistrer(agrement: Agrement) {
    this.lignes.set(this.cle(agrement.vendeurId, agrement.compagnieId), copie(agrement));
  }

  async trouver(vendeurId: string, compagnieId: string) {
    const a = this.lignes.get(this.cle(vendeurId, compagnieId));
    return a ? copie(a) : null;
  }

  async deVendeur(vendeurId: string) {
    return [...this.lignes.values()]
      .filter((a) => a.vendeurId === vendeurId)
      .sort((a, b) => a.compagnieNom.localeCompare(b.compagnieNom, "fr"))
      .map(copie);
  }

  async deCompagnie(compagnieId: string) {
    return [...this.lignes.values()].filter((a) => a.compagnieId === compagnieId).map(copie);
  }
}

@Injectable()
export class NumerosVendeursMemoire extends NumerosVendeurs implements Volatil {
  readonly durable = false as const;
  private dernier = 0;

  async prochain() {
    this.dernier += 1;
    return this.dernier;
  }

  /** Test : le compteur repart de ce numéro (le prochain vendeur sera `dernier + 1`). */
  regler(dernier: number): void {
    this.dernier = dernier;
  }
}

const ETATS_UNICITE = ["en_attente", "reglee", "terminee"] as const;

@Injectable()
export class VentesMemoire extends VentesRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, Vente>();

  async ajouter(vente: Vente): Promise<ResultatAjoutVente> {
    if (this.lignes.has(vente.id)) return { resultat: "billet_pris" };
    for (const v of this.lignes.values()) {
      if (v.billetId === vente.billetId) return { resultat: "billet_pris" };
      if (
        v.vendeurId === vente.vendeurId &&
        v.departId === vente.departId &&
        v.empreinte === vente.empreinte &&
        (ETATS_UNICITE as readonly string[]).includes(v.etat)
      ) {
        return { resultat: "doublon", existante: copie(v) };
      }
    }
    for (const v of this.lignes.values()) {
      if (v.vendeurId === vente.vendeurId && v.etat === "en_attente") {
        return { resultat: "vente_en_cours", existante: copie(v) };
      }
    }
    this.lignes.set(vente.id, copie({ ...vente, version: 1 }));
    return { resultat: "ajoutee" };
  }

  async trouver(id: string) {
    const v = this.lignes.get(id);
    return v ? copie(v) : null;
  }

  async transitionner(
    id: string,
    de: readonly Vente["etat"][],
    changement: Partial<Omit<Vente, "id" | "version" | "vendeurId">>,
  ) {
    const actuelle = this.lignes.get(id);
    if (!actuelle || !de.includes(actuelle.etat)) return null;
    const suivante: Vente = { ...actuelle, ...copie(changement), version: actuelle.version + 1 };
    this.lignes.set(id, suivante);
    return copie(suivante);
  }

  async duVendeur(
    vendeurId: string,
    filtre: { etats?: readonly Vente["etat"][]; depuis?: string; avant?: string } = {},
  ) {
    return [...this.lignes.values()]
      .filter((v) => v.vendeurId === vendeurId)
      .filter((v) => filtre.etats === undefined || filtre.etats.includes(v.etat))
      .filter((v) => filtre.depuis === undefined || enMs(v.creeA) >= enMs(filtre.depuis))
      .filter((v) => filtre.avant === undefined || enMs(v.creeA) < enMs(filtre.avant))
      .sort((a, b) => enMs(a.creeA) - enMs(b.creeA) || a.id.localeCompare(b.id))
      .map(copie);
  }

  async parEtats(etats: readonly Vente["etat"][]) {
    return [...this.lignes.values()]
      .filter((v) => etats.includes(v.etat))
      .sort((a, b) => enMs(a.creeA) - enMs(b.creeA) || a.id.localeCompare(b.id))
      .map(copie);
  }
}

@Injectable()
export class CommissionsMemoire extends CommissionsVendeurs implements Volatil {
  readonly durable = false as const;
  readonly creditsLignes = new Map<string, CreditCommission>();
  readonly debitsLignes = new Map<string, DebitCommission>();

  async crediter(credit: CreditCommission) {
    if (this.creditsLignes.has(credit.cle)) return false;
    this.creditsLignes.set(credit.cle, copie(credit));
    return true;
  }

  private soldeSync(vendeurId: string): number {
    let solde = 0;
    for (const c of this.creditsLignes.values()) if (c.vendeurId === vendeurId) solde += c.montant;
    for (const d of this.debitsLignes.values()) if (d.vendeurId === vendeurId) solde -= d.montant;
    return solde;
  }

  async solde(vendeurId: string) {
    return this.soldeSync(vendeurId);
  }

  async reserver(demande: {
    cle: string;
    vendeurId: string;
    montant: number;
    at: string;
    operateur: DebitCommission["operateur"];
    telephone: string;
    libelle: string;
  }): Promise<ResultatReservation> {
    if (this.debitsLignes.has(demande.cle)) return "existe";
    if (demande.montant <= 0 || this.soldeSync(demande.vendeurId) < demande.montant) {
      return "solde_insuffisant";
    }
    this.debitsLignes.set(demande.cle, {
      cle: demande.cle,
      vendeurId: demande.vendeurId,
      montant: demande.montant,
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

  async credits(vendeurId: string, depuis: string, avant?: string) {
    return [...this.creditsLignes.values()]
      .filter((c) => c.vendeurId === vendeurId)
      .filter(
        (c) => enMs(c.at) >= enMs(depuis) && (avant === undefined || enMs(c.at) < enMs(avant)),
      )
      .map(copie);
  }

  async soldesPositifs() {
    const ids = new Set<string>();
    for (const c of this.creditsLignes.values()) ids.add(c.vendeurId);
    return [...ids]
      .map((vendeurId) => ({ vendeurId, solde: this.soldeSync(vendeurId) }))
      .filter((s) => s.solde > 0);
  }
}

/** Retrouve ou crée un compte par téléphone et garde la liste des rôles donnés. */
@Injectable()
export class ComptesVendeursMemoire extends ComptesVendeurs implements Volatil {
  readonly durable = false as const;
  readonly comptes = new Map<string, { personneId: string; nom: string }>();
  readonly roles: string[] = [];

  async ouvrir(a: { nom: string; telephone: string }) {
    const existant = this.comptes.get(a.telephone);
    if (existant) {
      this.roles.push(existant.personneId);
      return { ...existant, nouveau: false };
    }
    const cree = { personneId: randomUUID(), nom: a.nom };
    this.comptes.set(a.telephone, cree);
    this.roles.push(cree.personneId);
    return { ...cree, nouveau: true };
  }
}

/**
 * Règlement simulé : l'issue des prochaines demandes se règle à la main (`issue`), ou après coup avec
 * `confirmer` / `refuser`. Idempotent par clé, comme l'agrégateur.
 */
@Injectable()
export class ReglementsMemoire extends ReglementsAgence implements Volatil {
  readonly durable = false as const;
  readonly demandes = new Map<string, DemandeReglement & { etat: EtatReglement }>();
  /** Issue donnée aux prochaines demandes. */
  issue: "reussi" | "refuse" | "en_attente" = "reussi";
  /** Test : l'appel à l'opérateur échoue avant d'arriver (résultat inconnu). */
  enPanne = false;
  appels = 0;
  private compteur = 0;

  async regler(demande: DemandeReglement): Promise<EtatReglement> {
    this.appels += 1;
    const deja = this.demandes.get(demande.cle);
    if (deja) return copie(deja.etat);
    if (this.enPanne) throw new Error("Opérateur injoignable");
    this.compteur += 1;
    const etat: EtatReglement =
      this.issue === "reussi"
        ? { etat: "reussi", reference: `MM-REG-${this.compteur}` }
        : this.issue === "refuse"
          ? { etat: "refuse", cause: "solde_insuffisant" }
          : { etat: "en_attente" };
    this.demandes.set(demande.cle, { ...copie(demande), etat });
    return copie(etat);
  }

  async statut(cle: string): Promise<EtatReglement> {
    const d = this.demandes.get(cle);
    return d ? copie(d.etat) : { etat: "inconnu" };
  }

  /** Test : le vendeur confirme sur son téléphone, après coup. */
  confirmer(cle: string): void {
    const d = this.demandes.get(cle);
    if (!d) throw new Error(`Aucune demande ${cle}`);
    this.compteur += 1;
    d.etat = { etat: "reussi", reference: `MM-REG-${this.compteur}` };
  }

  /** Test : l'opérateur refuse après coup. */
  refuser(cle: string, cause = "refuse"): void {
    const d = this.demandes.get(cle);
    if (!d) throw new Error(`Aucune demande ${cle}`);
    d.etat = { etat: "refuse", cause };
  }
}

/** Garde les messages envoyés. */
@Injectable()
export class MessagesMemoire extends MessagesVendeurs implements Volatil {
  readonly durable = false as const;
  readonly billets: DemandeSmsBillet[] = [];
  readonly messages: { telephone: string; message: string }[] = [];
  /** Test : le fournisseur de SMS est en panne. */
  enPanne = false;

  async envoyerBillet(demande: DemandeSmsBillet) {
    if (this.enPanne) return false;
    // Même billet, même numéro : un seul SMS (idempotence de la passerelle).
    if (
      !this.billets.some(
        (b) => b.billetId === demande.billetId && b.destinataire === demande.destinataire,
      )
    ) {
      this.billets.push(copie(demande));
    }
    return true;
  }

  async prevenir(telephone: string, message: string) {
    if (this.enPanne) return false;
    this.messages.push({ telephone, message });
    return true;
  }
}
