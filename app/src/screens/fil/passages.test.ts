import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../../data/magasin.svelte.ts';
import { session } from '../../data/auth.svelte.ts';
import { horloge } from '../../data/temps.svelte.ts';
import { ajouterTache } from '../../data/actions/taches.ts';
import { enregistrerPassages, passagesEnregistres, valeursDePassages } from './passages.ts';

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  horloge.maintenant = Date.parse('2026-10-05T14:00:00Z');
  await session.demarrer();
});

describe('passages de la Bible d’un bloc', () => {
  const luc = { livre: 'Luc', de: 22, a: 24 };
  const jean = { livre: 'Jean', de: 3, a: 3 };

  it('écrit la référence lisible et le nombre de chapitres', () => {
    const v = valeursDePassages([luc, jean], true);
    expect(v).toEqual([{ cle: 'reference:passages', txt: 'Luc 22–24 · Jean 3', detail: [luc, jean] }, { cle: 'nombre:chapitres', num: 4 }]);
    expect(valeursDePassages([], false)).toEqual([{ cle: 'reference:passages', txt: null, detail: [] }]);
  });

  it('enregistre sur le bloc puis relit les mêmes passages ; retirer tout remet à zéro', () => {
    const id = ajouterTache({ titre: 'Lecture', projetId: null, regle: { frequence: 'une_fois', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 600, dureeMin: 30, rappelMin: null });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === id)!;
    enregistrerPassages(occ.id, [luc, jean], true);
    expect(passagesEnregistres(occ.id)).toEqual([luc, jean]);
    const chap = magasin.lignes.saisie_valeurs.find((x) => x.cle === 'nombre:chapitres');
    expect(Number(chap?.valeur_num)).toBe(4);
    enregistrerPassages(occ.id, [], true);
    expect(passagesEnregistres(occ.id)).toEqual([]);
    expect(Number(magasin.lignes.saisie_valeurs.find((x) => x.cle === 'nombre:chapitres')?.valeur_num)).toBe(0);
  });

  it('relit un texte saisi à la main quand il n’y a pas de détail', async () => {
    const id = ajouterTache({ titre: 'Lecture', projetId: null, regle: { frequence: 'une_fois', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 600, dureeMin: 30, rappelMin: null });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === id)!;
    const { saisirBloc } = await import('../../data/actions/blocs.ts');
    saisirBloc(occ.id, [{ cle: 'reference:passages', txt: 'Mt 8–10 · Jn 3' }], { source: 'bloc' }); // ancienne saisie : texte seul
    expect(passagesEnregistres(occ.id)).toEqual([{ livre: 'Matthieu', de: 8, a: 10 }, { livre: 'Jean', de: 3, a: 3 }]);
  });
});
