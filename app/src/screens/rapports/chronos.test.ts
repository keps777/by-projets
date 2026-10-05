import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../../data/magasin.svelte.ts';
import { session } from '../../data/auth.svelte.ts';
import { horloge } from '../../data/temps.svelte.ts';
import { valeursDuProjet } from '../../data/requetes.ts';
import { chronos } from '../../data/chronos.svelte.ts';
import { enregistrerSession, valeursARetenir } from './session.ts';

// Environnement de test sans navigateur : un stockage local minimal.
const memoire = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => memoire.get(k) ?? null, setItem: (k: string, v: string) => void memoire.set(k, v),
  removeItem: (k: string) => void memoire.delete(k), clear: () => memoire.clear()
} });

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  localStorage.clear();
  horloge.maintenant = Date.parse('2026-10-05T14:00:00Z');
  await session.demarrer();
  for (const id of chronos.actifs) chronos.oublier(id);
});

describe('chrono d’un point', () => {
  it('démarre, compte en direct, se fige à l’arrêt et se garde au rechargement', () => {
    expect(chronos.etat('p1')).toBe('repos');
    chronos.demarrer('p1', Date.parse('2026-10-05T14:00:00Z'), '2026-10-05');
    expect(chronos.etat('p1')).toBe('cours');
    expect(chronos.secondes('p1', Date.parse('2026-10-05T14:12:03Z'))).toBe(723);
    chronos.arreter('p1', Date.parse('2026-10-05T14:25:00Z'));
    expect(chronos.etat('p1')).toBe('arret');
    expect(chronos.secondes('p1', Date.parse('2026-10-05T18:00:00Z'))).toBe(1500); // figé
    expect(JSON.parse(localStorage.getItem('luther-life:chronos')!).p1.fin).toBe(Date.parse('2026-10-05T14:25:00Z'));
    chronos.oublier('p1');
    expect(chronos.etat('p1')).toBe('repos');
  });
  it('un deuxième démarrage ne remplace pas la session en cours', () => {
    chronos.demarrer('p1', 1000, '2026-10-05');
    chronos.demarrer('p1', 9999, '2026-10-05');
    expect(chronos.sessions.p1.debut).toBe(1000);
  });
});

describe('enregistrer une session', () => {
  const projet = () => magasin.lignes.projets[0].id;

  it('chaque session s’ajoute au total du jour (temps et autres mesures)', () => {
    const p = projet();
    enregistrerSession(p, '2026-10-05', 1500, [{ cle: 'fois', type: 'fois', num: 1 }]);
    enregistrerSession(p, '2026-10-05', 600, [{ cle: 'fois', type: 'fois', num: 1 }]);
    const v = valeursDuProjet(p).filter((x) => x.jour === '2026-10-05');
    expect(v.filter((x) => x.cle === 'temps').reduce((s, x) => s + x.valeur, 0)).toBe(2100);
    expect(v.filter((x) => x.cle === 'fois').reduce((s, x) => s + x.valeur, 0)).toBe(2);
  });

  it('valider sans rien remplir n’enregistre que le temps ; les champs vides ou à zéro sont ignorés', () => {
    const p = projet();
    const sid = enregistrerSession(p, '2026-10-05', 300, [{ cle: 'nombre:chapitres', type: 'nombre', num: 0 }, { cle: 'reference:passages', type: 'reference', txt: '  ' }])!;
    const cles = magasin.lignes.saisie_valeurs.filter((x) => x.saisie_id === sid).map((x) => x.cle);
    expect(cles).toEqual(['temps']);
  });

  it('enregistre les chapitres et les passages avec leur détail', () => {
    const p = projet();
    const sid = enregistrerSession(p, '2026-10-05', 1800, [
      { cle: 'nombre:chapitres', type: 'nombre', num: 3 },
      { cle: 'reference:passages', type: 'reference', txt: 'Luc 22–24', detail: [{ livre: 'Luc', de: 22, a: 24 }] }
    ])!;
    const vals = magasin.lignes.saisie_valeurs.filter((x) => x.saisie_id === sid);
    expect(vals.find((x) => x.cle === 'nombre:chapitres')?.valeur_num).toBe(3);
    expect(vals.find((x) => x.cle === 'reference:passages')).toMatchObject({ valeur_txt: 'Luc 22–24', detail: [{ livre: 'Luc', de: 22, a: 24 }] });
    expect(magasin.lignes.saisies.find((s) => s.id === sid)?.source).toBe('minuteur');
  });

  it('ne retient pas une durée nulle sans autre valeur', () => {
    expect(enregistrerSession(projet(), '2026-10-05', 0, [])).toBeNull();
    expect(valeursARetenir([{ cle: 'fois', type: 'fois', num: 0 }])).toEqual([]);
  });
});
