// État réactif du formulaire « Nouvelle tâche » / « Modifier la tâche », partagé par ses sections.
import { dernierDuMois, jourSemaine } from '@core/dates.ts';
import type { Jour } from '@core/types.ts';
import { CLE_LIVRE, cleDuLivre, type PointRapportLigne, type Tache } from '@core/lignes.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { metriquesDe, projetsDe, rubriques, sousProjetsDe } from '../../data/requetes.ts';
import { attendusDe } from '../../data/actions/blocs.ts';
import type { NouvelleTache } from '../../data/actions/taches.ts';
import { accepteLivres, ajouterLivre } from '../../data/actions/reglages.ts';
import { construireRegle, prevuParDefaut, unionMesures, type MesureForm, type Recurrence, type TypeFin } from './tache.ts';

export class FormulaireTache {
  titre = $state('');
  assoc = $state(true);
  rubriqueId = $state<string | null>(null);
  projetId = $state<string | null>(null);
  /** Sous-projets désactivés (tous les autres sont alimentés). */
  spOff = $state<string[]>([]);
  /** Valeurs prévues modifiées à la main, par clé (unité de base). */
  vals = $state<Record<string, number>>({});
  debut = $state<Jour>('');
  rec = $state<Recurrence>('hebdo');
  jours = $state<number[]>([]);
  mensuel = $state<'jour_du_mois' | 'rang'>('jour_du_mois');
  fin = $state<TypeFin>('aucune');
  finDate = $state<Jour>('');
  finFois = $state(10);
  heure = $state(9 * 60);
  duree = $state(45);
  rappel = $state<number | null>(10);
  /** Rappels plus tôt (minutes avant le début). */
  rappelsAvant = $state<number[]>([]);
  /** Alarme : le rappel le plus proche du début insiste (2 min, 5 fois) tant que le bloc n'est pas lancé, fait ou reporté. */
  alarme = $state(false);

  rubriques = $derived(rubriques());
  projets = $derived(this.rubriqueId ? projetsDe(this.rubriqueId) : []);
  sousProjets = $derived(this.projetId ? sousProjetsDe(this.projetId).filter((s) => s.statut !== 'termine') : []);
  actifs = $derived(this.assoc ? this.sousProjets.filter((s) => !this.spOff.includes(s.id)) : []);
  /** Livre lu par la tâche : un livre en cours (id) ou un nouveau, saisi dans le formulaire et créé à l'ajout. */
  livreId = $state<string | null>(null);
  livreNouveau = $state<{ titre: string; auteur: string; total: string; depart: string } | null>(null);
  /** Point du rapport qui suit des livres pour ce projet (LLC → CL), ou null. */
  pointLivres = $derived<PointRapportLigne | null>(this.assoc && this.projetId
    ? magasin.lignes.points_rapport.find((p) => p.actif && p.projet_id === this.projetId && accepteLivres(p)) ?? null : null);
  livresEnCours = $derived((this.pointLivres?.livres ?? []).filter((l) => l.actif));
  /** Le livre rattaché à la tâche, sous la clé de ses pages (« livre:<id> », « livre:nouveau » avant sa création). */
  livre = $derived.by((): { cle: string; titre: string } | null => {
    if (!this.pointLivres) return null;
    const n = this.livreNouveau?.titre.trim();
    if (n) return { cle: `${CLE_LIVRE}nouveau`, titre: n };
    const l = this.livresEnCours.find((x) => x.id === this.livreId);
    return l ? { cle: cleDuLivre(l.id), titre: l.titre } : null;
  });
  /** Mesures de la tâche : celles des sous-projets ; avec un livre, ses pages remplacent le champ « pages » (elles y comptent déjà). */
  mesures = $derived.by((): MesureForm[] => {
    if (!this.assoc) return [];
    const base = unionMesures(this.actifs.map((s) => ({ nom: s.nom, metriques: metriquesDe(s.id) })));
    const livre = this.livre;
    if (!livre) return base;
    const pages = base.find((m) => m.cle === 'nombre:pages');
    const pagesLivre: MesureForm = { cle: livre.cle, type: 'nombre', nom: `Pages · ${livre.titre}`, unite: 'p', options: null, alimente: [], cible: pages?.cible ?? 10, periode: pages?.periode ?? 'jour' };
    const sans = base.filter((m) => m.cle !== 'nombre:pages');
    const i = sans.findIndex((m) => m.type === 'temps');
    return i < 0 ? [...sans, pagesLivre] : [...sans.slice(0, i), pagesLivre, ...sans.slice(i)];
  });
  regle = $derived(construireRegle({ debut: this.debut, rec: this.rec, jours: this.jours, mensuel: this.mensuel, fin: this.fin, finDate: this.finDate, finFois: this.finFois }));
  couleur = $derived(this.assoc ? this.rubriques.find((r) => r.id === this.rubriqueId)?.couleur ?? null : null);

  /** Valeur prévue d'une mesure (modifiée à la main, sinon proposée). */
  prevu(m: MesureForm): number | null {
    return this.vals[m.cle] ?? prevuParDefaut(m, this.duree, this.rec === 'hebdo' ? this.jours.length : 7);
  }

  nouvelle(debut: Jour, heure: number, projetId: string | null, sansProjet: boolean, rappelDefaut: number, alarmeDefaut = false): void {
    this.alarme = alarmeDefaut;
    this.debut = debut;
    this.finDate = dernierDuMois(debut.slice(0, 7));
    this.heure = heure;
    this.rappel = rappelDefaut;
    this.assoc = !sansProjet;
    this.rec = sansProjet ? 'une_fois' : 'hebdo';
    this.jours = [jourSemaine(debut)];
    const p = projetId ? magasin.trouver('projets', projetId) : undefined;
    this.rubriqueId = p?.rubrique_id ?? this.rubriques[0]?.id ?? null;
    this.projetId = p?.id ?? null;
  }

  charger(t: Tache): void {
    this.titre = t.titre;
    const p = t.projet_id ? magasin.trouver('projets', t.projet_id) : undefined;
    this.assoc = !!p;
    this.rubriqueId = p?.rubrique_id ?? this.rubriques[0]?.id ?? null;
    this.projetId = p?.id ?? null;
    const alimentes = new Set(magasin.lignes.tache_alimente.filter((a) => a.tache_id === t.id).map((a) => a.sous_projet_id));
    this.spOff = p ? sousProjetsDe(p.id).filter((s) => !alimentes.has(s.id)).map((s) => s.id) : [];
    this.vals = Object.fromEntries(attendusDe(t.id).map((a) => [a.cle, a.valeur_prevue]));
    const r = t.regle;
    this.debut = r.debut;
    this.rec = r.frequence;
    this.jours = r.jours?.length ? [...r.jours] : [jourSemaine(r.debut)];
    this.mensuel = r.mensuel?.mode ?? 'jour_du_mois';
    this.fin = r.fin.type;
    this.finDate = r.fin.type === 'date' ? r.fin.date : dernierDuMois(r.debut.slice(0, 7));
    this.finFois = r.fin.type === 'fois' ? r.fin.fois : 10;
    this.heure = t.heure_debut;
    this.duree = t.duree_min;
    this.rappel = t.rappel_min;
    this.rappelsAvant = [...(t.rappels_avant_min ?? [])];
    this.livreId = Object.keys(this.vals).find((k) => k.startsWith(CLE_LIVRE))?.slice(CLE_LIVRE.length) ?? null;
    this.livreNouveau = null;
    this.alarme = !!t.alarme;
  }

  /** Copie d'une tâche : tous ses réglages (titre, projet, mesures, durée, rappels, alarme, récurrence), posée au jour et à l'heure demandés. */
  dupliquer(t: Tache, jour: Jour, heure: number): void {
    this.charger(t);
    this.debut = jour;
    this.heure = Math.min(heure, 1440 - this.duree);
    if (this.fin === 'date' && this.finDate < jour) this.finDate = dernierDuMois(jour.slice(0, 7));
    if (this.rec === 'hebdo' && !this.jours.length) this.jours = [jourSemaine(jour)];
  }

  /**
   * Reprend les réglages d'une tâche déjà créée (titre, projet et sous-projets alimentés, valeurs prévues, durée, rappels).
   * Le jour, l'heure de début et la récurrence restent ceux qui sont choisis.
   */
  appliquerModele(t: Tache): void {
    const garde = { debut: this.debut, rec: this.rec, jours: this.jours, mensuel: this.mensuel, fin: this.fin, finDate: this.finDate, finFois: this.finFois, heure: this.heure };
    this.charger(t);
    Object.assign(this, garde);
    this.heure = Math.min(garde.heure, 1440 - this.duree);
  }

  choisirRubrique(id: string): void {
    this.livreId = null; this.livreNouveau = null;
    this.rubriqueId = id;
    this.projetId = null;
    this.spOff = [];
    this.vals = {};
  }

  choisirProjet(id: string): void {
    this.livreId = null; this.livreNouveau = null;
    this.projetId = id;
    this.spOff = [];
    this.vals = {};
  }

  choisirDebut(j: Jour): void {
    this.debut = j;
    if (this.rec === 'hebdo') this.jours = [jourSemaine(j)];
    if (this.fin === 'date' && this.finDate < j) this.finDate = dernierDuMois(j.slice(0, 7));
  }

  /** Crée le livre saisi dans le formulaire (s'il y en a un) et le rattache à la tâche ; ses pages prévues suivent sa vraie clé. */
  resoudreLivre(): void {
    const n = this.livreNouveau;
    if (!n || !n.titre.trim() || !this.pointLivres) return;
    const nb = (t: string) => { const v = Math.round(Number(t.replace(',', '.').replace(/[^\d.]/g, ''))); return Number.isFinite(v) && v > 0 ? v : null; };
    const id = ajouterLivre(this.pointLivres.id, { titre: n.titre, auteur: n.auteur, total: nb(n.total), depart: nb(n.depart) ?? 0 });
    if (!id) return;
    const ancienne = `${CLE_LIVRE}nouveau`;
    if (ancienne in this.vals) { const { [ancienne]: v, ...reste } = this.vals; this.vals = { ...reste, [cleDuLivre(id)]: v }; }
    this.livreId = id;
    this.livreNouveau = null;
  }

  /** Données prêtes pour `ajouterTache` (valeurs prévues de chaque mesure, sauf celles sans prévision). */
  versNouvelle(): NouvelleTache {
    this.resoudreLivre(); // appelée au moment d'enregistrer : le nouveau livre est créé avec la tâche
    const attendus = this.mesures.map((m) => ({ cle: m.cle, valeur: this.prevu(m) })).filter((a): a is { cle: string; valeur: number } => a.valeur != null);
    return {
      titre: this.titre, projetId: this.assoc ? this.projetId : null, regle: this.regle, heureDebut: this.heure, dureeMin: this.duree,
      rappelMin: this.rappel, rappelsAvantMin: [...this.rappelsAvant].sort((a, b) => b - a), alarme: this.alarme, sousProjetIds: this.actifs.map((s) => s.id), attendus: this.assoc ? attendus : []
    };
  }
}
