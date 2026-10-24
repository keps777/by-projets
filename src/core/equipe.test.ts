import { describe, expect, it } from 'vitest';
import type { Billet, Caisse, Evenement, Personne } from '../domain/types.ts';
import { activite, ageActivite, gens, initiales, nouveauPin } from './equipe.ts';

const h = (jour: string, hhmm: string) => new Date(`${jour}T${hhmm}:00`).getTime();
const P = (id: string, role: Personne['role'], gareId: string, compagnieId = 'BX'): Personne => ({ id, prenom: id.slice(2), nom: 'N', tel: '1', role, actif: true, gareId, compagnieId });
describe('équipe vue par le patron', () => {
  it('liste des gens : seulement la compagnie, rôles visibles, triés par gare puis rôle', () => {
    const l = gens([P('p-b', 'guichet', 'akwa'), P('p-a', 'superviseur', 'mvan'), P('p-c', 'guichet', 'mvan'), P('p-x', 'guichet', 'mvan', 'AV'), { ...P('p-v', 'voyageur', 'mvan') }, P('p-p', 'patron', 'mvan')], 'BX', ['mvan', 'akwa']);
    expect(l.map((p) => p.id)).toEqual(['p-a', 'p-c', 'p-b']);
  });
  it('initiales', () => { expect(initiales({ prenom: 'fatou', nom: 'Mbarga' })).toBe('FM'); });
  it('activité : billets vendus au guichet sur 30 jours, écarts sur 90 jours, dernière activité du journal', () => {
    const b = (id: string, ts: number, canal: Billet['canal'] = 'guichet', statut: Billet['statut'] = 'valide'): Billet => ({ id, code: id, departId: 'd', siege: null, passager: { nom: 'X', tel: '1' }, prix: 7000, canal, acheteurId: 'p-f', paiementId: 'x', statut, creeLe: ts, sceau: '' });
    const billets = [b('1', h('2026-11-03', '07:00')), b('2', h('2026-11-02', '07:00')), b('3', h('2026-11-02', '08:00'), 'app'), b('4', h('2026-09-01', '08:00')), b('5', h('2026-11-02', '09:00'), 'guichet', 'annule')];
    const caisses: Caisse[] = [{ id: 'c1', agentId: 'p-f', gareId: 'mvan', jour: '', ouvertA: h('2026-11-02', '05:30'), fond: 0, statut: 'validee', ecart: -1500 }, { id: 'c2', agentId: 'p-f', gareId: 'mvan', jour: '', ouvertA: h('2026-10-30', '05:30'), fond: 0, statut: 'validee', ecart: 0 }, { id: 'c3', agentId: 'p-f', gareId: 'mvan', jour: '', ouvertA: h('2026-10-01', '05:30'), fond: 0, statut: 'validee', ecart: 500 }, { id: 'c4', agentId: 'p-f', gareId: 'mvan', jour: '', ouvertA: h('2026-05-01', '05:30'), fond: 0, statut: 'validee', ecart: 900 }];
    const evenements: Evenement[] = [{ id: 'e1', ts: h('2026-11-02', '21:00'), type: 'caisse', texte: 'ok', acteurId: 'p-f' }, { id: 'e2', ts: h('2026-10-20', '21:00'), type: 'caisse', texte: 'ok', acteurId: 'p-f' }, { id: 'e3', ts: h('2026-11-03', '01:00'), type: 'x', texte: 'ok', acteurId: 'p-z' }];
    const a = activite({ billets, caisses, evenements }, 'p-f', { jour: '2026-11-03', now: h('2026-11-03', '19:10') });
    expect(a.billets30).toBe(2); expect(a.recette30).toBe(14000); expect(a.parJour).toHaveLength(30); expect(a.parJour.at(-1)).toBe(100);
    expect(a.ecarts90.map((c) => c.id)).toEqual(['c1', 'c3']); expect(a.sommeEcarts).toBe(-1000); expect(a.derniere?.id).toBe('e1'); expect(a.evenements).toHaveLength(2);
    expect(activite({ billets, caisses, evenements }, 'p-nul', { jour: '2026-11-03', now: 0 }).derniere).toBeUndefined();
  });
  it('âge de l’activité en clair', () => {
    const now = h('2026-11-03', '19:10');
    expect(ageActivite(undefined, now)).toContain('aucune'); expect(ageActivite(h('2026-11-03', '18:40'), now)).toBe('aujourd’hui · 18:40');
    expect(ageActivite(h('2026-11-02', '18:40'), now)).toBe('hier · 18:40'); expect(ageActivite(h('2026-10-29', '10:00'), now)).toBe('il y a 5 j');
  });
  it('nouveau PIN : 4 chiffres, ni répétitif ni suite ni identique à l’ancien, déterministe', () => {
    for (let g = 0; g < 300; g++) { const pin = nouveauPin('p-fatou', '4821', g * 1.7); expect(pin).toMatch(/^\d{4}$/); expect(pin).not.toBe('4821'); expect(pin).not.toMatch(/^(\d)\1{3}$/); expect(['1234', '4321', '0123', '3456', '9876']).not.toContain(pin); }
    expect(nouveauPin('p-fatou', undefined, 5)).toBe(nouveauPin('p-fatou', undefined, 5)); expect(nouveauPin('p-fatou', undefined, 5)).not.toBe(nouveauPin('p-joseph', undefined, 5));
  });
});
