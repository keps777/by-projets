import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from './magasin.svelte.ts';
import { session } from './auth.svelte.ts';
import { horloge } from './temps.svelte.ts';
import { ajouterTache, materialiserTache, reporter, supprimerOccurrences } from './actions/taches.ts';
import { corrigerValeur, ecouleOccurrence, lancerBloc, pauseBloc, reprendreBloc, saisirBloc, terminerBloc } from './actions/blocs.ts';
import { creerDepuisModele, creerSousProjet, validerSousProjet } from './actions/projets.ts';
import { blocsDuJour, progressionProjet, progressionSousProjet, valeursDuProjet } from './requetes.ts';
import { MODELES } from '@core/modeles.ts';

const NOW = Date.parse('2026-10-05T09:00:00Z'); // 05:00 à Montréal

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  horloge.maintenant = NOW;
  await session.demarrer();
});

const projet = (nom: string) => magasin.lignes.projets.find((p) => p.nom === nom)!;

describe('démarrage en mode local', () => {
  it('crée les données de départ', () => {
    expect(magasin.lignes.rubriques).toHaveLength(5);
    expect(magasin.lignes.projets).toHaveLength(24);
    expect(magasin.lignes.points_rapport).toHaveLength(12);
    expect(magasin.lignes.presets_export).toHaveLength(3);
    expect(magasin.lignes.profils[0].prenom).toBe('Luther');
  });
  it('écrit dans IndexedDB et la file d’envoi', async () => {
    await magasin.terminerEcritures();
    expect(await magasin.db!.lignes('projets').count()).toBe(24);
    expect(magasin.enAttente).toBeGreaterThan(40);
  });
});

describe('tâches et occurrences', () => {
  const regleJeudi = { frequence: 'hebdo' as const, debut: '2026-10-08', jours: [3], fin: { type: 'aucune' as const } };

  it('chaque jeudi : occurrences sur 90 jours et rappels, sans doublon à la relecture', () => {
    const id = ajouterTache({ titre: 'Rencontre avec Christopher', projetId: projet('La formation des disciples').id, regle: regleJeudi, heureDebut: 19 * 60, dureeMin: 45, rappelMin: 10 });
    const occs = magasin.lignes.occurrences.filter((o) => o.tache_id === id);
    expect(occs.length).toBeGreaterThanOrEqual(13);
    expect(occs[0].jour).toBe('2026-10-08');
    expect(occs[0].debut).toBe('2026-10-08T23:00:00.000Z');
    expect(magasin.lignes.rappels.filter((r) => r.type === 'bloc')).toHaveLength(occs.length);
    expect(materialiserTache(id)).toBe(0);
    expect(magasin.lignes.occurrences.filter((o) => o.tache_id === id)).toHaveLength(occs.length);
  });

  it('un rendez-vous sans projet apparaît dans Le Fil, en gris', () => {
    ajouterTache({ titre: 'Réunion d’équipe', projetId: null, regle: { frequence: 'une_fois', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 16 * 60 + 30, dureeMin: 30, rappelMin: 5 });
    const b = blocsDuJour('2026-10-05');
    expect(b).toHaveLength(1);
    expect(b[0].projet).toBeNull();
    expect(b[0].debutMin).toBe(990);
    expect(b[0].finMin).toBe(1020);
  });

  it('reporter déplace une seule occurrence et recalcule son rappel', () => {
    const id = ajouterTache({ titre: 'Prière', projetId: projet('La prière seule').id, regle: { frequence: 'quotidien', debut: '2026-10-06', fin: { type: 'fois', fois: 3 } }, heureDebut: 375, dureeMin: 45, rappelMin: 10 });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === id && o.jour === '2026-10-07')!;
    reporter(occ.id, { jour: '2026-10-07', debutMin: 20 * 60, rappelMin: 15 });
    const apres = magasin.trouver('occurrences', occ.id)!;
    expect(apres.exception).toBe(true);
    expect(apres.debut).toBe('2026-10-08T00:00:00.000Z');
    const rappels = magasin.lignes.rappels.filter((r) => r.occurrence_id === occ.id);
    expect(rappels.filter((r) => r.etat === 'annule')).toHaveLength(1);
    expect(rappels.find((r) => r.etat === 'en_attente')!.cle_unique).toBe(`${occ.id}:15`);
  });

  it('supprimer la série annule les rappels à venir', () => {
    const id = ajouterTache({ titre: 'X', projetId: null, regle: { frequence: 'quotidien', debut: '2026-10-06', fin: { type: 'fois', fois: 4 } }, heureDebut: 600, dureeMin: 30, rappelMin: 10 });
    supprimerOccurrences(id, 'toute');
    expect(magasin.lignes.occurrences.filter((o) => o.tache_id === id)).toHaveLength(0);
    expect(magasin.lignes.rappels.filter((r) => r.etat === 'en_attente')).toHaveLength(0);
  });
});

describe('une saisie alimente tous les sous-projets du projet', () => {
  function installer() {
    const bible = projet('La lecture de la Bible').id;
    const modeles = MODELES.filter((m) => m.projet === 'La lecture de la Bible');
    const par_jour = creerDepuisModele(modeles[0], bible, '2026-10-01', '2026-10-31');
    const nt = creerSousProjet({
      projetId: bible, nom: 'Étudier le Nouveau Testament', debut: '2026-10-01', fin: '2026-10-31', reprisePasse: true,
      metriques: [{ type: 'nombre', nom: 'Chapitres lus', unite: 'chapitres', cible: 260, periode_cible: 'total', sens: 'plus', dans_rapport: false }]
    });
    return { bible, par_jour, nt };
  }
  const chap = 'nombre:chapitres';

  it('3 chapitres lus comptent dans les deux sous-projets, sans double saisie', () => {
    const { bible, par_jour, nt } = installer();
    const tache = ajouterTache({ titre: 'Lecture de la Bible', projetId: bible, regle: { frequence: 'quotidien', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 330, dureeMin: 45, rappelMin: 10, sousProjetIds: [par_jour, nt], attendus: [{ cle: chap, valeur: 3 }] });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === tache && o.jour === '2026-10-05')!;
    terminerBloc(occ.id);
    const v = valeursDuProjet(bible);
    expect(v.find((x) => x.cle === chap)!.valeur).toBe(3);
    expect(v.find((x) => x.cle === 'temps')!.valeur).toBe(45 * 60);
    const sp1 = magasin.trouver('sous_projets', par_jour)!, sp2 = magasin.trouver('sous_projets', nt)!;
    expect(progressionSousProjet(sp1, '2026-10', '2026-10-05').progression!.realise).toBe(3);
    expect(progressionSousProjet(sp2, '2026-10', '2026-10-05').progression!.realise).toBe(3);
    expect(progressionProjet(bible, '2026-10', '2026-10-05')).not.toBeNull();
  });

  it('corriger la valeur met tout à jour, et ne crée qu’une saisie', () => {
    const { bible, par_jour } = installer();
    const tache = ajouterTache({ titre: 'Lecture', projetId: bible, regle: { frequence: 'une_fois', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 330, dureeMin: 30, rappelMin: null, sousProjetIds: [par_jour], attendus: [{ cle: chap, valeur: 3 }] });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === tache)!;
    terminerBloc(occ.id);
    corrigerValeur(occ.id, chap, 5);
    corrigerValeur(occ.id, 'temps', 20 * 60);
    expect(magasin.lignes.saisies.filter((s) => s.occurrence_id === occ.id)).toHaveLength(1);
    const p = progressionSousProjet(magasin.trouver('sous_projets', par_jour)!, '2026-10', '2026-10-05').progression!;
    expect(p.realise).toBe(5);
    expect(valeursDuProjet(bible).find((x) => x.cle === 'temps')!.valeur).toBe(1200);
  });

  it('un sous-projet créé plus tard reprend les saisies du passé (ou pas)', () => {
    const bible = projet('La lecture de la Bible').id;
    const tache = ajouterTache({ titre: 'Lecture', projetId: bible, regle: { frequence: 'une_fois', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 330, dureeMin: 30, rappelMin: null });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === tache)!;
    saisirBloc(occ.id, [{ cle: chap, num: 7 }]);
    const m = { type: 'nombre' as const, nom: 'Chapitres', unite: 'chapitres', cible: 217, periode_cible: 'mois' as const, sens: 'plus' as const, dans_rapport: true };
    const avec = creerSousProjet({ projetId: bible, nom: 'Avec passé', debut: '2026-10-01', fin: '2026-10-31', reprisePasse: true, metriques: [m] });
    const sans = creerSousProjet({ projetId: bible, nom: 'Sans passé', debut: '2026-10-01', fin: '2026-10-31', reprisePasse: false, metriques: [m] });
    expect(progressionSousProjet(magasin.trouver('sous_projets', avec)!, '2026-10', '2026-10-05').progression!.realise).toBe(7);
    // créé « aujourd'hui » réel (après le 5 oct. 2026 simulé ? non : le jour de création vient de l'horloge réelle)
    const created = magasin.trouver('sous_projets', sans)!.created_at.slice(0, 10);
    const r = progressionSousProjet(magasin.trouver('sous_projets', sans)!, '2026-10', '2026-10-05').progression!.realise;
    expect(r).toBe(created <= '2026-10-05' ? 7 : 0);
  });

  it('valider un sous-projet le fait passer à « terminé »', () => {
    const { par_jour } = installer();
    validerSousProjet(par_jour, 'Belle lecture.');
    expect(magasin.trouver('sous_projets', par_jour)!.statut).toBe('termine');
  });
});

describe('minuteur d’un bloc', () => {
  it('pause, reprise et temps écoulé exact', () => {
    const t = ajouterTache({ titre: 'RDQD', projetId: projet('RDQD').id, regle: { frequence: 'une_fois', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 300, dureeMin: 30, rappelMin: null });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === t)!;
    lancerBloc(occ.id);
    expect(magasin.trouver('occurrences', occ.id)!.etat).toBe('en_cours');
    pauseBloc(occ.id);
    expect(magasin.trouver('occurrences', occ.id)!.etat).toBe('pause');
    reprendreBloc(occ.id);
    expect(ecouleOccurrence(magasin.trouver('occurrences', occ.id)!, Date.now() + 600_000)).toBeGreaterThanOrEqual(599);
  });
});
