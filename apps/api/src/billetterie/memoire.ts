import { Injectable } from "@nestjs/common";
import { PlageEpuisee } from "./erreurs";
import type {
  Billet,
  Bus,
  Commande,
  Compagnie,
  Depart,
  DepartComplet,
  EvenementTraite,
  Gare,
  Guichet,
  Ligne,
  PlanStocke,
  ScanStocke,
  StatutCommande,
} from "./modeles";
import {
  AvisBillets,
  Billets,
  Catalogue,
  ColisDuDepart,
  Commandes,
  ConversionDevises,
  DiffusionTempsReel,
  EvenementsTraites,
  Inventaire,
  NumerotationEnLigne,
  PreferencesVoyageur,
  ProchesVoyageur,
  Promotions,
  Scans,
  SignataireQr,
  type AvisBilletterie,
  type BlocageExpire,
  type ConversionFcfa,
  type FiltreDepartsCatalogue,
  type Proche,
  type Promotion,
  type ResultatAjoutBillet,
  type ResultatSiege,
} from "./ports";
import {
  genererPaireQr,
  publiqueDe,
  signerQr,
  verifierQr,
  type CleJwk,
  type ContenuQr,
  type PaireCles,
} from "./qr";
import { PLAGE_EN_LIGNE, type EtatBillet, type EtatDepart } from "./regles";
import type { FiltresDeparts } from "./schemas";
import { enMs } from "./temps";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `BilletterieModule` refuse de démarrer en production avec elles (`durable = false`).
 * Chaque opération y est synchrone entre deux `await` : elle est donc atomique, comme la contrainte
 * d'unicité ou la transaction de la version PostgreSQL.
 */

export interface StockageBilletterie {
  /** `true` pour un adaptateur qui garde ses données après un redémarrage. */
  readonly durable: boolean;
}

const copie = <T>(v: T): T => structuredClone(v);

/* ------------------------------------------------------------------ catalogue */

@Injectable()
export class CatalogueMemoire extends Catalogue implements StockageBilletterie {
  readonly durable = false;
  private readonly compagnies = new Map<string, Compagnie>();
  private readonly gares = new Map<string, Gare>();
  private readonly guichets = new Map<string, Guichet>();
  private readonly affectations = new Map<string, string>();
  private readonly lignes = new Map<string, Ligne>();
  private readonly bus = new Map<string, Bus>();
  private readonly departsParId = new Map<string, Depart>();

  /* Alimentation (tests, démonstration) : ces méthodes ne font pas partie du port. */
  ajouterCompagnie(c: Compagnie): void {
    this.compagnies.set(c.id, copie(c));
  }
  ajouterGare(g: Gare): void {
    this.gares.set(g.id, copie(g));
  }
  ajouterGuichet(g: Guichet): void {
    this.guichets.set(g.id, copie(g));
  }
  affecterGuichet(personneId: string, guichetId: string): void {
    this.affectations.set(personneId, guichetId);
  }
  ajouterLigne(l: Ligne): void {
    this.lignes.set(l.id, copie(l));
  }
  ajouterBus(b: Bus): void {
    this.bus.set(b.id, copie(b));
  }
  ajouterDepart(d: Depart): void {
    this.departsParId.set(d.id, copie(d));
  }

  async compagnie(id: string) {
    const c = this.compagnies.get(id);
    return c ? copie(c) : null;
  }

  async gare(id: string) {
    const g = this.gares.get(id);
    return g ? copie(g) : null;
  }

  async guichet(id: string) {
    const g = this.guichets.get(id);
    return g ? copie(g) : null;
  }

  async ville(code: string) {
    for (const g of this.gares.values()) if (g.code === code) return g.ville;
    return null;
  }

  async guichetDe(personneId: string) {
    const id = this.affectations.get(personneId);
    return id ? this.guichet(id) : null;
  }

  private assembler(depart: Depart): DepartComplet | null {
    const ligne = this.lignes.get(depart.ligneId);
    const compagnie = ligne ? this.compagnies.get(ligne.compagnieId) : undefined;
    const origine = ligne ? this.gares.get(ligne.origineGareId) : undefined;
    const destination = ligne ? this.gares.get(ligne.destinationGareId) : undefined;
    if (!ligne || !compagnie || !origine || !destination) return null;
    const bus = depart.busId ? (this.bus.get(depart.busId) ?? null) : null;
    return copie({ depart, ligne, compagnie, origine, destination, bus });
  }

  async depart(id: string) {
    const d = this.departsParId.get(id);
    return d ? this.assembler(d) : null;
  }

  async departs(filtre: FiltreDepartsCatalogue) {
    const sortie: DepartComplet[] = [];
    for (const d of this.departsParId.values()) {
      const c = this.assembler(d);
      if (!c) continue;
      if (filtre.compagnieId && c.compagnie.id !== filtre.compagnieId) continue;
      if (filtre.gareOrigineId && c.origine.id !== filtre.gareOrigineId) continue;
      if (filtre.villeOrigine && c.origine.code !== filtre.villeOrigine) continue;
      if (filtre.villeDestination && c.destination.code !== filtre.villeDestination) continue;
      if (filtre.ligneId && c.ligne.id !== filtre.ligneId) continue;
      if (filtre.etats && !filtre.etats.includes(d.etat)) continue;
      if (filtre.de && enMs(d.heureDepart) < enMs(filtre.de)) continue;
      if (filtre.avant && enMs(d.heureDepart) >= enMs(filtre.avant)) continue;
      sortie.push(c);
    }
    return sortie.sort(
      (a, b) =>
        enMs(a.depart.heureDepart) - enMs(b.depart.heureDepart) ||
        a.depart.id.localeCompare(b.depart.id),
    );
  }

  async changerDepart(id: string, attendu: EtatDepart, changement: Partial<Omit<Depart, "id">>) {
    const d = this.departsParId.get(id);
    if (!d || d.etat !== attendu) return null;
    const suivant: Depart = { ...d, ...copie(changement) };
    this.departsParId.set(id, suivant);
    return copie(suivant);
  }
}

/* ------------------------------------------------------------------ billets */

@Injectable()
export class BilletsMemoire extends Billets implements StockageBilletterie {
  readonly durable = false;
  readonly lignes = new Map<string, Billet>();

  async ajouter(billet: Billet): Promise<ResultatAjoutBillet> {
    if (this.lignes.has(billet.id)) return "id_pris";
    for (const b of this.lignes.values()) {
      if (b.numero === billet.numero) return "numero_pris";
      if (
        b.departId === billet.departId &&
        b.codeBillet === billet.codeBillet &&
        b.etat !== "annule" &&
        billet.etat !== "annule"
      ) {
        return "code_pris";
      }
    }
    this.lignes.set(billet.id, copie(billet));
    return "ok";
  }

  async trouver(id: string) {
    const b = this.lignes.get(id);
    return b ? copie(b) : null;
  }

  async parNumero(numero: string) {
    for (const b of this.lignes.values()) if (b.numero === numero) return copie(b);
    return null;
  }

  async parEvenement(evenementId: string) {
    for (const b of this.lignes.values()) if (b.evenementId === evenementId) return copie(b);
    return null;
  }

  async parCode(departId: string, code: string) {
    for (const b of this.lignes.values()) {
      if (b.departId === departId && b.codeBillet === code && b.etat !== "annule") return copie(b);
    }
    return null;
  }

  async duDepart(departId: string) {
    return [...this.lignes.values()].filter((b) => b.departId === departId).map(copie);
  }

  async duGuichetEtJour(guichetId: string, aammjj: string) {
    return [...this.lignes.values()]
      .filter((b) => b.guichetId === guichetId && b.numero.split("-")[2] === aammjj)
      .map(copie);
  }

  async deLAcheteur(acheteurId: string) {
    return [...this.lignes.values()].filter((b) => b.acheteurId === acheteurId).map(copie);
  }

  async transitionner(
    id: string,
    de: readonly EtatBillet[],
    changement: Partial<Omit<Billet, "id" | "numero">>,
  ) {
    const b = this.lignes.get(id);
    if (!b || !de.includes(b.etat)) return null;
    const suivant: Billet = { ...b, ...copie(changement) };
    this.lignes.set(id, suivant);
    return copie(suivant);
  }
}

/* ------------------------------------------------------------------ sièges */

interface PlanInterne {
  occupes: Map<number, string>;
  bloques: Map<number, { par: string; commandeId: string | null; jusqua: string }>;
  version: number;
}

@Injectable()
export class InventaireMemoire extends Inventaire implements StockageBilletterie {
  readonly durable = false;
  private readonly plans = new Map<string, PlanInterne>();

  private plan_(departId: string): PlanInterne {
    let p = this.plans.get(departId);
    if (!p) {
      p = { occupes: new Map(), bloques: new Map(), version: 0 };
      this.plans.set(departId, p);
    }
    return p;
  }

  /** Blocage encore valable à `maintenant` (un blocage échu est ignoré, puis nettoyé). */
  private blocageValable(p: PlanInterne, siege: number, maintenant: string) {
    const b = p.bloques.get(siege);
    if (!b) return undefined;
    if (enMs(b.jusqua) <= enMs(maintenant)) {
      p.bloques.delete(siege);
      return undefined;
    }
    return b;
  }

  async plan(departId: string): Promise<PlanStocke> {
    const p = this.plan_(departId);
    return {
      occupes: Object.fromEntries(p.occupes),
      bloques: Object.fromEntries([...p.bloques].map(([s, b]) => [s, { ...b }])),
      version: p.version,
    };
  }

  async bloquer(a: {
    departId: string;
    siege: number;
    par: string;
    commandeId: string | null;
    jusqua: string;
    maintenant: string;
  }): Promise<ResultatSiege> {
    const p = this.plan_(a.departId);
    if (p.occupes.has(a.siege)) return { ok: false, raison: "pris" };
    const existant = this.blocageValable(p, a.siege, a.maintenant);
    if (existant && existant.par !== a.par) return { ok: false, raison: "bloque_par_autre" };
    p.bloques.set(a.siege, { par: a.par, commandeId: a.commandeId, jusqua: a.jusqua });
    p.version += 1;
    return { ok: true, version: p.version };
  }

  async leverBlocages(departId: string, par: string, sauf: readonly number[] = []) {
    const p = this.plan_(departId);
    const levees: { siege: number; version: number }[] = [];
    for (const [siege, b] of [...p.bloques]) {
      if (b.par !== par || b.commandeId !== null || sauf.includes(siege)) continue;
      p.bloques.delete(siege);
      p.version += 1;
      levees.push({ siege, version: p.version });
    }
    return levees;
  }

  async leverCommande(departId: string, commandeId: string) {
    const p = this.plan_(departId);
    const levees: { siege: number; version: number }[] = [];
    for (const [siege, b] of [...p.bloques]) {
      if (b.commandeId !== commandeId) continue;
      p.bloques.delete(siege);
      p.version += 1;
      levees.push({ siege, version: p.version });
    }
    return levees;
  }

  async occuper(a: {
    departId: string;
    siege: number;
    billetId: string;
    par: string | null;
    maintenant: string;
  }): Promise<ResultatSiege> {
    const p = this.plan_(a.departId);
    if (p.occupes.has(a.siege)) return { ok: false, raison: "pris" };
    const bloque = this.blocageValable(p, a.siege, a.maintenant);
    if (bloque && bloque.par !== a.par) return { ok: false, raison: "bloque_par_autre" };
    p.bloques.delete(a.siege);
    p.occupes.set(a.siege, a.billetId);
    p.version += 1;
    return { ok: true, version: p.version };
  }

  async liberer(departId: string, siege: number, billetId: string) {
    const p = this.plan_(departId);
    if (p.occupes.get(siege) !== billetId) return null;
    p.occupes.delete(siege);
    p.version += 1;
    return { version: p.version };
  }

  async expirer(maintenant: string): Promise<BlocageExpire[]> {
    const sortie: BlocageExpire[] = [];
    for (const [departId, p] of this.plans) {
      for (const [siege, b] of [...p.bloques]) {
        if (enMs(b.jusqua) > enMs(maintenant)) continue;
        p.bloques.delete(siege);
        p.version += 1;
        sortie.push({
          departId,
          siege,
          par: b.par,
          commandeId: b.commandeId,
          version: p.version,
        });
      }
    }
    return sortie;
  }
}

/* ------------------------------------------------------------------ commandes, scans, journal */

@Injectable()
export class CommandesMemoire extends Commandes implements StockageBilletterie {
  readonly durable = false;
  readonly lignes = new Map<string, Commande>();

  async ajouter(commande: Commande) {
    this.lignes.set(commande.id, copie(commande));
  }

  async trouver(id: string) {
    const c = this.lignes.get(id);
    return c ? copie(c) : null;
  }

  async duDepart(departId: string, statut: StatutCommande) {
    return [...this.lignes.values()]
      .filter((c) => c.departId === departId && c.statut === statut)
      .map(copie);
  }

  async enAttenteExpirees(maintenant: string) {
    return [...this.lignes.values()]
      .filter((c) => c.statut === "en_attente_paiement" && enMs(c.expireA) <= enMs(maintenant))
      .map(copie);
  }

  async transitionner(
    id: string,
    de: readonly StatutCommande[],
    changement: Partial<Omit<Commande, "id">>,
  ) {
    const c = this.lignes.get(id);
    if (!c || !de.includes(c.statut)) return null;
    const suivante: Commande = { ...c, ...copie(changement) };
    this.lignes.set(id, suivante);
    return copie(suivante);
  }
}

@Injectable()
export class ScansMemoire extends Scans implements StockageBilletterie {
  readonly durable = false;
  readonly lignes: ScanStocke[] = [];

  async ajouter(scan: ScanStocke) {
    if (this.lignes.some((s) => s.evenementId === scan.evenementId)) return;
    this.lignes.push(copie(scan));
  }

  async duDepart(departId: string) {
    // Dans l'ordre où les scans ont eu lieu (comme la version PostgreSQL).
    return this.lignes
      .filter((s) => s.departId === departId)
      .sort((a, b) => enMs(a.at) - enMs(b.at) || a.evenementId.localeCompare(b.evenementId))
      .map(copie);
  }

  async parEvenement(evenementId: string) {
    const s = this.lignes.find((x) => x.evenementId === evenementId);
    return s ? copie(s) : null;
  }
}

@Injectable()
export class EvenementsTraitesMemoire extends EvenementsTraites implements StockageBilletterie {
  readonly durable = false;
  readonly lignes = new Map<string, EvenementTraite>();

  async trouver(id: string) {
    const e = this.lignes.get(id);
    return e ? { ...e } : null;
  }

  async memoriser(entree: EvenementTraite) {
    if (this.lignes.has(entree.id)) return false;
    this.lignes.set(entree.id, { ...entree });
    return true;
  }

  async typesDe(ids: readonly string[]) {
    const types = new Map<string, string>();
    for (const id of ids) {
      const e = this.lignes.get(id);
      if (e) types.set(id, e.type);
    }
    return types;
  }
}

/* ------------------------------------------------------------------ préférences */

@Injectable()
export class PreferencesMemoire extends PreferencesVoyageur implements StockageBilletterie {
  readonly durable = false;
  private readonly preferees = new Map<string, Set<string>>();
  private readonly filtresMemorises = new Map<string, FiltresDeparts>();

  async compagniesPreferees(voyageurId: string) {
    return new Set(this.preferees.get(voyageurId) ?? []);
  }

  async definirPreferee(voyageurId: string, compagnieId: string, preferee: boolean) {
    const s = this.preferees.get(voyageurId) ?? new Set<string>();
    if (preferee) s.add(compagnieId);
    else s.delete(compagnieId);
    this.preferees.set(voyageurId, s);
  }

  async filtres(voyageurId: string, depart: string, arrivee: string) {
    const f = this.filtresMemorises.get(`${voyageurId}|${depart}|${arrivee}`);
    return f ? copie(f) : null;
  }

  async enregistrerFiltres(voyageurId: string, depart: string, arrivee: string, f: FiltresDeparts) {
    this.filtresMemorises.set(`${voyageurId}|${depart}|${arrivee}`, copie(f));
  }
}

/* ------------------------------------------------------------------ services d'autres tickets */

@Injectable()
export class PromotionsMemoire extends Promotions implements StockageBilletterie {
  readonly durable = false;
  // JOURJ : promotion de démonstration. USSD et WHATSAPP : les codes « sans frais » des achats par USSD
  // (AM-169) et par WhatsApp (AM-168), sans lesquels ces canaux ne peuvent rien vendre ; en production ils
  // se créent dans la table des promotions (qui n'existe pas encore).
  private readonly codes = new Map<string, Promotion>([
    ["JOURJ", { code: "JOURJ", type: "frais_offerts" }],
    ["USSD", { code: "USSD", type: "frais_offerts" }],
    ["WHATSAPP", { code: "WHATSAPP", type: "frais_offerts" }],
  ]);

  ajouter(promotion: Promotion): void {
    this.codes.set(promotion.code.toUpperCase(), promotion);
  }

  /** Test : retire un code (un canal dont la promotion « sans frais » n'a pas été créée). */
  retirer(code: string): void {
    this.codes.delete(code.trim().toUpperCase());
  }

  async trouver(code: string) {
    return this.codes.get(code.trim().toUpperCase()) ?? null;
  }
}

@Injectable()
export class ProchesMemoire extends ProchesVoyageur implements StockageBilletterie {
  readonly durable = false;
  private readonly proches = new Map<string, Proche>();

  ajouter(voyageurId: string, proche: Proche): void {
    this.proches.set(`${voyageurId}|${proche.id}`, proche);
  }

  async trouver(voyageurId: string, procheId: string) {
    return this.proches.get(`${voyageurId}|${procheId}`) ?? null;
  }
}

/**
 * Taux indicatifs (francs CFA pour 1 unité de la devise, ×1000) : l'agrégateur de paiement (AM-165)
 * fournit le taux réel. Le montant converti est toujours « approximatif ».
 */
const TAUX_INDICATIFS_MILLIEMES: Readonly<Record<string, number>> = {
  CAD: 440_000,
  EUR: 655_957,
  USD: 600_000,
};

@Injectable()
export class ConversionMemoire extends ConversionDevises implements StockageBilletterie {
  readonly durable = false;

  async convertir(montantFcfa: number, devise: string): Promise<ConversionFcfa | null> {
    const taux = TAUX_INDICATIFS_MILLIEMES[devise];
    if (taux === undefined) return null;
    return {
      devise,
      montantMineur: Math.round((montantFcfa * 100 * 1000) / taux),
      approximatif: true,
    };
  }
}

@Injectable()
export class NumerotationEnLigneMemoire extends NumerotationEnLigne implements StockageBilletterie {
  readonly durable = false;
  private readonly compteurs = new Map<string, number>();
  private readonly references = new Map<string, number>();

  async prochaine(a: { compagnieId: string; gareId: string; aammjj: string; reference?: string }) {
    const cle = `${a.compagnieId}|${a.gareId}|${a.aammjj}`;
    // Même référence, même numéro (comme le registre PostgreSQL).
    const deja = a.reference ? this.references.get(`${cle}|${a.reference}`) : undefined;
    if (deja !== undefined) return deja;
    const suivant = this.compteurs.get(cle) ?? PLAGE_EN_LIGNE.debut;
    if (suivant > PLAGE_EN_LIGNE.fin) throw new PlageEpuisee(PLAGE_EN_LIGNE);
    this.compteurs.set(cle, suivant + 1);
    if (a.reference) this.references.set(`${cle}|${a.reference}`, suivant);
    return suivant;
  }
}

@Injectable()
export class ColisMemoire extends ColisDuDepart implements StockageBilletterie {
  readonly durable = false;
  private readonly etats = new Map<string, { charges: number; colisACharger: number }>();

  definir(departId: string, etat: { charges: number; colisACharger: number }): void {
    this.etats.set(departId, etat);
  }

  async etat(departId: string) {
    return this.etats.get(departId) ?? { charges: 0, colisACharger: 0 };
  }
}

/* ------------------------------------------------------------------ signature des QR */

/**
 * Signataire à clé fournie (production) ou fabriquée au démarrage (tests, développement : les QR ne
 * survivent alors pas à un redémarrage, `durable` est faux).
 */
export class SignataireQrEcdsa extends SignataireQr implements StockageBilletterie {
  private paire: Promise<PaireCles> | null = null;

  constructor(
    private readonly cle: CleJwk | null,
    readonly durable: boolean,
  ) {
    super();
  }

  private obtenir(): Promise<PaireCles> {
    if (!this.paire) {
      this.paire = this.cle
        ? Promise.resolve({ privee: this.cle, publique: publiqueDe(this.cle) })
        : genererPaireQr();
    }
    return this.paire;
  }

  async signer(contenu: ContenuQr) {
    if (contenu.departId.includes(":")) throw new RangeError("Identifiant de départ invalide");
    return signerQr((await this.obtenir()).privee, contenu);
  }

  async clePublique() {
    return (await this.obtenir()).publique;
  }

  async verifier(qr: string) {
    return verifierQr((await this.obtenir()).publique, qr);
  }
}

/* ------------------------------------------------------------------ avis et temps réel */

@Injectable()
export class AvisMemoire extends AvisBillets implements StockageBilletterie {
  readonly durable = false;
  readonly publies: AvisBilletterie[] = [];

  publier(avis: AvisBilletterie): void {
    this.publies.push(copie(avis));
  }

  de<T extends AvisBilletterie["type"]>(type: T): Extract<AvisBilletterie, { type: T }>[] {
    return this.publies.filter((a): a is Extract<AvisBilletterie, { type: T }> => a.type === type);
  }
}

@Injectable()
export class DiffusionMemoire extends DiffusionTempsReel implements StockageBilletterie {
  readonly durable = false;
  private readonly ecouteurs = new Map<string, Set<(message: unknown) => void>>();

  publier(canal: string, message: unknown): void {
    for (const ecouteur of [...(this.ecouteurs.get(canal) ?? [])]) ecouteur(message);
  }

  souscrire(canal: string, ecouteur: (message: unknown) => void): () => void {
    const s = this.ecouteurs.get(canal) ?? new Set();
    s.add(ecouteur);
    this.ecouteurs.set(canal, s);
    return () => {
      s.delete(ecouteur);
    };
  }

  nombreAbonnes(canal: string): number {
    return this.ecouteurs.get(canal)?.size ?? 0;
  }
}
