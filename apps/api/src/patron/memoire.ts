import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { jourDouala } from "../rapport/temps";
import { TelephoneDejaUtilise } from "../socle/comptes/personnes.repository";
import { resumerAppareils } from "./calculs";
import type {
  ActivitePersonne,
  AlerteEcrite,
  ArretBus,
  ChangementMembre,
  CompagniePatron,
  ConfirmationMomo,
  DepartExploitation,
  DossierEnAttente,
  EvenementJournal,
  GarePatron,
  MembrePatron,
  NouveauMembre,
  OperateurMomo,
  PanneSignalee,
  PropositionEnAttente,
  ReglesLues,
} from "./modele";
import {
  AlertesEcrites,
  EquipePatron,
  ExploitationPatron,
  ReferentielPatron,
  ReglesPatron,
} from "./ports";
import type { patron as c } from "@afrimove/contrats";

/**
 * Adaptateurs en mémoire des ports du module patron : tests et développement sans base. Les méthodes
 * `declarer…` / `ajouter…` servent à monter un jeu d'essai ; `durable = false` fait refuser le démarrage
 * en production (voir `VerificationPatron`).
 */

const clone = <T>(valeur: T): T => structuredClone(valeur);

/* ------------------------------------------------------------------ référentiel */

export interface GareDeclaree {
  id: string;
  code: string;
  nom: string;
  ville: string;
  guichets: Array<{ id: string; rang: number }>;
  nbQuais?: number;
  /** Un téléphone par guichet : la dernière fois qu'il s'est annoncé. */
  appareils?: Array<{ rang: number; derniereSyncA: Date | null }>;
}

@Injectable()
export class ReferentielPatronMemoire extends ReferentielPatron {
  readonly durable = false;
  private readonly compagnies = new Map<string, CompagniePatron>();
  private readonly garesParCompagnie = new Map<string, GareDeclaree[]>();
  private readonly flotte = new Map<string, number>();

  declarer(compagnie: CompagniePatron, gares: GareDeclaree[], nbBus = 0): this {
    this.compagnies.set(compagnie.id, clone(compagnie));
    this.garesParCompagnie.set(compagnie.id, clone(gares));
    this.flotte.set(compagnie.id, nbBus);
    return this;
  }

  /** Test : un téléphone de guichet s'annonce. */
  synchroniser(gareId: string, rang: number, a: Date | null): void {
    for (const liste of this.garesParCompagnie.values()) {
      const gare = liste.find((g) => g.id === gareId);
      if (!gare) continue;
      gare.appareils ??= [];
      const existant = gare.appareils.find((x) => x.rang === rang);
      if (existant) existant.derniereSyncA = a;
      else gare.appareils.push({ rang, derniereSyncA: a });
    }
  }

  async compagnie(id: string): Promise<CompagniePatron | null> {
    const trouvee = this.compagnies.get(id);
    return trouvee ? clone(trouvee) : null;
  }

  async gares(compagnieId: string, maintenant: Date): Promise<GarePatron[]> {
    return [...(this.garesParCompagnie.get(compagnieId) ?? [])]
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
      .map((g) => ({
        id: g.id,
        code: g.code,
        nom: g.nom,
        ville: g.ville,
        guichets: clone(g.guichets),
        nbQuais: g.nbQuais ?? 0,
        appareils: resumerAppareils(g.appareils ?? [], maintenant),
      }));
  }

  async nbBus(compagnieId: string): Promise<number> {
    return this.flotte.get(compagnieId) ?? 0;
  }
}

/* ------------------------------------------------------------------ exploitation */

@Injectable()
export class ExploitationPatronMemoire extends ExploitationPatron {
  readonly durable = false;
  private readonly departs: Array<DepartExploitation & { compagnieId: string }> = [];
  private readonly arrets: Array<ArretBus & { compagnieId: string }> = [];
  private readonly pannes: Array<PanneSignalee & { compagnieId: string }> = [];
  private readonly propositions: Array<
    PropositionEnAttente & { compagnieId: string; expireLe: Date }
  > = [];
  private readonly decalages = new Map<string, string>();
  private readonly correspondances = new Map<string, { nombre: number; depuis: Date | null }>();
  private readonly relais = new Map<string, number>();
  private readonly journaux: Array<EvenementJournal & { gareId: string }> = [];
  private readonly dossiers: Array<DossierEnAttente & { compagnieId: string }> = [];
  private readonly enRoute = new Map<string, number>();

  ajouterDepart(compagnieId: string, depart: DepartExploitation): this {
    this.departs.push({ ...clone(depart), compagnieId });
    return this;
  }
  ajouterArret(compagnieId: string, arret: ArretBus): this {
    this.arrets.push({ ...clone(arret), compagnieId });
    return this;
  }
  ajouterPanne(compagnieId: string, panne: PanneSignalee): this {
    this.pannes.push({ ...clone(panne), compagnieId });
    return this;
  }
  ajouterProposition(compagnieId: string, proposition: PropositionEnAttente, expireLe: Date): this {
    this.propositions.push({ ...clone(proposition), compagnieId, expireLe });
    return this;
  }
  /** Test : l'assistant propose de décaler un départ de cette ligne (« 10:00 → 09:15 »). */
  definirDecalage(ligneId: string, texte: string | null): this {
    if (texte === null) this.decalages.delete(ligneId);
    else this.decalages.set(ligneId, texte);
    return this;
  }
  definirCorrespondance(compagnieId: string, nombre: number, depuis: Date | null): this {
    this.correspondances.set(compagnieId, { nombre, depuis });
    return this;
  }
  definirColisAuRelais(gareId: string, nombre: number): this {
    this.relais.set(gareId, nombre);
    return this;
  }
  ajouterEvenement(gareId: string, evenement: EvenementJournal): this {
    this.journaux.push({ ...clone(evenement), gareId });
    return this;
  }
  ajouterDossier(compagnieId: string, dossier: DossierEnAttente): this {
    this.dossiers.push({ ...clone(dossier), compagnieId });
    return this;
  }
  definirBusEnRoute(compagnieId: string, nombre: number): this {
    this.enRoute.set(compagnieId, nombre);
    return this;
  }

  async departsDuJour(compagnieId: string, jour: string): Promise<DepartExploitation[]> {
    return this.departs
      .filter((d) => d.compagnieId === compagnieId && jourDouala(d.heureDepart) === jour)
      .map(({ compagnieId: _c, ...d }) => clone(d));
  }

  async busEnRoute(compagnieId: string): Promise<number> {
    const fixe = this.enRoute.get(compagnieId);
    if (fixe !== undefined) return fixe;
    return new Set(
      this.departs
        .filter((d) => d.compagnieId === compagnieId && d.etat === "parti" && d.bus !== null)
        .map((d) => d.bus),
    ).size;
  }

  async arretsOuverts(compagnieId: string): Promise<ArretBus[]> {
    return this.arrets
      .filter((a) => a.compagnieId === compagnieId)
      .map(({ compagnieId: _c, ...a }) => clone(a));
  }

  async pannesDepuis(compagnieId: string, depuis: Date): Promise<PanneSignalee[]> {
    return this.pannes
      .filter((p) => p.compagnieId === compagnieId && p.signaleA.getTime() >= depuis.getTime())
      .map(({ compagnieId: _c, ...p }) => clone(p));
  }

  async propositionsEnAttente(
    compagnieId: string,
    maintenant: Date,
  ): Promise<PropositionEnAttente[]> {
    return this.propositions
      .filter((p) => p.compagnieId === compagnieId && p.expireLe.getTime() > maintenant.getTime())
      .map(({ compagnieId: _c, expireLe: _e, ...p }) => clone(p));
  }

  async decalagesProposes(
    _compagnieId: string,
    _maintenant: Date,
  ): Promise<Record<string, string>> {
    return Object.fromEntries(this.decalages);
  }

  async colisEnCorrespondance(
    compagnieId: string,
  ): Promise<{ nombre: number; depuis: Date | null }> {
    return clone(this.correspondances.get(compagnieId) ?? { nombre: 0, depuis: null });
  }

  async colisAuRelais(gareId: string): Promise<number> {
    return this.relais.get(gareId) ?? 0;
  }

  async journalDeGare(gareId: string, depuis: Date, limite: number): Promise<EvenementJournal[]> {
    return this.journaux
      .filter((e) => e.gareId === gareId && e.at.getTime() >= depuis.getTime())
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limite)
      .map(({ gareId: _g, ...e }) => clone(e));
  }

  async dossiersFinancementEnAttente(compagnieId: string): Promise<DossierEnAttente[]> {
    return this.dossiers
      .filter((d) => d.compagnieId === compagnieId)
      .map(({ compagnieId: _c, ...d }) => clone(d));
  }
}

@Injectable()
export class AlertesEcritesMemoire extends AlertesEcrites {
  readonly durable = false;
  private readonly alertes: Array<AlerteEcrite & { compagnieId: string }> = [];
  /**
   * Les alertes que la caisse et la supervision écrivent dans leur propre port (`AlertesPatron`) : en
   * mémoire elles ne portent pas d'instant, on les date de leur première lecture.
   */
  private source:
    | (() => ReadonlyArray<{
        type: string;
        compagnieId: string | null;
        gareId: string | null;
        message: string;
        details: Record<string, unknown>;
      }>)
    | null = null;
  private readonly vues = new Map<number, Date>();
  private horloge: (() => Date) | null = null;

  ecrire(compagnieId: string, alerte: Omit<AlerteEcrite, "id">): this {
    this.alertes.push({ ...clone(alerte), id: randomUUID(), compagnieId });
    return this;
  }

  /** Branche la lecture des alertes écrites par la caisse (adaptateur en mémoire de `AlertesPatron`). */
  brancher(source: NonNullable<AlertesEcritesMemoire["source"]>, horloge: () => Date): void {
    this.source = source;
    this.horloge = horloge;
  }

  async depuis(compagnieId: string, depuis: Date): Promise<AlerteEcrite[]> {
    const propres = this.alertes.filter(
      (a) => a.compagnieId === compagnieId && a.creeA.getTime() >= depuis.getTime(),
    );
    const brutes = this.source?.() ?? [];
    const dePortCaisse: AlerteEcrite[] = [];
    brutes.forEach((a, i) => {
      if (a.compagnieId !== compagnieId) return;
      if (!this.vues.has(i)) this.vues.set(i, this.horloge ? this.horloge() : new Date());
      const creeA = this.vues.get(i)!;
      if (creeA.getTime() < depuis.getTime()) return;
      dePortCaisse.push({
        id: `memoire-${i}`,
        type: a.type,
        gareId: a.gareId,
        message: a.message,
        details: clone(a.details),
        creeA,
      });
    });
    return [...propres.map(({ compagnieId: _c, ...a }) => clone(a)), ...dePortCaisse].sort(
      (a, b) => b.creeA.getTime() - a.creeA.getTime(),
    );
  }
}

/* ------------------------------------------------------------------ équipe */

interface MembreMemoire extends MembrePatron {
  compagnieId: string;
  telephoneIndex: string;
}

@Injectable()
export class EquipePatronMemoire extends EquipePatron {
  readonly durable = false;
  readonly membres = new Map<string, MembreMemoire>();
  private readonly activites = new Map<string, ActivitePersonne>();
  private readonly guichets = new Map<string, string>();
  private readonly nomsDeGares = new Map<string, string>();

  /** Liaison avec le socle : en production, la création écrit dans `personne` (comptes, connexion). */
  surCreation: ((membre: NouveauMembre) => void) | null = null;
  surDesactivation: ((personneId: string) => void) | null = null;
  surModification: ((personneId: string, changement: ChangementMembre) => void) | null = null;

  declarerGare(gareId: string, nom: string): this {
    this.nomsDeGares.set(gareId, nom);
    return this;
  }
  declarerGuichet(gareId: string, rang: number, guichetId: string): this {
    this.guichets.set(`${gareId}:${rang}`, guichetId);
    return this;
  }
  ajouter(compagnieId: string, membre: MembrePatron): this {
    this.membres.set(membre.id, {
      ...clone(membre),
      compagnieId,
      telephoneIndex: `idx-${membre.id}`,
    });
    return this;
  }
  definirActivite(personneId: string, activite: ActivitePersonne): this {
    this.activites.set(personneId, clone(activite));
    return this;
  }

  private vers(m: MembreMemoire): MembrePatron {
    const { compagnieId: _c, telephoneIndex: _t, ...membre } = clone(m);
    return membre;
  }

  async lister(compagnieId: string, _maintenant: Date): Promise<MembrePatron[]> {
    return [...this.membres.values()]
      .filter((m) => m.compagnieId === compagnieId && m.actif)
      .map((m) => this.vers(m));
  }

  async trouver(
    compagnieId: string,
    personneId: string,
    _maintenant: Date,
  ): Promise<MembrePatron | null> {
    const m = this.membres.get(personneId);
    return m && m.compagnieId === compagnieId ? this.vers(m) : null;
  }

  async activite(personneId: string, _depuis: Date): Promise<ActivitePersonne> {
    return clone(
      this.activites.get(personneId) ?? { billets: 0, colis: 0, litiges: 0, annulations: 0 },
    );
  }

  async guichetDeGare(gareId: string, rang: number): Promise<string | null> {
    return this.guichets.get(`${gareId}:${rang}`) ?? null;
  }

  async creer(nouveau: NouveauMembre): Promise<void> {
    if ([...this.membres.values()].some((m) => m.telephoneIndex === nouveau.telephoneIndex)) {
      throw new TelephoneDejaUtilise();
    }
    const rang =
      nouveau.guichetId === null
        ? null
        : ([...this.guichets.entries()]
            .find(([, id]) => id === nouveau.guichetId)?.[0]
            ?.split(":")[1] ?? null);
    this.membres.set(nouveau.id, {
      id: nouveau.id,
      compagnieId: nouveau.compagnieId,
      nom: nouveau.nom,
      role: nouveau.role,
      gareId: nouveau.gareId,
      gareNom: nouveau.gareId === null ? null : (this.nomsDeGares.get(nouveau.gareId) ?? null),
      guichetId: nouveau.guichetId,
      guichetRang: rang === null ? null : Number(rang),
      bus: null,
      situation: "repos",
      enServiceDepuis: null,
      actif: true,
      bloqueJusqua: null,
      pinProvisoireJusqua: nouveau.pinProvisoireJusqua,
      creeA: new Date(),
      telephoneChiffre: nouveau.telephoneChiffre,
      operateur: nouveau.operateur,
      salaire: nouveau.salaire,
      jourDePaie: nouveau.jourDePaie,
      droits: clone(nouveau.droits),
      billets90: 0,
      telephoneIndex: nouveau.telephoneIndex,
    });
    this.surCreation?.(nouveau);
  }

  async modifier(personneId: string, changement: ChangementMembre): Promise<void> {
    const m = this.membres.get(personneId);
    if (!m) return;
    if (
      changement.telephoneIndex !== undefined &&
      [...this.membres.values()].some(
        (x) => x.id !== personneId && x.telephoneIndex === changement.telephoneIndex,
      )
    ) {
      throw new TelephoneDejaUtilise();
    }
    const suivant: MembreMemoire = { ...m };
    if (changement.nom !== undefined) suivant.nom = changement.nom;
    if (changement.telephoneChiffre !== undefined)
      suivant.telephoneChiffre = changement.telephoneChiffre;
    if (changement.telephoneIndex !== undefined) {
      suivant.telephoneIndex = changement.telephoneIndex;
    }
    if (changement.role !== undefined) suivant.role = changement.role;
    if (changement.gareId !== undefined) {
      suivant.gareId = changement.gareId;
      suivant.gareNom =
        changement.gareId === null ? null : (this.nomsDeGares.get(changement.gareId) ?? null);
    }
    if (changement.guichetId !== undefined) {
      suivant.guichetId = changement.guichetId;
      const entree = [...this.guichets.entries()].find(([, id]) => id === changement.guichetId);
      suivant.guichetRang = entree ? Number(entree[0].split(":")[1]) : null;
    }
    if (changement.operateur !== undefined) suivant.operateur = changement.operateur;
    if (changement.salaire !== undefined) suivant.salaire = changement.salaire;
    if (changement.droits !== undefined) suivant.droits = clone(changement.droits);
    this.membres.set(personneId, suivant);
    this.surModification?.(personneId, changement);
  }

  async desactiver(personneId: string): Promise<void> {
    const m = this.membres.get(personneId);
    if (!m) return;
    this.membres.set(personneId, { ...m, actif: false });
    this.surDesactivation?.(personneId);
  }
}

/* ------------------------------------------------------------------ règles et comptes mobile money */

@Injectable()
export class ReglesPatronMemoire extends ReglesPatron {
  readonly durable = false;
  private readonly regles = new Map<string, ReglesLues>();
  private readonly chiffres = new Map<string, string>();
  private readonly confirmations = new Map<string, ConfirmationMomo>();
  readonly anciens = new Map<string, { chiffre: string; jusqua: Date }>();

  /** Liaison avec la caisse : en production la tolérance est lue dans `compagnie.toleranceEcartCaisse`. */
  surTolerance: ((compagnieId: string, montant: number) => void) | null = null;

  /** Test : un compte marchand déjà réglé. */
  definirCompte(compagnieId: string, operateur: OperateurMomo, chiffre: string): this {
    this.chiffres.set(`${compagnieId}|${operateur}`, chiffre);
    return this;
  }

  async lire(compagnieId: string): Promise<ReglesLues | null> {
    const r = this.regles.get(compagnieId);
    return r ? clone(r) : null;
  }

  async ecrire(
    compagnieId: string,
    regles: c.ReglesModifiables,
    _par: string,
    _a: Date,
  ): Promise<void> {
    this.regles.set(compagnieId, {
      annulation: clone(regles.annulation),
      caisse: { toleranceEcart: regles.caisse.toleranceEcart, auDela: regles.caisse.auDela },
      cadence: clone(regles.cadence),
      fraisService: clone(regles.fraisService),
    });
    this.surTolerance?.(compagnieId, regles.caisse.toleranceEcart);
  }

  async comptes(compagnieId: string): Promise<Record<OperateurMomo, string | null>> {
    return {
      mtn: this.chiffres.get(`${compagnieId}|mtn`) ?? null,
      orange: this.chiffres.get(`${compagnieId}|orange`) ?? null,
    };
  }

  async demanderConfirmation(
    compagnieId: string,
    operateur: OperateurMomo,
    confirmation: Omit<ConfirmationMomo, "essais">,
  ): Promise<void> {
    this.confirmations.set(`${compagnieId}|${operateur}`, { ...clone(confirmation), essais: 0 });
  }

  async confirmation(
    compagnieId: string,
    operateur: OperateurMomo,
  ): Promise<ConfirmationMomo | null> {
    const k = this.confirmations.get(`${compagnieId}|${operateur}`);
    return k ? clone(k) : null;
  }

  async compterEssai(compagnieId: string, operateur: OperateurMomo): Promise<number> {
    const cle = `${compagnieId}|${operateur}`;
    const k = this.confirmations.get(cle);
    if (!k) return 0;
    k.essais += 1;
    return k.essais;
  }

  async changerCompte(
    compagnieId: string,
    operateur: OperateurMomo,
    nouveauChiffre: string,
    ancienJusqua: Date,
    _par: string,
    _a: Date,
  ): Promise<void> {
    const cle = `${compagnieId}|${operateur}`;
    const ancien = this.chiffres.get(cle);
    if (ancien !== undefined) this.anciens.set(cle, { chiffre: ancien, jusqua: ancienJusqua });
    this.chiffres.set(cle, nouveauChiffre);
    this.confirmations.delete(cle);
  }
}
