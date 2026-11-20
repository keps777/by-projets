import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../../data/magasin.svelte.ts';
import { session } from '../../data/auth.svelte.ts';
import { horloge } from '../../data/temps.svelte.ts';
import { ajouterProjet, ajouterRubrique, creerSousProjetRapide, mettreEnPause, retirerProjet, validerSousProjet } from '../../data/actions/projets.ts';
import { FormulaireTache } from './formulaire-tache.svelte.ts';

describe('Nouvelle tâche : seuls les projets en cours sont proposés', () => {
  beforeEach(async () => {
    await magasin.fermer();
    await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
    horloge.maintenant = Date.parse('2026-10-12T13:00:00Z');
    await session.demarrer();
  });

  it('exclut les projets archivés, en pause ou terminés ; garde ceux sans sous-projet', () => {
    const rub = ajouterRubrique('Relation avec Dieu');
    const enCours = ajouterProjet(rub, 'Bible');
    creerSousProjetRapide(enCours, 'Lecture', [], '2026-10-01');
    const neuf = ajouterProjet(rub, 'Tout neuf');
    const archive = ajouterProjet(rub, 'Ancien');
    retirerProjet(archive);
    const termine = ajouterProjet(rub, 'Fini');
    validerSousProjet(creerSousProjetRapide(termine, 'Clos', [], '2026-09-01'));
    const pause = ajouterProjet(rub, 'En attente');
    mettreEnPause(creerSousProjetRapide(pause, 'Dormant', [], '2026-09-01'));

    const f = new FormulaireTache();
    f.rubriqueId = rub;
    expect(f.projets.map((p) => p.nom)).toEqual(['Bible', 'Tout neuf']);
    f.projetId = neuf;
    expect(f.projets.map((p) => p.nom)).toContain('Tout neuf');
  });

  it('le projet déjà choisi reste affiché en modification, même s’il n’est plus en cours', () => {
    const rub = ajouterRubrique('Service à Dieu');
    const p = ajouterProjet(rub, 'Évangélisation');
    validerSousProjet(creerSousProjetRapide(p, 'Terminé', [], '2026-09-01'));
    const f = new FormulaireTache();
    f.rubriqueId = rub;
    expect(f.projets).toEqual([]);
    f.projetId = p;
    expect(f.projets.map((x) => x.nom)).toEqual(['Évangélisation']);
  });

  it('le menu de répétition règle la récurrence et les jours, et les rappels se répartissent', () => {
    const f = new FormulaireTache();
    f.debut = '2026-10-14'; // mercredi
    f.repetition = 'semaine';
    expect([f.rec, f.jours]).toEqual(['hebdo', [0, 1, 2, 3, 4]]);
    expect(f.repetition).toBe('semaine');
    f.choisirDebut('2026-10-15'); // un jour de plus : la semaine reste lundi–vendredi
    expect(f.jours).toEqual([0, 1, 2, 3, 4]);
    f.repetition = 'une_fois';
    expect(f.rec).toBe('une_fois');
    f.rappel = 10; f.rappelsAvant = [];
    f.ajouterRappel(1440); f.ajouterRappel(5); f.ajouterRappel(10080);
    expect(f.rappel).toBe(5);
    expect(f.rappelsAvant).toEqual([10, 1440, 10080]);
    f.retirerRappel(5);
    expect(f.rappel).toBe(10);
    f.retirerRappel(10); f.retirerRappel(1440); f.retirerRappel(10080);
    expect([f.rappel, f.rappelsAvant]).toEqual([null, []]);
  });
});
