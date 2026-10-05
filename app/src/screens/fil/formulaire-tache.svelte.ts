// État réactif du formulaire « Nouvelle tâche » / « Modifier la tâche », partagé par ses sections.
import { dernierDuMois, jourSemaine } from '@core/dates.ts';
import type { Jour } from '@core/types.ts';
import type { Tache } from '@core/lignes.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { metriquesDe, projetsDe, rubriques, sousProjetsDe } from '../../data/requetes.ts';
import { attendusDe } from '../../data/actions/blocs.ts';
import type { NouvelleTache } from '../../data/actions/taches.ts';
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

  rubriques = $derived(rubriques());
  projets = $derived(this.rubriqueId ? projetsDe(this.rubriqueId) : []);
  sousProjets = $derived(this.projetId ? sousProjetsDe(this.projetId).filter((s) => s.statut !== 'termine') : []);
  actifs = $derived(this.assoc ? this.sousProjets.filter((s) => !this.spOff.includes(s.id)) : []);
  mesures = $derived(this.assoc ? unionMesures(this.actifs.map((s) => ({ nom: s.nom, metriques: metriquesDe(s.id) }))) : []);
  regle = $derived(construireRegle({ debut: this.debut, rec: this.rec, jours: this.jours, mensuel: this.mensuel, fin: this.fin, finDate: this.finDate, finFois: this.finFois }));
  couleur = $derived(this.assoc ? this.rubriques.find((r) => r.id === this.rubriqueId)?.couleur ?? null : null);

  /** Valeur prévue d'une mesure (modifiée à la main, sinon proposée). */
  prevu(m: MesureForm): number | null {
    return this.vals[m.cle] ?? prevuParDefaut(m, this.duree, this.rec === 'hebdo' ? this.jours.length : 7);
  }

  nouvelle(debut: Jour, heure: number, projetId: string | null, sansProjet: boolean, rappelDefaut: number): void {
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
  }

  choisirRubrique(id: string): void {
    this.rubriqueId = id;
    this.projetId = null;
    this.spOff = [];
    this.vals = {};
  }

  choisirProjet(id: string): void {
    this.projetId = id;
    this.spOff = [];
    this.vals = {};
  }

  choisirDebut(j: Jour): void {
    this.debut = j;
    if (this.rec === 'hebdo') this.jours = [jourSemaine(j)];
    if (this.fin === 'date' && this.finDate < j) this.finDate = dernierDuMois(j.slice(0, 7));
  }

  /** Données prêtes pour `ajouterTache` (valeurs prévues de chaque mesure, sauf celles sans prévision). */
  versNouvelle(): NouvelleTache {
    const attendus = this.mesures.map((m) => ({ cle: m.cle, valeur: this.prevu(m) })).filter((a): a is { cle: string; valeur: number } => a.valeur != null);
    return {
      titre: this.titre, projetId: this.assoc ? this.projetId : null, regle: this.regle, heureDebut: this.heure, dureeMin: this.duree,
      rappelMin: this.rappel, sousProjetIds: this.actifs.map((s) => s.id), attendus: this.assoc ? attendus : []
    };
  }
}
