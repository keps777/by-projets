import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../../data/magasin.svelte.ts';
import { session } from '../../data/auth.svelte.ts';
import { horloge } from '../../data/temps.svelte.ts';
import { ajouterProjet, ajouterRubrique, creerSousProjetRapide } from '../../data/actions/projets.ts';
import { ajouterTache } from '../../data/actions/taches.ts';
import { ajouterFait } from '../../data/actions/fait.ts';
import { terminerBloc } from '../../data/actions/blocs.ts';
import { blocsDuJour } from '../../data/requetes.ts';
import { documentJournee, htmlJournee } from './pdf-journee.ts';

const AUJ = '2026-10-12';

describe('document de la journée (avec le magasin)', () => {
  beforeEach(async () => {
    await magasin.fermer();
    await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
    horloge.maintenant = Date.parse('2026-10-12T20:00:00Z'); // 16:00 à Toronto
    await session.demarrer();
  });

  it('créneaux faits (avec leurs sous-projets en cours), vides, total, et recap des projets en cours', () => {
    const rub = ajouterRubrique('Relation avec Dieu');
    const projet = ajouterProjet(rub, 'Prière');
    const sp = creerSousProjetRapide(projet, 'Projet 3H de prière par jour', [{ type: 'temps', nom: 'Temps', unite: 'min', cible: 10800, periode_cible: 'jour', sens: 'plus', dans_rapport: true }], '2026-10-01');
    ajouterProjet(rub, 'Autre projet sans sous-projet');
    ajouterTache({ titre: 'Prière seule', projetId: projet, regle: { frequence: 'une_fois', debut: AUJ, fin: { type: 'aucune' } }, heureDebut: 72, dureeMin: 61, rappelMin: null, sousProjetIds: [sp], attendus: [{ cle: 'temps', valeur: 3660 }] });
    ajouterTache({ titre: 'Appel', projetId: null, regle: { frequence: 'une_fois', debut: AUJ, fin: { type: 'aucune' } }, heureDebut: 14 * 60, dureeMin: 30, rappelMin: null });
    for (const b of blocsDuJour(AUJ)) terminerBloc(b.occ.id);
    ajouterFait({ titre: 'Marche', projetId: null, jour: AUJ, debutMin: 7 * 60, dureeMin: 45 });

    const doc = documentJournee(AUJ, AUJ, 16 * 60);
    const faits = doc.lignes.filter((l) => l.type === 'fait');
    expect(faits.map((l) => [l.creneau, l.activite, l.projets])).toEqual([
      ['1h12–2h13', '1h01 de Prière seule', 'Projet 3H de prière par jour'],
      ['7h00–7h45', '45 min de Marche', '--'],
      ['14h00–14h30', '30 min de Appel', '--']
    ]);
    expect(doc.lignes.filter((l) => l.type === 'vide').map((l) => l.creneau)).toEqual(['0h00–1h11', '2h14–6h59', '7h46–13h59', '14h31–16h00']);
    expect(doc.totalSecondes).toBe((61 + 45 + 30) * 60);
    const projets = doc.groupes.flatMap((g) => g.projets);
    const priere = projets.find((p) => p.nom === 'Prière')!;
    expect(priere.sousProjets?.map((s) => s.nom)).toEqual(['Projet 3H de prière par jour']);
    expect(projets.map((p) => p.nom)).not.toContain('Autre projet sans sous-projet'); // sans sous-projet en cours : rien à mesurer
    expect(doc.moyenne === null || (doc.moyenne >= 0 && doc.moyenne <= 100)).toBe(true);
    const html = htmlJournee(doc);
    expect(html).toContain('Temps total de travail investi sur 24 h');
    expect(html).toContain('<b>2h16</b>');
  });

  it('un jour passé va jusqu’à 24h00', () => {
    const doc = documentJournee('2026-10-09', AUJ, 16 * 60);
    expect(doc.lignes.map((l) => l.creneau)).toEqual(['0h00–24h00']);
  });
});
