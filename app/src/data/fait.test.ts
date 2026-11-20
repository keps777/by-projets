import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from './magasin.svelte.ts';
import { session } from './auth.svelte.ts';
import { horloge } from './temps.svelte.ts';
import { ajouterTache } from './actions/taches.ts';
import { ajouterFait } from './actions/fait.ts';
import { corrigerValeur, terminerBloc, valeurSaisie } from './actions/blocs.ts';
import { blocsDuJour } from './requetes.ts';

// 2026-10-12, 09:00 à Toronto (13:00 UTC).
const NOW = Date.parse('2026-10-12T13:00:00Z');
const AUJ = '2026-10-12';

describe('journée en deux parties : Prévu | Fait', () => {
  beforeEach(async () => {
    await magasin.fermer();
    await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
    horloge.maintenant = NOW;
    await session.demarrer();
  });

  it('un bloc terminé garde l’heure réelle du minuteur', () => {
    ajouterTache({ titre: 'Lecture', projetId: null, regle: { frequence: 'une_fois', debut: AUJ, fin: { type: 'aucune' } }, heureDebut: 10 * 60, dureeMin: 60, rappelMin: null });
    const occ = blocsDuJour(AUJ)[0].occ;
    // Lancé à 10 h 20 (14:20 UTC), terminé à 11 h 05 (15:05 UTC).
    magasin.ecrire('occurrences', { id: occ.id, etat: 'faite', demarree_a: '2026-10-12T14:20:00Z', terminee_a: '2026-10-12T15:05:00Z' });
    const b = blocsDuJour(AUJ)[0];
    expect([b.debutMin, b.finMin]).toEqual([600, 660]);
    expect([b.reelDebutMin, b.reelFinMin]).toEqual([620, 665]);
    expect(b.apresCoup).toBe(false);
  });

  it('un bloc coché sans minuteur prend son créneau prévu ; un bloc non terminé n’a pas de fin réelle', () => {
    ajouterTache({ titre: 'Marche', projetId: null, regle: { frequence: 'une_fois', debut: AUJ, fin: { type: 'aucune' } }, heureDebut: 7 * 60, dureeMin: 30, rappelMin: null });
    ajouterTache({ titre: 'Appel', projetId: null, regle: { frequence: 'une_fois', debut: AUJ, fin: { type: 'aucune' } }, heureDebut: 15 * 60, dureeMin: 30, rappelMin: null });
    const [marche, appel] = blocsDuJour(AUJ);
    terminerBloc(marche.occ.id);
    const [m, a] = blocsDuJour(AUJ);
    expect([m.reelDebutMin, m.reelFinMin]).toEqual([420, 450]);
    expect([a.reelDebutMin, a.reelFinMin]).toEqual([900, null]);
    expect(appel.occ.etat).toBe('prevue');
  });

  it('« Ce que j’ai fait » crée un bloc déjà fait, marqué après coup, avec son temps', () => {
    const id = ajouterFait({ titre: 'Prière du matin', projetId: null, jour: AUJ, debutMin: 6 * 60, dureeMin: 50 });
    expect(id).toBeTruthy();
    const b = blocsDuJour(AUJ).find((x) => x.occ.id === id)!;
    expect(b.fait).toBe(true);
    expect(b.apresCoup).toBe(true);
    expect([b.reelDebutMin, b.reelFinMin]).toEqual([360, 410]);
    expect(valeurSaisie(id!, 'temps')).toBe(50 * 60);
    expect(magasin.lignes.rappels.filter((r) => r.occurrence_id === id)).toHaveLength(0);
  });

  it('on peut remplir un jour passé', () => {
    const id = ajouterFait({ titre: 'Visite', projetId: null, jour: '2026-10-09', debutMin: 14 * 60, dureeMin: 90 });
    expect(id).toBeTruthy();
    expect(blocsDuJour('2026-10-09').map((b) => [b.titre, b.fait, b.apresCoup])).toEqual([['Visite', true, true]]);
  });

  it('corriger la valeur d’un bloc rempli après coup ne le remet pas dans « Prévu »', () => {
    const id = ajouterFait({ titre: 'Lecture', projetId: null, jour: AUJ, debutMin: 20 * 60, dureeMin: 30 })!;
    corrigerValeur(id, 'temps', 45 * 60);
    expect(blocsDuJour(AUJ).find((x) => x.occ.id === id)!.apresCoup).toBe(true);
    expect(valeurSaisie(id, 'temps')).toBe(45 * 60);
  });
});
