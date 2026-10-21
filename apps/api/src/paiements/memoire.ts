import { Injectable } from "@nestjs/common";
import {
  AnnuaireVoyageurs,
  CommandesAPayer,
  ComptesReversement,
  LiensPaiement,
  NotifieurPaiements,
  NotificationsTraitees,
  Paiements,
  ReglagesPaiements,
  Remboursements,
  type CommandeAPayer,
  type FiltrePaiements,
  type ResultatAjoutRemboursement,
  type ResultatOuverture,
  type StockagePaiements,
} from "./ports";
import {
  sommeMontants,
  type Beneficiaire,
  type LienPaiement,
  type Paiement,
  type ReglageMode,
  type Remboursement,
  type StatutPaiement,
  type StatutRemboursement,
} from "./modeles";
import { Refus } from "../billetterie/erreurs";

/**
 * Adaptateurs en mémoire : développement et tests. Ils copient ce qu'ils rendent (comme une ligne
 * relue en base) et tiennent les mêmes garanties que les index de PostgreSQL.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

/* ------------------------------------------------------------------ paiements */

@Injectable()
export class PaiementsMemoire extends Paiements implements StockagePaiements {
  readonly durable = false;
  private readonly lignes = new Map<string, Paiement>();

  async ouvrir(paiement: Paiement): Promise<ResultatOuverture> {
    const parCle =
      paiement.cle !== null
        ? [...this.lignes.values()].find((p) => p.cle === paiement.cle)
        : undefined;
    if (parCle) return { cree: false, raison: "cle_connue", existant: copie(parCle) };
    if (paiement.commandeId !== null) {
      const ouvert = [...this.lignes.values()].find(
        (p) => p.commandeId === paiement.commandeId && p.statut === "en_attente",
      );
      if (ouvert) return { cree: false, raison: "en_cours", existant: copie(ouvert) };
    }
    this.lignes.set(paiement.id, copie(paiement));
    return { cree: true };
  }

  async trouver(id: string) {
    const p = this.lignes.get(id);
    return p ? copie(p) : null;
  }

  async parIdFournisseur(fournisseur: string, idFournisseur: string) {
    const p = [...this.lignes.values()].find(
      (x) => x.fournisseur === fournisseur && x.idFournisseur === idFournisseur,
    );
    return p ? copie(p) : null;
  }

  async parCle(cle: string) {
    const p = [...this.lignes.values()].find((x) => x.cle === cle);
    return p ? copie(p) : null;
  }

  async duCommande(commandeId: string) {
    return [...this.lignes.values()]
      .filter((p) => p.commandeId === commandeId)
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .map(copie);
  }

  async transitionner(
    id: string,
    de: readonly StatutPaiement[],
    changement: Partial<Omit<Paiement, "id">>,
  ) {
    const p = this.lignes.get(id);
    if (!p || !de.includes(p.statut)) return null;
    const apres = { ...p, ...copie(changement) };
    this.lignes.set(id, apres);
    return copie(apres);
  }

  async modifier(id: string, changement: Partial<Omit<Paiement, "id">>) {
    const p = this.lignes.get(id);
    if (!p) return null;
    const apres = { ...p, ...copie(changement) };
    this.lignes.set(id, apres);
    return copie(apres);
  }

  async confirmer(id: string, billetIds: string[]) {
    const p = this.lignes.get(id);
    if (!p || p.confirmation !== "a_faire" || p.commandeId === null) return false;
    const autre = [...this.lignes.values()].some(
      (x) => x.id !== id && x.commandeId === p.commandeId && x.confirmation === "faite",
    );
    if (autre) return false;
    this.lignes.set(id, { ...p, confirmation: "faite", billetIds: [...billetIds] });
    return true;
  }

  async enAttenteDepuis(avant: Date, limite: number) {
    return [...this.lignes.values()]
      .filter((p) => p.statut === "en_attente" && p.creeA.getTime() <= avant.getTime())
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  async aConfirmer(limite: number) {
    return [...this.lignes.values()]
      .filter((p) => p.statut === "reussi" && p.confirmation === "a_faire")
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  async lister(filtre: FiltrePaiements) {
    return [...this.lignes.values()]
      .filter(
        (p) =>
          (filtre.du === undefined || p.creeA >= filtre.du) &&
          (filtre.au === undefined || p.creeA < filtre.au) &&
          (filtre.compagnieId === undefined || p.compagnieId === filtre.compagnieId) &&
          (filtre.statut === undefined || p.statut === filtre.statut),
      )
      .sort((a, b) => b.creeA.getTime() - a.creeA.getTime())
      .slice(0, filtre.limite)
      .map(copie);
  }

  /** Test : tout ce qui est enregistré. */
  tous(): Paiement[] {
    return [...this.lignes.values()].map(copie);
  }
}

/* ------------------------------------------------------------------ remboursements */

@Injectable()
export class RemboursementsMemoire extends Remboursements implements StockagePaiements {
  readonly durable = false;
  private readonly lignes = new Map<string, Remboursement>();

  async ajouter(
    remboursement: Remboursement,
    plafonds: Readonly<Record<Beneficiaire, number>>,
  ): Promise<ResultatAjoutRemboursement> {
    if ([...this.lignes.values()].some((r) => r.cle === remboursement.cle)) return "cle_connue";
    const vivants = [...this.lignes.values()].filter(
      (r) => r.paiementId === remboursement.paiementId && r.statut !== "echoue",
    );
    for (const b of ["compagnie", "afrimove"] as const) {
      const deja = sommeMontants(
        vivants.flatMap((r) => r.lignes).filter((l) => l.beneficiaire === b),
      );
      const demande = sommeMontants(remboursement.lignes.filter((l) => l.beneficiaire === b));
      if (deja + demande > plafonds[b]) return "plafond_depasse";
    }
    this.lignes.set(remboursement.id, copie(remboursement));
    return "ok";
  }

  async trouver(id: string) {
    const r = this.lignes.get(id);
    return r ? copie(r) : null;
  }

  async parCle(cle: string) {
    const r = [...this.lignes.values()].find((x) => x.cle === cle);
    return r ? copie(r) : null;
  }

  async parIdFournisseur(idFournisseur: string) {
    const r = [...this.lignes.values()].find((x) => x.idFournisseur === idFournisseur);
    return r ? copie(r) : null;
  }

  async dePaiement(paiementId: string) {
    return [...this.lignes.values()]
      .filter((r) => r.paiementId === paiementId)
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .map(copie);
  }

  async transitionner(
    id: string,
    de: readonly StatutRemboursement[],
    changement: Partial<Omit<Remboursement, "id">>,
  ) {
    const r = this.lignes.get(id);
    if (!r || !de.includes(r.statut)) return null;
    const apres = { ...r, ...copie(changement) };
    this.lignes.set(id, apres);
    return copie(apres);
  }

  async aReprendre(maintenant: Date, limite: number) {
    return [...this.lignes.values()]
      .filter(
        (r) =>
          r.statut === "demande" &&
          r.prochainEssaiA !== null &&
          r.prochainEssaiA.getTime() <= maintenant.getTime(),
      )
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  tous(): Remboursement[] {
    return [...this.lignes.values()].map(copie);
  }
}

/* ------------------------------------------------------------------ le reste du stockage */

@Injectable()
export class NotificationsTraiteesMemoire
  extends NotificationsTraitees
  implements StockagePaiements
{
  readonly durable = false;
  private readonly vus = new Set<string>();

  async memoriser(fournisseur: string, evenementId: string) {
    const cle = `${fournisseur}|${evenementId}`;
    if (this.vus.has(cle)) return false;
    this.vus.add(cle);
    return true;
  }

  async connue(fournisseur: string, evenementId: string) {
    return this.vus.has(`${fournisseur}|${evenementId}`);
  }
}

@Injectable()
export class LiensPaiementMemoire extends LiensPaiement implements StockagePaiements {
  readonly durable = false;
  private readonly lignes = new Map<string, LienPaiement>();

  async remplacer(lien: LienPaiement) {
    for (const l of this.lignes.values()) {
      if (l.commandeId === lien.commandeId && l.revoqueA === null) l.revoqueA = lien.creeA;
    }
    this.lignes.set(lien.id, copie(lien));
  }

  async parEmpreinte(empreinte: string) {
    const l = [...this.lignes.values()].find((x) => x.empreinte === empreinte);
    return l ? copie(l) : null;
  }

  tous(): LienPaiement[] {
    return [...this.lignes.values()].map(copie);
  }
}

@Injectable()
export class ComptesReversementMemoire extends ComptesReversement implements StockagePaiements {
  readonly durable = false;
  private readonly comptes = new Map<string, string>();

  async compte(compagnieId: string) {
    return this.comptes.get(compagnieId) ?? null;
  }

  async definir(compagnieId: string, compteId: string | null) {
    if (compteId === null) this.comptes.delete(compagnieId);
    else this.comptes.set(compagnieId, compteId);
  }
}

@Injectable()
export class ReglagesPaiementsMemoire extends ReglagesPaiements implements StockagePaiements {
  readonly durable = false;
  private reglage: ReglageMode | null = null;

  async lire() {
    return this.reglage ? copie(this.reglage) : null;
  }

  async definir(reglage: ReglageMode) {
    this.reglage = copie(reglage);
  }
}

/* ------------------------------------------------------------------ ce que les paiements lisent ailleurs (tests) */

/** Commandes de la billetterie pour les tests unitaires : on y range des commandes et on programme l'issue de la confirmation. */
@Injectable()
export class CommandesAPayerMemoire extends CommandesAPayer {
  private readonly lignes = new Map<string, CommandeAPayer>();
  /** Erreurs à lever à la prochaine confirmation (une par appel). */
  readonly erreurs: Array<{ statut: number; code: string }> = [];
  readonly confirmations: Array<{ commandeId: string; moyen: string }> = [];
  private compteurBillets = 0;

  ajouter(commande: CommandeAPayer): void {
    this.lignes.set(commande.id, copie(commande));
  }

  modifier(id: string, changement: Partial<CommandeAPayer>): void {
    const c = this.lignes.get(id);
    if (c) this.lignes.set(id, { ...c, ...changement });
  }

  async trouver(commandeId: string) {
    const c = this.lignes.get(commandeId);
    return c ? copie(c) : null;
  }

  async confirmer(commandeId: string, moyen: string): Promise<string[]> {
    const c = this.lignes.get(commandeId);
    if (!c) throw new Refus(404, "COMMANDE_INCONNUE", "Commande introuvable");
    this.confirmations.push({ commandeId, moyen });
    const erreur = this.erreurs.shift();
    if (erreur) throw new Refus(erreur.statut, erreur.code, "Refus simulé");
    if (c.statut === "payee") return [...c.billetIds];
    const billetIds = Array.from(
      { length: c.nombreSieges },
      () => `billet-${commandeId}-${++this.compteurBillets}`,
    );
    this.lignes.set(commandeId, { ...c, statut: "payee", billetIds });
    return [...billetIds];
  }
}

@Injectable()
export class NotifieurMemoire extends NotifieurPaiements {
  readonly envoyes: Array<{
    telephone: string;
    texte: string;
    cle: string;
    compagnieId: string;
    demandeurId: string;
    commandeId: string;
  }> = [];
  echec: Error | null = null;

  async envoyerLien(a: (typeof this.envoyes)[number]) {
    if (this.echec) throw this.echec;
    this.envoyes.push({ ...a });
  }
}

@Injectable()
export class AnnuaireMemoire extends AnnuaireVoyageurs {
  private readonly voyageurs = new Map<
    string,
    { telephone: string | null; prenom: string | null }
  >();

  ajouter(id: string, telephone: string | null, prenom: string | null): void {
    this.voyageurs.set(id, { telephone, prenom });
  }

  async telephone(voyageurId: string) {
    return this.voyageurs.get(voyageurId)?.telephone ?? null;
  }

  async prenom(voyageurId: string) {
    return this.voyageurs.get(voyageurId)?.prenom ?? null;
  }
}
